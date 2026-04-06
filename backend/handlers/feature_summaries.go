package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const visibleVisitModerationCondition = `(visits.moderationStatus = '' OR visits.moderationStatus = 'active' OR visits.moderationStatus = 'reviewed')`
const ownerAccessibleVisitModerationCondition = `(visits.moderationStatus = '' OR visits.moderationStatus = 'active' OR visits.moderationStatus = 'reviewed' OR visits.moderationStatus = 'under_review')`

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
