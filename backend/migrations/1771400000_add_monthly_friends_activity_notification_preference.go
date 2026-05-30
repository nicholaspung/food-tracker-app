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
		if collection.Fields.GetByName("monthly_friends_activity_enabled") == nil {
			collection.Fields.Add(&core.BoolField{Name: "monthly_friends_activity_enabled", Required: false})
			if err := app.Save(collection); err != nil {
				return err
			}
		}
		if _, err := app.DB().NewQuery("UPDATE notification_preferences SET monthly_friends_activity_enabled = true").Execute(); err != nil {
			return err
		}

		log.Println("✓ Added monthly friends activity notification preference")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("notification_preferences")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("monthly_friends_activity_enabled") != nil {
			collection.Fields.RemoveByName("monthly_friends_activity_enabled")
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		log.Println("✓ Removed monthly friends activity notification preference")
		return nil
	})
}
