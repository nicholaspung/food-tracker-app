package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

type menuReviewRequestResponsePayload struct {
	ID           string `json:"id"`
	RestaurantID string `json:"restaurantId"`
	Status       string `json:"status"`
	Reason       string `json:"reason"`
	Deduped      bool   `json:"deduped"`
}

type menuItemsFromScanResponsePayload struct {
	CreatedItems  []menuItemWorkflowPayload `json:"createdItems"`
	ExistingItems []menuItemWorkflowPayload `json:"existingItems"`
}

type menuItemWorkflowPayload struct {
	ID         string `json:"id"`
	Restaurant string `json:"restaurant"`
	Name       string `json:"name"`
	CreatedBy  string `json:"createdBy"`
	Visibility string `json:"visibility"`
	IsFromOCR  bool   `json:"isFromOCR"`
}

func TestMenuReviewRequestEndpointCreatesPendingRequest(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterMenuWorkflowHandlers)
	user, token := createAuthUser(t, server.app, false, true)
	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Review Cafe")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/menu-review-requests",
		token,
		`{"restaurantId":"`+restaurant.Id+`"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload menuReviewRequestResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse menu review response: %v", err)
	}

	if payload.RestaurantID != restaurant.Id {
		t.Fatalf("expected restaurantId=%s, got %s", restaurant.Id, payload.RestaurantID)
	}
	if payload.Status != "pending" {
		t.Fatalf("expected status=pending, got %s", payload.Status)
	}
	if payload.Deduped {
		t.Fatalf("expected deduped=false on first create")
	}
	if payload.Reason != "User reported incorrect menu items" {
		t.Fatalf("unexpected default reason: %q", payload.Reason)
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"menu_review_requests",
		"restaurant = {:restaurantId} && requestedBy = {:userId}",
		map[string]any{"restaurantId": restaurant.Id, "userId": user.Id},
	); count != 1 {
		t.Fatalf("expected 1 menu review request, got %d", count)
	}
}

func TestMenuReviewRequestEndpointDedupesExistingPendingRequest(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterMenuWorkflowHandlers)
	owner, _ := createAuthUser(t, server.app, false, true)
	requester, token := createAuthUser(t, server.app, false, true)
	restaurant := seedRestaurantRecord(t, server.app, owner.Id, "Shared Menu")
	existing := seedMenuReviewRequestRecord(t, server.app, restaurant.Id, owner.Id, "Already pending")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/menu-review-requests",
		token,
		`{"restaurantId":"`+restaurant.Id+`","reason":"Something changed"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload menuReviewRequestResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse menu review response: %v", err)
	}

	if payload.ID != existing.Id {
		t.Fatalf("expected existing review request id %s, got %s", existing.Id, payload.ID)
	}
	if !payload.Deduped {
		t.Fatalf("expected deduped=true when a pending request already exists")
	}
	if count := countRecordsByFilter(
		t,
		server.app,
		"menu_review_requests",
		"restaurant = {:restaurantId} && status = 'pending'",
		map[string]any{"restaurantId": restaurant.Id},
	); count != 1 {
		t.Fatalf("expected 1 pending menu review request, got %d", count)
	}
	if count := countRecordsByFilter(
		t,
		server.app,
		"menu_review_requests",
		"requestedBy = {:userId}",
		map[string]any{"userId": requester.Id},
	); count != 0 {
		t.Fatalf("expected no new requester-owned review request, got %d", count)
	}
}

func TestMenuItemsFromScanEndpointCreatesOnlyMissingItems(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterMenuWorkflowHandlers)
	user, token := createAuthUser(t, server.app, false, true)
	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Scan Bistro")
	existing := seedMenuItemRecord(t, server.app, restaurant.Id, user.Id, "Pho", "friends", true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/menu-items/from-scan",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"itemNames":["Pho","  banh mi  ","pho","Banh Mi"]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload menuItemsFromScanResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse menu items from scan response: %v", err)
	}

	if len(payload.ExistingItems) != 1 {
		t.Fatalf("expected 1 existing item, got %d", len(payload.ExistingItems))
	}
	if payload.ExistingItems[0].ID != existing.Id {
		t.Fatalf("expected existing item id %s, got %s", existing.Id, payload.ExistingItems[0].ID)
	}
	if len(payload.CreatedItems) != 1 {
		t.Fatalf("expected 1 created item, got %d", len(payload.CreatedItems))
	}
	if payload.CreatedItems[0].Name != "banh mi" {
		t.Fatalf("expected trimmed created item name, got %q", payload.CreatedItems[0].Name)
	}
	if payload.CreatedItems[0].CreatedBy != user.Id {
		t.Fatalf("expected createdBy=%s, got %s", user.Id, payload.CreatedItems[0].CreatedBy)
	}
	if payload.CreatedItems[0].Visibility != "friends" {
		t.Fatalf("expected visibility=friends, got %s", payload.CreatedItems[0].Visibility)
	}
	if !payload.CreatedItems[0].IsFromOCR {
		t.Fatalf("expected created scan item to be marked as OCR")
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"menu_items",
		"restaurant = {:restaurantId}",
		map[string]any{"restaurantId": restaurant.Id},
	); count != 2 {
		t.Fatalf("expected 2 menu items after deduped create, got %d", count)
	}
}

func TestMenuItemsFromScanEndpointBuildsFallbackItems(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterMenuWorkflowHandlers)
	user, token := createAuthUser(t, server.app, false, true)
	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Fallback Diner")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/menu-items/from-scan",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"itemNames":[],
			"fallbackLabel":"brunch-photo.jpg"
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload menuItemsFromScanResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse menu items from scan response: %v", err)
	}

	if len(payload.CreatedItems) != 3 {
		t.Fatalf("expected 3 fallback items, got %d", len(payload.CreatedItems))
	}
	expectedNames := []string{"brunch-photo #1", "brunch-photo #2", "brunch-photo #3"}
	for index, expectedName := range expectedNames {
		if payload.CreatedItems[index].Name != expectedName {
			t.Fatalf("expected fallback item %d to be %q, got %q", index, expectedName, payload.CreatedItems[index].Name)
		}
	}
}

func seedMenuReviewRequestRecord(
	t *testing.T,
	app core.App,
	restaurantID string,
	requestedBy string,
	reason string,
) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("menu_review_requests")
	if err != nil {
		t.Fatalf("failed to resolve menu_review_requests collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("restaurant", restaurantID)
	record.Set("requestedBy", requestedBy)
	record.Set("reason", reason)
	record.Set("status", "pending")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create menu review request: %v", err)
	}

	return record
}

func seedMenuItemRecord(
	t *testing.T,
	app core.App,
	restaurantID string,
	createdBy string,
	name string,
	visibility string,
	isFromOCR bool,
) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("menu_items")
	if err != nil {
		t.Fatalf("failed to resolve menu_items collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("restaurant", restaurantID)
	record.Set("createdBy", createdBy)
	record.Set("name", name)
	record.Set("visibility", visibility)
	record.Set("isFromOCR", isFromOCR)
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create menu item: %v", err)
	}

	return record
}
