package handlers_test

import (
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
