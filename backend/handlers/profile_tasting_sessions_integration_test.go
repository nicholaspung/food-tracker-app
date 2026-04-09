package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

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
	ID              string                           `json:"id"`
	Name            string                           `json:"name"`
	RestaurantName  string                           `json:"restaurantName"`
	InviteCode      string                           `json:"inviteCode"`
	CreatedByUserID string                           `json:"createdByUserId"`
	Status          string                           `json:"status"`
	Participants    []tastingSessionParticipantEntry `json:"participants"`
	Items           []tastingSessionItemEntry        `json:"items"`
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
	Description            string                      `json:"description"`
	CreatedByParticipantID string                      `json:"createdByParticipantId"`
	Ratings                []tastingSessionRatingEntry `json:"ratings"`
}

type tastingSessionRatingEntry struct {
	ParticipantID string  `json:"participantId"`
	Rating        float64 `json:"rating"`
	Note          string  `json:"note"`
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
		`{"name":"Friday Flight","restaurantName":"Tasting Counter"}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}

	createdSession := parseJSONResponse[tastingSessionResponse](t, createResponse.Body.Bytes())
	if createdSession.Name != "Friday Flight" {
		t.Fatalf("expected session name to round-trip, got %#v", createdSession)
	}
	if createdSession.RestaurantName != "Tasting Counter" {
		t.Fatalf("expected restaurant name to round-trip, got %#v", createdSession)
	}
	if createdSession.Status != "adding_items" {
		t.Fatalf("expected session status adding_items, got %#v", createdSession)
	}
	if createdSession.CreatedByUserID != leader.Id {
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
		`{"name":"Crunch Test","restaurantName":"Snack Lab"}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	createdSession := parseJSONResponse[tastingSessionResponse](t, createResponse.Body.Bytes())

	addItemResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/items",
		authToken,
		`{"name":"Sea Salt Chips","description":"Ridged cut"}`,
	)
	if addItemResponse.Code != http.StatusOK {
		t.Fatalf("expected add item to succeed, got %d: %s", addItemResponse.Code, addItemResponse.Body.String())
	}
	sessionWithItem := parseJSONResponse[tastingSessionResponse](t, addItemResponse.Body.Bytes())
	if len(sessionWithItem.Items) != 1 {
		t.Fatalf("expected 1 item after add, got %#v", sessionWithItem)
	}

	startRatingResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/tasting-sessions/"+createdSession.ID+"/status",
		authToken,
		`{"status":"rating"}`,
	)
	if startRatingResponse.Code != http.StatusOK {
		t.Fatalf("expected start rating to succeed, got %d: %s", startRatingResponse.Code, startRatingResponse.Body.String())
	}

	rateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPut,
		"/api/tasting-sessions/"+createdSession.ID+"/items/"+sessionWithItem.Items[0].ID+"/rating",
		authToken,
		`{"rating":4,"note":"Crisp finish"}`,
	)
	if rateResponse.Code != http.StatusOK {
		t.Fatalf("expected rate item to succeed, got %d: %s", rateResponse.Code, rateResponse.Body.String())
	}

	completeResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/tasting-sessions/"+createdSession.ID+"/status",
		authToken,
		`{"status":"completed"}`,
	)
	if completeResponse.Code != http.StatusOK {
		t.Fatalf("expected complete session to succeed, got %d: %s", completeResponse.Code, completeResponse.Body.String())
	}

	completedSession := parseJSONResponse[tastingSessionResponse](t, completeResponse.Body.Bytes())
	if completedSession.Status != "completed" {
		t.Fatalf("expected completed status, got %#v", completedSession)
	}
	if len(completedSession.Items) != 1 || len(completedSession.Items[0].Ratings) != 1 {
		t.Fatalf("expected completed session to include persisted rating, got %#v", completedSession)
	}
	if completedSession.Items[0].Ratings[0].Rating != 4 {
		t.Fatalf("expected persisted rating value 4, got %#v", completedSession.Items[0].Ratings)
	}
	if completedSession.Items[0].Ratings[0].Note != "Crisp finish" {
		t.Fatalf("expected persisted rating note, got %#v", completedSession.Items[0].Ratings)
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
		"status":     "rating",
		"locked":     true,
	})

	leaderParticipant := createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": session.Id,
		"user":    leader.Id,
	})
	participantRecord := createCollectionRecord(t, server.app, "tasting_session_participants", map[string]any{
		"session": session.Id,
		"user":    participant.Id,
	})
	item := createCollectionRecord(t, server.app, "tasting_session_items", map[string]any{
		"session":     session.Id,
		"name":        "Sesame Mochi",
		"added_by":    leader.Id,
		"description": "Nutty finish",
	})

	createCollectionRecord(t, server.app, "tasting_session_ratings", map[string]any{
		"session": session.Id,
		"item":    item.Id,
		"user":    leader.Id,
		"rating":  5,
		"notes":   "Leader note",
	})
	createCollectionRecord(t, server.app, "tasting_session_ratings", map[string]any{
		"session": session.Id,
		"item":    item.Id,
		"user":    participant.Id,
		"rating":  2,
		"notes":   "Participant note",
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
	if len(inProgressLeaderSession.Items) != 1 || len(inProgressLeaderSession.Items[0].Ratings) != 1 {
		t.Fatalf("expected in-progress session to expose only the viewer's rating, got %#v", inProgressLeaderSession)
	}
	if inProgressLeaderSession.Items[0].Ratings[0].ParticipantID != leaderParticipant.Id {
		t.Fatalf("expected leader rating to remain visible to leader, got %#v", inProgressLeaderSession.Items[0].Ratings)
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
	if len(inProgressParticipantSession.Items) != 1 || len(inProgressParticipantSession.Items[0].Ratings) != 1 {
		t.Fatalf("expected in-progress session to expose only participant's own rating, got %#v", inProgressParticipantSession)
	}
	if inProgressParticipantSession.Items[0].Ratings[0].ParticipantID != participantRecord.Id {
		t.Fatalf("expected participant rating to remain visible to participant, got %#v", inProgressParticipantSession.Items[0].Ratings)
	}

	session.Set("status", "completed")
	session.Set("locked", true)
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
	if len(completedSession.Items) != 1 || len(completedSession.Items[0].Ratings) != 2 {
		t.Fatalf("expected completed session to expose all ratings, got %#v", completedSession)
	}
}
