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
	ID           string                           `json:"id"`
	Name         string                           `json:"name"`
	InviteCode   string                           `json:"inviteCode"`
	LeaderUserID string                           `json:"leaderUserId"`
	Status       string                           `json:"status"`
	Participants []tastingSessionParticipantEntry `json:"participants"`
	Restaurants  []tastingSessionRestaurantEntry  `json:"restaurants"`
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

	leader, authToken := createAuthUser(t, server.app, true, false)

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

func TestTastingSessionWorkflowEndpointsPersistBackendState(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	_, authToken := createAuthUser(t, server.app, true, false)

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

func TestTastingSessionDetailHidesOtherRatingsUntilCompleted(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})

	leader, leaderToken := createAuthUser(t, server.app, true, false)
	participant, participantToken := createAuthUser(t, server.app, true, false)

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
