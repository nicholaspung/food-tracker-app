package migrations

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/testutil"
)

func TestFoodItemRuleRejectsLegacyPublicVisitReadsAndPreservesSupportedAccess(t *testing.T) {
	app := testutil.NewTestApp(t)

	owner := createFoodItemsMigrationTestUser(t, app, "legacy-food-owner@example.com")
	friend := createFoodItemsMigrationTestUser(t, app, "legacy-food-friend@example.com")
	pendingUser := createFoodItemsMigrationTestUser(t, app, "legacy-food-pending@example.com")
	blockedUser := createFoodItemsMigrationTestUser(t, app, "legacy-food-blocked@example.com")
	stranger := createFoodItemsMigrationTestUser(t, app, "legacy-food-stranger@example.com")
	visit := createFoodItemsMigrationTestVisit(t, app, owner.Id)
	createFoodItemAccessTestFriendship(t, app, owner.Id, friend.Id, "accepted")
	createFoodItemAccessTestFriendship(t, app, owner.Id, pendingUser.Id, "pending")
	createFoodItemAccessTestFriendship(t, app, owner.Id, blockedUser.Id, "blocked")
	foodItem := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name":     "Legacy Visit Dish",
		"rating":   4,
		"user":     owner.Id,
		"visit":    visit.Id,
		"itemType": "visit-item",
	})
	friendsProduct := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name":       "Friends Pantry Item",
		"rating":     4,
		"user":       owner.Id,
		"itemType":   "food-product",
		"visibility": "friends",
	})
	privateProduct := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name":       "Private Pantry Item",
		"rating":     4,
		"user":       owner.Id,
		"itemType":   "food-product",
		"visibility": "private",
	})
	if _, err := app.DB().NewQuery(`
		UPDATE visits
		SET visibility = 'public'
		WHERE id = {:visitId}
	`).Bind(map[string]any{"visitId": visit.Id}).Execute(); err != nil {
		t.Fatalf("failed to seed legacy public parent visit: %v", err)
	}
	if err := setFoodItemReadRule(app, foodItemsNoLegacyPublicVisitReadRule); err != nil {
		t.Fatalf("failed to install food item read rule: %v", err)
	}

	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		t.Fatalf("failed to resolve food_items collection: %v", err)
	}
	if collection.ListRule == nil || collection.ViewRule == nil ||
		strings.Contains(*collection.ListRule, "visit.visibility = 'public'") ||
		strings.Contains(*collection.ViewRule, "visit.visibility = 'public'") {
		t.Fatalf("legacy public visit branch remains: list=%v view=%v", collection.ListRule, collection.ViewRule)
	}

	mux := createLegacyVisitAccessTestRouter(t, app)
	assertLegacyFoodItemViewDenied(t, mux, "", foodItem.Id, "anonymous")
	assertLegacyFoodItemViewDenied(t, mux, legacyVisitAccessTestToken(t, stranger), foodItem.Id, "stranger")
	assertLegacyFoodItemViewAllowed(t, mux, legacyVisitAccessTestToken(t, owner), foodItem.Id, "owner")

	if _, err := app.DB().NewQuery(`
		UPDATE visits
		SET visibility = 'friends'
		WHERE id = {:visitId}
	`).Bind(map[string]any{"visitId": visit.Id}).Execute(); err != nil {
		t.Fatalf("failed to restore supported parent visibility: %v", err)
	}
	assertLegacyFoodItemViewAllowed(t, mux, legacyVisitAccessTestToken(t, friend), foodItem.Id, "accepted friend")
	assertLegacyFoodItemViewDenied(t, mux, legacyVisitAccessTestToken(t, pendingUser), foodItem.Id, "pending relationship")
	assertLegacyFoodItemViewDenied(t, mux, legacyVisitAccessTestToken(t, blockedUser), foodItem.Id, "blocked relationship")
	assertLegacyFoodItemViewDenied(t, mux, legacyVisitAccessTestToken(t, stranger), foodItem.Id, "friends-visible stranger")

	assertLegacyFoodItemViewAllowed(t, mux, legacyVisitAccessTestToken(t, owner), friendsProduct.Id, "friends product owner")
	assertLegacyFoodItemViewAllowed(t, mux, legacyVisitAccessTestToken(t, friend), friendsProduct.Id, "friends product accepted friend")
	assertLegacyFoodItemViewDenied(t, mux, legacyVisitAccessTestToken(t, pendingUser), friendsProduct.Id, "friends product pending relationship")
	assertLegacyFoodItemViewDenied(t, mux, legacyVisitAccessTestToken(t, blockedUser), friendsProduct.Id, "friends product blocked relationship")
	assertLegacyFoodItemViewDenied(t, mux, legacyVisitAccessTestToken(t, stranger), friendsProduct.Id, "friends product stranger")
	assertLegacyFoodItemViewAllowed(t, mux, legacyVisitAccessTestToken(t, owner), privateProduct.Id, "private product owner")
	assertLegacyFoodItemViewDenied(t, mux, legacyVisitAccessTestToken(t, friend), privateProduct.Id, "private product friend")
}

func createFoodItemAccessTestFriendship(t *testing.T, app core.App, userID string, friendID string, status string) {
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
		t.Fatalf("failed to save %s friendship: %v", status, err)
	}
}

func assertLegacyFoodItemViewDenied(t *testing.T, mux http.Handler, token string, foodItemID string, actor string) {
	t.Helper()
	response := performLegacyFoodItemView(t, mux, token, foodItemID)
	if response.Code == http.StatusOK {
		t.Fatalf("expected %s food item view to be denied, got 200: %s", actor, response.Body.String())
	}
}

func assertLegacyFoodItemViewAllowed(t *testing.T, mux http.Handler, token string, foodItemID string, actor string) {
	t.Helper()
	response := performLegacyFoodItemView(t, mux, token, foodItemID)
	if response.Code != http.StatusOK {
		t.Fatalf("expected %s food item view 200, got %d: %s", actor, response.Code, response.Body.String())
	}
}

func performLegacyFoodItemView(t *testing.T, mux http.Handler, token string, foodItemID string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/api/collections/food_items/records/"+foodItemID, nil)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}
