package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Get the users collection
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		// Add isSubscriber field (boolean, defaults to false)
		collection.Fields.Add(&core.BoolField{
			Name:     "isSubscriber",
			Required: false,
		})

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added isSubscriber field to users collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove isSubscriber field
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		// Remove the isSubscriber field
		for i, field := range collection.Fields {
			if field.GetName() == "isSubscriber" {
				collection.Fields = append(collection.Fields[:i], collection.Fields[i+1:]...)
				break
			}
		}

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed isSubscriber field from users collection")
		return nil
	})
}
