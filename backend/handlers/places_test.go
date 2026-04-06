package handlers

import (
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	_ "myapp/migrations"
	"myapp/testutil"
)

func TestSyncGooglePlaceRestaurantsUpsertsAndReusesFreshRecords(t *testing.T) {
	app := testutil.NewTestApp(t)

	user := createPlacesTestUser(t, app)
	existing := createPlacesTestRestaurant(t, app, user.Id, placeResult{
		PlaceID:  "google-fresh-place",
		Name:     "Fresh Place",
		Vicinity: "Seattle, WA",
		Types:    []string{"coffee_shop"},
		Geometry: placeGeometry{
			Location: placeLocation{Lat: 47.6062, Lng: -122.3321},
		},
	}, time.Now().UTC())

	results, err := syncGooglePlaceRestaurants(app, user, []placeResult{
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

	if results[1].Name != "New Place" {
		t.Fatalf("expected second result to be the new place, got %q", results[1].Name)
	}

	if results[1].PlaceID != "google-new-place" {
		t.Fatalf("expected new placeId google-new-place, got %q", results[1].PlaceID)
	}

	records, err := app.FindRecordsByFilter(
		"restaurants",
		"createdBy = {:userId}",
		"",
		10,
		0,
		dbx.Params{"userId": user.Id},
	)
	if err != nil {
		t.Fatalf("failed to query restaurants: %v", err)
	}

	if len(records) != 2 {
		t.Fatalf("expected exactly 2 restaurants after sync, got %d", len(records))
	}
}

func createPlacesTestUser(t *testing.T, app core.App) *core.Record {
	t.Helper()

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	user := core.NewRecord(usersCollection)
	user.Set("email", "places-test@example.com")
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
	userID string,
	place placeResult,
	cachedAt time.Time,
) *core.Record {
	t.Helper()

	restaurantsCollection, err := app.FindCollectionByNameOrId("restaurants")
	if err != nil {
		t.Fatalf("failed to resolve restaurants collection: %v", err)
	}

	record := core.NewRecord(restaurantsCollection)
	applyGooglePlaceToRestaurantRecord(record, userID, place, cachedAt)
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to save test restaurant: %v", err)
	}

	return record
}
