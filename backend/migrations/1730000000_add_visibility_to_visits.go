package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			return err
		}

		// Add visibility field (select, default: friends)
		// Options: public, friends, private
		collection.Fields.Add(&core.SelectField{
			Name:     "visibility",
			Required: true,
			Values:   []string{"public", "friends", "private"},
			MaxSelect: 1,
		})

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added visibility field to visits collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove the visibility field
		collection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			return err
		}

		// Remove the field
		collection.Fields.RemoveById("visibility")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed visibility field from visits collection")
		return nil
	})
}
