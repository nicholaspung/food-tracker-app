package handlers

import (
	"log"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

// RegisterUsageLimitHandlers registers usage and quota endpoints.
func RegisterUsageLimitHandlers(se *core.ServeEvent, _ core.App) {
	se.Router.GET("/api/usage/monthly", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		var displayTierOverride *lib.UserTier
		viewAsTierValue := strings.TrimSpace(e.Request.URL.Query().Get("view_as_tier"))
		if viewAsTierValue != "" {
			if !e.Auth.GetBool("isAdmin") {
				return apis.NewForbiddenError("only admins can request usage preview tier", nil)
			}

			viewAsTier, ok := lib.ParseUsageTier(viewAsTierValue)
			if !ok {
				return apis.NewBadRequestError(`view_as_tier must be one of "admin", "subscriber", "free"`, nil)
			}

			displayTierOverride = &viewAsTier
		}

		snapshot, err := lib.GetMonthlyUsageSnapshotForTier(e.App, e.Auth, displayTierOverride)
		if err != nil {
			log.Printf("Failed to load monthly usage snapshot for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load monthly usage", err)
		}

		return e.JSON(200, snapshot)
	})

	se.Router.POST("/api/usage/consume", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		var requestData struct {
			Metric string `json:"metric"`
			Amount int    `json:"amount"`
		}

		if err := e.BindBody(&requestData); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		if requestData.Metric != string(lib.UsageMetricMenuScans) {
			return apis.NewBadRequestError(`metric must be "menu_scans"`, nil)
		}

		amount := requestData.Amount
		if amount == 0 {
			amount = 1
		}
		if amount != 1 {
			return apis.NewBadRequestError("amount must be 1", nil)
		}

		consumeResult, err := lib.ConsumeUsage(e.App, e.Auth, lib.UsageMetricMenuScans, amount)
		if err != nil {
			if limitErr, ok := lib.AsLimitExceededError(err); ok {
				return e.JSON(429, limitErr.Payload())
			}
			log.Printf("Failed to consume usage metric=%s userId=%s: %v", requestData.Metric, e.Auth.Id, err)
			return apis.NewApiError(500, "failed to consume usage", err)
		}

		return e.JSON(200, map[string]any{
			"metric":    consumeResult.Metric,
			"used":      consumeResult.Used,
			"limit":     consumeResult.Limit,
			"remaining": consumeResult.Remaining,
			"monthKey":  consumeResult.MonthKey,
		})
	})
}
