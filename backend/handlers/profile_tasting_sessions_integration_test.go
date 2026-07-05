package handlers_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

type profileResponse struct {
	DisplayName            string `json:"displayName"`
	Bio                    string `json:"bio"`
	Location               string `json:"location"`
	FavoriteCuisine        string `json:"favoriteCuisine"`
	ReceiveMarketingEmails bool   `json:"receiveMarketingEmails"`
}

type tastingSessionResponse struct {
	ID           string                           `json:"id"`
	Name         string                           `json:"name"`
	InviteCode   string                           `json:"inviteCode"`
	LeaderUserID string                           `json:"leaderUserId"`
	Status       string                           `json:"status"`
	Participants []tastingSessionParticipantEntry `json:"participants"`
	Invites      []tastingSessionInviteEntry      `json:"invites"`
	Restaurants  []tastingSessionRestaurantEntry  `json:"restaurants"`
}

type tastingSessionInviteEntry struct {
	ID            string `json:"id"`
	InvitedUserID string `json:"invitedUserId"`
	Status        string `json:"status"`
}

type tastingSessionRestaurantEntry struct {
	ID             string                    `json:"id"`
	RestaurantID   string                    `json:"restaurantId"`
	RestaurantName string                    `json:"restaurantName"`
	Status         string                    `json:"status"`
	Items          []tastingSessionItemEntry `json:"items"`
}

type tastingSessionParticipantEntry struct {
	ID       string `json:"id"`
	UserID   string `json:"userId"`
	Name     string `json:"name"`
	JoinedAt string `json:"joinedAt"`
}

type tastingSessionItemEntry struct {
	ID                     string                      `json:"id"`
	Name                   string                      `json:"name"`
	RestaurantSuggestionID string                      `json:"restaurantSuggestionId"`
	Status                 string                      `json:"status"`
	Ratings                []tastingSessionRatingEntry `json:"ratings"`
}

type tastingSessionRatingEntry struct {
	ParticipantID       string  `json:"participantId"`
	Rating              float64 `json:"rating"`
	Note                string  `json:"note"`
	GeneratedVisitID    string  `json:"generatedVisitId"`
	GeneratedFoodItemID string  `json:"generatedFoodItemId"`
}

func parseJSONResponse[T any](t *testing.T, body []byte) T {
	t.Helper()

	var response T
	if err := json.Unmarshal(body, &response); err != nil {
		t.Fatalf("failed to parse response JSON: %v; body=%s", err, string(body))
	}

	return response
}

func TestSelfProfileHandlersGetAndPatch(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	user, authToken := createAuthUser(t, server.app, false, false)

	getResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/profile",
		authToken,
		"",
	)
	if getResponse.Code != http.StatusOK {
		t.Fatalf("expected initial profile load to succeed, got %d: %s", getResponse.Code, getResponse.Body.String())
	}

	initialProfile := parseJSONResponse[profileResponse](t, getResponse.Body.Bytes())
	if initialProfile.DisplayName != user.GetString("name") {
		t.Fatalf("expected initial display name %q, got %q", user.GetString("name"), initialProfile.DisplayName)
	}
	if initialProfile.Bio != "" || initialProfile.Location != "" || initialProfile.FavoriteCuisine != "" {
		t.Fatalf("expected empty initial profile fields, got %#v", initialProfile)
	}
	if initialProfile.ReceiveMarketingEmails {
		t.Fatalf("expected initial marketing preference to be false")
	}

	patchResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/profile",
		authToken,
		`{"displayName":"Chef Taylor","bio":"Chasing noodle flights.","location":"San Francisco","favoriteCuisine":"Ramen","receiveMarketingEmails":true}`,
	)
	if patchResponse.Code != http.StatusOK {
		t.Fatalf("expected profile patch to succeed, got %d: %s", patchResponse.Code, patchResponse.Body.String())
	}

	updatedProfile := parseJSONResponse[profileResponse](t, patchResponse.Body.Bytes())
	if updatedProfile.DisplayName != "Chef Taylor" {
		t.Fatalf("expected updated display name, got %#v", updatedProfile)
	}
	if updatedProfile.Bio != "Chasing noodle flights." {
		t.Fatalf("expected updated bio, got %#v", updatedProfile)
	}
	if updatedProfile.Location != "San Francisco" {
		t.Fatalf("expected updated location, got %#v", updatedProfile)
	}
	if updatedProfile.FavoriteCuisine != "Ramen" {
		t.Fatalf("expected updated favorite cuisine, got %#v", updatedProfile)
	}
	if !updatedProfile.ReceiveMarketingEmails {
		t.Fatalf("expected marketing preference to be true")
	}

	reloadedUser, err := server.app.FindRecordById("users", user.Id)
	if err != nil {
		t.Fatalf("failed to reload user: %v", err)
	}
	if reloadedUser.GetString("name") != "Chef Taylor" {
		t.Fatalf("expected user name to be updated, got %q", reloadedUser.GetString("name"))
	}
	if reloadedUser.GetString("bio") != "Chasing noodle flights." {
		t.Fatalf("expected bio to be persisted, got %q", reloadedUser.GetString("bio"))
	}
	if reloadedUser.GetString("location") != "San Francisco" {
		t.Fatalf("expected location to be persisted, got %q", reloadedUser.GetString("location"))
	}
	if reloadedUser.GetString("favoriteCuisine") != "Ramen" {
		t.Fatalf("expected favoriteCuisine to be persisted, got %q", reloadedUser.GetString("favoriteCuisine"))
	}
	if !reloadedUser.GetBool("receiveMarketingEmails") {
		t.Fatalf("expected receiveMarketingEmails to be persisted")
	}
}

func TestTastingSessionCreateAndListEndpointsUseBackendRecords(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	leader, authToken := createAuthUser(t, server.app, false, false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		authToken,
		`{"name":"Friday Flight","joinDurationMinutes":60}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}

	createdSession := parseJSONResponse[tastingSessionResponse](t, createResponse.Body.Bytes())
	if createdSession.Name != "Friday Flight" {
		t.Fatalf("expected session name to round-trip, got %#v", createdSession)
	}
	if createdSession.Status != "lobby" {
		t.Fatalf("expected session status lobby, got %#v", createdSession)
	}
	if createdSession.LeaderUserID != leader.Id {
		t.Fatalf("expected leader id %q, got %#v", leader.Id, createdSession)
	}
	if len(createdSession.Participants) != 1 || createdSession.Participants[0].UserID != leader.Id {
		t.Fatalf("expected leader participant in response, got %#v", createdSession.Participants)
	}
	if len(createdSession.InviteCode) != 6 {
		t.Fatalf("expected create response to include an active invite code, got %#v", createdSession)
	}

	listResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions",
		authToken,
		"",
	)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected list sessions to succeed, got %d: %s", listResponse.Code, listResponse.Body.String())
	}

	listedSessions := parseJSONResponse[[]tastingSessionResponse](t, listResponse.Body.Bytes())
	if len(listedSessions) != 1 {
		t.Fatalf("expected 1 tasting session in list, got %#v", listedSessions)
	}
	if listedSessions[0].ID != createdSession.ID {
		t.Fatalf("expected listed session %q, got %#v", createdSession.ID, listedSessions)
	}
}

func TestTastingSessionSummaryPageReturnsBoundedListRows(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterTastingSessionHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	leader, _ := createAuthUser(t, server.app, false, false)

	activeSession := createCollectionRecord(t, server.app, "tasting_sessions", map[string]any{
		"name":               "Active tasting",
		"leader":             user.Id,
		"status":             "lobby",
		"join_expires_at":    time.Now().UTC().Add(30 * time.Minute),
		"invite_code":        "ACT123",
		"max_participants":   8,
		"max_restaurants":    3,
		"max_approved_items": 12,
	})
	createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": activeSession.Id,
		"user":    user.Id,
		"role":    "leader",
	})

	expiredInviteSession := createCollectionRecord(t, server.app, "tasting_sessions", map[string]any{
		"name":               "Expired invite",
		"leader":             leader.Id,
		"status":             "lobby",
		"join_expires_at":    time.Now().UTC().Add(-30 * time.Minute),
		"invite_code":        "EXP123",
		"max_participants":   8,
		"max_restaurants":    3,
		"max_approved_items": 12,
	})
	createCollectionRecord(t, server.app, "tasting_session_invites", map[string]any{
		"session":      expiredInviteSession.Id,
		"invited_user": user.Id,
		"status":       "pending",
	})

	completedSession := createCollectionRecord(t, server.app, "tasting_sessions", map[string]any{
		"name":               "Completed tasting",
		"leader":             leader.Id,
		"status":             "completed",
		"join_expires_at":    time.Now().UTC().Add(30 * time.Minute),
		"invite_code":        "DONE12",
		"max_participants":   8,
		"max_restaurants":    3,
		"max_approved_items": 12,
	})
	leaderParticipant := createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": completedSession.Id,
		"user":    leader.Id,
		"role":    "leader",
	})
	createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": completedSession.Id,
		"user":    user.Id,
		"role":    "participant",
	})
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Summary Ramen",
		"location":   "San Francisco",
		"user":       leader.Id,
		"visibility": "private",
	})
	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":       "Shoyu",
		"restaurant": restaurant.Id,
		"visibility": "private",
	})
	restaurantSuggestion := createCollectionRecord(t, server.app, "tasting_session_restaurants", map[string]any{
		"session":                  completedSession.Id,
		"restaurant":               restaurant.Id,
		"suggested_by_participant": leaderParticipant.Id,
		"status":                   "approved",
	})
	createCollectionRecord(t, server.app, "tasting_session_items", map[string]any{
		"session":                  completedSession.Id,
		"restaurant_suggestion":    restaurantSuggestion.Id,
		"menu_item":                menuItem.Id,
		"suggested_by_participant": leaderParticipant.Id,
		"status":                   "approved",
	})

	activeResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/summary-page?filter=active&page=1&pageSize=1",
		token,
		"",
	)
	if activeResponse.Code != http.StatusOK {
		t.Fatalf("expected active summary page to succeed, got %d: %s", activeResponse.Code, activeResponse.Body.String())
	}

	var activePayload struct {
		Items       []map[string]any `json:"items"`
		Page        int              `json:"page"`
		PageSize    int              `json:"pageSize"`
		TotalItems  int              `json:"totalItems"`
		HasNextPage bool             `json:"hasNextPage"`
	}
	if err := json.Unmarshal(activeResponse.Body.Bytes(), &activePayload); err != nil {
		t.Fatalf("failed to parse active summary response JSON: %v; body=%s", err, activeResponse.Body.String())
	}
	if activePayload.TotalItems != 1 || activePayload.Page != 1 || activePayload.PageSize != 1 || activePayload.HasNextPage {
		t.Fatalf("unexpected active summary pagination: %#v", activePayload)
	}
	if len(activePayload.Items) != 1 || activePayload.Items[0]["id"] != activeSession.Id {
		t.Fatalf("expected only the active leader session, got %#v", activePayload.Items)
	}
	if _, ok := activePayload.Items[0]["restaurants"]; ok {
		t.Fatalf("expected summary row to omit full restaurant details: %#v", activePayload.Items[0])
	}

	completedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/summary-page?filter=completed&page=1&pageSize=1",
		token,
		"",
	)
	if completedResponse.Code != http.StatusOK {
		t.Fatalf("expected completed summary page to succeed, got %d: %s", completedResponse.Code, completedResponse.Body.String())
	}

	var completedPayload struct {
		Items []struct {
			ID                      string `json:"id"`
			JoinedCount             int    `json:"joinedCount"`
			ApprovedRestaurantCount int    `json:"approvedRestaurantCount"`
			ApprovedItemCount       int    `json:"approvedItemCount"`
			ViewerParticipant       bool   `json:"viewerParticipant"`
		} `json:"items"`
		TotalItems int `json:"totalItems"`
	}
	if err := json.Unmarshal(completedResponse.Body.Bytes(), &completedPayload); err != nil {
		t.Fatalf("failed to parse completed summary response JSON: %v; body=%s", err, completedResponse.Body.String())
	}
	if len(completedPayload.Items) != 1 ||
		completedPayload.TotalItems != 1 ||
		completedPayload.Items[0].ID != completedSession.Id ||
		completedPayload.Items[0].JoinedCount != 2 ||
		completedPayload.Items[0].ApprovedRestaurantCount != 1 ||
		completedPayload.Items[0].ApprovedItemCount != 1 ||
		!completedPayload.Items[0].ViewerParticipant {
		t.Fatalf("unexpected completed summary payload: %#v", completedPayload)
	}
}

func TestTastingSessionReopenInviteWindowRefreshesExpiredLobbyCode(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	_, leaderToken := createAuthUser(t, server.app, false, false)
	joiner, joinerToken := createAuthUser(t, server.app, false, false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Expired Flight","joinDurationMinutes":60,"invitedUserIds":["`+joiner.Id+`"]}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	createdSession := parseJSONResponse[tastingSessionResponse](t, createResponse.Body.Bytes())
	oldCode := createdSession.InviteCode
	if len(oldCode) != 6 {
		t.Fatalf("expected create response to include invite code, got %#v", createdSession)
	}

	sessionRecord, err := server.app.FindRecordById("tasting_sessions", createdSession.ID)
	if err != nil {
		t.Fatalf("failed to load tasting session: %v", err)
	}
	sessionRecord.Set("join_expires_at", time.Now().UTC().Add(-time.Hour))
	if err := server.app.Save(sessionRecord); err != nil {
		t.Fatalf("failed to expire tasting session: %v", err)
	}

	expiredJoinResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/join",
		joinerToken,
		`{"code":"`+oldCode+`"}`,
	)
	if expiredJoinResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected expired join to fail, got %d: %s", expiredJoinResponse.Code, expiredJoinResponse.Body.String())
	}
	if !strings.Contains(strings.ToLower(expiredJoinResponse.Body.String()), "invite code has expired") {
		t.Fatalf("expected expired invite message, got %s", expiredJoinResponse.Body.String())
	}

	dismissResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/dismiss-invite",
		joinerToken,
		`{}`,
	)
	if dismissResponse.Code != http.StatusOK {
		t.Fatalf("expected dismiss invite to succeed, got %d: %s", dismissResponse.Code, dismissResponse.Body.String())
	}

	expiredInviteeDetailResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+createdSession.ID,
		joinerToken,
		"",
	)
	if expiredInviteeDetailResponse.Code != http.StatusNotFound {
		t.Fatalf("expected expired invitee detail to be hidden, got %d: %s", expiredInviteeDetailResponse.Code, expiredInviteeDetailResponse.Body.String())
	}

	expiredInviteeListResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions",
		joinerToken,
		"",
	)
	if expiredInviteeListResponse.Code != http.StatusOK {
		t.Fatalf("expected expired invitee list to load, got %d: %s", expiredInviteeListResponse.Code, expiredInviteeListResponse.Body.String())
	}
	expiredInviteeList := parseJSONResponse[[]tastingSessionResponse](t, expiredInviteeListResponse.Body.Bytes())
	if len(expiredInviteeList) != 0 {
		t.Fatalf("expected expired invitee list to hide invite-only sessions, got %#v", expiredInviteeList)
	}

	expiredDetailResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+createdSession.ID,
		leaderToken,
		"",
	)
	if expiredDetailResponse.Code != http.StatusOK {
		t.Fatalf("expected expired detail to load, got %d: %s", expiredDetailResponse.Code, expiredDetailResponse.Body.String())
	}
	expiredDetail := parseJSONResponse[tastingSessionResponse](t, expiredDetailResponse.Body.Bytes())
	if expiredDetail.InviteCode != "" {
		t.Fatalf("expected expired leader detail to hide invite code, got %#v", expiredDetail)
	}

	expiredListResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions",
		leaderToken,
		"",
	)
	if expiredListResponse.Code != http.StatusOK {
		t.Fatalf("expected expired list to load, got %d: %s", expiredListResponse.Code, expiredListResponse.Body.String())
	}
	expiredList := parseJSONResponse[[]tastingSessionResponse](t, expiredListResponse.Body.Bytes())
	if len(expiredList) != 1 || expiredList[0].InviteCode != "" {
		t.Fatalf("expected expired leader list to hide invite code, got %#v", expiredList)
	}

	reopenResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/reopen-invite-window",
		leaderToken,
		`{"joinDurationMinutes":60}`,
	)
	if reopenResponse.Code != http.StatusOK {
		t.Fatalf("expected reopen to succeed, got %d: %s", reopenResponse.Code, reopenResponse.Body.String())
	}
	reopenedSession := parseJSONResponse[tastingSessionResponse](t, reopenResponse.Body.Bytes())
	if len(reopenedSession.InviteCode) != 6 {
		t.Fatalf("expected reopen response to include a fresh invite code, got %#v", reopenedSession)
	}
	if reopenedSession.InviteCode == oldCode {
		t.Fatalf("expected reopen to rotate invite code, got old code %q", oldCode)
	}
	if len(reopenedSession.Invites) != 1 ||
		reopenedSession.Invites[0].InvitedUserID != joiner.Id ||
		reopenedSession.Invites[0].Status != "pending" {
		t.Fatalf("expected reopen to reactivate dismissed invite, got %#v", reopenedSession.Invites)
	}

	reopenedInviteeDetailResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+createdSession.ID,
		joinerToken,
		"",
	)
	if reopenedInviteeDetailResponse.Code != http.StatusOK {
		t.Fatalf("expected reopened invitee detail to be visible, got %d: %s", reopenedInviteeDetailResponse.Code, reopenedInviteeDetailResponse.Body.String())
	}

	oldCodeJoinResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/join",
		joinerToken,
		`{"code":"`+oldCode+`"}`,
	)
	if oldCodeJoinResponse.Code == http.StatusOK {
		t.Fatalf("expected old code to stop working after reopen, got %d: %s", oldCodeJoinResponse.Code, oldCodeJoinResponse.Body.String())
	}

	newCodeJoinResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/join",
		joinerToken,
		`{"code":"`+reopenedSession.InviteCode+`"}`,
	)
	if newCodeJoinResponse.Code != http.StatusOK {
		t.Fatalf("expected fresh code join to succeed, got %d: %s", newCodeJoinResponse.Code, newCodeJoinResponse.Body.String())
	}
}

func TestTastingSessionReopenInviteWindowRequiresLeaderExpiredLobby(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	_, leaderToken := createAuthUser(t, server.app, false, false)
	_, participantToken := createAuthUser(t, server.app, false, false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Guarded Flight","joinDurationMinutes":60}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	createdSession := parseJSONResponse[tastingSessionResponse](t, createResponse.Body.Bytes())

	openWindowResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/reopen-invite-window",
		leaderToken,
		`{"joinDurationMinutes":60}`,
	)
	if openWindowResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected open window reopen to fail, got %d: %s", openWindowResponse.Code, openWindowResponse.Body.String())
	}

	joinResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/join",
		participantToken,
		`{"code":"`+createdSession.InviteCode+`"}`,
	)
	if joinResponse.Code != http.StatusOK {
		t.Fatalf("expected participant join to succeed, got %d: %s", joinResponse.Code, joinResponse.Body.String())
	}

	sessionRecord, err := server.app.FindRecordById("tasting_sessions", createdSession.ID)
	if err != nil {
		t.Fatalf("failed to load tasting session: %v", err)
	}
	sessionRecord.Set("join_expires_at", time.Now().UTC().Add(-time.Hour))
	if err := server.app.Save(sessionRecord); err != nil {
		t.Fatalf("failed to expire tasting session: %v", err)
	}

	participantReopenResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/reopen-invite-window",
		participantToken,
		`{"joinDurationMinutes":60}`,
	)
	if participantReopenResponse.Code != http.StatusForbidden {
		t.Fatalf("expected participant reopen to fail, got %d: %s", participantReopenResponse.Code, participantReopenResponse.Body.String())
	}

	lockResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/lock-membership",
		leaderToken,
		`{}`,
	)
	if lockResponse.Code != http.StatusOK {
		t.Fatalf("expected lock membership to succeed, got %d: %s", lockResponse.Code, lockResponse.Body.String())
	}

	planningReopenResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/reopen-invite-window",
		leaderToken,
		`{"joinDurationMinutes":60}`,
	)
	if planningReopenResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected planning reopen to fail, got %d: %s", planningReopenResponse.Code, planningReopenResponse.Body.String())
	}
}

func TestTastingSessionDeleteRequiresLeaderLobbyOrPlanning(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	_, leaderToken := createAuthUser(t, server.app, false, false)
	_, participantToken := createAuthUser(t, server.app, false, false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Delete Guard","joinDurationMinutes":60}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	createdSession := parseJSONResponse[tastingSessionResponse](t, createResponse.Body.Bytes())

	joinResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/join",
		participantToken,
		`{"code":"`+createdSession.InviteCode+`"}`,
	)
	if joinResponse.Code != http.StatusOK {
		t.Fatalf("expected participant join to succeed, got %d: %s", joinResponse.Code, joinResponse.Body.String())
	}

	participantDeleteResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodDelete,
		"/api/tasting-sessions/"+createdSession.ID,
		participantToken,
		"",
	)
	if participantDeleteResponse.Code != http.StatusForbidden {
		t.Fatalf("expected participant delete to fail, got %d: %s", participantDeleteResponse.Code, participantDeleteResponse.Body.String())
	}

	leaderDeleteResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodDelete,
		"/api/tasting-sessions/"+createdSession.ID,
		leaderToken,
		"",
	)
	if leaderDeleteResponse.Code != http.StatusOK {
		t.Fatalf("expected leader delete to succeed, got %d: %s", leaderDeleteResponse.Code, leaderDeleteResponse.Body.String())
	}

	deletedDetailResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+createdSession.ID,
		leaderToken,
		"",
	)
	if deletedDetailResponse.Code != http.StatusNotFound {
		t.Fatalf("expected deleted session detail to be missing, got %d: %s", deletedDetailResponse.Code, deletedDetailResponse.Body.String())
	}

	planningCreateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Planning Delete Guard","joinDurationMinutes":60}`,
	)
	if planningCreateResponse.Code != http.StatusOK {
		t.Fatalf("expected planning create session to succeed, got %d: %s", planningCreateResponse.Code, planningCreateResponse.Body.String())
	}
	planningSession := parseJSONResponse[tastingSessionResponse](t, planningCreateResponse.Body.Bytes())

	planningJoinResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/join",
		participantToken,
		`{"code":"`+planningSession.InviteCode+`"}`,
	)
	if planningJoinResponse.Code != http.StatusOK {
		t.Fatalf("expected participant join for planning session to succeed, got %d: %s", planningJoinResponse.Code, planningJoinResponse.Body.String())
	}

	lockResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+planningSession.ID+"/lock-membership",
		leaderToken,
		`{}`,
	)
	if lockResponse.Code != http.StatusOK {
		t.Fatalf("expected lock to succeed, got %d: %s", lockResponse.Code, lockResponse.Body.String())
	}

	suggestRestaurantResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+planningSession.ID+"/restaurants",
		leaderToken,
		`{"restaurantName":"Planning Burger Stand"}`,
	)
	if suggestRestaurantResponse.Code != http.StatusOK {
		t.Fatalf("expected planning restaurant add to succeed, got %d: %s", suggestRestaurantResponse.Code, suggestRestaurantResponse.Body.String())
	}
	sessionWithRestaurant := parseJSONResponse[tastingSessionResponse](t, suggestRestaurantResponse.Body.Bytes())
	if len(sessionWithRestaurant.Restaurants) != 1 {
		t.Fatalf("expected 1 restaurant after planning add, got %#v", sessionWithRestaurant)
	}
	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"restaurant": sessionWithRestaurant.Restaurants[0].RestaurantID,
		"name":       "Animal Fries",
		"createdBy":  sessionWithRestaurant.LeaderUserID,
		"visibility": "friends",
	})
	addItemResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+planningSession.ID+"/restaurants/"+sessionWithRestaurant.Restaurants[0].ID+"/items",
		leaderToken,
		`{"menuItemId":"`+menuItem.Id+`"}`,
	)
	if addItemResponse.Code != http.StatusOK {
		t.Fatalf("expected planning item add to succeed, got %d: %s", addItemResponse.Code, addItemResponse.Body.String())
	}

	planningDeleteResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodDelete,
		"/api/tasting-sessions/"+planningSession.ID,
		leaderToken,
		"",
	)
	if planningDeleteResponse.Code != http.StatusOK {
		t.Fatalf("expected planning delete to succeed, got %d: %s", planningDeleteResponse.Code, planningDeleteResponse.Body.String())
	}

	deletedPlanningDetailResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+planningSession.ID,
		leaderToken,
		"",
	)
	if deletedPlanningDetailResponse.Code != http.StatusNotFound {
		t.Fatalf("expected deleted planning session detail to be missing, got %d: %s", deletedPlanningDetailResponse.Code, deletedPlanningDetailResponse.Body.String())
	}
}

func TestTastingSessionLeaderCanResendDismissedInviteDuringOpenLobby(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	_, leaderToken := createAuthUser(t, server.app, false, false)
	invitee, inviteeToken := createAuthUser(t, server.app, false, false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Resend Guard","joinDurationMinutes":60,"invitedUserIds":["`+invitee.Id+`"]}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	createdSession := parseJSONResponse[tastingSessionResponse](t, createResponse.Body.Bytes())
	if len(createdSession.Invites) != 1 || createdSession.Invites[0].Status != "pending" {
		t.Fatalf("expected pending invite, got %#v", createdSession.Invites)
	}

	dismissResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/dismiss-invite",
		inviteeToken,
		`{}`,
	)
	if dismissResponse.Code != http.StatusOK {
		t.Fatalf("expected dismiss to succeed, got %d: %s", dismissResponse.Code, dismissResponse.Body.String())
	}

	resendResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/invites/"+createdSession.Invites[0].ID+"/resend",
		leaderToken,
		`{}`,
	)
	if resendResponse.Code != http.StatusOK {
		t.Fatalf("expected resend to succeed, got %d: %s", resendResponse.Code, resendResponse.Body.String())
	}
	resentSession := parseJSONResponse[tastingSessionResponse](t, resendResponse.Body.Bytes())
	if len(resentSession.Invites) != 1 || resentSession.Invites[0].Status != "pending" {
		t.Fatalf("expected resend to reactivate invite, got %#v", resentSession.Invites)
	}

	inviteeDetailResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+createdSession.ID,
		inviteeToken,
		"",
	)
	if inviteeDetailResponse.Code != http.StatusOK {
		t.Fatalf("expected resent invite to make session visible, got %d: %s", inviteeDetailResponse.Code, inviteeDetailResponse.Body.String())
	}
}

func TestTastingSessionLeaderCanResendRevokedInviteAfterRemovingParticipant(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	_, leaderToken := createAuthUser(t, server.app, false, false)
	invitee, inviteeToken := createAuthUser(t, server.app, false, false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Revoked Resend","joinDurationMinutes":60,"invitedUserIds":["`+invitee.Id+`"]}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	createdSession := parseJSONResponse[tastingSessionResponse](t, createResponse.Body.Bytes())
	if len(createdSession.Invites) != 1 {
		t.Fatalf("expected invite to be created, got %#v", createdSession.Invites)
	}

	acceptResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/accept-invite",
		inviteeToken,
		`{}`,
	)
	if acceptResponse.Code != http.StatusOK {
		t.Fatalf("expected accept to succeed, got %d: %s", acceptResponse.Code, acceptResponse.Body.String())
	}
	acceptedSession := parseJSONResponse[tastingSessionResponse](t, acceptResponse.Body.Bytes())
	var inviteeParticipantID string
	for _, participant := range acceptedSession.Participants {
		if participant.UserID == invitee.Id {
			inviteeParticipantID = participant.ID
		}
	}
	if inviteeParticipantID == "" {
		t.Fatalf("expected invitee participant after accept, got %#v", acceptedSession.Participants)
	}

	kickResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/participants/"+inviteeParticipantID+"/kick",
		leaderToken,
		`{}`,
	)
	if kickResponse.Code != http.StatusOK {
		t.Fatalf("expected kick to succeed, got %d: %s", kickResponse.Code, kickResponse.Body.String())
	}
	kickedSession := parseJSONResponse[tastingSessionResponse](t, kickResponse.Body.Bytes())
	if len(kickedSession.Invites) != 1 || kickedSession.Invites[0].Status != "revoked" {
		t.Fatalf("expected kick to revoke invite, got %#v", kickedSession.Invites)
	}

	revokedInviteeDetailResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+createdSession.ID,
		inviteeToken,
		"",
	)
	if revokedInviteeDetailResponse.Code != http.StatusNotFound {
		t.Fatalf("expected revoked invitee detail to be hidden, got %d: %s", revokedInviteeDetailResponse.Code, revokedInviteeDetailResponse.Body.String())
	}

	resendResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/invites/"+createdSession.Invites[0].ID+"/resend",
		leaderToken,
		`{}`,
	)
	if resendResponse.Code != http.StatusOK {
		t.Fatalf("expected revoked invite resend to succeed, got %d: %s", resendResponse.Code, resendResponse.Body.String())
	}
	resentSession := parseJSONResponse[tastingSessionResponse](t, resendResponse.Body.Bytes())
	if len(resentSession.Invites) != 1 || resentSession.Invites[0].Status != "pending" {
		t.Fatalf("expected resend to reactivate revoked invite, got %#v", resentSession.Invites)
	}

	reacceptResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/accept-invite",
		inviteeToken,
		`{}`,
	)
	if reacceptResponse.Code != http.StatusOK {
		t.Fatalf("expected reaccept after revoked resend to succeed, got %d: %s", reacceptResponse.Code, reacceptResponse.Body.String())
	}
}

func TestTastingSessionParticipantCanLeaveLobby(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	_, leaderToken := createAuthUser(t, server.app, false, false)
	invitee, inviteeToken := createAuthUser(t, server.app, false, false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Leave Test","joinDurationMinutes":60,"invitedUserIds":["`+invitee.Id+`"]}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	createdSession := parseJSONResponse[tastingSessionResponse](t, createResponse.Body.Bytes())

	acceptResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/accept-invite",
		inviteeToken,
		`{}`,
	)
	if acceptResponse.Code != http.StatusOK {
		t.Fatalf("expected accept to succeed, got %d: %s", acceptResponse.Code, acceptResponse.Body.String())
	}
	acceptedSession := parseJSONResponse[tastingSessionResponse](t, acceptResponse.Body.Bytes())
	if len(acceptedSession.Participants) != 2 {
		t.Fatalf("expected invitee to join, got %#v", acceptedSession.Participants)
	}

	leaveResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/leave",
		inviteeToken,
		`{}`,
	)
	if leaveResponse.Code != http.StatusOK {
		t.Fatalf("expected leave to succeed, got %d: %s", leaveResponse.Code, leaveResponse.Body.String())
	}

	leaderDetailResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+createdSession.ID,
		leaderToken,
		"",
	)
	if leaderDetailResponse.Code != http.StatusOK {
		t.Fatalf("expected leader detail to load, got %d: %s", leaderDetailResponse.Code, leaderDetailResponse.Body.String())
	}
	leaderSession := parseJSONResponse[tastingSessionResponse](t, leaderDetailResponse.Body.Bytes())
	if len(leaderSession.Participants) != 1 || leaderSession.Participants[0].UserID == invitee.Id {
		t.Fatalf("expected invitee to be removed from participants, got %#v", leaderSession.Participants)
	}
	if len(leaderSession.Invites) != 1 || leaderSession.Invites[0].Status != "dismissed" {
		t.Fatalf("expected invite to be dismissed after leaving, got %#v", leaderSession.Invites)
	}

	inviteeDetailResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+createdSession.ID,
		inviteeToken,
		"",
	)
	if inviteeDetailResponse.Code != http.StatusNotFound {
		t.Fatalf("expected invitee detail to be hidden after leaving, got %d: %s", inviteeDetailResponse.Code, inviteeDetailResponse.Body.String())
	}
}

func TestTastingSessionWorkflowEndpointsPersistBackendState(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	_, authToken := createAuthUser(t, server.app, false, false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		authToken,
		`{"name":"Crunch Test","joinDurationMinutes":60}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	createdSession := parseJSONResponse[tastingSessionResponse](t, createResponse.Body.Bytes())

	lockResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/lock-membership",
		authToken,
		`{}`,
	)
	if lockResponse.Code != http.StatusOK {
		t.Fatalf("expected lock membership to succeed, got %d: %s", lockResponse.Code, lockResponse.Body.String())
	}

	suggestRestaurantResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/restaurants",
		authToken,
		`{"restaurantName":"Snack Lab"}`,
	)
	if suggestRestaurantResponse.Code != http.StatusOK {
		t.Fatalf("expected suggest restaurant to succeed, got %d: %s", suggestRestaurantResponse.Code, suggestRestaurantResponse.Body.String())
	}
	sessionWithRestaurant := parseJSONResponse[tastingSessionResponse](t, suggestRestaurantResponse.Body.Bytes())
	if len(sessionWithRestaurant.Restaurants) != 1 {
		t.Fatalf("expected 1 restaurant after suggest, got %#v", sessionWithRestaurant)
	}
	if sessionWithRestaurant.Restaurants[0].Status != "approved" {
		t.Fatalf("expected leader restaurant add to be approved, got %#v", sessionWithRestaurant.Restaurants[0])
	}
	restaurantSuggestionID := sessionWithRestaurant.Restaurants[0].ID
	restaurantID := sessionWithRestaurant.Restaurants[0].RestaurantID

	approveRestaurantResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/tasting-sessions/"+createdSession.ID+"/restaurants/"+restaurantSuggestionID+"/status",
		authToken,
		`{"status":"approved"}`,
	)
	if approveRestaurantResponse.Code != http.StatusOK {
		t.Fatalf("expected approve restaurant to succeed, got %d: %s", approveRestaurantResponse.Code, approveRestaurantResponse.Body.String())
	}
	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"restaurant": restaurantID,
		"name":       "Sea Salt Chips",
		"createdBy":  sessionWithRestaurant.LeaderUserID,
		"visibility": "friends",
	})

	addItemResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/restaurants/"+restaurantSuggestionID+"/items",
		authToken,
		`{"menuItemId":"`+menuItem.Id+`"}`,
	)
	if addItemResponse.Code != http.StatusOK {
		t.Fatalf("expected add item to succeed, got %d: %s", addItemResponse.Code, addItemResponse.Body.String())
	}
	sessionWithItem := parseJSONResponse[tastingSessionResponse](t, addItemResponse.Body.Bytes())
	if len(sessionWithItem.Restaurants) != 1 || len(sessionWithItem.Restaurants[0].Items) != 1 {
		t.Fatalf("expected 1 item after add, got %#v", sessionWithItem)
	}
	if sessionWithItem.Restaurants[0].Items[0].Status != "approved" {
		t.Fatalf("expected leader item add to be approved, got %#v", sessionWithItem.Restaurants[0].Items[0])
	}
	itemID := sessionWithItem.Restaurants[0].Items[0].ID

	approveItemResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/tasting-sessions/"+createdSession.ID+"/items/"+itemID+"/status",
		authToken,
		`{"status":"approved"}`,
	)
	if approveItemResponse.Code != http.StatusOK {
		t.Fatalf("expected approve item to succeed, got %d: %s", approveItemResponse.Code, approveItemResponse.Body.String())
	}

	startRatingResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/start",
		authToken,
		`{}`,
	)
	if startRatingResponse.Code != http.StatusOK {
		t.Fatalf("expected start rating to succeed, got %d: %s", startRatingResponse.Code, startRatingResponse.Body.String())
	}

	rateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/ratings",
		authToken,
		`{"restaurants":[{"restaurantSuggestionId":"`+restaurantSuggestionID+`","items":[{"itemId":"`+itemID+`","rating":4,"note":"Crisp finish"}]}]}`,
	)
	if rateResponse.Code != http.StatusOK {
		t.Fatalf("expected rate item to succeed, got %d: %s", rateResponse.Code, rateResponse.Body.String())
	}

	completeResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/complete",
		authToken,
		`{}`,
	)
	if completeResponse.Code != http.StatusOK {
		t.Fatalf("expected complete session to succeed, got %d: %s", completeResponse.Code, completeResponse.Body.String())
	}

	completedSession := parseJSONResponse[tastingSessionResponse](t, completeResponse.Body.Bytes())
	if completedSession.Status != "completed" {
		t.Fatalf("expected completed status, got %#v", completedSession)
	}
	if len(completedSession.Restaurants) != 1 || len(completedSession.Restaurants[0].Items) != 1 || len(completedSession.Restaurants[0].Items[0].Ratings) != 1 {
		t.Fatalf("expected completed session to include persisted rating, got %#v", completedSession)
	}
	if completedSession.Restaurants[0].Items[0].Ratings[0].Rating != 4 {
		t.Fatalf("expected persisted rating value 4, got %#v", completedSession.Restaurants[0].Items[0].Ratings)
	}
	if completedSession.Restaurants[0].Items[0].Ratings[0].Note != "Crisp finish" {
		t.Fatalf("expected persisted rating note, got %#v", completedSession.Restaurants[0].Items[0].Ratings)
	}
}

func TestTastingSessionRatingCreatesCurrentVisitForHomeFeedWhenOlderRestaurantVisitExists(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureSummaryHandlers(se, app)
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	leader, authToken := createAuthUser(t, server.app, false, false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		authToken,
		`{"name":"Current Flight","joinDurationMinutes":60}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	createdSession := parseJSONResponse[tastingSessionResponse](t, createResponse.Body.Bytes())

	lockResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/lock-membership",
		authToken,
		`{}`,
	)
	if lockResponse.Code != http.StatusOK {
		t.Fatalf("expected lock membership to succeed, got %d: %s", lockResponse.Code, lockResponse.Body.String())
	}

	suggestRestaurantResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/restaurants",
		authToken,
		`{"restaurantName":"Snack Lab"}`,
	)
	if suggestRestaurantResponse.Code != http.StatusOK {
		t.Fatalf("expected suggest restaurant to succeed, got %d: %s", suggestRestaurantResponse.Code, suggestRestaurantResponse.Body.String())
	}
	sessionWithRestaurant := parseJSONResponse[tastingSessionResponse](t, suggestRestaurantResponse.Body.Bytes())
	restaurantSuggestionID := sessionWithRestaurant.Restaurants[0].ID
	restaurantID := sessionWithRestaurant.Restaurants[0].RestaurantID

	olderVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant":     restaurantID,
		"user":           leader.Id,
		"visitDate":      "2026-01-10T18:00:00.000Z",
		"visitLocalDate": "2026-01-10",
		"visibility":     "friends",
	})
	setCollectionRecordCreatedAt(t, server.app, "visits", olderVisit.Id, "2026-01-10 18:00:00.000Z")
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":      olderVisit.Id,
		"user":       leader.Id,
		"name":       "Old Chips",
		"rating":     2,
		"visibility": "friends",
	})

	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"restaurant": restaurantID,
		"name":       "Sea Salt Chips",
		"createdBy":  leader.Id,
		"visibility": "friends",
	})

	addItemResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/restaurants/"+restaurantSuggestionID+"/items",
		authToken,
		`{"menuItemId":"`+menuItem.Id+`"}`,
	)
	if addItemResponse.Code != http.StatusOK {
		t.Fatalf("expected add item to succeed, got %d: %s", addItemResponse.Code, addItemResponse.Body.String())
	}
	sessionWithItem := parseJSONResponse[tastingSessionResponse](t, addItemResponse.Body.Bytes())
	itemID := sessionWithItem.Restaurants[0].Items[0].ID

	startRatingResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/start",
		authToken,
		`{}`,
	)
	if startRatingResponse.Code != http.StatusOK {
		t.Fatalf("expected start rating to succeed, got %d: %s", startRatingResponse.Code, startRatingResponse.Body.String())
	}

	rateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/ratings",
		authToken,
		`{"restaurants":[{"restaurantSuggestionId":"`+restaurantSuggestionID+`","items":[{"itemId":"`+itemID+`","rating":5,"note":"Fresh tasting"}]}]}`,
	)
	if rateResponse.Code != http.StatusOK {
		t.Fatalf("expected rate item to succeed, got %d: %s", rateResponse.Code, rateResponse.Body.String())
	}
	ratedSession := parseJSONResponse[tastingSessionResponse](t, rateResponse.Body.Bytes())
	generatedVisitID := ratedSession.Restaurants[0].Items[0].Ratings[0].GeneratedVisitID
	if generatedVisitID == "" {
		t.Fatalf("expected rating response to include generated visit id, got %#v", ratedSession.Restaurants[0].Items[0].Ratings[0])
	}
	if generatedVisitID == olderVisit.Id {
		t.Fatalf("expected tasting rating to create a current visit instead of reusing older visit %s", olderVisit.Id)
	}

	homeFeedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=5&scope=mine&typeFilter=visits&sort=created",
		authToken,
		"",
	)
	if homeFeedResponse.Code != http.StatusOK {
		t.Fatalf("expected home feed to load, got %d: %s", homeFeedResponse.Code, homeFeedResponse.Body.String())
	}

	var homeFeedPayload struct {
		Items []struct {
			Visit *struct {
				ID    string `json:"id"`
				Items []struct {
					Name string `json:"name"`
				} `json:"items"`
			} `json:"visit"`
		} `json:"items"`
		TotalVisits int `json:"totalVisits"`
	}
	if err := json.Unmarshal(homeFeedResponse.Body.Bytes(), &homeFeedPayload); err != nil {
		t.Fatalf("failed to parse home feed response: %v", err)
	}
	if homeFeedPayload.TotalVisits != 2 {
		t.Fatalf("expected old visit and current tasting visit in totals, got %d: %#v", homeFeedPayload.TotalVisits, homeFeedPayload)
	}
	if len(homeFeedPayload.Items) == 0 || homeFeedPayload.Items[0].Visit == nil {
		t.Fatalf("expected generated tasting visit to appear in home feed, got %#v", homeFeedPayload)
	}
	if homeFeedPayload.Items[0].Visit.ID != generatedVisitID {
		t.Fatalf("expected generated tasting visit first in home feed, got %s want %s", homeFeedPayload.Items[0].Visit.ID, generatedVisitID)
	}
	if len(homeFeedPayload.Items[0].Visit.Items) != 1 || homeFeedPayload.Items[0].Visit.Items[0].Name != "Sea Salt Chips" {
		t.Fatalf("expected generated tasting item on first home feed visit, got %#v", homeFeedPayload.Items[0].Visit.Items)
	}
}

func TestTastingSessionParticipantListReflectsLeaderCompletion(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	leader, leaderToken := createAuthUser(t, server.app, false, false)
	participant, participantToken := createAuthUser(t, server.app, false, false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Participant Completion","joinDurationMinutes":60,"invitedUserIds":["`+participant.Id+`"]}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	createdSession := parseJSONResponse[tastingSessionResponse](t, createResponse.Body.Bytes())

	acceptResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/accept-invite",
		participantToken,
		`{}`,
	)
	if acceptResponse.Code != http.StatusOK {
		t.Fatalf("expected participant accept to succeed, got %d: %s", acceptResponse.Code, acceptResponse.Body.String())
	}

	lockResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/lock-membership",
		leaderToken,
		`{}`,
	)
	if lockResponse.Code != http.StatusOK {
		t.Fatalf("expected lock membership to succeed, got %d: %s", lockResponse.Code, lockResponse.Body.String())
	}

	suggestRestaurantResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/restaurants",
		leaderToken,
		`{"restaurantName":"Refresh Counter"}`,
	)
	if suggestRestaurantResponse.Code != http.StatusOK {
		t.Fatalf("expected suggest restaurant to succeed, got %d: %s", suggestRestaurantResponse.Code, suggestRestaurantResponse.Body.String())
	}
	sessionWithRestaurant := parseJSONResponse[tastingSessionResponse](t, suggestRestaurantResponse.Body.Bytes())
	restaurantSuggestionID := sessionWithRestaurant.Restaurants[0].ID
	restaurantID := sessionWithRestaurant.Restaurants[0].RestaurantID
	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"restaurant": restaurantID,
		"name":       "Shared Bite",
		"createdBy":  leader.Id,
		"visibility": "friends",
	})

	addItemResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/restaurants/"+restaurantSuggestionID+"/items",
		leaderToken,
		`{"menuItemId":"`+menuItem.Id+`"}`,
	)
	if addItemResponse.Code != http.StatusOK {
		t.Fatalf("expected add item to succeed, got %d: %s", addItemResponse.Code, addItemResponse.Body.String())
	}
	sessionWithItem := parseJSONResponse[tastingSessionResponse](t, addItemResponse.Body.Bytes())
	itemID := sessionWithItem.Restaurants[0].Items[0].ID

	startResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/start",
		leaderToken,
		`{}`,
	)
	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start tasting to succeed, got %d: %s", startResponse.Code, startResponse.Body.String())
	}

	rateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/ratings",
		participantToken,
		`{"restaurants":[{"restaurantSuggestionId":"`+restaurantSuggestionID+`","items":[{"itemId":"`+itemID+`","rating":4,"note":"Participant done"}]}]}`,
	)
	if rateResponse.Code != http.StatusOK {
		t.Fatalf("expected participant rating to succeed, got %d: %s", rateResponse.Code, rateResponse.Body.String())
	}

	completeResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/complete",
		leaderToken,
		`{}`,
	)
	if completeResponse.Code != http.StatusOK {
		t.Fatalf("expected complete session to succeed, got %d: %s", completeResponse.Code, completeResponse.Body.String())
	}

	participantListResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions",
		participantToken,
		"",
	)
	if participantListResponse.Code != http.StatusOK {
		t.Fatalf("expected participant list to load after completion, got %d: %s", participantListResponse.Code, participantListResponse.Body.String())
	}
	participantSessions := parseJSONResponse[[]tastingSessionResponse](t, participantListResponse.Body.Bytes())
	if len(participantSessions) != 1 || participantSessions[0].ID != createdSession.ID || participantSessions[0].Status != "completed" {
		t.Fatalf("expected participant list to show completed session, got %#v", participantSessions)
	}

	participantDetailResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+createdSession.ID,
		participantToken,
		"",
	)
	if participantDetailResponse.Code != http.StatusOK {
		t.Fatalf("expected participant detail to load after completion, got %d: %s", participantDetailResponse.Code, participantDetailResponse.Body.String())
	}
	participantDetail := parseJSONResponse[tastingSessionResponse](t, participantDetailResponse.Body.Bytes())
	if participantDetail.Status != "completed" {
		t.Fatalf("expected participant detail to show completed status, got %#v", participantDetail)
	}
}

func TestTastingSessionPlanningAddEndpointsRequireLeader(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	_, leaderToken := createAuthUser(t, server.app, false, false)
	_, participantToken := createAuthUser(t, server.app, false, false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Leader Picks","joinDurationMinutes":60}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	createdSession := parseJSONResponse[tastingSessionResponse](t, createResponse.Body.Bytes())

	joinResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/join",
		participantToken,
		`{"code":"`+createdSession.InviteCode+`"}`,
	)
	if joinResponse.Code != http.StatusOK {
		t.Fatalf("expected participant join to succeed, got %d: %s", joinResponse.Code, joinResponse.Body.String())
	}

	lockResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/lock-membership",
		leaderToken,
		`{}`,
	)
	if lockResponse.Code != http.StatusOK {
		t.Fatalf("expected lock membership to succeed, got %d: %s", lockResponse.Code, lockResponse.Body.String())
	}

	participantRestaurantResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/restaurants",
		participantToken,
		`{"restaurantName":"Participant Pick"}`,
	)
	if participantRestaurantResponse.Code != http.StatusForbidden {
		t.Fatalf("expected participant restaurant add to be forbidden, got %d: %s", participantRestaurantResponse.Code, participantRestaurantResponse.Body.String())
	}

	leaderRestaurantResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/restaurants",
		leaderToken,
		`{"restaurantName":"Leader Pick"}`,
	)
	if leaderRestaurantResponse.Code != http.StatusOK {
		t.Fatalf("expected leader restaurant add to succeed, got %d: %s", leaderRestaurantResponse.Code, leaderRestaurantResponse.Body.String())
	}
	sessionWithRestaurant := parseJSONResponse[tastingSessionResponse](t, leaderRestaurantResponse.Body.Bytes())
	if len(sessionWithRestaurant.Restaurants) != 1 || sessionWithRestaurant.Restaurants[0].Status != "approved" {
		t.Fatalf("expected leader restaurant add to be approved, got %#v", sessionWithRestaurant.Restaurants)
	}
	restaurantSuggestionID := sessionWithRestaurant.Restaurants[0].ID
	restaurantID := sessionWithRestaurant.Restaurants[0].RestaurantID

	participantItemResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/restaurants/"+restaurantSuggestionID+"/items",
		participantToken,
		`{"name":"Participant Item"}`,
	)
	if participantItemResponse.Code != http.StatusForbidden {
		t.Fatalf("expected participant item add to be forbidden, got %d: %s", participantItemResponse.Code, participantItemResponse.Body.String())
	}

	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"restaurant": restaurantID,
		"name":       "Leader Item",
		"visibility": "friends",
	})

	leaderItemResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/restaurants/"+restaurantSuggestionID+"/items",
		leaderToken,
		`{"menuItemId":"`+menuItem.Id+`"}`,
	)
	if leaderItemResponse.Code != http.StatusOK {
		t.Fatalf("expected leader item add to succeed, got %d: %s", leaderItemResponse.Code, leaderItemResponse.Body.String())
	}
	sessionWithItem := parseJSONResponse[tastingSessionResponse](t, leaderItemResponse.Body.Bytes())
	if len(sessionWithItem.Restaurants) != 1 ||
		len(sessionWithItem.Restaurants[0].Items) != 1 ||
		sessionWithItem.Restaurants[0].Items[0].Status != "approved" {
		t.Fatalf("expected leader item add to be approved, got %#v", sessionWithItem.Restaurants)
	}
}

func TestTastingSessionDetailHidesOtherRatingsUntilCompleted(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	leader, leaderToken := createAuthUser(t, server.app, false, false)
	participant, participantToken := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Reveal Counter",
		"location":    "San Francisco, CA",
		"cuisineType": "Japanese",
		"createdBy":   leader.Id,
		"visibility":  "friends",
	})

	session := createCollectionRecord(t, server.app, "tasting_sessions", map[string]any{
		"name":       "Blind Ratings",
		"restaurant": restaurant.Id,
		"leader":     leader.Id,
		"status":     "tasting",
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
	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"restaurant": restaurant.Id,
		"name":       "Sesame Mochi",
		"createdBy":  leader.Id,
		"visibility": "friends",
	})
	item := createCollectionRecord(t, server.app, "tasting_session_items", map[string]any{
		"session":                  session.Id,
		"restaurant_suggestion":    restaurantSuggestion.Id,
		"menu_item":                menuItem.Id,
		"suggested_by_participant": leaderParticipant.Id,
		"status":                   "approved",
	})

	createCollectionRecord(t, server.app, "tasting_session_ratings", map[string]any{
		"session":               session.Id,
		"restaurant_suggestion": restaurantSuggestion.Id,
		"item":                  item.Id,
		"participant":           leaderParticipant.Id,
		"user":                  leader.Id,
		"rating":                5,
		"note":                  "Leader note",
	})
	createCollectionRecord(t, server.app, "tasting_session_ratings", map[string]any{
		"session":               session.Id,
		"restaurant_suggestion": restaurantSuggestion.Id,
		"item":                  item.Id,
		"participant":           participantRecord.Id,
		"user":                  participant.Id,
		"rating":                2,
		"note":                  "Participant note",
	})

	inProgressLeaderResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+session.Id,
		leaderToken,
		"",
	)
	if inProgressLeaderResponse.Code != http.StatusOK {
		t.Fatalf("expected leader detail fetch to succeed, got %d: %s", inProgressLeaderResponse.Code, inProgressLeaderResponse.Body.String())
	}
	inProgressLeaderSession := parseJSONResponse[tastingSessionResponse](t, inProgressLeaderResponse.Body.Bytes())
	if len(inProgressLeaderSession.Restaurants) != 1 || len(inProgressLeaderSession.Restaurants[0].Items) != 1 || len(inProgressLeaderSession.Restaurants[0].Items[0].Ratings) != 1 {
		t.Fatalf("expected in-progress session to expose only the viewer's rating, got %#v", inProgressLeaderSession)
	}
	if inProgressLeaderSession.Restaurants[0].Items[0].Ratings[0].ParticipantID != leaderParticipant.Id {
		t.Fatalf("expected leader rating to remain visible to leader, got %#v", inProgressLeaderSession.Restaurants[0].Items[0].Ratings)
	}

	inProgressParticipantResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+session.Id,
		participantToken,
		"",
	)
	if inProgressParticipantResponse.Code != http.StatusOK {
		t.Fatalf("expected participant detail fetch to succeed, got %d: %s", inProgressParticipantResponse.Code, inProgressParticipantResponse.Body.String())
	}
	inProgressParticipantSession := parseJSONResponse[tastingSessionResponse](t, inProgressParticipantResponse.Body.Bytes())
	if len(inProgressParticipantSession.Restaurants) != 1 || len(inProgressParticipantSession.Restaurants[0].Items) != 1 || len(inProgressParticipantSession.Restaurants[0].Items[0].Ratings) != 1 {
		t.Fatalf("expected in-progress session to expose only participant's own rating, got %#v", inProgressParticipantSession)
	}
	if inProgressParticipantSession.Restaurants[0].Items[0].Ratings[0].ParticipantID != participantRecord.Id {
		t.Fatalf("expected participant rating to remain visible to participant, got %#v", inProgressParticipantSession.Restaurants[0].Items[0].Ratings)
	}

	session.Set("status", "completed")
	if err := server.app.Save(session); err != nil {
		t.Fatalf("failed to mark session completed: %v", err)
	}

	completedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/tasting-sessions/"+session.Id,
		leaderToken,
		"",
	)
	if completedResponse.Code != http.StatusOK {
		t.Fatalf("expected completed detail fetch to succeed, got %d: %s", completedResponse.Code, completedResponse.Body.String())
	}
	completedSession := parseJSONResponse[tastingSessionResponse](t, completedResponse.Body.Bytes())
	if len(completedSession.Restaurants) != 1 || len(completedSession.Restaurants[0].Items) != 1 || len(completedSession.Restaurants[0].Items[0].Ratings) != 2 {
		t.Fatalf("expected completed session to expose all ratings, got %#v", completedSession)
	}
}
