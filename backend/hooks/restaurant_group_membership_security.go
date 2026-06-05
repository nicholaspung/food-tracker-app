package hooks

import (
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// RegisterRestaurantGroupMembershipSecurityHooks keeps admin-managed restaurant
// group membership out of raw non-admin restaurant writes.
func RegisterRestaurantGroupMembershipSecurityHooks(app core.App) {
	app.OnRecordCreateRequest("restaurants").BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceRestaurantGroupMembershipCreateRequestSecurity(e)
	})

	app.OnRecordUpdateRequest("restaurants").BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceRestaurantGroupMembershipUpdateRequestSecurity(e)
	})
}

func EnforceRestaurantGroupMembershipCreateRequestSecurity(e *core.RecordRequestEvent) error {
	if e == nil || e.Record == nil {
		return nil
	}

	if e.HasSuperuserAuth() || (e.Auth != nil && e.Auth.GetBool("isAdmin")) {
		return e.Next()
	}

	if strings.TrimSpace(e.Record.GetString("restaurantGroup")) != "" {
		return apis.NewForbiddenError("restaurant group membership is admin-managed", nil)
	}

	return e.Next()
}

func EnforceRestaurantGroupMembershipUpdateRequestSecurity(e *core.RecordRequestEvent) error {
	if e == nil || e.Record == nil {
		return nil
	}

	if e.HasSuperuserAuth() || (e.Auth != nil && e.Auth.GetBool("isAdmin")) {
		return e.Next()
	}

	original := e.Record.Original()
	if original == nil {
		return apis.NewBadRequestError("existing record is required", nil)
	}

	if strings.TrimSpace(e.Record.GetString("restaurantGroup")) != strings.TrimSpace(original.GetString("restaurantGroup")) {
		return apis.NewForbiddenError("restaurant group membership is admin-managed", nil)
	}

	return e.Next()
}
