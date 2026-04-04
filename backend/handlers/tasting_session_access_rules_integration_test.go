package handlers_test

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestTastingSessionListRuleRequiresMembership(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, _ core.App) {})

	leader, leaderToken := createAuthUser(t, server.app, false, false)
	participant, participantToken := createAuthUser(t, server.app, false, false)
	_, strangerToken := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Tasting Counter",
		"location":    "San Francisco, CA",
		"cuisineType": "Japanese",
		"user":        leader.Id,
		"visibility":  "public",
	})

	session := createCollectionRecord(t, server.app, "tasting_sessions", map[string]any{
		"name":       "Friday Flight",
		"restaurant": restaurant.Id,
		"leader":     leader.Id,
		"status":     "adding_items",
		"locked":     false,
	})

	createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": session.Id,
		"user":    participant.Id,
	})

	leaderSessions := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/tasting_sessions/records",
		leaderToken,
		"",
	)
	requireListItemCount(t, leaderSessions.Code, leaderSessions.Body.Bytes(), 1)

	participantSessions := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/tasting_sessions/records",
		participantToken,
		"",
	)
	requireListItemCount(t, participantSessions.Code, participantSessions.Body.Bytes(), 1)

	strangerSessions := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/tasting_sessions/records",
		strangerToken,
		"",
	)
	requireListItemCount(t, strangerSessions.Code, strangerSessions.Body.Bytes(), 0)
}

func TestTastingSessionInviteListRuleRequiresLeader(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, _ core.App) {})

	leader, leaderToken := createAuthUser(t, server.app, false, false)
	participant, participantToken := createAuthUser(t, server.app, false, false)
	_, strangerToken := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Invite-Only Tasting",
		"location":    "San Francisco, CA",
		"cuisineType": "Korean",
		"user":        leader.Id,
		"visibility":  "public",
	})

	session := createCollectionRecord(t, server.app, "tasting_sessions", map[string]any{
		"name":       "Secret Menu Flight",
		"restaurant": restaurant.Id,
		"leader":     leader.Id,
		"status":     "adding_items",
		"locked":     false,
	})

	createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": session.Id,
		"user":    participant.Id,
	})

	createCollectionRecord(t, server.app, "tasting_session_invites", map[string]any{
		"session":    session.Id,
		"code":       "TASTE1",
		"created_by": leader.Id,
		"expires_at": "2099-01-01 00:00:00.000Z",
	})

	leaderInvites := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/tasting_session_invites/records",
		leaderToken,
		"",
	)
	requireListItemCount(t, leaderInvites.Code, leaderInvites.Body.Bytes(), 1)

	participantInvites := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/tasting_session_invites/records",
		participantToken,
		"",
	)
	requireListItemCount(t, participantInvites.Code, participantInvites.Body.Bytes(), 0)

	strangerInvites := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/tasting_session_invites/records",
		strangerToken,
		"",
	)
	requireListItemCount(t, strangerInvites.Code, strangerInvites.Body.Bytes(), 0)
}
