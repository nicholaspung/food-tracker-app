package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const notificationDeviceRevocationIDIndex = "CREATE UNIQUE INDEX idx_notification_devices_revocation_id ON notification_devices (revocation_id) WHERE revocation_id != ''"

func init() {
	m.Register(func(app core.App) error {
		devices, err := app.FindCollectionByNameOrId("notification_devices")
		if err != nil {
			return err
		}

		for _, field := range []*core.TextField{
			{Name: "auth_token_key_hash", Required: false, Max: 64},
			{Name: "revocation_capability_hash", Required: false, Max: 64},
			{Name: "revocation_id", Required: false, Max: 64},
		} {
			if devices.Fields.GetByName(field.Name) == nil {
				devices.Fields.Add(field)
			}
		}
		devices.Indexes = append(devices.Indexes, notificationDeviceRevocationIDIndex)
		if err := app.Save(devices); err != nil {
			return err
		}

		records, err := app.FindAllRecords("notification_devices")
		if err != nil {
			return err
		}
		deactivated := 0
		for _, record := range records {
			if !record.GetBool("active") {
				continue
			}
			record.Set("active", false)
			if err := app.Save(record); err != nil {
				return err
			}
			deactivated++
		}

		log.Printf("✓ Added scoped notification device revocation and deactivated %d legacy active device(s)", deactivated)
		return nil
	}, func(app core.App) error {
		devices, err := app.FindCollectionByNameOrId("notification_devices")
		if err != nil {
			return err
		}

		filteredIndexes := devices.Indexes[:0]
		for _, index := range devices.Indexes {
			if index != notificationDeviceRevocationIDIndex {
				filteredIndexes = append(filteredIndexes, index)
			}
		}
		devices.Indexes = filteredIndexes
		for _, fieldName := range []string{
			"revocation_id",
			"revocation_capability_hash",
			"auth_token_key_hash",
		} {
			if field := devices.Fields.GetByName(fieldName); field != nil {
				devices.Fields.RemoveById(field.GetId())
			}
		}

		if err := app.Save(devices); err != nil {
			return err
		}
		log.Println("✓ Removed scoped notification device revocation fields")
		return nil
	})
}
