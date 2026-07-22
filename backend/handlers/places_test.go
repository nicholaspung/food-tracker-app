package handlers

import (
	"context"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	_ "myapp/migrations"
	"myapp/testutil"
)

func TestNewPlacesAPIClientInitializesWithAPIKey(t *testing.T) {
	client, err := newPlacesAPIClient(context.Background(), "test-key")
	if err != nil {
		t.Fatalf("expected newPlacesAPIClient to initialize, got %v", err)
	}
	if err := client.Close(); err != nil {
		t.Fatalf("expected close to succeed, got %v", err)
	}
}

func TestSyncGooglePlaceRestaurantsReusesCanonicalRecordsAcrossUsers(t *testing.T) {
	app := testutil.NewTestApp(t)

	owner := createPlacesTestUser(t, app, "places-owner@example.com")
	searcher := createPlacesTestUser(t, app, "places-searcher@example.com")
	existing := createPlacesTestRestaurant(t, app, placeResult{
		PlaceID:  "google-fresh-place",
		Name:     "Fresh Place",
		Vicinity: "Seattle, WA",
		Types:    []string{"coffee_shop"},
		Geometry: placeGeometry{
			Location: placeLocation{Lat: 47.6062, Lng: -122.3321},
		},
	}, time.Now().UTC())
	existing.Set("createdBy", owner.Id)
	if err := app.Save(existing); err != nil {
		t.Fatalf("failed to persist legacy owner-bound google place: %v", err)
	}
	createPlacesTestVisit(t, app, existing.Id, searcher.Id)

	results, err := syncGooglePlaceRestaurants(app, searcher, []placeResult{
		{
			PlaceID:  "google-fresh-place",
			Name:     "Fresh Place",
			Vicinity: "Seattle, WA",
			Types:    []string{"coffee_shop"},
			Geometry: placeGeometry{
				Location: placeLocation{Lat: 47.6062, Lng: -122.3321},
			},
		},
		{
			PlaceID:  "google-new-place",
			Name:     "New Place",
			Vicinity: "Portland, OR",
			Types:    []string{"thai_restaurant"},
			Geometry: placeGeometry{
				Location: placeLocation{Lat: 45.5152, Lng: -122.6784},
			},
		},
	})
	if err != nil {
		t.Fatalf("syncGooglePlaceRestaurants returned error: %v", err)
	}

	if len(results) != 2 {
		t.Fatalf("expected 2 restaurants, got %d", len(results))
	}

	if results[0].ID != existing.Id {
		t.Fatalf("expected existing record id %s, got %s", existing.Id, results[0].ID)
	}

	if results[0].CuisineType != "Coffee Shop" {
		t.Fatalf("expected existing cuisine type to remain Coffee Shop, got %q", results[0].CuisineType)
	}
	if results[0].IsGooglePlace != true {
		t.Fatalf("expected existing record to remain a google place")
	}
	if results[0].UserVisitCount != 1 {
		t.Fatalf("expected existing google place to include user visit stats, got %#v", results[0])
	}

	if results[1].Name != "New Place" {
		t.Fatalf("expected second result to be the new place, got %q", results[1].Name)
	}

	if results[1].PlaceID != "google-new-place" {
		t.Fatalf("expected new placeId google-new-place, got %q", results[1].PlaceID)
	}

	records, err := app.FindRecordsByFilter("restaurants", "isGooglePlace = true", "", 10, 0, nil)
	if err != nil {
		t.Fatalf("failed to query restaurants: %v", err)
	}

	if len(records) != 2 {
		t.Fatalf("expected exactly 2 restaurants after sync, got %d", len(records))
	}

	reloadedExisting, err := app.FindRecordById("restaurants", existing.Id)
	if err != nil {
		t.Fatalf("failed to reload canonical restaurant: %v", err)
	}
	if reloadedExisting.GetString("createdBy") != "" {
		t.Fatalf("expected canonical google place to be unowned, got createdBy=%q", reloadedExisting.GetString("createdBy"))
	}
}

func TestSyncGooglePlaceRestaurantsHealsLegacyPublicPlaceIDCollision(t *testing.T) {
	app := testutil.NewTestApp(t)
	searcher := createPlacesTestUser(t, app, "places-collision-searcher@example.com")

	collection, err := app.FindCollectionByNameOrId("restaurants")
	if err != nil {
		t.Fatalf("failed to resolve restaurants collection: %v", err)
	}
	legacy := core.NewRecord(collection)
	legacy.Set("name", "Poisoned Name")
	legacy.Set("location", "Fake City")
	legacy.Set("placeId", "LEGACY-COLLISION-PLACE")
	legacy.Set("isGooglePlace", false)
	legacy.Set("createdBy", searcher.Id)
	legacy.Set("visibility", "public")
	if err := app.Save(legacy); err != nil {
		t.Fatalf("failed to save legacy public collision: %v", err)
	}

	results, err := syncGooglePlaceRestaurants(app, searcher, []placeResult{{
		PlaceID:  "legacy-collision-place",
		Name:     "Verified Restaurant",
		Vicinity: "Verified City",
		Types:    []string{"thai_restaurant"},
		Geometry: placeGeometry{Location: placeLocation{Lat: 34.0522, Lng: -118.2437}},
	}})
	if err != nil {
		t.Fatalf("syncGooglePlaceRestaurants returned error: %v", err)
	}
	if len(results) != 1 || results[0].ID != legacy.Id {
		t.Fatalf("expected legacy collision to converge on record %q, got %#v", legacy.Id, results)
	}

	reloaded, err := app.FindRecordById("restaurants", legacy.Id)
	if err != nil {
		t.Fatalf("failed to reload healed collision: %v", err)
	}
	if reloaded.GetString("name") != "Verified Restaurant" ||
		reloaded.GetString("location") != "Verified City" ||
		reloaded.GetString("cuisineType") != "Thai" ||
		!reloaded.GetBool("isGooglePlace") ||
		reloaded.GetString("createdBy") != "" ||
		reloaded.GetString("visibility") != "public" {
		t.Fatalf("expected provider metadata to replace legacy collision, got %#v", reloaded)
	}
}

func createPlacesTestVisit(t *testing.T, app core.App, restaurantID string, userID string) *core.Record {
	t.Helper()

	visitsCollection, err := app.FindCollectionByNameOrId("visits")
	if err != nil {
		t.Fatalf("failed to resolve visits collection: %v", err)
	}

	record := core.NewRecord(visitsCollection)
	record.Set("restaurant", restaurantID)
	record.Set("user", userID)
	record.Set("visitDate", "2026-04-01 18:30:00.000Z")
	record.Set("visibility", "friends")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to save test visit: %v", err)
	}

	return record
}

func createPlacesTestUser(t *testing.T, app core.App, email string) *core.Record {
	t.Helper()

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	user := core.NewRecord(usersCollection)
	user.Set("email", email)
	user.Set("name", "Places Test User")
	user.Set("defaultRestaurantVisibility", "friends")
	user.Set("defaultVisitVisibility", "friends")
	user.SetVerified(true)
	user.SetPassword("password123")
	if err := app.Save(user); err != nil {
		t.Fatalf("failed to save test user: %v", err)
	}

	return user
}

func createPlacesTestRestaurant(
	t *testing.T,
	app core.App,
	place placeResult,
	cachedAt time.Time,
) *core.Record {
	t.Helper()

	restaurantsCollection, err := app.FindCollectionByNameOrId("restaurants")
	if err != nil {
		t.Fatalf("failed to resolve restaurants collection: %v", err)
	}

	record := core.NewRecord(restaurantsCollection)
	applyGooglePlaceToRestaurantRecord(record, place, cachedAt)
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to save test restaurant: %v", err)
	}

	return record
}
