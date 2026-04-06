package hooks

import (
	"fmt"
	"log"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

// RegisterUsageLimitHooks registers record lifecycle hooks related to usage limiting.
func RegisterUsageLimitHooks(app core.App) {
	app.OnRecordCreateRequest("visit_photos").BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceVisitPhotoCreateRequestLimits(e)
	})
}

// EnforceVisitPhotoCreateRequestLimits applies role-based per-record and monthly limits to visit_photos create requests.
func EnforceVisitPhotoCreateRequestLimits(e *core.RecordRequestEvent) error {
	authRecord := e.Auth
	if authRecord == nil {
		return apis.NewUnauthorizedError("authentication required", nil)
	}

	userTier := lib.ResolveUserTier(authRecord)
	effectiveLimits := lib.ResolveEffectiveLimits(userTier)
	foodItemID := strings.TrimSpace(e.Record.GetString("food_item"))

	if foodItemID == "" {
		return apis.NewBadRequestError("food_item is required", nil)
	}

	originalApp := e.App
	return e.App.RunInTransaction(func(txApp core.App) error {
		e.App = txApp
		defer func() {
			e.App = originalApp
		}()

		if _, err := lib.ReserveUsage(txApp, authRecord, lib.UsageMetricPhotoUploads, 1); err != nil {
			if limitErr, ok := lib.AsLimitExceededError(err); ok {
				return apis.NewTooManyRequestsError(limitErr.Message, limitErr.Payload())
			}
			log.Printf("Failed to reserve photo usage for user=%s: %v", authRecord.Id, err)
			return apis.NewApiError(500, "failed to validate photo upload limits", err)
		}

		if effectiveLimits.PhotoUploadsPerRecord != nil {
			existingCount, err := countVisitPhotosForFoodItem(txApp, authRecord.Id, foodItemID)
			if err != nil {
				log.Printf("Failed to check visit photo count for user=%s food_item=%s: %v", authRecord.Id, foodItemID, err)
				return apis.NewApiError(500, "failed to validate photo upload limits", err)
			}

			if existingCount >= *effectiveLimits.PhotoUploadsPerRecord {
				limitErr := &lib.LimitExceededError{
					Metric:    lib.UsageMetricPhotoUploads,
					Limit:     *effectiveLimits.PhotoUploadsPerRecord,
					Used:      existingCount,
					Remaining: 0,
					MonthKey:  lib.CurrentUTCMonthKey(),
					UserTier:  userTier,
					Message:   fmt.Sprintf("Photo upload limit reached for this item (%d).", *effectiveLimits.PhotoUploadsPerRecord),
				}

				return apis.NewTooManyRequestsError(limitErr.Message, limitErr.Payload())
			}
		}

		return e.Next()
	})
}

func countVisitPhotosForFoodItem(app core.App, userID string, foodItemID string) (int, error) {
	var count int

	err := app.DB().NewQuery(`
		SELECT COUNT(1)
		FROM visit_photos
		WHERE user = {:userId}
		  AND food_item = {:foodItemId}
	`).
		Bind(dbx.Params{
			"userId":     userID,
			"foodItemId": foodItemID,
		}).
		Row(&count)

	return count, err
}
