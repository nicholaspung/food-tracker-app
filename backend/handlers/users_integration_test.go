package handlers_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

func TestAdminUsersSearchReturnsOtherUsers(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)
	otherUser.Set("email", "MixedCaseUser@example.com")
	if err := server.app.Save(otherUser); err != nil {
		t.Fatalf("failed to update other user email: %v", err)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/users?search=mixedcaseuser@example.com",
		adminToken,
		"",
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := response.Body.String()
	if !strings.Contains(body, "MixedCaseUser@example.com") {
		t.Fatalf("expected response to include searched user email, got %s", body)
	}
}

func TestAdminUserLookupFindsOtherUserCaseInsensitive(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	targetUser.Set("email", "AnotherUser@Example.com")
	if err := server.app.Save(targetUser); err != nil {
		t.Fatalf("failed to update target user email: %v", err)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/users/lookup?email=anotheruser@example.com",
		adminToken,
		"",
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := response.Body.String()
	if !strings.Contains(body, targetUser.Id) {
		t.Fatalf("expected response to include target user id, got %s", body)
	}
}

func TestAdminUserAccessUpdateChangesOtherUser(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/users/"+targetUser.Id+"/access",
		adminToken,
		`{"isSubscriber":true,"isBetaUser":true}`,
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	refreshed, err := server.app.FindRecordById("users", targetUser.Id)
	if err != nil {
		t.Fatalf("failed to reload target user: %v", err)
	}

	if !refreshed.GetBool("isSubscriber") {
		t.Fatalf("expected isSubscriber=true after access update")
	}
	if !refreshed.GetBool("isBetaUser") {
		t.Fatalf("expected isBetaUser=true after access update")
	}
}
