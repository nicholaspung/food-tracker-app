package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Get food_items collection
		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		// Add itemDate field (date when item was consumed/tracked)
		collection.Fields.Add(&core.DateField{
			Name:     "itemDate",
			Required: false, // Optional for backward compatibility with existing items
		})

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added itemDate field to food_items collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove itemDate field
		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		// Remove itemDate field
		collection.Fields.RemoveByName("itemDate")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed itemDate field from food_items collection")
		return nil
	})
}
