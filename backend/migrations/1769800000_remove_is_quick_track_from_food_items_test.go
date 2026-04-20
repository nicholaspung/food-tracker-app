package migrations

import (
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/testutil"
)

func TestApplyFoodItemsPhase3BCutoverRepairsBlankItemTypesAndRemovesLegacyField(t *testing.T) {
	app := testutil.NewTestApp(t)

	if err := addFoodItemsLegacyQuickTrackField(app); err != nil {
		t.Fatalf("failed to add legacy isQuickTrack field: %v", err)
	}
	if err := updateFoodItemsItemTypeFieldDefinition(app, false); err != nil {
		t.Fatalf("failed to relax itemType requirement: %v", err)
	}
	if err := updateFoodItemsItemTypeRules(app); err != nil {
		t.Fatalf("failed to restore Phase 3A rules: %v", err)
	}

	user := createFoodItemsMigrationTestUser(t, app, "phase3b-up@example.com")
	visit := createFoodItemsMigrationTestVisit(t, app, user.Id)

	blankFoodProduct := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name":         "Trail Mix",
		"rating":       4,
		"user":         user.Id,
		"isQuickTrack": true,
	})
	blankVisitItem := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name":         "Soup Dumplings",
		"rating":       5,
		"user":         user.Id,
		"visit":        visit.Id,
		"isQuickTrack": false,
	})
	conflictingFoodProduct := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name":         "Sparkling Water",
		"rating":       3,
		"user":         user.Id,
		"itemType":     "food-product",
		"isQuickTrack": false,
	})

	if err := updateFoodItemsItemTypeFieldDefinition(app, true); err != nil {
		t.Fatalf("failed to require itemType: %v", err)
	}

	stats, err := applyFoodItemsPhase3BCutover(app)
	if err != nil {
		t.Fatalf("applyFoodItemsPhase3BCutover returned error: %v", err)
	}
	if stats.repairedBlankItemTypeCount != 2 {
		t.Fatalf("expected 2 repaired blank itemType rows, got %d", stats.repairedBlankItemTypeCount)
	}
	if stats.mismatchedLegacyFlagCount != 1 {
		t.Fatalf("expected 1 mismatched legacy flag row, got %d", stats.mismatchedLegacyFlagCount)
	}

	if err := updateFoodItemsItemTypeOnlyRules(app); err != nil {
		t.Fatalf("failed to update itemType-only rules: %v", err)
	}
	if err := removeFoodItemsLegacyQuickTrackField(app); err != nil {
		t.Fatalf("failed to remove legacy isQuickTrack field: %v", err)
	}

	reloadedBlankFoodProduct, err := app.FindRecordById("food_items", blankFoodProduct.Id)
	if err != nil {
		t.Fatalf("failed to reload blank food product: %v", err)
	}
	if reloadedBlankFoodProduct.GetString(foodItemTypeFieldName) != "food-product" {
		t.Fatalf("expected repaired food product itemType=food-product, got %q", reloadedBlankFoodProduct.GetString(foodItemTypeFieldName))
	}

	reloadedBlankVisitItem, err := app.FindRecordById("food_items", blankVisitItem.Id)
	if err != nil {
		t.Fatalf("failed to reload blank visit item: %v", err)
	}
	if reloadedBlankVisitItem.GetString(foodItemTypeFieldName) != "visit-item" {
		t.Fatalf("expected repaired visit item itemType=visit-item, got %q", reloadedBlankVisitItem.GetString(foodItemTypeFieldName))
	}

	reloadedConflictingFoodProduct, err := app.FindRecordById("food_items", conflictingFoodProduct.Id)
	if err != nil {
		t.Fatalf("failed to reload conflicting food product: %v", err)
	}
	if reloadedConflictingFoodProduct.GetString(foodItemTypeFieldName) != "food-product" {
		t.Fatalf("expected conflicting itemType to win, got %q", reloadedConflictingFoodProduct.GetString(foodItemTypeFieldName))
	}

	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		t.Fatalf("failed to resolve food_items collection: %v", err)
	}
	if collection.Fields.GetByName(legacyFoodItemQuickTrackFieldName) != nil {
		t.Fatalf("expected isQuickTrack field to be removed after cutover")
	}

	itemTypeField, ok := collection.Fields.GetByName(foodItemTypeFieldName).(*core.SelectField)
	if !ok {
		t.Fatalf("expected itemType field to be a SelectField")
	}
	if !itemTypeField.Required {
		t.Fatalf("expected itemType to be required after cutover")
	}
	if collection.ListRule == nil || strings.Contains(*collection.ListRule, legacyFoodItemQuickTrackFieldName) {
		t.Fatalf("expected list rule to be itemType-only, got %v", collection.ListRule)
	}
}

func TestFoodItemsPhase3BDownRestoresLegacyFieldFromItemType(t *testing.T) {
	app := testutil.NewTestApp(t)

	user := createFoodItemsMigrationTestUser(t, app, "phase3b-down@example.com")
	visit := createFoodItemsMigrationTestVisit(t, app, user.Id)

	foodProduct := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name":     "Bottled Tea",
		"rating":   4,
		"user":     user.Id,
		"itemType": "food-product",
	})
	visitItem := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name":     "Pork Bun",
		"rating":   5,
		"user":     user.Id,
		"visit":    visit.Id,
		"itemType": "visit-item",
	})

	if err := addFoodItemsLegacyQuickTrackField(app); err != nil {
		t.Fatalf("failed to restore legacy isQuickTrack field: %v", err)
	}
	if err := backfillFoodItemsLegacyQuickTrackFlag(app); err != nil {
		t.Fatalf("failed to backfill legacy isQuickTrack flag: %v", err)
	}
	if err := updateFoodItemsItemTypeFieldDefinition(app, false); err != nil {
		t.Fatalf("failed to relax itemType requirement: %v", err)
	}
	if err := updateFoodItemsItemTypeRules(app); err != nil {
		t.Fatalf("failed to restore Phase 3A rules: %v", err)
	}

	reloadedFoodProduct, err := app.FindRecordById("food_items", foodProduct.Id)
	if err != nil {
		t.Fatalf("failed to reload food product: %v", err)
	}
	if !reloadedFoodProduct.GetBool(legacyFoodItemQuickTrackFieldName) {
		t.Fatalf("expected restored legacy flag to mark food product records")
	}

	reloadedVisitItem, err := app.FindRecordById("food_items", visitItem.Id)
	if err != nil {
		t.Fatalf("failed to reload visit item: %v", err)
	}
	if reloadedVisitItem.GetBool(legacyFoodItemQuickTrackFieldName) {
		t.Fatalf("expected restored legacy flag to leave visit items false")
	}

	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		t.Fatalf("failed to resolve food_items collection: %v", err)
	}
	if collection.Fields.GetByName(legacyFoodItemQuickTrackFieldName) == nil {
		t.Fatalf("expected isQuickTrack field to exist after down migration")
	}

	itemTypeField, ok := collection.Fields.GetByName(foodItemTypeFieldName).(*core.SelectField)
	if !ok {
		t.Fatalf("expected itemType field to be a SelectField")
	}
	if itemTypeField.Required {
		t.Fatalf("expected itemType to be optional after down migration")
	}
	if collection.ListRule == nil || !strings.Contains(*collection.ListRule, legacyFoodItemQuickTrackFieldName) {
		t.Fatalf("expected down-migrated list rule to restore legacy fallback, got %v", collection.ListRule)
	}
}

func createFoodItemsMigrationTestUser(t *testing.T, app core.App, email string) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("email", email)
	record.Set("name", "Migration Test User")
	record.Set("defaultRestaurantVisibility", "friends")
	record.Set("defaultVisitVisibility", "friends")
	record.SetVerified(true)
	record.SetPassword("password123")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create migration test user: %v", err)
	}

	return record
}

func createFoodItemsMigrationTestVisit(t *testing.T, app core.App, userID string) *core.Record {
	t.Helper()

	restaurantCollection, err := app.FindCollectionByNameOrId("restaurants")
	if err != nil {
		t.Fatalf("failed to resolve restaurants collection: %v", err)
	}

	restaurant := core.NewRecord(restaurantCollection)
	restaurant.Set("name", "Migration Test Restaurant")
	restaurant.Set("location", "Oakland, CA")
	restaurant.Set("visibility", "public")
	if err := app.Save(restaurant); err != nil {
		t.Fatalf("failed to create migration test restaurant: %v", err)
	}

	visitCollection, err := app.FindCollectionByNameOrId("visits")
	if err != nil {
		t.Fatalf("failed to resolve visits collection: %v", err)
	}

	visit := core.NewRecord(visitCollection)
	visit.Set("restaurant", restaurant.Id)
	visit.Set("user", userID)
	visit.Set("visitDate", "2026-04-10T18:00:00Z")
	visit.Set("visibility", "friends")
	if err := app.Save(visit); err != nil {
		t.Fatalf("failed to create migration test visit: %v", err)
	}

	return visit
}

func createFoodItemsMigrationTestRecord(t *testing.T, app core.App, data map[string]any) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		t.Fatalf("failed to resolve food_items collection: %v", err)
	}

	record := core.NewRecord(collection)
	for key, value := range data {
		record.Set(key, value)
	}
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create migration test food item: %v", err)
	}

	return record
}
