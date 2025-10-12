package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Get the invite_codes collection
		collection, err := app.FindCollectionByNameOrId("invite_codes")
		if err != nil {
			return err
		}

		// Get users collection for the relation
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		// Add createdBy field (relation to users - who owns this code)
		collection.Fields.Add(&core.RelationField{
			Name:          "createdBy",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			CascadeDelete: false,
			Required:      false, // Not required for backward compatibility
		})

		// Update API rules to allow users to view their own codes
		collection.ListRule = types.Pointer("createdBy = @request.auth.id")
		collection.ViewRule = types.Pointer("createdBy = @request.auth.id")
		// Keep create/update/delete as admin-only (nil)

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added createdBy field to invite_codes collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove createdBy field
		collection, err := app.FindCollectionByNameOrId("invite_codes")
		if err != nil {
			return err
		}

		// Remove the createdBy field
		for i, field := range collection.Fields {
			if field.GetName() == "createdBy" {
				collection.Fields = append(collection.Fields[:i], collection.Fields[i+1:]...)
				break
			}
		}

		// Restore admin-only API rules
		collection.ListRule = nil
		collection.ViewRule = nil

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed createdBy field from invite_codes collection")
		return nil
	})
}
