package hooks

import (
	"log"
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

		shouldCreateCase := shouldCreatePreReviewCase(e)
		if shouldCreateCase {
			e.Record.Set("moderationStatus", lib.ContentModerationStatusUnderReview)
		} else if field := e.Record.Collection().Fields.GetByName("moderationStatus"); field != nil {
			if strings.TrimSpace(e.Record.GetString("moderationStatus")) == "" {
				e.Record.Set("moderationStatus", lib.ContentModerationStatusActive)
			}
		}

		err := e.Next()
		if err != nil {
			return err
		}

		if shouldCreateCase {
			if _, caseErr := lib.UpsertPreReviewModerationCase(e.App, e.Record); caseErr != nil {
				log.Printf("Failed to create pre-review moderation case for %s/%s: %v", e.Collection.Name, e.Record.Id, caseErr)
			}
		}

		return nil
	})

	app.OnRecordUpdateRequest().BindFunc(func(e *core.RecordRequestEvent) error {
		if err := enforceModerationWriteRestrictions(e); err != nil {
			return err
		}

		return e.Next()
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

func shouldCreatePreReviewCase(e *core.RecordRequestEvent) bool {
	if e == nil || e.Auth == nil || e.Collection == nil {
		return false
	}

	return lib.ContentWriteRequiresPreReview(e.Auth, e.Collection.Name)
}
