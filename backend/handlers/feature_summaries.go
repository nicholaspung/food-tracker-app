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

const defaultRecentRestaurantLimit = 12
const maxRecentRestaurantLimit = 24

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
