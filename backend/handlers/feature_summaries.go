package handlers

import (
	"log"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

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
