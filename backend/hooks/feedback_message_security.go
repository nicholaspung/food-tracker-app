package hooks

import (
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// RegisterFeedbackMessageSecurityHooks blocks direct client-side feedback message creates.
func RegisterFeedbackMessageSecurityHooks(app core.App) {
	app.OnRecordCreateRequest("feedback_messages").BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceFeedbackMessageCreateRequestSecurity(e)
	})
}

// EnforceFeedbackMessageCreateRequestSecurity requires feedback message writes to use backend reply endpoints.
func EnforceFeedbackMessageCreateRequestSecurity(e *core.RecordRequestEvent) error {
	if e == nil {
		return nil
	}

	if e.HasSuperuserAuth() {
		return e.Next()
	}

	if e.Auth == nil {
		return apis.NewUnauthorizedError("authentication required", nil)
	}

	return apis.NewForbiddenError("feedback messages must be created through reply endpoints", nil)
}
