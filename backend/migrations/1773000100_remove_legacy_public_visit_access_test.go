package migrations

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/testutil"
)

func TestRemoveLegacyPublicVisitAccessBackfillsAndEnforcesAuthenticatedFriendReads(t *testing.T) {
	app := testutil.NewTestApp(t)

	owner := createFoodItemsMigrationTestUser(t, app, "legacy-visit-owner@example.com")
	friend := createFoodItemsMigrationTestUser(t, app, "legacy-visit-friend@example.com")
	stranger := createFoodItemsMigrationTestUser(t, app, "legacy-visit-stranger@example.com")
	visit := createFoodItemsMigrationTestVisit(t, app, owner.Id)
	createLegacyVisitAccessTestFriendship(t, app, owner.Id, friend.Id)

	if _, err := app.DB().NewQuery(`
		UPDATE visits
		SET visibility = 'public'
		WHERE id = {:visitId}
	`).Bind(map[string]any{"visitId": visit.Id}).Execute(); err != nil {
		t.Fatalf("failed to seed legacy public visit: %v", err)
	}

	if err := removeLegacyPublicVisitAccess(app); err != nil {
		t.Fatalf("removeLegacyPublicVisitAccess returned error: %v", err)
	}

	reloaded, err := app.FindRecordById("visits", visit.Id)
	if err != nil {
		t.Fatalf("failed to reload migrated visit: %v", err)
	}
	if reloaded.GetString("visibility") != "friends" {
		t.Fatalf("expected legacy visit visibility=friends, got %q", reloaded.GetString("visibility"))
	}

	collection, err := app.FindCollectionByNameOrId("visits")
	if err != nil {
		t.Fatalf("failed to resolve visits collection: %v", err)
	}
	if collection.ListRule == nil || collection.ViewRule == nil ||
		!strings.Contains(*collection.ListRule, "@request.auth.id != ''") ||
		strings.Contains(*collection.ListRule, "visibility = 'public'") ||
		strings.Contains(*collection.ViewRule, "visibility = 'public'") {
		t.Fatalf("unexpected migrated visit read rules: list=%v view=%v", collection.ListRule, collection.ViewRule)
	}

	mux := createLegacyVisitAccessTestRouter(t, app)
	if response := performLegacyVisitAccessTestView(t, mux, "", visit.Id); response.Code == http.StatusOK {
		t.Fatalf("expected anonymous visit view to be denied, got 200: %s", response.Body.String())
	}
	if response := performLegacyVisitAccessTestView(t, mux, legacyVisitAccessTestToken(t, owner), visit.Id); response.Code != http.StatusOK {
		t.Fatalf("expected owner visit view 200, got %d: %s", response.Code, response.Body.String())
	}
	if response := performLegacyVisitAccessTestView(t, mux, legacyVisitAccessTestToken(t, friend), visit.Id); response.Code != http.StatusOK {
		t.Fatalf("expected accepted friend visit view 200, got %d: %s", response.Code, response.Body.String())
	}
	if response := performLegacyVisitAccessTestView(t, mux, legacyVisitAccessTestToken(t, stranger), visit.Id); response.Code == http.StatusOK {
		t.Fatalf("expected unrelated user visit view to be denied, got 200: %s", response.Body.String())
	}
}

func createLegacyVisitAccessTestFriendship(t *testing.T, app core.App, userID string, friendID string) {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("friendships")
	if err != nil {
		t.Fatalf("failed to resolve friendships collection: %v", err)
	}
	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("friend", friendID)
	record.Set("status", "accepted")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to save friendship: %v", err)
	}
}

func createLegacyVisitAccessTestRouter(t *testing.T, app core.App) http.Handler {
	t.Helper()
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("failed to create PocketBase router: %v", err)
	}
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatalf("failed to build PocketBase router: %v", err)
	}
	return mux
}

func legacyVisitAccessTestToken(t *testing.T, user *core.Record) string {
	t.Helper()
	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create auth token: %v", err)
	}
	return token
}

func performLegacyVisitAccessTestView(t *testing.T, mux http.Handler, token string, visitID string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/api/collections/visits/records/"+visitID, nil)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}
