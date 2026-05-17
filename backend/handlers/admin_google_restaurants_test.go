package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	pbtests "github.com/pocketbase/pocketbase/tests"

	_ "myapp/migrations"
	"myapp/testutil"
)

type adminGoogleRestaurantTestServer struct {
	app *pbtests.TestApp
	mux http.Handler
}

func newAdminGoogleRestaurantTestServer(t *testing.T) *adminGoogleRestaurantTestServer {
	t.Helper()

	app := testutil.NewTestApp(t)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("failed to create router: %v", err)
	}

	serveEvent := &core.ServeEvent{
		App:    app,
		Router: router,
	}
	if err := app.OnServe().Trigger(serveEvent, func(e *core.ServeEvent) error {
		RegisterUserHandlers(e, app)
		return nil
	}); err != nil {
		t.Fatalf("failed to trigger serve: %v", err)
	}

	mux, err := router.BuildMux()
	if err != nil {
		t.Fatalf("failed to build mux: %v", err)
	}

	return &adminGoogleRestaurantTestServer{app: app, mux: mux}
}

func createAdminGoogleRestaurantTestUser(t *testing.T, app core.App, isAdmin bool) (*core.Record, string) {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	user := core.NewRecord(collection)
	user.Set("email", fmt.Sprintf("admin_google_%t_%d@example.com", isAdmin, len(t.Name())))
	user.Set("name", "Admin Google Restaurant Test User")
	user.Set("isAdmin", isAdmin)
	user.Set("defaultRestaurantVisibility", "friends")
	user.Set("defaultVisitVisibility", "friends")
	user.SetVerified(true)
	user.SetPassword("password123")
	if err := app.Save(user); err != nil {
		t.Fatalf("failed to save user: %v", err)
	}

	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create auth token: %v", err)
	}

	return user, token
}

func performAdminGoogleRestaurantRequest(
	t *testing.T,
	mux http.Handler,
	authToken string,
	body string,
) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/admin/restaurants/google-search",
		bytes.NewReader([]byte(body)),
	)
	req.Header.Set("Content-Type", "application/json")
	if authToken != "" {
		req.Header.Set("Authorization", "Bearer "+authToken)
	}

	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, req)
	return recorder
}

func parseAdminGoogleRestaurantResponse(t *testing.T, body []byte) map[string]any {
	t.Helper()

	result := map[string]any{}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatalf("failed to parse response JSON: %v; body=%s", err, string(body))
	}
	return result
}

func TestAdminGoogleRestaurantSearchRequiresAdmin(t *testing.T) {
	server := newAdminGoogleRestaurantTestServer(t)
	_, userToken := createAdminGoogleRestaurantTestUser(t, server.app, false)

	response := performAdminGoogleRestaurantRequest(
		t,
		server.mux,
		userToken,
		`{"query":"Tacos","locationText":"San Diego"}`,
	)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected non-admin 403, got %d: %s", response.Code, response.Body.String())
	}
}

func TestAdminGoogleRestaurantSearchCachesReturnedPlaces(t *testing.T) {
	server := newAdminGoogleRestaurantTestServer(t)
	_, adminToken := createAdminGoogleRestaurantTestUser(t, server.app, true)
	t.Setenv("GOOGLE_PLACES_API_KEY", "test-key")

	originalSearch := searchGooglePlacesByText
	searchGooglePlacesByText = func(
		_ context.Context,
		_ *core.Record,
		_ string,
		input googlePlacesTextSearchInput,
	) (googlePlacesTextSearchOutput, error) {
		if input.Query != "Cafe Dulce" {
			t.Fatalf("expected query Cafe Dulce, got %q", input.Query)
		}
		return googlePlacesTextSearchOutput{
			Places: []placeResult{{
				PlaceID:  "google-cafe-dulce",
				Name:     "Cafe Dulce",
				Vicinity: "134 Japanese Village Plaza Mall, Los Angeles, CA",
				Types:    []string{"cafe"},
				Geometry: placeGeometry{
					Location: placeLocation{Lat: 34.0498, Lng: -118.2402},
				},
			}},
			ResolvedLocation: &placeLocation{Lat: 34.05, Lng: -118.24},
		}, nil
	}
	t.Cleanup(func() {
		searchGooglePlacesByText = originalSearch
	})

	response := performAdminGoogleRestaurantRequest(
		t,
		server.mux,
		adminToken,
		`{"query":"Cafe Dulce","locationText":"Los Angeles, CA"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := parseAdminGoogleRestaurantResponse(t, response.Body.Bytes())
	items, ok := body["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one item, got %#v", body["items"])
	}

	item, ok := items[0].(map[string]any)
	if !ok {
		t.Fatalf("expected item map, got %#v", items[0])
	}
	if item["placeId"] != "google-cafe-dulce" || item["isGooglePlace"] != true {
		t.Fatalf("expected cached google restaurant payload, got %#v", item)
	}

	records, err := server.app.FindRecordsByFilter(
		"restaurants",
		"placeId = {:placeId}",
		"",
		10,
		0,
		map[string]any{"placeId": "google-cafe-dulce"},
	)
	if err != nil {
		t.Fatalf("failed to query cached restaurant: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected one cached restaurant, got %d", len(records))
	}
	if records[0].GetString("visibility") != "public" || records[0].GetString("createdBy") != "" {
		t.Fatalf("expected public unowned cached restaurant, got visibility=%q createdBy=%q", records[0].GetString("visibility"), records[0].GetString("createdBy"))
	}
}

func TestAdminGoogleRestaurantSearchReusesExistingCachedRestaurant(t *testing.T) {
	server := newAdminGoogleRestaurantTestServer(t)
	_, adminToken := createAdminGoogleRestaurantTestUser(t, server.app, true)
	t.Setenv("GOOGLE_PLACES_API_KEY", "test-key")

	existing := createPlacesTestRestaurant(t, server.app, placeResult{
		PlaceID:  "google-existing-place",
		Name:     "Existing Place",
		Vicinity: "Los Angeles, CA",
		Types:    []string{"restaurant"},
		Geometry: placeGeometry{
			Location: placeLocation{Lat: 34.05, Lng: -118.24},
		},
	}, timeNowUTCForAdminGoogleRestaurantTest())

	originalSearch := searchGooglePlacesByText
	searchGooglePlacesByText = func(
		_ context.Context,
		_ *core.Record,
		_ string,
		_ googlePlacesTextSearchInput,
	) (googlePlacesTextSearchOutput, error) {
		return googlePlacesTextSearchOutput{
			Places: []placeResult{{
				PlaceID:  "google-existing-place",
				Name:     "Existing Place",
				Vicinity: "Los Angeles, CA",
				Types:    []string{"restaurant"},
				Geometry: placeGeometry{
					Location: placeLocation{Lat: 34.05, Lng: -118.24},
				},
			}},
		}, nil
	}
	t.Cleanup(func() {
		searchGooglePlacesByText = originalSearch
	})

	response := performAdminGoogleRestaurantRequest(
		t,
		server.mux,
		adminToken,
		`{"query":"Existing Place"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := parseAdminGoogleRestaurantResponse(t, response.Body.Bytes())
	items := body["items"].([]any)
	item := items[0].(map[string]any)
	if item["id"] != existing.Id {
		t.Fatalf("expected existing cached restaurant id %s, got %#v", existing.Id, item["id"])
	}

	records, err := server.app.FindRecordsByFilter("restaurants", "placeId = {:placeId}", "", 10, 0, map[string]any{"placeId": "google-existing-place"})
	if err != nil {
		t.Fatalf("failed to query restaurants: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected one cached restaurant, got %d", len(records))
	}
}

func TestAdminGoogleRestaurantSearchPrefersLocationTextBias(t *testing.T) {
	server := newAdminGoogleRestaurantTestServer(t)
	_, adminToken := createAdminGoogleRestaurantTestUser(t, server.app, true)
	t.Setenv("GOOGLE_PLACES_API_KEY", "test-key")

	originalSearch := searchGooglePlacesByText
	searchGooglePlacesByText = func(
		_ context.Context,
		_ *core.Record,
		_ string,
		input googlePlacesTextSearchInput,
	) (googlePlacesTextSearchOutput, error) {
		if input.Latitude != nil || input.Longitude != nil {
			t.Fatalf("expected location text bias to clear coordinates, got %v,%v", input.Latitude, input.Longitude)
		}
		if input.LocationText != "This should not be geocoded first" {
			t.Fatalf("expected location text bias, got %q", input.LocationText)
		}
		return googlePlacesTextSearchOutput{}, nil
	}
	t.Cleanup(func() {
		searchGooglePlacesByText = originalSearch
	})

	response := performAdminGoogleRestaurantRequest(
		t,
		server.mux,
		adminToken,
		`{"query":"Snack Bar","locationText":"This should not be geocoded first","latitude":34.0501,"longitude":-118.2501}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
}

func timeNowUTCForAdminGoogleRestaurantTest() time.Time {
	return time.Now().UTC()
}
