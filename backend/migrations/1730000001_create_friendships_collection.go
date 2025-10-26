package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create friendships collection
		collection := core.NewBaseCollection("friendships")

		// Set collection rules
		// Users can see friendships where they are either user or friend
		// Only pending requests can be viewed by the receiver
		collection.ListRule = types.Pointer("user = @request.auth.id || friend = @request.auth.id")
		collection.ViewRule = types.Pointer("user = @request.auth.id || friend = @request.auth.id")
		// Only authenticated users can create friendship requests
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		// Only the friend (receiver) can update status (accept/reject)
		collection.UpdateRule = types.Pointer("friend = @request.auth.id")
		// Users can delete friendships they're part of
		collection.DeleteRule = types.Pointer("user = @request.auth.id || friend = @request.auth.id")

		// Add status field (select, required)
		// Options: pending, accepted, blocked
		collection.Fields.Add(&core.SelectField{
			Name:      "status",
			Required:  true,
			Values:    []string{"pending", "accepted", "blocked"},
			MaxSelect: 1,
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

		// Add user field (relation to users - the one who sent the request)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "user",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete friendship when user is deleted
			})

			// Add friend field (relation to users - the one who received the request)
			collection.Fields.Add(&core.RelationField{
				Name:          "friend",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete friendship when friend is deleted
			})
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created friendships collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove friendships collection
		collection, err := app.FindCollectionByNameOrId("friendships")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted friendships collection")
		return nil
	})
}
