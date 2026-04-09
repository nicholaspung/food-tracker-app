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

type photoCreateLimitConfig struct {
	relationField        string
	relationRequiredMsg  string
	perRecordScopeLabel  string
	countExistingRecords func(app core.App, userID string, relationID string) (int, error)
}

// RegisterUsageLimitHooks registers record lifecycle hooks related to usage limiting.
func RegisterUsageLimitHooks(app core.App) {
	app.OnRecordCreateRequest("visit_photos").BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceVisitPhotoCreateRequestLimits(e)
	})

	app.OnRecordCreateRequest("note_photos").BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceNotePhotoCreateRequestLimits(e)
	})
}

// EnforceVisitPhotoCreateRequestLimits applies role-based per-record and monthly limits to visit_photos create requests.
func EnforceVisitPhotoCreateRequestLimits(e *core.RecordRequestEvent) error {
	return enforcePhotoCreateRequestLimits(e, photoCreateLimitConfig{
		relationField:       "food_item",
		relationRequiredMsg: "food_item is required",
		perRecordScopeLabel: "item",
		countExistingRecords: func(app core.App, userID string, relationID string) (int, error) {
			return countVisitPhotosForFoodItem(app, userID, relationID)
		},
	})
}

// EnforceNotePhotoCreateRequestLimits applies role-based per-record and monthly limits to note_photos create requests.
func EnforceNotePhotoCreateRequestLimits(e *core.RecordRequestEvent) error {
	return enforcePhotoCreateRequestLimits(e, photoCreateLimitConfig{
		relationField:       "note",
		relationRequiredMsg: "note is required",
		perRecordScopeLabel: "note",
		countExistingRecords: func(app core.App, userID string, relationID string) (int, error) {
			return countNotePhotosForNote(app, userID, relationID)
		},
	})
}

func enforcePhotoCreateRequestLimits(e *core.RecordRequestEvent, config photoCreateLimitConfig) error {
	authRecord := e.Auth
	if authRecord == nil {
		return apis.NewUnauthorizedError("authentication required", nil)
	}

	userTier := lib.ResolveUserTier(authRecord)
	effectiveLimits := lib.ResolveEffectiveLimits(userTier)
	relationID := strings.TrimSpace(e.Record.GetString(config.relationField))

	if relationID == "" {
		return apis.NewBadRequestError(config.relationRequiredMsg, nil)
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
			existingCount, err := config.countExistingRecords(txApp, authRecord.Id, relationID)
			if err != nil {
				log.Printf(
					"Failed to check %s photo count for user=%s %s=%s: %v",
					config.perRecordScopeLabel,
					authRecord.Id,
					config.relationField,
					relationID,
					err,
				)
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
					Message:   fmt.Sprintf("Photo upload limit reached for this %s (%d).", config.perRecordScopeLabel, *effectiveLimits.PhotoUploadsPerRecord),
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

func countNotePhotosForNote(app core.App, userID string, noteID string) (int, error) {
	var count int

	err := app.DB().NewQuery(`
		SELECT COUNT(1)
		FROM note_photos
		WHERE user = {:userId}
		  AND note = {:noteId}
	`).
		Bind(dbx.Params{
			"userId": userID,
			"noteId": noteID,
		}).
		Row(&count)

	return count, err
}
