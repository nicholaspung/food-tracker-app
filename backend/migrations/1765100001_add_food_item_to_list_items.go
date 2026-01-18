package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("list_items")
		if err != nil {
			return err
		}

		// Add foodItem field (single relation to food_items)
		// This is the specific food item being bookmarked
		foodItemsCollection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			log.Printf("Warning: Could not find food_items collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "foodItem",
				CollectionId:  foodItemsCollection.Id,
				MaxSelect:     1,
				Required:      false, // Optional for backwards compatibility
				CascadeDelete: false,
			})
		}

		// Update unique index to be on (list, foodItem)
		// This prevents bookmarking the same food item twice in the same list
		// Keep restaurant for display grouping purposes
		collection.Indexes = []string{
			"CREATE UNIQUE INDEX idx_list_food_item ON list_items (list, foodItem) WHERE foodItem IS NOT NULL",
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added foodItem field to list_items and updated unique index")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("list_items")
		if err != nil {
			return err
		}

		// Remove foodItem field
		foodItemField := collection.Fields.GetByName("foodItem")
		if foodItemField != nil {
			collection.Fields.RemoveById(foodItemField.GetId())
		}

		// Restore previous unique index
		collection.Indexes = []string{
			"CREATE UNIQUE INDEX idx_list_restaurant_source ON list_items (list, restaurant, COALESCE(sourceUser, ''))",
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed foodItem field from list_items and restored previous unique index")
		return nil
	})
}
