package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create restaurant_lists collection
		collection := core.NewBaseCollection("restaurant_lists")

		// Set collection rules to respect visibility (similar to restaurants)
		// Rule logic:
		// - Public lists: visible to all authenticated users
		// - Owner's lists: always visible to owner
		// - Friends-only lists: visible if there's an accepted friendship (bidirectional)
		// - Private lists: only visible to owner

		listRule := `visibility = 'public' ||
user = @request.auth.id ||
(visibility = 'friends' && (
  (@collection.friendships.user.id ?= user &&
   @collection.friendships.friend.id ?= @request.auth.id &&
   @collection.friendships.status ?= 'accepted') ||
  (@collection.friendships.user.id ?= @request.auth.id &&
   @collection.friendships.friend.id ?= user &&
   @collection.friendships.status ?= 'accepted')
))`

		viewRule := listRule

		collection.ListRule = types.Pointer(listRule)
		collection.ViewRule = types.Pointer(viewRule)
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

		// Add name field (text, required, max 100 chars)
		collection.Fields.Add(&core.TextField{
			Name:     "name",
			Required: true,
			Max:      100,
		})

		// Add description field (text, optional, max 500 chars)
		collection.Fields.Add(&core.TextField{
			Name:     "description",
			Required: false,
			Max:      500,
		})

		// Add visibility field (select, required)
		collection.Fields.Add(&core.SelectField{
			Name:      "visibility",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"private", "friends", "public"},
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
				CascadeDelete: true, // Delete lists when user is deleted
			})
		}

		// Add coverImage field (file, optional)
		collection.Fields.Add(&core.FileField{
			Name:      "coverImage",
			Required:  false,
			MaxSelect: 1,
			MaxSize:   5242880, // 5MB
			MimeTypes: []string{"image/jpeg", "image/png", "image/gif", "image/webp"},
		})

		// Add isCollaborative field (bool, default false)
		// This will be used in Phase 3 for collaborative lists
		collection.Fields.Add(&core.BoolField{
			Name: "isCollaborative",
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

		log.Println("✓ Created restaurant_lists collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove restaurant_lists collection
		collection, err := app.FindCollectionByNameOrId("restaurant_lists")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted restaurant_lists collection")
		return nil
	})
}
