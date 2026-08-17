package handlers_test

import (
	"fmt"
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

func TestFriendsListEndpointIncludesSummaryOnFirstUnfilteredPageOnly(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFriendHandlers(se, app)
		handlers.RegisterFeatureSummaryHandlers(se, app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	acceptedFriend, _ := createAuthUser(t, server.app, false, false)
	incomingRequester, _ := createAuthUser(t, server.app, false, false)
	outgoingRecipient, _ := createAuthUser(t, server.app, false, false)

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

	firstPageResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/friends?section=friends&page=1&pageSize=20",
		ownerToken,
		"",
	)
	if firstPageResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for first page, got %d: %s", firstPageResponse.Code, firstPageResponse.Body.String())
	}

	firstPagePayload := parseJSONMap(t, firstPageResponse.Body.Bytes())
	summaryPayload, ok := firstPagePayload["summary"].(map[string]any)
	if !ok {
		t.Fatalf("expected summary object on first unfiltered page, got %#v", firstPagePayload["summary"])
	}
	assertFloatEquals(t, summaryPayload["friendsCount"], 1)
	assertFloatEquals(t, summaryPayload["requestsCount"], 1)
	assertFloatEquals(t, summaryPayload["sentCount"], 1)

	searchResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/friends?section=friends&search=accepted&page=1&pageSize=20",
		ownerToken,
		"",
	)
	if searchResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for filtered page, got %d: %s", searchResponse.Code, searchResponse.Body.String())
	}

	searchPayload := parseJSONMap(t, searchResponse.Body.Bytes())
	if _, exists := searchPayload["summary"]; exists {
		t.Fatalf("expected filtered page to omit summary, got %#v", searchPayload["summary"])
	}

	secondPageResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/friends?section=friends&page=2&pageSize=1",
		ownerToken,
		"",
	)
	if secondPageResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for later page, got %d: %s", secondPageResponse.Code, secondPageResponse.Body.String())
	}

	secondPagePayload := parseJSONMap(t, secondPageResponse.Body.Bytes())
	if _, exists := secondPagePayload["summary"]; exists {
		t.Fatalf("expected later page to omit summary, got %#v", secondPagePayload["summary"])
	}
}

func TestInviteFriendEndpointReplaysIdempotencyKeyWithoutDuplicateRequest(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFriendHandlers(se, app)
	})

	requester, requesterToken := createAuthUser(t, server.app, false, false)
	target, _ := createAuthUser(t, server.app, false, false)
	target.Set("name", "Target Friend")
	target.Set("friendCode", "FRND1234")
	if err := server.app.Save(target); err != nil {
		t.Fatalf("failed to update target user: %v", err)
	}

	headers := map[string]string{"Idempotency-Key": "friend-invite-response-loss-1"}
	response := performJSONRequestWithHeaders(
		t,
		server.mux,
		http.MethodPost,
		"/api/friends/invite",
		requesterToken,
		`{"code":" frnd1234 "}`,
		headers,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	replayResponse := performJSONRequestWithHeaders(
		t,
		server.mux,
		http.MethodPost,
		"/api/friends/invite",
		requesterToken,
		`{"code":" frnd1234 "}`,
		headers,
	)
	if replayResponse.Code != http.StatusOK {
		t.Fatalf("expected replay to return 200, got %d: %s", replayResponse.Code, replayResponse.Body.String())
	}

	payload := parseJSONMap(t, response.Body.Bytes())
	if payload["userId"] != target.Id {
		t.Fatalf("expected invited user id %s, got %#v", target.Id, payload["userId"])
	}
	if payload["displayName"] != "Target Friend" {
		t.Fatalf("expected displayName Target Friend, got %#v", payload["displayName"])
	}
	if payload["status"] != "pending_sent" {
		t.Fatalf("expected pending_sent status, got %#v", payload["status"])
	}

	friendship, err := server.app.FindFirstRecordByFilter(
		"friendships",
		"((user = {:leftUser} && friend = {:rightUser}) || (user = {:rightUser} && friend = {:leftUser}))",
		map[string]any{
			"leftUser":  requester.Id,
			"rightUser": target.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load created friendship: %v", err)
	}

	if friendship.GetString("user") != requester.Id {
		t.Fatalf("expected requester to be sender, got %q", friendship.GetString("user"))
	}
	if friendship.GetString("friend") != target.Id {
		t.Fatalf("expected target to be receiver, got %q", friendship.GetString("friend"))
	}
	if friendship.GetString("status") != "pending" {
		t.Fatalf("expected pending friendship, got %q", friendship.GetString("status"))
	}
	if count := countRecordsByFilter(
		t,
		server.app,
		"friendships",
		"user = {:userId} && friend = {:friendId}",
		map[string]any{"userId": requester.Id, "friendId": target.Id},
	); count != 1 {
		t.Fatalf("expected exactly 1 friend request after replay, got %d", count)
	}
}

func TestInviteFriendEndpointRejectsSelfInviteCode(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFriendHandlers(se, app)
	})

	requester, requesterToken := createAuthUser(t, server.app, false, false)
	requester.Set("friendCode", "SELF1234")
	if err := server.app.Save(requester); err != nil {
		t.Fatalf("failed to update requester friend code: %v", err)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/friends/invite",
		requesterToken,
		`{"code":"SELF1234"}`,
	)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}

	payload := parseJSONMap(t, response.Body.Bytes())
	if payload["message"] != "Cannot add yourself as a friend." {
		t.Fatalf("expected self-invite error, got %#v", payload["message"])
	}
}

func TestInviteFriendEndpointRejectsDuplicateFriendshipPair(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFriendHandlers(se, app)
	})

	requester, requesterToken := createAuthUser(t, server.app, false, false)
	target, _ := createAuthUser(t, server.app, false, false)
	target.Set("friendCode", "DUPL1234")
	if err := server.app.Save(target); err != nil {
		t.Fatalf("failed to update target friend code: %v", err)
	}

	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   requester.Id,
		"friend": target.Id,
		"status": "pending",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/friends/invite",
		requesterToken,
		fmt.Sprintf(`{"code":"%s"}`, "DUPL1234"),
	)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}

	payload := parseJSONMap(t, response.Body.Bytes())
	if payload["message"] != "Friend request already exists." {
		t.Fatalf("expected duplicate error, got %#v", payload["message"])
	}

	rows, err := server.app.FindRecordsByFilter(
		"friendships",
		"((user = {:leftUser} && friend = {:rightUser}) || (user = {:rightUser} && friend = {:leftUser}))",
		"",
		0,
		0,
		map[string]any{
			"leftUser":  requester.Id,
			"rightUser": target.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to list friendship rows: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected duplicate invite attempt to keep 1 row, found %d", len(rows))
	}
}
