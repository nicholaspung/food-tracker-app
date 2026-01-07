package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Get restaurant_lists collection
		collection, err := app.FindCollectionByNameOrId("restaurant_lists")
		if err != nil {
			return err
		}

		// Add isDefault field (boolean) to mark the auto-created "Saved" list
		collection.Fields.Add(&core.BoolField{
			Name:     "isDefault",
			Required: false,
		})

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Added isDefault field to restaurant_lists collection")
		return nil
	}, func(app core.App) error {
		// Down migration - revert changes
		collection, err := app.FindCollectionByNameOrId("restaurant_lists")
		if err != nil {
			return err
		}

		// Remove new field
		collection.Fields.RemoveByName("isDefault")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Removed isDefault field from restaurant_lists")
		return nil
	})
}
