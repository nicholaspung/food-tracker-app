package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create bill_participants collection
		collection := core.NewBaseCollection("bill_participants")

		// Set collection rules
		// - Users can list/view participants for bills they're associated with
		// - Only bill creators can add participants
		// - Only bill creators can update participants (e.g., mark as paid)
		// - Only bill creators can delete participants
		collection.ListRule = types.Pointer("@request.auth.id != ''")
		collection.ViewRule = types.Pointer("bill.creator_user = @request.auth.id || user = @request.auth.id")
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
				CascadeDelete: true, // Delete participants when bill is deleted
			})
		}

		// Add user field (relation to users, optional - null for non-app users)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "user",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false, // Don't delete participants when user is deleted
			})
		}

		// Add participant_name field (text, for non-app users)
		collection.Fields.Add(&core.TextField{
			Name:     "participant_name",
			Required: false,
			Max:      100,
		})

		// Add amount_owed field (number, required)
		collection.Fields.Add(&core.NumberField{
			Name:     "amount_owed",
			Required: true,
			Min:      types.Pointer(float64(0)),
		})

		// Add paid_status field (select, required)
		collection.Fields.Add(&core.SelectField{
			Name:     "paid_status",
			Required: true,
			MaxSelect: 1,
			Values:   []string{"pending", "paid"},
		})

		// Add paid_date field (date, optional)
		collection.Fields.Add(&core.DateField{
			Name:     "paid_date",
			Required: false,
		})

		// Add payment_method field (text, optional)
		collection.Fields.Add(&core.TextField{
			Name:     "payment_method",
			Required: false,
			Max:      50,
		})

		// Add created timestamp field
		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})

		// Add updated timestamp field
		collection.Fields.Add(&core.AutodateField{
			Name:     "updated",
			OnUpdate: true,
		})

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created bill_participants collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove bill_participants collection
		collection, err := app.FindCollectionByNameOrId("bill_participants")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted bill_participants collection")
		return nil
	})
}
