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

		// Add isQuickTrack field (boolean) to identify quick track items
		collection.Fields.Add(&core.BoolField{
			Name:     "isQuickTrack",
			Required: false,
		})

		// Add visibility field (for quick track items to be shareable with friends)
		collection.Fields.Add(&core.SelectField{
			Name:      "visibility",
			Required:  false,
			MaxSelect: 1,
			Values: []string{
				"private",
				"friends",
			},
		})

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added isQuickTrack and visibility fields to food_items collection")
		return nil
	}, func(app core.App) error {
		// Down migration - revert changes
		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		// Remove new fields
		collection.Fields.RemoveByName("isQuickTrack")
		collection.Fields.RemoveByName("visibility")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed isQuickTrack and visibility fields from food_items")
		return nil
	})
}
