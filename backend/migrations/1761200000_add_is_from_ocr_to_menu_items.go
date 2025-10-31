package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Find the menu_items collection
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		// Add isFromOCR field (boolean, default false)
		// Indicates whether this menu item was created from OCR/photo scan
		collection.Fields.Add(&core.BoolField{
			Name:     "isFromOCR",
			Required: false,
		})

		// Save the collection with the new field
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added isFromOCR field to menu_items collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove isFromOCR field
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		// Find and remove the isFromOCR field
		for i, field := range collection.Fields {
			if field.GetName() == "isFromOCR" {
				collection.Fields = append(collection.Fields[:i], collection.Fields[i+1:]...)
				break
			}
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed isFromOCR field from menu_items collection")
		return nil
	})
}
