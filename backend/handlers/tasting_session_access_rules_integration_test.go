package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
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
		if path == "/api/collections/tasting_sessions/records" {
			requireRawTastingSessionsOmitInviteCode(t, response.Body.Bytes())
		}
	}

	expectedLeaderCounts := map[string]int{
		"/api/collections/tasting_sessions/records":             2,
		"/api/collections/tasting_session_participants/records": 2,
		"/api/collections/tasting_session_invites/records":      4,
		"/api/collections/tasting_session_restaurants/records":  1,
		"/api/collections/tasting_session_items/records":        1,
		"/api/collections/tasting_session_ratings/records":      0,
	}
	for path, expectedCount := range expectedLeaderCounts {
		response := performJSONRequest(t, server.mux, http.MethodGet, path, leaderToken, "")
		requireListItemCount(t, response.Code, response.Body.Bytes(), expectedCount)
		if path == "/api/collections/tasting_sessions/records" {
			requireRawTastingSessionsOmitInviteCode(t, response.Body.Bytes())
		}
	}

	for actor, token := range map[string]string{
		"leader":      leaderToken,
		"participant": participantToken,
	} {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodGet,
			"/api/collections/tasting_sessions/records/"+activeSession.Id,
			token,
			"",
		)
		if response.Code != http.StatusOK {
			t.Fatalf("expected %s raw session detail to load, got %d: %s", actor, response.Code, response.Body.String())
		}
		if _, exposed := parseJSONMap(t, response.Body.Bytes())["invite_code"]; exposed {
			t.Fatalf("expected %s raw session detail to omit invite_code, got %s", actor, response.Body.String())
		}
	}
}

func TestTastingSessionDetailRestrictsInviteRosterToLeader(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	leader, leaderToken := createAuthUser(t, server.app, false, false)
	participant, participantToken := createAuthUser(t, server.app, false, false)
	pendingInvitee, pendingInviteeToken := createAuthUser(t, server.app, false, false)
	dismissedInvitee, dismissedInviteeToken := createAuthUser(t, server.app, false, false)
	revokedInvitee, revokedInviteeToken := createAuthUser(t, server.app, false, false)
	emailFallbackInvitee, _ := createAuthUser(t, server.app, false, false)
	_, strangerToken := createAuthUser(t, server.app, false, false)

	emailFallbackInvitee.Set("name", "")
	if err := server.app.Save(emailFallbackInvitee); err != nil {
		t.Fatalf("failed to clear invitee display name: %v", err)
	}

	session := createCollectionRecord(t, server.app, "tasting_sessions", map[string]any{
		"name":            "Private Invite Roster",
		"leader":          leader.Id,
		"status":          "lobby",
		"join_expires_at": time.Now().UTC().Add(time.Hour),
		"invite_code":     "SECRET",
	})
	createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": session.Id,
		"user":    leader.Id,
		"role":    "leader",
	})
	createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": session.Id,
		"user":    participant.Id,
		"role":    "participant",
	})

	for _, invite := range []struct {
		userID string
		status string
	}{
		{userID: pendingInvitee.Id, status: "pending"},
		{userID: dismissedInvitee.Id, status: "dismissed"},
		{userID: revokedInvitee.Id, status: "revoked"},
		{userID: emailFallbackInvitee.Id, status: "pending"},
	} {
		createCollectionRecord(t, server.app, "tasting_session_invites", map[string]any{
			"session":      session.Id,
			"invited_user": invite.userID,
			"status":       invite.status,
		})
	}

	leaderResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+session.Id,
		leaderToken,
		"",
	)
	if leaderResponse.Code != http.StatusOK {
		t.Fatalf("expected leader detail to load, got %d: %s", leaderResponse.Code, leaderResponse.Body.String())
	}
	leaderPayload := parseJSONMap(t, leaderResponse.Body.Bytes())
	leaderInvites, ok := leaderPayload["invites"].([]any)
	if !ok || len(leaderInvites) != 4 {
		t.Fatalf("expected leader to receive complete invite roster, got %s", leaderResponse.Body.String())
	}
	if !strings.Contains(leaderResponse.Body.String(), emailFallbackInvitee.Email()) {
		t.Fatalf("expected leader roster to retain email fallback, got %s", leaderResponse.Body.String())
	}

	for role, token := range map[string]string{
		"participant":     participantToken,
		"pending invitee": pendingInviteeToken,
	} {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodGet,
			"/api/tasting-sessions/"+session.Id,
			token,
			"",
		)
		if response.Code != http.StatusOK {
			t.Fatalf("expected %s detail to load, got %d: %s", role, response.Code, response.Body.String())
		}
		invites, ok := parseJSONMap(t, response.Body.Bytes())["invites"].([]any)
		if !ok || len(invites) != 0 {
			t.Fatalf("expected %s to receive a stable empty invite roster, got %s", role, response.Body.String())
		}
		if strings.Contains(response.Body.String(), emailFallbackInvitee.Email()) {
			t.Fatalf("expected %s response to hide invitee email fallback, got %s", role, response.Body.String())
		}
	}

	for role, token := range map[string]string{
		"dismissed invitee": dismissedInviteeToken,
		"revoked invitee":   revokedInviteeToken,
		"stranger":          strangerToken,
	} {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodGet,
			"/api/tasting-sessions/"+session.Id,
			token,
			"",
		)
		if response.Code != http.StatusNotFound {
			t.Fatalf("expected %s detail to remain hidden, got %d: %s", role, response.Code, response.Body.String())
		}
	}
}

func requireRawTastingSessionsOmitInviteCode(t *testing.T, body []byte) {
	t.Helper()

	var payload struct {
		Items []map[string]json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("failed to decode raw tasting session list: %v; body=%s", err, string(body))
	}
	for _, item := range payload.Items {
		if _, exposed := item["invite_code"]; exposed {
			t.Fatalf("expected raw tasting session list to omit invite_code, got %s", string(body))
		}
	}
}

func TestTastingSessionRawRatingsMatchBlindDetailVisibility(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	leader, leaderToken := createAuthUser(t, server.app, false, false)
	participant, participantToken := createAuthUser(t, server.app, false, false)
	invitee, inviteeToken := createAuthUser(t, server.app, false, false)
	otherLeader, otherLeaderToken := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Blind Rating Counter",
		"location":   "San Francisco, CA",
		"createdBy":  leader.Id,
		"visibility": "friends",
	})
	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"restaurant": restaurant.Id,
		"name":       "Blind Rating Bite",
		"createdBy":  leader.Id,
		"visibility": "friends",
	})
	session := createCollectionRecord(t, server.app, "tasting_sessions", map[string]any{
		"name":            "Blind Rating Session",
		"leader":          leader.Id,
		"status":          "planning",
		"invite_code":     "BLIND1",
		"join_expires_at": time.Now().UTC().Add(time.Hour),
	})
	leaderParticipant := createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": session.Id,
		"user":    leader.Id,
		"role":    "leader",
	})
	participantRecord := createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": session.Id,
		"user":    participant.Id,
		"role":    "participant",
	})
	restaurantSuggestion := createCollectionRecord(t, server.app, "tasting_session_restaurants", map[string]any{
		"session":                  session.Id,
		"restaurant":               restaurant.Id,
		"suggested_by_participant": leaderParticipant.Id,
		"status":                   "approved",
	})
	item := createCollectionRecord(t, server.app, "tasting_session_items", map[string]any{
		"session":                  session.Id,
		"restaurant_suggestion":    restaurantSuggestion.Id,
		"menu_item":                menuItem.Id,
		"suggested_by_participant": leaderParticipant.Id,
		"status":                   "approved",
	})
	leaderRating := createCollectionRecord(t, server.app, "tasting_session_ratings", map[string]any{
		"session":               session.Id,
		"restaurant_suggestion": restaurantSuggestion.Id,
		"item":                  item.Id,
		"participant":           leaderParticipant.Id,
		"user":                  leader.Id,
		"rating":                5,
		"note":                  "Leader blind note",
	})
	participantRating := createCollectionRecord(t, server.app, "tasting_session_ratings", map[string]any{
		"session":               session.Id,
		"restaurant_suggestion": restaurantSuggestion.Id,
		"item":                  item.Id,
		"participant":           participantRecord.Id,
		"user":                  participant.Id,
		"rating":                2,
		"note":                  "Participant blind note",
	})
	createCollectionRecord(t, server.app, "tasting_session_invites", map[string]any{
		"session":      session.Id,
		"invited_user": invitee.Id,
		"status":       "pending",
	})

	otherSession := createCollectionRecord(t, server.app, "tasting_sessions", map[string]any{
		"name":   "Other Completed Session",
		"leader": otherLeader.Id,
		"status": "completed",
	})
	otherParticipant := createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": otherSession.Id,
		"user":    otherLeader.Id,
		"role":    "leader",
	})
	otherRestaurantSuggestion := createCollectionRecord(t, server.app, "tasting_session_restaurants", map[string]any{
		"session":                  otherSession.Id,
		"restaurant":               restaurant.Id,
		"suggested_by_participant": otherParticipant.Id,
		"status":                   "approved",
	})
	otherItem := createCollectionRecord(t, server.app, "tasting_session_items", map[string]any{
		"session":                  otherSession.Id,
		"restaurant_suggestion":    otherRestaurantSuggestion.Id,
		"menu_item":                menuItem.Id,
		"suggested_by_participant": otherParticipant.Id,
		"status":                   "approved",
	})
	otherRating := createCollectionRecord(t, server.app, "tasting_session_ratings", map[string]any{
		"session":               otherSession.Id,
		"restaurant_suggestion": otherRestaurantSuggestion.Id,
		"item":                  otherItem.Id,
		"participant":           otherParticipant.Id,
		"user":                  otherLeader.Id,
		"rating":                4,
		"note":                  "Other session note",
	})

	ratingsCollection, err := server.app.FindCollectionByNameOrId("tasting_session_ratings")
	if err != nil {
		t.Fatalf("failed to load tasting rating collection: %v", err)
	}
	if ratingsCollection.CreateRule != nil || ratingsCollection.UpdateRule != nil || ratingsCollection.DeleteRule != nil {
		t.Fatalf("expected raw tasting rating writes to remain disabled, got create=%v update=%v delete=%v", ratingsCollection.CreateRule, ratingsCollection.UpdateRule, ratingsCollection.DeleteRule)
	}

	for _, status := range []string{"planning", "tasting"} {
		session.Set("status", status)
		if err := server.app.Save(session); err != nil {
			t.Fatalf("failed to set tasting session status to %s: %v", status, err)
		}

		requireRawTastingRatingIDs(t, server.mux, session.Id, leaderToken, leaderRating.Id)
		requireCustomTastingRatingParticipantIDs(t, server.mux, session.Id, leaderToken, leaderParticipant.Id)
		requireRawTastingRatingView(t, server.mux, leaderRating.Id, leaderToken, true)
		requireRawTastingRatingView(t, server.mux, participantRating.Id, leaderToken, false)

		requireRawTastingRatingIDs(t, server.mux, session.Id, participantToken, participantRating.Id)
		requireCustomTastingRatingParticipantIDs(t, server.mux, session.Id, participantToken, participantRecord.Id)
		requireRawTastingRatingView(t, server.mux, participantRating.Id, participantToken, true)
		requireRawTastingRatingView(t, server.mux, leaderRating.Id, participantToken, false)
	}

	for actor, token := range map[string]string{
		"invite-only user": inviteeToken,
		"nonmember":        otherLeaderToken,
	} {
		requireRawTastingRatingIDs(t, server.mux, session.Id, token)
		requireRawTastingRatingView(t, server.mux, leaderRating.Id, token, false)
		requireRawTastingRatingView(t, server.mux, participantRating.Id, token, false)
		t.Logf("verified raw ratings are hidden from %s", actor)
	}

	session.Set("status", "completed")
	if err := server.app.Save(session); err != nil {
		t.Fatalf("failed to complete tasting session: %v", err)
	}
	for actor, token := range map[string]string{
		"leader":      leaderToken,
		"participant": participantToken,
	} {
		requireRawTastingRatingIDs(t, server.mux, session.Id, token, leaderRating.Id, participantRating.Id)
		requireCustomTastingRatingParticipantIDs(t, server.mux, session.Id, token, leaderParticipant.Id, participantRecord.Id)
		requireRawTastingRatingView(t, server.mux, leaderRating.Id, token, true)
		requireRawTastingRatingView(t, server.mux, participantRating.Id, token, true)
		t.Logf("verified completed ratings are visible to %s", actor)
	}
	for actor, token := range map[string]string{
		"invite-only user": inviteeToken,
		"nonmember":        otherLeaderToken,
	} {
		requireRawTastingRatingIDs(t, server.mux, session.Id, token)
		requireRawTastingRatingView(t, server.mux, leaderRating.Id, token, false)
		requireRawTastingRatingView(t, server.mux, participantRating.Id, token, false)
		t.Logf("verified completed raw ratings are hidden from %s", actor)
	}

	requireRawTastingRatingIDs(t, server.mux, "", leaderToken, leaderRating.Id, participantRating.Id)
	requireRawTastingRatingIDs(t, server.mux, otherSession.Id, otherLeaderToken, otherRating.Id)
}

func requireRawTastingRatingIDs(t *testing.T, mux http.Handler, sessionID string, token string, expectedIDs ...string) {
	t.Helper()

	path := "/api/collections/tasting_session_ratings/records"
	if sessionID != "" {
		path += "?filter=" + url.QueryEscape("session = '"+sessionID+"'")
	}
	response := performJSONRequest(t, mux, http.MethodGet, path, token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected raw tasting rating list to return 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode raw tasting rating list: %v; body=%s", err, response.Body.String())
	}
	actualIDs := make(map[string]bool, len(payload.Items))
	for _, item := range payload.Items {
		actualIDs[item.ID] = true
	}
	if len(actualIDs) != len(expectedIDs) {
		t.Fatalf("expected raw tasting rating ids %v, got %v", expectedIDs, actualIDs)
	}
	for _, expectedID := range expectedIDs {
		if !actualIDs[expectedID] {
			t.Fatalf("expected raw tasting rating %s, got %v", expectedID, actualIDs)
		}
	}
}

func requireRawTastingRatingView(t *testing.T, mux http.Handler, ratingID string, token string, allowed bool) {
	t.Helper()

	response := performJSONRequest(
		t,
		mux,
		http.MethodGet,
		"/api/collections/tasting_session_ratings/records/"+ratingID,
		token,
		"",
	)
	if allowed && response.Code != http.StatusOK {
		t.Fatalf("expected raw tasting rating %s to be visible, got %d: %s", ratingID, response.Code, response.Body.String())
	}
	if !allowed && response.Code != http.StatusNotFound {
		t.Fatalf("expected raw tasting rating %s to return 404, got %d: %s", ratingID, response.Code, response.Body.String())
	}
}

func requireCustomTastingRatingParticipantIDs(t *testing.T, mux http.Handler, sessionID string, token string, expectedIDs ...string) {
	t.Helper()

	response := performJSONRequest(t, mux, http.MethodGet, "/api/tasting-sessions/"+sessionID, token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected custom tasting detail to return 200, got %d: %s", response.Code, response.Body.String())
	}
	session := parseJSONResponse[tastingSessionResponse](t, response.Body.Bytes())
	actualIDs := map[string]bool{}
	for _, restaurant := range session.Restaurants {
		for _, item := range restaurant.Items {
			for _, rating := range item.Ratings {
				actualIDs[rating.ParticipantID] = true
			}
		}
	}
	if len(actualIDs) != len(expectedIDs) {
		t.Fatalf("expected custom tasting rating participant ids %v, got %v", expectedIDs, actualIDs)
	}
	for _, expectedID := range expectedIDs {
		if !actualIDs[expectedID] {
			t.Fatalf("expected custom tasting rating participant %s, got %v", expectedID, actualIDs)
		}
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
