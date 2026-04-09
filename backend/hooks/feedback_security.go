package hooks

import (
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var feedbackUpdateIgnoredFields = map[string]struct{}{
	"updated": {},
}

// RegisterFeedbackSecurityHooks applies field-level write protections to feedback updates.
func RegisterFeedbackSecurityHooks(app core.App) {
	app.OnRecordUpdateRequest("feedback").BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceFeedbackUpdateRequestSecurity(e)
	})
}

// EnforceFeedbackUpdateRequestSecurity ensures direct feedback thread updates remain admin-only.
func EnforceFeedbackUpdateRequestSecurity(e *core.RecordRequestEvent) error {
	if e.HasSuperuserAuth() {
		return e.Next()
	}

	if e.Auth == nil {
		return apis.NewUnauthorizedError("authentication required", nil)
	}

	changedFields := changedRecordFields(e.Record, feedbackUpdateIgnoredFields)
	if len(changedFields) == 0 {
		return e.Next()
	}

	if e.Auth.GetBool("isAdmin") {
		return e.Next()
	}

	return apis.NewForbiddenError("only admins can update feedback threads directly", nil)
}
