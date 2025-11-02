package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		// Add defaultRestaurantVisibility field (select, default: private)
		// Options: private, friends, public
		collection.Fields.Add(&core.SelectField{
			Name:      "defaultRestaurantVisibility",
			Required:  true,
			Values:    []string{"private", "friends", "public"},
			MaxSelect: 1,
		})

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added defaultRestaurantVisibility field to users collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove the field
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		// Remove the field
		collection.Fields.RemoveById("defaultRestaurantVisibility")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed defaultRestaurantVisibility field from users collection")
		return nil
	})
}
