package handlers_test

import (
	"net/http"
	"testing"
	"time"

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

func TestTastingSessionRawCollectionRulesDenyInviteOnlyUsers(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	leader, leaderToken := createAuthUser(t, server.app, false, false)
	pendingInvitee, pendingInviteeToken := createAuthUser(t, server.app, false, false)
	dismissedInvitee, dismissedInviteeToken := createAuthUser(t, server.app, false, false)
	revokedInvitee, revokedInviteeToken := createAuthUser(t, server.app, false, false)
	expiredInvitee, expiredInviteeToken := createAuthUser(t, server.app, false, false)
	participant, participantToken := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Invite Rule Counter",
		"location":    "San Francisco, CA",
		"cuisineType": "Japanese",
		"createdBy":   leader.Id,
		"visibility":  "friends",
	})
	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"restaurant": restaurant.Id,
		"name":       "Invite Rule Bite",
		"createdBy":  leader.Id,
		"visibility": "friends",
	})
	activeSession := createCollectionRecord(t, server.app, "tasting_sessions", map[string]any{
		"name":            "Active Invite Rules",
		"leader":          leader.Id,
		"status":          "lobby",
		"join_expires_at": time.Now().UTC().Add(time.Hour),
		"invite_code":     "RULE01",
	})
	expiredSession := createCollectionRecord(t, server.app, "tasting_sessions", map[string]any{
		"name":            "Expired Invite Rules",
		"leader":          leader.Id,
		"status":          "lobby",
		"join_expires_at": time.Now().UTC().Add(-time.Hour),
		"invite_code":     "RULE02",
	})
	leaderParticipant := createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": activeSession.Id,
		"user":    leader.Id,
		"role":    "leader",
	})
	participantRecord := createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": activeSession.Id,
		"user":    participant.Id,
		"role":    "participant",
	})
	restaurantSuggestion := createCollectionRecord(t, server.app, "tasting_session_restaurants", map[string]any{
		"session":                  activeSession.Id,
		"restaurant":               restaurant.Id,
		"suggested_by_participant": leaderParticipant.Id,
		"status":                   "approved",
	})
	item := createCollectionRecord(t, server.app, "tasting_session_items", map[string]any{
		"session":                  activeSession.Id,
		"restaurant_suggestion":    restaurantSuggestion.Id,
		"menu_item":                menuItem.Id,
		"suggested_by_participant": leaderParticipant.Id,
		"status":                   "approved",
	})
	createCollectionRecord(t, server.app, "tasting_session_ratings", map[string]any{
		"session":               activeSession.Id,
		"restaurant_suggestion": restaurantSuggestion.Id,
		"item":                  item.Id,
		"participant":           participantRecord.Id,
		"user":                  participant.Id,
		"rating":                4,
		"note":                  "Participant note",
	})
	createCollectionRecord(t, server.app, "tasting_session_invites", map[string]any{
		"session":      activeSession.Id,
		"invited_user": pendingInvitee.Id,
		"status":       "pending",
	})
	createCollectionRecord(t, server.app, "tasting_session_invites", map[string]any{
		"session":      activeSession.Id,
		"invited_user": dismissedInvitee.Id,
		"status":       "dismissed",
	})
	createCollectionRecord(t, server.app, "tasting_session_invites", map[string]any{
		"session":      activeSession.Id,
		"invited_user": revokedInvitee.Id,
		"status":       "revoked",
	})
	createCollectionRecord(t, server.app, "tasting_session_invites", map[string]any{
		"session":      expiredSession.Id,
		"invited_user": expiredInvitee.Id,
		"status":       "pending",
	})

	previewResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+activeSession.Id,
		pendingInviteeToken,
		"",
	)
	if previewResponse.Code != http.StatusOK {
		t.Fatalf("expected pending invitee custom preview to remain available, got %d: %s", previewResponse.Code, previewResponse.Body.String())
	}

	rawCollectionPaths := []string{
		"/api/collections/tasting_sessions/records",
		"/api/collections/tasting_session_participants/records",
		"/api/collections/tasting_session_invites/records",
		"/api/collections/tasting_session_restaurants/records",
		"/api/collections/tasting_session_items/records",
		"/api/collections/tasting_session_ratings/records",
	}
	inviteOnlyTokens := map[string]string{
		"pending":   pendingInviteeToken,
		"dismissed": dismissedInviteeToken,
		"revoked":   revokedInviteeToken,
		"expired":   expiredInviteeToken,
	}
	for inviteStatus, token := range inviteOnlyTokens {
		for _, path := range rawCollectionPaths {
			response := performJSONRequest(t, server.mux, http.MethodGet, path, token, "")
			requireListItemCount(t, response.Code, response.Body.Bytes(), 0)
		}
		t.Logf("verified raw tasting collection reads are hidden for %s invite-only user", inviteStatus)
	}

	expectedParticipantCounts := map[string]int{
		"/api/collections/tasting_sessions/records":             1,
		"/api/collections/tasting_session_participants/records": 2,
		"/api/collections/tasting_session_invites/records":      0,
		"/api/collections/tasting_session_restaurants/records":  1,
		"/api/collections/tasting_session_items/records":        1,
		"/api/collections/tasting_session_ratings/records":      1,
	}
	for path, expectedCount := range expectedParticipantCounts {
		response := performJSONRequest(t, server.mux, http.MethodGet, path, participantToken, "")
		requireListItemCount(t, response.Code, response.Body.Bytes(), expectedCount)
	}

	expectedLeaderCounts := map[string]int{
		"/api/collections/tasting_sessions/records":             2,
		"/api/collections/tasting_session_participants/records": 2,
		"/api/collections/tasting_session_invites/records":      4,
		"/api/collections/tasting_session_restaurants/records":  1,
		"/api/collections/tasting_session_items/records":        1,
		"/api/collections/tasting_session_ratings/records":      1,
	}
	for path, expectedCount := range expectedLeaderCounts {
		response := performJSONRequest(t, server.mux, http.MethodGet, path, leaderToken, "")
		requireListItemCount(t, response.Code, response.Body.Bytes(), expectedCount)
	}
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
		"name":            "Single Use Code",
		"restaurant":      restaurant.Id,
		"leader":          leader.Id,
		"status":          "lobby",
		"invite_code":     "TASTE1",
		"join_expires_at": "2099-01-01 00:00:00.000Z",
	})

	createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": session.Id,
		"user":    leader.Id,
		"role":    "leader",
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
	if secondJoinResponse.Code != http.StatusOK {
		t.Fatalf("expected reusable code to allow second join, got %d: %s", secondJoinResponse.Code, secondJoinResponse.Body.String())
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
	if len(participants) != 3 {
		t.Fatalf("expected leader plus 2 joined participants, got %d", len(participants))
	}
	joinedFirst := false
	for _, participant := range participants {
		if participant.GetString("user") == firstJoiner.Id {
			joinedFirst = true
		}
	}
	if !joinedFirst {
		t.Fatalf("expected first joiner to be present, got %#v", participants)
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
