package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create feedback_messages collection
		collection := core.NewBaseCollection("feedback_messages")

		// Set collection rules
		// List/View: Admins see all, users see messages for their own feedback
		collection.ListRule = types.Pointer("@request.auth.isAdmin = true || feedback.user = @request.auth.id")
		collection.ViewRule = types.Pointer("@request.auth.isAdmin = true || feedback.user = @request.auth.id")
		// Create: Admins can create on any feedback, users can create on their own feedback
		collection.CreateRule = types.Pointer("@request.auth.id != '' && (@request.auth.isAdmin = true || feedback.user = @request.auth.id)")
		// Update: No one can update messages (immutable)
		collection.UpdateRule = nil
		// Delete: Only admins can delete
		collection.DeleteRule = types.Pointer("@request.auth.isAdmin = true")

		// Add message field (text, required)
		collection.Fields.Add(&core.TextField{
			Name:     "message",
			Required: true,
			Min:      1,
			Max:      10000,
		})

		// Add is_admin_message field (boolean)
		collection.Fields.Add(&core.BoolField{
			Name:     "is_admin_message",
			Required: false,
		})

		// Add created timestamp field (auto-managed by PocketBase)
		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})

		// Add feedback field (relation to feedback)
		feedbackCollection, err := app.FindCollectionByNameOrId("feedback")
		if err != nil {
			log.Printf("Warning: Could not find feedback collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "feedback",
				CollectionId:  feedbackCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete messages when feedback is deleted
			})
		}

		// Add user field (relation to users - message author)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "user",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: false, // Don't delete messages when user is deleted
			})
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created feedback_messages collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove feedback_messages collection
		collection, err := app.FindCollectionByNameOrId("feedback_messages")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted feedback_messages collection")
		return nil
	})
}
