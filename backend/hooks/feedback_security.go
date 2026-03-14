package hooks

import (
	"fmt"
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var userEditableFeedbackFields = map[string]struct{}{
	"admin_reply_deadline_at": {},
	"admin_unread_count":      {},
	"last_message_at":         {},
	"user_unread_count":       {},
}

var feedbackUpdateIgnoredFields = map[string]struct{}{
	"updated": {},
}

// RegisterFeedbackSecurityHooks applies field-level write protections to feedback updates.
func RegisterFeedbackSecurityHooks(app core.App) {
	app.OnRecordUpdateRequest("feedback").BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceFeedbackUpdateRequestSecurity(e)
	})
}

// EnforceFeedbackUpdateRequestSecurity ensures only admins can modify thread ownership or metadata fields.
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

	blockedFields := make([]string, 0)
	for _, field := range changedFields {
		if _, ok := userEditableFeedbackFields[field]; ok {
			continue
		}
		blockedFields = append(blockedFields, field)
	}

	if len(blockedFields) > 0 {
		sort.Strings(blockedFields)
		return apis.NewForbiddenError(
			fmt.Sprintf("only admins can modify %s", strings.Join(blockedFields, ", ")),
			nil,
		)
	}

	return e.Next()
}
