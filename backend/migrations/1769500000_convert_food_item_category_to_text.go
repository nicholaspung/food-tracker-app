package migrations

import (
	"log"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const foodItemCategoryMaxLength = 80

func init() {
	m.Register(func(app core.App) error {
		if err := updateFoodItemCategoryFieldToText(app); err != nil {
			return err
		}

		if err := backfillFoodProductCategoriesToReadableText(app); err != nil {
			return err
		}

		log.Println("✓ Converted food_items.itemCategory to freeform text and backfilled legacy quick-track categories")
		return nil
	}, func(app core.App) error {
		if err := backfillFoodProductCategoriesToLegacyValues(app); err != nil {
			return err
		}

		if err := restoreFoodItemCategoryFieldToSelect(app); err != nil {
			return err
		}

		log.Println("✓ Restored food_items.itemCategory to legacy select values")
		return nil
	})
}

func updateFoodItemCategoryFieldToText(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		return err
	}

	if existingField := collection.Fields.GetByName("itemCategory"); existingField != nil {
		collection.Fields.RemoveByName("itemCategory")
	}

	collection.Fields.Add(&core.TextField{
		Name:     "itemCategory",
		Required: false,
		Max:      foodItemCategoryMaxLength,
	})

	return app.Save(collection)
}

func restoreFoodItemCategoryFieldToSelect(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		return err
	}

	if existingField := collection.Fields.GetByName("itemCategory"); existingField != nil {
		collection.Fields.RemoveByName("itemCategory")
	}

	collection.Fields.Add(&core.SelectField{
		Name:      "itemCategory",
		Required:  false,
		MaxSelect: 1,
		Values: []string{
			"restaurant",
			"convenience_store",
			"packaged_food",
			"homemade",
			"recipe",
			"other",
		},
	})

	return app.Save(collection)
}

func backfillFoodProductCategoriesToReadableText(app core.App) error {
	return rewriteFoodProductCategories(app, mapLegacyFoodProductCategoryToReadable)
}

func backfillFoodProductCategoriesToLegacyValues(app core.App) error {
	return rewriteFoodProductCategories(app, mapReadableFoodProductCategoryToLegacy)
}

func rewriteFoodProductCategories(
	app core.App,
	mapper func(string) string,
) error {
	records, err := app.FindRecordsByFilter(
		"food_items",
		"isQuickTrack = true",
		"-updated",
		500,
		0,
	)
	if err != nil {
		return err
	}

	updatedCount := 0
	for _, record := range records {
		currentValue := strings.TrimSpace(record.GetString("itemCategory"))
		nextValue := mapper(currentValue)
		if currentValue == nextValue {
			continue
		}

		record.Set("itemCategory", nextValue)
		if err := app.Save(record); err != nil {
			return err
		}
		updatedCount++
	}

	log.Printf("✓ Backfilled %d quick-track item categories", updatedCount)
	return nil
}

func mapLegacyFoodProductCategoryToReadable(value string) string {
	switch strings.TrimSpace(value) {
	case "convenience_store":
		return "Convenience store"
	case "packaged_food":
		return "Packaged food"
	case "homemade":
		return "Homemade"
	case "recipe":
		return "Recipe"
	case "other":
		return "Other"
	case "restaurant":
		return "Restaurant"
	default:
		return strings.TrimSpace(value)
	}
}

func mapReadableFoodProductCategoryToLegacy(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "convenience store":
		return "convenience_store"
	case "packaged food":
		return "packaged_food"
	case "homemade":
		return "homemade"
	case "recipe":
		return "recipe"
	case "other":
		return "other"
	case "restaurant":
		return "restaurant"
	case "":
		return ""
	default:
		return "other"
	}
}
