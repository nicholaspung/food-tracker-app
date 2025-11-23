package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Get visit_photos collection
		collection, err := app.FindCollectionByNameOrId("visit_photos")
		if err != nil {
			return err
		}

		// Make visit field optional (for Quick Track items without visits)
		visitField := collection.Fields.GetByName("visit")
		if visitField != nil {
			if relationField, ok := visitField.(*core.RelationField); ok {
				relationField.Required = false
				log.Println("✓ Made visit field optional in visit_photos")
			}
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Updated visit_photos to support Quick Track items")
		return nil
	}, func(app core.App) error {
		// Down migration - make visit required again
		collection, err := app.FindCollectionByNameOrId("visit_photos")
		if err != nil {
			return err
		}

		// Make visit field required again
		visitField := collection.Fields.GetByName("visit")
		if visitField != nil {
			if relationField, ok := visitField.(*core.RelationField); ok {
				relationField.Required = true
			}
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted visit_photos changes")
		return nil
	})
}
