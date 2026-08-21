package handlers_test

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

func TestInviteLookupReturnsMinimalInviterInfo(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterInviteCodeHandlers(se, app)
	})

	inviter, _ := createAuthUser(t, server.app, false, false)
	inviter.Set("name", "Inviter Name")
	if err := server.app.Save(inviter); err != nil {
		t.Fatalf("failed to update inviter: %v", err)
	}

	createCollectionRecord(t, server.app, "invite_codes", map[string]any{
		"code":      "friendcode12",
		"used":      false,
		"createdBy": inviter.Id,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/invite-codes/inviter/friendcode12",
		"",
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	payload := parseJSONMap(t, response.Body.Bytes())
	if payload["hasInviter"] != true {
		t.Fatalf("expected hasInviter=true, got %#v", payload["hasInviter"])
	}

	inviterPayload, ok := payload["inviter"].(map[string]any)
	if !ok {
		t.Fatalf("expected inviter payload, got %#v", payload["inviter"])
	}

	if inviterPayload["id"] != inviter.Id {
		t.Fatalf("expected inviter id %s, got %#v", inviter.Id, inviterPayload["id"])
	}
	if inviterPayload["displayName"] != "Inviter Name" {
		t.Fatalf("expected displayName, got %#v", inviterPayload["displayName"])
	}
	if _, exists := inviterPayload["email"]; exists {
		t.Fatalf("did not expect inviter email in payload: %#v", inviterPayload)
	}
	if _, exists := inviterPayload["name"]; exists {
		t.Fatalf("did not expect raw inviter name field in payload: %#v", inviterPayload)
	}
}

func TestFriendCodeLookupReturnsIndexedMinimalUserInfo(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterInviteCodeHandlers(se, app)
	})

	_, requesterToken := createAuthUser(t, server.app, false, false)
	target, _ := createAuthUser(t, server.app, false, false)
	target.Set("name", "Target Friend")
	target.Set("friendCode", "FRND1234")
	if err := server.app.Save(target); err != nil {
		t.Fatalf("failed to update target friend code: %v", err)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/users/by-friend-code/FRND1234",
		requesterToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	payload := parseJSONMap(t, response.Body.Bytes())
	if payload["found"] != true {
		t.Fatalf("expected found=true, got %#v", payload["found"])
	}

	userPayload, ok := payload["user"].(map[string]any)
	if !ok {
		t.Fatalf("expected user payload, got %#v", payload["user"])
	}

	if userPayload["id"] != target.Id {
		t.Fatalf("expected target id %s, got %#v", target.Id, userPayload["id"])
	}
	if userPayload["displayName"] != "Target Friend" {
		t.Fatalf("expected displayName, got %#v", userPayload["displayName"])
	}
	if _, exists := userPayload["email"]; exists {
		t.Fatalf("did not expect email in payload: %#v", userPayload)
	}
}

func TestUsersViewRuleAllowsOwnersAndAdminsButRejectsOtherViewers(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, _ core.App) {})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	ownerToFriend, ownerToFriendToken := createAuthUser(t, server.app, false, false)
	friendToOwner, friendToOwnerToken := createAuthUser(t, server.app, false, false)
	_, strangerToken := createAuthUser(t, server.app, false, false)
	_, adminToken := createAuthUser(t, server.app, true, false)

	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   owner.Id,
		"friend": ownerToFriend.Id,
		"status": "accepted",
	})
	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   friendToOwner.Id,
		"friend": owner.Id,
		"status": "accepted",
	})

	ownerSelfResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/users/records/"+owner.Id,
		ownerToken,
		"",
	)
	if ownerSelfResponse.Code != http.StatusOK {
		t.Fatalf("expected owner self-view to succeed, got %d: %s", ownerSelfResponse.Code, ownerSelfResponse.Body.String())
	}

	adminResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/users/records/"+owner.Id,
		adminToken,
		"",
	)
	if adminResponse.Code != http.StatusOK {
		t.Fatalf("expected admin view to succeed, got %d: %s", adminResponse.Code, adminResponse.Body.String())
	}

	for _, scenario := range []struct {
		name  string
		token string
	}{
		{name: "owner-to-friend accepted friendship", token: ownerToFriendToken},
		{name: "friend-to-owner accepted friendship", token: friendToOwnerToken},
		{name: "stranger", token: strangerToken},
		{name: "anonymous"},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			response := performJSONRequest(
				t,
				server.mux,
				http.MethodGet,
				"/api/collections/users/records/"+owner.Id,
				scenario.token,
				"",
			)
			if response.Code == http.StatusOK {
				t.Fatalf("expected raw user view to be denied, got 200: %s", response.Body.String())
			}
		})
	}
}

func TestUsersViewRuleRejectsPendingAndBlockedRelationships(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, _ core.App) {})

	owner, _ := createAuthUser(t, server.app, false, false)
	pendingUser, pendingToken := createAuthUser(t, server.app, false, false)
	blockedUser, blockedToken := createAuthUser(t, server.app, false, false)

	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   owner.Id,
		"friend": pendingUser.Id,
		"status": "pending",
	})

	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   blockedUser.Id,
		"friend": owner.Id,
		"status": "blocked",
	})

	pendingResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/users/records/"+owner.Id,
		pendingToken,
		"",
	)
	if pendingResponse.Code == http.StatusOK {
		t.Fatalf("expected pending friendship to be denied, got 200: %s", pendingResponse.Body.String())
	}

	blockedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/users/records/"+owner.Id,
		blockedToken,
		"",
	)
	if blockedResponse.Code == http.StatusOK {
		t.Fatalf("expected blocked relationship to be denied, got 200: %s", blockedResponse.Body.String())
	}
}

func TestInviteLookupRouteRateLimitBlocksBurstRequests(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterInviteCodeHandlers(se, app)
	})

	server.app.Settings().RateLimits.Enabled = true
	server.app.Settings().RateLimits.Rules = []core.RateLimitRule{
		{Label: "GET /api/invite-codes/inviter/", Duration: 60, MaxRequests: 2},
	}

	for i := 0; i < 2; i++ {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodGet,
			"/api/invite-codes/inviter/does-not-exist",
			"",
			"",
		)
		if response.Code != http.StatusNotFound {
			t.Fatalf("expected initial request %d to get 404, got %d: %s", i+1, response.Code, response.Body.String())
		}
	}

	limitedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/invite-codes/inviter/does-not-exist",
		"",
		"",
	)
	if limitedResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after burst, got %d: %s", limitedResponse.Code, limitedResponse.Body.String())
	}
}

func TestAuthWithPasswordRouteRateLimitBlocksBurstRequests(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, _ core.App) {})

	user, _ := createAuthUser(t, server.app, false, false)

	server.app.Settings().RateLimits.Enabled = true
	server.app.Settings().RateLimits.Rules = []core.RateLimitRule{
		{Label: "POST /api/collections/users/auth-with-password", Audience: "@guest", Duration: 60, MaxRequests: 2},
	}

	requestBody := `{"identity":"` + user.Email() + `","password":"wrong-password"}`

	for i := 0; i < 2; i++ {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			"/api/collections/users/auth-with-password",
			"",
			requestBody,
		)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected invalid login attempt %d to get 400, got %d: %s", i+1, response.Code, response.Body.String())
		}
	}

	limitedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/users/auth-with-password",
		"",
		requestBody,
	)
	if limitedResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after auth burst, got %d: %s", limitedResponse.Code, limitedResponse.Body.String())
	}
}
