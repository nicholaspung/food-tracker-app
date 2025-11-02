package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		// Add visibility field (select, default: public)
		// Options: private, friends, public
		// - private: only visible to creator
		// - friends: visible to creator and their friends
		// - public: visible to all (community-contributed, especially from OCR)
		collection.Fields.Add(&core.SelectField{
			Name:      "visibility",
			Required:  true,
			Values:    []string{"private", "friends", "public"},
			MaxSelect: 1,
		})

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added visibility field to menu_items collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove the visibility field
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		// Remove the field
		collection.Fields.RemoveById("visibility")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed visibility field from menu_items collection")
		return nil
	})
}
