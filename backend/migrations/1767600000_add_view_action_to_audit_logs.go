package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("audit_logs")
		if err != nil {
			return err
		}

		actionField := collection.Fields.GetByName("action")
		if actionField == nil {
			return nil
		}

		selectField, ok := actionField.(*core.SelectField)
		if !ok {
			return nil
		}

		selectField.Values = []string{"create", "update", "delete", "view"}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added view action to audit_logs collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("audit_logs")
		if err != nil {
			return err
		}

		actionField := collection.Fields.GetByName("action")
		if actionField == nil {
			return nil
		}

		selectField, ok := actionField.(*core.SelectField)
		if !ok {
			return nil
		}

		selectField.Values = []string{"create", "update", "delete"}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed view action from audit_logs collection")
		return nil
	})
}
