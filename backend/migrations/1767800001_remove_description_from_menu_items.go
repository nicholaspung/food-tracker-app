package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		collection.Fields.RemoveByName("description")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed description field from menu_items collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		collection.Fields.Add(&core.TextField{
			Name:     "description",
			Required: false,
			Max:      500,
		})

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored description field to menu_items collection")
		return nil
	})
}
