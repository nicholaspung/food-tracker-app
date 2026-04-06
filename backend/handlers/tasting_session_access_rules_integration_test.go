package handlers_test

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
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

func TestTastingSessionJoinConsumesInviteCodeOnce(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	leader, _ := createAuthUser(t, server.app, false, false)
	firstJoiner, firstJoinerToken := createAuthUser(t, server.app, false, false)
	_, secondJoinerToken := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Code Consumption Tasting",
		"location":    "San Francisco, CA",
		"cuisineType": "Japanese",
		"user":        leader.Id,
		"visibility":  "public",
	})

	session := createCollectionRecord(t, server.app, "tasting_sessions", map[string]any{
		"name":       "Single Use Code",
		"restaurant": restaurant.Id,
		"leader":     leader.Id,
		"status":     "adding_items",
		"locked":     false,
	})

	invite := createCollectionRecord(t, server.app, "tasting_session_invites", map[string]any{
		"session":    session.Id,
		"code":       "TASTE1",
		"created_by": leader.Id,
		"expires_at": "2099-01-01 00:00:00.000Z",
	})

	firstJoinResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/join",
		firstJoinerToken,
		`{"code":"taste1"}`,
	)
	if firstJoinResponse.Code != http.StatusOK {
		t.Fatalf("expected first join to succeed, got %d: %s", firstJoinResponse.Code, firstJoinResponse.Body.String())
	}

	secondJoinResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/join",
		secondJoinerToken,
		`{"code":"TASTE1"}`,
	)
	if secondJoinResponse.Code != http.StatusNotFound {
		t.Fatalf("expected second join attempt to fail, got %d: %s", secondJoinResponse.Code, secondJoinResponse.Body.String())
	}

	participants, err := server.app.FindRecordsByFilter(
		"tasting_session_participants",
		"session = {:session}",
		"",
		0,
		0,
		map[string]any{"session": session.Id},
	)
	if err != nil {
		t.Fatalf("failed to load tasting session participants: %v", err)
	}
	if len(participants) != 1 {
		t.Fatalf("expected exactly 1 participant, got %d", len(participants))
	}
	if participants[0].GetString("user") != firstJoiner.Id {
		t.Fatalf("expected invite to be consumed by first joiner, got %s", participants[0].GetString("user"))
	}

	inviteRecord, err := server.app.FindRecordById("tasting_session_invites", invite.Id)
	if err != nil {
		t.Fatalf("failed to reload tasting session invite: %v", err)
	}
	if inviteRecord.GetString("used_by") != firstJoiner.Id {
		t.Fatalf("expected invite used_by to be %s, got %s", firstJoiner.Id, inviteRecord.GetString("used_by"))
	}
}

func TestTastingSessionInviteCollectionRejectsDuplicateCodes(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, _ core.App) {})

	leader, _ := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Duplicate Code Tasting",
		"location":    "San Francisco, CA",
		"cuisineType": "Japanese",
		"user":        leader.Id,
		"visibility":  "public",
	})
	session := createCollectionRecord(t, server.app, "tasting_sessions", map[string]any{
		"name":       "Duplicate Codes",
		"restaurant": restaurant.Id,
		"leader":     leader.Id,
		"status":     "adding_items",
		"locked":     false,
	})

	createCollectionRecord(t, server.app, "tasting_session_invites", map[string]any{
		"session":    session.Id,
		"code":       "TASTE1",
		"created_by": leader.Id,
		"expires_at": "2099-01-01 00:00:00.000Z",
	})

	collection, err := server.app.FindCollectionByNameOrId("tasting_session_invites")
	if err != nil {
		t.Fatalf("failed to resolve tasting_session_invites collection: %v", err)
	}

	duplicate := core.NewRecord(collection)
	duplicate.Set("session", session.Id)
	duplicate.Set("code", "TASTE1")
	duplicate.Set("created_by", leader.Id)
	duplicate.Set("expires_at", "2099-01-02 00:00:00.000Z")

	if err := server.app.Save(duplicate); err == nil {
		t.Fatalf("expected duplicate tasting session invite code to be rejected")
	}
}

func TestTastingSessionJoinRouteRateLimitBlocksBurstRequests(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	_, authToken := createAuthUser(t, server.app, false, false)

	server.app.Settings().RateLimits.Enabled = true
	server.app.Settings().RateLimits.Rules = []core.RateLimitRule{
		{Label: "POST /api/tasting-sessions/join", Audience: "@auth", Duration: 60, MaxRequests: 2},
	}

	for i := 0; i < 2; i++ {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			"/api/tasting-sessions/join",
			authToken,
			`{"code":"BAD999"}`,
		)
		if response.Code != http.StatusNotFound {
			t.Fatalf("expected initial join attempt %d to get 404, got %d: %s", i+1, response.Code, response.Body.String())
		}
	}

	limitedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/join",
		authToken,
		`{"code":"BAD999"}`,
	)
	if limitedResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after tasting session join burst, got %d: %s", limitedResponse.Code, limitedResponse.Body.String())
	}
}
