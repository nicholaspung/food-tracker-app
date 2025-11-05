package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create bill_invites collection (for join codes)
		collection := core.NewBaseCollection("bill_invites")

		// Set collection rules
		// - Anyone can view invite codes (to join bills)
		// - Only bill creators can create invite codes
		// - Only bill creators can update invite codes
		// - Only bill creators can delete invite codes
		collection.ListRule = types.Pointer("@request.auth.id != ''")
		collection.ViewRule = types.Pointer("@request.auth.id != ''")
		collection.CreateRule = types.Pointer("@request.auth.id != '' && bill.creator_user = @request.auth.id")
		collection.UpdateRule = types.Pointer("bill.creator_user = @request.auth.id")
		collection.DeleteRule = types.Pointer("bill.creator_user = @request.auth.id")

		// Add bill field (relation to bills, required)
		billsCollection, err := app.FindCollectionByNameOrId("bills")
		if err != nil {
			log.Printf("Warning: Could not find bills collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "bill",
				CollectionId:  billsCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete invites when bill is deleted
			})
		}

		// Add code field (text, required, unique)
		collection.Fields.Add(&core.TextField{
			Name:     "code",
			Required: true,
			Max:      10,
			Pattern:  "^[A-Z0-9]{6}$",
		})

		// Add created_by field (relation to users)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "created_by",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete invites when creator is deleted
			})
		}

		// Add expires_at field (date, required)
		collection.Fields.Add(&core.DateField{
			Name:     "expires_at",
			Required: true,
		})

		// Add used_by field (relation to users, optional)
		collection.Fields.Add(&core.RelationField{
			Name:          "used_by",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			Required:      false,
			CascadeDelete: false,
		})

		// Add created timestamp field
		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created bill_invites collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove bill_invites collection
		collection, err := app.FindCollectionByNameOrId("bill_invites")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted bill_invites collection")
		return nil
	})
}
