package hooks

import (
	"fmt"
	"reflect"
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var selfServiceUserEditableFields = map[string]struct{}{
	"name":                        {},
	"defaultVisitVisibility":      {},
	"defaultRestaurantVisibility": {},
}

var adminOnlyUserFields = map[string]struct{}{
	"isAdmin":      {},
	"isSubscriber": {},
	"isBetaUser":   {},
}

var userUpdateIgnoredFields = map[string]struct{}{
	"updated": {},
}

// RegisterUserProfileSecurityHooks applies field-level write protections
// to user profile create/update API requests.
func RegisterUserProfileSecurityHooks(app core.App) {
	app.OnRecordCreateRequest("users").BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceUserCreateRequestSecurity(e)
	})

	app.OnRecordUpdateRequest("users").BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceUserUpdateRequestSecurity(e)
	})
}

// EnforceUserCreateRequestSecurity prevents user self-signup payloads from
// setting privileged user flags.
func EnforceUserCreateRequestSecurity(e *core.RecordRequestEvent) error {
	if e.HasSuperuserAuth() {
		return e.Next()
	}

	// Never allow public signup payloads to grant privileged flags.
	e.Record.Set("isAdmin", false)
	e.Record.Set("isSubscriber", false)
	e.Record.Set("isBetaUser", false)
	e.Record.Set("isInitialUser", false)

	if strings.TrimSpace(e.Record.GetString("defaultVisitVisibility")) == "" {
		e.Record.Set("defaultVisitVisibility", "friends")
	}

	if strings.TrimSpace(e.Record.GetString("defaultRestaurantVisibility")) == "" {
		e.Record.Set("defaultRestaurantVisibility", "friends")
	}

	return e.Next()
}

// EnforceUserUpdateRequestSecurity enforces that non-admin users can only edit
// their display name and default visibility fields.
func EnforceUserUpdateRequestSecurity(e *core.RecordRequestEvent) error {
	if e.HasSuperuserAuth() {
		return e.Next()
	}

	if e.Auth == nil {
		return apis.NewUnauthorizedError("authentication required", nil)
	}

	changedFields := changedUserFields(e.Record)
	if len(changedFields) == 0 {
		return e.Next()
	}

	// Admin users keep full edit access through API requests.
	if e.Auth.GetBool("isAdmin") {
		return e.Next()
	}

	adminOnlyChanges := changedFieldsInSet(changedFields, adminOnlyUserFields)
	if len(adminOnlyChanges) > 0 {
		return apis.NewForbiddenError(
			fmt.Sprintf("only admins can modify %s", strings.Join(adminOnlyChanges, ", ")),
			nil,
		)
	}

	blockedFields := make([]string, 0)
	for _, field := range changedFields {
		if _, ok := selfServiceUserEditableFields[field]; ok {
			continue
		}
		blockedFields = append(blockedFields, field)
	}

	if len(blockedFields) > 0 {
		sort.Strings(blockedFields)
		return apis.NewForbiddenError(
			fmt.Sprintf(
				"you can only modify name, defaultVisitVisibility, and defaultRestaurantVisibility; blocked fields: %s",
				strings.Join(blockedFields, ", "),
			),
			nil,
		)
	}

	return e.Next()
}

func changedUserFields(record *core.Record) []string {
	original := record.Original()
	fields := make([]string, 0, len(record.Collection().Fields))

	for _, collectionField := range record.Collection().Fields {
		fieldName := collectionField.GetName()
		if _, ignored := userUpdateIgnoredFields[fieldName]; ignored {
			continue
		}

		if !reflect.DeepEqual(record.GetRaw(fieldName), original.GetRaw(fieldName)) {
			fields = append(fields, fieldName)
		}
	}

	sort.Strings(fields)
	return fields
}

func changedFieldsInSet(changedFields []string, allowed map[string]struct{}) []string {
	result := make([]string, 0, len(changedFields))

	for _, field := range changedFields {
		if _, ok := allowed[field]; ok {
			result = append(result, field)
		}
	}

	sort.Strings(result)
	return result
}
