package hooks

import (
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

// RegisterModerationHooks enforces account-level moderation restrictions on user-generated content writes.
func RegisterModerationHooks(app core.App) {
	app.OnRecordCreateRequest().BindFunc(func(e *core.RecordRequestEvent) error {
		if err := enforceModerationWriteRestrictions(e); err != nil {
			return err
		}

		shouldCreateCase := lib.ApplyPreReviewModerationPolicy(e.Auth, e.Record)
		if !shouldCreateCase && isNonSuperuserModeratedContentRequest(e) {
			e.Record.Set("moderationStatus", lib.ContentModerationStatusActive)
			e.Record.Set("moderatedAt", "")
			e.Record.Set("moderatedBy", "")
		}

		return persistModeratedContentRequest(e, shouldCreateCase)
	})

	app.OnRecordUpdateRequest().BindFunc(func(e *core.RecordRequestEvent) error {
		if err := enforceModerationWriteRestrictions(e); err != nil {
			return err
		}

		if !isNonSuperuserModeratedContentRequest(e) {
			return e.Next()
		}

		original := e.Record.Original()
		if original == nil {
			return apis.NewBadRequestError("existing content record is required", nil)
		}
		if moderationMetadataChanged(e.Record, original) {
			return apis.NewForbiddenError("content moderation fields are admin controlled", nil)
		}

		shouldCreateCase := lib.ApplyPreReviewModerationPolicy(e.Auth, e.Record)

		return persistModeratedContentRequest(e, shouldCreateCase)
	})
}

func isNonSuperuserModeratedContentRequest(e *core.RecordRequestEvent) bool {
	return e != nil &&
		e.Auth != nil &&
		e.Collection != nil &&
		!e.HasSuperuserAuth() &&
		e.Collection.Fields.GetByName("moderationStatus") != nil
}

func moderationMetadataChanged(record *core.Record, original *core.Record) bool {
	for _, fieldName := range []string{"moderationStatus", "moderatedAt", "moderatedBy"} {
		if strings.TrimSpace(record.GetString(fieldName)) != strings.TrimSpace(original.GetString(fieldName)) {
			return true
		}
	}

	return false
}

func persistModeratedContentRequest(e *core.RecordRequestEvent, shouldCreateCase bool) error {
	if !shouldCreateCase {
		return e.Next()
	}

	originalApp := e.App
	return e.App.RunInTransaction(func(txApp core.App) error {
		e.App = txApp
		defer func() {
			e.App = originalApp
		}()

		if err := e.Next(); err != nil {
			return err
		}
		if _, err := lib.UpsertPreReviewModerationCase(txApp, e.Record); err != nil {
			return apis.NewApiError(500, "failed to record pre-review moderation case", err)
		}

		return nil
	})
}

func enforceModerationWriteRestrictions(e *core.RecordRequestEvent) error {
	if e == nil || e.Auth == nil || e.Collection == nil {
		return nil
	}

	if e.HasSuperuserAuth() || e.Auth.GetBool("isAdmin") {
		return nil
	}

	collectionName := e.Collection.Name
	if lib.IsPostingModerationCollection(collectionName) {
		if blocked, message := lib.IsUserPostingBlocked(e.Auth); blocked {
			return apis.NewForbiddenError(message, nil)
		}
	}

	if lib.IsPhotoModerationCollection(collectionName) {
		if blocked, message := lib.IsUserPhotoUploadBlocked(e.Auth); blocked {
			return apis.NewForbiddenError(message, nil)
		}
	}

	return nil
}
