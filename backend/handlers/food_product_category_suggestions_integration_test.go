package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"myapp/handlers"
)

func TestFoodProductCategorySuggestionsEndpointReturnsDedupedUserScopedSuggestions(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Category Cafe",
		"location":   "San Francisco, CA",
		"visibility": "public",
	})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantIDOrFail(restaurant),
		"user":       user.Id,
		"visitDate":  "2026-04-09 08:00:00.000Z",
		"visibility": "private",
	})

	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":         user.Id,
		"name":         "Sparkling Water",
		"rating":       4,
		"visibility":   "private",
		"itemCategory": " beverage ",
		"itemDate":     "2026-04-10 09:00:00.000Z",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":         user.Id,
		"name":         "Green Tea",
		"rating":       5,
		"visibility":   "private",
		"itemCategory": "Beverage",
		"itemDate":     "2026-04-15 09:00:00.000Z",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":         user.Id,
		"name":         "Farmer Market Fruit",
		"rating":       4,
		"visibility":   "private",
		"itemCategory": "Produce",
		"itemDate":     "2026-04-18 09:00:00.000Z",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":         user.Id,
		"name":         "Restaurant Gift Card",
		"rating":       3,
		"visibility":   "private",
		"itemCategory": "restaurant",
		"itemDate":     "2026-04-19 09:00:00.000Z",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":        visit.Id,
		"user":         user.Id,
		"name":         "House Special",
		"rating":       4,
		"itemCategory": "Beverage",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":         otherUser.Id,
		"name":         "Other User Tea",
		"rating":       5,
		"visibility":   "private",
		"itemCategory": "Beverage",
		"itemDate":     "2026-04-20 09:00:00.000Z",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/food-products/category-suggestions?query=Beverage&limit=8",
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		Items []struct {
			Label           string `json:"label"`
			NormalizedLabel string `json:"normalizedLabel"`
			UseCount        int    `json:"useCount"`
			LastUsedAt      string `json:"lastUsedAt"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode category suggestions payload: %v; body=%s", err, response.Body.String())
	}

	if len(payload.Items) != 1 {
		t.Fatalf("expected exactly one filtered suggestion, got %#v", payload.Items)
	}

	item := payload.Items[0]
	if item.Label != "Beverage" {
		t.Fatalf("expected latest representative label %q, got %#v", "Beverage", item.Label)
	}
	if item.NormalizedLabel != "beverage" {
		t.Fatalf("expected normalized label %q, got %#v", "beverage", item.NormalizedLabel)
	}
	if item.UseCount != 2 {
		t.Fatalf("expected beverage useCount 2, got %#v", item.UseCount)
	}
	if item.LastUsedAt != "2026-04-15 09:00:00.000Z" {
		t.Fatalf("expected lastUsedAt for latest owner food product, got %#v", item.LastUsedAt)
	}
}

func TestFoodProductCategorySuggestionsEndpointSupportsLimit(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)

	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":         user.Id,
		"name":         "Iced Tea",
		"rating":       4,
		"visibility":   "private",
		"itemCategory": "Beverage",
		"itemDate":     "2026-04-18 09:00:00.000Z",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":         user.Id,
		"name":         "Blueberries",
		"rating":       5,
		"visibility":   "private",
		"itemCategory": "Produce",
		"itemDate":     "2026-04-19 09:00:00.000Z",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/food-products/category-suggestions?limit=1",
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		Items []struct {
			Label string `json:"label"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode limited category suggestions payload: %v; body=%s", err, response.Body.String())
	}

	if len(payload.Items) != 1 {
		t.Fatalf("expected exactly one limited suggestion, got %#v", payload.Items)
	}
	if payload.Items[0].Label != "Produce" {
		t.Fatalf("expected newest category %q when limit=1, got %#v", "Produce", payload.Items[0].Label)
	}
}

func TestFoodProductCategorySuggestionsEndpointRequiresAuth(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/food-products/category-suggestions?query=Beverage&limit=8",
		"",
		"",
	)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %d: %s", response.Code, response.Body.String())
	}
}
