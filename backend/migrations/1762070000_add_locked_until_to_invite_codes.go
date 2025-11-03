package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("invite_codes")
		if err != nil {
			return err
		}

		// Add locked_until field (DateTime, optional)
		collection.Fields.Add(&core.DateField{
			Name:     "locked_until",
			Required: false,
		})

		return app.Save(collection)
	}, func(app core.App) error {
		// Rollback: remove locked_until field
		collection, err := app.FindCollectionByNameOrId("invite_codes")
		if err != nil {
			return err
		}

		collection.Fields.RemoveByName("locked_until")

		return app.Save(collection)
	})
}
