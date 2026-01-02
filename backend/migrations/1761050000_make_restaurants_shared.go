package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		// Update collection rules to allow all authenticated users to read restaurants
		// But only the creator (if createdBy is set) can update/delete
		collection.ListRule = types.Pointer("@request.auth.id != ''")
		collection.ViewRule = types.Pointer("@request.auth.id != ''")
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("createdBy = @request.auth.id")
		collection.DeleteRule = types.Pointer("createdBy = @request.auth.id")

		// Remove the old required user field
		collection.Fields.RemoveById("user")

		// Add createdBy field (optional relation to users)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "createdBy",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      false, // Optional - for backward compatibility
				CascadeDelete: false, // Don't delete restaurants when user is deleted
			})
		}

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Made restaurants collection shared (removed user, added createdBy)")
		return nil
	}, func(app core.App) error {
		// Down migration - revert to user-owned restaurants
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		// Restore original collection rules
		collection.ListRule = types.Pointer("user = @request.auth.id")
		collection.ViewRule = types.Pointer("user = @request.auth.id")
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

		// Remove createdBy field
		collection.Fields.RemoveById("createdBy")

		// Add back user field (required)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "user",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true,
			})
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted restaurants collection to user-owned model")
		return nil
	})
}
