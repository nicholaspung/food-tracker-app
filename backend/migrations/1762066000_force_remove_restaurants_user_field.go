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

		// Find and remove the old 'user' field by iterating through all fields
		var userFieldId string
		for _, field := range collection.Fields {
			if field.GetName() == "user" {
				userFieldId = field.GetId()
				log.Printf("Found 'user' field with ID: %s", userFieldId)
				break
			}
		}

		if userFieldId != "" {
			log.Println("Removing 'user' field from restaurants collection...")
			collection.Fields.RemoveById(userFieldId)

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

			log.Println("✓ Successfully removed 'user' field from restaurants collection")
		} else {
			log.Println("✓ No 'user' field found on restaurants collection (already clean)")
		}

		return nil
	}, func(app core.App) error {
		// Down migration - no action needed
		log.Println("✓ No action needed for down migration")
		return nil
	})
}
