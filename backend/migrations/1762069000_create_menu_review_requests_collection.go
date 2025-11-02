package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create menu_review_requests collection
		collection := core.NewBaseCollection("menu_review_requests")

		// Set collection rules
		// Users can create requests and view their own
		// Admins can view all requests
		collection.ListRule = types.Pointer("requestedBy = @request.auth.id || @request.auth.isAdmin = true")
		collection.ViewRule = types.Pointer("requestedBy = @request.auth.id || @request.auth.isAdmin = true")
		collection.CreateRule = types.Pointer("@request.auth.id != '' && requestedBy = @request.auth.id")
		collection.UpdateRule = types.Pointer("@request.auth.isAdmin = true") // Only admins can update status
		collection.DeleteRule = types.Pointer("@request.auth.isAdmin = true") // Only admins can delete

		// Add restaurant field (relation to restaurants)
		restaurantsCollection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			log.Printf("Warning: Could not find restaurants collection: %v", err)
			return err
		}

		collection.Fields.Add(&core.RelationField{
			Name:          "restaurant",
			CollectionId:  restaurantsCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: true, // Delete requests when restaurant is deleted
		})

		// Add requestedBy field (relation to users)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection: %v", err)
			return err
		}

		collection.Fields.Add(&core.RelationField{
			Name:          "requestedBy",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: false, // Keep requests even if user is deleted
		})

		// Add reason field (optional text explaining why review is needed)
		collection.Fields.Add(&core.TextField{
			Name:     "reason",
			Required: false,
			Max:      500,
		})

		// Add status field (pending, reviewed, dismissed)
		collection.Fields.Add(&core.SelectField{
			Name:      "status",
			Required:  true,
			Values:    []string{"pending", "reviewed", "dismissed"},
			MaxSelect: 1,
		})

		// Add adminNotes field (for admin to add notes when reviewing)
		collection.Fields.Add(&core.TextField{
			Name:     "adminNotes",
			Required: false,
			Max:      1000,
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

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created menu_review_requests collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove menu_review_requests collection
		collection, err := app.FindCollectionByNameOrId("menu_review_requests")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted menu_review_requests collection")
		return nil
	})
}
