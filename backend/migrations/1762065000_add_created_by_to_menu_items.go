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

		// Find the users collection for the relation
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection: %v", err)
			return err
		}

		// Add createdBy field (relation to users)
		collection.Fields.Add(&core.RelationField{
			Name:          "createdBy",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			Required:      false, // Will be backfilled
			CascadeDelete: false, // Keep menu items even if user is deleted
		})

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added createdBy field to menu_items collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove the createdBy field
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		// Remove the field
		collection.Fields.RemoveById("createdBy")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed createdBy field from menu_items collection")
		return nil
	})
}
