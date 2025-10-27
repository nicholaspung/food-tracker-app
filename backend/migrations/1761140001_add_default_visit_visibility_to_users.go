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

		// Add defaultVisitVisibility field (select, default: friends)
		// Options: friends, private
		collection.Fields.Add(&core.SelectField{
			Name:      "defaultVisitVisibility",
			Required:  true,
			Values:    []string{"friends", "private"},
			MaxSelect: 1,
		})

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added defaultVisitVisibility field to users collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove the field
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		// Remove the field
		collection.Fields.RemoveById("defaultVisitVisibility")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed defaultVisitVisibility field from users collection")
		return nil
	})
}
