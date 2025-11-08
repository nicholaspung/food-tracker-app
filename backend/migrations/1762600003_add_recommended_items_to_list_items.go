package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Add recommendedItems field to list_items collection
		collection, err := app.FindCollectionByNameOrId("list_items")
		if err != nil {
			return err
		}

		// Add recommendedItems field (relation to food_items, multiple select, optional)
		foodItemsCollection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			log.Printf("Warning: Could not find food_items collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "recommendedItems",
				CollectionId:  foodItemsCollection.Id,
				MaxSelect:     100, // Allow multiple recommended items
				Required:      false,
				CascadeDelete: false, // Don't delete list items when food items are deleted
			})
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added recommendedItems field to list_items collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove recommendedItems field
		collection, err := app.FindCollectionByNameOrId("list_items")
		if err != nil {
			return err
		}

		// Remove the field
		collection.Fields.RemoveByName("recommendedItems")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed recommendedItems field from list_items collection")
		return nil
	})
}
