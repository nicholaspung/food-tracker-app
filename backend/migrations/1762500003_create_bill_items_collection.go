package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create bill_items collection (for itemized splits)
		collection := core.NewBaseCollection("bill_items")

		// Set collection rules
		// - Users can list/view items for bills they're associated with
		// - Only bill creators can add items
		// - Only bill creators can update items
		// - Only bill creators can delete items
		collection.ListRule = types.Pointer("@request.auth.id != ''")
		collection.ViewRule = types.Pointer("bill.creator_user = @request.auth.id || bill.bill_participants_via_bill.user ?= @request.auth.id")
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
				CascadeDelete: true, // Delete items when bill is deleted
			})
		}

		// Add item_name field (text, required)
		collection.Fields.Add(&core.TextField{
			Name:     "item_name",
			Required: true,
			Max:      200,
		})

		// Add price field (number, required)
		collection.Fields.Add(&core.NumberField{
			Name:     "price",
			Required: true,
			Min:      types.Pointer(float64(0)),
		})

		// Add assigned_to field (relation to bill_participants, multiple)
		billParticipantsCollection, err := app.FindCollectionByNameOrId("bill_participants")
		if err != nil {
			log.Printf("Warning: Could not find bill_participants collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "assigned_to",
				CollectionId:  billParticipantsCollection.Id,
				MaxSelect:     100, // Allow multiple participants per item
				Required:      true,
				CascadeDelete: false, // Don't delete items when participants are removed
			})
		}

		// Add created timestamp field
		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created bill_items collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove bill_items collection
		collection, err := app.FindCollectionByNameOrId("bill_items")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted bill_items collection")
		return nil
	})
}
