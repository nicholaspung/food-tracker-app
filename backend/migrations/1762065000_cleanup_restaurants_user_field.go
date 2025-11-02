package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		// Check if the old 'user' field still exists and remove it
		userField := collection.Fields.GetByName("user")
		if userField != nil {
			log.Println("Found old 'user' field on restaurants collection, removing it...")
			collection.Fields.RemoveById("user")

			// Ensure createdBy field exists
			createdByField := collection.Fields.GetByName("createdBy")
			if createdByField == nil {
				log.Println("createdBy field missing, adding it...")
				usersCollection, err := app.FindCollectionByNameOrId("users")
				if err != nil {
					return err
				}

				collection.Fields.Add(&core.RelationField{
					Name:          "createdBy",
					CollectionId:  usersCollection.Id,
					MaxSelect:     1,
					Required:      false,
					CascadeDelete: false,
				})
			}

			// Save the collection
			if err := app.Save(collection); err != nil {
				return err
			}

			log.Println("✓ Cleaned up restaurants collection - removed 'user' field")
		} else {
			log.Println("✓ Restaurants collection is already clean (no 'user' field found)")
		}

		return nil
	}, func(app core.App) error {
		// Down migration - no action needed
		log.Println("✓ No action needed for down migration")
		return nil
	})
}
