package handlers

import (
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

func enforcePostingWritePolicy(authRecord *core.Record) error {
	if authRecord == nil || authRecord.GetBool("isAdmin") {
		return nil
	}

	if blocked, message := lib.IsUserPostingBlocked(authRecord); blocked {
		return apis.NewForbiddenError(message, nil)
	}

	return nil
}

func applyPreReviewModerationPolicy(authRecord *core.Record, record *core.Record) {
	if authRecord == nil || record == nil {
		return
	}

	if lib.ContentWriteRequiresPreReview(authRecord, record.Collection().Name) {
		record.Set("moderationStatus", lib.ContentModerationStatusUnderReview)
	}
}

func registerPreReviewModerationCase(app core.App, authRecord *core.Record, record *core.Record) error {
	if authRecord == nil || record == nil ||
		!lib.ContentWriteRequiresPreReview(authRecord, record.Collection().Name) {
		return nil
	}

	if _, err := lib.UpsertPreReviewModerationCase(app, record); err != nil {
		return apis.NewApiError(500, "failed to queue content for moderation", err)
	}

	return nil
}
