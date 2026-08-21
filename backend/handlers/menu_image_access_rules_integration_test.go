package handlers_test

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func TestMenuImageRawCreateRejectsMultipartUploadsWithoutPersistingArtifacts(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, _ core.App) {})

	owner, _ := createAuthUser(t, server.app, false, false)
	attacker, attackerToken := createAuthUser(t, server.app, false, false)
	publicRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Public Menu Archive",
		"location":   "San Francisco, CA",
		"createdBy":  owner.Id,
		"visibility": "public",
	})
	privateRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Private Menu Archive",
		"location":   "San Francisco, CA",
		"createdBy":  owner.Id,
		"visibility": "private",
	})
	friendsRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Friends Menu Archive",
		"location":   "San Francisco, CA",
		"createdBy":  owner.Id,
		"visibility": "friends",
	})

	for _, testCase := range []struct {
		name         string
		restaurantID string
		uploaderID   string
	}{
		{name: "forged uploader", restaurantID: publicRestaurant.Id, uploaderID: owner.Id},
		{name: "private Restaurant", restaurantID: privateRestaurant.Id, uploaderID: attacker.Id},
		{name: "friends-only Restaurant", restaurantID: friendsRestaurant.Id, uploaderID: attacker.Id},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			response := performRawMenuImageCreateRequest(
				t,
				server.mux,
				attackerToken,
				testCase.restaurantID,
				testCase.uploaderID,
			)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected raw menu image create to be forbidden, got %d: %s", response.Code, response.Body.String())
			}
			requireNoPersistedMenuImageArtifacts(t, server.app)
		})
	}
}

func performRawMenuImageCreateRequest(
	t *testing.T,
	mux http.Handler,
	authToken string,
	restaurantID string,
	uploaderID string,
) *httptest.ResponseRecorder {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("restaurant", restaurantID); err != nil {
		t.Fatalf("failed to write Restaurant field: %v", err)
	}
	if err := writer.WriteField("uploadedBy", uploaderID); err != nil {
		t.Fatalf("failed to write uploader field: %v", err)
	}
	filePart, err := writer.CreateFormFile("image", "forged-menu.png")
	if err != nil {
		t.Fatalf("failed to create menu image form file: %v", err)
	}
	if _, err := filePart.Write(encodeRawMenuImageFixture(t)); err != nil {
		t.Fatalf("failed to write menu image: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart body: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/collections/menu_images/records", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("Authorization", "Bearer "+authToken)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}

func encodeRawMenuImageFixture(t *testing.T) []byte {
	t.Helper()

	fixture := image.NewRGBA(image.Rect(0, 0, 2, 2))
	fixture.Set(0, 0, color.RGBA{R: 0xff, A: 0xff})
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, fixture); err != nil {
		t.Fatalf("failed to encode menu image fixture: %v", err)
	}
	return encoded.Bytes()
}

func requireNoPersistedMenuImageArtifacts(t *testing.T, app core.App) {
	t.Helper()

	records, err := app.FindRecordsByFilter("menu_images", "", "", 1, 0)
	if err != nil {
		t.Fatalf("failed to list Menu Scan Source Images: %v", err)
	}
	if len(records) != 0 {
		t.Fatalf("expected no Menu Scan Source Image records, found %d", len(records))
	}

	collection, err := app.FindCollectionByNameOrId("menu_images")
	if err != nil {
		t.Fatalf("failed to resolve Menu Scan Source Image collection: %v", err)
	}
	storageDir := filepath.Join(app.DataDir(), "storage", collection.Id)
	entries, err := os.ReadDir(storageDir)
	if err != nil && !os.IsNotExist(err) {
		t.Fatalf("failed to inspect Menu Scan Source Image storage: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected no Menu Scan Source Image files, found %d storage entries", len(entries))
	}
}

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
