package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("notification_preferences")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("bill_owed_enabled") == nil {
			collection.Fields.Add(&core.BoolField{Name: "bill_owed_enabled", Required: false})
			if err := app.Save(collection); err != nil {
				return err
			}
		}
		if _, err := app.DB().NewQuery("UPDATE notification_preferences SET bill_owed_enabled = true").Execute(); err != nil {
			return err
		}

		log.Println("✓ Added bill owed notification preference")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("notification_preferences")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("bill_owed_enabled") != nil {
			collection.Fields.RemoveByName("bill_owed_enabled")
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		log.Println("✓ Removed bill owed notification preference")
		return nil
	})
}
