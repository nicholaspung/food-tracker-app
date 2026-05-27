package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("receipt_scan_debug_logs")
		if err != nil {
			return err
		}

		statusField, ok := collection.Fields.GetByName("status").(*core.SelectField)
		if !ok {
			return nil
		}

		statusField.Values = []string{"success", "failed", "invalid_response", "empty_response", "not_receipt", "low_confidence"}
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added success to receipt_scan_debug_logs.status")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("receipt_scan_debug_logs")
		if err != nil {
			return err
		}

		statusField, ok := collection.Fields.GetByName("status").(*core.SelectField)
		if !ok {
			return nil
		}

		statusField.Values = []string{"failed", "invalid_response", "empty_response", "not_receipt", "low_confidence"}
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed success from receipt_scan_debug_logs.status")
		return nil
	})
}
