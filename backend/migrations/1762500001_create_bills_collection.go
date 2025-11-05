package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create bills collection
		collection := core.NewBaseCollection("bills")

		// Set collection rules
		// - Users can list/view bills they created
		// - Only creators can create bills
		// - Only creators can update bills
		// - Only creators can delete bills
		// Note: Participant access will be added in a later migration after bill_participants exists
		collection.ListRule = types.Pointer("@request.auth.id != ''")
		collection.ViewRule = types.Pointer("creator_user = @request.auth.id")
		collection.CreateRule = types.Pointer("@request.auth.id != '' && creator_user = @request.auth.id")
		collection.UpdateRule = types.Pointer("creator_user = @request.auth.id")
		collection.DeleteRule = types.Pointer("creator_user = @request.auth.id")

		// Add bill_name field (text, required)
		collection.Fields.Add(&core.TextField{
			Name:     "bill_name",
			Required: true,
			Max:      200,
		})

		// Add total_amount field (number, required)
		collection.Fields.Add(&core.NumberField{
			Name:     "total_amount",
			Required: true,
			Min:      types.Pointer(float64(0)),
		})

		// Add tax field (number)
		collection.Fields.Add(&core.NumberField{
			Name:     "tax",
			Required: false,
			Min:      types.Pointer(float64(0)),
		})

		// Add tip field (number)
		collection.Fields.Add(&core.NumberField{
			Name:     "tip",
			Required: false,
			Min:      types.Pointer(float64(0)),
		})

		// Add fees field (number)
		collection.Fields.Add(&core.NumberField{
			Name:     "fees",
			Required: false,
			Min:      types.Pointer(float64(0)),
		})

		// Add split_mode field (select, required)
		collection.Fields.Add(&core.SelectField{
			Name:     "split_mode",
			Required: true,
			MaxSelect: 1,
			Values:   []string{"even", "itemized", "custom"},
		})

		// Add extras_split_mode field (select, required)
		collection.Fields.Add(&core.SelectField{
			Name:     "extras_split_mode",
			Required: true,
			MaxSelect: 1,
			Values:   []string{"proportional", "equal"},
		})

		// Add status field (select, required)
		collection.Fields.Add(&core.SelectField{
			Name:     "status",
			Required: true,
			MaxSelect: 1,
			Values:   []string{"active", "settled", "cancelled"},
		})

		// Add creator_user field (relation to users)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "creator_user",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete bills when user is deleted
			})
		}

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

		log.Println("✓ Created bills collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove bills collection
		collection, err := app.FindCollectionByNameOrId("bills")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted bills collection")
		return nil
	})
}
