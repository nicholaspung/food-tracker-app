package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create bill_reminders collection (for tracking reminders sent)
		collection := core.NewBaseCollection("bill_reminders")

		// Set collection rules
		// - Only bill creators can list/view reminders
		// - Only bill creators can create reminders
		// - No updates or deletes (reminders are immutable)
		collection.ListRule = types.Pointer("bill.creator_user = @request.auth.id")
		collection.ViewRule = types.Pointer("bill.creator_user = @request.auth.id")
		collection.CreateRule = types.Pointer("@request.auth.id != '' && bill.creator_user = @request.auth.id")
		collection.UpdateRule = nil // No updates allowed
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
				CascadeDelete: true, // Delete reminders when bill is deleted
			})
		}

		// Add participant field (relation to bill_participants, required)
		billParticipantsCollection, err := app.FindCollectionByNameOrId("bill_participants")
		if err != nil {
			log.Printf("Warning: Could not find bill_participants collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "participant",
				CollectionId:  billParticipantsCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete reminders when participant is deleted
			})
		}

		// Add sent_by field (relation to users, required)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "sent_by",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete reminders when sender is deleted
			})
		}

		// Add sent_at field (date, required, auto-set on create)
		collection.Fields.Add(&core.AutodateField{
			Name:     "sent_at",
			OnCreate: true,
		})

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created bill_reminders collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove bill_reminders collection
		collection, err := app.FindCollectionByNameOrId("bill_reminders")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted bill_reminders collection")
		return nil
	})
}
