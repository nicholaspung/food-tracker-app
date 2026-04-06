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

func TestBillsSummaryEndpoint(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	creatorParticipant, _ := createAuthUser(t, server.app, false, false)
	settledParticipant, _ := createAuthUser(t, server.app, false, false)
	otherCreator, _ := createAuthUser(t, server.app, false, false)
	unrelatedUser, _ := createAuthUser(t, server.app, false, false)

	createdBill := createCollectionRecord(t, server.app, "bills", map[string]any{
		"creator_user":      user.Id,
		"bill_name":         "Team Dinner",
		"total_amount":      50.0,
		"tax":               4.0,
		"tip":               8.0,
		"fees":              0.0,
		"split_mode":        "even",
		"extras_split_mode": "proportional",
		"status":            "active",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             createdBill.Id,
		"user":             user.Id,
		"participant_name": "You",
		"amount_owed":      12.0,
		"paid_status":      "pending",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             createdBill.Id,
		"user":             creatorParticipant.Id,
		"participant_name": "Alex",
		"amount_owed":      18.0,
		"paid_status":      "pending",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             createdBill.Id,
		"user":             settledParticipant.Id,
		"participant_name": "Taylor",
		"amount_owed":      20.0,
		"paid_status":      "paid",
	})

	participantBill := createCollectionRecord(t, server.app, "bills", map[string]any{
		"creator_user":      otherCreator.Id,
		"bill_name":         "Cab Ride",
		"total_amount":      25.0,
		"tax":               0.0,
		"tip":               0.0,
		"fees":              0.0,
		"split_mode":        "even",
		"extras_split_mode": "equal",
		"status":            "active",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             participantBill.Id,
		"user":             otherCreator.Id,
		"participant_name": "Morgan",
		"amount_owed":      16.0,
		"paid_status":      "paid",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             participantBill.Id,
		"user":             user.Id,
		"participant_name": "You",
		"amount_owed":      9.0,
		"paid_status":      "pending",
	})

	settledBill := createCollectionRecord(t, server.app, "bills", map[string]any{
		"creator_user":      user.Id,
		"bill_name":         "Lunch",
		"total_amount":      28.0,
		"tax":               2.0,
		"tip":               4.0,
		"fees":              0.0,
		"split_mode":        "even",
		"extras_split_mode": "equal",
		"status":            "settled",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             settledBill.Id,
		"user":             user.Id,
		"participant_name": "You",
		"amount_owed":      14.0,
		"paid_status":      "paid",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             settledBill.Id,
		"user":             creatorParticipant.Id,
		"participant_name": "Alex",
		"amount_owed":      14.0,
		"paid_status":      "paid",
	})

	unrelatedBill := createCollectionRecord(t, server.app, "bills", map[string]any{
		"creator_user":      unrelatedUser.Id,
		"bill_name":         "Private Bill",
		"total_amount":      10.0,
		"tax":               0.0,
		"tip":               0.0,
		"fees":              0.0,
		"split_mode":        "even",
		"extras_split_mode": "equal",
		"status":            "active",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             unrelatedBill.Id,
		"user":             unrelatedUser.Id,
		"participant_name": "Unaffiliated",
		"amount_owed":      10.0,
		"paid_status":      "pending",
	})

	response := performJSONRequest(t, server.mux, http.MethodGet, "/api/bills/summary", token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload []struct {
		ID                           string  `json:"id"`
		Title                        string  `json:"title"`
		Status                       string  `json:"status"`
		ParticipantCount             int     `json:"participantCount"`
		PendingOtherParticipantCount int     `json:"pendingOtherParticipantCount"`
		YouOwe                       float64 `json:"youOwe"`
		YouAreOwed                   float64 `json:"youAreOwed"`
		IsCreator                    bool    `json:"isCreator"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse response JSON: %v; body=%s", err, response.Body.String())
	}

	if len(payload) != 3 {
		t.Fatalf("expected 3 bill summaries, got %d: %#v", len(payload), payload)
	}

	summaryByID := make(map[string]struct {
		title                        string
		status                       string
		participantCount             int
		pendingOtherParticipantCount int
		youOwe                       float64
		youAreOwed                   float64
		isCreator                    bool
	}, len(payload))
	for _, item := range payload {
		summaryByID[item.ID] = struct {
			title                        string
			status                       string
			participantCount             int
			pendingOtherParticipantCount int
			youOwe                       float64
			youAreOwed                   float64
			isCreator                    bool
		}{
			title:                        item.Title,
			status:                       item.Status,
			participantCount:             item.ParticipantCount,
			pendingOtherParticipantCount: item.PendingOtherParticipantCount,
			youOwe:                       item.YouOwe,
			youAreOwed:                   item.YouAreOwed,
			isCreator:                    item.IsCreator,
		}
	}

	if _, exists := summaryByID[unrelatedBill.Id]; exists {
		t.Fatalf("unexpected unrelated bill in summary: %#v", summaryByID[unrelatedBill.Id])
	}

	if summary := summaryByID[createdBill.Id]; summary.title != "Team Dinner" ||
		summary.status != "open" ||
		summary.participantCount != 3 ||
		summary.pendingOtherParticipantCount != 1 ||
		summary.youOwe != 12.0 ||
		summary.youAreOwed != 18.0 ||
		!summary.isCreator {
		t.Fatalf("unexpected created bill summary: %#v", summary)
	}

	if summary := summaryByID[participantBill.Id]; summary.title != "Cab Ride" ||
		summary.status != "open" ||
		summary.participantCount != 2 ||
		summary.pendingOtherParticipantCount != 0 ||
		summary.youOwe != 9.0 ||
		summary.youAreOwed != 0.0 ||
		summary.isCreator {
		t.Fatalf("unexpected participant bill summary: %#v", summary)
	}

	if summary := summaryByID[settledBill.Id]; summary.title != "Lunch" ||
		summary.status != "settled" ||
		summary.participantCount != 2 ||
		summary.pendingOtherParticipantCount != 0 ||
		summary.youOwe != 0.0 ||
		summary.youAreOwed != 0.0 ||
		!summary.isCreator {
		t.Fatalf("unexpected settled bill summary: %#v", summary)
	}
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
