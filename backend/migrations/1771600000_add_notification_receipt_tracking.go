package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		logs, err := app.FindCollectionByNameOrId("notification_delivery_logs")
		if err != nil {
			return err
		}
		devices, err := app.FindCollectionByNameOrId("notification_devices")
		if err != nil {
			return err
		}

		if logs.Fields.GetByName("notification_device") == nil {
			logs.Fields.Add(&core.RelationField{Name: "notification_device", CollectionId: devices.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		}
		if logs.Fields.GetByName("receipt_status") == nil {
			logs.Fields.Add(&core.SelectField{Name: "receipt_status", Required: false, MaxSelect: 1, Values: []string{"pending", "ok", "error", "missing"}})
		}
		if logs.Fields.GetByName("receipt_next_check_at") == nil {
			logs.Fields.Add(&core.DateField{Name: "receipt_next_check_at", Required: false})
		}
		if logs.Fields.GetByName("receipt_checked_at") == nil {
			logs.Fields.Add(&core.DateField{Name: "receipt_checked_at", Required: false})
		}
		if logs.Fields.GetByName("receipt_error_code") == nil {
			logs.Fields.Add(&core.TextField{Name: "receipt_error_code", Required: false, Max: 100})
		}
		logs.Indexes = append(logs.Indexes,
			"CREATE INDEX idx_notification_delivery_logs_receipt_pending ON notification_delivery_logs (receipt_status, receipt_next_check_at)",
		)
		if err := app.Save(logs); err != nil {
			return err
		}

		receipts := core.NewBaseCollection("notification_delivery_receipts")
		receipts.ListRule = types.Pointer("@request.auth.isAdmin = true")
		receipts.ViewRule = receipts.ListRule
		receipts.CreateRule = nil
		receipts.UpdateRule = nil
		receipts.DeleteRule = nil
		receipts.Fields.Add(&core.RelationField{Name: "notification_delivery_log", CollectionId: logs.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		receipts.Fields.Add(&core.RelationField{Name: "notification_device", CollectionId: devices.Id, MaxSelect: 1, Required: true, CascadeDelete: false})
		receipts.Fields.Add(&core.TextField{Name: "provider_message_id", Required: true, Max: 200})
		receipts.Fields.Add(&core.SelectField{Name: "receipt_status", Required: true, MaxSelect: 1, Values: []string{"pending", "ok", "error", "missing"}})
		receipts.Fields.Add(&core.DateField{Name: "receipt_next_check_at", Required: false})
		receipts.Fields.Add(&core.DateField{Name: "receipt_checked_at", Required: false})
		receipts.Fields.Add(&core.TextField{Name: "receipt_error_code", Required: false, Max: 100})
		receipts.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		receipts.Fields.Add(&core.AutodateField{Name: "updated", OnUpdate: true})
		receipts.Indexes = []string{
			"CREATE INDEX idx_notification_delivery_receipts_pending ON notification_delivery_receipts (receipt_status, receipt_next_check_at)",
			"CREATE INDEX idx_notification_delivery_receipts_log ON notification_delivery_receipts (notification_delivery_log)",
			"CREATE INDEX idx_notification_delivery_receipts_device ON notification_delivery_receipts (notification_device)",
		}
		if err := app.Save(receipts); err != nil {
			return err
		}

		log.Println("✓ Added notification receipt tracking fields and per-device receipt records")
		return nil
	}, func(app core.App) error {
		if err := deleteCollectionIfExists(app, "notification_delivery_receipts"); err != nil {
			return err
		}

		logs, err := app.FindCollectionByNameOrId("notification_delivery_logs")
		if err != nil {
			return err
		}

		for _, fieldName := range []string{
			"receipt_error_code",
			"receipt_checked_at",
			"receipt_next_check_at",
			"receipt_status",
			"notification_device",
		} {
			if field := logs.Fields.GetByName(fieldName); field != nil {
				logs.Fields.RemoveById(field.GetId())
			}
		}
		filteredIndexes := logs.Indexes[:0]
		for _, index := range logs.Indexes {
			if index != "CREATE INDEX idx_notification_delivery_logs_receipt_pending ON notification_delivery_logs (receipt_status, receipt_next_check_at)" {
				filteredIndexes = append(filteredIndexes, index)
			}
		}
		logs.Indexes = filteredIndexes
		if err := app.Save(logs); err != nil {
			return err
		}

		log.Println("✓ Removed notification receipt tracking fields")
		return nil
	})
}
