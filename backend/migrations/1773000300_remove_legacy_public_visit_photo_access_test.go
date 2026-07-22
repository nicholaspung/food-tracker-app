package migrations

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"myapp/testutil"
)

func TestVisitPhotoRuleRejectsLegacyPublicParentAndRequiresAcceptedFriends(t *testing.T) {
	app := testutil.NewTestApp(t)

	owner := createFoodItemsMigrationTestUser(t, app, "legacy-photo-owner@example.com")
	friend := createFoodItemsMigrationTestUser(t, app, "legacy-photo-friend@example.com")
	pendingUser := createFoodItemsMigrationTestUser(t, app, "legacy-photo-pending@example.com")
	blockedUser := createFoodItemsMigrationTestUser(t, app, "legacy-photo-blocked@example.com")
	stranger := createFoodItemsMigrationTestUser(t, app, "legacy-photo-stranger@example.com")
	visit := createFoodItemsMigrationTestVisit(t, app, owner.Id)
	createFoodItemAccessTestFriendship(t, app, owner.Id, friend.Id, "accepted")
	createFoodItemAccessTestFriendship(t, app, owner.Id, pendingUser.Id, "pending")
	createFoodItemAccessTestFriendship(t, app, owner.Id, blockedUser.Id, "blocked")
	foodItem := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name":     "Legacy Photo Dish",
		"rating":   4,
		"user":     owner.Id,
		"visit":    visit.Id,
		"itemType": "visit-item",
	})
	photoID := insertLegacyVisitPhotoAccessTestRow(t, app, owner.Id, visit.Id, foodItem.Id)
	uploadLegacyVisitPhotoAccessTestFile(t, app, photoID)

	if _, err := app.DB().NewQuery(`
		UPDATE visits
		SET visibility = 'public'
		WHERE id = {:visitId}
	`).Bind(map[string]any{"visitId": visit.Id}).Execute(); err != nil {
		t.Fatalf("failed to seed legacy public parent visit: %v", err)
	}
	finalRule := buildVisitPhotoReadRule(false)
	if err := setVisitPhotoAccess(app, finalRule, true); err != nil {
		t.Fatalf("failed to install visit photo read rule: %v", err)
	}
	if strings.Contains(finalRule, "visit.visibility = 'public'") {
		t.Fatalf("legacy public visit branch remains in final rule: %s", finalRule)
	}
	collection, err := app.FindCollectionByNameOrId("visit_photos")
	if err != nil {
		t.Fatalf("failed to reload visit photos collection: %v", err)
	}
	photoField, ok := collection.Fields.GetByName("photo").(*core.FileField)
	if !ok || !photoField.Protected {
		t.Fatal("expected visit photo files to require collection view authorization")
	}

	mux := createLegacyVisitAccessTestRouter(t, app)
	assertLegacyVisitPhotoViewDenied(t, mux, "", photoID, "anonymous")
	assertLegacyVisitPhotoViewDenied(t, mux, legacyVisitAccessTestToken(t, stranger), photoID, "stale-public stranger")
	assertLegacyVisitPhotoViewAllowed(t, mux, legacyVisitAccessTestToken(t, owner), photoID, "owner")
	assertLegacyVisitPhotoFileDenied(t, mux, "", photoID, "anonymous")
	assertLegacyVisitPhotoFileDenied(t, mux, legacyVisitPhotoFileToken(t, stranger), photoID, "stale-public stranger")
	assertLegacyVisitPhotoFileAllowed(t, mux, legacyVisitPhotoFileToken(t, owner), photoID, "owner")

	if _, err := app.DB().NewQuery(`
		UPDATE visits
		SET visibility = 'friends'
		WHERE id = {:visitId}
	`).Bind(map[string]any{"visitId": visit.Id}).Execute(); err != nil {
		t.Fatalf("failed to restore supported parent visibility: %v", err)
	}
	assertLegacyVisitPhotoViewAllowed(t, mux, legacyVisitAccessTestToken(t, friend), photoID, "accepted friend")
	assertLegacyVisitPhotoViewDenied(t, mux, legacyVisitAccessTestToken(t, pendingUser), photoID, "pending relationship")
	assertLegacyVisitPhotoViewDenied(t, mux, legacyVisitAccessTestToken(t, blockedUser), photoID, "blocked relationship")
	assertLegacyVisitPhotoViewDenied(t, mux, legacyVisitAccessTestToken(t, stranger), photoID, "friends-visible stranger")
	assertLegacyVisitPhotoFileAllowed(t, mux, legacyVisitPhotoFileToken(t, friend), photoID, "accepted friend")
	assertLegacyVisitPhotoFileDenied(t, mux, legacyVisitPhotoFileToken(t, pendingUser), photoID, "pending relationship")
	assertLegacyVisitPhotoFileDenied(t, mux, legacyVisitPhotoFileToken(t, blockedUser), photoID, "blocked relationship")
	assertLegacyVisitPhotoFileDenied(t, mux, legacyVisitPhotoFileToken(t, stranger), photoID, "friends-visible stranger")
}

func uploadLegacyVisitPhotoAccessTestFile(t *testing.T, app core.App, photoID string) {
	t.Helper()
	record, err := app.FindRecordById("visit_photos", photoID)
	if err != nil {
		t.Fatalf("failed to load visit photo row: %v", err)
	}
	fsys, err := app.NewFilesystem()
	if err != nil {
		t.Fatalf("failed to create visit photo test filesystem: %v", err)
	}
	defer fsys.Close()
	if err := fsys.Upload([]byte("protected visit photo"), record.BaseFilesPath()+"/test-photo.jpg"); err != nil {
		t.Fatalf("failed to upload visit photo test file: %v", err)
	}
}

func insertLegacyVisitPhotoAccessTestRow(t *testing.T, app core.App, userID string, visitID string, foodItemID string) string {
	t.Helper()
	recordID := fmt.Sprintf("vp_%d", time.Now().UnixNano())
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := app.DB().NewQuery(`
		INSERT INTO visit_photos (id, photo, caption, visit, food_item, user, created, updated)
		VALUES ({:id}, 'test-photo.jpg', '', {:visit}, {:foodItem}, {:user}, {:created}, {:updated})
	`).Bind(dbx.Params{
		"id":       recordID,
		"visit":    visitID,
		"foodItem": foodItemID,
		"user":     userID,
		"created":  now,
		"updated":  now,
	}).Execute(); err != nil {
		t.Fatalf("failed to insert visit photo row: %v", err)
	}
	return recordID
}

func assertLegacyVisitPhotoViewDenied(t *testing.T, mux http.Handler, token string, photoID string, actor string) {
	t.Helper()
	response := performLegacyVisitPhotoView(t, mux, token, photoID)
	if response.Code == http.StatusOK {
		t.Fatalf("expected %s visit photo view to be denied, got 200: %s", actor, response.Body.String())
	}
}

func assertLegacyVisitPhotoViewAllowed(t *testing.T, mux http.Handler, token string, photoID string, actor string) {
	t.Helper()
	response := performLegacyVisitPhotoView(t, mux, token, photoID)
	if response.Code != http.StatusOK {
		t.Fatalf("expected %s visit photo view 200, got %d: %s", actor, response.Code, response.Body.String())
	}
}

func performLegacyVisitPhotoView(t *testing.T, mux http.Handler, token string, photoID string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/api/collections/visit_photos/records/"+photoID, nil)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}

func legacyVisitPhotoFileToken(t *testing.T, user *core.Record) string {
	t.Helper()
	token, err := user.NewFileToken()
	if err != nil {
		t.Fatalf("failed to create visit photo file token: %v", err)
	}
	return token
}

func assertLegacyVisitPhotoFileDenied(t *testing.T, mux http.Handler, token string, photoID string, actor string) {
	t.Helper()
	response := performLegacyVisitPhotoFileDownload(t, mux, token, photoID)
	if response.Code == http.StatusOK {
		t.Fatalf("expected %s visit photo file download to be denied, got 200", actor)
	}
}

func assertLegacyVisitPhotoFileAllowed(t *testing.T, mux http.Handler, token string, photoID string, actor string) {
	t.Helper()
	response := performLegacyVisitPhotoFileDownload(t, mux, token, photoID)
	if response.Code != http.StatusOK {
		t.Fatalf("expected %s visit photo file download 200, got %d: %s", actor, response.Code, response.Body.String())
	}
	if response.Body.String() != "protected visit photo" {
		t.Fatalf("expected %s visit photo file content, got %q", actor, response.Body.String())
	}
}

func performLegacyVisitPhotoFileDownload(t *testing.T, mux http.Handler, token string, photoID string) *httptest.ResponseRecorder {
	t.Helper()
	url := "/api/files/visit_photos/" + photoID + "/test-photo.jpg"
	if token != "" {
		url += "?token=" + token
	}
	request := httptest.NewRequest(http.MethodGet, url, nil)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}
