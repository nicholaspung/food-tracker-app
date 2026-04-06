package hooks

import (
	"fmt"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	_ "myapp/migrations"
	"myapp/testutil"
)

func newRestaurantListCountTestApp(t *testing.T) core.App {
	t.Helper()

	app := testutil.NewTestApp(t)
	RegisterRestaurantListCountHooks(app)
	return app
}

func createRestaurantListCountUser(t *testing.T, app core.App) *core.Record {
	t.Helper()

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	user := core.NewRecord(usersCollection)
	user.Set("email", fmt.Sprintf("restaurant_list_counts_%d@example.com", time.Now().UnixNano()))
	user.Set("name", "Restaurant List Count User")
	user.Set("defaultRestaurantVisibility", "friends")
	user.Set("defaultVisitVisibility", "friends")
	user.SetVerified(true)
	user.SetPassword("password123")

	if err := app.Save(user); err != nil {
		t.Fatalf("failed to save test user: %v", err)
	}

	return user
}

func createRestaurantListCountRecord(t *testing.T, app core.App, collectionName string, data map[string]any) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		t.Fatalf("failed to resolve %s collection: %v", collectionName, err)
	}

	record := core.NewRecord(collection)
	for key, value := range data {
		record.Set(key, value)
	}

	if err := app.Save(record); err != nil {
		t.Fatalf("failed to save %s record: %v", collectionName, err)
	}

	return record
}

func requireRestaurantListCounts(t *testing.T, app core.App, listID string, restaurantCount float64, menuItemCount float64) {
	t.Helper()

	record, err := app.FindRecordById("restaurant_lists", listID)
	if err != nil {
		t.Fatalf("failed to reload restaurant list %s: %v", listID, err)
	}

	if actual := record.GetFloat("restaurantCount"); actual != restaurantCount {
		t.Fatalf("expected restaurantCount %.0f, got %.0f", restaurantCount, actual)
	}

	if actual := record.GetFloat("menuItemCount"); actual != menuItemCount {
		t.Fatalf("expected menuItemCount %.0f, got %.0f", menuItemCount, actual)
	}
}

func TestRestaurantListCountHooksTrackCreateUpdateAndDelete(t *testing.T) {
	app := newRestaurantListCountTestApp(t)
	user := createRestaurantListCountUser(t, app)

	listA := createRestaurantListCountRecord(t, app, "restaurant_lists", map[string]any{
		"name":       "List A",
		"user":       user.Id,
		"visibility": "private",
	})
	listB := createRestaurantListCountRecord(t, app, "restaurant_lists", map[string]any{
		"name":       "List B",
		"user":       user.Id,
		"visibility": "private",
	})
	restaurantA := createRestaurantListCountRecord(t, app, "restaurants", map[string]any{
		"name":       "Restaurant A",
		"location":   "San Francisco, CA",
		"user":       user.Id,
		"visibility": "friends",
	})

	item := createRestaurantListCountRecord(t, app, "list_items", map[string]any{
		"list":       listA.Id,
		"restaurant": restaurantA.Id,
		"addedBy":    user.Id,
		"position":   1,
	})
	requireRestaurantListCounts(t, app, listA.Id, 1, 1)
	requireRestaurantListCounts(t, app, listB.Id, 0, 0)

	item.Set("list", listB.Id)
	if err := app.Save(item); err != nil {
		t.Fatalf("failed to move list item to another list: %v", err)
	}
	requireRestaurantListCounts(t, app, listA.Id, 0, 0)
	requireRestaurantListCounts(t, app, listB.Id, 1, 1)

	if err := app.Delete(item); err != nil {
		t.Fatalf("failed to delete list item: %v", err)
	}
	requireRestaurantListCounts(t, app, listB.Id, 0, 0)
}
