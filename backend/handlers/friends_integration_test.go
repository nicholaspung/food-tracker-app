package handlers_test

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

func TestFriendsListEndpointReturnsMinimalDisplayDataAcrossSections(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFriendHandlers(se, app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	acceptedFriend, _ := createAuthUser(t, server.app, false, false)
	incomingRequester, _ := createAuthUser(t, server.app, false, false)
	outgoingRecipient, _ := createAuthUser(t, server.app, false, false)

	acceptedFriend.Set("name", "Accepted Friend")
	incomingRequester.Set("name", "Incoming Requester")
	outgoingRecipient.Set("name", "Outgoing Recipient")
	if err := server.app.Save(acceptedFriend); err != nil {
		t.Fatalf("failed to update accepted friend: %v", err)
	}
	if err := server.app.Save(incomingRequester); err != nil {
		t.Fatalf("failed to update incoming requester: %v", err)
	}
	if err := server.app.Save(outgoingRecipient); err != nil {
		t.Fatalf("failed to update outgoing recipient: %v", err)
	}

	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   owner.Id,
		"friend": acceptedFriend.Id,
		"status": "accepted",
	})
	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   incomingRequester.Id,
		"friend": owner.Id,
		"status": "pending",
	})
	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   owner.Id,
		"friend": outgoingRecipient.Id,
		"status": "pending",
	})

	for _, scenario := range []struct {
		section        string
		expectedStatus string
		expectedUserID string
		expectedName   string
	}{
		{section: "friends", expectedStatus: "friend", expectedUserID: acceptedFriend.Id, expectedName: "Accepted Friend"},
		{section: "requests", expectedStatus: "pending_received", expectedUserID: incomingRequester.Id, expectedName: "Incoming Requester"},
		{section: "sent", expectedStatus: "pending_sent", expectedUserID: outgoingRecipient.Id, expectedName: "Outgoing Recipient"},
	} {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodGet,
			"/api/friends?section="+scenario.section+"&page=1&pageSize=20",
			ownerToken,
			"",
		)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for section %s, got %d: %s", scenario.section, response.Code, response.Body.String())
		}

		payload := parseJSONMap(t, response.Body.Bytes())
		if payload["totalItems"] != float64(1) {
			t.Fatalf("expected 1 item for section %s, got %#v", scenario.section, payload["totalItems"])
		}

		items, ok := payload["items"].([]any)
		if !ok || len(items) != 1 {
			t.Fatalf("expected one item for section %s, got %#v", scenario.section, payload["items"])
		}

		item, ok := items[0].(map[string]any)
		if !ok {
			t.Fatalf("expected object item for section %s, got %#v", scenario.section, items[0])
		}

		if item["userId"] != scenario.expectedUserID {
			t.Fatalf("expected userId %s for section %s, got %#v", scenario.expectedUserID, scenario.section, item["userId"])
		}
		if item["displayName"] != scenario.expectedName {
			t.Fatalf("expected displayName %q for section %s, got %#v", scenario.expectedName, scenario.section, item["displayName"])
		}
		if item["status"] != scenario.expectedStatus {
			t.Fatalf("expected status %q for section %s, got %#v", scenario.expectedStatus, scenario.section, item["status"])
		}
		if _, exists := item["email"]; exists {
			t.Fatalf("did not expect email in section %s payload: %#v", scenario.section, item)
		}
	}
}

func TestFriendsListEndpointRejectsInvalidSection(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFriendHandlers(se, app)
	})

	_, ownerToken := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/friends?section=unknown",
		ownerToken,
		"",
	)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid section, got %d: %s", response.Code, response.Body.String())
	}
}

func TestFriendsListEndpointSupportsSearchAndUserIDFilters(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFriendHandlers(se, app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	appleFriend, _ := createAuthUser(t, server.app, false, false)
	betaFriend, _ := createAuthUser(t, server.app, false, false)

	appleFriend.Set("name", "Apple Orchard")
	appleFriend.Set("email", "apple@example.com")
	betaFriend.Set("name", "Beta Tester")
	betaFriend.Set("email", "beta@example.com")
	if err := server.app.Save(appleFriend); err != nil {
		t.Fatalf("failed to update apple friend: %v", err)
	}
	if err := server.app.Save(betaFriend); err != nil {
		t.Fatalf("failed to update beta friend: %v", err)
	}

	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   owner.Id,
		"friend": appleFriend.Id,
		"status": "accepted",
	})
	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   owner.Id,
		"friend": betaFriend.Id,
		"status": "accepted",
	})

	searchResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/friends?section=friends&search=BETA&page=1&pageSize=20",
		ownerToken,
		"",
	)
	if searchResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for search filter, got %d: %s", searchResponse.Code, searchResponse.Body.String())
	}

	searchPayload := parseJSONMap(t, searchResponse.Body.Bytes())
	if searchPayload["totalItems"] != float64(1) {
		t.Fatalf("expected 1 search result, got %#v", searchPayload["totalItems"])
	}

	searchItems, ok := searchPayload["items"].([]any)
	if !ok || len(searchItems) != 1 {
		t.Fatalf("expected one search result item, got %#v", searchPayload["items"])
	}

	searchItem, ok := searchItems[0].(map[string]any)
	if !ok {
		t.Fatalf("expected object search item, got %#v", searchItems[0])
	}
	if searchItem["userId"] != betaFriend.Id {
		t.Fatalf("expected beta friend from search, got %#v", searchItem["userId"])
	}

	userIDResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/friends?section=friends&userIds="+appleFriend.Id+"&page=1&pageSize=20",
		ownerToken,
		"",
	)
	if userIDResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for userIds filter, got %d: %s", userIDResponse.Code, userIDResponse.Body.String())
	}

	userIDPayload := parseJSONMap(t, userIDResponse.Body.Bytes())
	if userIDPayload["totalItems"] != float64(1) {
		t.Fatalf("expected 1 userIds result, got %#v", userIDPayload["totalItems"])
	}

	userIDItems, ok := userIDPayload["items"].([]any)
	if !ok || len(userIDItems) != 1 {
		t.Fatalf("expected one userIds item, got %#v", userIDPayload["items"])
	}

	userIDItem, ok := userIDItems[0].(map[string]any)
	if !ok {
		t.Fatalf("expected object userIds item, got %#v", userIDItems[0])
	}
	if userIDItem["userId"] != appleFriend.Id {
		t.Fatalf("expected apple friend from userIds filter, got %#v", userIDItem["userId"])
	}
}
