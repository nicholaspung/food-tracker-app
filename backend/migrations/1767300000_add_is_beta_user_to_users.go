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

		collection.Fields.Add(&core.BoolField{
			Name:     "isBetaUser",
			Required: false,
		})

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added isBetaUser field to users collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.Fields.RemoveByName("isBetaUser")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed isBetaUser field from users collection")
		return nil
	})
}
