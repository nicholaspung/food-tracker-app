package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

func TestNotesSummaryEndpoint(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)

	createNoteRecord(t, server.app, user.Id, "draft")
	createNoteRecord(t, server.app, user.Id, "draft")
	createNoteRecord(t, server.app, user.Id, "used")
	createNoteRecord(t, server.app, otherUser.Id, "used")

	response := performJSONRequest(t, server.mux, http.MethodGet, "/api/notes/summary", token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())
	assertFloatEquals(t, body["allCount"], 3)
	assertFloatEquals(t, body["draftCount"], 2)
	assertFloatEquals(t, body["usedCount"], 1)
}

func TestFriendsSummaryEndpoint(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	friendA, _ := createAuthUser(t, server.app, false, false)
	friendB, _ := createAuthUser(t, server.app, false, false)
	friendC, _ := createAuthUser(t, server.app, false, false)
	friendD, _ := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)
	otherFriend, _ := createAuthUser(t, server.app, false, false)

	createFriendshipRecord(t, server.app, user.Id, friendA.Id, "accepted")
	createFriendshipRecord(t, server.app, friendB.Id, user.Id, "pending")
	createFriendshipRecord(t, server.app, user.Id, friendC.Id, "pending")
	createFriendshipRecord(t, server.app, user.Id, friendD.Id, "blocked")
	createFriendshipRecord(t, server.app, otherUser.Id, otherFriend.Id, "accepted")

	response := performJSONRequest(t, server.mux, http.MethodGet, "/api/friends/summary", token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())
	assertFloatEquals(t, body["friendsCount"], 1)
	assertFloatEquals(t, body["requestsCount"], 1)
	assertFloatEquals(t, body["sentCount"], 1)
}

func TestFeedbackSummaryEndpoint(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)

	createFeedbackRecord(t, server.app, user.Id, "open")
	createFeedbackRecord(t, server.app, user.Id, "in_progress")
	createFeedbackRecord(t, server.app, user.Id, "resolved")
	createFeedbackRecord(t, server.app, user.Id, "closed")
	createFeedbackRecord(t, server.app, otherUser.Id, "open")

	response := performJSONRequest(t, server.mux, http.MethodGet, "/api/feedback/summary", token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())
	assertFloatEquals(t, body["allCount"], 4)
	assertFloatEquals(t, body["activeCount"], 2)
}

func TestRestaurantVisitStatsEndpoint(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	friendA, _ := createAuthUser(t, server.app, false, false)
	friendB, _ := createAuthUser(t, server.app, false, false)
	pendingFriend, _ := createAuthUser(t, server.app, false, false)

	createFriendshipRecord(t, server.app, user.Id, friendA.Id, "accepted")
	createFriendshipRecord(t, server.app, friendB.Id, user.Id, "accepted")
	createFriendshipRecord(t, server.app, user.Id, pendingFriend.Id, "pending")

	restaurantA := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Stats Restaurant A",
		"location":   "Los Angeles, CA",
		"visibility": "public",
	})
	restaurantB := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Stats Restaurant B",
		"location":   "Los Angeles, CA",
		"visibility": "public",
	})
	restaurantC := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Stats Restaurant C",
		"location":   "Los Angeles, CA",
		"visibility": "public",
	})

	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantA.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-01 18:30:00.000Z",
		"visibility": "private",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant":       restaurantA.Id,
		"user":             user.Id,
		"visitDate":        "2026-04-02 18:30:00.000Z",
		"visibility":       "friends",
		"moderationStatus": "under_review",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant":       restaurantA.Id,
		"user":             user.Id,
		"visitDate":        "2026-04-03 18:30:00.000Z",
		"visibility":       "friends",
		"moderationStatus": "hidden",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantA.Id,
		"user":       friendA.Id,
		"visitDate":  "2026-04-04 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantA.Id,
		"user":       friendA.Id,
		"visitDate":  "2026-04-05 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantA.Id,
		"user":       friendB.Id,
		"visitDate":  "2026-04-06 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantA.Id,
		"user":       pendingFriend.Id,
		"visitDate":  "2026-04-07 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantB.Id,
		"user":       friendA.Id,
		"visitDate":  "2026-04-08 18:30:00.000Z",
		"visibility": "private",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant":       restaurantB.Id,
		"user":             friendB.Id,
		"visitDate":        "2026-04-09 18:30:00.000Z",
		"visibility":       "friends",
		"moderationStatus": "under_review",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantB.Id,
		"user":       friendA.Id,
		"visitDate":  "2026-04-10 18:30:00.000Z",
		"visibility": "friends",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/restaurants/visit-stats",
		token,
		`{"restaurantIds":["","`+restaurantB.Id+`","`+restaurantA.Id+`","`+restaurantA.Id+`","`+restaurantC.Id+`"]}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		Stats []struct {
			RestaurantID   string `json:"restaurantId"`
			UserVisitCount int    `json:"userVisitCount"`
			FriendCount    int    `json:"friendCount"`
		} `json:"stats"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse response JSON: %v; body=%s", err, response.Body.String())
	}

	if len(payload.Stats) != 3 {
		t.Fatalf("expected 3 stats rows, got %d: %#v", len(payload.Stats), payload.Stats)
	}

	statsByRestaurantID := make(map[string]struct {
		userVisitCount int
		friendCount    int
	}, len(payload.Stats))
	for _, stat := range payload.Stats {
		statsByRestaurantID[stat.RestaurantID] = struct {
			userVisitCount int
			friendCount    int
		}{
			userVisitCount: stat.UserVisitCount,
			friendCount:    stat.FriendCount,
		}
	}

	if stat := statsByRestaurantID[restaurantA.Id]; stat.userVisitCount != 2 || stat.friendCount != 2 {
		t.Fatalf("unexpected stats for restaurant A: %#v", stat)
	}
	if stat := statsByRestaurantID[restaurantB.Id]; stat.userVisitCount != 0 || stat.friendCount != 1 {
		t.Fatalf("unexpected stats for restaurant B: %#v", stat)
	}
	if stat := statsByRestaurantID[restaurantC.Id]; stat.userVisitCount != 0 || stat.friendCount != 0 {
		t.Fatalf("unexpected stats for restaurant C: %#v", stat)
	}
}

func createNoteRecord(t *testing.T, app core.App, userID string, status string) {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("notes")
	if err != nil {
		t.Fatalf("failed to resolve notes collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("content", "Integration test note")
	record.Set("status", status)
	record.Set("user", userID)

	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create note: %v", err)
	}
}

func createFriendshipRecord(t *testing.T, app core.App, userID string, friendID string, status string) {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("friendships")
	if err != nil {
		t.Fatalf("failed to resolve friendships collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("friend", friendID)
	record.Set("status", status)

	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create friendship: %v", err)
	}
}

func createFeedbackRecord(t *testing.T, app core.App, userID string, status string) {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("feedback")
	if err != nil {
		t.Fatalf("failed to resolve feedback collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("title", "Integration test feedback")
	record.Set("description", "Integration test feedback description")
	record.Set("status", status)

	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create feedback: %v", err)
	}
}

func assertFloatEquals(t *testing.T, value any, expected float64) {
	t.Helper()

	actual, ok := value.(float64)
	if !ok {
		t.Fatalf("expected numeric JSON value, got %T (%v)", value, value)
	}

	if actual != expected {
		t.Fatalf("expected %.0f, got %.0f", expected, actual)
	}
}
