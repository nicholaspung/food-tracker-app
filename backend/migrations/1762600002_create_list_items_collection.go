package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create list_items collection (junction table for lists and restaurants)
		collection := core.NewBaseCollection("list_items")

		// Set collection rules
		// List items inherit visibility from parent list
		// Only list owner can add/remove items

		listRule := `@request.auth.id != '' && (
  @collection.restaurant_lists.id ?= list &&
  (@collection.restaurant_lists.visibility ?= 'public' ||
   @collection.restaurant_lists.user ?= @request.auth.id ||
   (@collection.restaurant_lists.visibility ?= 'friends' && (
     (@collection.friendships.user.id ?= @collection.restaurant_lists.user &&
      @collection.friendships.friend.id ?= @request.auth.id &&
      @collection.friendships.status ?= 'accepted') ||
     (@collection.friendships.user.id ?= @request.auth.id &&
      @collection.friendships.friend.id ?= @collection.restaurant_lists.user &&
      @collection.friendships.status ?= 'accepted')
   )))
)`

		viewRule := listRule

		collection.ListRule = types.Pointer(listRule)
		collection.ViewRule = types.Pointer(viewRule)
		collection.CreateRule = types.Pointer(`@request.auth.id != '' &&
@collection.restaurant_lists.id = list &&
@collection.restaurant_lists.user = @request.auth.id`)
		collection.UpdateRule = types.Pointer(`addedBy = @request.auth.id ||
@collection.restaurant_lists.user = @request.auth.id`)
		collection.DeleteRule = types.Pointer(`addedBy = @request.auth.id ||
@collection.restaurant_lists.user = @request.auth.id`)

		// Add list field (relation to restaurant_lists, required, cascade delete)
		listsCollection, err := app.FindCollectionByNameOrId("restaurant_lists")
		if err != nil {
			log.Printf("Warning: Could not find restaurant_lists collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "list",
				CollectionId:  listsCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete list items when list is deleted
			})
		}

		// Add restaurant field (relation to restaurants, required)
		restaurantsCollection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			log.Printf("Warning: Could not find restaurants collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "restaurant",
				CollectionId:  restaurantsCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: false, // Don't delete list items when restaurant is deleted
			})
		}

		// Add addedBy field (relation to users, required)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "addedBy",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: false, // Don't delete list items when user is deleted
			})
		}

		// Add position field (number, required) for manual ordering
		collection.Fields.Add(&core.NumberField{
			Name:     "position",
			Required: true,
			Min:      types.Pointer(float64(0)),
		})

		// Add note field (text, optional, max 300 chars)
		collection.Fields.Add(&core.TextField{
			Name:     "note",
			Required: false,
			Max:      300,
		})

		// Add created timestamp field
		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})

		// Create unique index on (list, restaurant) to prevent duplicates
		collection.Indexes = []string{
			"CREATE UNIQUE INDEX idx_list_restaurant ON list_items (list, restaurant)",
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created list_items collection with unique index on (list, restaurant)")
		return nil
	}, func(app core.App) error {
		// Down migration - remove list_items collection
		collection, err := app.FindCollectionByNameOrId("list_items")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted list_items collection")
		return nil
	})
}
