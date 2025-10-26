package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create feedback collection
		collection := core.NewBaseCollection("feedback")

		// Set collection rules
		// List/View: Admins see all, users see only their own
		collection.ListRule = types.Pointer("@request.auth.isAdmin = true || user = @request.auth.id")
		collection.ViewRule = types.Pointer("@request.auth.isAdmin = true || user = @request.auth.id")
		// Create: Authenticated users only, must set user to themselves
		collection.CreateRule = types.Pointer("@request.auth.id != '' && user = @request.auth.id")
		// Update: Only admins can update (for status changes)
		collection.UpdateRule = types.Pointer("@request.auth.isAdmin = true")
		// Delete: Only admins can delete
		collection.DeleteRule = types.Pointer("@request.auth.isAdmin = true")

		// Add title field (text, required, max 100 chars)
		collection.Fields.Add(&core.TextField{
			Name:     "title",
			Required: true,
			Min:      1,
			Max:      100,
		})

		// Add description field (text, required)
		collection.Fields.Add(&core.TextField{
			Name:     "description",
			Required: true,
			Min:      1,
			Max:      5000,
		})

		// Add status field (select: open, in_progress, resolved, closed)
		collection.Fields.Add(&core.SelectField{
			Name:      "status",
			Required:  true,
			Values:    []string{"open", "in_progress", "resolved", "closed"},
			MaxSelect: 1,
		})

		// Add admin_unread_count field (number, default: 0)
		collection.Fields.Add(&core.NumberField{
			Name:     "admin_unread_count",
			Required: false,
			Min:      types.Pointer(0.0),
		})

		// Add user_unread_count field (number, default: 0)
		collection.Fields.Add(&core.NumberField{
			Name:     "user_unread_count",
			Required: false,
			Min:      types.Pointer(0.0),
		})

		// Add last_message_at field (datetime) - for sorting by recent activity
		collection.Fields.Add(&core.DateField{
			Name:     "last_message_at",
			Required: false,
		})

		// Add created timestamp field (auto-managed by PocketBase)
		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})

		// Add updated timestamp field (auto-managed by PocketBase)
		collection.Fields.Add(&core.AutodateField{
			Name:     "updated",
			OnUpdate: true,
		})

		// Add user field (relation to users)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "user",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete feedback when user is deleted
			})
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created feedback collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove feedback collection
		collection, err := app.FindCollectionByNameOrId("feedback")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted feedback collection")
		return nil
	})
}
