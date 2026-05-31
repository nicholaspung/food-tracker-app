package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const userNotificationPreferenceRule = "@request.auth.id != '' && user = @request.auth.id"

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("notification_preferences")
		if err != nil {
			return err
		}

		collection.ListRule = types.Pointer("@request.auth.isAdmin = true || " + userNotificationPreferenceRule)
		collection.ViewRule = collection.ListRule
		collection.CreateRule = types.Pointer(userNotificationPreferenceRule)
		collection.UpdateRule = types.Pointer(userNotificationPreferenceRule)
		collection.DeleteRule = types.Pointer("@request.auth.isAdmin = true")
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Allowed users to manage their notification preferences")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("notification_preferences")
		if err != nil {
			return err
		}

		collection.ListRule = types.Pointer("@request.auth.isAdmin = true")
		collection.ViewRule = collection.ListRule
		collection.CreateRule = nil
		collection.UpdateRule = nil
		collection.DeleteRule = nil
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored admin-only notification preferences")
		return nil
	})
}
