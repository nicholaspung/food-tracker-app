package handlers_test

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func insertMenuImageRowRaw(t *testing.T, app core.App, restaurantID string, uploadedBy string) string {
	t.Helper()

	recordID := fmt.Sprintf("mi_%d", time.Now().UnixNano())
	now := time.Now().UTC().Format(time.RFC3339Nano)

	if _, err := app.DB().NewQuery(`
		INSERT INTO menu_images (id, image, restaurant, uploadedBy, created, updated)
		VALUES ({:id}, {:image}, {:restaurant}, {:uploadedBy}, {:created}, {:updated})
	`).
		Bind(dbx.Params{
			"id":         recordID,
			"image":      "menu-image.jpg",
			"restaurant": restaurantID,
			"uploadedBy": uploadedBy,
			"created":    now,
			"updated":    now,
		}).
		Execute(); err != nil {
		t.Fatalf("failed to insert menu_image row: %v", err)
	}

	return recordID
}

func TestMenuImageReadRulesRestrictAccessToOwnerAndAdmins(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, _ core.App) {})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	_, adminToken := createAuthUser(t, server.app, true, false)
	_, strangerToken := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Private Menu Archive",
		"location":    "San Francisco, CA",
		"cuisineType": "Thai",
		"user":        owner.Id,
		"visibility":  "public",
	})

	imageID := insertMenuImageRowRaw(t, server.app, restaurant.Id, owner.Id)

	ownerList := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/menu_images/records",
		ownerToken,
		"",
	)
	requireListItemCount(t, ownerList.Code, ownerList.Body.Bytes(), 1)

	adminList := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/menu_images/records",
		adminToken,
		"",
	)
	requireListItemCount(t, adminList.Code, adminList.Body.Bytes(), 1)

	strangerList := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/menu_images/records",
		strangerToken,
		"",
	)
	requireListItemCount(t, strangerList.Code, strangerList.Body.Bytes(), 0)

	ownerView := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/menu_images/records/"+imageID,
		ownerToken,
		"",
	)
	if ownerView.Code != http.StatusOK {
		t.Fatalf("expected owner menu image view to succeed, got %d: %s", ownerView.Code, ownerView.Body.String())
	}

	adminView := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/menu_images/records/"+imageID,
		adminToken,
		"",
	)
	if adminView.Code != http.StatusOK {
		t.Fatalf("expected admin menu image view to succeed, got %d: %s", adminView.Code, adminView.Body.String())
	}

	strangerView := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/menu_images/records/"+imageID,
		strangerToken,
		"",
	)
	if strangerView.Code != http.StatusNotFound {
		t.Fatalf("expected stranger menu image view to be denied, got %d: %s", strangerView.Code, strangerView.Body.String())
	}
}
