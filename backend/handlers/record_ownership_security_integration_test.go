package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
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
