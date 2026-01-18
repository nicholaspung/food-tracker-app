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

		// Add userFoodItem field (single relation to food_items)
		// This links to the user's own food item after they visit and rate the bookmarked item
		// Allows displaying both the friend's rating (foodItem) and user's rating (userFoodItem)
		foodItemsCollection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			log.Printf("Warning: Could not find food_items collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "userFoodItem",
				CollectionId:  foodItemsCollection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false,
			})
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added userFoodItem field to list_items")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("list_items")
		if err != nil {
			return err
		}

		// Remove userFoodItem field
		userFoodItemField := collection.Fields.GetByName("userFoodItem")
		if userFoodItemField != nil {
			collection.Fields.RemoveById(userFoodItemField.GetId())
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed userFoodItem field from list_items")
		return nil
	})
}
