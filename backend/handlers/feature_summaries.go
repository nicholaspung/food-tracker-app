package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"

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
const defaultHomeFeedPageSize = 20
const maxHomeFeedPageSize = 50

type noteSummaryResponse struct {
	AllCount   int `db:"allCount" json:"allCount"`
	DraftCount int `db:"draftCount" json:"draftCount"`
	UsedCount  int `db:"usedCount" json:"usedCount"`
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

type recentRestaurantIDRow struct {
	RestaurantID string `db:"restaurantId"`
}

type homeFeedEntryRow struct {
	Source    string `db:"source"`
	RecordID  string `db:"recordId"`
	EventAt   string `db:"eventAt"`
	CreatedAt string `db:"createdAt"`
}

type homeFeedCountsRow struct {
	TotalVisits      int `db:"totalVisits"`
	TotalQuickTracks int `db:"totalQuickTracks"`
}

type homeFeedCursorResponse struct {
	Page int `json:"page"`
}

type homeFeedQuickTrackResponse struct {
	ID               string  `json:"id"`
	RestaurantName   string  `json:"restaurantName"`
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
	Source     string                      `json:"source"`
	EventAt    string                      `json:"eventAt"`
	Visit      *visitResponse              `json:"visit,omitempty"`
	QuickTrack *homeFeedQuickTrackResponse `json:"quickTrack,omitempty"`
}

type homeFeedResponse struct {
	Items            []homeFeedEntryResponse        `json:"items"`
	PhotoPreviews    []homeFeedPhotoPreviewResponse `json:"photoPreviews"`
	Cursor           *homeFeedCursorResponse        `json:"cursor,omitempty"`
	HasNextPage      bool                           `json:"hasNextPage"`
	TotalQuickTracks int                            `json:"totalQuickTracks"`
	TotalVisits      int                            `json:"totalVisits"`
}

// RegisterFeatureSummaryHandlers registers authenticated summary endpoints used by mobile surfaces.
func RegisterFeatureSummaryHandlers(se *core.ServeEvent, app core.App) {
	se.Router.GET("/api/notes/summary", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		summary, err := getNoteSummary(app, e.Auth.Id)
		if err != nil {
			log.Printf("Failed to load notes summary for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load notes summary", err)
		}

		return e.JSON(200, summary)
	})

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
			typeFilter,
		)
		if err != nil {
			log.Printf("Failed to load home feed for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load home feed", err)
		}

		return e.JSON(200, response)
	})

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

func getNoteSummary(app core.App, userID string) (noteSummaryResponse, error) {
	summary := noteSummaryResponse{}
	err := app.DB().NewQuery(`
		SELECT
			COUNT(*) AS [[allCount]],
			COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS [[draftCount]],
			COALESCE(SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END), 0) AS [[usedCount]]
		FROM notes
		WHERE user = {:userId}
	`).
		Bind(dbx.Params{"userId": userID}).
		One(&summary)

	return summary, err
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
	case "quick-track":
		return "quick-track", nil
	default:
		return "", fmt.Errorf("invalid home feed typeFilter")
	}
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
	typeFilter string,
) (homeFeedResponse, error) {
	response := homeFeedResponse{
		Items:         []homeFeedEntryResponse{},
		PhotoPreviews: []homeFeedPhotoPreviewResponse{},
	}

	counts, err := countHomeFeedEntries(app, userID, isAdmin, scope, search, typeFilter)
	if err != nil {
		return response, err
	}

	response.TotalVisits = counts.TotalVisits
	response.TotalQuickTracks = counts.TotalQuickTracks

	rows, err := listHomeFeedEntryRows(app, userID, isAdmin, page, pageSize, scope, search, typeFilter)
	if err != nil {
		return response, err
	}

	response.HasNextPage = len(rows) == pageSize && page*pageSize < (counts.TotalVisits+counts.TotalQuickTracks)
	if response.HasNextPage {
		response.Cursor = &homeFeedCursorResponse{Page: page + 1}
	}

	if len(rows) == 0 {
		return response, nil
	}

	visitIDs := make([]string, 0, len(rows))
	quickTrackIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		switch row.Source {
		case "visit":
			visitIDs = append(visitIDs, row.RecordID)
		case "quick-track":
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
		if record.GetBool("isQuickTrack") {
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

	photoPreviews := make([]homeFeedPhotoPreviewResponse, 0, len(photoRecords))
	for _, photo := range photoRecords {
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
		case "quick-track":
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
				restaurantName = "Quick Track"
			}

			items = append(items, homeFeedEntryResponse{
				Source:  "quick-track",
				EventAt: row.EventAt,
				QuickTrack: &homeFeedQuickTrackResponse{
					ID:               quickTrack.Id,
					RestaurantName:   restaurantName,
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
	if typeFilter != "quick-track" {
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
			(%s) AS [[totalQuickTracks]]
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
	typeFilter string,
) ([]homeFeedEntryRow, error) {
	params := dbx.Params{
		"userId":     userID,
		"searchLike": buildHomeFeedSearchLike(search),
		"limit":      pageSize,
		"offset":     (page - 1) * pageSize,
	}

	selects := make([]string, 0, 2)
	if typeFilter != "quick-track" {
		selects = append(selects, `
			SELECT
				'visit' AS source,
				visits.id AS recordId,
				COALESCE(NULLIF(visits.visitDate, ''), visits.created) AS eventAt,
				visits.created AS createdAt
			FROM visits
			LEFT JOIN restaurants ON restaurants.id = visits.restaurant
			WHERE `+buildHomeFeedVisitAccessCondition(scope, isAdmin)+` AND `+buildHomeFeedVisitSearchCondition(search))
	}
	if typeFilter != "visits" {
		selects = append(selects, `
			SELECT
				'quick-track' AS source,
				food_items.id AS recordId,
				COALESCE(NULLIF(food_items.itemDate, ''), food_items.created) AS eventAt,
				food_items.created AS createdAt
			FROM food_items
			LEFT JOIN visits linked_visits ON linked_visits.id = food_items.visit
			LEFT JOIN restaurants linked_restaurants ON linked_restaurants.id = linked_visits.restaurant
			WHERE `+buildHomeFeedQuickTrackAccessCondition(scope, isAdmin)+` AND `+buildHomeFeedQuickTrackSearchCondition(search))
	}

	if len(selects) == 0 {
		return []homeFeedEntryRow{}, nil
	}

	orderByClause := "filtered_entries.eventAt DESC, filtered_entries.createdAt DESC, filtered_entries.recordId DESC"
	if scope == "mine" {
		orderByClause = "filtered_entries.createdAt DESC, filtered_entries.recordId DESC"
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
		ORDER BY ` + orderByClause + `
		LIMIT {:limit} OFFSET {:offset}
	`

	rows := []homeFeedEntryRow{}
	err := app.DB().NewQuery(query).Bind(params).All(&rows)
	return rows, err
}

func buildHomeFeedVisitAccessCondition(scope string, isAdmin bool) string {
	if isAdmin {
		switch scope {
		case "mine":
			return `visits.user = {:userId}`
		case "friends":
			return `visits.user != {:userId}`
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

func buildHomeFeedQuickTrackAccessCondition(scope string, isAdmin bool) string {
	if isAdmin {
		switch scope {
		case "mine":
			return `food_items.isQuickTrack = 1 AND food_items.user = {:userId}`
		case "friends":
			return `food_items.isQuickTrack = 1 AND food_items.user != {:userId}`
		default:
			return `food_items.isQuickTrack = 1`
		}
	}

	ownerCondition := `food_items.isQuickTrack = 1 AND food_items.user = {:userId} AND ` + ownerAccessibleQuickTrackModerationCondition
	friendCondition := `food_items.isQuickTrack = 1 AND food_items.user IN (SELECT friendId FROM accepted_friends) AND ` + visibleQuickTrackModerationCondition + ` AND (food_items.visibility = 'public' OR food_items.visibility = 'friends')`

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
				AND COALESCE(visit_items.isQuickTrack, 0) != 1
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

		if response.Items[index].QuickTrack != nil {
			response.Items[index].QuickTrack.ItemDate = redactFriendHomeFeedTimestamp(response.Items[index].QuickTrack.ItemDate)
			response.Items[index].QuickTrack.CreatedAt = redactFriendHomeFeedTimestamp(response.Items[index].QuickTrack.CreatedAt)
			response.Items[index].QuickTrack.UpdatedAt = redactFriendHomeFeedTimestamp(response.Items[index].QuickTrack.UpdatedAt)
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

	records, err := findRecordsByIDs(app, "restaurants", restaurantIDs)
	if err != nil {
		return nil, err
	}

	recordsByID := mapRecordsByID(records)
	result := make([]restaurantSearchResult, 0, len(restaurantIDs))
	for _, restaurantID := range restaurantIDs {
		record := recordsByID[restaurantID]
		if record == nil {
			continue
		}

		result = append(result, mapRestaurantSearchResult(record))
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

func clampRecentRestaurantLimit(limit int) int {
	if limit <= 0 {
		return 1
	}

	if limit > maxRecentRestaurantLimit {
		return maxRecentRestaurantLimit
	}

	return limit
}
