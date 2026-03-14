package handlers_test

import (
	"encoding/json"
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
	for key, value := range data {
		record.Set(key, value)
	}

	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create %s record: %v", collectionName, err)
	}

	return record
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
	menuItem.Set("description", "From the test fixture")
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
		"user":        targetUser.Id,
		"visibility":  "public",
	})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       targetUser.Id,
		"visitDate":  "2026-03-01T18:00:00Z",
		"visibility": "friends",
	})
	visitItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":   "Truffle pasta",
		"rating": 5,
		"user":   targetUser.Id,
		"visit":  visit.Id,
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":          "Airport snack",
		"rating":        3,
		"user":          targetUser.Id,
		"isQuickTrack":  true,
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
		"isQuickTrack":  true,
		"visibility":    "private",
		"location_text": "Highway stop",
		"itemCategory":  "other",
		"itemDate":      "2026-03-03T07:00:00Z",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodDelete,
		"/api/admin/users/"+targetUser.Id+"/content/quick-track/"+quickTrack.Id,
		adminToken,
		"",
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	if _, err := server.app.FindRecordById("food_items", quickTrack.Id); err == nil {
		t.Fatalf("expected quick track to be deleted")
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
	if metadataMap["contentType"] != "quick-track" {
		t.Fatalf("expected audit contentType quick-track, got %#v", metadataMap["contentType"])
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
		"name":         "Bad quick track",
		"rating":       1,
		"user":         targetUser.Id,
		"isQuickTrack": true,
		"visibility":   "private",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/users/"+targetUser.Id+"/content/quick-track/"+quickTrack.Id+"/moderation",
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
		t.Fatalf("failed to reload quick track: %v", err)
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
			"targetType":     "quick-track",
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
