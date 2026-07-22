package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/hooks"
)

func TestVisitCreateRejectsCrossUserSpoofing(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, app core.App) {
		hooks.RegisterRecordOwnershipHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Security Test Restaurant",
		"location":   "Los Angeles",
		"createdBy":  owner.Id,
		"visibility": "friends",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/visits/records",
		ownerToken,
		fmt.Sprintf(`{"restaurant":"%s","user":"%s","visitDate":"2026-04-05T18:00:00Z","visibility":"friends"}`, restaurant.Id, otherUser.Id),
	)
	if response.Code == http.StatusOK {
		t.Fatalf("expected cross-user visit create to be rejected, got 200: %s", response.Body.String())
	}
}

func TestRestaurantCreateRejectsCrossUserCreatedBySpoofing(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, app core.App) {
		hooks.RegisterRecordOwnershipHooks(app)
	})

	_, ownerToken := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/restaurants/records",
		ownerToken,
		fmt.Sprintf(`{"name":"Forged Restaurant","location":"Los Angeles","createdBy":"%s","visibility":"friends"}`, otherUser.Id),
	)
	if response.Code == http.StatusOK {
		t.Fatalf("expected spoofed restaurant create to be rejected, got 200: %s", response.Body.String())
	}
}

func TestBillParticipantRawCreateRequiresAcceptedFriend(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, app core.App) {
		hooks.RegisterRecordOwnershipHooks(app)
	})

	creator, creatorToken := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)
	nonFriend, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, creator.Id, friend.Id, "accepted")
	bill := seedBillRecord(t, server.app, creator.Id, "Raw Participant Security")

	rejected := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/bill_participants/records",
		creatorToken,
		fmt.Sprintf(`{"bill":"%s","user":"%s","participant_name":"Target","amount_owed":10,"paid_status":"pending"}`, bill.Id, nonFriend.Id),
	)
	if rejected.Code != http.StatusForbidden {
		t.Fatalf("expected raw non-friend enrollment 403, got %d: %s", rejected.Code, rejected.Body.String())
	}
	if count := countRecordsByFilter(t, server.app, "bill_participants", "user = {:userId}", map[string]any{"userId": nonFriend.Id}); count != 0 {
		t.Fatalf("expected rejected raw enrollment to create no relation, got %d", count)
	}

	accepted := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/bill_participants/records",
		creatorToken,
		fmt.Sprintf(`{"bill":"%s","user":"%s","participant_name":"Friend","amount_owed":10,"paid_status":"pending"}`, bill.Id, friend.Id),
	)
	if accepted.Code != http.StatusOK {
		t.Fatalf("expected raw accepted-friend enrollment 200, got %d: %s", accepted.Code, accepted.Body.String())
	}
}

func TestRestaurantRawWritesRejectGoogleCatalogTrustChanges(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, app core.App) {
		hooks.RegisterRecordOwnershipHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	maliciousCreates := []string{
		fmt.Sprintf(`{"name":"Forged Google Restaurant","location":"Los Angeles","createdBy":"%s","visibility":"public","placeId":"forged-place","isGooglePlace":true}`, owner.Id),
		fmt.Sprintf(`{"name":"Forged Cached Restaurant","location":"Los Angeles","createdBy":"%s","visibility":"public","googlePlaceCachedAt":"2026-07-21 12:00:00.000Z"}`, owner.Id),
		fmt.Sprintf(`{"name":"Public Place ID Claim","location":"Los Angeles","createdBy":"%s","visibility":"public","placeId":"reserved-place"}`, owner.Id),
	}
	for _, body := range maliciousCreates {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			"/api/collections/restaurants/records",
			ownerToken,
			body,
		)
		if response.Code != http.StatusForbidden {
			t.Fatalf("expected forged Google trust create 403, got %d: %s", response.Code, response.Body.String())
		}
	}

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Owner Restaurant",
		"location":   "Los Angeles",
		"createdBy":  owner.Id,
		"visibility": "friends",
	})
	maliciousUpdates := []string{
		`{"placeId":"forged-place","isGooglePlace":true}`,
		`{"googlePlaceCachedAt":"2026-07-21 12:00:00.000Z"}`,
		`{"visibility":"public","placeId":"reserved-place"}`,
	}
	for _, body := range maliciousUpdates {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPatch,
			"/api/collections/restaurants/records/"+restaurant.Id,
			ownerToken,
			body,
		)
		if response.Code != http.StatusForbidden {
			t.Fatalf("expected forged Google trust update 403, got %d: %s", response.Code, response.Body.String())
		}
	}

	allowedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/collections/restaurants/records/"+restaurant.Id,
		ownerToken,
		`{"name":"Updated Owner Restaurant"}`,
	)
	if allowedResponse.Code != http.StatusOK {
		t.Fatalf("expected ordinary owner update 200, got %d: %s", allowedResponse.Code, allowedResponse.Body.String())
	}

	reloaded, err := server.app.FindRecordById("restaurants", restaurant.Id)
	if err != nil {
		t.Fatalf("failed to reload restaurant after trust checks: %v", err)
	}
	if reloaded.GetString("name") != "Updated Owner Restaurant" ||
		reloaded.GetBool("isGooglePlace") ||
		strings.TrimSpace(reloaded.GetString("googlePlaceCachedAt")) != "" {
		t.Fatalf("unexpected restaurant state after trust checks: %#v", reloaded)
	}
}

func TestMenuItemCreateRejectsRawCatalogTrustState(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, app core.App) {
		hooks.RegisterRecordOwnershipHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Trust Boundary Cafe",
		"location":   "Los Angeles",
		"createdBy":  owner.Id,
		"visibility": "public",
	})
	linkedItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":           "Existing Trusted Link",
		"restaurant":     restaurant.Id,
		"createdBy":      owner.Id,
		"visibility":     "public",
		"approvalStatus": "unreviewed",
	})

	maliciousFields := []map[string]any{
		{"approvalStatus": "approved"},
		{"approvalStatus": "rejected"},
		{"approvalReviewedBy": owner.Id},
		{"approvalReviewedAt": "2026-07-21 12:00:00.000Z"},
		{"promotedFrom": linkedItem.Id},
		{"promotedTo": linkedItem.Id},
		{"groupSuitable": true},
	}
	for index, maliciousField := range maliciousFields {
		payload := map[string]any{
			"name":           fmt.Sprintf("Forged Trust Item %d", index),
			"restaurant":     restaurant.Id,
			"createdBy":      owner.Id,
			"visibility":     "public",
			"approvalStatus": "unreviewed",
		}
		for field, value := range maliciousField {
			payload[field] = value
		}
		body, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("failed to encode malicious payload: %v", err)
		}

		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			"/api/collections/menu_items/records",
			ownerToken,
			string(body),
		)
		if response.Code != http.StatusForbidden {
			t.Fatalf("expected forged trust create to return 403, got %d for %#v: %s", response.Code, maliciousField, response.Body.String())
		}
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"menu_items",
		"restaurant = {:restaurantId}",
		map[string]any{"restaurantId": restaurant.Id},
	); count != 1 {
		t.Fatalf("expected only the seeded menu item after rejected creates, got %d", count)
	}
}

func TestMenuItemCreateInitializesSafeUnreviewedTrustState(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, app core.App) {
		hooks.RegisterRecordOwnershipHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Contribution Cafe",
		"location":   "Los Angeles",
		"createdBy":  owner.Id,
		"visibility": "public",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/menu_items/records",
		ownerToken,
		fmt.Sprintf(`{"name":"Community Toast","restaurant":"%s","createdBy":"%s","visibility":"public"}`, restaurant.Id, owner.Id),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected safe public contribution to succeed, got %d: %s", response.Code, response.Body.String())
	}

	payload := map[string]any{}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode created menu item: %v", err)
	}
	menuItemID, _ := payload["id"].(string)
	created, err := server.app.FindRecordById("menu_items", menuItemID)
	if err != nil {
		t.Fatalf("failed to reload created menu item: %v", err)
	}
	if created.GetString("approvalStatus") != "unreviewed" ||
		created.GetBool("groupSuitable") ||
		created.GetString("approvalReviewedBy") != "" ||
		created.GetString("approvalReviewedAt") != "" ||
		created.GetString("promotedFrom") != "" ||
		created.GetString("promotedTo") != "" {
		t.Fatalf("unexpected trust state on safe contribution: %#v", created)
	}
}

func TestMenuItemUpdateRejectsRawCatalogTrustChanges(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, app core.App) {
		hooks.RegisterRecordOwnershipHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	admin, adminToken := createAuthUser(t, server.app, true, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Trusted Update Cafe",
		"location":   "Los Angeles",
		"createdBy":  owner.Id,
		"visibility": "public",
	})
	linkedItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":           "Promotion Target",
		"restaurant":     restaurant.Id,
		"createdBy":      admin.Id,
		"visibility":     "public",
		"approvalStatus": "approved",
	})
	otherRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Other Trusted Update Cafe",
		"location":   "Pasadena",
		"createdBy":  owner.Id,
		"visibility": "public",
	})
	sourceImageID := insertMenuImageRowRaw(t, server.app, restaurant.Id, owner.Id)
	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":               "Trusted Toast",
		"restaurant":         restaurant.Id,
		"createdBy":          owner.Id,
		"visibility":         "public",
		"approvalStatus":     "approved",
		"approvalReviewedBy": admin.Id,
		"approvalReviewedAt": "2026-07-21 12:00:00.000Z",
		"groupSuitable":      true,
		"sourceImage":        sourceImageID,
		"isFromOCR":          true,
	})
	originalUpdated := menuItem.GetString("updated")

	maliciousUpdates := []struct {
		authToken string
		payload   string
	}{
		{ownerToken, `{"approvalStatus":"unreviewed"}`},
		{ownerToken, `{"approvalReviewedBy":""}`},
		{ownerToken, `{"approvalReviewedAt":"2026-07-22 12:00:00.000Z"}`},
		{ownerToken, fmt.Sprintf(`{"promotedFrom":"%s"}`, linkedItem.Id)},
		{ownerToken, fmt.Sprintf(`{"promotedTo":"%s"}`, linkedItem.Id)},
		{ownerToken, `{"groupSuitable":false}`},
		{ownerToken, `{"visibility":"friends"}`},
		{ownerToken, `{"name":"Poisoned Trusted Name"}`},
		{ownerToken, fmt.Sprintf(`{"restaurant":"%s"}`, otherRestaurant.Id)},
		{ownerToken, `{"sourceImage":""}`},
		{ownerToken, `{"isFromOCR":false}`},
		{ownerToken, `{}`},
		{ownerToken, `{"name":"Trusted Toast"}`},
		{adminToken, `{"approvalStatus":"rejected"}`},
	}
	for _, maliciousUpdate := range maliciousUpdates {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPatch,
			"/api/collections/menu_items/records/"+menuItem.Id,
			maliciousUpdate.authToken,
			maliciousUpdate.payload,
		)
		if response.Code != http.StatusForbidden {
			t.Fatalf("expected forged trust update to return 403, got %d for %s: %s", response.Code, maliciousUpdate.payload, response.Body.String())
		}

		reloaded, err := server.app.FindRecordById("menu_items", menuItem.Id)
		if err != nil {
			t.Fatalf("failed to reload menu item: %v", err)
		}
		if reloaded.GetString("approvalStatus") != "approved" ||
			reloaded.GetString("approvalReviewedBy") != admin.Id ||
			reloaded.GetString("approvalReviewedAt") != "2026-07-21 12:00:00.000Z" ||
			reloaded.GetString("promotedFrom") != "" ||
			reloaded.GetString("promotedTo") != "" ||
			!reloaded.GetBool("groupSuitable") ||
			reloaded.GetString("visibility") != "public" ||
			reloaded.GetString("name") != "Trusted Toast" ||
			reloaded.GetString("restaurant") != restaurant.Id ||
			reloaded.GetString("sourceImage") != sourceImageID ||
			!reloaded.GetBool("isFromOCR") ||
			reloaded.GetString("updated") != originalUpdated {
			t.Fatalf("menu item trust state changed after rejected update %s: %#v", maliciousUpdate.payload, reloaded)
		}
	}
}

func TestMenuItemUpdateAllowsUnreviewedContentAndVisibilityChange(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, app core.App) {
		hooks.RegisterRecordOwnershipHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Unreviewed Edit Cafe",
		"location":   "Los Angeles",
		"createdBy":  owner.Id,
		"visibility": "public",
	})
	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":           "Draft Toast",
		"restaurant":     restaurant.Id,
		"createdBy":      owner.Id,
		"visibility":     "friends",
		"approvalStatus": "unreviewed",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/collections/menu_items/records/"+menuItem.Id,
		ownerToken,
		`{"name":"Updated Toast","visibility":"public"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected unreviewed content edit to succeed, got %d: %s", response.Code, response.Body.String())
	}

	reloaded, err := server.app.FindRecordById("menu_items", menuItem.Id)
	if err != nil {
		t.Fatalf("failed to reload updated menu item: %v", err)
	}
	if reloaded.GetString("name") != "Updated Toast" ||
		reloaded.GetString("visibility") != "public" ||
		reloaded.GetString("approvalStatus") != "unreviewed" {
		t.Fatalf("unexpected unreviewed menu item state after visibility edit: %#v", reloaded)
	}
}

func TestRestaurantGroupMembershipRejectsNonAdminRawWrites(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, app core.App) {
		hooks.RegisterRecordOwnershipHooks(app)
		hooks.RegisterRestaurantGroupMembershipSecurityHooks(app)
	})

	admin, _ := createAuthUser(t, server.app, true, false)
	owner, ownerToken := createAuthUser(t, server.app, false, false)
	group := createCollectionRecord(t, server.app, "restaurant_groups", map[string]any{
		"name":      "Raw Write Group",
		"createdBy": admin.Id,
	})

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/restaurants/records",
		ownerToken,
		fmt.Sprintf(`{"name":"Raw Membership Create","location":"Los Angeles","createdBy":"%s","visibility":"friends","restaurantGroup":"%s"}`, owner.Id, group.Id),
	)
	if createResponse.Code == http.StatusOK {
		t.Fatalf("expected raw restaurant create membership to be rejected, got 200: %s", createResponse.Body.String())
	}

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Raw Membership Update",
		"location":   "Los Angeles",
		"createdBy":  owner.Id,
		"visibility": "friends",
	})
	updateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/collections/restaurants/records/"+restaurant.Id,
		ownerToken,
		fmt.Sprintf(`{"restaurantGroup":"%s"}`, group.Id),
	)
	if updateResponse.Code == http.StatusOK {
		t.Fatalf("expected raw restaurant update membership to be rejected, got 200: %s", updateResponse.Body.String())
	}
}

func TestNoteUpdateRejectsOwnerTransfer(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, app core.App) {
		hooks.RegisterRecordOwnershipHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)
	note := createCollectionRecord(t, server.app, "notes", map[string]any{
		"user":    owner.Id,
		"content": "Ownership test note",
		"status":  "draft",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/collections/notes/records/"+note.Id,
		ownerToken,
		fmt.Sprintf(`{"user":"%s"}`, otherUser.Id),
	)
	if response.Code == http.StatusOK {
		t.Fatalf("expected note owner transfer to be rejected, got 200: %s", response.Body.String())
	}
}
