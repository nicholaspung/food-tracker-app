package hooks

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"

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

	if effectiveLimits.PhotoUploadsPerRecord != nil {
		existingRecords, err := e.App.FindRecordsByFilter(
			"visit_photos",
			"user = {:userId} && food_item = {:foodItemId}",
			"",
			*effectiveLimits.PhotoUploadsPerRecord+1,
			0,
			map[string]any{
				"userId":     authRecord.Id,
				"foodItemId": foodItemID,
			},
		)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			log.Printf("Failed to check visit photo count for user=%s food_item=%s: %v", authRecord.Id, foodItemID, err)
			return apis.NewApiError(500, "failed to validate photo upload limits", err)
		}

		existingCount := len(existingRecords)
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

	reservedMonthlyUsage := false
	if _, err := lib.ReserveUsage(e.App, authRecord, lib.UsageMetricPhotoUploads, 1); err != nil {
		if limitErr, ok := lib.AsLimitExceededError(err); ok {
			return apis.NewTooManyRequestsError(limitErr.Message, limitErr.Payload())
		}
		log.Printf("Failed to reserve photo usage for user=%s: %v", authRecord.Id, err)
		return apis.NewApiError(500, "failed to validate photo upload limits", err)
	}

	reservedMonthlyUsage = true

	err := e.Next()
	if err != nil && reservedMonthlyUsage {
		if releaseErr := lib.ReleaseUsage(e.App, authRecord, lib.UsageMetricPhotoUploads, 1); releaseErr != nil {
			log.Printf("Failed to release reserved photo usage for user=%s: %v", authRecord.Id, releaseErr)
		}
	}

	return err
}
