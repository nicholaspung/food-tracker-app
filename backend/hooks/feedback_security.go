package hooks

import (
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var feedbackUpdateIgnoredFields = map[string]struct{}{
	"updated": {},
}

var feedbackAssignmentFields = map[string]struct{}{
	"assigned_admin":          {},
	"assigned_at":             {},
	"admin_reply_deadline_at": {},
}

// RegisterFeedbackSecurityHooks applies field-level write protections to feedback creates and updates.
func RegisterFeedbackSecurityHooks(app core.App) {
	app.OnRecordCreateRequest("feedback").BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceFeedbackCreateRequestSecurity(e)
	})

	app.OnRecordUpdateRequest("feedback").BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceFeedbackUpdateRequestSecurity(e)
	})
}

// EnforceFeedbackCreateRequestSecurity derives all workflow metadata for legacy raw creates.
func EnforceFeedbackCreateRequestSecurity(e *core.RecordRequestEvent) error {
	if e == nil {
		return nil
	}

	if e.HasSuperuserAuth() {
		return e.Next()
	}

	if e.Auth == nil {
		return apis.NewUnauthorizedError("authentication required", nil)
	}

	now := time.Now().UTC()
	e.Record.Set("user", e.Auth.Id)
	e.Record.Set("status", "open")
	e.Record.Set("admin_unread_count", 1)
	e.Record.Set("user_unread_count", 0)
	e.Record.Set("last_message_at", now)
	e.Record.Set("assigned_admin", "")
	e.Record.Set("assigned_at", "")
	e.Record.Set("admin_reply_deadline_at", "")

	return e.Next()
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

	if len(changedFieldsInSet(changedFields, feedbackAssignmentFields)) > 0 {
		return apis.NewForbiddenError("feedback assignment must use claim or release", nil)
	}

	if e.Auth.GetBool("isAdmin") {
		return e.Next()
	}

	return apis.NewForbiddenError("only admins can update feedback threads directly", nil)
}
