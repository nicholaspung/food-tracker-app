package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"myapp/handlers"
	"myapp/lib"
)

func parseAuditMetadata(t *testing.T, value any) map[string]any {
	t.Helper()

	var raw []byte
	switch typed := value.(type) {
	case types.JSONRaw:
		raw = typed
	case []byte:
		raw = typed
	case string:
		raw = []byte(typed)
	default:
		t.Fatalf("expected metadataJson to be JSONRaw, got %#v", value)
	}

	result := map[string]any{}
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatalf("failed to parse metadataJson: %v", err)
	}

	return result
}

func createCollectionRecord(t *testing.T, app core.App, collectionName string, data map[string]any) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		t.Fatalf("failed to resolve %s collection: %v", collectionName, err)
	}

	record := core.NewRecord(collection)
	if collectionName == "food_items" {
		if _, hasItemType := data["itemType"]; !hasItemType {
			if visitID, hasVisit := data["visit"].(string); hasVisit && strings.TrimSpace(visitID) != "" {
				data["itemType"] = "visit-item"
			} else {
				data["itemType"] = "food-product"
			}
		}
	}
	for key, value := range data {
		record.Set(key, value)
	}

	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create %s record: %v", collectionName, err)
	}

	return record
}

func jsonStringSliceContains(values any, expected string) bool {
	items, ok := values.([]any)
	if !ok {
		return false
	}
	for _, item := range items {
		if item == expected {
			return true
		}
	}
	return false
}

func TestAdminUsersSearchReturnsOtherUsers(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)
	otherUser.Set("email", "MixedCaseUser@example.com")
	if err := server.app.Save(otherUser); err != nil {
		t.Fatalf("failed to update other user email: %v", err)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/users?search=mixedcaseuser@example.com",
		adminToken,
		"",
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := response.Body.String()
	if !strings.Contains(body, "MixedCaseUser@example.com") {
		t.Fatalf("expected response to include searched user email, got %s", body)
	}
}

func TestAdminUserLookupFindsOtherUserCaseInsensitive(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	targetUser.Set("email", "AnotherUser@Example.com")
	if err := server.app.Save(targetUser); err != nil {
		t.Fatalf("failed to update target user email: %v", err)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/users/lookup?email=anotheruser@example.com",
		adminToken,
		"",
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := response.Body.String()
	if !strings.Contains(body, targetUser.Id) {
		t.Fatalf("expected response to include target user id, got %s", body)
	}

	auditLogs, err := server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         lib.AuditActionView,
			"collection":     "users",
			"targetRecordId": targetUser.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load audit logs: %v", err)
	}

	if len(auditLogs) != 1 {
		t.Fatalf("expected 1 lookup audit log, got %d", len(auditLogs))
	}

	if auditLogs[0].GetString("summary") != "Viewed user access for AnotherUser@Example.com" {
		t.Fatalf("unexpected audit summary: %s", auditLogs[0].GetString("summary"))
	}

	metadataMap := parseAuditMetadata(t, auditLogs[0].Get("metadataJson"))
	if metadataMap["source"] != "admin_access_controls" {
		t.Fatalf("expected audit source admin_access_controls, got %#v", metadataMap["source"])
	}
}

func TestAdminUsersSearchFindsUserBeyondInitialTwoHundredRows(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	targetUser.Set("email", "older-search-user@example.com")
	targetUser.Set("name", "Older Search User")
	if err := server.app.Save(targetUser); err != nil {
		t.Fatalf("failed to update target user: %v", err)
	}

	for i := 0; i < 210; i++ {
		createAuthUser(t, server.app, false, false)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/users?search=older-search-user@example.com",
		adminToken,
		"",
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := response.Body.String()
	if !strings.Contains(body, targetUser.Id) {
		t.Fatalf("expected response to include target user id, got %s", body)
	}
	if !strings.Contains(body, "older-search-user@example.com") {
		t.Fatalf("expected response to include target user email, got %s", body)
	}
}

func TestAdminUserLookupFindsUserBeyondInitialTwoHundredRows(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	targetUser.Set("email", "OlderLookupUser@Example.com")
	if err := server.app.Save(targetUser); err != nil {
		t.Fatalf("failed to update target user email: %v", err)
	}

	for i := 0; i < 210; i++ {
		createAuthUser(t, server.app, false, false)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/users/lookup?email=olderlookupuser@example.com",
		adminToken,
		"",
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := response.Body.String()
	if !strings.Contains(body, targetUser.Id) {
		t.Fatalf("expected response to include target user id, got %s", body)
	}
}

func TestAdminRestaurantSearchRequiresAdminAndReturnsMatches(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	_, userToken := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":          "Tacos Manuel",
		"location":      "San Diego, CA",
		"placeId":       "usa-place-id",
		"isGooglePlace": true,
		"visibility":    "public",
	})

	forbiddenResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/restaurants?search=tacos",
		userToken,
		"",
	)
	if forbiddenResponse.Code != http.StatusForbidden {
		t.Fatalf("expected non-admin 403, got %d: %s", forbiddenResponse.Code, forbiddenResponse.Body.String())
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/restaurants?search=usa-place-id",
		adminToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())
	items, ok := body["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one restaurant search result, got %#v", body["items"])
	}

	item, ok := items[0].(map[string]any)
	if !ok {
		t.Fatalf("expected restaurant result map, got %#v", items[0])
	}
	if item["id"] != restaurant.Id || item["placeId"] != "usa-place-id" {
		t.Fatalf("expected matched restaurant payload, got %#v", item)
	}
}

func TestAdminCanReassignVisitRestaurantWithAuditLog(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	originalRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Tacos Manuel",
		"location":   "Mexico City, Mexico",
		"visibility": "public",
	})
	correctRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Tacos Manuel",
		"location":   "San Diego, CA",
		"visibility": "public",
	})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": originalRestaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-01T18:00:00Z",
		"visibility": "friends",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/users/"+targetUser.Id+"/visits/"+visit.Id+"/restaurant",
		adminToken,
		`{"restaurantId":"`+correctRestaurant.Id+`","reason":"Correct same-name collision"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	reloadedVisit, err := server.app.FindRecordById("visits", visit.Id)
	if err != nil {
		t.Fatalf("failed to reload visit: %v", err)
	}
	if reloadedVisit.GetString("restaurant") != correctRestaurant.Id {
		t.Fatalf("expected visit restaurant=%s, got %s", correctRestaurant.Id, reloadedVisit.GetString("restaurant"))
	}

	body := parseJSONMap(t, response.Body.Bytes())
	serializedVisit, ok := body["visit"].(map[string]any)
	if !ok {
		t.Fatalf("expected visit response map, got %#v", body["visit"])
	}
	if serializedVisit["restaurant"] != correctRestaurant.Id {
		t.Fatalf("expected repaired visit restaurant id, got %#v", serializedVisit["restaurant"])
	}

	auditLogs, err := server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         core.ModelEventTypeUpdate,
			"collection":     "visits",
			"targetRecordId": visit.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load audit logs: %v", err)
	}
	if len(auditLogs) != 1 {
		t.Fatalf("expected 1 repair audit log, got %d", len(auditLogs))
	}

	metadataMap := parseAuditMetadata(t, auditLogs[0].Get("metadataJson"))
	if metadataMap["source"] != "admin_visit_restaurant_repair" {
		t.Fatalf("expected repair audit source, got %#v", metadataMap["source"])
	}
	if metadataMap["previousRestaurantId"] != originalRestaurant.Id || metadataMap["nextRestaurantId"] != correctRestaurant.Id {
		t.Fatalf("unexpected restaurant ids in audit metadata: %#v", metadataMap)
	}
}

func TestAdminVisitRestaurantRepairMovesMatchingUserCreatedMenuItems(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	originalRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Old Pho",
		"location":   "Old City",
		"visibility": "public",
	})
	correctRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "New Pho",
		"location":   "New City",
		"visibility": "public",
	})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": originalRestaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-01T18:00:00Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":   "Pho",
		"rating": 5,
		"user":   targetUser.Id,
		"visit":  visit.Id,
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":   "Spring Rolls",
		"rating": 4,
		"user":   targetUser.Id,
		"visit":  visit.Id,
	})
	phoMenuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"createdBy":  targetUser.Id,
		"name":       "Pho",
		"restaurant": originalRestaurant.Id,
		"visibility": "friends",
	})
	rollsMenuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"createdBy":  targetUser.Id,
		"name":       "Spring Rolls",
		"restaurant": originalRestaurant.Id,
		"visibility": "friends",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/users/"+targetUser.Id+"/visits/"+visit.Id+"/restaurant",
		adminToken,
		`{"restaurantId":"`+correctRestaurant.Id+`","reason":"Correct restaurant"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	for _, menuItem := range []*core.Record{phoMenuItem, rollsMenuItem} {
		reloaded, err := server.app.FindRecordById("menu_items", menuItem.Id)
		if err != nil {
			t.Fatalf("failed to reload moved menu item: %v", err)
		}
		if reloaded.GetString("restaurant") != correctRestaurant.Id {
			t.Fatalf("expected menu item %s restaurant=%s, got %s", menuItem.Id, correctRestaurant.Id, reloaded.GetString("restaurant"))
		}
	}

	body := parseJSONMap(t, response.Body.Bytes())
	menuItemRepair, ok := body["menuItemRepair"].(map[string]any)
	if !ok {
		t.Fatalf("expected menuItemRepair map, got %#v", body["menuItemRepair"])
	}
	if !jsonStringSliceContains(menuItemRepair["movedMenuItemIds"], phoMenuItem.Id) ||
		!jsonStringSliceContains(menuItemRepair["movedMenuItemIds"], rollsMenuItem.Id) {
		t.Fatalf("expected moved menu item ids in response, got %#v", menuItemRepair)
	}

	auditLogs, err := server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         core.ModelEventTypeUpdate,
			"collection":     "visits",
			"targetRecordId": visit.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load audit logs: %v", err)
	}
	metadataMap := parseAuditMetadata(t, auditLogs[0].Get("metadataJson"))
	if !jsonStringSliceContains(metadataMap["movedMenuItemIds"], phoMenuItem.Id) ||
		!jsonStringSliceContains(metadataMap["movedMenuItemIds"], rollsMenuItem.Id) {
		t.Fatalf("expected moved menu item ids in audit metadata, got %#v", metadataMap)
	}
}

func TestAdminVisitRestaurantRepairDoesNotMoveNonMatchingMenuItems(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	originalRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{"location": "Old City", "name": "Old", "visibility": "public"})
	correctRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{"location": "New City", "name": "New", "visibility": "public"})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": originalRestaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-01T18:00:00Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name": "Pho", "rating": 5, "user": targetUser.Id, "visit": visit.Id,
	})
	unratedMenuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"createdBy": targetUser.Id, "name": "Unrated Item", "restaurant": originalRestaurant.Id, "visibility": "friends",
	})

	response := performJSONRequest(t, server.mux, http.MethodPatch, "/api/admin/users/"+targetUser.Id+"/visits/"+visit.Id+"/restaurant", adminToken, `{"restaurantId":"`+correctRestaurant.Id+`","reason":"Correct restaurant"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	reloaded, err := server.app.FindRecordById("menu_items", unratedMenuItem.Id)
	if err != nil {
		t.Fatalf("failed to reload menu item: %v", err)
	}
	if reloaded.GetString("restaurant") != originalRestaurant.Id {
		t.Fatalf("expected nonmatching menu item to stay on old restaurant, got %s", reloaded.GetString("restaurant"))
	}
}

func TestAdminVisitRestaurantRepairCreatesMissingTargetMenuItemsFromVisitItems(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	originalRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{"location": "Old City", "name": "Old", "visibility": "public"})
	correctRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{"location": "New City", "name": "New", "visibility": "public"})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": originalRestaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-01T18:00:00Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name": "Visit Only Item", "rating": 5, "user": targetUser.Id, "visit": visit.Id,
	})

	response := performJSONRequest(t, server.mux, http.MethodPatch, "/api/admin/users/"+targetUser.Id+"/visits/"+visit.Id+"/restaurant", adminToken, `{"restaurantId":"`+correctRestaurant.Id+`","reason":"Correct restaurant"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	createdItems, err := server.app.FindRecordsByFilter(
		"menu_items",
		"createdBy = {:userId} && restaurant = {:restaurantId} && name = {:name}",
		"",
		10,
		0,
		map[string]any{
			"name":         "Visit Only Item",
			"restaurantId": correctRestaurant.Id,
			"userId":       targetUser.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load created menu items: %v", err)
	}
	if len(createdItems) != 1 {
		t.Fatalf("expected one created menu item on target restaurant, got %d", len(createdItems))
	}

	body := parseJSONMap(t, response.Body.Bytes())
	menuItemRepair := body["menuItemRepair"].(map[string]any)
	if !jsonStringSliceContains(menuItemRepair["createdMenuItemIds"], createdItems[0].Id) {
		t.Fatalf("expected created menu item id in response, got %#v", menuItemRepair)
	}
}

func TestAdminVisitRestaurantRepairDoesNotMoveOtherUsersMenuItems(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)
	originalRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{"location": "Old City", "name": "Old", "visibility": "public"})
	correctRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{"location": "New City", "name": "New", "visibility": "public"})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": originalRestaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-01T18:00:00Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name": "Pho", "rating": 5, "user": targetUser.Id, "visit": visit.Id,
	})
	otherMenuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"createdBy": otherUser.Id, "name": "Pho", "restaurant": originalRestaurant.Id, "visibility": "friends",
	})

	response := performJSONRequest(t, server.mux, http.MethodPatch, "/api/admin/users/"+targetUser.Id+"/visits/"+visit.Id+"/restaurant", adminToken, `{"restaurantId":"`+correctRestaurant.Id+`","reason":"Correct restaurant"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	reloaded, err := server.app.FindRecordById("menu_items", otherMenuItem.Id)
	if err != nil {
		t.Fatalf("failed to reload menu item: %v", err)
	}
	if reloaded.GetString("restaurant") != originalRestaurant.Id {
		t.Fatalf("expected other user's menu item to stay on old restaurant, got %s", reloaded.GetString("restaurant"))
	}
}

func TestAdminVisitRestaurantRepairDeletesOldDuplicateWhenDestinationHasUserCreatedMatch(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	originalRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{"location": "Old City", "name": "Old", "visibility": "public"})
	correctRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{"location": "New City", "name": "New", "visibility": "public"})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": originalRestaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-01T18:00:00Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name": "Pho", "rating": 5, "user": targetUser.Id, "visit": visit.Id,
	})
	oldDuplicate := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"createdBy": targetUser.Id, "name": "Pho", "restaurant": originalRestaurant.Id, "visibility": "friends",
	})
	newDuplicate := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"createdBy": targetUser.Id, "name": "Pho", "restaurant": correctRestaurant.Id, "visibility": "friends",
	})

	response := performJSONRequest(t, server.mux, http.MethodPatch, "/api/admin/users/"+targetUser.Id+"/visits/"+visit.Id+"/restaurant", adminToken, `{"restaurantId":"`+correctRestaurant.Id+`","reason":"Correct restaurant"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if _, err := server.app.FindRecordById("menu_items", oldDuplicate.Id); err == nil {
		t.Fatalf("expected old duplicate menu item to be deleted")
	}
	if _, err := server.app.FindRecordById("menu_items", newDuplicate.Id); err != nil {
		t.Fatalf("expected destination duplicate menu item to remain: %v", err)
	}

	body := parseJSONMap(t, response.Body.Bytes())
	menuItemRepair := body["menuItemRepair"].(map[string]any)
	if !jsonStringSliceContains(menuItemRepair["deletedDuplicateMenuItemIds"], oldDuplicate.Id) {
		t.Fatalf("expected deleted duplicate id in response, got %#v", menuItemRepair)
	}
}

func TestAdminVisitRestaurantRepairRejectsWrongUserAndUnknownRestaurant(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Tacos Manuel",
		"location":   "San Diego, CA",
		"visibility": "public",
	})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-01T18:00:00Z",
		"visibility": "friends",
	})

	wrongUserResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/users/"+otherUser.Id+"/visits/"+visit.Id+"/restaurant",
		adminToken,
		`{"restaurantId":"`+restaurant.Id+`","reason":"Wrong user test"}`,
	)
	if wrongUserResponse.Code != http.StatusNotFound {
		t.Fatalf("expected wrong user 404, got %d: %s", wrongUserResponse.Code, wrongUserResponse.Body.String())
	}

	unknownRestaurantResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/users/"+targetUser.Id+"/visits/"+visit.Id+"/restaurant",
		adminToken,
		`{"restaurantId":"missing_restaurant","reason":"Unknown restaurant test"}`,
	)
	if unknownRestaurantResponse.Code != http.StatusNotFound {
		t.Fatalf("expected unknown restaurant 404, got %d: %s", unknownRestaurantResponse.Code, unknownRestaurantResponse.Body.String())
	}
}

func TestAdminVisitRestaurantRepairNoOpDoesNotCreateAuditLog(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Tacos Manuel",
		"location":   "San Diego, CA",
		"visibility": "public",
	})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-01T18:00:00Z",
		"visibility": "friends",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/users/"+targetUser.Id+"/visits/"+visit.Id+"/restaurant",
		adminToken,
		`{"restaurantId":"`+restaurant.Id+`","reason":"No-op"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	auditLogs, err := server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         core.ModelEventTypeUpdate,
			"collection":     "visits",
			"targetRecordId": visit.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load audit logs: %v", err)
	}
	if len(auditLogs) != 0 {
		t.Fatalf("expected no no-op audit logs, got %d", len(auditLogs))
	}
}

func TestNonAdminCannotReassignVisitRestaurant(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	targetUser, userToken := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Tacos Manuel",
		"location":   "San Diego, CA",
		"visibility": "public",
	})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-01T18:00:00Z",
		"visibility": "friends",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/users/"+targetUser.Id+"/visits/"+visit.Id+"/restaurant",
		userToken,
		`{"restaurantId":"`+restaurant.Id+`","reason":"Not allowed"}`,
	)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected non-admin 403, got %d: %s", response.Code, response.Body.String())
	}
}

func TestAdminUserProfileViewCreatesAuditLog(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/users/"+targetUser.Id+"/profile",
		adminToken,
		"",
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	auditLogs, err := server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         lib.AuditActionView,
			"collection":     "users",
			"targetRecordId": targetUser.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load audit logs: %v", err)
	}

	if len(auditLogs) != 1 {
		t.Fatalf("expected 1 profile audit log, got %d", len(auditLogs))
	}

	if auditLogs[0].GetString("summary") != "Viewed user profile for "+targetUser.Email() {
		t.Fatalf("unexpected audit summary: %s", auditLogs[0].GetString("summary"))
	}

	metadataMap := parseAuditMetadata(t, auditLogs[0].Get("metadataJson"))
	if metadataMap["source"] != "admin_user_profile" {
		t.Fatalf("expected audit source admin_user_profile, got %#v", metadataMap["source"])
	}
}

func TestAdminUserVisitsSearchReturnsOlderVisitsWithPagination(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"location":   "Page City",
		"name":       "Pagination Cafe",
		"visibility": "public",
	})
	for index := 1; index <= 30; index++ {
		createCollectionRecord(t, server.app, "visits", map[string]any{
			"restaurant": restaurant.Id,
			"user":       targetUser.Id,
			"visitDate":  fmt.Sprintf("2026-03-%02dT18:00:00Z", index),
			"visibility": "friends",
		})
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/users/"+targetUser.Id+"/visits?page=2&perPage=25",
		adminToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())
	if body["totalItems"] != float64(30) || body["totalPages"] != float64(2) || body["page"] != float64(2) {
		t.Fatalf("unexpected pagination metadata: %#v", body)
	}
	items, ok := body["items"].([]any)
	if !ok || len(items) != 5 {
		t.Fatalf("expected 5 visits on page 2, got %#v", body["items"])
	}
	firstItem := items[0].(map[string]any)
	if !strings.Contains(fmt.Sprint(firstItem["visitDate"]), "2026-03-05") {
		t.Fatalf("expected first page 2 item to be March 5, got %#v", firstItem["visitDate"])
	}
}

func TestAdminUserVisitsSearchFiltersByRestaurant(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	matchingRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"location":   "San Diego, CA",
		"name":       "Correct Tacos",
		"placeId":    "correct-place-id",
		"visibility": "public",
	})
	otherRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"location":   "Austin, TX",
		"name":       "Wrong BBQ",
		"placeId":    "wrong-place-id",
		"visibility": "public",
	})
	matchingVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": matchingRestaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-01T18:00:00Z",
		"visibility": "friends",
	})
	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"createdBy":  targetUser.Id,
		"name":       "Birria taco",
		"restaurant": matchingRestaurant.Id,
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"menuItem": menuItem.Id,
		"name":     "Birria taco",
		"rating":   5,
		"user":     targetUser.Id,
		"visit":    matchingVisit.Id,
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": otherRestaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-02T18:00:00Z",
		"visibility": "friends",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/users/"+targetUser.Id+"/visits?search=correct-place",
		adminToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())
	items, ok := body["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one matching visit, got %#v", body["items"])
	}
	item := items[0].(map[string]any)
	if item["id"] != matchingVisit.Id {
		t.Fatalf("expected matching visit %s, got %#v", matchingVisit.Id, item)
	}

	menuItemSearchResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/users/"+targetUser.Id+"/visits?search=birria",
		adminToken,
		"",
	)
	if menuItemSearchResponse.Code != http.StatusOK {
		t.Fatalf("expected menu item search 200, got %d: %s", menuItemSearchResponse.Code, menuItemSearchResponse.Body.String())
	}

	menuItemSearchBody := parseJSONMap(t, menuItemSearchResponse.Body.Bytes())
	menuItemSearchItems, ok := menuItemSearchBody["items"].([]any)
	if !ok || len(menuItemSearchItems) != 1 {
		t.Fatalf("expected one menu item matching visit, got %#v", menuItemSearchBody["items"])
	}
	menuItemSearchItem := menuItemSearchItems[0].(map[string]any)
	if menuItemSearchItem["id"] != matchingVisit.Id {
		t.Fatalf("expected menu item search to match visit %s, got %#v", matchingVisit.Id, menuItemSearchItem)
	}
	serializedVisitItems, ok := menuItemSearchItem["items"].([]any)
	if !ok || len(serializedVisitItems) != 1 {
		t.Fatalf("expected menu item search response to include visit items, got %#v", menuItemSearchItem["items"])
	}
}

func TestAdminUserVisitsSearchMappedOnlyReturnsOnlyVisitsWithCoordinates(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	mappedRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"latitude":   34.0501,
		"location":   "Los Angeles, CA",
		"longitude":  -118.2501,
		"name":       "Mapped Cafe",
		"visibility": "public",
	})
	unmappedRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"location":   "Unknown",
		"name":       "Unmapped Cafe",
		"visibility": "public",
	})
	partialCoordinateRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"latitude":   34.0501,
		"location":   "Partial Coordinates",
		"name":       "Partial Coordinate Cafe",
		"visibility": "public",
	})
	mappedVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": mappedRestaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-01T18:00:00Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": unmappedRestaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-02T18:00:00Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": partialCoordinateRestaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-03T18:00:00Z",
		"visibility": "friends",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/users/"+targetUser.Id+"/visits?mappedOnly=true",
		adminToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())
	if body["totalItems"] != float64(1) {
		t.Fatalf("expected one mapped visit, got metadata %#v", body)
	}
	items, ok := body["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one mapped visit item, got %#v", body["items"])
	}
	item := items[0].(map[string]any)
	if item["id"] != mappedVisit.Id {
		t.Fatalf("expected mapped visit %s, got %#v", mappedVisit.Id, item)
	}
	expand := item["expand"].(map[string]any)
	restaurant := expand["restaurant"].(map[string]any)
	if restaurant["latitude"] != float64(34.0501) || restaurant["longitude"] != float64(-118.2501) {
		t.Fatalf("expected serialized restaurant coordinates, got %#v", restaurant)
	}
}

func TestAdminUserVisitsSearchMappedOnlyStillFiltersByRestaurantSearch(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	matchingRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"latitude":   32.7157,
		"location":   "San Diego, CA",
		"longitude":  -117.1611,
		"name":       "Mapped Correct Tacos",
		"placeId":    "mapped-correct-place",
		"visibility": "public",
	})
	otherRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"latitude":   30.2672,
		"location":   "Austin, TX",
		"longitude":  -97.7431,
		"name":       "Mapped Wrong BBQ",
		"placeId":    "mapped-wrong-place",
		"visibility": "public",
	})
	matchingVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": matchingRestaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-01T18:00:00Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": otherRestaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-02T18:00:00Z",
		"visibility": "friends",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/users/"+targetUser.Id+"/visits?mappedOnly=true&search=mapped-correct-place",
		adminToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())
	items, ok := body["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one mapped matching visit, got %#v", body["items"])
	}
	item := items[0].(map[string]any)
	if item["id"] != matchingVisit.Id {
		t.Fatalf("expected matching mapped visit %s, got %#v", matchingVisit.Id, item)
	}
}

func TestAdminUserProfileIncludesCreatedRestaurantsAndMenuItems(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)

	restaurantsCollection, err := server.app.FindCollectionByNameOrId("restaurants")
	if err != nil {
		t.Fatalf("failed to resolve restaurants collection: %v", err)
	}

	restaurant := core.NewRecord(restaurantsCollection)
	restaurant.Set("name", "Created Restaurant")
	restaurant.Set("location", "123 Main Street")
	restaurant.Set("visibility", "public")
	restaurant.Set("createdBy", targetUser.Id)
	if err := server.app.Save(restaurant); err != nil {
		t.Fatalf("failed to create restaurant: %v", err)
	}

	menuItemsCollection, err := server.app.FindCollectionByNameOrId("menu_items")
	if err != nil {
		t.Fatalf("failed to resolve menu_items collection: %v", err)
	}

	menuItem := core.NewRecord(menuItemsCollection)
	menuItem.Set("name", "Created Menu Item")
	menuItem.Set("restaurant", restaurant.Id)
	menuItem.Set("visibility", "public")
	menuItem.Set("createdBy", targetUser.Id)
	if err := server.app.Save(menuItem); err != nil {
		t.Fatalf("failed to create menu item: %v", err)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/users/"+targetUser.Id+"/profile",
		adminToken,
		"",
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())

	recentRestaurants, ok := body["recentRestaurants"].([]any)
	if !ok || len(recentRestaurants) != 1 {
		t.Fatalf("expected 1 recent restaurant, got %#v", body["recentRestaurants"])
	}

	restaurantData, ok := recentRestaurants[0].(map[string]any)
	if !ok {
		t.Fatalf("expected restaurant payload map, got %#v", recentRestaurants[0])
	}

	if restaurantData["name"] != "Created Restaurant" {
		t.Fatalf("expected created restaurant in response, got %#v", restaurantData["name"])
	}

	recentMenuItems, ok := body["recentMenuItems"].([]any)
	if !ok || len(recentMenuItems) != 1 {
		t.Fatalf("expected 1 recent menu item, got %#v", body["recentMenuItems"])
	}

	menuItemData, ok := recentMenuItems[0].(map[string]any)
	if !ok {
		t.Fatalf("expected menu item payload map, got %#v", recentMenuItems[0])
	}

	if menuItemData["name"] != "Created Menu Item" {
		t.Fatalf("expected created menu item in response, got %#v", menuItemData["name"])
	}

	if menuItemData["restaurantName"] != "Created Restaurant" {
		t.Fatalf("expected menu item restaurant name in response, got %#v", menuItemData["restaurantName"])
	}
}

func TestAdminUserAccessUpdateChangesOtherUser(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/users/"+targetUser.Id+"/access",
		adminToken,
		`{"isSubscriber":true,"isBetaUser":true}`,
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	refreshed, err := server.app.FindRecordById("users", targetUser.Id)
	if err != nil {
		t.Fatalf("failed to reload target user: %v", err)
	}

	if !refreshed.GetBool("isSubscriber") {
		t.Fatalf("expected isSubscriber=true after access update")
	}
	if !refreshed.GetBool("isBetaUser") {
		t.Fatalf("expected isBetaUser=true after access update")
	}
}

func TestAdminUserProfileIncludesFeedAndLists(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	friendUser, _ := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Pasta Place",
		"location":    "San Francisco, CA",
		"cuisineType": "Italian",
		"createdBy":   targetUser.Id,
		"user":        targetUser.Id,
		"visibility":  "public",
	})
	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"createdBy":  targetUser.Id,
		"name":       "Truffle pasta",
		"restaurant": restaurant.Id,
		"visibility": "friends",
	})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-01T18:00:00Z",
		"visibility": "friends",
	})
	visitItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"menuItem": menuItem.Id,
		"name":     "Truffle pasta",
		"rating":   5,
		"user":     targetUser.Id,
		"visit":    visit.Id,
	})
	foodProduct := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":          "Airport snack",
		"rating":        3,
		"user":          targetUser.Id,
		"itemType":      "food-product",
		"visibility":    "private",
		"location_text": "SFO Terminal 2",
		"itemCategory":  "packaged_food",
		"itemDate":      "2026-03-02T09:30:00Z",
	})
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":        "Weekend saves",
		"description": "Spots to revisit",
		"user":        targetUser.Id,
		"visibility":  "friends",
	})
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    targetUser.Id,
		"position":   1,
		"foodItem":   visitItem.Id,
		"note":       "Must order again",
	})
	bill := createCollectionRecord(t, server.app, "bills", map[string]any{
		"bill_name":         "Team dinner",
		"total_amount":      128.45,
		"tax":               10.15,
		"tip":               22.3,
		"fees":              0,
		"split_mode":        "itemized",
		"extras_split_mode": "equal",
		"status":            "active",
		"creator_user":      targetUser.Id,
	})
	targetParticipant := createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             bill.Id,
		"user":             targetUser.Id,
		"participant_name": "Target User",
		"amount_owed":      64.23,
		"paid_status":      "pending",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             bill.Id,
		"user":             friendUser.Id,
		"participant_name": "Friend User",
		"amount_owed":      64.22,
		"paid_status":      "paid",
		"payment_method":   "venmo",
	})
	createCollectionRecord(t, server.app, "bill_items", map[string]any{
		"bill":        bill.Id,
		"item_name":   "Shared appetizer",
		"price":       18.5,
		"assigned_to": []string{targetParticipant.Id},
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/users/"+targetUser.Id+"/profile",
		adminToken,
		"",
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := response.Body.String()
	for _, expected := range []string{
		`"feedEntries"`,
		`"restaurantLists"`,
		`"recentBills"`,
		"Pasta Place",
		"Truffle pasta",
		"Airport snack",
		"Weekend saves",
		"Team dinner",
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("expected response to include %q, got %s", expected, body)
		}
	}

	payload := parseJSONMap(t, response.Body.Bytes())
	recentVisits, ok := payload["recentVisits"].([]any)
	if !ok || len(recentVisits) == 0 {
		t.Fatalf("expected recentVisits in response, got %#v", payload["recentVisits"])
	}

	recentFoodProducts, ok := payload["recentFoodProducts"].([]any)
	if !ok {
		t.Fatalf("expected recentFoodProducts in response, got %#v", payload["recentFoodProducts"])
	}
	if len(recentFoodProducts) != 1 {
		t.Fatalf("expected 1 recent food product, got %#v", recentFoodProducts)
	}

	foodProductData, ok := recentFoodProducts[0].(map[string]any)
	if !ok {
		t.Fatalf("expected food product payload map, got %#v", recentFoodProducts[0])
	}
	if foodProductData["id"] != foodProduct.Id || foodProductData["name"] != "Airport snack" {
		t.Fatalf("expected food product in recentFoodProducts, got %#v", foodProductData)
	}
	if foodProductData["id"] == visitItem.Id {
		t.Fatalf("expected visit item to be excluded from recentFoodProducts, got %#v", foodProductData)
	}

	recentFoodItems, ok := payload["recentFoodItems"].([]any)
	if !ok {
		t.Fatalf("expected recentFoodItems in response, got %#v", payload["recentFoodItems"])
	}
	var visitRatingData map[string]any
	for _, rawItem := range recentFoodItems {
		item, ok := rawItem.(map[string]any)
		if !ok {
			continue
		}
		if item["id"] == visitItem.Id {
			visitRatingData = item
			break
		}
	}
	if visitRatingData == nil {
		t.Fatalf("expected visit rating in recentFoodItems, got %#v", recentFoodItems)
	}
	if visitRatingData["restaurantName"] != "Pasta Place" || visitRatingData["restaurantCreatedBy"] != targetUser.Id {
		t.Fatalf("expected restaurant context for visit rating, got %#v", visitRatingData)
	}
	if visitRatingData["menuItemId"] != menuItem.Id || visitRatingData["menuItemCreatedBy"] != targetUser.Id {
		t.Fatalf("expected menu item context for visit rating, got %#v", visitRatingData)
	}

	visitData := recentVisits[0].(map[string]any)
	visitItems, ok := visitData["items"].([]any)
	if !ok || len(visitItems) != 1 {
		t.Fatalf("expected serialized visit items, got %#v", visitData["items"])
	}
	serializedVisitItem := visitItems[0].(map[string]any)
	if serializedVisitItem["name"] != "Truffle pasta" || serializedVisitItem["menuItem"] != menuItem.Id {
		t.Fatalf("expected visit item details, got %#v", serializedVisitItem)
	}
}

func TestAdminCanDeleteModeratedUserContent(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	quickTrack := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":          "Gas station coffee",
		"rating":        2,
		"user":          targetUser.Id,
		"itemType":      "food-product",
		"visibility":    "private",
		"location_text": "Highway stop",
		"itemCategory":  "other",
		"itemDate":      "2026-03-03T07:00:00Z",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodDelete,
		"/api/admin/users/"+targetUser.Id+"/content/food-product/"+quickTrack.Id,
		adminToken,
		"",
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	if _, err := server.app.FindRecordById("food_items", quickTrack.Id); err == nil {
		t.Fatalf("expected food product to be deleted")
	}

	auditLogs, err := server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         core.ModelEventTypeDelete,
			"collection":     "food_items",
			"targetRecordId": quickTrack.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load audit logs: %v", err)
	}

	if len(auditLogs) != 1 {
		t.Fatalf("expected 1 moderation delete audit log, got %d", len(auditLogs))
	}

	metadataMap := parseAuditMetadata(t, auditLogs[0].Get("metadataJson"))
	if metadataMap["source"] != "admin_content_moderation" {
		t.Fatalf("expected audit source admin_content_moderation, got %#v", metadataMap["source"])
	}
	if metadataMap["contentType"] != "food-product" {
		t.Fatalf("expected audit contentType food-product, got %#v", metadataMap["contentType"])
	}
}

func TestAdminCanUpdateUserModerationState(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	adminUser, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/users/"+targetUser.Id+"/moderation",
		adminToken,
		`{
			"action":"warn",
			"contentModerationMode":"pre_review",
			"moderationNotice":"We removed some content.",
			"moderationNotes":"Repeat spam reports",
			"warningCount":2
		}`,
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	refreshed, err := server.app.FindRecordById("users", targetUser.Id)
	if err != nil {
		t.Fatalf("failed to reload target user: %v", err)
	}

	if refreshed.GetString("moderationState") != lib.UserModerationStateWarned {
		t.Fatalf("expected moderationState=warned, got %s", refreshed.GetString("moderationState"))
	}
	if refreshed.GetString("contentModerationMode") != lib.ContentModerationModePreReview {
		t.Fatalf("expected contentModerationMode=pre_review, got %s", refreshed.GetString("contentModerationMode"))
	}
	if refreshed.GetInt("warningCount") != 2 {
		t.Fatalf("expected warningCount=2, got %d", refreshed.GetInt("warningCount"))
	}
	if refreshed.GetString("moderatedBy") != adminUser.Id {
		t.Fatalf("expected moderatedBy=%s, got %s", adminUser.Id, refreshed.GetString("moderatedBy"))
	}

	caseRecord, err := server.app.FindFirstRecordByFilter(
		"moderation_cases",
		"targetType = {:targetType} && targetRecordId = {:targetRecordId}",
		map[string]any{
			"targetType":     "user",
			"targetRecordId": targetUser.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load moderation case: %v", err)
	}

	if caseRecord.GetString("status") != lib.ModerationCaseStatusWarned {
		t.Fatalf("expected moderation case status warned, got %s", caseRecord.GetString("status"))
	}
	if caseRecord.GetString("action") != lib.ModerationActionWarn {
		t.Fatalf("expected moderation case action warn, got %s", caseRecord.GetString("action"))
	}
}

func TestAdminCanHideModeratedContentWithoutDeleting(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	adminUser, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	quickTrack := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":       "Bad food product",
		"rating":     1,
		"user":       targetUser.Id,
		"itemType":   "food-product",
		"visibility": "private",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/users/"+targetUser.Id+"/content/food-product/"+quickTrack.Id+"/moderation",
		adminToken,
		`{
			"action":"hide",
			"reasonCode":"spam",
			"moderatorNote":"Hidden by integration test",
			"userNotice":"This was removed from the feed."
		}`,
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	refreshed, err := server.app.FindRecordById("food_items", quickTrack.Id)
	if err != nil {
		t.Fatalf("failed to reload food product: %v", err)
	}

	if refreshed.GetString("moderationStatus") != lib.ContentModerationStatusHidden {
		t.Fatalf("expected moderationStatus=hidden, got %s", refreshed.GetString("moderationStatus"))
	}
	if refreshed.GetString("moderatedBy") != adminUser.Id {
		t.Fatalf("expected moderatedBy=%s, got %s", adminUser.Id, refreshed.GetString("moderatedBy"))
	}

	caseRecord, err := server.app.FindFirstRecordByFilter(
		"moderation_cases",
		"targetType = {:targetType} && targetRecordId = {:targetRecordId}",
		map[string]any{
			"targetType":     "food-product",
			"targetRecordId": quickTrack.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load moderation case: %v", err)
	}

	if caseRecord.GetString("status") != lib.ModerationCaseStatusHidden {
		t.Fatalf("expected moderation case status hidden, got %s", caseRecord.GetString("status"))
	}
	if caseRecord.GetString("reasonCode") != "spam" {
		t.Fatalf("expected reasonCode=spam, got %s", caseRecord.GetString("reasonCode"))
	}
}

func TestAdminModerationCasesCanBeClaimedAndReleased(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
		handlers.RegisterModerationHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	targetUser, _ := createAuthUser(t, server.app, false, false)
	caseRecord := createCollectionRecord(t, server.app, "moderation_cases", map[string]any{
		"targetType":       "user",
		"targetRecordId":   targetUser.Id,
		"targetCollection": "users",
		"targetLabel":      targetUser.Email(),
		"targetUser":       targetUser.Id,
		"status":           lib.ModerationCaseStatusOpen,
	})

	listResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/moderation/cases?status=active",
		adminToken,
		"",
	)

	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", listResponse.Code, listResponse.Body.String())
	}

	if !strings.Contains(listResponse.Body.String(), caseRecord.Id) {
		t.Fatalf("expected moderation case list to include %s, got %s", caseRecord.Id, listResponse.Body.String())
	}

	claimResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/moderation/cases/"+caseRecord.Id+"/claim",
		adminToken,
		"",
	)

	if claimResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", claimResponse.Code, claimResponse.Body.String())
	}

	reloaded, err := server.app.FindRecordById("moderation_cases", caseRecord.Id)
	if err != nil {
		t.Fatalf("failed to reload moderation case: %v", err)
	}

	if reloaded.GetString("assignedAdmin") == "" {
		t.Fatalf("expected assignedAdmin to be set after claim")
	}
	if reloaded.GetString("status") != lib.ModerationCaseStatusUnderReview {
		t.Fatalf("expected status under_review after claim, got %s", reloaded.GetString("status"))
	}

	releaseResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/moderation/cases/"+caseRecord.Id+"/release",
		adminToken,
		"",
	)

	if releaseResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", releaseResponse.Code, releaseResponse.Body.String())
	}

	reloaded, err = server.app.FindRecordById("moderation_cases", caseRecord.Id)
	if err != nil {
		t.Fatalf("failed to reload moderation case after release: %v", err)
	}

	if reloaded.GetString("assignedAdmin") != "" {
		t.Fatalf("expected assignedAdmin to be cleared after release, got %s", reloaded.GetString("assignedAdmin"))
	}
	if reloaded.GetString("status") != lib.ModerationCaseStatusOpen {
		t.Fatalf("expected status open after release, got %s", reloaded.GetString("status"))
	}
}
