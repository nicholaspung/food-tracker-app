package handlers_test

import (
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
