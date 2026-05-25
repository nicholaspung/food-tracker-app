package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const restaurantListShareTokenBytes = 24

type restaurantListShareLinkResponse struct {
	ListID     string `json:"listId"`
	ShareToken string `json:"shareToken"`
	URL        string `json:"url"`
	Path       string `json:"path"`
}

type sharedRestaurantListSaveRecommendationRequest struct {
	RestaurantID  string   `json:"restaurantId"`
	FoodItemID    string   `json:"foodItemId"`
	TargetListIDs []string `json:"targetListIds"`
}

type sharedRestaurantListResponse struct {
	List          sharedRestaurantListRecord                 `json:"list"`
	Items         []sharedRestaurantListItemRecord           `json:"items"`
	PhotoPreviews []sharedRestaurantListPhotoPreview         `json:"photoPreviews"`
	BookmarkState *restaurantListDetailBookmarkStateResponse `json:"bookmarkState,omitempty"`
	ViewerLists   []restaurantListDetailListResponse         `json:"viewerLists,omitempty"`
}

type sharedRestaurantListRecord struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Description     string `json:"description,omitempty"`
	OwnerName       string `json:"ownerName,omitempty"`
	RestaurantCount int    `json:"restaurantCount,omitempty"`
	MenuItemCount   int    `json:"menuItemCount,omitempty"`
	UpdatedAt       string `json:"updatedAt"`
}

type sharedRestaurantListBookmarkedItemRecord struct {
	ID                    string  `json:"id"`
	ListItemID            string  `json:"listItemId"`
	Name                  string  `json:"name"`
	Rating                float64 `json:"rating"`
	VisitedAt             string  `json:"visitedAt,omitempty"`
	UserFoodItemID        string  `json:"userFoodItemId,omitempty"`
	UserFoodItemName      string  `json:"userFoodItemName,omitempty"`
	UserFoodItemRating    float64 `json:"userFoodItemRating,omitempty"`
	UserFoodItemVisitedAt string  `json:"userFoodItemVisitedAt,omitempty"`
}

type sharedRestaurantListItemRecord struct {
	ID                    string                                     `json:"id"`
	RestaurantID          string                                     `json:"restaurantId"`
	RestaurantName        string                                     `json:"restaurantName"`
	RestaurantLocation    string                                     `json:"restaurantLocation,omitempty"`
	RestaurantCity        string                                     `json:"restaurantCity,omitempty"`
	RestaurantCuisineType string                                     `json:"restaurantCuisineType,omitempty"`
	Latitude              *float64                                   `json:"latitude,omitempty"`
	Longitude             *float64                                   `json:"longitude,omitempty"`
	Position              int                                        `json:"position"`
	BookmarkedItems       []sharedRestaurantListBookmarkedItemRecord `json:"bookmarkedItems"`
	Note                  string                                     `json:"note,omitempty"`
	CreatedAt             string                                     `json:"createdAt"`
}

type sharedRestaurantListPhotoPreview struct {
	ID             string `json:"id"`
	FoodItemID     string `json:"food_item,omitempty"`
	Photo          string `json:"photo"`
	CollectionID   string `json:"collectionId,omitempty"`
	CollectionName string `json:"collectionName,omitempty"`
	Created        string `json:"created"`
}

func registerRestaurantListSharingSummaryHandler(se *core.ServeEvent, app core.App) {
	se.Router.GET("/api/public/restaurant-lists/{shareToken}", func(e *core.RequestEvent) error {
		shareToken := strings.TrimSpace(e.Request.PathValue("shareToken"))
		if shareToken == "" {
			return apis.NewBadRequestError("shareToken is required", nil)
		}

		var viewerRecord *core.Record
		if e.Auth != nil {
			viewerRecord = e.Auth
		}

		response, err := getSharedRestaurantListResponse(app, shareToken, viewerRecord)
		if err != nil {
			if errors.Is(err, errRestaurantListDetailNotFound) {
				return apis.NewNotFoundError("shared restaurant list not found", nil)
			}
			return apis.NewApiError(500, "failed to load shared restaurant list", err)
		}

		e.Response.Header().Set("X-Robots-Tag", "noindex, nofollow")
		return e.JSON(http.StatusOK, response)
	})
}

func registerRestaurantListSharingWriteHandlers(se *core.ServeEvent, app core.App) {
	se.Router.POST("/api/restaurant-lists/{listId}/share-link", func(e *core.RequestEvent) error {
		listRecord, err := findOwnedRestaurantListRecord(app, strings.TrimSpace(e.Request.PathValue("listId")), e.Auth.Id)
		if err != nil {
			return err
		}

		response, err := ensureRestaurantListShareLink(app, e.Request, listRecord)
		if err != nil {
			return err
		}

		return e.JSON(http.StatusOK, response)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/restaurant-lists/{listId}/share-link/regenerate", func(e *core.RequestEvent) error {
		listRecord, err := findOwnedRestaurantListRecord(app, strings.TrimSpace(e.Request.PathValue("listId")), e.Auth.Id)
		if err != nil {
			return err
		}

		response, err := regenerateRestaurantListShareLink(app, e.Request, listRecord)
		if err != nil {
			return err
		}

		return e.JSON(http.StatusOK, response)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/restaurant-lists/{listId}/share-link/disable", func(e *core.RequestEvent) error {
		listRecord, err := findOwnedRestaurantListRecord(app, strings.TrimSpace(e.Request.PathValue("listId")), e.Auth.Id)
		if err != nil {
			return err
		}

		listRecord.Set("shareEnabled", false)
		listRecord.Set("shareTokenUpdatedAt", time.Now().UTC())
		if err := app.Save(listRecord); err != nil {
			return apis.NewApiError(500, "failed to disable restaurant list sharing", err)
		}

		return e.JSON(http.StatusOK, map[string]any{
			"listId":       listRecord.Id,
			"shareEnabled": false,
		})
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/public/restaurant-lists/{shareToken}/bookmarks", func(e *core.RequestEvent) error {
		shareToken := strings.TrimSpace(e.Request.PathValue("shareToken"))
		if shareToken == "" {
			return apis.NewBadRequestError("shareToken is required", nil)
		}

		requestBody := sharedRestaurantListSaveRecommendationRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		if err := app.RunInTransaction(func(txApp core.App) error {
			return saveSharedRestaurantListRecommendationTransaction(txApp, e.Auth, shareToken, requestBody)
		}); err != nil {
			return err
		}

		return e.JSON(http.StatusOK, map[string]any{"saved": true})
	}).Bind(apis.RequireAuth())
}

func ensureRestaurantListShareLink(app core.App, request *http.Request, listRecord *core.Record) (restaurantListShareLinkResponse, error) {
	if listRecord.GetBool("shareEnabled") && strings.TrimSpace(listRecord.GetString("shareToken")) != "" {
		return buildRestaurantListShareLinkResponse(request, listRecord), nil
	}

	return regenerateRestaurantListShareLink(app, request, listRecord)
}

func regenerateRestaurantListShareLink(app core.App, request *http.Request, listRecord *core.Record) (restaurantListShareLinkResponse, error) {
	token, err := generateUniqueRestaurantListShareToken(app)
	if err != nil {
		return restaurantListShareLinkResponse{}, apis.NewApiError(500, "failed to generate share token", err)
	}

	now := time.Now().UTC()
	if strings.TrimSpace(listRecord.GetString("shareTokenCreatedAt")) == "" {
		listRecord.Set("shareTokenCreatedAt", now)
	}
	listRecord.Set("shareEnabled", true)
	listRecord.Set("shareToken", token)
	listRecord.Set("shareTokenUpdatedAt", now)

	if err := app.Save(listRecord); err != nil {
		return restaurantListShareLinkResponse{}, apis.NewApiError(500, "failed to save restaurant list share link", err)
	}

	return buildRestaurantListShareLinkResponse(request, listRecord), nil
}

func generateUniqueRestaurantListShareToken(app core.App) (string, error) {
	for attempt := 0; attempt < 5; attempt++ {
		token, err := generateRestaurantListShareToken()
		if err != nil {
			return "", err
		}

		existing, err := app.FindFirstRecordByFilter(
			"restaurant_lists",
			"shareToken = {:shareToken}",
			dbx.Params{"shareToken": token},
		)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return "", err
		}
		if existing == nil {
			return token, nil
		}
	}

	return "", errors.New("failed to generate unique restaurant list share token")
}

func generateRestaurantListShareToken() (string, error) {
	bytes := make([]byte, restaurantListShareTokenBytes)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func buildRestaurantListShareLinkResponse(request *http.Request, listRecord *core.Record) restaurantListShareLinkResponse {
	token := strings.TrimSpace(listRecord.GetString("shareToken"))
	path := "/lists/shared/" + token
	return restaurantListShareLinkResponse{
		ListID:     listRecord.Id,
		ShareToken: token,
		Path:       path,
		URL:        buildRequestOrigin(request) + path,
	}
}

func buildRequestOrigin(request *http.Request) string {
	scheme := strings.TrimSpace(request.Header.Get("X-Forwarded-Proto"))
	if scheme == "" {
		if request.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}

	host := strings.TrimSpace(request.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = request.Host
	}

	return scheme + "://" + host
}

func getSharedRestaurantListResponse(app core.App, shareToken string, viewerRecord *core.Record) (sharedRestaurantListResponse, error) {
	response := sharedRestaurantListResponse{
		Items:         []sharedRestaurantListItemRecord{},
		PhotoPreviews: []sharedRestaurantListPhotoPreview{},
	}

	listRecord, err := findEnabledSharedRestaurantListRecord(app, shareToken)
	if err != nil {
		return response, err
	}

	ownerID := strings.TrimSpace(listRecord.GetString("user"))
	if ownerID == "" {
		return response, errRestaurantListDetailNotFound
	}

	ownerFriendIDs, err := listAcceptedFriendIDs(app, ownerID)
	if err != nil {
		return response, err
	}

	detail, err := getRestaurantListDetailResponse(app, ownerID, false, listRecord.Id, 1, 0)
	if err != nil {
		return response, err
	}
	if !canAccessRestaurantListRecord(listRecord, ownerID, false, ownerFriendIDs) {
		return response, errRestaurantListDetailNotFound
	}

	response.List = sharedRestaurantListRecord{
		ID:              detail.List.ID,
		Name:            detail.List.Name,
		Description:     detail.List.Description,
		OwnerName:       detail.List.OwnerName,
		RestaurantCount: detail.List.RestaurantCount,
		MenuItemCount:   detail.List.MenuItemCount,
		UpdatedAt:       detail.List.UpdatedAt,
	}

	response.Items = make([]sharedRestaurantListItemRecord, 0, len(detail.Items))
	visibleBookmarkLookupIDs := []string{}
	visibleBookmarkLookupSet := map[string]struct{}{}
	for _, item := range detail.Items {
		publicItem := sharedRestaurantListItemRecord{
			ID:                    item.ID,
			RestaurantID:          item.RestaurantID,
			RestaurantName:        item.RestaurantName,
			RestaurantLocation:    item.RestaurantLocation,
			RestaurantCity:        item.RestaurantCity,
			RestaurantCuisineType: item.RestaurantCuisineType,
			Latitude:              item.Latitude,
			Longitude:             item.Longitude,
			Position:              item.Position,
			BookmarkedItems:       []sharedRestaurantListBookmarkedItemRecord{},
			Note:                  item.Note,
			CreatedAt:             item.CreatedAt,
		}

		for _, bookmark := range item.BookmarkedItems {
			publicItem.BookmarkedItems = append(publicItem.BookmarkedItems, sharedRestaurantListBookmarkedItemRecord{
				ID:                    bookmark.ID,
				ListItemID:            bookmark.ListItemID,
				Name:                  bookmark.Name,
				Rating:                bookmark.Rating,
				VisitedAt:             bookmark.VisitedAt,
				UserFoodItemID:        bookmark.UserFoodItemID,
				UserFoodItemName:      bookmark.UserFoodItemName,
				UserFoodItemRating:    bookmark.UserFoodItemRating,
				UserFoodItemVisitedAt: bookmark.UserFoodItemVisitedAt,
			})
			visibleBookmarkLookupIDs = appendUniqueTrimmedID(visibleBookmarkLookupIDs, visibleBookmarkLookupSet, bookmark.ID)
			visibleBookmarkLookupIDs = appendUniqueTrimmedID(visibleBookmarkLookupIDs, visibleBookmarkLookupSet, bookmark.UserFoodItemID)
		}

		response.Items = append(response.Items, publicItem)
	}

	response.PhotoPreviews = make([]sharedRestaurantListPhotoPreview, 0, len(detail.PhotoPreviews))
	for _, photo := range detail.PhotoPreviews {
		response.PhotoPreviews = append(response.PhotoPreviews, sharedRestaurantListPhotoPreview{
			ID:             photo.ID,
			FoodItemID:     photo.FoodItemID,
			Photo:          photo.Photo,
			CollectionID:   photo.CollectionID,
			CollectionName: photo.CollectionName,
			Created:        photo.Created,
		})
	}

	if viewerRecord != nil && strings.TrimSpace(viewerRecord.Id) != "" {
		bookmarkState, err := buildRestaurantListDetailBookmarkState(app, viewerRecord.Id, visibleBookmarkLookupIDs)
		if err != nil {
			return response, err
		}
		response.BookmarkState = &bookmarkState

		viewerListRecords, err := listOwnedRestaurantLists(app, viewerRecord.Id)
		if err != nil {
			return response, err
		}
		response.ViewerLists = make([]restaurantListDetailListResponse, 0, len(viewerListRecords))
		for _, record := range viewerListRecords {
			response.ViewerLists = append(response.ViewerLists, buildRestaurantListDetailListResponse(record))
		}
	}

	return response, nil
}

func saveSharedRestaurantListRecommendationTransaction(
	app core.App,
	authRecord *core.Record,
	shareToken string,
	requestBody sharedRestaurantListSaveRecommendationRequest,
) error {
	listRecord, err := findEnabledSharedRestaurantListRecord(app, shareToken)
	if err != nil {
		return err
	}

	restaurantID := strings.TrimSpace(requestBody.RestaurantID)
	if restaurantID == "" {
		return apis.NewBadRequestError("restaurantId is required", nil)
	}
	foodItemID := strings.TrimSpace(requestBody.FoodItemID)
	if foodItemID == "" {
		return apis.NewBadRequestError("foodItemId is required", nil)
	}

	if !sharedRestaurantListContainsRecommendation(app, listRecord.Id, restaurantID, foodItemID) {
		return apis.NewNotFoundError("shared recommendation not found", nil)
	}

	foodItemRecord, visitRecord, err := findFoodItemWithVisit(app, foodItemID)
	if err != nil {
		return err
	}
	if err := ensureFoodItemMatchesRestaurant(foodItemRecord, visitRecord, restaurantID, false); err != nil {
		return err
	}
	if _, err := findRestaurantRecord(app, restaurantID); err != nil {
		return err
	}

	targetListRecords, err := resolveSharedRestaurantListSaveTargets(app, authRecord, requestBody.TargetListIDs)
	if err != nil {
		return err
	}

	for _, targetListRecord := range targetListRecords {
		if err := saveSharedRestaurantListRecommendationToTarget(app, authRecord, targetListRecord, restaurantID, foodItemID, foodItemRecord); err != nil {
			return err
		}
	}

	return nil
}

func resolveSharedRestaurantListSaveTargets(
	app core.App,
	authRecord *core.Record,
	targetListIDs []string,
) ([]*core.Record, error) {
	seen := map[string]struct{}{}
	targets := make([]*core.Record, 0, len(targetListIDs))

	for _, targetListID := range targetListIDs {
		trimmedID := strings.TrimSpace(targetListID)
		if trimmedID == "" {
			continue
		}
		if _, exists := seen[trimmedID]; exists {
			continue
		}
		seen[trimmedID] = struct{}{}

		targetListRecord, err := findOwnedRestaurantListRecord(app, trimmedID, authRecord.Id)
		if err != nil {
			return nil, err
		}
		targets = append(targets, targetListRecord)
	}

	if len(targets) > 0 {
		return targets, nil
	}

	targetListRecord, err := createOrGetDefaultRestaurantListTransaction(app, authRecord)
	if err != nil {
		return nil, err
	}

	return []*core.Record{targetListRecord}, nil
}

func saveSharedRestaurantListRecommendationToTarget(
	app core.App,
	authRecord *core.Record,
	targetListRecord *core.Record,
	restaurantID string,
	foodItemID string,
	foodItemRecord *core.Record,
) error {
	existingItem, err := findRestaurantListItemByFoodItem(app, targetListRecord.Id, foodItemID)
	if err != nil {
		return apis.NewApiError(500, "failed to load existing restaurant list item", err)
	}
	if existingItem != nil {
		return nil
	}

	nextPosition, err := nextRestaurantListItemPosition(app, targetListRecord.Id)
	if err != nil {
		return apis.NewApiError(500, "failed to resolve next list position", err)
	}

	listItemsCollection, err := app.FindCollectionByNameOrId("list_items")
	if err != nil {
		return apis.NewApiError(500, "internal error", err)
	}

	record := core.NewRecord(listItemsCollection)
	record.Set("list", targetListRecord.Id)
	record.Set("restaurant", restaurantID)
	record.Set("addedBy", authRecord.Id)
	record.Set("sourceUser", emptyStringToNil(strings.TrimSpace(foodItemRecord.GetString("user"))))
	record.Set("foodItem", foodItemID)
	record.Set("position", nextPosition)

	if err := app.Save(record); err != nil {
		if isUniqueConstraintError(err) {
			return nil
		}
		return apis.NewApiError(500, "failed to save shared recommendation", err)
	}

	return nil
}

func findEnabledSharedRestaurantListRecord(app core.App, shareToken string) (*core.Record, error) {
	listRecord, err := app.FindFirstRecordByFilter(
		"restaurant_lists",
		"shareEnabled = true && shareToken = {:shareToken}",
		dbx.Params{"shareToken": strings.TrimSpace(shareToken)},
	)
	if err != nil {
		return nil, errRestaurantListDetailNotFound
	}
	if !isVisibleModerationStatus(listRecord.GetString("moderationStatus")) {
		return nil, errRestaurantListDetailNotFound
	}
	return listRecord, nil
}

func sharedRestaurantListContainsRecommendation(
	app core.App,
	listID string,
	restaurantID string,
	foodItemID string,
) bool {
	records, err := app.FindRecordsByFilter(
		"list_items",
		`list = {:listId} && restaurant = {:restaurantId} && (
			foodItem = {:foodItemId} ||
			userFoodItem = {:foodItemId} ||
			recommendedItems ?= {:foodItemId}
		) && (moderationStatus = '' || moderationStatus = 'active' || moderationStatus = 'reviewed')`,
		"",
		1,
		0,
		dbx.Params{
			"listId":       strings.TrimSpace(listID),
			"restaurantId": strings.TrimSpace(restaurantID),
			"foodItemId":   strings.TrimSpace(foodItemID),
		},
	)
	return err == nil && len(records) > 0
}
