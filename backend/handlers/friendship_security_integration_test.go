package handlers_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/hooks"
)

func TestFriendshipCollectionRejectsSpoofedAcceptedCreation(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, app core.App) {
		hooks.RegisterFriendshipSecurityHooks(app)
	})

	requester, requesterToken := createAuthUser(t, server.app, false, false)
	target, _ := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/friendships/records",
		requesterToken,
		fmt.Sprintf(`{"user":"%s","friend":"%s","status":"accepted"}`, target.Id, target.Id),
	)

	if response.Code == http.StatusOK {
		t.Fatalf("expected spoofed friendship create to be rejected, got 200: %s", response.Body.String())
	}

	rows, err := server.app.FindRecordsByFilter(
		"friendships",
		"((user = {:leftUser} && friend = {:rightUser}) || (user = {:rightUser} && friend = {:leftUser}))",
		"",
		0,
		0,
		map[string]any{
			"leftUser":  requester.Id,
			"rightUser": target.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to list friendships: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("expected no friendship records to be created, found %d", len(rows))
	}

	selfAttempt := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/friendships/records",
		requesterToken,
		fmt.Sprintf(`{"user":"%s","friend":"%s","status":"pending"}`, requester.Id, requester.Id),
	)
	if selfAttempt.Code == http.StatusOK {
		t.Fatalf("expected self-friend attempt to be rejected, got 200: %s", selfAttempt.Body.String())
	}
}

func TestAcceptFriendSuggestionEndpointCreatesAcceptedFriendshipForInviter(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		hooks.RegisterFriendshipSecurityHooks(app)
		handlers.RegisterFriendHandlers(se, app)
	})

	inviter, _ := createAuthUser(t, server.app, false, false)
	invitee, inviteeToken := createAuthUser(t, server.app, false, false)

	createCollectionRecord(t, server.app, "invite_codes", map[string]any{
		"code":      "validinvite01",
		"createdBy": inviter.Id,
		"used":      true,
		"usedBy":    invitee.Id,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/friends/suggestions/accept",
		inviteeToken,
		fmt.Sprintf(`{"inviterId":"%s"}`, inviter.Id),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	friendship, err := server.app.FindFirstRecordByFilter(
		"friendships",
		"((user = {:leftUser} && friend = {:rightUser}) || (user = {:rightUser} && friend = {:leftUser}))",
		map[string]any{
			"leftUser":  inviter.Id,
			"rightUser": invitee.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load created friendship: %v", err)
	}

	if friendship.GetString("status") != "accepted" {
		t.Fatalf("expected accepted friendship, got %q", friendship.GetString("status"))
	}
}
