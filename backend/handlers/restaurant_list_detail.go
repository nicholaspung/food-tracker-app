package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	defaultRestaurantListsPageSize        = 20
	maxRestaurantListsPageSize            = 50
	defaultRestaurantListDetailPageSize   = 20
	maxRestaurantListDetailPageSize       = 50
	maxRestaurantListBookmarkStateTargets = 100
)

var errRestaurantListDetailNotFound = errors.New("restaurant list detail not found")

type restaurantListDetailListResponse struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Description     string `json:"description,omitempty"`
	Visibility      string `json:"visibility"`
	UserID          string `json:"userId"`
	OwnerName       string `json:"ownerName,omitempty"`
	IsDefault       bool   `json:"isDefault,omitempty"`
	ShareEnabled    bool   `json:"shareEnabled,omitempty"`
	CoverImage      string `json:"coverImage,omitempty"`
	RestaurantCount int    `json:"restaurantCount,omitempty"`
	MenuItemCount   int    `json:"menuItemCount,omitempty"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

type restaurantListDetailBookmarkedItemResponse struct {
	ID                       string  `json:"id"`
	ListItemID               string  `json:"listItemId"`
	Name                     string  `json:"name"`
	Rating                   float64 `json:"rating"`
	RestaurantID             string  `json:"restaurantId,omitempty"`
	MenuItemID               string  `json:"menuItemId,omitempty"`
	VisitedAt                string  `json:"visitedAt,omitempty"`
	SourceUserID             string  `json:"sourceUserId,omitempty"`
	SourceUserName           string  `json:"sourceUserName,omitempty"`
	UserFoodItemID           string  `json:"userFoodItemId,omitempty"`
	UserFoodItemRestaurantID string  `json:"userFoodItemRestaurantId,omitempty"`
	UserFoodItemName         string  `json:"userFoodItemName,omitempty"`
	UserFoodItemRating       float64 `json:"userFoodItemRating,omitempty"`
	UserFoodItemVisitedAt    string  `json:"userFoodItemVisitedAt,omitempty"`
}

type restaurantListDetailFriendMatchResponse struct {
	FriendID   string  `json:"friendId"`
	FriendName string  `json:"friendName"`
	Kind       string  `json:"kind"`
	ItemName   string  `json:"itemName,omitempty"`
	Rating     float64 `json:"rating,omitempty"`
	SavedAt    string  `json:"savedAt,omitempty"`
}

type restaurantListRecommendationUsageProofResponse struct {
	ActorID   string `json:"actorId"`
	ActorName string `json:"actorName"`
	Kind      string `json:"kind"`
	Action    string `json:"action"`
	ActedAt   string `json:"actedAt"`
}

type restaurantListCreatorGuideUsageProofResponse struct {
	SavedCount                    int `json:"savedCount"`
	TriedCount                    int `json:"triedCount"`
	RatedAfterTryCount            int `json:"ratedAfterTryCount"`
	SourceRecommendationCount     int `json:"sourceRecommendationCount"`
	TotalRecommendationUsageCount int `json:"totalRecommendationUsageCount"`
}

type restaurantListDetailItemResponse struct {
	ID                        string                                           `json:"id"`
	ListID                    string                                           `json:"listId"`
	RestaurantID              string                                           `json:"restaurantId"`
	RestaurantName            string                                           `json:"restaurantName"`
	RestaurantLocation        string                                           `json:"restaurantLocation,omitempty"`
	RestaurantCity            string                                           `json:"restaurantCity,omitempty"`
	RestaurantCuisineType     string                                           `json:"restaurantCuisineType,omitempty"`
	RestaurantVisibility      string                                           `json:"restaurantVisibility,omitempty"`
	Latitude                  *float64                                         `json:"latitude,omitempty"`
	Longitude                 *float64                                         `json:"longitude,omitempty"`
	SourceUserID              string                                           `json:"sourceUserId,omitempty"`
	SourceUserName            string                                           `json:"sourceUserName,omitempty"`
	Position                  int                                              `json:"position"`
	BookmarkedItems           []restaurantListDetailBookmarkedItemResponse     `json:"bookmarkedItems"`
	FriendOverlapCount        int                                              `json:"friendOverlapCount,omitempty"`
	FriendMatches             []restaurantListDetailFriendMatchResponse        `json:"friendMatches,omitempty"`
	RecommendationUsageProofs []restaurantListRecommendationUsageProofResponse `json:"recommendationUsageProofs,omitempty"`
	Note                      string                                           `json:"note,omitempty"`
	CreatedAt                 string                                           `json:"createdAt"`
}

type restaurantListDetailBookmarkStateResponse struct {
	SavedListIDsByBookmarkLookupID map[string][]string `json:"savedListIdsByBookmarkLookupId"`
}

type restaurantListBookmarkStateTargetRequest struct {
	BookmarkKey  string `json:"bookmarkKey"`
	RestaurantID string `json:"restaurantId"`
	FoodItemID   string `json:"foodItemId,omitempty"`
	MenuItemID   string `json:"menuItemId,omitempty"`
}

type restaurantListBookmarkStateRequest struct {
	Targets []restaurantListBookmarkStateTargetRequest `json:"targets"`
}

type restaurantListBookmarkStateTargetResponse struct {
	BookmarkKey  string `json:"bookmarkKey"`
	RestaurantID string `json:"restaurantId"`
	FoodItemID   string `json:"foodItemId,omitempty"`
	MenuItemID   string `json:"menuItemId,omitempty"`
}

type restaurantListBookmarkStateResponse struct {
	SavedTargetsByBookmarkKey map[string]restaurantListBookmarkStateTargetResponse `json:"savedTargetsByBookmarkKey"`
}

type restaurantListDetailPhotoPreviewResponse struct {
	ID             string `json:"id"`
	FoodItemID     string `json:"food_item,omitempty"`
	UserID         string `json:"user,omitempty"`
	Photo          string `json:"photo"`
	CollectionID   string `json:"collectionId,omitempty"`
	CollectionName string `json:"collectionName,omitempty"`
	Created        string `json:"created"`
	OwnerName      string `json:"ownerName,omitempty"`
}

type restaurantListsPageResponse struct {
	Items       []restaurantListDetailListResponse `json:"items"`
	Page        int                                `json:"page"`
	PageSize    int                                `json:"pageSize"`
	TotalItems  int                                `json:"totalItems"`
	TotalPages  int                                `json:"totalPages"`
	HasNextPage bool                               `json:"hasNextPage"`
}

type restaurantListDetailResponse struct {
	List                   restaurantListDetailListResponse              `json:"list"`
	Items                  []restaurantListDetailItemResponse            `json:"items"`
	Page                   int                                           `json:"page"`
	PageSize               int                                           `json:"pageSize"`
	TotalItems             int                                           `json:"totalItems"`
	TotalPages             int                                           `json:"totalPages"`
	HasNextPage            bool                                          `json:"hasNextPage"`
	BookmarkState          restaurantListDetailBookmarkStateResponse     `json:"bookmarkState"`
	PhotoPreviews          []restaurantListDetailPhotoPreviewResponse    `json:"photoPreviews"`
	CreatorGuideUsageProof *restaurantListCreatorGuideUsageProofResponse `json:"creatorGuideUsageProof,omitempty"`
}

type restaurantListDetailHydratedResponse struct {
	List                   restaurantListDetailListResponse              `json:"list"`
	Items                  []restaurantListDetailItemResponse            `json:"items"`
	BookmarkState          restaurantListDetailBookmarkStateResponse     `json:"bookmarkState"`
	PhotoPreviews          []restaurantListDetailPhotoPreviewResponse    `json:"photoPreviews"`
	ViewerLists            []restaurantListDetailListResponse            `json:"viewerLists"`
	CreatorGuideUsageProof *restaurantListCreatorGuideUsageProofResponse `json:"creatorGuideUsageProof,omitempty"`
}

type restaurantListVisitedRestaurantCandidateFoodItemResponse struct {
	ID           string                                             `json:"id"`
	Name         string                                             `json:"name"`
	Rating       float64                                            `json:"rating"`
	Notes        string                                             `json:"notes,omitempty"`
	VisitedAt    string                                             `json:"visitedAt"`
	PhotoPreview *restaurantListDetailPhotoPreviewReferenceResponse `json:"photoPreview,omitempty"`
	PhotoCount   int                                                `json:"photoCount,omitempty"`
	AlreadyAdded bool                                               `json:"alreadyAdded,omitempty"`
}

type restaurantListDetailPhotoPreviewReferenceResponse struct {
	ID    string `json:"id"`
	Photo string `json:"photo"`
}

type restaurantListVisitedRestaurantCandidateResponse struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Location        string `json:"location,omitempty"`
	CuisineType     string `json:"cuisineType,omitempty"`
	Visibility      string `json:"visibility,omitempty"`
	ItemCount       int    `json:"itemCount"`
	LatestVisitDate string `json:"latestVisitDate,omitempty"`
	AlreadyInList   bool   `json:"alreadyInList"`
	ExistingNote    string `json:"existingNote,omitempty"`
	LinkedItemCount int    `json:"linkedItemCount"`
}

type restaurantListVisitedRestaurantResponse struct {
	ID                string                                                     `json:"id"`
	Name              string                                                     `json:"name"`
	Location          string                                                     `json:"location,omitempty"`
	CuisineType       string                                                     `json:"cuisineType,omitempty"`
	Visibility        string                                                     `json:"visibility,omitempty"`
	ItemCount         int                                                        `json:"itemCount"`
	VisitDates        []string                                                   `json:"visitDates"`
	FoodItems         []restaurantListVisitedRestaurantCandidateFoodItemResponse `json:"foodItems"`
	AlreadyInList     bool                                                       `json:"alreadyInList"`
	ExistingNote      string                                                     `json:"existingNote,omitempty"`
	LinkedFoodItemIDs []string                                                   `json:"linkedFoodItemIds"`
}

type restaurantListVisitedRestaurantFoodItemsPageResponse struct {
	Items       []restaurantListVisitedRestaurantCandidateFoodItemResponse `json:"items"`
	Page        int                                                        `json:"page"`
	PageSize    int                                                        `json:"pageSize"`
	TotalItems  int                                                        `json:"totalItems"`
	TotalPages  int                                                        `json:"totalPages"`
	HasNextPage bool                                                       `json:"hasNextPage"`
}

type restaurantListVisitedRestaurantsPageResponse struct {
	Items       []restaurantListVisitedRestaurantResponse `json:"items"`
	Page        int                                       `json:"page"`
	PageSize    int                                       `json:"pageSize"`
	TotalItems  int                                       `json:"totalItems"`
	TotalPages  int                                       `json:"totalPages"`
	HasNextPage bool                                      `json:"hasNextPage"`
}

type restaurantListCandidateRestaurantsResponse struct {
	List        restaurantListDetailListResponse                   `json:"list"`
	Items       []restaurantListVisitedRestaurantCandidateResponse `json:"items"`
	Page        int                                                `json:"page"`
	PageSize    int                                                `json:"pageSize"`
	TotalItems  int                                                `json:"totalItems"`
	TotalPages  int                                                `json:"totalPages"`
	HasNextPage bool                                               `json:"hasNextPage"`
}

type restaurantListVisitedRestaurantCandidateRow struct {
	RestaurantID  string `db:"restaurantId"`
	Name          string `db:"name"`
	Location      string `db:"location"`
	CuisineType   string `db:"cuisineType"`
	Visibility    string `db:"visibility"`
	LatestVisitAt string `db:"latestVisitAt"`
	ItemCount     int    `db:"itemCount"`
}

type restaurantListVisitedRestaurantCandidateFoodItemRow struct {
	RestaurantID      string         `db:"restaurantId"`
	VisitAt           string         `db:"visitAt"`
	FoodItemID        string         `db:"foodItemId"`
	FoodItemName      string         `db:"foodItemName"`
	FoodItemRating    float64        `db:"foodItemRating"`
	FoodItemNotes     string         `db:"foodItemNotes"`
	PhotoPreviewID    sql.NullString `db:"photoPreviewId"`
	PhotoPreviewPhoto sql.NullString `db:"photoPreviewPhoto"`
	PhotoCount        int            `db:"photoCount"`
}

type restaurantListsPageRow struct {
	ID              string `db:"id"`
	Name            string `db:"name"`
	Description     string `db:"description"`
	Visibility      string `db:"visibility"`
	UserID          string `db:"userId"`
	OwnerName       string `db:"ownerName"`
	OwnerEmail      string `db:"ownerEmail"`
	IsDefault       bool   `db:"isDefault"`
	ShareEnabled    bool   `db:"shareEnabled"`
	CoverImage      string `db:"coverImage"`
	RestaurantCount int    `db:"restaurantCount"`
	MenuItemCount   int    `db:"menuItemCount"`
	CreatedAt       string `db:"createdAt"`
	UpdatedAt       string `db:"updatedAt"`
}

func registerRestaurantListDetailSummaryHandler(se *core.ServeEvent, app core.App) {
	se.Router.GET("/api/restaurant-lists/default", func(e *core.RequestEvent) error {
		listRecord, err := findDefaultRestaurantListRecordForUser(app, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load default restaurant list", err)
		}
		if listRecord == nil {
			return apis.NewNotFoundError("default restaurant list not found", nil)
		}

		return e.JSON(200, buildRestaurantListDetailListResponse(listRecord))
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/restaurant-lists", func(e *core.RequestEvent) error {
		scope, err := normalizeRestaurantListsScope(e.Request.URL.Query().Get("scope"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		page, pageSize, err := parseRestaurantListsPagination(
			e.Request.URL.Query().Get("page"),
			e.Request.URL.Query().Get("pageSize"),
		)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		response, err := listRestaurantListsPageResponse(
			app,
			e.Auth.Id,
			scope,
			page,
			pageSize,
			e.Request.URL.Query().Get("search"),
		)
		if err != nil {
			return apis.NewApiError(500, "failed to load restaurant lists", err)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/restaurant-lists/{listId}/detail", func(e *core.RequestEvent) error {
		listID := strings.TrimSpace(e.Request.PathValue("listId"))
		if listID == "" {
			return apis.NewBadRequestError("listId is required", nil)
		}

		var response any
		var err error
		if strings.TrimSpace(e.Request.URL.Query().Get("page")) != "" || strings.TrimSpace(e.Request.URL.Query().Get("pageSize")) != "" {
			page, pageSize, parseErr := parseRestaurantListDetailPagination(
				e.Request.URL.Query().Get("page"),
				e.Request.URL.Query().Get("pageSize"),
			)
			if parseErr != nil {
				return apis.NewBadRequestError(parseErr.Error(), nil)
			}
			response, err = getRestaurantListDetailResponse(app, e.Auth.Id, e.Auth.GetBool("isAdmin"), listID, page, pageSize)
		} else {
			response, err = getRestaurantListDetailHydratedResponse(app, e.Auth.Id, e.Auth.GetBool("isAdmin"), listID)
		}
		if err != nil {
			if errors.Is(err, errRestaurantListDetailNotFound) {
				return apis.NewNotFoundError("list not found", nil)
			}

			return apis.NewApiError(500, "failed to load restaurant list detail", err)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/restaurant-lists/{listId}/bookmark-state", func(e *core.RequestEvent) error {
		listID := strings.TrimSpace(e.Request.PathValue("listId"))
		if listID == "" {
			return apis.NewBadRequestError("listId is required", nil)
		}

		requestBody := restaurantListBookmarkStateRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		response, err := buildRestaurantListBookmarkStateResponse(app, e.Auth.Id, listID, requestBody.Targets)
		if err != nil {
			if errors.Is(err, errRestaurantListDetailNotFound) {
				return apis.NewNotFoundError("list not found", nil)
			}
			return err
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/restaurant-lists/{listId}/candidate-restaurants", func(e *core.RequestEvent) error {
		listID := strings.TrimSpace(e.Request.PathValue("listId"))
		if listID == "" {
			return apis.NewBadRequestError("listId is required", nil)
		}

		page, pageSize, parseErr := parseRestaurantListDetailPagination(
			e.Request.URL.Query().Get("page"),
			e.Request.URL.Query().Get("pageSize"),
		)
		if parseErr != nil {
			return apis.NewBadRequestError(parseErr.Error(), nil)
		}

		response, err := getRestaurantListCandidateRestaurantsResponse(
			app,
			e.Auth.Id,
			listID,
			page,
			pageSize,
			e.Request.URL.Query().Get("search"),
		)
		if err != nil {
			if errors.Is(err, errRestaurantListDetailNotFound) {
				return apis.NewNotFoundError("list not found", nil)
			}

			return apis.NewApiError(500, "failed to load candidate restaurants", err)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/restaurant-lists/{listId}/candidate-restaurants/{restaurantId}/items", func(e *core.RequestEvent) error {
		listID := strings.TrimSpace(e.Request.PathValue("listId"))
		restaurantID := strings.TrimSpace(e.Request.PathValue("restaurantId"))
		if listID == "" || restaurantID == "" {
			return apis.NewBadRequestError("listId and restaurantId are required", nil)
		}

		page, pageSize, parseErr := parseRestaurantListDetailPagination(
			e.Request.URL.Query().Get("page"),
			e.Request.URL.Query().Get("pageSize"),
		)
		if parseErr != nil {
			return apis.NewBadRequestError(parseErr.Error(), nil)
		}

		response, err := getRestaurantListVisitedRestaurantFoodItemsPageResponse(
			app,
			e.Auth.Id,
			listID,
			restaurantID,
			page,
			pageSize,
		)
		if err != nil {
			if errors.Is(err, errRestaurantListDetailNotFound) {
				return apis.NewNotFoundError("list not found", nil)
			}

			return apis.NewApiError(500, "failed to load candidate restaurant items", err)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/restaurant-lists/{listId}/visited-restaurants", func(e *core.RequestEvent) error {
		listID := strings.TrimSpace(e.Request.PathValue("listId"))
		if listID == "" {
			return apis.NewBadRequestError("listId is required", nil)
		}

		page, pageSize, err := parseRestaurantListDetailPagination(
			e.Request.URL.Query().Get("page"),
			e.Request.URL.Query().Get("pageSize"),
		)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		response, err := getRestaurantListVisitedRestaurantsPageResponse(
			app,
			e.Auth.Id,
			listID,
			page,
			pageSize,
			e.Request.URL.Query().Get("search"),
		)
		if err != nil {
			if errors.Is(err, errRestaurantListDetailNotFound) {
				return apis.NewNotFoundError("list not found", nil)
			}

			return apis.NewApiError(500, "failed to load visited restaurants", err)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())
}

func normalizeRestaurantListsScope(raw string) (string, error) {
	switch strings.TrimSpace(raw) {
	case "", "my":
		return "my", nil
	case "friends":
		return "friends", nil
	default:
		return "", fmt.Errorf("invalid restaurant list scope")
	}
}

func parseRestaurantListsPagination(pageRaw string, pageSizeRaw string) (int, int, error) {
	page := 1
	if strings.TrimSpace(pageRaw) != "" {
		parsedPage, err := strconv.Atoi(pageRaw)
		if err != nil || parsedPage < 1 {
			return 0, 0, fmt.Errorf("invalid page")
		}
		page = parsedPage
	}

	pageSize := defaultRestaurantListsPageSize
	if strings.TrimSpace(pageSizeRaw) != "" {
		parsedPageSize, err := strconv.Atoi(pageSizeRaw)
		if err != nil || parsedPageSize < 1 {
			return 0, 0, fmt.Errorf("invalid pageSize")
		}

		if parsedPageSize > maxRestaurantListsPageSize {
			pageSize = maxRestaurantListsPageSize
		} else {
			pageSize = parsedPageSize
		}
	}

	return page, pageSize, nil
}

func listRestaurantListsPageResponse(
	app core.App,
	userID string,
	scope string,
	page int,
	pageSize int,
	search string,
) (restaurantListsPageResponse, error) {
	response := restaurantListsPageResponse{
		Items:    []restaurantListDetailListResponse{},
		Page:     page,
		PageSize: pageSize,
	}

	filterSQL, params := buildRestaurantListsPageFilter(userID, scope, search)

	totalItems, err := countRestaurantListsForPage(app, filterSQL, params)
	if err != nil {
		return response, err
	}

	totalPages := 0
	if totalItems > 0 {
		totalPages = (totalItems + pageSize - 1) / pageSize
	}
	response.TotalItems = totalItems
	response.TotalPages = totalPages
	response.HasNextPage = totalPages > 0 && page < totalPages

	if totalItems == 0 {
		return response, nil
	}

	rows, err := findRestaurantListsForPage(app, filterSQL, params, scope, page, pageSize)
	if err != nil {
		return response, err
	}

	items := make([]restaurantListDetailListResponse, 0, len(rows))
	for _, row := range rows {
		items = append(items, restaurantListDetailListResponse{
			ID:              row.ID,
			Name:            strings.TrimSpace(row.Name),
			Description:     strings.TrimSpace(row.Description),
			Visibility:      normalizeRestaurantListDetailVisibility(row.Visibility),
			UserID:          strings.TrimSpace(row.UserID),
			OwnerName:       resolveFriendDisplayName(row.OwnerName, row.OwnerEmail),
			IsDefault:       row.IsDefault,
			ShareEnabled:    row.ShareEnabled,
			CoverImage:      strings.TrimSpace(row.CoverImage),
			RestaurantCount: row.RestaurantCount,
			MenuItemCount:   row.MenuItemCount,
			CreatedAt:       strings.TrimSpace(row.CreatedAt),
			UpdatedAt:       defaultString(strings.TrimSpace(row.UpdatedAt), strings.TrimSpace(row.CreatedAt)),
		})
	}

	response.Items = items
	return response, nil
}

func buildRestaurantListsPageFilter(userID string, scope string, search string) (string, dbx.Params) {
	params := dbx.Params{
		"userId": userID,
	}
	conditions := []string{
		`COALESCE(rl.moderationStatus, '') IN ('', 'active', 'reviewed')`,
	}

	normalizedSearch := strings.ToLower(strings.TrimSpace(search))

	switch scope {
	case "friends":
		conditions = append(conditions, `rl.visibility = 'friends'`)
		conditions = append(conditions, `rl.user != {:userId}`)
		conditions = append(conditions, `EXISTS (
			SELECT 1
			FROM friendships f
			WHERE f.status = 'accepted'
				AND (
					(f.user = rl.user AND f.friend = {:userId}) OR
					(f.friend = rl.user AND f.user = {:userId})
				)
		)`)

		if normalizedSearch != "" {
			params["search"] = "%" + escapeFriendsSearchValue(normalizedSearch) + "%"
			conditions = append(
				conditions,
				`(
					LOWER(COALESCE(rl.name, '')) LIKE {:search} ESCAPE '\' OR
					LOWER(COALESCE(rl.description, '')) LIKE {:search} ESCAPE '\' OR
					LOWER(COALESCE(owners.name, '')) LIKE {:search} ESCAPE '\' OR
					LOWER(COALESCE(owners.email, '')) LIKE {:search} ESCAPE '\'
				)`,
			)
		}
	default:
		conditions = append(conditions, `rl.user = {:userId}`)

		if normalizedSearch != "" {
			params["search"] = "%" + escapeFriendsSearchValue(normalizedSearch) + "%"
			conditions = append(
				conditions,
				`(
					LOWER(COALESCE(rl.name, '')) LIKE {:search} ESCAPE '\' OR
					LOWER(COALESCE(rl.description, '')) LIKE {:search} ESCAPE '\'
				)`,
			)
		}
	}

	return strings.Join(conditions, " AND "), params
}

func countRestaurantListsForPage(app core.App, filterSQL string, params dbx.Params) (int, error) {
	var totalItems int
	err := app.DB().NewQuery(`
		SELECT COUNT(*)
		FROM restaurant_lists rl
		LEFT JOIN users owners ON owners.id = rl.user
		WHERE ` + filterSQL).
		Bind(params).
		Row(&totalItems)
	return totalItems, err
}

func findRestaurantListsForPage(
	app core.App,
	filterSQL string,
	params dbx.Params,
	scope string,
	page int,
	pageSize int,
) ([]restaurantListsPageRow, error) {
	offset := (page - 1) * pageSize
	orderBy := `
		COALESCE(NULLIF(TRIM(rl.updated), ''), rl.created) DESC,
		rl.id DESC
	`
	if scope == "my" {
		orderBy = `
			COALESCE(rl.isDefault, 0) DESC,
			COALESCE(NULLIF(TRIM(rl.updated), ''), rl.created) DESC,
			rl.id DESC
		`
	}

	queryParams := dbx.Params{
		"limit":  pageSize,
		"offset": offset,
	}
	for key, value := range params {
		queryParams[key] = value
	}

	rows := []restaurantListsPageRow{}
	err := app.DB().NewQuery(`
		SELECT
			rl.id AS [[id]],
			rl.name AS [[name]],
			rl.description AS [[description]],
			rl.visibility AS [[visibility]],
			rl.user AS [[userId]],
			owners.name AS [[ownerName]],
			owners.email AS [[ownerEmail]],
			COALESCE(rl.isDefault, 0) AS [[isDefault]],
			COALESCE(rl.shareEnabled, 0) AS [[shareEnabled]],
			rl.coverImage AS [[coverImage]],
			COALESCE(rl.restaurantCount, 0) AS [[restaurantCount]],
			COALESCE(rl.menuItemCount, 0) AS [[menuItemCount]],
			rl.created AS [[createdAt]],
			COALESCE(NULLIF(TRIM(rl.updated), ''), rl.created) AS [[updatedAt]]
		FROM restaurant_lists rl
		LEFT JOIN users owners ON owners.id = rl.user
		WHERE ` + filterSQL + `
		ORDER BY ` + orderBy + `
		LIMIT {:limit} OFFSET {:offset}
	`).
		Bind(queryParams).
		All(&rows)
	if err != nil {
		return nil, err
	}

	return rows, nil
}

func getRestaurantListDetailHydratedResponse(
	app core.App,
	userID string,
	isAdmin bool,
	listID string,
) (restaurantListDetailHydratedResponse, error) {
	response := restaurantListDetailHydratedResponse{
		Items:         []restaurantListDetailItemResponse{},
		BookmarkState: restaurantListDetailBookmarkStateResponse{SavedListIDsByBookmarkLookupID: map[string][]string{}},
		PhotoPreviews: []restaurantListDetailPhotoPreviewResponse{},
		ViewerLists:   []restaurantListDetailListResponse{},
	}

	detailResponse, err := getRestaurantListDetailResponse(app, userID, isAdmin, listID, 1, 0)
	if err != nil {
		return response, err
	}

	response.List = detailResponse.List
	response.Items = detailResponse.Items
	response.BookmarkState = detailResponse.BookmarkState
	response.PhotoPreviews = detailResponse.PhotoPreviews
	response.CreatorGuideUsageProof = detailResponse.CreatorGuideUsageProof

	if response.List.UserID == userID {
		return response, nil
	}

	viewerListRecords, err := listOwnedRestaurantLists(app, userID)
	if err != nil {
		return response, err
	}

	response.ViewerLists = make([]restaurantListDetailListResponse, 0, len(viewerListRecords))
	for _, record := range viewerListRecords {
		response.ViewerLists = append(response.ViewerLists, buildRestaurantListDetailListResponse(record))
	}

	return response, nil
}

func getRestaurantListDetailResponse(
	app core.App,
	userID string,
	isAdmin bool,
	listID string,
	page int,
	pageSize int,
) (restaurantListDetailResponse, error) {
	response := restaurantListDetailResponse{
		Items:         []restaurantListDetailItemResponse{},
		Page:          page,
		PageSize:      pageSize,
		BookmarkState: restaurantListDetailBookmarkStateResponse{SavedListIDsByBookmarkLookupID: map[string][]string{}},
		PhotoPreviews: []restaurantListDetailPhotoPreviewResponse{},
	}

	acceptedFriendIDs, err := listAcceptedFriendIDs(app, userID)
	if err != nil {
		return response, err
	}

	listRecord, err := app.FindRecordById("restaurant_lists", listID)
	if errors.Is(err, sql.ErrNoRows) {
		return response, errRestaurantListDetailNotFound
	}
	if err != nil {
		return response, err
	}
	if !canAccessRestaurantListRecord(listRecord, userID, isAdmin, acceptedFriendIDs) {
		return response, errRestaurantListDetailNotFound
	}

	totalItems, err := countRestaurantListDetailItems(app, listID)
	if err != nil {
		return response, err
	}

	effectivePageSize := pageSize
	if effectivePageSize <= 0 {
		effectivePageSize = totalItems
		if effectivePageSize < 1 {
			effectivePageSize = 1
		}
	}

	totalPages := 0
	if totalItems > 0 {
		totalPages = (totalItems + effectivePageSize - 1) / effectivePageSize
	}
	response.TotalItems = totalItems
	response.TotalPages = totalPages
	response.HasNextPage = totalPages > 0 && page < totalPages
	response.PageSize = effectivePageSize

	listItemRecords, err := listRestaurantListDetailItemRecords(app, listID, page, effectivePageSize)
	if err != nil {
		return response, err
	}

	restaurantIDs := make([]string, 0, len(listItemRecords))
	sourceUserIDs := make([]string, 0, len(listItemRecords)+1)
	foodItemIDs := make([]string, 0, len(listItemRecords)*3)
	menuItemIDs := make([]string, 0, len(listItemRecords))
	restaurantIDSet := map[string]struct{}{}
	sourceUserIDSet := map[string]struct{}{}
	foodItemIDSet := map[string]struct{}{}
	menuItemIDSet := map[string]struct{}{}

	sourceUserIDs = appendUniqueTrimmedID(sourceUserIDs, sourceUserIDSet, listRecord.GetString("user"))

	for _, listItem := range listItemRecords {
		restaurantIDs = appendUniqueTrimmedID(restaurantIDs, restaurantIDSet, listItem.GetString("restaurant"))
		sourceUserIDs = appendUniqueTrimmedID(sourceUserIDs, sourceUserIDSet, listItem.GetString("sourceUser"))
		foodItemIDs = appendUniqueTrimmedID(foodItemIDs, foodItemIDSet, listItem.GetString("foodItem"))
		foodItemIDs = appendUniqueTrimmedID(foodItemIDs, foodItemIDSet, listItem.GetString("userFoodItem"))
		for _, recommendedItemID := range listItem.GetStringSlice("recommendedItems") {
			foodItemIDs = appendUniqueTrimmedID(foodItemIDs, foodItemIDSet, recommendedItemID)
		}
		menuItemIDs = appendUniqueTrimmedID(menuItemIDs, menuItemIDSet, listItem.GetString("menuItem"))
	}

	restaurantRecords, err := findRecordsByIDs(app, "restaurants", restaurantIDs)
	if err != nil {
		return response, err
	}
	restaurantsByID := mapRecordsByID(restaurantRecords)
	friendOverlapCountsByRestaurantID := map[string]int{}
	friendMatchesByRestaurantID := map[string][]restaurantListDetailFriendMatchResponse{}
	if listRecord.GetBool("isDefault") {
		friendMatchesByRestaurantID, err = buildWantToTryFriendMatches(app, userID, restaurantIDs)
		if err != nil {
			return response, err
		}
		friendOverlapCountsByRestaurantID = buildFriendOverlapCountsFromMatches(friendMatchesByRestaurantID)
	}

	foodItemRecords, err := findRecordsByIDs(app, "food_items", foodItemIDs)
	if err != nil {
		return response, err
	}

	visitIDs := make([]string, 0, len(foodItemRecords))
	visitIDSet := map[string]struct{}{}
	for _, foodItem := range foodItemRecords {
		visitIDs = appendUniqueTrimmedID(visitIDs, visitIDSet, foodItem.GetString("visit"))
	}

	visitRecords, err := findRecordsByIDs(app, "visits", visitIDs)
	if err != nil {
		return response, err
	}
	visitsByID := mapRecordsByID(visitRecords)

	accessibleFoodItems := make([]*core.Record, 0, len(foodItemRecords))
	for _, foodItem := range foodItemRecords {
		if canAccessFoodItemRecord(foodItem, visitsByID, userID, isAdmin, acceptedFriendIDs) {
			accessibleFoodItems = append(accessibleFoodItems, foodItem)
			sourceUserIDs = appendUniqueTrimmedID(sourceUserIDs, sourceUserIDSet, foodItem.GetString("user"))
		}
	}
	foodItemsByID := mapRecordsByID(accessibleFoodItems)

	menuItemRecords, err := findRecordsByIDs(app, "menu_items", menuItemIDs)
	if err != nil {
		return response, err
	}
	accessibleMenuItems := make([]*core.Record, 0, len(menuItemRecords))
	for _, menuItem := range menuItemRecords {
		if canAccessMenuItemRecord(menuItem, userID, isAdmin, acceptedFriendIDs) {
			accessibleMenuItems = append(accessibleMenuItems, menuItem)
		}
	}
	menuItemsByID := mapRecordsByID(accessibleMenuItems)

	response.List = buildRestaurantListDetailListResponse(listRecord)

	userRecords, err := findRecordsByIDs(app, "users", sourceUserIDs)
	if err != nil {
		return response, err
	}
	usersByID := mapRecordsByID(userRecords)
	if ownerRecord := usersByID[listRecord.GetString("user")]; ownerRecord != nil {
		response.List.OwnerName = resolveHomeFeedUserName(ownerRecord)
	}

	if strings.TrimSpace(listRecord.GetString("user")) == userID &&
		!listRecord.GetBool("isDefault") &&
		listRecord.GetBool("shareEnabled") {
		creatorGuideUsageProof, err := buildCreatorGuideUsageProof(app, listRecord.Id, userID)
		if err != nil {
			return response, err
		}
		response.CreatorGuideUsageProof = creatorGuideUsageProof
	}

	recommendationUsageProofsByListItemID := map[string][]restaurantListRecommendationUsageProofResponse{}
	if strings.TrimSpace(listRecord.GetString("user")) == userID {
		recommendationUsageProofsByListItemID, err = buildRestaurantListRecommendationUsageProofs(
			app,
			userID,
			isAdmin,
			acceptedFriendIDs,
			listItemRecords,
		)
		if err != nil {
			return response, err
		}
	}

	items := make([]restaurantListDetailItemResponse, 0, len(listItemRecords))
	visibleBookmarkLookupIDs := make([]string, 0, len(listItemRecords)*2)
	visibleBookmarkLookupSet := map[string]struct{}{}
	photoFoodItemIDs := make([]string, 0, len(listItemRecords)*2)
	photoFoodItemIDSet := map[string]struct{}{}

	for _, listItem := range listItemRecords {
		restaurantRecord := restaurantsByID[listItem.GetString("restaurant")]
		var latitude *float64
		var longitude *float64
		if restaurantRecord != nil {
			restaurantLatitude := restaurantRecord.GetFloat("latitude")
			restaurantLongitude := restaurantRecord.GetFloat("longitude")
			if restaurantLatitude != 0 || restaurantLongitude != 0 {
				latitude = &restaurantLatitude
				longitude = &restaurantLongitude
			}
		}
		itemResponse := restaurantListDetailItemResponse{
			ID:                        listItem.Id,
			ListID:                    listItem.GetString("list"),
			RestaurantID:              listItem.GetString("restaurant"),
			RestaurantName:            defaultString(resolveRestaurantName(restaurantRecord), "Unknown restaurant"),
			RestaurantLocation:        resolveRestaurantLocation(restaurantRecord),
			RestaurantCity:            resolveRestaurantLocation(restaurantRecord),
			RestaurantCuisineType:     resolveRestaurantCuisine(restaurantRecord),
			RestaurantVisibility:      normalizeRestaurantVisibilityForListDetail(restaurantRecord),
			Latitude:                  latitude,
			Longitude:                 longitude,
			SourceUserID:              strings.TrimSpace(listItem.GetString("sourceUser")),
			Position:                  listItem.GetInt("position"),
			BookmarkedItems:           []restaurantListDetailBookmarkedItemResponse{},
			RecommendationUsageProofs: recommendationUsageProofsByListItemID[listItem.Id],
			Note:                      strings.TrimSpace(listItem.GetString("note")),
			CreatedAt:                 strings.TrimSpace(listItem.GetString("created")),
		}

		if sourceUserRecord := usersByID[itemResponse.SourceUserID]; sourceUserRecord != nil {
			itemResponse.SourceUserName = resolveHomeFeedUserName(sourceUserRecord)
		}

		bookmarkedItems := buildRestaurantListDetailBookmarkedItems(
			listItem,
			usersByID,
			foodItemsByID,
			menuItemsByID,
			visitsByID,
		)
		itemResponse.BookmarkedItems = bookmarkedItems
		if listRecord.GetBool("isDefault") {
			itemResponse.FriendOverlapCount = friendOverlapCountsByRestaurantID[itemResponse.RestaurantID]
			itemResponse.FriendMatches = friendMatchesByRestaurantID[itemResponse.RestaurantID]
		}

		for _, bookmarkedItem := range bookmarkedItems {
			visibleBookmarkLookupIDs = appendUniqueTrimmedID(
				visibleBookmarkLookupIDs,
				visibleBookmarkLookupSet,
				bookmarkedItem.ID,
			)
			visibleBookmarkLookupIDs = appendUniqueTrimmedID(
				visibleBookmarkLookupIDs,
				visibleBookmarkLookupSet,
				bookmarkedItem.UserFoodItemID,
			)
			photoFoodItemIDs = appendUniqueTrimmedID(photoFoodItemIDs, photoFoodItemIDSet, bookmarkedItem.ID)
			photoFoodItemIDs = appendUniqueTrimmedID(photoFoodItemIDs, photoFoodItemIDSet, bookmarkedItem.UserFoodItemID)
		}

		items = append(items, itemResponse)
	}
	response.Items = items

	if listRecord.GetString("user") != userID {
		bookmarkState, err := buildRestaurantListDetailBookmarkState(app, userID, visibleBookmarkLookupIDs)
		if err != nil {
			return response, err
		}
		response.BookmarkState = bookmarkState
	}

	photoRecords, err := findRecordsByRelationValues(app, "visit_photos", "food_item", photoFoodItemIDs, "-created")
	if err != nil {
		return response, err
	}

	photoUserIDs := make([]string, 0, len(photoRecords))
	photoUserIDSet := map[string]struct{}{}
	filteredPhotoRecords := make([]*core.Record, 0, len(photoRecords))
	for _, photo := range photoRecords {
		if !canAccessVisitPhotoRecord(photo, foodItemsByID, visitsByID, userID, isAdmin, acceptedFriendIDs) {
			continue
		}

		filteredPhotoRecords = append(filteredPhotoRecords, photo)
		photoUserIDs = appendUniqueTrimmedID(photoUserIDs, photoUserIDSet, photo.GetString("user"))
	}

	photoUserRecords, err := findRecordsByIDs(app, "users", photoUserIDs)
	if err != nil {
		return response, err
	}
	photoUsersByID := mapRecordsByID(photoUserRecords)

	photoPreviews := make([]restaurantListDetailPhotoPreviewResponse, 0, len(filteredPhotoRecords))
	for _, photo := range filteredPhotoRecords {
		foodItemID := strings.TrimSpace(photo.GetString("food_item"))
		photoPreviews = append(photoPreviews, restaurantListDetailPhotoPreviewResponse{
			ID:             photo.Id,
			FoodItemID:     foodItemID,
			UserID:         strings.TrimSpace(photo.GetString("user")),
			Photo:          strings.TrimSpace(photo.GetString("photo")),
			CollectionID:   photo.Collection().Id,
			CollectionName: photo.Collection().Name,
			Created:        strings.TrimSpace(photo.GetString("created")),
			OwnerName:      resolveHomeFeedUserName(photoUsersByID[photo.GetString("user")]),
		})
	}
	response.PhotoPreviews = photoPreviews

	return response, nil
}

func buildCreatorGuideUsageProof(
	app core.App,
	listID string,
	ownerID string,
) (*restaurantListCreatorGuideUsageProofResponse, error) {
	rows := []struct {
		ID                       string `db:"id"`
		Kind                     string `db:"kind"`
		Action                   string `db:"action"`
		SourceListItem           string `db:"sourceListItem"`
		SourceListItemSnapshotID string `db:"sourceListItemSnapshotId"`
	}{}

	err := app.DB().NewQuery(`
		SELECT
			ru.id AS [[id]],
			ru.kind AS [[kind]],
			ru.action AS [[action]],
			COALESCE(ru.sourceListItem, '') AS [[sourceListItem]],
			COALESCE(ru.sourceListItemSnapshotId, '') AS [[sourceListItemSnapshotId]]
		FROM recommendation_usage ru
		WHERE ru.sourceRestaurantList = {:listId}
			AND ru.actor != {:ownerId}
			AND (
				(ru.kind = 'saved_recommendation' AND ru.action = 'saved') OR
				(ru.kind = 'tried_recommendation' AND ru.action = 'tried') OR
				(ru.kind = 'rated_after_try' AND ru.action = 'rated')
			)
		UNION ALL
		SELECT
			ru.id AS [[id]],
			ru.kind AS [[kind]],
			ru.action AS [[action]],
			COALESCE(saved.sourceListItem, '') AS [[sourceListItem]],
			COALESCE(saved.sourceListItemSnapshotId, '') AS [[sourceListItemSnapshotId]]
		FROM recommendation_usage ru
		INNER JOIN recommendation_usage saved
			ON saved.sourceRestaurantList = {:listId}
			AND saved.kind = 'saved_recommendation'
			AND saved.action = 'saved'
			AND saved.actor = ru.actor
			AND (
				(
					COALESCE(saved.targetListItemSnapshotId, '') != ''
					AND (
						ru.sourceListItem = saved.targetListItemSnapshotId OR
						ru.sourceListItemSnapshotId = saved.targetListItemSnapshotId
					)
				) OR
				(
					COALESCE(saved.targetListItem, '') != ''
					AND (
						ru.sourceListItem = saved.targetListItem OR
						ru.sourceListItemSnapshotId = saved.targetListItem
					)
				)
			)
		WHERE ru.actor != {:ownerId}
			AND (
				(ru.kind = 'tried_recommendation' AND ru.action = 'tried') OR
				(ru.kind = 'rated_after_try' AND ru.action = 'rated')
			)
	`).
		Bind(dbx.Params{
			"listId":  listID,
			"ownerId": ownerID,
		}).
		All(&rows)
	if err != nil {
		return nil, apis.NewApiError(500, "failed to load creator guide recommendation usage proof", err)
	}

	if len(rows) == 0 {
		return nil, nil
	}

	proof := &restaurantListCreatorGuideUsageProofResponse{}
	sourceRecommendationIDs := map[string]struct{}{}
	seenUsageIDs := map[string]struct{}{}
	for _, row := range rows {
		usageID := strings.TrimSpace(row.ID)
		if usageID == "" {
			continue
		}
		if _, exists := seenUsageIDs[usageID]; exists {
			continue
		}
		seenUsageIDs[usageID] = struct{}{}

		switch row.Kind {
		case recommendationUsageKindSavedRecommendation:
			proof.SavedCount++
		case recommendationUsageKindTriedRecommendation:
			proof.TriedCount++
		case recommendationUsageKindRatedAfterTry:
			proof.RatedAfterTryCount++
		default:
			continue
		}
		proof.TotalRecommendationUsageCount++

		sourceListItemID := strings.TrimSpace(row.SourceListItemSnapshotID)
		if sourceListItemID == "" {
			sourceListItemID = strings.TrimSpace(row.SourceListItem)
		}
		if sourceListItemID != "" {
			sourceRecommendationIDs[sourceListItemID] = struct{}{}
		}
	}

	if proof.TotalRecommendationUsageCount == 0 {
		return nil, nil
	}
	proof.SourceRecommendationCount = len(sourceRecommendationIDs)
	return proof, nil
}

func buildRestaurantListRecommendationUsageProofs(
	app core.App,
	userID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
	listItemRecords []*core.Record,
) (map[string][]restaurantListRecommendationUsageProofResponse, error) {
	result := map[string][]restaurantListRecommendationUsageProofResponse{}
	listItemIDs := make([]string, 0, len(listItemRecords))
	listItemIDSet := map[string]struct{}{}
	for _, listItemRecord := range listItemRecords {
		listItemIDs = appendUniqueTrimmedID(listItemIDs, listItemIDSet, listItemRecord.Id)
	}
	if len(listItemIDs) == 0 {
		return result, nil
	}

	usageRecords, err := findRecommendationUsageRecordsForSourceListItems(app, listItemIDs)
	if err != nil {
		return result, apis.NewApiError(500, "failed to load recommendation usage proof", err)
	}
	if len(usageRecords) == 0 {
		return result, nil
	}

	targetVisitIDs := make([]string, 0, len(usageRecords))
	targetVisitIDSet := map[string]struct{}{}
	targetVisitItemIDs := make([]string, 0, len(usageRecords))
	targetVisitItemIDSet := map[string]struct{}{}
	actorIDs := make([]string, 0, len(usageRecords))
	actorIDSet := map[string]struct{}{}
	for _, usageRecord := range usageRecords {
		actorID := strings.TrimSpace(usageRecord.GetString("actor"))
		if actorID == "" || actorID == userID || (!isAdmin && !hasAcceptedFriend(acceptedFriendIDs, actorID)) {
			continue
		}
		actorIDs = appendUniqueTrimmedID(actorIDs, actorIDSet, actorID)
		targetVisitIDs = appendUniqueTrimmedID(targetVisitIDs, targetVisitIDSet, usageRecord.GetString("targetVisit"))
		targetVisitItemIDs = appendUniqueTrimmedID(targetVisitItemIDs, targetVisitItemIDSet, usageRecord.GetString("targetVisitItem"))
	}

	userRecords, err := findRecordsByIDs(app, "users", actorIDs)
	if err != nil {
		return result, apis.NewApiError(500, "failed to load recommendation usage proof actors", err)
	}
	usersByID := mapRecordsByID(userRecords)

	targetVisitRecords, err := findRecordsByIDs(app, "visits", targetVisitIDs)
	if err != nil {
		return result, apis.NewApiError(500, "failed to load recommendation usage proof visits", err)
	}
	targetVisitsByID := mapRecordsByID(targetVisitRecords)
	targetVisitItemRecords, err := findRecordsByIDs(app, "food_items", targetVisitItemIDs)
	if err != nil {
		return result, apis.NewApiError(500, "failed to load recommendation usage proof visit items", err)
	}
	targetVisitItemsByID := mapRecordsByID(targetVisitItemRecords)
	targetMenuItemsByID, err := buildAccessibleMenuItemsByID(
		app,
		collectVisitItemMenuItemIDs(targetVisitItemRecords),
		userID,
		isAdmin,
		acceptedFriendIDs,
	)
	if err != nil {
		return result, err
	}

	for _, usageRecord := range usageRecords {
		actorID := strings.TrimSpace(usageRecord.GetString("actor"))
		if actorID == "" || actorID == userID || (!isAdmin && !hasAcceptedFriend(acceptedFriendIDs, actorID)) {
			continue
		}
		if !recommendationUsageProofTargetIsVisible(
			usageRecord,
			targetVisitsByID,
			targetVisitItemsByID,
			targetMenuItemsByID,
			userID,
			isAdmin,
			acceptedFriendIDs,
		) {
			continue
		}

		sourceListItemID := strings.TrimSpace(usageRecord.GetString("sourceListItemSnapshotId"))
		if sourceListItemID == "" {
			sourceListItemID = strings.TrimSpace(usageRecord.GetString("sourceListItem"))
		}
		if sourceListItemID == "" {
			continue
		}

		proof := restaurantListRecommendationUsageProofResponse{
			ActorID:   actorID,
			ActorName: resolveHomeFeedUserName(usersByID[actorID]),
			Kind:      strings.TrimSpace(usageRecord.GetString("kind")),
			Action:    strings.TrimSpace(usageRecord.GetString("action")),
			ActedAt:   firstNonEmpty(strings.TrimSpace(usageRecord.GetString("actedAt")), strings.TrimSpace(usageRecord.GetString("created"))),
		}
		if proof.ActorName == "" {
			continue
		}
		result[sourceListItemID] = append(result[sourceListItemID], proof)
	}

	return result, nil
}

func findRecommendationUsageRecordsForSourceListItems(app core.App, listItemIDs []string) ([]*core.Record, error) {
	uniqueIDs := uniqueTrimmedValues(listItemIDs)
	if len(uniqueIDs) == 0 {
		return nil, nil
	}

	records := make([]*core.Record, 0)
	for _, chunk := range chunkStrings(uniqueIDs, recordLookupFilterChunkSize) {
		params := dbx.Params{}
		clauses := make([]string, 0, len(chunk)*2)
		for index, listItemID := range chunk {
			paramKey := fmt.Sprintf("sourceListItem%d", index)
			params[paramKey] = listItemID
			clauses = append(clauses,
				fmt.Sprintf("sourceListItem = {:%s}", paramKey),
				fmt.Sprintf("sourceListItemSnapshotId = {:%s}", paramKey),
			)
		}

		filter := strings.Join(clauses, " || ")
		if len(clauses) > 1 {
			filter = "(" + filter + ")"
		}
		chunkRecords, err := app.FindRecordsByFilter("recommendation_usage", filter, "-actedAt,-created", 2000, 0, params)
		if err != nil {
			return nil, err
		}
		records = append(records, chunkRecords...)
	}

	return records, nil
}

func recommendationUsageProofTargetIsVisible(
	usageRecord *core.Record,
	targetVisitsByID map[string]*core.Record,
	targetVisitItemsByID map[string]*core.Record,
	targetMenuItemsByID map[string]*core.Record,
	userID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
) bool {
	switch strings.TrimSpace(usageRecord.GetString("kind")) {
	case recommendationUsageKindSavedRecommendation:
		return true
	case recommendationUsageKindTriedRecommendation, recommendationUsageKindRatedAfterTry:
		targetVisitID := strings.TrimSpace(usageRecord.GetString("targetVisit"))
		if targetVisitID == "" {
			return false
		}
		if !canAccessVisitRecord(targetVisitsByID[targetVisitID], userID, isAdmin, acceptedFriendIDs) {
			return false
		}
		if strings.TrimSpace(usageRecord.GetString("kind")) != recommendationUsageKindRatedAfterTry {
			return true
		}
		targetVisitItemID := strings.TrimSpace(usageRecord.GetString("targetVisitItem"))
		if targetVisitItemID == "" {
			return false
		}
		targetVisitItem := targetVisitItemsByID[targetVisitItemID]
		if targetVisitItem == nil {
			return false
		}
		if !canAccessFoodItemRecord(targetVisitItem, targetVisitsByID, userID, isAdmin, acceptedFriendIDs) {
			return false
		}
		targetMenuItemID := strings.TrimSpace(targetVisitItem.GetString("menuItem"))
		return targetMenuItemID == "" || targetMenuItemsByID[targetMenuItemID] != nil
	default:
		return false
	}
}

func parseRestaurantListDetailPagination(pageRaw string, pageSizeRaw string) (int, int, error) {
	page := 1
	if strings.TrimSpace(pageRaw) != "" {
		parsedPage, err := strconv.Atoi(pageRaw)
		if err != nil || parsedPage < 1 {
			return 0, 0, fmt.Errorf("invalid page")
		}
		page = parsedPage
	}

	pageSize := defaultRestaurantListDetailPageSize
	if strings.TrimSpace(pageSizeRaw) != "" {
		parsedPageSize, err := strconv.Atoi(pageSizeRaw)
		if err != nil || parsedPageSize < 1 {
			return 0, 0, fmt.Errorf("invalid pageSize")
		}

		if parsedPageSize > maxRestaurantListDetailPageSize {
			pageSize = maxRestaurantListDetailPageSize
		} else {
			pageSize = parsedPageSize
		}
	}

	return page, pageSize, nil
}

func getRestaurantListVisitedRestaurantsPageResponse(
	app core.App,
	userID string,
	listID string,
	page int,
	pageSize int,
	search string,
) (restaurantListVisitedRestaurantsPageResponse, error) {
	response := restaurantListVisitedRestaurantsPageResponse{
		Items:    []restaurantListVisitedRestaurantResponse{},
		Page:     page,
		PageSize: pageSize,
	}

	listRecord, err := app.FindRecordById("restaurant_lists", listID)
	if errors.Is(err, sql.ErrNoRows) {
		return response, errRestaurantListDetailNotFound
	}
	if err != nil {
		return response, err
	}
	if strings.TrimSpace(listRecord.GetString("user")) != userID {
		return response, errRestaurantListDetailNotFound
	}

	trimmedSearch := strings.TrimSpace(search)
	totalItems, err := countRestaurantListVisitedRestaurants(app, userID, trimmedSearch)
	if err != nil {
		return response, err
	}

	effectivePageSize := pageSize
	if effectivePageSize <= 0 {
		effectivePageSize = totalItems
		if effectivePageSize < 1 {
			effectivePageSize = 1
		}
	}

	totalPages := 0
	if totalItems > 0 {
		totalPages = (totalItems + effectivePageSize - 1) / effectivePageSize
	}
	response.TotalItems = totalItems
	response.TotalPages = totalPages
	response.HasNextPage = totalPages > 0 && page < totalPages
	response.PageSize = effectivePageSize

	if totalItems == 0 {
		return response, nil
	}

	restaurantRows, err := listRestaurantListVisitedRestaurantCandidateRows(app, userID, page, effectivePageSize, trimmedSearch)
	if err != nil {
		return response, err
	}
	if len(restaurantRows) == 0 {
		return response, nil
	}

	restaurantIDs := make([]string, 0, len(restaurantRows))
	itemsByRestaurantID := make(map[string]*restaurantListVisitedRestaurantResponse, len(restaurantRows))
	linkedFoodItemIDSets := make(map[string]map[string]struct{}, len(restaurantRows))
	visitDateSets := make(map[string]map[string]struct{}, len(restaurantRows))
	foodItemSets := make(map[string]map[string]struct{}, len(restaurantRows))

	for _, row := range restaurantRows {
		restaurantIDs = append(restaurantIDs, row.RestaurantID)
		itemsByRestaurantID[row.RestaurantID] = &restaurantListVisitedRestaurantResponse{
			ID:                row.RestaurantID,
			Name:              defaultString(strings.TrimSpace(row.Name), "Unknown restaurant"),
			Location:          strings.TrimSpace(row.Location),
			CuisineType:       strings.TrimSpace(row.CuisineType),
			Visibility:        normalizeRestaurantVisibilityValue(row.Visibility),
			VisitDates:        []string{},
			FoodItems:         []restaurantListVisitedRestaurantCandidateFoodItemResponse{},
			LinkedFoodItemIDs: []string{},
		}
		linkedFoodItemIDSets[row.RestaurantID] = map[string]struct{}{}
		visitDateSets[row.RestaurantID] = map[string]struct{}{}
		foodItemSets[row.RestaurantID] = map[string]struct{}{}
	}

	foodItemRows, err := listRestaurantListVisitedRestaurantFoodItemRows(app, userID, restaurantIDs)
	if err != nil {
		return response, err
	}
	for _, row := range foodItemRows {
		item := itemsByRestaurantID[row.RestaurantID]
		if item == nil {
			continue
		}

		if _, exists := visitDateSets[row.RestaurantID][row.VisitAt]; row.VisitAt != "" && !exists {
			visitDateSets[row.RestaurantID][row.VisitAt] = struct{}{}
			item.VisitDates = append(item.VisitDates, row.VisitAt)
		}

		if strings.TrimSpace(row.FoodItemID) == "" {
			continue
		}
		if _, exists := foodItemSets[row.RestaurantID][row.FoodItemID]; exists {
			continue
		}

		var photoPreview *restaurantListDetailPhotoPreviewReferenceResponse
		photoPreviewID := strings.TrimSpace(row.PhotoPreviewID.String)
		photoPreviewPhoto := strings.TrimSpace(row.PhotoPreviewPhoto.String)
		if photoPreviewID != "" && photoPreviewPhoto != "" {
			photoPreview = &restaurantListDetailPhotoPreviewReferenceResponse{
				ID:    photoPreviewID,
				Photo: photoPreviewPhoto,
			}
		}

		foodItemSets[row.RestaurantID][row.FoodItemID] = struct{}{}
		item.FoodItems = append(item.FoodItems, restaurantListVisitedRestaurantCandidateFoodItemResponse{
			ID:           row.FoodItemID,
			Name:         defaultString(strings.TrimSpace(row.FoodItemName), "Unknown item"),
			Rating:       row.FoodItemRating,
			Notes:        strings.TrimSpace(row.FoodItemNotes),
			VisitedAt:    row.VisitAt,
			PhotoPreview: photoPreview,
			PhotoCount:   row.PhotoCount,
		})
		item.ItemCount += 1
	}

	listItemRecords, err := listRestaurantListAnnotationRecords(app, listID, restaurantIDs)
	if err != nil {
		return response, err
	}
	for _, listItem := range listItemRecords {
		restaurantID := strings.TrimSpace(listItem.GetString("restaurant"))
		item := itemsByRestaurantID[restaurantID]
		if item == nil {
			continue
		}

		item.AlreadyInList = true
		if item.ExistingNote == "" {
			item.ExistingNote = strings.TrimSpace(listItem.GetString("note"))
		}

		item.LinkedFoodItemIDs = appendUniqueTrimmedID(
			item.LinkedFoodItemIDs,
			linkedFoodItemIDSets[restaurantID],
			listItem.GetString("foodItem"),
		)
		item.LinkedFoodItemIDs = appendUniqueTrimmedID(
			item.LinkedFoodItemIDs,
			linkedFoodItemIDSets[restaurantID],
			listItem.GetString("userFoodItem"),
		)
		for _, recommendedItemID := range listItem.GetStringSlice("recommendedItems") {
			item.LinkedFoodItemIDs = appendUniqueTrimmedID(
				item.LinkedFoodItemIDs,
				linkedFoodItemIDSets[restaurantID],
				recommendedItemID,
			)
		}
	}

	response.Items = make([]restaurantListVisitedRestaurantResponse, 0, len(restaurantIDs))
	for _, restaurantID := range restaurantIDs {
		item := itemsByRestaurantID[restaurantID]
		if item == nil {
			continue
		}
		response.Items = append(response.Items, *item)
	}

	return response, nil
}

func getRestaurantListCandidateRestaurantsResponse(
	app core.App,
	userID string,
	listID string,
	page int,
	pageSize int,
	search string,
) (restaurantListCandidateRestaurantsResponse, error) {
	response := restaurantListCandidateRestaurantsResponse{
		Items:    []restaurantListVisitedRestaurantCandidateResponse{},
		Page:     page,
		PageSize: pageSize,
	}

	listRecord, err := app.FindRecordById("restaurant_lists", listID)
	if errors.Is(err, sql.ErrNoRows) {
		return response, errRestaurantListDetailNotFound
	}
	if err != nil {
		return response, err
	}
	if strings.TrimSpace(listRecord.GetString("user")) != userID {
		return response, errRestaurantListDetailNotFound
	}

	trimmedSearch := strings.TrimSpace(search)
	totalItems, err := countRestaurantListVisitedRestaurants(app, userID, trimmedSearch)
	if err != nil {
		return response, err
	}

	response.List = buildRestaurantListDetailListResponse(listRecord)
	response.TotalItems = totalItems
	response.TotalPages = (totalItems + pageSize - 1) / pageSize
	response.HasNextPage = response.TotalPages > 0 && page < response.TotalPages
	if totalItems == 0 {
		return response, nil
	}

	restaurantRows, err := listRestaurantListVisitedRestaurantCandidateRows(
		app,
		userID,
		page,
		pageSize,
		trimmedSearch,
	)
	if err != nil {
		return response, err
	}

	restaurantIDs := make([]string, 0, len(restaurantRows))
	itemsByRestaurantID := make(map[string]*restaurantListVisitedRestaurantCandidateResponse, len(restaurantRows))
	for _, row := range restaurantRows {
		restaurantIDs = append(restaurantIDs, row.RestaurantID)
		itemsByRestaurantID[row.RestaurantID] = &restaurantListVisitedRestaurantCandidateResponse{
			ID:              row.RestaurantID,
			Name:            defaultString(strings.TrimSpace(row.Name), "Unknown restaurant"),
			Location:        strings.TrimSpace(row.Location),
			CuisineType:     strings.TrimSpace(row.CuisineType),
			Visibility:      normalizeRestaurantVisibilityValue(row.Visibility),
			ItemCount:       row.ItemCount,
			LatestVisitDate: strings.TrimSpace(row.LatestVisitAt),
		}
	}

	listItemRecords, err := listRestaurantListAnnotationRecords(app, listID, restaurantIDs)
	if err != nil {
		return response, err
	}
	for _, listItem := range listItemRecords {
		restaurantID := strings.TrimSpace(listItem.GetString("restaurant"))
		item := itemsByRestaurantID[restaurantID]
		if item == nil {
			continue
		}

		item.AlreadyInList = true
		if item.ExistingNote == "" {
			item.ExistingNote = strings.TrimSpace(listItem.GetString("note"))
		}
	}

	linkedItemCounts, err := countRestaurantListLinkedCandidateFoodItems(
		app,
		userID,
		listID,
		restaurantIDs,
	)
	if err != nil {
		return response, err
	}

	response.Items = make([]restaurantListVisitedRestaurantCandidateResponse, 0, len(restaurantRows))
	for _, restaurantID := range restaurantIDs {
		item := itemsByRestaurantID[restaurantID]
		if item == nil {
			continue
		}
		item.LinkedItemCount = linkedItemCounts[restaurantID]
		response.Items = append(response.Items, *item)
	}

	return response, nil
}

func getRestaurantListVisitedRestaurantFoodItemsPageResponse(
	app core.App,
	userID string,
	listID string,
	restaurantID string,
	page int,
	pageSize int,
) (restaurantListVisitedRestaurantFoodItemsPageResponse, error) {
	response := restaurantListVisitedRestaurantFoodItemsPageResponse{
		Items:    []restaurantListVisitedRestaurantCandidateFoodItemResponse{},
		Page:     page,
		PageSize: pageSize,
	}

	listRecord, err := app.FindRecordById("restaurant_lists", listID)
	if errors.Is(err, sql.ErrNoRows) {
		return response, errRestaurantListDetailNotFound
	}
	if err != nil {
		return response, err
	}
	if strings.TrimSpace(listRecord.GetString("user")) != userID {
		return response, errRestaurantListDetailNotFound
	}

	totalItems, err := countRestaurantListVisitedRestaurantFoodItems(app, userID, restaurantID)
	if err != nil {
		return response, err
	}
	response.TotalItems = totalItems
	response.TotalPages = (totalItems + pageSize - 1) / pageSize
	response.HasNextPage = response.TotalPages > 0 && page < response.TotalPages
	if totalItems == 0 {
		return response, nil
	}

	rows, err := listRestaurantListVisitedRestaurantFoodItemPageRows(app, userID, restaurantID, page, pageSize)
	if err != nil {
		return response, err
	}

	listItemRecords, err := listRestaurantListAnnotationRecords(app, listID, []string{restaurantID})
	if err != nil {
		return response, err
	}
	linkedFoodItemIDs := map[string]struct{}{}
	for _, listItem := range listItemRecords {
		for _, foodItemID := range append(
			[]string{listItem.GetString("foodItem"), listItem.GetString("userFoodItem")},
			listItem.GetStringSlice("recommendedItems")...,
		) {
			if trimmedID := strings.TrimSpace(foodItemID); trimmedID != "" {
				linkedFoodItemIDs[trimmedID] = struct{}{}
			}
		}
	}

	response.Items = make([]restaurantListVisitedRestaurantCandidateFoodItemResponse, 0, len(rows))
	for _, row := range rows {
		var photoPreview *restaurantListDetailPhotoPreviewReferenceResponse
		photoPreviewID := strings.TrimSpace(row.PhotoPreviewID.String)
		photoPreviewPhoto := strings.TrimSpace(row.PhotoPreviewPhoto.String)
		if photoPreviewID != "" && photoPreviewPhoto != "" {
			photoPreview = &restaurantListDetailPhotoPreviewReferenceResponse{
				ID:    photoPreviewID,
				Photo: photoPreviewPhoto,
			}
		}

		_, alreadyAdded := linkedFoodItemIDs[row.FoodItemID]
		response.Items = append(response.Items, restaurantListVisitedRestaurantCandidateFoodItemResponse{
			ID:           row.FoodItemID,
			Name:         defaultString(strings.TrimSpace(row.FoodItemName), "Unknown item"),
			Rating:       row.FoodItemRating,
			Notes:        strings.TrimSpace(row.FoodItemNotes),
			VisitedAt:    row.VisitAt,
			PhotoPreview: photoPreview,
			PhotoCount:   row.PhotoCount,
			AlreadyAdded: alreadyAdded,
		})
	}

	return response, nil
}

func countRestaurantListVisitedRestaurants(app core.App, userID string, search string) (int, error) {
	row := struct {
		Count int `db:"count"`
	}{}

	searchClause, params := buildRestaurantListVisitedRestaurantSearchClause(userID, search)
	query := `
		SELECT COUNT(*) AS [[count]]
		FROM (
			SELECT visits.restaurant
			FROM visits
			LEFT JOIN restaurants ON restaurants.id = visits.restaurant
			WHERE visits.user = {:userId}
				AND TRIM(COALESCE(visits.restaurant, '')) != ''
				AND ` + ownerAccessibleVisitModerationCondition + `
				` + searchClause + `
			GROUP BY visits.restaurant
		) AS candidate_restaurants
	`

	err := app.DB().NewQuery(query).
		Bind(params).
		One(&row)
	if err != nil {
		return 0, err
	}

	return row.Count, nil
}

func listRestaurantListVisitedRestaurantCandidateRows(
	app core.App,
	userID string,
	page int,
	pageSize int,
	search string,
) ([]restaurantListVisitedRestaurantCandidateRow, error) {
	offset := (page - 1) * pageSize
	searchClause, params := buildRestaurantListVisitedRestaurantSearchClause(userID, search)
	params["limit"] = pageSize
	params["offset"] = offset

	rows := []restaurantListVisitedRestaurantCandidateRow{}
	query := `
		WITH candidate_restaurants AS (
			SELECT
				visits.restaurant AS restaurantId,
				MAX(COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created)) AS [[latestVisitAt]],
				COUNT(DISTINCT food_items.id) AS [[itemCount]]
			FROM visits
			LEFT JOIN restaurants ON restaurants.id = visits.restaurant
			LEFT JOIN food_items
				ON food_items.visit = visits.id
				AND ` + visitItemSQL("food_items") + `
				AND COALESCE(food_items.moderationStatus, '') IN ('', 'active', 'reviewed', 'under_review')
			WHERE visits.user = {:userId}
				AND TRIM(COALESCE(visits.restaurant, '')) != ''
				AND ` + ownerAccessibleVisitModerationCondition + `
				` + searchClause + `
			GROUP BY visits.restaurant
		)
		SELECT
			candidate_restaurants.restaurantId AS [[restaurantId]],
			restaurants.name AS [[name]],
			restaurants.location AS [[location]],
			restaurants.cuisineType AS [[cuisineType]],
			restaurants.visibility AS [[visibility]],
			candidate_restaurants.latestVisitAt AS [[latestVisitAt]],
			candidate_restaurants.itemCount AS [[itemCount]]
		FROM candidate_restaurants
		LEFT JOIN restaurants ON restaurants.id = candidate_restaurants.restaurantId
		ORDER BY candidate_restaurants.latestVisitAt DESC, candidate_restaurants.restaurantId DESC
		LIMIT {:limit}
		OFFSET {:offset}
	`

	err := app.DB().NewQuery(query).
		Bind(params).
		All(&rows)
	if err != nil {
		return nil, err
	}

	return rows, nil
}

func listRestaurantListVisitedRestaurantFoodItemRows(
	app core.App,
	userID string,
	restaurantIDs []string,
) ([]restaurantListVisitedRestaurantCandidateFoodItemRow, error) {
	filter, params := buildSQLInFilter("visits.restaurant", "restaurantId", restaurantIDs)
	if filter == "" {
		return []restaurantListVisitedRestaurantCandidateFoodItemRow{}, nil
	}
	params["userId"] = userID

	rows := []restaurantListVisitedRestaurantCandidateFoodItemRow{}
	query := `
		SELECT
			visits.restaurant AS [[restaurantId]],
			COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created) AS [[visitAt]],
			food_items.id AS [[foodItemId]],
			food_items.name AS [[foodItemName]],
			food_items.rating AS [[foodItemRating]],
			food_items.notes AS [[foodItemNotes]],
			(
				SELECT visit_photos.id
				FROM visit_photos
				WHERE visit_photos.food_item = food_items.id
					AND TRIM(COALESCE(visit_photos.user, '')) = {:userId}
					AND COALESCE(visit_photos.moderationStatus, '') IN ('', 'active', 'reviewed', 'under_review')
				ORDER BY
					COALESCE(NULLIF(TRIM(visit_photos.created), ''), visit_photos.updated) DESC,
					visit_photos.id DESC
				LIMIT 1
			) AS [[photoPreviewId]],
			(
				SELECT visit_photos.photo
				FROM visit_photos
				WHERE visit_photos.food_item = food_items.id
					AND TRIM(COALESCE(visit_photos.user, '')) = {:userId}
					AND COALESCE(visit_photos.moderationStatus, '') IN ('', 'active', 'reviewed', 'under_review')
				ORDER BY
					COALESCE(NULLIF(TRIM(visit_photos.created), ''), visit_photos.updated) DESC,
					visit_photos.id DESC
				LIMIT 1
			) AS [[photoPreviewPhoto]],
			(
				SELECT COUNT(*)
				FROM visit_photos
				WHERE visit_photos.food_item = food_items.id
					AND TRIM(COALESCE(visit_photos.user, '')) = {:userId}
					AND COALESCE(visit_photos.moderationStatus, '') IN ('', 'active', 'reviewed', 'under_review')
			) AS [[photoCount]]
		FROM visits
		LEFT JOIN food_items
			ON food_items.visit = visits.id
			AND ` + visitItemSQL("food_items") + `
			AND COALESCE(food_items.moderationStatus, '') IN ('', 'active', 'reviewed', 'under_review')
		WHERE visits.user = {:userId}
			AND ` + ownerAccessibleVisitModerationCondition + `
			AND ` + filter + `
		ORDER BY
			COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created) DESC,
			food_items.created DESC,
			food_items.id DESC
	`

	err := app.DB().NewQuery(query).
		Bind(params).
		All(&rows)
	if err != nil {
		return nil, err
	}

	return rows, nil
}

func countRestaurantListVisitedRestaurantFoodItems(
	app core.App,
	userID string,
	restaurantID string,
) (int, error) {
	row := struct {
		Count int `db:"count"`
	}{}
	err := app.DB().NewQuery(`
		SELECT COUNT(DISTINCT food_items.id) AS [[count]]
		FROM visits
		INNER JOIN food_items
			ON food_items.visit = visits.id
			AND ` + visitItemSQL("food_items") + `
			AND COALESCE(food_items.moderationStatus, '') IN ('', 'active', 'reviewed', 'under_review')
		WHERE visits.user = {:userId}
			AND visits.restaurant = {:restaurantId}
			AND ` + ownerAccessibleVisitModerationCondition + `
	`).Bind(dbx.Params{
		"restaurantId": restaurantID,
		"userId":       userID,
	}).One(&row)
	if err != nil {
		return 0, err
	}

	return row.Count, nil
}

func countRestaurantListLinkedCandidateFoodItems(
	app core.App,
	userID string,
	listID string,
	restaurantIDs []string,
) (map[string]int, error) {
	result := map[string]int{}
	filter, params := buildSQLInFilter("visits.restaurant", "restaurantId", restaurantIDs)
	if filter == "" {
		return result, nil
	}
	params["listId"] = listID
	params["userId"] = userID

	rows := []struct {
		RestaurantID    string `db:"restaurantId"`
		LinkedItemCount int    `db:"linkedItemCount"`
	}{}
	err := app.DB().NewQuery(`
		WITH eligible_food_items AS (
			SELECT DISTINCT
				visits.restaurant AS [[restaurantId]],
				food_items.id AS [[foodItemId]]
			FROM visits
			INNER JOIN food_items
				ON food_items.visit = visits.id
				AND ` + visitItemSQL("food_items") + `
				AND COALESCE(food_items.moderationStatus, '') IN ('', 'active', 'reviewed', 'under_review')
			WHERE visits.user = {:userId}
				AND ` + ownerAccessibleVisitModerationCondition + `
				AND ` + filter + `
		)
		SELECT
			eligible_food_items.restaurantId AS [[restaurantId]],
			COUNT(DISTINCT eligible_food_items.foodItemId) AS [[linkedItemCount]]
		FROM eligible_food_items
		INNER JOIN list_items
			ON list_items.list = {:listId}
			AND list_items.restaurant = eligible_food_items.restaurantId
			AND (
				list_items.foodItem = eligible_food_items.foodItemId
				OR list_items.userFoodItem = eligible_food_items.foodItemId
				OR EXISTS (
					SELECT 1
					FROM json_each(
						CASE
							WHEN json_valid(list_items.recommendedItems) THEN list_items.recommendedItems
							ELSE '[]'
						END
					) recommended_item
					WHERE recommended_item.value = eligible_food_items.foodItemId
				)
			)
		GROUP BY eligible_food_items.restaurantId
	`).Bind(params).All(&rows)
	if err != nil {
		return nil, err
	}

	for _, row := range rows {
		result[strings.TrimSpace(row.RestaurantID)] = row.LinkedItemCount
	}

	return result, nil
}

func listRestaurantListVisitedRestaurantFoodItemPageRows(
	app core.App,
	userID string,
	restaurantID string,
	page int,
	pageSize int,
) ([]restaurantListVisitedRestaurantCandidateFoodItemRow, error) {
	rows := []restaurantListVisitedRestaurantCandidateFoodItemRow{}
	err := app.DB().NewQuery(`
		WITH paged_food_items AS (
			SELECT
				visits.restaurant AS [[restaurantId]],
				COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created) AS [[visitAt]],
				food_items.id AS [[foodItemId]],
				food_items.name AS [[foodItemName]],
				food_items.rating AS [[foodItemRating]],
				food_items.notes AS [[foodItemNotes]],
				food_items.created AS [[foodItemCreated]]
			FROM visits
			INNER JOIN food_items
				ON food_items.visit = visits.id
				AND ` + visitItemSQL("food_items") + `
				AND COALESCE(food_items.moderationStatus, '') IN ('', 'active', 'reviewed', 'under_review')
			WHERE visits.user = {:userId}
				AND visits.restaurant = {:restaurantId}
				AND ` + ownerAccessibleVisitModerationCondition + `
			ORDER BY
				COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created) DESC,
				food_items.created DESC,
				food_items.id DESC
			LIMIT {:limit}
			OFFSET {:offset}
		), ranked_photos AS (
			SELECT
				visit_photos.food_item AS [[foodItemId]],
				visit_photos.id AS [[photoPreviewId]],
				visit_photos.photo AS [[photoPreviewPhoto]],
				COUNT(*) OVER (PARTITION BY visit_photos.food_item) AS [[photoCount]],
				ROW_NUMBER() OVER (
					PARTITION BY visit_photos.food_item
					ORDER BY
						COALESCE(NULLIF(TRIM(visit_photos.created), ''), visit_photos.updated) DESC,
						visit_photos.id DESC
				) AS [[photoRank]]
			FROM visit_photos
			INNER JOIN paged_food_items ON paged_food_items.foodItemId = visit_photos.food_item
			WHERE TRIM(COALESCE(visit_photos.user, '')) = {:userId}
				AND COALESCE(visit_photos.moderationStatus, '') IN ('', 'active', 'reviewed', 'under_review')
		)
		SELECT
			paged_food_items.restaurantId AS [[restaurantId]],
			paged_food_items.visitAt AS [[visitAt]],
			paged_food_items.foodItemId AS [[foodItemId]],
			paged_food_items.foodItemName AS [[foodItemName]],
			paged_food_items.foodItemRating AS [[foodItemRating]],
			paged_food_items.foodItemNotes AS [[foodItemNotes]],
			ranked_photos.photoPreviewId AS [[photoPreviewId]],
			ranked_photos.photoPreviewPhoto AS [[photoPreviewPhoto]],
			COALESCE(ranked_photos.photoCount, 0) AS [[photoCount]]
		FROM paged_food_items
		LEFT JOIN ranked_photos
			ON ranked_photos.foodItemId = paged_food_items.foodItemId
			AND ranked_photos.photoRank = 1
		ORDER BY
			paged_food_items.visitAt DESC,
			paged_food_items.foodItemCreated DESC,
			paged_food_items.foodItemId DESC
	`).Bind(dbx.Params{
		"limit":        pageSize,
		"offset":       (page - 1) * pageSize,
		"restaurantId": restaurantID,
		"userId":       userID,
	}).All(&rows)
	if err != nil {
		return nil, err
	}

	return rows, nil
}

func listRestaurantListAnnotationRecords(
	app core.App,
	listID string,
	restaurantIDs []string,
) ([]*core.Record, error) {
	params := dbx.Params{
		"listId": listID,
	}
	clauses := make([]string, 0, len(restaurantIDs))
	seen := map[string]struct{}{}

	for index, restaurantID := range restaurantIDs {
		trimmedRestaurantID := strings.TrimSpace(restaurantID)
		if trimmedRestaurantID == "" {
			continue
		}
		if _, exists := seen[trimmedRestaurantID]; exists {
			continue
		}

		seen[trimmedRestaurantID] = struct{}{}
		paramKey := fmt.Sprintf("restaurantId%d", index)
		params[paramKey] = trimmedRestaurantID
		clauses = append(clauses, fmt.Sprintf("restaurant = {:%s}", paramKey))
	}

	if len(clauses) == 0 {
		return []*core.Record{}, nil
	}

	return app.FindRecordsByFilter(
		"list_items",
		fmt.Sprintf(`list = {:listId} && (%s)`, strings.Join(clauses, " || ")),
		"position,created",
		2000,
		0,
		params,
	)
}

func listOwnedRestaurantLists(app core.App, userID string) ([]*core.Record, error) {
	return app.FindRecordsByFilter(
		"restaurant_lists",
		"user = {:userId}",
		"-isDefault,-updated",
		2000,
		0,
		dbx.Params{"userId": userID},
	)
}

func buildRestaurantListVisitedRestaurantSearchClause(userID string, search string) (string, dbx.Params) {
	params := dbx.Params{
		"userId": userID,
	}

	trimmedSearch := strings.ToLower(strings.TrimSpace(search))
	if trimmedSearch == "" {
		return "", params
	}

	params["normalizedSearch"] = trimmedSearch
	return `
			AND (
				INSTR(LOWER(TRIM(COALESCE(restaurants.name, ''))), {:normalizedSearch}) > 0
				OR INSTR(LOWER(TRIM(COALESCE(restaurants.location, ''))), {:normalizedSearch}) > 0
				OR INSTR(LOWER(TRIM(COALESCE(restaurants.cuisineType, ''))), {:normalizedSearch}) > 0
				OR EXISTS (
					SELECT 1
					FROM food_items search_food_items
					WHERE search_food_items.visit = visits.id
						AND ` + visitItemSQL("search_food_items") + `
						AND COALESCE(search_food_items.moderationStatus, '') IN ('', 'active', 'reviewed', 'under_review')
						AND (
							INSTR(LOWER(TRIM(COALESCE(search_food_items.name, ''))), {:normalizedSearch}) > 0
							OR INSTR(LOWER(TRIM(COALESCE(search_food_items.notes, ''))), {:normalizedSearch}) > 0
						)
				)
			)
	`, params
}

func buildSQLInFilter(fieldName string, paramPrefix string, values []string) (string, dbx.Params) {
	params := dbx.Params{}
	clauses := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	index := 0

	for _, value := range values {
		trimmedValue := strings.TrimSpace(value)
		if trimmedValue == "" {
			continue
		}
		if _, exists := seen[trimmedValue]; exists {
			continue
		}

		seen[trimmedValue] = struct{}{}
		paramKey := fmt.Sprintf("%s%d", paramPrefix, index)
		params[paramKey] = trimmedValue
		clauses = append(clauses, fmt.Sprintf("%s = {:%s}", fieldName, paramKey))
		index += 1
	}

	if len(clauses) == 0 {
		return "", nil
	}

	if len(clauses) == 1 {
		return clauses[0], params
	}

	return fmt.Sprintf("(%s)", strings.Join(clauses, " OR ")), params
}

func countRestaurantListDetailItems(app core.App, listID string) (int, error) {
	row := struct {
		Count int `db:"count"`
	}{}

	err := app.DB().NewQuery(`
		SELECT COUNT(*) AS [[count]]
		FROM list_items
		WHERE list = {:listId}
			AND COALESCE(moderationStatus, '') IN ('', 'active', 'reviewed')
	`).
		Bind(dbx.Params{"listId": listID}).
		One(&row)
	if err != nil {
		return 0, err
	}

	return row.Count, nil
}

func listRestaurantListDetailItemRecords(
	app core.App,
	listID string,
	page int,
	pageSize int,
) ([]*core.Record, error) {
	offset := (page - 1) * pageSize

	return app.FindRecordsByFilter(
		"list_items",
		`list = {:listId} && (moderationStatus = '' || moderationStatus = 'active' || moderationStatus = 'reviewed')`,
		"position,-created",
		pageSize,
		offset,
		dbx.Params{"listId": listID},
	)
}

func buildWantToTryFriendOverlapCounts(
	app core.App,
	userID string,
	restaurantIDs []string,
) (map[string]int, error) {
	friendMatchesByRestaurantID, err := buildWantToTryFriendMatches(app, userID, restaurantIDs)
	if err != nil {
		return nil, err
	}

	return buildFriendOverlapCountsFromMatches(friendMatchesByRestaurantID), nil
}

func buildFriendOverlapCountsFromMatches(
	friendMatchesByRestaurantID map[string][]restaurantListDetailFriendMatchResponse,
) map[string]int {
	result := map[string]int{}
	for restaurantID, matches := range friendMatchesByRestaurantID {
		seenFriendIDs := map[string]struct{}{}
		for _, match := range matches {
			friendID := strings.TrimSpace(match.FriendID)
			if friendID == "" {
				continue
			}
			seenFriendIDs[friendID] = struct{}{}
		}
		if len(seenFriendIDs) > 0 {
			result[restaurantID] = len(seenFriendIDs)
		}
	}
	return result
}

func buildWantToTryFriendMatches(
	app core.App,
	userID string,
	restaurantIDs []string,
) (map[string][]restaurantListDetailFriendMatchResponse, error) {
	result := map[string][]restaurantListDetailFriendMatchResponse{}
	restaurantClauses := make([]string, 0, len(restaurantIDs))
	params := dbx.Params{"userId": userID}
	seen := map[string]struct{}{}

	for index, restaurantID := range restaurantIDs {
		trimmedID := strings.TrimSpace(restaurantID)
		if trimmedID == "" {
			continue
		}
		if _, exists := seen[trimmedID]; exists {
			continue
		}

		seen[trimmedID] = struct{}{}
		paramKey := fmt.Sprintf("restaurantId%d", index)
		params[paramKey] = trimmedID
		restaurantClauses = append(restaurantClauses, fmt.Sprintf("li.restaurant = {:%s}", paramKey))
	}

	if len(restaurantClauses) == 0 {
		return result, nil
	}

	rows := []struct {
		RestaurantID          string  `db:"restaurantId"`
		FriendID              string  `db:"friendId"`
		FriendName            string  `db:"friendName"`
		FriendEmail           string  `db:"friendEmail"`
		FoodItemID            string  `db:"foodItemId"`
		FoodItemName          string  `db:"foodItemName"`
		FoodItemRating        float64 `db:"foodItemRating"`
		UserFoodItemID        string  `db:"userFoodItemId"`
		UserFoodItemName      string  `db:"userFoodItemName"`
		UserFoodItemRating    float64 `db:"userFoodItemRating"`
		MenuItemID            string  `db:"menuItemId"`
		MenuItemName          string  `db:"menuItemName"`
		RecommendedItemIDsRaw string  `db:"recommendedItemIdsRaw"`
		SavedAt               string  `db:"savedAt"`
	}{}

	err := app.DB().NewQuery(fmt.Sprintf(`
		SELECT
			li.restaurant AS [[restaurantId]],
			rl.user AS [[friendId]],
			users.name AS [[friendName]],
			users.email AS [[friendEmail]],
			COALESCE(li.foodItem, '') AS [[foodItemId]],
			COALESCE(food_items.name, '') AS [[foodItemName]],
			COALESCE(food_items.rating, 0) AS [[foodItemRating]],
			COALESCE(li.userFoodItem, '') AS [[userFoodItemId]],
			COALESCE(user_food_items.name, '') AS [[userFoodItemName]],
			COALESCE(user_food_items.rating, 0) AS [[userFoodItemRating]],
			COALESCE(li.menuItem, '') AS [[menuItemId]],
			COALESCE(menu_items.name, '') AS [[menuItemName]],
			COALESCE(li.recommendedItems, '') AS [[recommendedItemIdsRaw]],
			li.created AS [[savedAt]]
		FROM list_items li
		INNER JOIN restaurant_lists rl ON rl.id = li.list
		INNER JOIN users ON users.id = rl.user
		INNER JOIN friendships f
			ON f.status = 'accepted'
			AND (
				(f.user = {:userId} AND f.friend = rl.user) OR
				(f.friend = {:userId} AND f.user = rl.user)
			)
		LEFT JOIN food_items ON food_items.id = li.foodItem
		LEFT JOIN food_items user_food_items ON user_food_items.id = li.userFoodItem
		LEFT JOIN menu_items ON menu_items.id = li.menuItem
		WHERE rl.isDefault = true
			AND rl.user != {:userId}
			AND COALESCE(rl.moderationStatus, '') IN ('', 'active', 'reviewed')
			AND COALESCE(li.moderationStatus, '') IN ('', 'active', 'reviewed')
			AND (%s)
		ORDER BY li.restaurant ASC, li.created DESC, li.id DESC
	`, strings.Join(restaurantClauses, " OR "))).
		Bind(params).
		All(&rows)
	if err != nil {
		return result, err
	}

	for _, row := range rows {
		restaurantID := strings.TrimSpace(row.RestaurantID)
		friendID := strings.TrimSpace(row.FriendID)
		if restaurantID == "" || friendID == "" {
			continue
		}

		friendName := strings.TrimSpace(row.FriendName)
		if friendName == "" {
			email := strings.TrimSpace(row.FriendEmail)
			if email != "" {
				friendName = strings.SplitN(email, "@", 2)[0]
			}
		}
		if friendName == "" {
			friendName = "Friend"
		}

		match := restaurantListDetailFriendMatchResponse{
			FriendID:   friendID,
			FriendName: friendName,
			Kind:       "restaurant",
			SavedAt:    strings.TrimSpace(row.SavedAt),
		}

		if itemName := strings.TrimSpace(row.FoodItemName); strings.TrimSpace(row.FoodItemID) != "" && itemName != "" {
			match.Kind = "menu_item"
			match.ItemName = itemName
			match.Rating = row.FoodItemRating
		} else if itemName := strings.TrimSpace(row.UserFoodItemName); strings.TrimSpace(row.UserFoodItemID) != "" && itemName != "" {
			match.Kind = "menu_item"
			match.ItemName = itemName
			match.Rating = row.UserFoodItemRating
		} else if itemName := strings.TrimSpace(row.MenuItemName); strings.TrimSpace(row.MenuItemID) != "" && itemName != "" {
			match.Kind = "menu_item"
			match.ItemName = itemName
		} else if strings.TrimSpace(row.RecommendedItemIDsRaw) != "" && strings.TrimSpace(row.RecommendedItemIDsRaw) != "[]" {
			match.Kind = "menu_item"
			match.ItemName = "recommended items"
		}

		result[restaurantID] = append(result[restaurantID], match)
	}

	return result, nil
}

func isRestaurantOnlyListItem(record *core.Record) bool {
	if record == nil {
		return false
	}

	return strings.TrimSpace(record.GetString("foodItem")) == "" &&
		strings.TrimSpace(record.GetString("userFoodItem")) == "" &&
		strings.TrimSpace(record.GetString("menuItem")) == "" &&
		len(record.GetStringSlice("recommendedItems")) == 0
}

func buildRestaurantListDetailListResponse(record *core.Record) restaurantListDetailListResponse {
	return restaurantListDetailListResponse{
		ID:              record.Id,
		Name:            strings.TrimSpace(record.GetString("name")),
		Description:     strings.TrimSpace(record.GetString("description")),
		Visibility:      normalizeRestaurantListDetailVisibility(record.GetString("visibility")),
		UserID:          strings.TrimSpace(record.GetString("user")),
		IsDefault:       record.GetBool("isDefault"),
		ShareEnabled:    record.GetBool("shareEnabled"),
		CoverImage:      strings.TrimSpace(record.GetString("coverImage")),
		RestaurantCount: record.GetInt("restaurantCount"),
		MenuItemCount:   record.GetInt("menuItemCount"),
		CreatedAt:       strings.TrimSpace(record.GetString("created")),
		UpdatedAt:       defaultString(strings.TrimSpace(record.GetString("updated")), strings.TrimSpace(record.GetString("created"))),
	}
}

func buildRestaurantListDetailBookmarkedItems(
	listItem *core.Record,
	usersByID map[string]*core.Record,
	foodItemsByID map[string]*core.Record,
	menuItemsByID map[string]*core.Record,
	visitsByID map[string]*core.Record,
) []restaurantListDetailBookmarkedItemResponse {
	userFoodItem := foodItemsByID[strings.TrimSpace(listItem.GetString("userFoodItem"))]
	sourceUserID := strings.TrimSpace(listItem.GetString("sourceUser"))
	sourceUserName := resolveHomeFeedUserName(usersByID[sourceUserID])

	primaryFoodItemID := strings.TrimSpace(listItem.GetString("foodItem"))
	if primaryFoodItem := foodItemsByID[primaryFoodItemID]; primaryFoodItem != nil {
		return []restaurantListDetailBookmarkedItemResponse{
			buildRestaurantListDetailBookmarkedItemResponse(
				listItem.Id,
				sourceUserID,
				sourceUserName,
				primaryFoodItem,
				userFoodItem,
				visitsByID,
			),
		}
	}

	menuItemID := strings.TrimSpace(listItem.GetString("menuItem"))
	if menuItem := menuItemsByID[menuItemID]; menuItem != nil {
		return []restaurantListDetailBookmarkedItemResponse{
			{
				ID:         menuItem.Id,
				ListItemID: listItem.Id,
				Name:       defaultString(strings.TrimSpace(menuItem.GetString("name")), "Unknown item"),
				Rating:     0,
				MenuItemID: menuItem.Id,
			},
		}
	}

	recommendedItems := make([]restaurantListDetailBookmarkedItemResponse, 0, len(listItem.GetStringSlice("recommendedItems")))
	for _, recommendedItemID := range listItem.GetStringSlice("recommendedItems") {
		recommendedItem := foodItemsByID[strings.TrimSpace(recommendedItemID)]
		if recommendedItem == nil {
			continue
		}

		recommendedItems = append(recommendedItems, buildRestaurantListDetailBookmarkedItemResponse(
			listItem.Id,
			sourceUserID,
			sourceUserName,
			recommendedItem,
			userFoodItem,
			visitsByID,
		))
	}

	return recommendedItems
}

func buildRestaurantListDetailBookmarkedItemResponse(
	listItemID string,
	sourceUserID string,
	sourceUserName string,
	foodItem *core.Record,
	userFoodItem *core.Record,
	visitsByID map[string]*core.Record,
) restaurantListDetailBookmarkedItemResponse {
	response := restaurantListDetailBookmarkedItemResponse{
		ID:             foodItem.Id,
		ListItemID:     listItemID,
		Name:           defaultString(strings.TrimSpace(foodItem.GetString("name")), "Unknown item"),
		Rating:         foodItem.GetFloat("rating"),
		RestaurantID:   resolveFoodItemRestaurantID(foodItem, visitsByID),
		VisitedAt:      resolveFoodItemVisitedAt(foodItem, visitsByID),
		SourceUserID:   sourceUserID,
		SourceUserName: sourceUserName,
	}

	if userFoodItem != nil {
		response.UserFoodItemID = userFoodItem.Id
		response.UserFoodItemRestaurantID = resolveFoodItemRestaurantID(userFoodItem, visitsByID)
		response.UserFoodItemName = strings.TrimSpace(userFoodItem.GetString("name"))
		response.UserFoodItemRating = userFoodItem.GetFloat("rating")
		response.UserFoodItemVisitedAt = resolveFoodItemVisitedAt(userFoodItem, visitsByID)
	}

	return response
}

func resolveFoodItemRestaurantID(foodItem *core.Record, visitsByID map[string]*core.Record) string {
	if foodItem == nil {
		return ""
	}

	visitID := strings.TrimSpace(foodItem.GetString("visit"))
	if visitID == "" {
		return ""
	}

	visitRecord := visitsByID[visitID]
	if visitRecord == nil {
		return ""
	}

	return strings.TrimSpace(visitRecord.GetString("restaurant"))
}

func buildRestaurantListBookmarkStateResponse(
	app core.App,
	userID string,
	listID string,
	targets []restaurantListBookmarkStateTargetRequest,
) (restaurantListBookmarkStateResponse, error) {
	response := restaurantListBookmarkStateResponse{
		SavedTargetsByBookmarkKey: map[string]restaurantListBookmarkStateTargetResponse{},
	}

	if len(targets) > maxRestaurantListBookmarkStateTargets {
		return response, apis.NewBadRequestError("too many bookmark targets", nil)
	}

	listRecord, err := findOwnedRestaurantListRecord(app, listID, userID)
	if err != nil {
		return response, err
	}
	if !listRecord.GetBool("isDefault") {
		return response, apis.NewBadRequestError("bookmark state can only be loaded for the default list", nil)
	}

	filter, params := buildRestaurantListBookmarkStateTargetFilter(listRecord.Id, targets)
	if filter == "" {
		return response, nil
	}

	records, err := app.FindRecordsByFilter("list_items", filter, "", maxRestaurantListBookmarkStateTargets, 0, params)
	if err != nil {
		return response, apis.NewApiError(500, "failed to load bookmark state", err)
	}

	for _, target := range normalizeRestaurantListBookmarkStateTargets(targets) {
		for _, record := range records {
			if !restaurantListBookmarkStateTargetMatchesRecord(target, record) {
				continue
			}

			response.SavedTargetsByBookmarkKey[target.BookmarkKey] = restaurantListBookmarkStateTargetResponse{
				BookmarkKey:  target.BookmarkKey,
				RestaurantID: target.RestaurantID,
				FoodItemID:   target.FoodItemID,
				MenuItemID:   target.MenuItemID,
			}
			break
		}
	}

	return response, nil
}

func normalizeRestaurantListBookmarkStateTargets(
	targets []restaurantListBookmarkStateTargetRequest,
) []restaurantListBookmarkStateTargetRequest {
	normalizedTargets := make([]restaurantListBookmarkStateTargetRequest, 0, len(targets))
	seen := map[string]struct{}{}

	for _, target := range targets {
		normalizedTarget := restaurantListBookmarkStateTargetRequest{
			BookmarkKey:  strings.TrimSpace(target.BookmarkKey),
			RestaurantID: strings.TrimSpace(target.RestaurantID),
			FoodItemID:   strings.TrimSpace(target.FoodItemID),
			MenuItemID:   strings.TrimSpace(target.MenuItemID),
		}
		if normalizedTarget.BookmarkKey == "" || normalizedTarget.RestaurantID == "" {
			continue
		}
		if normalizedTarget.FoodItemID == "" && normalizedTarget.MenuItemID == "" {
			continue
		}

		dedupeKey := normalizedTarget.BookmarkKey + "\x00" + normalizedTarget.RestaurantID + "\x00" + normalizedTarget.FoodItemID + "\x00" + normalizedTarget.MenuItemID
		if _, exists := seen[dedupeKey]; exists {
			continue
		}

		seen[dedupeKey] = struct{}{}
		normalizedTargets = append(normalizedTargets, normalizedTarget)
	}

	return normalizedTargets
}

func buildRestaurantListBookmarkStateTargetFilter(
	listID string,
	targets []restaurantListBookmarkStateTargetRequest,
) (string, dbx.Params) {
	params := dbx.Params{"listId": listID}
	clauses := make([]string, 0, len(targets))
	seen := map[string]struct{}{}

	for index, target := range normalizeRestaurantListBookmarkStateTargets(targets) {
		lookupID := target.FoodItemID
		if target.MenuItemID != "" {
			lookupID = target.MenuItemID
		}
		if _, exists := seen[lookupID]; exists {
			continue
		}

		seen[lookupID] = struct{}{}
		paramKey := fmt.Sprintf("lookupId%d", index)
		params[paramKey] = lookupID
		clauses = append(clauses, fmt.Sprintf(
			"(foodItem = {:%s} || userFoodItem = {:%s} || recommendedItems ?= {:%s} || menuItem = {:%s})",
			paramKey,
			paramKey,
			paramKey,
			paramKey,
		))
	}

	if len(clauses) == 0 {
		return "", nil
	}

	return fmt.Sprintf(`list = {:listId} && (%s)`, strings.Join(clauses, " || ")), params
}

func restaurantListBookmarkStateTargetMatchesRecord(
	target restaurantListBookmarkStateTargetRequest,
	record *core.Record,
) bool {
	if strings.TrimSpace(record.GetString("restaurant")) != target.RestaurantID {
		return false
	}

	if target.MenuItemID != "" {
		return strings.TrimSpace(record.GetString("menuItem")) == target.MenuItemID
	}

	for _, lookupID := range restaurantListDetailLookupIDsForRecord(record) {
		if lookupID == target.FoodItemID {
			return true
		}
	}

	return false
}

func buildRestaurantListDetailBookmarkState(
	app core.App,
	userID string,
	bookmarkLookupIDs []string,
) (restaurantListDetailBookmarkStateResponse, error) {
	response := restaurantListDetailBookmarkStateResponse{
		SavedListIDsByBookmarkLookupID: map[string][]string{},
	}

	filter, params := buildRestaurantListDetailBookmarkLookupFilter(userID, bookmarkLookupIDs)
	if filter == "" {
		return response, nil
	}

	records, err := app.FindRecordsByFilter("list_items", filter, "", 2000, 0, params)
	if err != nil {
		return response, err
	}

	for _, record := range records {
		listID := strings.TrimSpace(record.GetString("list"))
		if listID == "" {
			continue
		}

		for _, lookupID := range restaurantListDetailLookupIDsForRecord(record) {
			existing := response.SavedListIDsByBookmarkLookupID[lookupID]
			if slicesContainString(existing, listID) {
				continue
			}

			response.SavedListIDsByBookmarkLookupID[lookupID] = append(existing, listID)
		}
	}

	return response, nil
}

func buildRestaurantListDetailBookmarkLookupFilter(userID string, bookmarkLookupIDs []string) (string, dbx.Params) {
	params := dbx.Params{"userId": userID}
	clauses := make([]string, 0, len(bookmarkLookupIDs))
	seen := map[string]struct{}{}

	for index, lookupID := range bookmarkLookupIDs {
		trimmedID := strings.TrimSpace(lookupID)
		if trimmedID == "" {
			continue
		}
		if _, exists := seen[trimmedID]; exists {
			continue
		}

		seen[trimmedID] = struct{}{}
		paramKey := fmt.Sprintf("lookupId%d", index)
		params[paramKey] = trimmedID
		clauses = append(clauses, fmt.Sprintf(
			"(foodItem = {:%s} || userFoodItem = {:%s} || recommendedItems ?= {:%s} || menuItem = {:%s})",
			paramKey,
			paramKey,
			paramKey,
			paramKey,
		))
	}

	if len(clauses) == 0 {
		return "", nil
	}

	return fmt.Sprintf(`list.user = {:userId} && (%s)`, strings.Join(clauses, " || ")), params
}

func restaurantListDetailLookupIDsForRecord(record *core.Record) []string {
	lookupIDs := make([]string, 0, 2+len(record.GetStringSlice("recommendedItems")))
	lookupIDSet := map[string]struct{}{}

	lookupIDs = appendUniqueTrimmedID(lookupIDs, lookupIDSet, record.GetString("foodItem"))
	lookupIDs = appendUniqueTrimmedID(lookupIDs, lookupIDSet, record.GetString("userFoodItem"))
	lookupIDs = appendUniqueTrimmedID(lookupIDs, lookupIDSet, record.GetString("menuItem"))
	for _, recommendedItemID := range record.GetStringSlice("recommendedItems") {
		lookupIDs = appendUniqueTrimmedID(lookupIDs, lookupIDSet, recommendedItemID)
	}

	return lookupIDs
}

func resolveFoodItemVisitedAt(record *core.Record, visitsByID map[string]*core.Record) string {
	if record == nil {
		return ""
	}

	visitID := strings.TrimSpace(record.GetString("visit"))
	if visitID != "" {
		if visit := visitsByID[visitID]; visit != nil {
			if visitDate := strings.TrimSpace(visit.GetString("visitDate")); visitDate != "" {
				return visitDate
			}
		}
	}

	if itemDate := strings.TrimSpace(record.GetString("itemDate")); itemDate != "" {
		return itemDate
	}

	return strings.TrimSpace(record.GetString("created"))
}

func normalizeRestaurantListDetailVisibility(value string) string {
	switch strings.TrimSpace(value) {
	case "friends", "public":
		return "friends"
	default:
		return "private"
	}
}

func normalizeRestaurantVisibilityForListDetail(record *core.Record) string {
	if record == nil {
		return "private"
	}

	return normalizeRestaurantVisibilityValue(record.GetString("visibility"))
}

func normalizeRestaurantVisibilityValue(value string) string {
	switch strings.TrimSpace(value) {
	case "public":
		return "public"
	case "friends":
		return "friends"
	default:
		return "private"
	}
}

func appendUniqueTrimmedID(target []string, seen map[string]struct{}, value string) []string {
	trimmedValue := strings.TrimSpace(value)
	if trimmedValue == "" {
		return target
	}
	if _, exists := seen[trimmedValue]; exists {
		return target
	}

	seen[trimmedValue] = struct{}{}
	return append(target, trimmedValue)
}

func slicesContainString(values []string, candidate string) bool {
	for _, value := range values {
		if value == candidate {
			return true
		}
	}

	return false
}
