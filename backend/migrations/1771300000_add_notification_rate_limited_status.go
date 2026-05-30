package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("notification_delivery_logs")
		if err != nil {
			return err
		}

		statusField, ok := collection.Fields.GetByName("status").(*core.SelectField)
		if !ok {
			return nil
		}

		statusField.Values = []string{"sent", "skipped_preference_disabled", "skipped_no_active_device", "skipped_actor", "skipped_rate_limited", "provider_failed"}
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added skipped_rate_limited to notification_delivery_logs.status")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("notification_delivery_logs")
		if err != nil {
			return err
		}

		statusField, ok := collection.Fields.GetByName("status").(*core.SelectField)
		if !ok {
			return nil
		}

		statusField.Values = []string{"sent", "skipped_preference_disabled", "skipped_no_active_device", "skipped_actor", "provider_failed"}
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed skipped_rate_limited from notification_delivery_logs.status")
		return nil
	})
}
