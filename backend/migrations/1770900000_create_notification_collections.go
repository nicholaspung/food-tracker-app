package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		devices := core.NewBaseCollection("notification_devices")
		devices.ListRule = types.Pointer("@request.auth.isAdmin = true")
		devices.ViewRule = devices.ListRule
		devices.CreateRule = nil
		devices.UpdateRule = nil
		devices.DeleteRule = nil
		devices.Fields.Add(&core.RelationField{Name: "user", CollectionId: usersCollection.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		devices.Fields.Add(&core.TextField{Name: "device_id", Required: true, Max: 200})
		devices.Fields.Add(&core.TextField{Name: "push_token", Required: true, Max: 500})
		devices.Fields.Add(&core.SelectField{Name: "platform", Required: true, MaxSelect: 1, Values: []string{"ios", "android", "web", "unknown"}})
		devices.Fields.Add(&core.BoolField{Name: "active", Required: false})
		devices.Fields.Add(&core.DateField{Name: "last_registered_at", Required: false})
		devices.Fields.Add(&core.DateField{Name: "last_seen_at", Required: false})
		devices.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		devices.Fields.Add(&core.AutodateField{Name: "updated", OnUpdate: true})
		devices.Indexes = []string{
			"CREATE UNIQUE INDEX idx_notification_devices_user_device ON notification_devices (user, device_id)",
			"CREATE INDEX idx_notification_devices_user_active ON notification_devices (user, active)",
		}
		if err := app.Save(devices); err != nil {
			return err
		}

		preferences := core.NewBaseCollection("notification_preferences")
		preferences.ListRule = types.Pointer("@request.auth.isAdmin = true")
		preferences.ViewRule = preferences.ListRule
		preferences.CreateRule = nil
		preferences.UpdateRule = nil
		preferences.DeleteRule = nil
		preferences.Fields.Add(&core.RelationField{Name: "user", CollectionId: usersCollection.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		preferences.Fields.Add(&core.BoolField{Name: "tasting_invites_enabled", Required: false})
		preferences.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		preferences.Fields.Add(&core.AutodateField{Name: "updated", OnUpdate: true})
		preferences.Indexes = []string{"CREATE UNIQUE INDEX idx_notification_preferences_user ON notification_preferences (user)"}
		if err := app.Save(preferences); err != nil {
			return err
		}

		logs := core.NewBaseCollection("notification_delivery_logs")
		logs.ListRule = types.Pointer("@request.auth.isAdmin = true")
		logs.ViewRule = logs.ListRule
		logs.CreateRule = nil
		logs.UpdateRule = nil
		logs.DeleteRule = nil
		logs.Fields.Add(&core.RelationField{Name: "user", CollectionId: usersCollection.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		logs.Fields.Add(&core.TextField{Name: "signal_type", Required: true, Max: 100})
		logs.Fields.Add(&core.TextField{Name: "source_collection", Required: true, Max: 100})
		logs.Fields.Add(&core.TextField{Name: "source_record", Required: true, Max: 100})
		logs.Fields.Add(&core.RelationField{Name: "actor", CollectionId: usersCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		logs.Fields.Add(&core.TextField{Name: "delivery_key", Required: true, Max: 200})
		logs.Fields.Add(&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"sent", "skipped_preference_disabled", "skipped_no_active_device", "skipped_actor", "provider_failed"}})
		logs.Fields.Add(&core.NumberField{Name: "device_count", Required: false})
		logs.Fields.Add(&core.TextField{Name: "provider_message_id", Required: false, Max: 200})
		logs.Fields.Add(&core.TextField{Name: "error_code", Required: false, Max: 100})
		logs.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		logs.Indexes = []string{
			"CREATE UNIQUE INDEX idx_notification_delivery_logs_delivery_key ON notification_delivery_logs (delivery_key)",
			"CREATE INDEX idx_notification_delivery_logs_user_signal ON notification_delivery_logs (user, signal_type)",
		}
		if err := app.Save(logs); err != nil {
			return err
		}

		log.Println("✓ Created notification device, preference, and delivery log collections")
		return nil
	}, func(app core.App) error {
		for _, collectionName := range []string{
			"notification_delivery_logs",
			"notification_preferences",
			"notification_devices",
		} {
			if err := deleteCollectionIfExists(app, collectionName); err != nil {
				return err
			}
		}
		log.Println("✓ Removed notification collections")
		return nil
	})
}
