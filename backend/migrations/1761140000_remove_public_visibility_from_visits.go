package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			return err
		}

		// Update visibility field to only allow friends and private
		// Remove "public" option
		visibilityField := collection.Fields.GetByName("visibility")
		if visibilityField == nil {
			log.Println("Warning: visibility field not found")
			return nil
		}

		// Cast to SelectField to update values
		if selectField, ok := visibilityField.(*core.SelectField); ok {
			selectField.Values = []string{"friends", "private"}
		}

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed 'public' option from visits visibility field")
		return nil
	}, func(app core.App) error {
		// Down migration - restore the public option
		collection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			return err
		}

		visibilityField := collection.Fields.GetByName("visibility")
		if visibilityField == nil {
			return nil
		}

		if selectField, ok := visibilityField.(*core.SelectField); ok {
			selectField.Values = []string{"public", "friends", "private"}
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored 'public' option to visits visibility field")
		return nil
	})
}
