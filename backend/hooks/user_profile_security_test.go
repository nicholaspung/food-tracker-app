package hooks

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	pbtests "github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/router"

	_ "myapp/migrations"
)

func newUserProfileSecurityTestApp(t *testing.T) *pbtests.TestApp {
	t.Helper()

	app, err := pbtests.NewTestApp("../pb_data")
	if err != nil {
		t.Fatalf("failed to initialize test app: %v", err)
	}
	t.Cleanup(app.Cleanup)

	RegisterUserProfileSecurityHooks(app)
	return app
}

func createProfileSecurityUser(t *testing.T, app core.App, isAdmin bool, isSubscriber bool) *core.Record {
	t.Helper()

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	user := core.NewRecord(usersCollection)
	user.Set("email", fmt.Sprintf("profile_security_user_%d@example.com", time.Now().UnixNano()))
	user.Set("name", "Profile Security User")
	user.Set("isAdmin", isAdmin)
	user.Set("isSubscriber", isSubscriber)
	user.Set("defaultRestaurantVisibility", "friends")
	user.Set("defaultVisitVisibility", "friends")
	user.SetVerified(true)
	user.SetPassword("password123")

	if err := app.Save(user); err != nil {
		t.Fatalf("failed to save test user: %v", err)
	}

	return user
}

func triggerUserUpdateSecurityHook(
	t *testing.T,
	app core.App,
	authRecord *core.Record,
	targetUserID string,
	updates map[string]any,
	persistRecord bool,
) error {
	t.Helper()

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	targetRecord, err := app.FindRecordById("users", targetUserID)
	if err != nil {
		t.Fatalf("failed to load target user %s: %v", targetUserID, err)
	}

	for key, value := range updates {
		targetRecord.Set(key, value)
	}

	request := httptest.NewRequest(http.MethodPatch, "/api/collections/users/records/"+targetUserID, nil)
	response := httptest.NewRecorder()
	requestEvent := &core.RequestEvent{
		App:  app,
		Auth: authRecord,
	}
	requestEvent.Request = request
	requestEvent.Response = response

	event := &core.RecordRequestEvent{
		RequestEvent: requestEvent,
		Record:       targetRecord,
	}
	event.Collection = usersCollection

	return app.OnRecordUpdateRequest().Trigger(event, func(e *core.RecordRequestEvent) error {
		if persistRecord {
			return app.Save(e.Record)
		}

		return nil
	})
}

func triggerUserCreateSecurityHook(
	t *testing.T,
	app core.App,
	authRecord *core.Record,
	payload map[string]any,
) (*core.Record, error) {
	t.Helper()

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	record := core.NewRecord(usersCollection)
	for key, value := range payload {
		record.Set(key, value)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/collections/users/records", nil)
	response := httptest.NewRecorder()
	requestEvent := &core.RequestEvent{
		App:  app,
		Auth: authRecord,
	}
	requestEvent.Request = request
	requestEvent.Response = response

	event := &core.RecordRequestEvent{
		RequestEvent: requestEvent,
		Record:       record,
	}
	event.Collection = usersCollection

	err = app.OnRecordCreateRequest().Trigger(event, func(e *core.RecordRequestEvent) error {
		return nil
	})

	return record, err
}

func requireAPIErrorStatus(t *testing.T, err error, status int) *router.ApiError {
	t.Helper()

	if err == nil {
		t.Fatalf("expected API error with status %d, got nil", status)
	}

	apiErr := router.ToApiError(err)
	if apiErr.Status != status {
		t.Fatalf("expected status %d, got %d (%v)", status, apiErr.Status, err)
	}

	return apiErr
}

func TestUserUpdateRequestSecurityAllowsProfileFieldsForNonAdmin(t *testing.T) {
	app := newUserProfileSecurityTestApp(t)
	user := createProfileSecurityUser(t, app, false, false)

	err := triggerUserUpdateSecurityHook(
		t,
		app,
		user,
		user.Id,
		map[string]any{
			"name":                        "Updated Profile Name",
			"defaultVisitVisibility":      "private",
			"defaultRestaurantVisibility": "friends",
		},
		true,
	)
	if err != nil {
		t.Fatalf("expected update to succeed, got %v", err)
	}

	updatedRecord, findErr := app.FindRecordById("users", user.Id)
	if findErr != nil {
		t.Fatalf("failed to reload updated user: %v", findErr)
	}

	if updatedRecord.GetString("name") != "Updated Profile Name" {
		t.Fatalf("expected updated name, got %q", updatedRecord.GetString("name"))
	}
	if updatedRecord.GetString("defaultVisitVisibility") != "private" {
		t.Fatalf(
			"expected defaultVisitVisibility=private, got %q",
			updatedRecord.GetString("defaultVisitVisibility"),
		)
	}
	if updatedRecord.GetString("defaultRestaurantVisibility") != "friends" {
		t.Fatalf(
			"expected defaultRestaurantVisibility=friends, got %q",
			updatedRecord.GetString("defaultRestaurantVisibility"),
		)
	}
}

func TestUserUpdateRequestSecurityBlocksAdminAndSubscriberFlagsForNonAdmin(t *testing.T) {
	app := newUserProfileSecurityTestApp(t)
	user := createProfileSecurityUser(t, app, false, false)

	err := triggerUserUpdateSecurityHook(
		t,
		app,
		user,
		user.Id,
		map[string]any{
			"isSubscriber": true,
		},
		false,
	)
	apiErr := requireAPIErrorStatus(t, err, http.StatusForbidden)
	if !strings.Contains(strings.ToLower(apiErr.Message), "only admins can modify issubscriber") {
		t.Fatalf("expected admin-only error message, got %q", apiErr.Message)
	}
}

func TestUserUpdateRequestSecurityBlocksNonWhitelistedFieldsForNonAdmin(t *testing.T) {
	app := newUserProfileSecurityTestApp(t)
	user := createProfileSecurityUser(t, app, false, false)

	err := triggerUserUpdateSecurityHook(
		t,
		app,
		user,
		user.Id,
		map[string]any{
			"emailVisibility": true,
		},
		false,
	)
	apiErr := requireAPIErrorStatus(t, err, http.StatusForbidden)
	if !strings.Contains(apiErr.Message, "blocked fields: emailVisibility") {
		t.Fatalf("expected blocked-fields error message, got %q", apiErr.Message)
	}
}

func TestUserUpdateRequestSecurityAllowsAdminToModifyPrivilegedFields(t *testing.T) {
	app := newUserProfileSecurityTestApp(t)
	adminUser := createProfileSecurityUser(t, app, true, false)

	err := triggerUserUpdateSecurityHook(
		t,
		app,
		adminUser,
		adminUser.Id,
		map[string]any{
			"isSubscriber": true,
		},
		true,
	)
	if err != nil {
		t.Fatalf("expected admin update to succeed, got %v", err)
	}

	updatedRecord, findErr := app.FindRecordById("users", adminUser.Id)
	if findErr != nil {
		t.Fatalf("failed to reload admin user: %v", findErr)
	}

	if !updatedRecord.GetBool("isSubscriber") {
		t.Fatalf("expected admin to set isSubscriber=true")
	}
}

func TestUserCreateRequestSecuritySanitizesPrivilegedFlagsForPublicSignup(t *testing.T) {
	app := newUserProfileSecurityTestApp(t)

	record, err := triggerUserCreateSecurityHook(
		t,
		app,
		nil,
		map[string]any{
			"name":                        "New User",
			"email":                       "new-user@example.com",
			"isAdmin":                     true,
			"isSubscriber":                true,
			"isInitialUser":               true,
			"defaultVisitVisibility":      "",
			"defaultRestaurantVisibility": "",
		},
	)
	if err != nil {
		t.Fatalf("expected create-request hook to succeed, got %v", err)
	}

	if record.GetBool("isAdmin") {
		t.Fatalf("expected isAdmin to be sanitized to false")
	}
	if record.GetBool("isSubscriber") {
		t.Fatalf("expected isSubscriber to be sanitized to false")
	}
	if record.GetBool("isInitialUser") {
		t.Fatalf("expected isInitialUser to be sanitized to false")
	}
	if record.GetString("defaultVisitVisibility") != "friends" {
		t.Fatalf(
			"expected defaultVisitVisibility=friends, got %q",
			record.GetString("defaultVisitVisibility"),
		)
	}
	if record.GetString("defaultRestaurantVisibility") != "friends" {
		t.Fatalf(
			"expected defaultRestaurantVisibility=friends, got %q",
			record.GetString("defaultRestaurantVisibility"),
		)
	}
}
