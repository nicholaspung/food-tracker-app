package hooks

import (
	"log"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

var postingModerationCollections = map[string]struct{}{
	"visits":           {},
	"food_items":       {},
	"notes":            {},
	"restaurant_lists": {},
	"list_items":       {},
}

var photoModerationCollections = map[string]struct{}{
	"visit_photos": {},
	"note_photos":  {},
}

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
			if _, caseErr := lib.UpsertModerationCase(e.App, lib.ModerationCaseInput{
				Action:           lib.ModerationActionQuarantine,
				ReasonCode:       "pre_review",
				Status:           lib.ModerationCaseStatusUnderReview,
				TargetCollection: e.Collection.Name,
				TargetLabel:      lib.ResolveAuditTargetLabel(e.Record, lib.RecordAuditSnapshot(e.Record)),
				TargetRecordID:   e.Record.Id,
				TargetType:       mapModerationTargetType(e.Collection.Name, e.Record),
				TargetUserID:     resolveModerationTargetUserID(e.Record),
			}); caseErr != nil {
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
	if _, ok := postingModerationCollections[collectionName]; ok {
		if blocked, message := lib.IsUserPostingBlocked(e.Auth); blocked {
			return apis.NewForbiddenError(message, nil)
		}
	}

	if _, ok := photoModerationCollections[collectionName]; ok {
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

	if !lib.IsUserInPreReviewMode(e.Auth) {
		return false
	}

	if _, ok := postingModerationCollections[e.Collection.Name]; ok {
		return true
	}

	if _, ok := photoModerationCollections[e.Collection.Name]; ok {
		return true
	}

	return false
}

func resolveModerationTargetUserID(record *core.Record) string {
	if record == nil {
		return ""
	}

	switch {
	case strings.TrimSpace(record.GetString("user")) != "":
		return strings.TrimSpace(record.GetString("user"))
	case strings.TrimSpace(record.GetString("addedBy")) != "":
		return strings.TrimSpace(record.GetString("addedBy"))
	case strings.TrimSpace(record.GetString("createdBy")) != "":
		return strings.TrimSpace(record.GetString("createdBy"))
	default:
		return ""
	}
}

func mapModerationTargetType(collectionName string, record *core.Record) string {
	switch collectionName {
	case "visits":
		return "visit"
	case "food_items":
		if record != nil && record.GetBool("isQuickTrack") {
			return "quick-track"
		}
		return "food-item"
	case "restaurant_lists":
		return "list"
	case "list_items":
		return "list-item"
	case "notes":
		return "note"
	case "visit_photos":
		return "photo"
	case "note_photos":
		return "photo"
	default:
		return collectionName
	}
}
