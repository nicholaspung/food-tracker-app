package hooks

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/testutil"
)

func TestListItemRawUpdateCannotChangeParentList(t *testing.T) {
	app := testutil.NewTestApp(t)
	RegisterRecordOwnershipHooks(app)

	attacker, attackerToken := createListItemOwnershipTestUser(t, app)
	victim, _ := createListItemOwnershipTestUser(t, app)
	sourceList := createListItemOwnershipTestRecord(t, app, "restaurant_lists", map[string]any{
		"name":       "Attacker list",
		"user":       attacker.Id,
		"visibility": "private",
	})
	targetList := createListItemOwnershipTestRecord(t, app, "restaurant_lists", map[string]any{
		"name":       "Victim list",
		"user":       victim.Id,
		"visibility": "friends",
	})
	restaurant := createListItemOwnershipTestRecord(t, app, "restaurants", map[string]any{
		"name":       "List item restaurant",
		"location":   "San Francisco, CA",
		"visibility": "private",
		"createdBy":  attacker.Id,
	})
	item := createListItemOwnershipTestRecord(t, app, "list_items", map[string]any{
		"list":       sourceList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    attacker.Id,
		"position":   1,
		"note":       "original note",
	})

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("failed to create API router: %v", err)
	}
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatalf("failed to build API router: %v", err)
	}

	moveResponse := performListItemOwnershipPatch(
		t,
		mux,
		attackerToken,
		item.Id,
		fmt.Sprintf(`{"list":%q,"note":"injected"}`, targetList.Id),
	)
	if moveResponse.Code != http.StatusForbidden {
		t.Fatalf("expected cross-list update 403, got %d: %s", moveResponse.Code, moveResponse.Body.String())
	}

	reloaded, err := app.FindRecordById("list_items", item.Id)
	if err != nil {
		t.Fatalf("failed to reload rejected list item: %v", err)
	}
	if reloaded.GetString("list") != sourceList.Id || reloaded.GetString("note") != "original note" {
		t.Fatalf("rejected update changed list item: list=%q note=%q", reloaded.GetString("list"), reloaded.GetString("note"))
	}

	noteResponse := performListItemOwnershipPatch(t, mux, attackerToken, item.Id, `{"note":"allowed edit"}`)
	if noteResponse.Code != http.StatusOK {
		t.Fatalf("expected same-list update 200, got %d: %s", noteResponse.Code, noteResponse.Body.String())
	}
	reloaded, err = app.FindRecordById("list_items", item.Id)
	if err != nil {
		t.Fatalf("failed to reload allowed list item update: %v", err)
	}
	if reloaded.GetString("list") != sourceList.Id || reloaded.GetString("note") != "allowed edit" {
		t.Fatalf("same-list update was not preserved: list=%q note=%q", reloaded.GetString("list"), reloaded.GetString("note"))
	}
}

func createListItemOwnershipTestUser(t *testing.T, app core.App) (*core.Record, string) {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}
	record := core.NewRecord(collection)
	record.Set("email", fmt.Sprintf("list-item-security-%d@example.com", time.Now().UnixNano()))
	record.Set("name", "List Item Security User")
	record.Set("defaultRestaurantVisibility", "friends")
	record.Set("defaultVisitVisibility", "friends")
	record.SetVerified(true)
	record.SetPassword("password123")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to save test user: %v", err)
	}
	token, err := record.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create auth token: %v", err)
	}
	return record, token
}

func createListItemOwnershipTestRecord(t *testing.T, app core.App, collectionName string, values map[string]any) *core.Record {
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

func performListItemOwnershipPatch(t *testing.T, mux http.Handler, token string, itemID string, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/collections/list_items/records/"+itemID,
		bytes.NewBufferString(body),
	)
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}
