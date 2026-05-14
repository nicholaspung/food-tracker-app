package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const visibleVisitModerationCondition = `(visits.moderationStatus = '' OR visits.moderationStatus = 'active' OR visits.moderationStatus = 'reviewed')`
const ownerAccessibleVisitModerationCondition = `(visits.moderationStatus = '' OR visits.moderationStatus = 'active' OR visits.moderationStatus = 'reviewed' OR visits.moderationStatus = 'under_review')`
const visibleQuickTrackModerationCondition = `(food_items.moderationStatus = '' OR food_items.moderationStatus = 'active' OR food_items.moderationStatus = 'reviewed')`
const ownerAccessibleQuickTrackModerationCondition = `(food_items.moderationStatus = '' OR food_items.moderationStatus = 'active' OR food_items.moderationStatus = 'reviewed' OR food_items.moderationStatus = 'under_review')`

const defaultRecentRestaurantLimit = 12
const maxRecentRestaurantLimit = 24
const defaultRestaurantSuggestionsLimit = 50
const maxRestaurantSuggestionsLimit = 50
const defaultRestaurantSearchPageSize = 20
const maxRestaurantSearchPageSize = 50
const defaultHomeFeedPageSize = 20
const maxHomeFeedPageSize = 50
const maxHomeFeedMapPoints = 500
const defaultNotesPageSize = 20
const maxNotesPageSize = 50
const defaultVisitsPageSize = 20
const maxVisitsPageSize = 50
const usedNotesRetentionDays = 30

type noteSummaryResponse struct {
	AllCount   int `db:"allCount" json:"allCount"`
	DraftCount int `db:"draftCount" json:"draftCount"`
	UsedCount  int `db:"usedCount" json:"usedCount"`
}

type notesOverviewPhotoPreviewResponse struct {
	ID    string `json:"id"`
	Photo string `json:"photo"`
	Count int    `json:"count"`
}

type notesOverviewItemResponse struct {
	ID               string                             `json:"id"`
	Content          string                             `json:"content"`
	LocationText     string                             `json:"locationText,omitempty"`
	Status           string                             `json:"status"`
	RestaurantID     string                             `json:"restaurantId,omitempty"`
	RestaurantName   string                             `json:"restaurantName,omitempty"`
	UsedInVisitID    string                             `json:"usedInVisitId,omitempty"`
	UsedInFoodItemID string                             `json:"usedInFoodItemId,omitempty"`
	CreatedAt        string                             `json:"createdAt"`
	UpdatedAt        string                             `json:"updatedAt"`
	PhotoPreview     *notesOverviewPhotoPreviewResponse `json:"photoPreview,omitempty"`
}

type notesOverviewResponse struct {
	Items       []notesOverviewItemResponse `json:"items"`
	Summary     *noteSummaryResponse        `json:"summary,omitempty"`
	Page        int                         `json:"page"`
	PageSize    int                         `json:"pageSize"`
	TotalItems  *int                        `json:"totalItems,omitempty"`
	TotalPages  *int                        `json:"totalPages,omitempty"`
	HasNextPage bool                        `json:"hasNextPage"`
}

type noteRecordIDRow struct {
	NoteID string `db:"noteId"`
}

type noteDetailPhotoResponse struct {
	ID         string `json:"id"`
	Note       string `json:"note"`
	Photo      string `json:"photo"`
	Created    string `json:"created"`
	CapturedAt string `json:"capturedAt,omitempty"`
}

type noteDetailResponse struct {
	Note   *notesOverviewItemResponse `json:"note,omitempty"`
	Photos []noteDetailPhotoResponse  `json:"photos"`
}

type friendsSummaryResponse struct {
	FriendsCount  int `db:"friendsCount" json:"friendsCount"`
	RequestsCount int `db:"requestsCount" json:"requestsCount"`
	SentCount     int `db:"sentCount" json:"sentCount"`
}

type feedbackSummaryResponse struct {
	ActiveCount int `db:"activeCount" json:"activeCount"`
	AllCount    int `db:"allCount" json:"allCount"`
}

type billListSummaryRow struct {
	ID                           string  `db:"id"`
	Title                        string  `db:"title"`
	Status                       string  `db:"status"`
	ParticipantCount             int     `db:"participantCount"`
	PendingOtherParticipantCount int     `db:"pendingOtherParticipantCount"`
	YouOwe                       float64 `db:"youOwe"`
	YouAreOwed                   float64 `db:"youAreOwed"`
	IsCreator                    int     `db:"isCreator"`
	CreatedAt                    string  `db:"createdAt"`
	UpdatedAt                    string  `db:"updatedAt"`
}

type billListSummaryResponse struct {
	ID                           string  `json:"id"`
	Title                        string  `json:"title"`
	Status                       string  `json:"status"`
	ParticipantCount             int     `json:"participantCount"`
	PendingOtherParticipantCount int     `json:"pendingOtherParticipantCount"`
	YouOwe                       float64 `json:"youOwe"`
	YouAreOwed                   float64 `json:"youAreOwed"`
	IsCreator                    bool    `json:"isCreator"`
	CreatedAt                    string  `json:"createdAt"`
	UpdatedAt                    string  `json:"updatedAt"`
}

type restaurantVisitStatsRequest struct {
	RestaurantIDs []string `json:"restaurantIds"`
}

type restaurantVisitStatsSummary struct {
	RestaurantID   string `db:"restaurantId" json:"restaurantId"`
	UserVisitCount int    `db:"userVisitCount" json:"userVisitCount"`
	FriendCount    int    `db:"friendCount" json:"friendCount"`
}

type restaurantVisitStatsResponse struct {
	Stats []restaurantVisitStatsSummary `json:"stats"`
}

type restaurantSearchPageResponse struct {
	Items       []restaurantSearchResult `json:"items"`
	Page        int                      `json:"page"`
	PageSize    int                      `json:"pageSize"`
	TotalItems  int                      `json:"totalItems"`
	TotalPages  int                      `json:"totalPages"`
	HasNextPage bool                     `json:"hasNextPage"`
}

type menuItemSelectionSummary struct {
	ID               string `db:"id" json:"id"`
	RestaurantID     string `db:"restaurant" json:"restaurant"`
	Name             string `db:"name" json:"name"`
	Description      string `db:"description" json:"description,omitempty"`
	CreatedBy        string `db:"createdBy" json:"createdBy,omitempty"`
	Visibility       string `db:"visibility" json:"visibility,omitempty"`
	IsFromOCR        bool   `db:"isFromOCR" json:"isFromOCR,omitempty"`
	Created          string `db:"created" json:"created,omitempty"`
	Updated          string `db:"updated" json:"updated,omitempty"`
	UserEatenCount   int    `db:"userEatenCount" json:"userEatenCount,omitempty"`
	FriendEatenCount int    `db:"friendEatenCount" json:"friendEatenCount,omitempty"`
}

type recentRestaurantIDRow struct {
	RestaurantID string `db:"restaurantId"`
}

type restaurantSearchIDRow struct {
	RestaurantID string `db:"restaurantId"`
}

type restaurantSelectionSummaryRow struct {
	RestaurantID         string          `db:"restaurantId"`
	Name                 string          `db:"name"`
	Location             string          `db:"location"`
	CuisineType          string          `db:"cuisineType"`
	Visibility           string          `db:"visibility"`
	Latitude             sql.NullFloat64 `db:"latitude"`
	Longitude            sql.NullFloat64 `db:"longitude"`
	PlaceID              string          `db:"placeId"`
	IsGooglePlace        bool            `db:"isGooglePlace"`
	UserVisitCount       int             `db:"userVisitCount"`
	FriendCount          int             `db:"friendCount"`
	HasPendingMenuReview int             `db:"hasPendingMenuReview"`
}

type homeFeedEntryRow struct {
	Source    string `db:"source"`
	RecordID  string `db:"recordId"`
	EventAt   string `db:"eventAt"`
	CreatedAt string `db:"createdAt"`
}

type homeFeedCountsRow struct {
	TotalVisits       int `db:"totalVisits"`
	TotalFoodProducts int `db:"totalFoodProducts"`
}

type homeFeedMapCountsRow struct {
	TotalEntries      int `db:"totalEntries"`
	EntriesWithCoords int `db:"entriesWithCoords"`
}

type homeFeedMapEntryRow struct {
	Source    string          `db:"source"`
	RecordID  string          `db:"recordId"`
	EventAt   string          `db:"eventAt"`
	CreatedAt string          `db:"createdAt"`
	Latitude  sql.NullFloat64 `db:"latitude"`
	Longitude sql.NullFloat64 `db:"longitude"`
}

type homeFeedCursorResponse struct {
	Page int `json:"page"`
}

type homeFeedFoodProductResponse struct {
	ID               string  `json:"id"`
	RestaurantName   string  `json:"restaurantName"`
	LocationText     string  `json:"locationText,omitempty"`
	ItemCategory     string  `json:"itemCategory,omitempty"`
	ItemName         string  `json:"itemName"`
	Rating           float64 `json:"rating"`
	Notes            string  `json:"notes,omitempty"`
	UserID           string  `json:"userId,omitempty"`
	UserName         string  `json:"userName,omitempty"`
	Visibility       string  `json:"visibility,omitempty"`
	ModerationStatus string  `json:"moderationStatus,omitempty"`
	ItemDate         string  `json:"itemDate,omitempty"`
	CreatedAt        string  `json:"createdAt"`
	UpdatedAt        string  `json:"updatedAt"`
}

type homeFeedPhotoPreviewResponse struct {
	ID             string `json:"id"`
	FoodItemID     string `json:"food_item,omitempty"`
	Photo          string `json:"photo"`
	CollectionID   string `json:"collectionId,omitempty"`
	CollectionName string `json:"collectionName,omitempty"`
	Created        string `json:"created"`
}

type homeFeedEntryResponse struct {
	Source      string                       `json:"source"`
	EventAt     string                       `json:"eventAt"`
	Visit       *visitResponse               `json:"visit,omitempty"`
	FoodProduct *homeFeedFoodProductResponse `json:"foodProduct,omitempty"`
}

type homeFeedResponse struct {
	Items             []homeFeedEntryResponse        `json:"items"`
	PhotoPreviews     []homeFeedPhotoPreviewResponse `json:"photoPreviews"`
	Cursor            *homeFeedCursorResponse        `json:"cursor,omitempty"`
	HasNextPage       bool                           `json:"hasNextPage"`
	TotalFoodProducts *int                           `json:"totalFoodProducts,omitempty"`
	TotalVisits       *int                           `json:"totalVisits,omitempty"`
}

type homeFeedMapPointResponse struct {
	ID                 string                       `json:"id"`
	Source             string                       `json:"source"`
	EventAt            string                       `json:"eventAt"`
	Latitude           float64                      `json:"latitude"`
	Longitude          float64                      `json:"longitude"`
	RestaurantID       string                       `json:"restaurantId,omitempty"`
	RestaurantName     string                       `json:"restaurantName"`
	RestaurantLocation string                       `json:"restaurantLocation,omitempty"`
	LocationText       string                       `json:"locationText,omitempty"`
	RatingSummaryLabel string                       `json:"ratingSummaryLabel"`
	Visit              *visitResponse               `json:"visit,omitempty"`
	FoodProduct        *homeFeedFoodProductResponse `json:"foodProduct,omitempty"`
}

type homeFeedMapPointsResponse struct {
	Points                    []homeFeedMapPointResponse     `json:"points"`
	PhotoPreviews             []homeFeedPhotoPreviewResponse `json:"photoPreviews"`
	OmittedWithoutCoordinates int                            `json:"omittedWithoutCoordinates"`
	TotalEntries              int                            `json:"totalEntries"`
}

type visitsPageResponse struct {
	Items       []visitResponse `json:"items"`
	Page        int             `json:"page"`
	PageSize    int             `json:"pageSize"`
	TotalItems  int             `json:"totalItems"`
	TotalPages  int             `json:"totalPages"`
	HasNextPage bool            `json:"hasNextPage"`
}

type visitPageRow struct {
	RecordID string `db:"recordId"`
}

// RegisterFeatureSummaryHandlers registers authenticated summary endpoints used by mobile surfaces.
func RegisterFeatureSummaryHandlers(se *core.ServeEvent, app core.App) {
	registerRestaurantListDetailSummaryHandler(se, app)
	registerFoodProductCategorySuggestionHandlers(se, app)

	se.Router.GET("/api/notes/summary", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		if err := cleanupExpiredUsedNotes(app, e.Auth.Id, time.Now().UTC()); err != nil {
			log.Printf("Failed to clean up expired used notes for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to clean up expired used notes", err)
		}

		summary, err := getNoteSummary(app, e.Auth.Id, "")
		if err != nil {
			log.Printf("Failed to load notes summary for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load notes summary", err)
		}

		return e.JSON(200, summary)
	})

	se.Router.GET("/api/notes/overview", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		status, err := normalizeNotesStatus(e.Request.URL.Query().Get("status"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		page, pageSize, err := parseNotesPagination(
			e.Request.URL.Query().Get("page"),
			e.Request.URL.Query().Get("pageSize"),
		)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		search := e.Request.URL.Query().Get("search")

		if err := cleanupExpiredUsedNotes(app, e.Auth.Id, time.Now().UTC()); err != nil {
			log.Printf("Failed to clean up expired used notes for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to clean up expired used notes", err)
		}

		response, err := getNotesOverviewResponse(app, e.Auth.Id, page, pageSize, status, search)
		if err != nil {
			log.Printf("Failed to load notes overview for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load notes overview", err)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/notes/{noteId}", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		noteID := strings.TrimSpace(e.Request.PathValue("noteId"))
		if noteID == "" {
			return apis.NewBadRequestError("noteId is required", nil)
		}

		if err := cleanupExpiredUsedNotes(app, e.Auth.Id, time.Now().UTC()); err != nil {
			log.Printf("Failed to clean up expired used notes for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to clean up expired used notes", err)
		}

		response, err := getNoteDetailResponse(app, e.Auth.Id, noteID)
		if err != nil {
			log.Printf("Failed to load note detail for user %s and note %s: %v", e.Auth.Id, noteID, err)
			return apis.NewApiError(500, "failed to load note detail", err)
		}
		if response == nil || response.Note == nil {
			return apis.NewNotFoundError("note not found", nil)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/friends/summary", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		summary, err := getFriendsSummary(app, e.Auth.Id)
		if err != nil {
			log.Printf("Failed to load friends summary for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load friends summary", err)
		}

		return e.JSON(200, summary)
	})

	se.Router.GET("/api/feedback/summary", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		summary, err := getFeedbackSummary(app, e.Auth.Id)
		if err != nil {
			log.Printf("Failed to load feedback summary for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load feedback summary", err)
		}

		return e.JSON(200, summary)
	})

	se.Router.GET("/api/bills/summary", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		summary, err := getBillListSummary(app, e.Auth.Id)
		if err != nil {
			log.Printf("Failed to load bills summary for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load bills summary", err)
		}

		return e.JSON(200, summary)
	})

	se.Router.GET("/api/bills/{billId}", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		billID := strings.TrimSpace(e.Request.PathValue("billId"))
		if billID == "" {
			return apis.NewBadRequestError("billId is required", nil)
		}

		billRecord, err := findAccessibleBillRecord(app, billID, e.Auth.Id)
		if err != nil {
			log.Printf("Failed to load bill detail for user %s and bill %s: %v", e.Auth.Id, billID, err)
			return apis.NewApiError(500, "failed to load bill detail", err)
		}
		if billRecord == nil {
			return apis.NewNotFoundError("bill not found", nil)
		}

		response, err := buildBillResponse(app, billRecord, e.Auth.Id)
		if err != nil {
			log.Printf("Failed to build bill detail payload for user %s and bill %s: %v", e.Auth.Id, billID, err)
			return apis.NewApiError(500, "failed to load bill detail", err)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/visits", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		scope, err := normalizeVisitsScope(e.Request.URL.Query().Get("scope"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		page, pageSize, err := parseVisitsPagination(
			e.Request.URL.Query().Get("page"),
			e.Request.URL.Query().Get("pageSize"),
		)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		response, err := getVisitsPageResponse(
			app,
			e.Auth.Id,
			e.Auth.GetBool("isAdmin"),
			page,
			pageSize,
			scope,
			e.Request.URL.Query().Get("search"),
		)
		if err != nil {
			log.Printf("Failed to load visits page for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load visits", err)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/home-feed", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		scope, err := normalizeHomeFeedScope(e.Request.URL.Query().Get("scope"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		typeFilter, err := normalizeHomeFeedTypeFilter(e.Request.URL.Query().Get("typeFilter"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		sort, err := normalizeHomeFeedSort(scope, e.Request.URL.Query().Get("sort"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		page, pageSize, err := parseHomeFeedPagination(
			e.Request.URL.Query().Get("page"),
			e.Request.URL.Query().Get("pageSize"),
		)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		response, err := getHomeFeedResponse(
			app,
			e.Auth.Id,
			e.Auth.GetBool("isAdmin"),
			page,
			pageSize,
			scope,
			e.Request.URL.Query().Get("search"),
			sort,
			typeFilter,
		)
		if err != nil {
			log.Printf("Failed to load home feed for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load home feed", err)
		}

		return e.JSON(200, response)
	})

	se.Router.GET("/api/home-feed/map-points", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		scope, err := normalizeHomeFeedScope(e.Request.URL.Query().Get("scope"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		typeFilter, err := normalizeHomeFeedTypeFilter(e.Request.URL.Query().Get("typeFilter"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		sort, err := normalizeHomeFeedSort(scope, e.Request.URL.Query().Get("sort"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		response, err := getHomeFeedMapPointsResponse(
			app,
			e.Auth.Id,
			e.Auth.GetBool("isAdmin"),
			scope,
			e.Request.URL.Query().Get("search"),
			sort,
			typeFilter,
		)
		if err != nil {
			log.Printf("Failed to load home feed map points for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load home feed map points", err)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/restaurants/recent", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		limit, err := normalizeRecentRestaurantLimit(e.Request.URL.Query().Get("limit"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		restaurants, err := listRecentRestaurantsSummary(app, e.Auth.Id, limit, e.Auth.GetBool("isAdmin"))
		if err != nil {
			log.Printf("Failed to load recent restaurants for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load recent restaurants", err)
		}

		return e.JSON(200, restaurants)
	})

	se.Router.GET("/api/restaurants/suggestions", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		limit, err := normalizeRestaurantSuggestionsLimit(e.Request.URL.Query().Get("limit"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		restaurants, err := listRestaurantSuggestionsSummary(
			app,
			e.Auth.Id,
			limit,
			e.Request.URL.Query().Get("search"),
			e.Auth.GetBool("isAdmin"),
		)
		if err != nil {
			log.Printf("Failed to load restaurant suggestions for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load restaurant suggestions", err)
		}

		return e.JSON(200, restaurants)
	})

	se.Router.GET("/api/restaurants/search", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		page, pageSize, err := parseRestaurantSearchPagination(
			e.Request.URL.Query().Get("page"),
			e.Request.URL.Query().Get("pageSize"),
		)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		response, err := searchRestaurantsSummaryPage(
			app,
			e.Auth.Id,
			e.Auth.GetBool("isAdmin"),
			page,
			pageSize,
			e.Request.URL.Query().Get("search"),
		)
		if err != nil {
			log.Printf("Failed to search restaurants for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to search restaurants", err)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/restaurants/{restaurantId}/menu-items", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		restaurantID := strings.TrimSpace(e.Request.PathValue("restaurantId"))
		if restaurantID == "" {
			return apis.NewBadRequestError("restaurantId is required", nil)
		}

		items, err := listRestaurantMenuItemSummaries(app, e.Auth, restaurantID)
		if err != nil {
			log.Printf("Failed to load menu items for restaurant %s and user %s: %v", restaurantID, e.Auth.Id, err)
			return err
		}

		return e.JSON(200, items)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/restaurants/visit-stats", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		requestBody := restaurantVisitStatsRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		summary, err := getRestaurantVisitStats(app, e.Auth.Id, requestBody.RestaurantIDs, e.Auth.GetBool("isAdmin"))
		if err != nil {
			log.Printf("Failed to load restaurant visit stats for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load restaurant visit stats", err)
		}

		return e.JSON(200, summary)
	})
}

func buildNotesFilter(userID string, status string, search string) (string, dbx.Params) {
	params := dbx.Params{
		"userId": userID,
	}
	conditions := []string{
		"user = {:userId}",
	}

	if status == "draft" || status == "used" {
		params["status"] = status
		conditions = append(conditions, "status = {:status}")
	}

	normalizedSearch := strings.ToLower(strings.TrimSpace(search))
	if normalizedSearch != "" {
		params["search"] = "%" + escapeFriendsSearchValue(normalizedSearch) + "%"
		conditions = append(
			conditions,
			`(
				LOWER(COALESCE(content, '')) LIKE {:search} ESCAPE '\' OR
				LOWER(COALESCE(location_text, '')) LIKE {:search} ESCAPE '\'
			)`,
		)
	}

	return strings.Join(conditions, " AND "), params
}

func getNoteSummary(app core.App, userID string, search string) (noteSummaryResponse, error) {
	summary := noteSummaryResponse{}
	filterSQL, params := buildNotesFilter(userID, "", search)
	err := app.DB().NewQuery(`
		SELECT
			COUNT(*) AS [[allCount]],
			COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS [[draftCount]],
			COALESCE(SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END), 0) AS [[usedCount]]
		FROM notes
		WHERE ` + filterSQL).
		Bind(params).
		One(&summary)

	return summary, err
}

func listNotePageRows(
	app core.App,
	filterSQL string,
	params dbx.Params,
	page int,
	pageSize int,
) ([]noteRecordIDRow, error) {
	rows := []noteRecordIDRow{}
	err := app.DB().NewQuery(`
		SELECT id AS [[noteId]]
		FROM notes
		WHERE ` + filterSQL + `
		ORDER BY created DESC, updated DESC, id DESC
		LIMIT {:limit}
		OFFSET {:offset}
	`).
		Bind(dbx.Params{
			"limit":  pageSize + 1,
			"offset": (page - 1) * pageSize,
		}).
		Bind(params).
		All(&rows)

	return rows, err
}

func cleanupExpiredUsedNotes(app core.App, userID string, now time.Time) error {
	expiredNotes, err := app.FindRecordsByFilter(
		"notes",
		"user = {:userId} && status = 'used' && usedAt != '' && usedAt <= {:cutoff}",
		"",
		0,
		0,
		dbx.Params{
			"userId": userID,
			"cutoff": now.AddDate(0, 0, -usedNotesRetentionDays).Format(time.RFC3339Nano),
		},
	)
	if err != nil {
		return err
	}

	for _, note := range expiredNotes {
		if err := app.Delete(note); err != nil {
			return err
		}
	}

	return nil
}

func getFriendsSummary(app core.App, userID string) (friendsSummaryResponse, error) {
	summary := friendsSummaryResponse{}
	err := app.DB().NewQuery(`
		SELECT
			COALESCE(
				SUM(
					CASE
						WHEN status = 'accepted' AND (user = {:userId} OR friend = {:userId}) THEN 1
						ELSE 0
					END
				),
				0
			) AS [[friendsCount]],
			COALESCE(
				SUM(
					CASE
						WHEN status = 'pending' AND friend = {:userId} THEN 1
						ELSE 0
					END
				),
				0
			) AS [[requestsCount]],
			COALESCE(
				SUM(
					CASE
						WHEN status = 'pending' AND user = {:userId} THEN 1
						ELSE 0
					END
				),
				0
			) AS [[sentCount]]
		FROM friendships
		WHERE user = {:userId} OR friend = {:userId}
	`).
		Bind(dbx.Params{"userId": userID}).
		One(&summary)

	return summary, err
}

func getFeedbackSummary(app core.App, userID string) (feedbackSummaryResponse, error) {
	summary := feedbackSummaryResponse{}
	err := app.DB().NewQuery(`
		SELECT
			COUNT(*) AS [[allCount]],
			COALESCE(
				SUM(
					CASE
						WHEN status = 'open' OR status = 'in_progress' THEN 1
						ELSE 0
					END
				),
				0
			) AS [[activeCount]]
		FROM feedback
		WHERE user = {:userId}
	`).
		Bind(dbx.Params{"userId": userID}).
		One(&summary)

	return summary, err
}

func getBillListSummary(app core.App, userID string) ([]billListSummaryResponse, error) {
	rows := []billListSummaryRow{}
	err := app.DB().NewQuery(`
		WITH accessible_bills AS (
			SELECT DISTINCT
				bills.id,
				bills.bill_name,
				bills.status,
				bills.creator_user,
				bills.created,
				bills.updated
			FROM bills
			LEFT JOIN bill_participants current_user_participants
				ON current_user_participants.bill = bills.id
				AND current_user_participants.user = {:userId}
			WHERE bills.creator_user = {:userId}
				OR current_user_participants.id IS NOT NULL
		)
		SELECT
			accessible_bills.id AS [[id]],
			accessible_bills.bill_name AS [[title]],
			CASE
				WHEN accessible_bills.status = 'settled' THEN 'settled'
				ELSE 'open'
			END AS [[status]],
			COUNT(participants.id) AS [[participantCount]],
			COALESCE(
				SUM(
					CASE
						WHEN participants.paid_status = 'pending' AND COALESCE(participants.user, '') != {:userId} THEN 1
						ELSE 0
					END
				),
				0
			) AS [[pendingOtherParticipantCount]],
			COALESCE(
				MAX(
					CASE
						WHEN participants.user = {:userId} AND participants.paid_status = 'pending' THEN participants.amount_owed
						ELSE 0
					END
				),
				0
			) AS [[youOwe]],
			COALESCE(
				SUM(
					CASE
						WHEN accessible_bills.creator_user = {:userId}
							AND participants.paid_status = 'pending'
							AND COALESCE(participants.user, '') != {:userId}
						THEN participants.amount_owed
						ELSE 0
					END
				),
				0
			) AS [[youAreOwed]],
			CASE
				WHEN accessible_bills.creator_user = {:userId} THEN 1
				ELSE 0
			END AS [[isCreator]],
			accessible_bills.created AS [[createdAt]],
			accessible_bills.updated AS [[updatedAt]]
		FROM accessible_bills
		LEFT JOIN bill_participants participants ON participants.bill = accessible_bills.id
		GROUP BY
			accessible_bills.id,
			accessible_bills.bill_name,
			accessible_bills.status,
			accessible_bills.creator_user,
			accessible_bills.created,
			accessible_bills.updated
		ORDER BY accessible_bills.created DESC
	`).
		Bind(dbx.Params{"userId": userID}).
		All(&rows)
	if err != nil {
		return nil, err
	}

	result := make([]billListSummaryResponse, 0, len(rows))
	for _, row := range rows {
		result = append(result, billListSummaryResponse{
			ID:                           row.ID,
			Title:                        row.Title,
			Status:                       row.Status,
			ParticipantCount:             row.ParticipantCount,
			PendingOtherParticipantCount: row.PendingOtherParticipantCount,
			YouOwe:                       row.YouOwe,
			YouAreOwed:                   row.YouAreOwed,
			IsCreator:                    row.IsCreator != 0,
			CreatedAt:                    row.CreatedAt,
			UpdatedAt:                    row.UpdatedAt,
		})
	}

	return result, nil
}

func findAccessibleBillRecord(app core.App, billID string, userID string) (*core.Record, error) {
	billRecord, err := app.FindRecordById("bills", billID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}

		return nil, err
	}

	if strings.TrimSpace(billRecord.GetString("creator_user")) == userID {
		return billRecord, nil
	}

	participantRecords, err := app.FindRecordsByFilter(
		"bill_participants",
		"bill = {:billId} && user = {:userId}",
		"",
		1,
		0,
		dbx.Params{
			"billId": billID,
			"userId": userID,
		},
	)
	if err != nil {
		return nil, err
	}
	if len(participantRecords) == 0 {
		return nil, nil
	}

	return billRecord, nil
}

func normalizeVisitsScope(raw string) (string, error) {
	switch strings.TrimSpace(raw) {
	case "", "all":
		return "all", nil
	case "mine":
		return "mine", nil
	case "friends":
		return "friends", nil
	default:
		return "", fmt.Errorf("invalid visit scope")
	}
}

func normalizeNotesStatus(raw string) (string, error) {
	switch strings.TrimSpace(raw) {
	case "", "all":
		return "all", nil
	case "draft":
		return "draft", nil
	case "used":
		return "used", nil
	default:
		return "", fmt.Errorf("invalid note status")
	}
}

func parseNotesPagination(pageRaw string, pageSizeRaw string) (int, int, error) {
	page := 1
	if strings.TrimSpace(pageRaw) != "" {
		parsedPage, err := strconv.Atoi(pageRaw)
		if err != nil || parsedPage < 1 {
			return 0, 0, fmt.Errorf("invalid page")
		}
		page = parsedPage
	}

	pageSize := defaultNotesPageSize
	if strings.TrimSpace(pageSizeRaw) != "" {
		parsedPageSize, err := strconv.Atoi(pageSizeRaw)
		if err != nil || parsedPageSize < 1 {
			return 0, 0, fmt.Errorf("invalid pageSize")
		}

		if parsedPageSize > maxNotesPageSize {
			pageSize = maxNotesPageSize
		} else {
			pageSize = parsedPageSize
		}
	}

	return page, pageSize, nil
}

func parseVisitsPagination(pageRaw string, pageSizeRaw string) (int, int, error) {
	page := 1
	if strings.TrimSpace(pageRaw) != "" {
		parsedPage, err := strconv.Atoi(pageRaw)
		if err != nil || parsedPage < 1 {
			return 0, 0, fmt.Errorf("invalid page")
		}
		page = parsedPage
	}

	pageSize := defaultVisitsPageSize
	if strings.TrimSpace(pageSizeRaw) != "" {
		parsedPageSize, err := strconv.Atoi(pageSizeRaw)
		if err != nil || parsedPageSize < 1 {
			return 0, 0, fmt.Errorf("invalid pageSize")
		}

		if parsedPageSize > maxVisitsPageSize {
			pageSize = maxVisitsPageSize
		} else {
			pageSize = parsedPageSize
		}
	}

	return page, pageSize, nil
}

func parseRestaurantSearchPagination(pageRaw string, pageSizeRaw string) (int, int, error) {
	page := 1
	if strings.TrimSpace(pageRaw) != "" {
		parsedPage, err := strconv.Atoi(pageRaw)
		if err != nil || parsedPage < 1 {
			return 0, 0, fmt.Errorf("invalid page")
		}
		page = parsedPage
	}

	pageSize := defaultRestaurantSearchPageSize
	if strings.TrimSpace(pageSizeRaw) != "" {
		parsedPageSize, err := strconv.Atoi(pageSizeRaw)
		if err != nil || parsedPageSize < 1 {
			return 0, 0, fmt.Errorf("invalid pageSize")
		}

		if parsedPageSize > maxRestaurantSearchPageSize {
			pageSize = maxRestaurantSearchPageSize
		} else {
			pageSize = parsedPageSize
		}
	}

	return page, pageSize, nil
}

func normalizeHomeFeedScope(raw string) (string, error) {
	switch strings.TrimSpace(raw) {
	case "", "all":
		return "all", nil
	case "mine":
		return "mine", nil
	case "friends":
		return "friends", nil
	default:
		return "", fmt.Errorf("invalid home feed scope")
	}
}

func normalizeHomeFeedTypeFilter(raw string) (string, error) {
	switch strings.TrimSpace(raw) {
	case "", "all":
		return "all", nil
	case "visits":
		return "visits", nil
	case "food-products":
		return "food-products", nil
	default:
		return "", fmt.Errorf("invalid home feed typeFilter")
	}
}

func normalizeHomeFeedSort(scope string, raw string) (string, error) {
	defaultSort := "created"

	switch strings.TrimSpace(raw) {
	case "":
		return defaultSort, nil
	case "created":
		return "created", nil
	case "tracked":
		return "tracked", nil
	default:
		return "", fmt.Errorf("invalid home feed sort")
	}
}

func getVisitsPageResponse(
	app core.App,
	userID string,
	isAdmin bool,
	page int,
	pageSize int,
	scope string,
	search string,
) (visitsPageResponse, error) {
	response := visitsPageResponse{
		Items:    []visitResponse{},
		Page:     page,
		PageSize: pageSize,
	}

	totalItems, err := countVisitsPageEntries(app, userID, isAdmin, scope, search)
	if err != nil {
		return response, err
	}

	totalPages := 0
	if totalItems > 0 {
		totalPages = (totalItems + pageSize - 1) / pageSize
	}
	response.TotalItems = totalItems
	response.TotalPages = totalPages
	response.HasNextPage = page < totalPages

	if totalItems == 0 {
		return response, nil
	}

	rows, err := listVisitPageRows(app, userID, isAdmin, page, pageSize, scope, search)
	if err != nil {
		return response, err
	}
	if len(rows) == 0 {
		return response, nil
	}

	acceptedFriendIDs := map[string]struct{}{}
	if !isAdmin {
		acceptedFriendIDs, err = listAcceptedFriendIDs(app, userID)
		if err != nil {
			return response, err
		}
	}

	visitIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		visitIDs = append(visitIDs, row.RecordID)
	}

	visitRecords, err := findRecordsByIDs(app, "visits", visitIDs)
	if err != nil {
		return response, err
	}
	visitRecordsByID := mapRecordsByID(visitRecords)

	visitItemRecords, err := findRecordsByRelationValues(app, "food_items", "visit", visitIDs, "-created")
	if err != nil {
		return response, err
	}

	filteredVisitItems := make([]*core.Record, 0, len(visitItemRecords))
	for _, record := range visitItemRecords {
		if !isVisitItemRecord(record) {
			continue
		}
		filteredVisitItems = append(filteredVisitItems, record)
	}
	visitItemsByVisitID := groupRecordsByField(filteredVisitItems, "visit")

	restaurantIDs := make([]string, 0, len(visitRecords))
	restaurantIDSet := map[string]struct{}{}
	userIDs := make([]string, 0, len(visitRecords))
	userIDSet := map[string]struct{}{}
	for _, visit := range visitRecords {
		restaurantIDs = appendUniqueTrimmedID(restaurantIDs, restaurantIDSet, visit.GetString("restaurant"))

		ownerID := strings.TrimSpace(visit.GetString("user"))
		if isAdmin || ownerID == userID || hasAcceptedFriend(acceptedFriendIDs, ownerID) {
			userIDs = appendUniqueTrimmedID(userIDs, userIDSet, ownerID)
		}
	}

	restaurantRecords, err := findRecordsByIDs(app, "restaurants", restaurantIDs)
	if err != nil {
		return response, err
	}
	userRecords, err := findRecordsByIDs(app, "users", userIDs)
	if err != nil {
		return response, err
	}

	restaurantsByID := mapRecordsByID(restaurantRecords)
	usersByID := mapRecordsByID(userRecords)

	response.Items = make([]visitResponse, 0, len(rows))
	for _, row := range rows {
		visit := visitRecordsByID[row.RecordID]
		if visit == nil {
			continue
		}

		restaurant := restaurantsByID[visit.GetString("restaurant")]
		ownerID := strings.TrimSpace(visit.GetString("user"))
		userName := ""
		if isAdmin || ownerID == userID || hasAcceptedFriend(acceptedFriendIDs, ownerID) {
			userName = resolveHomeFeedUserName(usersByID[ownerID])
		}

		response.Items = append(response.Items, visitResponse{
			ID:                    visit.Id,
			RestaurantID:          visit.GetString("restaurant"),
			RestaurantName:        defaultString(resolveRestaurantName(restaurant), "Unknown Restaurant"),
			RestaurantLocation:    resolveRestaurantLocation(restaurant),
			RestaurantCuisineType: resolveRestaurantCuisine(restaurant),
			VisitedAt:             defaultString(strings.TrimSpace(visit.GetString("visitDate")), visit.GetString("created")),
			Items:                 mapHomeFeedVisitItems(visitItemsByVisitID[visit.Id]),
			Source:                "visit",
			UserID:                ownerID,
			UserName:              userName,
			Visibility:            strings.TrimSpace(visit.GetString("visibility")),
			ModerationStatus:      strings.TrimSpace(visit.GetString("moderationStatus")),
			CreatedAt:             visit.GetString("created"),
			UpdatedAt:             visit.GetString("updated"),
		})
	}

	return response, nil
}

func getNotesOverviewResponse(
	app core.App,
	userID string,
	page int,
	pageSize int,
	status string,
	search string,
) (notesOverviewResponse, error) {
	response := notesOverviewResponse{
		Items:    []notesOverviewItemResponse{},
		Page:     page,
		PageSize: pageSize,
	}

	if page == 1 {
		summary, err := getNoteSummary(app, userID, search)
		if err != nil {
			return response, err
		}

		response.Summary = &summary

		totalItems := 0
		switch status {
		case "draft":
			totalItems = summary.DraftCount
		case "used":
			totalItems = summary.UsedCount
		default:
			totalItems = summary.AllCount
		}

		totalPages := 0
		if totalItems > 0 {
			totalPages = (totalItems + pageSize - 1) / pageSize
		}

		response.TotalItems = &totalItems
		response.TotalPages = &totalPages
		response.HasNextPage = totalPages > 0 && page < totalPages

		if totalItems == 0 {
			return response, nil
		}
	}

	filterSQL, params := buildNotesFilter(userID, status, search)
	rows, err := listNotePageRows(app, filterSQL, params, page, pageSize)
	if err != nil {
		return response, err
	}
	if len(rows) == 0 {
		return response, nil
	}

	if len(rows) > pageSize {
		response.HasNextPage = true
		rows = rows[:pageSize]
	}

	noteIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		noteIDs = append(noteIDs, row.NoteID)
	}

	noteRecords, err := findRecordsByIDs(app, "notes", noteIDs)
	if err != nil {
		return response, err
	}
	noteRecordsByID := mapRecordsByID(noteRecords)

	restaurantIDs := make([]string, 0, len(rows))
	restaurantIDSet := map[string]struct{}{}
	for _, row := range rows {
		note := noteRecordsByID[row.NoteID]
		if note == nil {
			continue
		}
		restaurantIDs = appendUniqueTrimmedID(restaurantIDs, restaurantIDSet, note.GetString("restaurant"))
	}

	restaurantRecords, err := findRecordsByIDs(app, "restaurants", restaurantIDs)
	if err != nil {
		return response, err
	}
	restaurantsByID := mapRecordsByID(restaurantRecords)

	photoRecords, err := findRecordsByRelationValues(app, "note_photos", "note", noteIDs, "note,created")
	if err != nil {
		return response, err
	}
	photosByNoteID := groupRecordsByField(photoRecords, "note")

	response.Items = make([]notesOverviewItemResponse, 0, len(rows))
	for _, row := range rows {
		note := noteRecordsByID[row.NoteID]
		if note == nil {
			continue
		}

		item := buildNoteOverviewItemResponse(note, restaurantsByID)

		if notePhotos := photosByNoteID[note.Id]; len(notePhotos) > 0 {
			item.PhotoPreview = &notesOverviewPhotoPreviewResponse{
				ID:    notePhotos[0].Id,
				Photo: strings.TrimSpace(notePhotos[0].GetString("photo")),
				Count: len(notePhotos),
			}
		}

		response.Items = append(response.Items, item)
	}

	return response, nil
}

func getNoteDetailResponse(app core.App, userID string, noteID string) (*noteDetailResponse, error) {
	noteRecord, err := app.FindFirstRecordByFilter(
		"notes",
		"id = {:noteId} && user = {:userId}",
		dbx.Params{
			"noteId": strings.TrimSpace(noteID),
			"userId": userID,
		},
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}

		return nil, err
	}

	restaurantID := strings.TrimSpace(noteRecord.GetString("restaurant"))
	restaurantRecords, err := findRecordsByIDs(app, "restaurants", []string{restaurantID})
	if err != nil {
		return nil, err
	}

	photoRecords, err := findRecordsByRelationValues(app, "note_photos", "note", []string{noteRecord.Id}, "created")
	if err != nil {
		return nil, err
	}

	response := &noteDetailResponse{
		Note:   nil,
		Photos: make([]noteDetailPhotoResponse, 0, len(photoRecords)),
	}
	noteItem := buildNoteOverviewItemResponse(noteRecord, mapRecordsByID(restaurantRecords))
	response.Note = &noteItem

	for _, photoRecord := range photoRecords {
		response.Photos = append(response.Photos, noteDetailPhotoResponse{
			ID:         photoRecord.Id,
			Note:       strings.TrimSpace(photoRecord.GetString("note")),
			Photo:      strings.TrimSpace(photoRecord.GetString("photo")),
			Created:    strings.TrimSpace(photoRecord.GetString("created")),
			CapturedAt: strings.TrimSpace(photoRecord.GetString("capturedAt")),
		})
	}

	return response, nil
}

func buildNoteOverviewItemResponse(
	note *core.Record,
	restaurantsByID map[string]*core.Record,
) notesOverviewItemResponse {
	restaurantID := strings.TrimSpace(note.GetString("restaurant"))

	return notesOverviewItemResponse{
		ID:               note.Id,
		Content:          strings.TrimSpace(note.GetString("content")),
		LocationText:     strings.TrimSpace(note.GetString("location_text")),
		Status:           normalizeNoteStatusValue(note.GetString("status")),
		RestaurantID:     restaurantID,
		RestaurantName:   resolveRestaurantName(restaurantsByID[restaurantID]),
		UsedInVisitID:    strings.TrimSpace(note.GetString("usedInVisit")),
		UsedInFoodItemID: strings.TrimSpace(note.GetString("usedInFoodItem")),
		CreatedAt:        strings.TrimSpace(note.GetString("created")),
		UpdatedAt:        strings.TrimSpace(note.GetString("updated")),
	}
}

func normalizeNoteStatusValue(status string) string {
	if strings.TrimSpace(status) == "used" {
		return "used"
	}

	return "draft"
}

func parseHomeFeedPagination(pageRaw string, pageSizeRaw string) (int, int, error) {
	page := 1
	if strings.TrimSpace(pageRaw) != "" {
		parsedPage, err := strconv.Atoi(pageRaw)
		if err != nil || parsedPage < 1 {
			return 0, 0, fmt.Errorf("invalid page")
		}
		page = parsedPage
	}

	pageSize := defaultHomeFeedPageSize
	if strings.TrimSpace(pageSizeRaw) != "" {
		parsedPageSize, err := strconv.Atoi(pageSizeRaw)
		if err != nil || parsedPageSize < 1 {
			return 0, 0, fmt.Errorf("invalid pageSize")
		}

		if parsedPageSize > maxHomeFeedPageSize {
			pageSize = maxHomeFeedPageSize
		} else {
			pageSize = parsedPageSize
		}
	}

	return page, pageSize, nil
}

func getHomeFeedResponse(
	app core.App,
	userID string,
	isAdmin bool,
	page int,
	pageSize int,
	scope string,
	search string,
	sort string,
	typeFilter string,
) (homeFeedResponse, error) {
	response := homeFeedResponse{
		Items:         []homeFeedEntryResponse{},
		PhotoPreviews: []homeFeedPhotoPreviewResponse{},
	}

	if page == 1 {
		counts, err := countHomeFeedEntries(app, userID, isAdmin, scope, search, typeFilter)
		if err != nil {
			return response, err
		}

		response.TotalVisits = &counts.TotalVisits
		response.TotalFoodProducts = &counts.TotalFoodProducts
	}

	rows, err := listHomeFeedEntryRows(app, userID, isAdmin, page, pageSize, scope, search, sort, typeFilter)
	if err != nil {
		return response, err
	}

	response.HasNextPage = len(rows) > pageSize
	if response.HasNextPage {
		rows = rows[:pageSize]
		response.Cursor = &homeFeedCursorResponse{Page: page + 1}
	}

	if len(rows) == 0 {
		return response, nil
	}

	acceptedFriendIDs := map[string]struct{}{}
	if !isAdmin && strings.TrimSpace(userID) != "" {
		friendIDs, err := listAcceptedFriendIDs(app, userID)
		if err != nil {
			return response, err
		}
		acceptedFriendIDs = friendIDs
	}

	visitIDs := make([]string, 0, len(rows))
	quickTrackIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		switch row.Source {
		case "visit":
			visitIDs = append(visitIDs, row.RecordID)
		case "food-product":
			quickTrackIDs = append(quickTrackIDs, row.RecordID)
		}
	}

	visitRecords, err := findRecordsByIDs(app, "visits", visitIDs)
	if err != nil {
		return response, err
	}
	quickTrackRecords, err := findRecordsByIDs(app, "food_items", quickTrackIDs)
	if err != nil {
		return response, err
	}

	visitRecordsByID := mapRecordsByID(visitRecords)
	quickTrackRecordsByID := mapRecordsByID(quickTrackRecords)

	visitItemRecords, err := findRecordsByRelationValues(app, "food_items", "visit", visitIDs, "-created")
	if err != nil {
		return response, err
	}
	filteredVisitItems := make([]*core.Record, 0, len(visitItemRecords))
	for _, record := range visitItemRecords {
		if !isVisitItemRecord(record) {
			continue
		}
		filteredVisitItems = append(filteredVisitItems, record)
	}
	visitItemsByVisitID := groupRecordsByField(filteredVisitItems, "visit")

	linkedVisitIDs := make([]string, 0, len(quickTrackRecords))
	restaurantIDs := make([]string, 0, len(visitRecords)+len(quickTrackRecords))
	userIDs := make([]string, 0, len(visitRecords)+len(quickTrackRecords))
	photoFoodItemIDs := make([]string, 0, len(filteredVisitItems)+len(quickTrackRecords))

	for _, visit := range visitRecords {
		restaurantIDs = append(restaurantIDs, visit.GetString("restaurant"))
		userIDs = append(userIDs, visit.GetString("user"))
	}

	for _, item := range filteredVisitItems {
		photoFoodItemIDs = append(photoFoodItemIDs, item.Id)
	}

	for _, quickTrack := range quickTrackRecords {
		linkedVisitIDs = append(linkedVisitIDs, quickTrack.GetString("visit"))
		userIDs = append(userIDs, quickTrack.GetString("user"))
		photoFoodItemIDs = append(photoFoodItemIDs, quickTrack.Id)
	}

	linkedVisitRecords, err := findRecordsByIDs(app, "visits", linkedVisitIDs)
	if err != nil {
		return response, err
	}
	linkedVisitsByID := mapRecordsByID(linkedVisitRecords)
	for _, visit := range linkedVisitRecords {
		restaurantIDs = append(restaurantIDs, visit.GetString("restaurant"))
	}

	restaurantRecords, err := findRecordsByIDs(app, "restaurants", restaurantIDs)
	if err != nil {
		return response, err
	}
	userRecords, err := findRecordsByIDs(app, "users", userIDs)
	if err != nil {
		return response, err
	}
	photoRecords, err := findRecordsByRelationValues(app, "visit_photos", "food_item", photoFoodItemIDs, "-created")
	if err != nil {
		return response, err
	}

	restaurantsByID := mapRecordsByID(restaurantRecords)
	usersByID := mapRecordsByID(userRecords)
	foodItemsByID := make(map[string]*core.Record, len(filteredVisitItems)+len(quickTrackRecords))
	for _, item := range filteredVisitItems {
		foodItemsByID[item.Id] = item
	}
	for _, item := range quickTrackRecords {
		foodItemsByID[item.Id] = item
	}
	visitsByID := make(map[string]*core.Record, len(visitRecords)+len(linkedVisitRecords))
	for _, visit := range visitRecords {
		visitsByID[visit.Id] = visit
	}
	for _, visit := range linkedVisitRecords {
		visitsByID[visit.Id] = visit
	}

	photoPreviews := make([]homeFeedPhotoPreviewResponse, 0, len(photoRecords))
	for _, photo := range photoRecords {
		if !canAccessVisitPhotoRecord(photo, foodItemsByID, visitsByID, userID, isAdmin, acceptedFriendIDs) {
			continue
		}
		photoPreviews = append(photoPreviews, mapHomeFeedPhotoPreview(photo))
	}
	response.PhotoPreviews = photoPreviews

	items := make([]homeFeedEntryResponse, 0, len(rows))
	for _, row := range rows {
		switch row.Source {
		case "visit":
			visit := visitRecordsByID[row.RecordID]
			if visit == nil {
				continue
			}

			restaurant := restaurantsByID[visit.GetString("restaurant")]
			user := usersByID[visit.GetString("user")]
			entryItems := visitItemsByVisitID[visit.Id]
			items = append(items, homeFeedEntryResponse{
				Source:  "visit",
				EventAt: row.EventAt,
				Visit: &visitResponse{
					ID:                    visit.Id,
					RestaurantID:          visit.GetString("restaurant"),
					RestaurantName:        defaultString(resolveRestaurantName(restaurant), "Unknown Restaurant"),
					RestaurantLocation:    resolveRestaurantLocation(restaurant),
					RestaurantCuisineType: resolveRestaurantCuisine(restaurant),
					VisitedAt:             defaultString(strings.TrimSpace(visit.GetString("visitDate")), visit.GetString("created")),
					Items:                 mapHomeFeedVisitItems(entryItems),
					Source:                "visit",
					UserID:                visit.GetString("user"),
					UserName:              resolveHomeFeedUserName(user),
					Visibility:            strings.TrimSpace(visit.GetString("visibility")),
					ModerationStatus:      strings.TrimSpace(visit.GetString("moderationStatus")),
					CreatedAt:             visit.GetString("created"),
					UpdatedAt:             visit.GetString("updated"),
				},
			})
		case "food-product":
			quickTrack := quickTrackRecordsByID[row.RecordID]
			if quickTrack == nil {
				continue
			}

			user := usersByID[quickTrack.GetString("user")]
			linkedVisit := linkedVisitsByID[quickTrack.GetString("visit")]
			linkedRestaurant := (*core.Record)(nil)
			if linkedVisit != nil {
				linkedRestaurant = restaurantsByID[linkedVisit.GetString("restaurant")]
			}

			restaurantName := strings.TrimSpace(quickTrack.GetString("location_text"))
			if restaurantName == "" {
				restaurantName = resolveRestaurantName(linkedRestaurant)
			}
			if restaurantName == "" {
				restaurantName = "Food Product"
			}

			items = append(items, homeFeedEntryResponse{
				Source:  "food-product",
				EventAt: row.EventAt,
				FoodProduct: &homeFeedFoodProductResponse{
					ID:               quickTrack.Id,
					RestaurantName:   restaurantName,
					LocationText:     strings.TrimSpace(quickTrack.GetString("location_text")),
					ItemCategory:     strings.TrimSpace(quickTrack.GetString("itemCategory")),
					ItemName:         quickTrack.GetString("name"),
					Rating:           quickTrack.GetFloat("rating"),
					Notes:            strings.TrimSpace(quickTrack.GetString("notes")),
					UserID:           quickTrack.GetString("user"),
					UserName:         resolveHomeFeedUserName(user),
					Visibility:       strings.TrimSpace(quickTrack.GetString("visibility")),
					ModerationStatus: strings.TrimSpace(quickTrack.GetString("moderationStatus")),
					ItemDate:         strings.TrimSpace(quickTrack.GetString("itemDate")),
					CreatedAt:        quickTrack.GetString("created"),
					UpdatedAt:        quickTrack.GetString("updated"),
				},
			})
		}
	}

	response.Items = items
	if scope == "friends" {
		redactFriendHomeFeedTimestamps(&response)
	}

	return response, nil
}

func getHomeFeedMapPointsResponse(
	app core.App,
	userID string,
	isAdmin bool,
	scope string,
	search string,
	sort string,
	typeFilter string,
) (homeFeedMapPointsResponse, error) {
	response := homeFeedMapPointsResponse{
		PhotoPreviews: []homeFeedPhotoPreviewResponse{},
		Points:        []homeFeedMapPointResponse{},
	}

	counts, err := countHomeFeedMapEntries(app, userID, isAdmin, scope, search, typeFilter)
	if err != nil {
		return response, err
	}
	response.TotalEntries = counts.TotalEntries
	response.OmittedWithoutCoordinates = counts.TotalEntries - counts.EntriesWithCoords
	if response.OmittedWithoutCoordinates < 0 {
		response.OmittedWithoutCoordinates = 0
	}

	rows, err := listHomeFeedMapEntryRows(app, userID, isAdmin, scope, search, sort, typeFilter)
	if err != nil {
		return response, err
	}
	if len(rows) == 0 {
		return response, nil
	}

	acceptedFriendIDs := map[string]struct{}{}
	if !isAdmin && strings.TrimSpace(userID) != "" {
		friendIDs, err := listAcceptedFriendIDs(app, userID)
		if err != nil {
			return response, err
		}
		acceptedFriendIDs = friendIDs
	}

	visitIDs := make([]string, 0, len(rows))
	quickTrackIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		switch row.Source {
		case "visit":
			visitIDs = append(visitIDs, row.RecordID)
		case "food-product":
			quickTrackIDs = append(quickTrackIDs, row.RecordID)
		}
	}

	visitRecords, err := findRecordsByIDs(app, "visits", visitIDs)
	if err != nil {
		return response, err
	}
	quickTrackRecords, err := findRecordsByIDs(app, "food_items", quickTrackIDs)
	if err != nil {
		return response, err
	}

	visitRecordsByID := mapRecordsByID(visitRecords)
	quickTrackRecordsByID := mapRecordsByID(quickTrackRecords)

	visitItemRecords, err := findRecordsByRelationValues(app, "food_items", "visit", visitIDs, "-created")
	if err != nil {
		return response, err
	}
	filteredVisitItems := make([]*core.Record, 0, len(visitItemRecords))
	for _, record := range visitItemRecords {
		if !isVisitItemRecord(record) {
			continue
		}
		filteredVisitItems = append(filteredVisitItems, record)
	}
	visitItemsByVisitID := groupRecordsByField(filteredVisitItems, "visit")

	photoFoodItemIDs := make([]string, 0, len(filteredVisitItems)+len(quickTrackRecords))
	for _, item := range filteredVisitItems {
		photoFoodItemIDs = append(photoFoodItemIDs, item.Id)
	}
	for _, quickTrack := range quickTrackRecords {
		photoFoodItemIDs = append(photoFoodItemIDs, quickTrack.Id)
	}

	linkedVisitIDs := make([]string, 0, len(quickTrackRecords))
	restaurantIDs := make([]string, 0, len(visitRecords)+len(quickTrackRecords))
	userIDs := make([]string, 0, len(visitRecords)+len(quickTrackRecords))
	for _, visit := range visitRecords {
		restaurantIDs = append(restaurantIDs, visit.GetString("restaurant"))
		userIDs = append(userIDs, visit.GetString("user"))
	}
	for _, quickTrack := range quickTrackRecords {
		linkedVisitIDs = append(linkedVisitIDs, quickTrack.GetString("visit"))
		userIDs = append(userIDs, quickTrack.GetString("user"))
	}

	linkedVisitRecords, err := findRecordsByIDs(app, "visits", linkedVisitIDs)
	if err != nil {
		return response, err
	}
	linkedVisitsByID := mapRecordsByID(linkedVisitRecords)
	for _, visit := range linkedVisitRecords {
		restaurantIDs = append(restaurantIDs, visit.GetString("restaurant"))
	}

	restaurantRecords, err := findRecordsByIDs(app, "restaurants", restaurantIDs)
	if err != nil {
		return response, err
	}
	userRecords, err := findRecordsByIDs(app, "users", userIDs)
	if err != nil {
		return response, err
	}

	restaurantsByID := mapRecordsByID(restaurantRecords)
	usersByID := mapRecordsByID(userRecords)
	foodItemsByID := make(map[string]*core.Record, len(filteredVisitItems)+len(quickTrackRecords))
	for _, item := range filteredVisitItems {
		foodItemsByID[item.Id] = item
	}
	for _, item := range quickTrackRecords {
		foodItemsByID[item.Id] = item
	}
	visitsByID := make(map[string]*core.Record, len(visitRecords)+len(linkedVisitRecords))
	for _, visit := range visitRecords {
		visitsByID[visit.Id] = visit
	}
	for _, visit := range linkedVisitRecords {
		visitsByID[visit.Id] = visit
	}

	photoRecords, err := findRecordsByRelationValues(app, "visit_photos", "food_item", photoFoodItemIDs, "-created")
	if err != nil {
		return response, err
	}
	photoPreviews := make([]homeFeedPhotoPreviewResponse, 0, len(photoRecords))
	for _, photo := range photoRecords {
		if !canAccessVisitPhotoRecord(photo, foodItemsByID, visitsByID, userID, isAdmin, acceptedFriendIDs) {
			continue
		}
		photoPreviews = append(photoPreviews, mapHomeFeedPhotoPreview(photo))
	}
	response.PhotoPreviews = photoPreviews

	points := make([]homeFeedMapPointResponse, 0, len(rows))
	for _, row := range rows {
		if !row.Latitude.Valid || !row.Longitude.Valid {
			continue
		}

		switch row.Source {
		case "visit":
			visit := visitRecordsByID[row.RecordID]
			if visit == nil {
				continue
			}

			restaurant := restaurantsByID[visit.GetString("restaurant")]
			user := usersByID[visit.GetString("user")]
			entryItems := visitItemsByVisitID[visit.Id]
			restaurantName := defaultString(resolveRestaurantName(restaurant), "Unknown Restaurant")
			restaurantLocation := resolveRestaurantLocation(restaurant)
			points = append(points, homeFeedMapPointResponse{
				ID:                 "visit_" + visit.Id,
				Source:             "visit",
				EventAt:            row.EventAt,
				Latitude:           row.Latitude.Float64,
				Longitude:          row.Longitude.Float64,
				RestaurantID:       visit.GetString("restaurant"),
				RestaurantName:     restaurantName,
				RestaurantLocation: restaurantLocation,
				RatingSummaryLabel: formatHomeFeedVisitRatingSummary(entryItems),
				Visit: &visitResponse{
					ID:                    visit.Id,
					RestaurantID:          visit.GetString("restaurant"),
					RestaurantName:        restaurantName,
					RestaurantLocation:    restaurantLocation,
					RestaurantCuisineType: resolveRestaurantCuisine(restaurant),
					VisitedAt:             defaultString(strings.TrimSpace(visit.GetString("visitDate")), visit.GetString("created")),
					Items:                 mapHomeFeedVisitItems(entryItems),
					Source:                "visit",
					UserID:                visit.GetString("user"),
					UserName:              resolveHomeFeedUserName(user),
					Visibility:            strings.TrimSpace(visit.GetString("visibility")),
					ModerationStatus:      strings.TrimSpace(visit.GetString("moderationStatus")),
					CreatedAt:             visit.GetString("created"),
					UpdatedAt:             visit.GetString("updated"),
				},
			})
		case "food-product":
			quickTrack := quickTrackRecordsByID[row.RecordID]
			if quickTrack == nil {
				continue
			}

			user := usersByID[quickTrack.GetString("user")]
			linkedVisit := linkedVisitsByID[quickTrack.GetString("visit")]
			linkedRestaurant := (*core.Record)(nil)
			if linkedVisit != nil {
				linkedRestaurant = restaurantsByID[linkedVisit.GetString("restaurant")]
			}

			restaurantName := strings.TrimSpace(quickTrack.GetString("location_text"))
			if restaurantName == "" {
				restaurantName = resolveRestaurantName(linkedRestaurant)
			}
			if restaurantName == "" {
				restaurantName = "Food Product"
			}

			restaurantID := ""
			if linkedVisit != nil {
				restaurantID = linkedVisit.GetString("restaurant")
			}
			ratingSummaryLabel := formatHomeFeedSingleRatingSummary(quickTrack.GetFloat("rating"))
			foodProduct := &homeFeedFoodProductResponse{
				ID:               quickTrack.Id,
				RestaurantName:   restaurantName,
				LocationText:     strings.TrimSpace(quickTrack.GetString("location_text")),
				ItemCategory:     strings.TrimSpace(quickTrack.GetString("itemCategory")),
				ItemName:         quickTrack.GetString("name"),
				Rating:           quickTrack.GetFloat("rating"),
				Notes:            strings.TrimSpace(quickTrack.GetString("notes")),
				UserID:           quickTrack.GetString("user"),
				UserName:         resolveHomeFeedUserName(user),
				Visibility:       strings.TrimSpace(quickTrack.GetString("visibility")),
				ModerationStatus: strings.TrimSpace(quickTrack.GetString("moderationStatus")),
				ItemDate:         strings.TrimSpace(quickTrack.GetString("itemDate")),
				CreatedAt:        quickTrack.GetString("created"),
				UpdatedAt:        quickTrack.GetString("updated"),
			}
			points = append(points, homeFeedMapPointResponse{
				ID:                 "food_product_" + quickTrack.Id,
				Source:             "food-product",
				EventAt:            row.EventAt,
				Latitude:           row.Latitude.Float64,
				Longitude:          row.Longitude.Float64,
				RestaurantID:       restaurantID,
				RestaurantName:     restaurantName,
				RestaurantLocation: resolveRestaurantLocation(linkedRestaurant),
				LocationText:       foodProduct.LocationText,
				RatingSummaryLabel: ratingSummaryLabel,
				FoodProduct:        foodProduct,
			})
		}
	}

	response.Points = points
	if scope == "friends" {
		redactFriendHomeFeedMapTimestamps(&response)
	}

	return response, nil
}

func countVisitsPageEntries(
	app core.App,
	userID string,
	isAdmin bool,
	scope string,
	search string,
) (int, error) {
	row := struct {
		Count int `db:"count"`
	}{}

	query := `
		WITH accepted_friends AS (
			SELECT friend AS friendId
			FROM friendships
			WHERE user = {:userId} AND status = 'accepted'
			UNION
			SELECT user AS friendId
			FROM friendships
			WHERE friend = {:userId} AND status = 'accepted'
		)
		SELECT COUNT(*) AS [[count]]
		FROM visits
		LEFT JOIN restaurants ON restaurants.id = visits.restaurant
		WHERE ` + buildVisitsPageAccessCondition(scope, isAdmin) + ` AND ` + buildHomeFeedVisitSearchCondition(search)

	err := app.DB().NewQuery(query).
		Bind(dbx.Params{
			"userId":     userID,
			"searchLike": buildHomeFeedSearchLike(search),
		}).
		One(&row)
	if err != nil {
		return 0, err
	}

	return row.Count, nil
}

func listVisitPageRows(
	app core.App,
	userID string,
	isAdmin bool,
	page int,
	pageSize int,
	scope string,
	search string,
) ([]visitPageRow, error) {
	query := `
		WITH accepted_friends AS (
			SELECT friend AS friendId
			FROM friendships
			WHERE user = {:userId} AND status = 'accepted'
			UNION
			SELECT user AS friendId
			FROM friendships
			WHERE friend = {:userId} AND status = 'accepted'
		)
		SELECT visits.id AS [[recordId]]
		FROM visits
		LEFT JOIN restaurants ON restaurants.id = visits.restaurant
		WHERE ` + buildVisitsPageAccessCondition(scope, isAdmin) + ` AND ` + buildHomeFeedVisitSearchCondition(search) + `
		ORDER BY
			COALESCE(NULLIF(visits.visitDate, ''), visits.created) DESC,
			visits.created DESC,
			visits.id DESC
		LIMIT {:limit}
		OFFSET {:offset}
	`

	rows := []visitPageRow{}
	err := app.DB().NewQuery(query).
		Bind(dbx.Params{
			"userId":     userID,
			"searchLike": buildHomeFeedSearchLike(search),
			"limit":      pageSize,
			"offset":     (page - 1) * pageSize,
		}).
		All(&rows)
	if err != nil {
		return nil, err
	}

	return rows, nil
}

func countHomeFeedEntries(
	app core.App,
	userID string,
	isAdmin bool,
	scope string,
	search string,
	typeFilter string,
) (homeFeedCountsRow, error) {
	row := homeFeedCountsRow{}
	params := dbx.Params{
		"userId":     userID,
		"searchLike": buildHomeFeedSearchLike(search),
	}

	visitCountExpr := "0"
	if typeFilter != "food-products" {
		visitCountExpr = `SELECT COUNT(*) FROM visits
			LEFT JOIN restaurants ON restaurants.id = visits.restaurant
			WHERE ` + buildHomeFeedVisitAccessCondition(scope, isAdmin) + ` AND ` + buildHomeFeedVisitSearchCondition(search)
	}

	quickTrackCountExpr := "0"
	if typeFilter != "visits" {
		quickTrackCountExpr = `SELECT COUNT(*) FROM food_items
			LEFT JOIN visits linked_visits ON linked_visits.id = food_items.visit
			LEFT JOIN restaurants linked_restaurants ON linked_restaurants.id = linked_visits.restaurant
			WHERE ` + buildHomeFeedQuickTrackAccessCondition(scope, isAdmin) + ` AND ` + buildHomeFeedQuickTrackSearchCondition(search)
	}

	query := fmt.Sprintf(`
		WITH accepted_friends AS (
			SELECT friend AS friendId
			FROM friendships
			WHERE user = {:userId} AND status = 'accepted'
			UNION
			SELECT user AS friendId
			FROM friendships
			WHERE friend = {:userId} AND status = 'accepted'
		)
		SELECT
			(%s) AS [[totalVisits]],
			(%s) AS [[totalFoodProducts]]
	`, visitCountExpr, quickTrackCountExpr)

	err := app.DB().NewQuery(query).Bind(params).One(&row)
	return row, err
}

func listHomeFeedEntryRows(
	app core.App,
	userID string,
	isAdmin bool,
	page int,
	pageSize int,
	scope string,
	search string,
	sort string,
	typeFilter string,
) ([]homeFeedEntryRow, error) {
	params := dbx.Params{
		"userId":     userID,
		"searchLike": buildHomeFeedSearchLike(search),
		"limit":      pageSize + 1,
		"offset":     (page - 1) * pageSize,
	}
	visitEventAtExpression := "COALESCE(NULLIF(visits.visitDate, ''), visits.created)"
	quickTrackEventAtExpression := "COALESCE(NULLIF(food_items.itemDate, ''), food_items.created)"
	if sort == "created" {
		visitEventAtExpression = "visits.created"
		quickTrackEventAtExpression = "food_items.created"
	}

	selects := make([]string, 0, 2)
	if typeFilter != "food-products" {
		selects = append(selects, `
			SELECT
				'visit' AS source,
				visits.id AS recordId,
				`+visitEventAtExpression+` AS eventAt,
				visits.created AS createdAt
			FROM visits
			LEFT JOIN restaurants ON restaurants.id = visits.restaurant
			WHERE `+buildHomeFeedVisitAccessCondition(scope, isAdmin)+` AND `+buildHomeFeedVisitSearchCondition(search))
	}
	if typeFilter != "visits" {
		selects = append(selects, `
			SELECT
				'food-product' AS source,
				food_items.id AS recordId,
				`+quickTrackEventAtExpression+` AS eventAt,
				food_items.created AS createdAt
			FROM food_items
			LEFT JOIN visits linked_visits ON linked_visits.id = food_items.visit
			LEFT JOIN restaurants linked_restaurants ON linked_restaurants.id = linked_visits.restaurant
			WHERE `+buildHomeFeedQuickTrackAccessCondition(scope, isAdmin)+` AND `+buildHomeFeedQuickTrackSearchCondition(search))
	}

	if len(selects) == 0 {
		return []homeFeedEntryRow{}, nil
	}

	query := `
		WITH accepted_friends AS (
			SELECT friend AS friendId
			FROM friendships
			WHERE user = {:userId} AND status = 'accepted'
			UNION
			SELECT user AS friendId
			FROM friendships
			WHERE friend = {:userId} AND status = 'accepted'
		),
		filtered_entries AS (
			` + strings.Join(selects, `
			UNION ALL
			`) + `
		)
		SELECT
			filtered_entries.source AS [[source]],
			filtered_entries.recordId AS [[recordId]],
			filtered_entries.eventAt AS [[eventAt]],
			filtered_entries.createdAt AS [[createdAt]]
		FROM filtered_entries
		ORDER BY filtered_entries.eventAt DESC, filtered_entries.createdAt DESC, filtered_entries.recordId DESC
		LIMIT {:limit} OFFSET {:offset}
	`

	rows := []homeFeedEntryRow{}
	err := app.DB().NewQuery(query).Bind(params).All(&rows)
	return rows, err
}

func countHomeFeedMapEntries(
	app core.App,
	userID string,
	isAdmin bool,
	scope string,
	search string,
	typeFilter string,
) (homeFeedMapCountsRow, error) {
	params := dbx.Params{
		"userId":     userID,
		"searchLike": buildHomeFeedSearchLike(search),
	}

	selects := make([]string, 0, 2)
	if typeFilter != "food-products" {
		selects = append(selects, `
			SELECT
				visits.id AS recordId,
				restaurants.latitude AS latitude,
				restaurants.longitude AS longitude
			FROM visits
			LEFT JOIN restaurants ON restaurants.id = visits.restaurant
			WHERE `+buildHomeFeedVisitAccessCondition(scope, isAdmin)+` AND `+buildHomeFeedVisitSearchCondition(search))
	}
	if typeFilter != "visits" {
		selects = append(selects, `
			SELECT
				food_items.id AS recordId,
				linked_restaurants.latitude AS latitude,
				linked_restaurants.longitude AS longitude
			FROM food_items
			LEFT JOIN visits linked_visits ON linked_visits.id = food_items.visit
			LEFT JOIN restaurants linked_restaurants ON linked_restaurants.id = linked_visits.restaurant
			WHERE `+buildHomeFeedQuickTrackAccessCondition(scope, isAdmin)+` AND `+buildHomeFeedQuickTrackSearchCondition(search))
	}

	if len(selects) == 0 {
		return homeFeedMapCountsRow{}, nil
	}

	query := `
		WITH accepted_friends AS (
			SELECT friend AS friendId
			FROM friendships
			WHERE user = {:userId} AND status = 'accepted'
			UNION
			SELECT user AS friendId
			FROM friendships
			WHERE friend = {:userId} AND status = 'accepted'
		),
		filtered_entries AS (
			` + strings.Join(selects, `
			UNION ALL
			`) + `
		)
		SELECT
			COUNT(*) AS [[totalEntries]],
			COALESCE(SUM(CASE
				WHEN latitude IS NOT NULL
					AND longitude IS NOT NULL
					AND NOT (latitude = 0 AND longitude = 0)
				THEN 1
				ELSE 0
			END), 0) AS [[entriesWithCoords]]
		FROM filtered_entries
	`

	row := homeFeedMapCountsRow{}
	err := app.DB().NewQuery(query).Bind(params).One(&row)
	return row, err
}

func listHomeFeedMapEntryRows(
	app core.App,
	userID string,
	isAdmin bool,
	scope string,
	search string,
	sort string,
	typeFilter string,
) ([]homeFeedMapEntryRow, error) {
	params := dbx.Params{
		"userId":     userID,
		"searchLike": buildHomeFeedSearchLike(search),
		"limit":      maxHomeFeedMapPoints,
	}
	visitEventAtExpression := "COALESCE(NULLIF(visits.visitDate, ''), visits.created)"
	quickTrackEventAtExpression := "COALESCE(NULLIF(food_items.itemDate, ''), food_items.created)"
	if sort == "created" {
		visitEventAtExpression = "visits.created"
		quickTrackEventAtExpression = "food_items.created"
	}

	selects := make([]string, 0, 2)
	if typeFilter != "food-products" {
		selects = append(selects, `
			SELECT
				'visit' AS source,
				visits.id AS recordId,
				`+visitEventAtExpression+` AS eventAt,
				visits.created AS createdAt,
				restaurants.latitude AS latitude,
				restaurants.longitude AS longitude
			FROM visits
			LEFT JOIN restaurants ON restaurants.id = visits.restaurant
			WHERE `+buildHomeFeedVisitAccessCondition(scope, isAdmin)+` AND `+buildHomeFeedVisitSearchCondition(search)+`
				AND restaurants.latitude IS NOT NULL
				AND restaurants.longitude IS NOT NULL
				AND NOT (restaurants.latitude = 0 AND restaurants.longitude = 0)`)
	}
	if typeFilter != "visits" {
		selects = append(selects, `
			SELECT
				'food-product' AS source,
				food_items.id AS recordId,
				`+quickTrackEventAtExpression+` AS eventAt,
				food_items.created AS createdAt,
				linked_restaurants.latitude AS latitude,
				linked_restaurants.longitude AS longitude
			FROM food_items
			LEFT JOIN visits linked_visits ON linked_visits.id = food_items.visit
			LEFT JOIN restaurants linked_restaurants ON linked_restaurants.id = linked_visits.restaurant
			WHERE `+buildHomeFeedQuickTrackAccessCondition(scope, isAdmin)+` AND `+buildHomeFeedQuickTrackSearchCondition(search)+`
				AND linked_restaurants.latitude IS NOT NULL
				AND linked_restaurants.longitude IS NOT NULL
				AND NOT (linked_restaurants.latitude = 0 AND linked_restaurants.longitude = 0)`)
	}

	if len(selects) == 0 {
		return []homeFeedMapEntryRow{}, nil
	}

	query := `
		WITH accepted_friends AS (
			SELECT friend AS friendId
			FROM friendships
			WHERE user = {:userId} AND status = 'accepted'
			UNION
			SELECT user AS friendId
			FROM friendships
			WHERE friend = {:userId} AND status = 'accepted'
		),
		filtered_entries AS (
			` + strings.Join(selects, `
			UNION ALL
			`) + `
		)
		SELECT
			filtered_entries.source AS [[source]],
			filtered_entries.recordId AS [[recordId]],
			filtered_entries.eventAt AS [[eventAt]],
			filtered_entries.createdAt AS [[createdAt]],
			filtered_entries.latitude AS [[latitude]],
			filtered_entries.longitude AS [[longitude]]
		FROM filtered_entries
		ORDER BY filtered_entries.eventAt DESC, filtered_entries.createdAt DESC, filtered_entries.recordId DESC
		LIMIT {:limit}
	`

	rows := []homeFeedMapEntryRow{}
	err := app.DB().NewQuery(query).Bind(params).All(&rows)
	return rows, err
}

func buildHomeFeedVisitAccessCondition(scope string, isAdmin bool) string {
	if isAdmin {
		switch scope {
		case "mine":
			return `visits.user = {:userId}`
		case "friends":
			return `visits.user IN (SELECT friendId FROM accepted_friends)`
		default:
			return `1 = 1`
		}
	}

	ownerCondition := `visits.user = {:userId} AND ` + ownerAccessibleVisitModerationCondition
	friendCondition := `visits.user IN (SELECT friendId FROM accepted_friends) AND ` + visibleVisitModerationCondition + ` AND (visits.visibility = 'public' OR visits.visibility = 'friends')`

	switch scope {
	case "mine":
		return ownerCondition
	case "friends":
		return friendCondition
	default:
		return `( (` + ownerCondition + `) OR (` + friendCondition + `) )`
	}
}

func buildVisitsPageAccessCondition(scope string, isAdmin bool) string {
	if isAdmin {
		switch scope {
		case "mine":
			return `visits.user = {:userId}`
		case "friends":
			return `visits.user IN (SELECT friendId FROM accepted_friends)`
		default:
			return `1 = 1`
		}
	}

	ownerCondition := `visits.user = {:userId} AND ` + ownerAccessibleVisitModerationCondition
	visibleSharedCondition := `visits.user != {:userId} AND ` + visibleVisitModerationCondition + ` AND (
		visits.visibility = 'public'
		OR (
			visits.visibility = 'friends'
			AND visits.user IN (SELECT friendId FROM accepted_friends)
		)
	)`

	switch scope {
	case "mine":
		return ownerCondition
	case "friends":
		return visibleSharedCondition
	default:
		return `( (` + ownerCondition + `) OR (` + visibleSharedCondition + `) )`
	}
}

func buildHomeFeedQuickTrackAccessCondition(scope string, isAdmin bool) string {
	if isAdmin {
		switch scope {
		case "mine":
			return foodProductSQL("food_items") + ` AND food_items.user = {:userId}`
		case "friends":
			return foodProductSQL("food_items") + ` AND food_items.user IN (SELECT friendId FROM accepted_friends)`
		default:
			return foodProductSQL("food_items")
		}
	}

	ownerCondition := foodProductSQL("food_items") + ` AND food_items.user = {:userId} AND ` + ownerAccessibleQuickTrackModerationCondition
	friendCondition := foodProductSQL("food_items") + ` AND food_items.user IN (SELECT friendId FROM accepted_friends) AND ` + visibleQuickTrackModerationCondition + ` AND (food_items.visibility = 'public' OR food_items.visibility = 'friends')`

	switch scope {
	case "mine":
		return ownerCondition
	case "friends":
		return friendCondition
	default:
		return `( (` + ownerCondition + `) OR (` + friendCondition + `) )`
	}
}

func buildHomeFeedVisitSearchCondition(search string) string {
	if strings.TrimSpace(search) == "" {
		return `1 = 1`
	}

	return `(
		LOWER(COALESCE(restaurants.name, '')) LIKE {:searchLike}
		OR LOWER(COALESCE(restaurants.location, '')) LIKE {:searchLike}
		OR LOWER(COALESCE(restaurants.cuisineType, '')) LIKE {:searchLike}
		OR EXISTS (
			SELECT 1
			FROM food_items visit_items
			WHERE visit_items.visit = visits.id
				AND ` + visitItemSQL("visit_items") + `
				AND (
					LOWER(COALESCE(visit_items.name, '')) LIKE {:searchLike}
					OR LOWER(COALESCE(visit_items.notes, '')) LIKE {:searchLike}
				)
		)
	)`
}

func buildHomeFeedQuickTrackSearchCondition(search string) string {
	if strings.TrimSpace(search) == "" {
		return `1 = 1`
	}

	return `(
		LOWER(COALESCE(food_items.name, '')) LIKE {:searchLike}
		OR LOWER(COALESCE(food_items.itemCategory, '')) LIKE {:searchLike}
		OR LOWER(COALESCE(food_items.notes, '')) LIKE {:searchLike}
		OR LOWER(COALESCE(food_items.location_text, '')) LIKE {:searchLike}
		OR LOWER(COALESCE(linked_restaurants.name, '')) LIKE {:searchLike}
	)`
}

func buildHomeFeedSearchLike(search string) string {
	return "%" + strings.ToLower(strings.TrimSpace(search)) + "%"
}

func mapHomeFeedVisitItems(records []*core.Record) []visitItemResponse {
	items := make([]visitItemResponse, 0, len(records))
	for _, record := range records {
		items = append(items, visitItemResponse{
			ID:          record.Id,
			Name:        record.GetString("name"),
			Rating:      record.GetFloat("rating"),
			Description: strings.TrimSpace(record.GetString("description")),
			Notes:       strings.TrimSpace(record.GetString("notes")),
		})
	}

	return items
}

func formatHomeFeedSingleRatingSummary(rating float64) string {
	if rating <= 0 {
		return "Unrated"
	}

	return fmt.Sprintf("%.1f rating", rating)
}

func formatHomeFeedVisitRatingSummary(records []*core.Record) string {
	if len(records) == 0 {
		return "No items"
	}

	total := 0.0
	ratedCount := 0
	for _, record := range records {
		rating := record.GetFloat("rating")
		if rating <= 0 {
			continue
		}
		total += rating
		ratedCount += 1
	}
	if ratedCount == 0 {
		return "Unrated"
	}

	return fmt.Sprintf("%.1f avg", total/float64(ratedCount))
}

func mapHomeFeedPhotoPreview(record *core.Record) homeFeedPhotoPreviewResponse {
	collectionName := ""
	collectionID := ""
	if collection := record.Collection(); collection != nil {
		collectionName = collection.Name
		collectionID = collection.Id
	}

	return homeFeedPhotoPreviewResponse{
		ID:             record.Id,
		FoodItemID:     strings.TrimSpace(record.GetString("food_item")),
		Photo:          record.GetString("photo"),
		CollectionID:   collectionID,
		CollectionName: collectionName,
		Created:        record.GetString("created"),
	}
}

func redactFriendHomeFeedTimestamp(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}

	if len(trimmed) >= 7 {
		return trimmed[:7]
	}

	return trimmed
}

func redactFriendHomeFeedTimestamps(response *homeFeedResponse) {
	for index := range response.PhotoPreviews {
		response.PhotoPreviews[index].Created = redactFriendHomeFeedTimestamp(response.PhotoPreviews[index].Created)
	}

	for index := range response.Items {
		response.Items[index].EventAt = redactFriendHomeFeedTimestamp(response.Items[index].EventAt)
		if response.Items[index].Visit != nil {
			response.Items[index].Visit.VisitedAt = redactFriendHomeFeedTimestamp(response.Items[index].Visit.VisitedAt)
			response.Items[index].Visit.CreatedAt = redactFriendHomeFeedTimestamp(response.Items[index].Visit.CreatedAt)
			response.Items[index].Visit.UpdatedAt = redactFriendHomeFeedTimestamp(response.Items[index].Visit.UpdatedAt)
		}

		if response.Items[index].FoodProduct != nil {
			response.Items[index].FoodProduct.ItemDate = redactFriendHomeFeedTimestamp(response.Items[index].FoodProduct.ItemDate)
			response.Items[index].FoodProduct.CreatedAt = redactFriendHomeFeedTimestamp(response.Items[index].FoodProduct.CreatedAt)
			response.Items[index].FoodProduct.UpdatedAt = redactFriendHomeFeedTimestamp(response.Items[index].FoodProduct.UpdatedAt)
		}
	}
}

func redactFriendHomeFeedMapTimestamps(response *homeFeedMapPointsResponse) {
	for index := range response.Points {
		response.Points[index].EventAt = redactFriendHomeFeedTimestamp(response.Points[index].EventAt)
		if response.Points[index].Visit != nil {
			response.Points[index].Visit.VisitedAt = redactFriendHomeFeedTimestamp(response.Points[index].Visit.VisitedAt)
			response.Points[index].Visit.CreatedAt = redactFriendHomeFeedTimestamp(response.Points[index].Visit.CreatedAt)
			response.Points[index].Visit.UpdatedAt = redactFriendHomeFeedTimestamp(response.Points[index].Visit.UpdatedAt)
		}

		if response.Points[index].FoodProduct != nil {
			response.Points[index].FoodProduct.ItemDate = redactFriendHomeFeedTimestamp(response.Points[index].FoodProduct.ItemDate)
			response.Points[index].FoodProduct.CreatedAt = redactFriendHomeFeedTimestamp(response.Points[index].FoodProduct.CreatedAt)
			response.Points[index].FoodProduct.UpdatedAt = redactFriendHomeFeedTimestamp(response.Points[index].FoodProduct.UpdatedAt)
		}
	}
}

func resolveHomeFeedUserName(record *core.Record) string {
	if record == nil {
		return ""
	}

	name := strings.TrimSpace(record.GetString("name"))
	if name != "" {
		return name
	}

	email := strings.TrimSpace(record.GetString("email"))
	if email == "" {
		return ""
	}

	parts := strings.SplitN(email, "@", 2)
	return parts[0]
}

func defaultString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}

	return value
}

func listRecentRestaurantsSummary(
	app core.App,
	userID string,
	limit int,
	isAdmin bool,
) ([]restaurantSearchResult, error) {
	normalizedLimit := clampRecentRestaurantLimit(limit)
	if normalizedLimit <= 0 {
		return []restaurantSearchResult{}, nil
	}

	restaurantAccessCondition := `
			restaurants.visibility = 'public'
			OR restaurants.createdBy = {:userId}
			OR (
				restaurants.visibility = 'friends'
				AND restaurants.createdBy IN (SELECT friendId FROM accepted_friends)
			)
	`

	query := `
		WITH accepted_friends AS (
			SELECT friend AS friendId
			FROM friendships
			WHERE user = {:userId} AND status = 'accepted'
			UNION
			SELECT user AS friendId
			FROM friendships
			WHERE friend = {:userId} AND status = 'accepted'
		),
		ranked_visits AS (
			SELECT
				visits.restaurant AS restaurantId,
				visits.visitDate AS visitDate,
				visits.updated AS updatedAt,
				visits.created AS createdAt,
				ROW_NUMBER() OVER (
					PARTITION BY visits.restaurant
					ORDER BY visits.visitDate DESC, visits.updated DESC, visits.created DESC, visits.id DESC
				) AS visitRank
			FROM visits
			JOIN restaurants ON restaurants.id = visits.restaurant
			WHERE visits.user = {:userId}
				AND TRIM(visits.restaurant) != ''
	`

	if !isAdmin {
		query += `
				AND ` + ownerAccessibleVisitModerationCondition + `
				AND (` + restaurantAccessCondition + `)
		`
	}

	query += `
		)
		SELECT ranked_visits.restaurantId AS [[restaurantId]]
		FROM ranked_visits
		WHERE ranked_visits.visitRank = 1
		ORDER BY ranked_visits.visitDate DESC, ranked_visits.updatedAt DESC, ranked_visits.createdAt DESC, ranked_visits.restaurantId DESC
		LIMIT {:limit}
	`

	rows := []recentRestaurantIDRow{}
	err := app.DB().NewQuery(query).
		Bind(dbx.Params{
			"userId": userID,
			"limit":  normalizedLimit,
		}).
		All(&rows)
	if err != nil {
		return nil, err
	}

	restaurantIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		restaurantIDs = append(restaurantIDs, row.RestaurantID)
	}

	return buildRestaurantSelectionSummaries(app, userID, isAdmin, restaurantIDs)
}

func listRestaurantSuggestionsSummary(
	app core.App,
	userID string,
	limit int,
	search string,
	isAdmin bool,
) ([]restaurantSearchResult, error) {
	normalizedLimit := clampRestaurantSuggestionsLimit(limit)
	if normalizedLimit <= 0 {
		return []restaurantSearchResult{}, nil
	}

	normalizedSearch := strings.ToLower(strings.TrimSpace(search))
	if normalizedSearch != "" {
		return searchRestaurantSuggestionsSummary(app, userID, isAdmin, normalizedLimit, normalizedSearch)
	}

	return listInitialRestaurantSuggestionsSummary(app, userID, isAdmin, normalizedLimit)
}

func listInitialRestaurantSuggestionsSummary(
	app core.App,
	userID string,
	isAdmin bool,
	limit int,
) ([]restaurantSearchResult, error) {
	restaurantAccessCondition := `
			restaurants.visibility = 'public'
			OR restaurants.createdBy = {:userId}
			OR (
				restaurants.visibility = 'friends'
				AND restaurants.createdBy IN (SELECT friendId FROM accepted_friends)
			)
	`

	query := `
		WITH accepted_friends AS (
			SELECT friend AS friendId
			FROM friendships
			WHERE user = {:userId} AND status = 'accepted'
			UNION
			SELECT user AS friendId
			FROM friendships
			WHERE friend = {:userId} AND status = 'accepted'
		),
		ranked_visits AS (
			SELECT
				visits.restaurant AS restaurantId,
				visits.visitDate AS visitDate,
				visits.updated AS updatedAt,
				visits.created AS createdAt,
				ROW_NUMBER() OVER (
					PARTITION BY visits.restaurant
					ORDER BY visits.visitDate DESC, visits.updated DESC, visits.created DESC, visits.id DESC
				) AS visitRank
			FROM visits
			JOIN restaurants ON restaurants.id = visits.restaurant
			WHERE visits.user = {:userId}
				AND TRIM(visits.restaurant) != ''
	`

	if !isAdmin {
		query += `
				AND ` + ownerAccessibleVisitModerationCondition + `
				AND (` + restaurantAccessCondition + `)
		`
	}

	query += `
		),
		recent_restaurants AS (
			SELECT
				ranked_visits.restaurantId AS restaurantId,
				ranked_visits.visitDate AS sortAt,
				ranked_visits.updatedAt AS updatedAt,
				ranked_visits.createdAt AS createdAt,
				0 AS sortGroup
			FROM ranked_visits
			WHERE ranked_visits.visitRank = 1
		),
		created_restaurants AS (
			SELECT
				restaurants.id AS restaurantId,
				restaurants.updated AS sortAt,
				restaurants.updated AS updatedAt,
				restaurants.created AS createdAt,
				1 AS sortGroup
			FROM restaurants
			WHERE restaurants.createdBy = {:userId}
				AND NOT EXISTS (
					SELECT 1
					FROM recent_restaurants
					WHERE recent_restaurants.restaurantId = restaurants.id
				)
		),
		friend_restaurants AS (
			SELECT
				restaurants.id AS restaurantId,
				restaurants.updated AS sortAt,
				restaurants.updated AS updatedAt,
				restaurants.created AS createdAt,
				2 AS sortGroup
			FROM restaurants
			WHERE restaurants.visibility = 'friends'
				AND restaurants.createdBy IN (SELECT friendId FROM accepted_friends)
				AND NOT EXISTS (
					SELECT 1
					FROM recent_restaurants
					WHERE recent_restaurants.restaurantId = restaurants.id
				)
		),
		suggestions AS (
			SELECT * FROM recent_restaurants
			UNION ALL
			SELECT * FROM created_restaurants
			UNION ALL
			SELECT * FROM friend_restaurants
		)
		SELECT suggestions.restaurantId AS [[restaurantId]]
		FROM suggestions
		ORDER BY suggestions.sortGroup ASC, suggestions.sortAt DESC, suggestions.updatedAt DESC, suggestions.createdAt DESC, suggestions.restaurantId DESC
		LIMIT {:limit}
	`

	rows := []restaurantSearchIDRow{}
	err := app.DB().NewQuery(query).
		Bind(dbx.Params{
			"limit":  limit,
			"userId": userID,
		}).
		All(&rows)
	if err != nil {
		return nil, err
	}

	restaurantIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		restaurantIDs = append(restaurantIDs, row.RestaurantID)
	}

	return buildRestaurantSelectionSummaries(app, userID, isAdmin, restaurantIDs)
}

func searchRestaurantSuggestionsSummary(
	app core.App,
	userID string,
	isAdmin bool,
	limit int,
	normalizedSearch string,
) ([]restaurantSearchResult, error) {
	params := dbx.Params{
		"limit":            limit,
		"normalizedSearch": normalizedSearch,
		"searchLike":       "%" + normalizedSearch + "%",
		"userId":           userID,
	}

	query := buildRestaurantSearchBaseQuery(isAdmin) + `
		SELECT restaurants.id AS [[restaurantId]]
		FROM restaurants
		WHERE ` + restaurantSearchFilterClause()
	if !isAdmin {
		query += `
			AND (` + restaurantAccessCondition() + `)
		`
	}
	query += `
		ORDER BY LOWER(TRIM(COALESCE(restaurants.name, ''))) ASC, LOWER(TRIM(COALESCE(restaurants.location, ''))) ASC, restaurants.id ASC
		LIMIT {:limit}
	`

	rows := []restaurantSearchIDRow{}
	if err := app.DB().NewQuery(query).Bind(params).All(&rows); err != nil {
		return nil, err
	}

	restaurantIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		restaurantIDs = append(restaurantIDs, row.RestaurantID)
	}

	return buildRestaurantSelectionSummaries(app, userID, isAdmin, restaurantIDs)
}

func searchRestaurantsSummaryPage(
	app core.App,
	userID string,
	isAdmin bool,
	page int,
	pageSize int,
	search string,
) (restaurantSearchPageResponse, error) {
	response := restaurantSearchPageResponse{
		Items:    []restaurantSearchResult{},
		Page:     page,
		PageSize: pageSize,
	}

	normalizedSearch := strings.ToLower(strings.TrimSpace(search))
	if normalizedSearch == "" {
		return response, nil
	}

	params := dbx.Params{
		"normalizedSearch": normalizedSearch,
		"searchLike":       "%" + normalizedSearch + "%",
		"userId":           userID,
	}

	countRow := struct {
		TotalItems int `db:"totalItems"`
	}{}

	countQuery := buildRestaurantSearchBaseQuery(isAdmin) + `
		SELECT COUNT(*) AS [[totalItems]]
		FROM restaurants
		WHERE ` + restaurantSearchFilterClause()
	if !isAdmin {
		countQuery += `
			AND (` + restaurantAccessCondition() + `)
		`
	}

	if err := app.DB().NewQuery(countQuery).
		Bind(params).
		One(&countRow); err != nil {
		return response, err
	}

	response.TotalItems = countRow.TotalItems
	if countRow.TotalItems == 0 {
		return response, nil
	}

	response.TotalPages = (countRow.TotalItems + pageSize - 1) / pageSize
	response.HasNextPage = page < response.TotalPages

	idRows := []restaurantSearchIDRow{}
	pageQuery := buildRestaurantSearchBaseQuery(isAdmin) + `
		SELECT restaurants.id AS [[restaurantId]]
		FROM restaurants
		WHERE ` + restaurantSearchFilterClause()
	if !isAdmin {
		pageQuery += `
			AND (` + restaurantAccessCondition() + `)
		`
	}
	pageQuery += `
		ORDER BY LOWER(TRIM(COALESCE(restaurants.name, ''))) ASC, LOWER(TRIM(COALESCE(restaurants.location, ''))) ASC, restaurants.id ASC
		LIMIT {:limit}
		OFFSET {:offset}
	`

	if err := app.DB().NewQuery(pageQuery).
		Bind(dbx.Params{
			"limit":            pageSize,
			"normalizedSearch": normalizedSearch,
			"offset":           (page - 1) * pageSize,
			"searchLike":       "%" + normalizedSearch + "%",
			"userId":           userID,
		}).
		All(&idRows); err != nil {
		return response, err
	}

	restaurantIDs := make([]string, 0, len(idRows))
	for _, row := range idRows {
		restaurantIDs = append(restaurantIDs, row.RestaurantID)
	}

	items, err := buildRestaurantSelectionSummaries(app, userID, isAdmin, restaurantIDs)
	if err != nil {
		return response, err
	}
	response.Items = items

	return response, nil
}

func buildRestaurantSearchBaseQuery(isAdmin bool) string {
	if isAdmin {
		return ""
	}

	return `
		WITH accepted_friends AS (
			SELECT friend AS friendId
			FROM friendships
			WHERE user = {:userId} AND status = 'accepted'
			UNION
			SELECT user AS friendId
			FROM friendships
			WHERE friend = {:userId} AND status = 'accepted'
		)
	`
}

func restaurantSearchFilterClause() string {
	return `
		(
			INSTR(LOWER(TRIM(COALESCE(restaurants.name, ''))), {:normalizedSearch}) > 0
			OR INSTR(LOWER(TRIM(COALESCE(restaurants.location, ''))), {:normalizedSearch}) > 0
			OR INSTR(LOWER(TRIM(COALESCE(restaurants.cuisineType, ''))), {:normalizedSearch}) > 0
		)
	`
}

func restaurantAccessCondition() string {
	return `
		restaurants.visibility = 'public'
		OR restaurants.createdBy = {:userId}
		OR (
			restaurants.visibility = 'friends'
			AND restaurants.createdBy IN (SELECT friendId FROM accepted_friends)
		)
	`
}

func buildRestaurantSelectionSummaries(
	app core.App,
	userID string,
	isAdmin bool,
	restaurantIDs []string,
) ([]restaurantSearchResult, error) {
	normalizedRestaurantIDs := normalizeRestaurantIDs(restaurantIDs)
	if len(normalizedRestaurantIDs) == 0 {
		return []restaurantSearchResult{}, nil
	}

	encodedRestaurantIDs, err := json.Marshal(normalizedRestaurantIDs)
	if err != nil {
		return nil, err
	}

	ownerCondition := "visits.user = {:userId}"
	friendCondition := "visits.user != {:userId} AND visits.user IN (SELECT friendId FROM accepted_friends)"
	if !isAdmin {
		ownerCondition += " AND " + ownerAccessibleVisitModerationCondition
		friendCondition += " AND " + visibleVisitModerationCondition + " AND (visits.visibility = 'public' OR visits.visibility = 'friends')"
	}

	query := fmt.Sprintf(`
		WITH requested_restaurants AS (
			SELECT TRIM(value) AS restaurantId, CAST(key AS INTEGER) AS sortOrder
			FROM json_each({:restaurantIdsJson})
			WHERE TRIM(value) != ''
		),
		accepted_friends AS (
			SELECT friend AS friendId
			FROM friendships
			WHERE user = {:userId} AND status = 'accepted'
			UNION
			SELECT user AS friendId
			FROM friendships
			WHERE friend = {:userId} AND status = 'accepted'
		),
		visit_stats AS (
			SELECT
				requested_restaurants.restaurantId AS restaurantId,
				COALESCE(
					SUM(
						CASE
							WHEN %s THEN 1
							ELSE 0
						END
					),
					0
				) AS userVisitCount,
				COALESCE(
					COUNT(
						DISTINCT CASE
							WHEN %s THEN visits.user
							ELSE NULL
						END
					),
					0
				) AS friendCount
			FROM requested_restaurants
			LEFT JOIN visits ON visits.restaurant = requested_restaurants.restaurantId
			GROUP BY requested_restaurants.restaurantId
		),
		review_stats AS (
			SELECT
				requested_restaurants.restaurantId AS restaurantId,
				CASE
					WHEN COUNT(menu_review_requests.id) > 0 THEN 1
					ELSE 0
				END AS hasPendingMenuReview
			FROM requested_restaurants
			LEFT JOIN menu_review_requests
				ON menu_review_requests.restaurant = requested_restaurants.restaurantId
				AND menu_review_requests.status = 'pending'
			GROUP BY requested_restaurants.restaurantId
		)
		SELECT
			requested_restaurants.restaurantId AS [[restaurantId]],
			COALESCE(restaurants.name, '') AS [[name]],
			COALESCE(restaurants.location, '') AS [[location]],
			COALESCE(restaurants.cuisineType, '') AS [[cuisineType]],
			COALESCE(restaurants.visibility, '') AS [[visibility]],
			restaurants.latitude AS [[latitude]],
			restaurants.longitude AS [[longitude]],
			COALESCE(restaurants.placeId, '') AS [[placeId]],
			COALESCE(restaurants.isGooglePlace, 0) AS [[isGooglePlace]],
			COALESCE(visit_stats.userVisitCount, 0) AS [[userVisitCount]],
			COALESCE(visit_stats.friendCount, 0) AS [[friendCount]],
			COALESCE(review_stats.hasPendingMenuReview, 0) AS [[hasPendingMenuReview]]
		FROM requested_restaurants
		LEFT JOIN restaurants ON restaurants.id = requested_restaurants.restaurantId
		LEFT JOIN visit_stats ON visit_stats.restaurantId = requested_restaurants.restaurantId
		LEFT JOIN review_stats ON review_stats.restaurantId = requested_restaurants.restaurantId
		ORDER BY requested_restaurants.sortOrder ASC
	`, ownerCondition, friendCondition)

	rows := []restaurantSelectionSummaryRow{}
	if err := app.DB().NewQuery(query).
		Bind(dbx.Params{
			"restaurantIdsJson": string(encodedRestaurantIDs),
			"userId":            userID,
		}).
		All(&rows); err != nil {
		return nil, err
	}

	result := make([]restaurantSearchResult, 0, len(rows))
	for _, row := range rows {
		if strings.TrimSpace(row.Name) == "" {
			continue
		}

		entry := restaurantSearchResult{
			ID:                   row.RestaurantID,
			Name:                 strings.TrimSpace(row.Name),
			City:                 strings.TrimSpace(row.Location),
			Location:             strings.TrimSpace(row.Location),
			CuisineType:          strings.TrimSpace(row.CuisineType),
			Visibility:           strings.TrimSpace(row.Visibility),
			PlaceID:              strings.TrimSpace(row.PlaceID),
			IsGooglePlace:        row.IsGooglePlace,
			UserVisitCount:       row.UserVisitCount,
			FriendCount:          row.FriendCount,
			HasPendingMenuReview: row.HasPendingMenuReview > 0,
		}
		if row.Latitude.Valid {
			entry.Latitude = &row.Latitude.Float64
		}
		if row.Longitude.Valid {
			entry.Longitude = &row.Longitude.Float64
		}

		result = append(result, entry)
	}

	return result, nil
}

func listRestaurantMenuItemSummaries(
	app core.App,
	authRecord *core.Record,
	restaurantID string,
) ([]menuItemSelectionSummary, error) {
	if authRecord == nil {
		return []menuItemSelectionSummary{}, apis.NewUnauthorizedError("authentication required", nil)
	}

	viewerUserID := strings.TrimSpace(authRecord.Id)
	isAdmin := authRecord.GetBool("isAdmin")
	acceptedFriendIDs := map[string]struct{}{}
	if !isAdmin && viewerUserID != "" {
		friendIDs, err := listAcceptedFriendIDs(app, viewerUserID)
		if err != nil {
			return nil, apis.NewApiError(500, "failed to resolve menu item visibility", err)
		}
		acceptedFriendIDs = friendIDs
	}

	restaurantRecord, err := findAccessibleRestaurantByID(app, restaurantID, viewerUserID, isAdmin, acceptedFriendIDs)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apis.NewNotFoundError("restaurant not found", nil)
		}
		return nil, apis.NewApiError(500, "failed to resolve restaurant", err)
	}

	rows := []menuItemSelectionSummary{}
	query := `
		WITH accepted_friends AS (
			SELECT friend AS friendId
			FROM friendships
			WHERE user = {:userId} AND status = 'accepted'
			UNION
			SELECT user AS friendId
			FROM friendships
			WHERE friend = {:userId} AND status = 'accepted'
		)
		SELECT
			menu_items.id AS [[id]],
			menu_items.restaurant AS [[restaurant]],
			COALESCE(menu_items.name, '') AS [[name]],
			'' AS [[description]],
			COALESCE(menu_items.createdBy, '') AS [[createdBy]],
			COALESCE(menu_items.visibility, '') AS [[visibility]],
			COALESCE(menu_items.isFromOCR, 0) AS [[isFromOCR]],
			COALESCE(menu_items.created, '') AS [[created]],
			COALESCE(menu_items.updated, '') AS [[updated]],
			COALESCE(user_history.userEatenCount, 0) AS [[userEatenCount]],
			COALESCE(friend_history.friendEatenCount, 0) AS [[friendEatenCount]]
		FROM menu_items
		LEFT JOIN (
			SELECT
				LOWER(TRIM(COALESCE(food_items.name, ''))) AS normalizedName,
				COUNT(food_items.id) AS userEatenCount
			FROM food_items
			INNER JOIN visits ON visits.id = food_items.visit
			WHERE food_items.user = {:userId}
				AND COALESCE(food_items.itemType, '') = {:visitItemType}
				AND visits.restaurant = {:restaurantId}
			GROUP BY LOWER(TRIM(COALESCE(food_items.name, '')))
		) user_history ON user_history.normalizedName = LOWER(TRIM(COALESCE(menu_items.name, '')))
		LEFT JOIN (
			SELECT
				LOWER(TRIM(COALESCE(food_items.name, ''))) AS normalizedName,
				COUNT(DISTINCT food_items.user) AS friendEatenCount
			FROM food_items
			INNER JOIN visits ON visits.id = food_items.visit
			WHERE food_items.user != {:userId}
				AND food_items.user IN (SELECT friendId FROM accepted_friends)
				AND COALESCE(food_items.itemType, '') = {:visitItemType}
				AND visits.restaurant = {:restaurantId}
				AND ` + visibleVisitModerationCondition + `
				AND (visits.visibility = 'public' OR visits.visibility = 'friends')
			GROUP BY LOWER(TRIM(COALESCE(food_items.name, '')))
		) friend_history ON friend_history.normalizedName = LOWER(TRIM(COALESCE(menu_items.name, '')))
		WHERE menu_items.restaurant = {:restaurantId}
		ORDER BY menu_items.created DESC, menu_items.id DESC
	`
	if err := app.DB().NewQuery(query).
		Bind(dbx.Params{
			"restaurantId":  restaurantRecord.Id,
			"userId":        viewerUserID,
			"visitItemType": foodItemTypeVisitItem,
		}).
		All(&rows); err != nil {
		return nil, apis.NewApiError(500, "failed to load menu items", err)
	}

	result := make([]menuItemSelectionSummary, 0, len(rows))
	for _, row := range rows {
		record, err := app.FindRecordById("menu_items", row.ID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return nil, apis.NewApiError(500, "failed to resolve menu item", err)
		}
		if !canAccessMenuItemRecord(record, viewerUserID, isAdmin, acceptedFriendIDs) {
			continue
		}

		row.Name = strings.TrimSpace(row.Name)
		row.Description = strings.TrimSpace(row.Description)
		row.CreatedBy = strings.TrimSpace(row.CreatedBy)
		row.Visibility = strings.TrimSpace(row.Visibility)
		result = append(result, row)
	}

	return result, nil
}

func getRestaurantVisitStats(
	app core.App,
	userID string,
	restaurantIDs []string,
	isAdmin bool,
) (restaurantVisitStatsResponse, error) {
	response := restaurantVisitStatsResponse{
		Stats: []restaurantVisitStatsSummary{},
	}

	normalizedRestaurantIDs := normalizeRestaurantIDs(restaurantIDs)
	if len(normalizedRestaurantIDs) == 0 {
		return response, nil
	}

	encodedRestaurantIDs, err := json.Marshal(normalizedRestaurantIDs)
	if err != nil {
		return response, err
	}

	ownerCondition := "visits.user = {:userId}"
	friendCondition := "visits.user != {:userId} AND visits.user IN (SELECT friendId FROM accepted_friends)"
	if !isAdmin {
		ownerCondition += " AND " + ownerAccessibleVisitModerationCondition
		friendCondition += " AND " + visibleVisitModerationCondition + " AND (visits.visibility = 'public' OR visits.visibility = 'friends')"
	}

	query := fmt.Sprintf(`
		WITH requested_restaurants AS (
			SELECT DISTINCT TRIM(value) AS restaurantId
			FROM json_each({:restaurantIdsJson})
			WHERE TRIM(value) != ''
		),
		accepted_friends AS (
			SELECT friend AS friendId
			FROM friendships
			WHERE user = {:userId} AND status = 'accepted'
			UNION
			SELECT user AS friendId
			FROM friendships
			WHERE friend = {:userId} AND status = 'accepted'
		)
		SELECT
			requested_restaurants.restaurantId AS [[restaurantId]],
			COALESCE(
				SUM(
					CASE
						WHEN %s THEN 1
						ELSE 0
					END
				),
				0
			) AS [[userVisitCount]],
			COALESCE(
				COUNT(
					DISTINCT CASE
						WHEN %s THEN visits.user
						ELSE NULL
					END
				),
				0
			) AS [[friendCount]]
		FROM requested_restaurants
		LEFT JOIN visits ON visits.restaurant = requested_restaurants.restaurantId
		GROUP BY requested_restaurants.restaurantId
		ORDER BY requested_restaurants.restaurantId
	`, ownerCondition, friendCondition)

	err = app.DB().NewQuery(query).
		Bind(dbx.Params{
			"restaurantIdsJson": string(encodedRestaurantIDs),
			"userId":            userID,
		}).
		All(&response.Stats)
	if err != nil {
		return response, err
	}

	return response, nil
}

func normalizeRestaurantIDs(restaurantIDs []string) []string {
	if len(restaurantIDs) == 0 {
		return nil
	}

	normalized := make([]string, 0, len(restaurantIDs))
	seen := make(map[string]struct{}, len(restaurantIDs))
	for _, restaurantID := range restaurantIDs {
		trimmedID := strings.TrimSpace(restaurantID)
		if trimmedID == "" {
			continue
		}
		if _, exists := seen[trimmedID]; exists {
			continue
		}

		seen[trimmedID] = struct{}{}
		normalized = append(normalized, trimmedID)
	}

	return normalized
}

func normalizeRecentRestaurantLimit(limitRaw string) (int, error) {
	trimmedLimit := strings.TrimSpace(limitRaw)
	if trimmedLimit == "" {
		return defaultRecentRestaurantLimit, nil
	}

	parsedLimit, err := strconv.Atoi(trimmedLimit)
	if err != nil {
		return 0, fmt.Errorf("limit must be an integer")
	}

	return clampRecentRestaurantLimit(parsedLimit), nil
}

func normalizeRestaurantSuggestionsLimit(limitRaw string) (int, error) {
	trimmedLimit := strings.TrimSpace(limitRaw)
	if trimmedLimit == "" {
		return defaultRestaurantSuggestionsLimit, nil
	}

	parsedLimit, err := strconv.Atoi(trimmedLimit)
	if err != nil {
		return 0, fmt.Errorf("limit must be an integer")
	}

	return clampRestaurantSuggestionsLimit(parsedLimit), nil
}

func clampRecentRestaurantLimit(limit int) int {
	if limit <= 0 {
		return 1
	}

	if limit > maxRecentRestaurantLimit {
		return maxRecentRestaurantLimit
	}

	return limit
}

func clampRestaurantSuggestionsLimit(limit int) int {
	if limit <= 0 {
		return 1
	}

	if limit > maxRestaurantSuggestionsLimit {
		return maxRestaurantSuggestionsLimit
	}

	return limit
}
