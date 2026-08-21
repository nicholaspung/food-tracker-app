package migrations

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/testutil"
)

func TestRequireAuthenticatedCatalogReadsPreservesVisibilityAccess(t *testing.T) {
	app := testutil.NewTestApp(t)
	owner := createFoodItemsMigrationTestUser(t, app, "catalog-owner@example.com")
	ownerToFriend := createFoodItemsMigrationTestUser(t, app, "catalog-owner-to-friend@example.com")
	friendToOwner := createFoodItemsMigrationTestUser(t, app, "catalog-friend-to-owner@example.com")
	stranger := createFoodItemsMigrationTestUser(t, app, "catalog-stranger@example.com")
	createFoodItemAccessTestFriendship(t, app, owner.Id, ownerToFriend.Id, "accepted")
	createFoodItemAccessTestFriendship(t, app, friendToOwner.Id, owner.Id, "accepted")

	restaurants := map[string]*core.Record{
		"public": createCatalogReadTestRecord(t, app, "restaurants", map[string]any{
			"name": "Public Catalog Restaurant", "location": "Los Angeles", "createdBy": owner.Id, "visibility": "public",
		}),
		"friends": createCatalogReadTestRecord(t, app, "restaurants", map[string]any{
			"name": "Friends Catalog Restaurant", "location": "Los Angeles", "createdBy": owner.Id, "visibility": "friends",
		}),
		"private": createCatalogReadTestRecord(t, app, "restaurants", map[string]any{
			"name": "Private Catalog Restaurant", "location": "Los Angeles", "createdBy": owner.Id, "visibility": "private",
		}),
	}
	menuItems := map[string]*core.Record{
		"public": createCatalogReadTestRecord(t, app, "menu_items", map[string]any{
			"name": "Public Catalog Item", "restaurant": restaurants["public"].Id, "createdBy": owner.Id, "visibility": "public",
		}),
		"friends": createCatalogReadTestRecord(t, app, "menu_items", map[string]any{
			"name": "Friends Catalog Item", "restaurant": restaurants["friends"].Id, "createdBy": owner.Id, "visibility": "friends",
		}),
		"private": createCatalogReadTestRecord(t, app, "menu_items", map[string]any{
			"name": "Private Catalog Item", "restaurant": restaurants["private"].Id, "createdBy": owner.Id, "visibility": "private",
		}),
	}

	if err := setCatalogReadRules(app, catalogVisibilityReadRule); err != nil {
		t.Fatalf("failed to install vulnerable catalog read rules: %v", err)
	}
	mux := createLegacyVisitAccessTestRouter(t, app)
	for collectionName, records := range map[string]map[string]*core.Record{
		"restaurants": restaurants,
		"menu_items":  menuItems,
	} {
		assertCatalogViewAllowed(t, mux, collectionName, records["public"].Id, "", "anonymous legacy public")
	}

	menuImageCollection, err := app.FindCollectionByNameOrId("menu_images")
	if err != nil {
		t.Fatalf("failed to resolve menu_images collection: %v", err)
	}
	originalMenuImageListRule := ruleValue(menuImageCollection.ListRule)
	originalMenuImageViewRule := ruleValue(menuImageCollection.ViewRule)

	if err := setCatalogReadRules(app, authenticatedCatalogVisibilityReadRule); err != nil {
		t.Fatalf("failed to require authenticated catalog reads: %v", err)
	}

	ownerToken := legacyVisitAccessTestToken(t, owner)
	ownerToFriendToken := legacyVisitAccessTestToken(t, ownerToFriend)
	friendToOwnerToken := legacyVisitAccessTestToken(t, friendToOwner)
	strangerToken := legacyVisitAccessTestToken(t, stranger)
	for collectionName, records := range map[string]map[string]*core.Record{
		"restaurants": restaurants,
		"menu_items":  menuItems,
	} {
		t.Run(collectionName, func(t *testing.T) {
			assertCatalogListDenied(t, mux, collectionName, records["public"].Id, "", "anonymous public")
			assertCatalogViewDenied(t, mux, collectionName, records["public"].Id, "", "anonymous public")

			assertCatalogListAllowed(t, mux, collectionName, records["public"].Id, strangerToken, "authenticated public")
			assertCatalogViewAllowed(t, mux, collectionName, records["public"].Id, strangerToken, "authenticated public")
			assertCatalogListAllowed(t, mux, collectionName, records["private"].Id, ownerToken, "owner private")
			assertCatalogViewAllowed(t, mux, collectionName, records["private"].Id, ownerToken, "owner private")
			assertCatalogListAllowed(t, mux, collectionName, records["friends"].Id, ownerToFriendToken, "owner-to-friend accepted friend")
			assertCatalogViewAllowed(t, mux, collectionName, records["friends"].Id, ownerToFriendToken, "owner-to-friend accepted friend")
			assertCatalogListAllowed(t, mux, collectionName, records["friends"].Id, friendToOwnerToken, "friend-to-owner accepted friend")
			assertCatalogViewAllowed(t, mux, collectionName, records["friends"].Id, friendToOwnerToken, "friend-to-owner accepted friend")
			assertCatalogListDenied(t, mux, collectionName, records["friends"].Id, strangerToken, "nonfriend friends-only")
			assertCatalogViewDenied(t, mux, collectionName, records["friends"].Id, strangerToken, "nonfriend friends-only")
			assertCatalogListDenied(t, mux, collectionName, records["private"].Id, ownerToFriendToken, "friend private")
			assertCatalogViewDenied(t, mux, collectionName, records["private"].Id, ownerToFriendToken, "friend private")
		})
	}

	reloadedMenuImages, err := app.FindCollectionByNameOrId("menu_images")
	if err != nil {
		t.Fatalf("failed to reload menu_images collection: %v", err)
	}
	if ruleValue(reloadedMenuImages.ListRule) != originalMenuImageListRule ||
		ruleValue(reloadedMenuImages.ViewRule) != originalMenuImageViewRule {
		t.Fatalf("menu image authorization changed: list=%v view=%v", reloadedMenuImages.ListRule, reloadedMenuImages.ViewRule)
	}
}

func createCatalogReadTestRecord(t *testing.T, app core.App, collectionName string, values map[string]any) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		t.Fatalf("failed to resolve %s collection: %v", collectionName, err)
	}
	record := core.NewRecord(collection)
	for field, value := range values {
		record.Set(field, value)
	}
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to save %s record: %v", collectionName, err)
	}
	return record
}

func assertCatalogListAllowed(t *testing.T, mux http.Handler, collectionName string, recordID string, token string, actor string) {
	t.Helper()
	response := performCatalogReadTestList(t, mux, collectionName, recordID, token)
	if response.Code != http.StatusOK {
		t.Fatalf("expected %s %s list 200, got %d: %s", actor, collectionName, response.Code, response.Body.String())
	}
	var payload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode %s list response: %v", collectionName, err)
	}
	if len(payload.Items) != 1 || payload.Items[0].ID != recordID {
		t.Fatalf("expected %s to list %s %s, got %#v", actor, collectionName, recordID, payload.Items)
	}
}

func assertCatalogListDenied(t *testing.T, mux http.Handler, collectionName string, recordID string, token string, actor string) {
	t.Helper()
	response := performCatalogReadTestList(t, mux, collectionName, recordID, token)
	if response.Code != http.StatusOK {
		t.Fatalf("expected denied %s %s list to return an empty 200 response, got %d: %s", actor, collectionName, response.Code, response.Body.String())
	}
	var payload struct {
		Items []json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode denied %s list response: %v", collectionName, err)
	}
	if len(payload.Items) != 0 {
		t.Fatalf("expected %s to list no %s records, got %s", actor, collectionName, response.Body.String())
	}
}

func assertCatalogViewAllowed(t *testing.T, mux http.Handler, collectionName string, recordID string, token string, actor string) {
	t.Helper()
	response := performCatalogReadTestView(t, mux, collectionName, recordID, token)
	if response.Code != http.StatusOK {
		t.Fatalf("expected %s %s view 200, got %d: %s", actor, collectionName, response.Code, response.Body.String())
	}
}

func assertCatalogViewDenied(t *testing.T, mux http.Handler, collectionName string, recordID string, token string, actor string) {
	t.Helper()
	response := performCatalogReadTestView(t, mux, collectionName, recordID, token)
	if response.Code == http.StatusOK {
		t.Fatalf("expected %s %s view to be denied, got 200: %s", actor, collectionName, response.Body.String())
	}
}

func performCatalogReadTestList(t *testing.T, mux http.Handler, collectionName string, recordID string, token string) *httptest.ResponseRecorder {
	t.Helper()
	filter := url.QueryEscape(fmt.Sprintf("id = '%s'", recordID))
	request := httptest.NewRequest(http.MethodGet, "/api/collections/"+collectionName+"/records?filter="+filter, nil)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}

func performCatalogReadTestView(t *testing.T, mux http.Handler, collectionName string, recordID string, token string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/api/collections/"+collectionName+"/records/"+recordID, nil)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}

func ruleValue(rule *string) string {
	if rule == nil {
		return ""
	}
	return *rule
}
