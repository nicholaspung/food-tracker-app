package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Fix list_items collection rules
		collection, err := app.FindCollectionByNameOrId("list_items")
		if err != nil {
			return err
		}

		// Fix Create rule - use relation traversal instead of @collection syntax
		// Only the list owner can add items to their list
		collection.CreateRule = types.Pointer("@request.auth.id != '' && list.user = @request.auth.id")

		// Fix Update rule - list owner or item adder can update
		collection.UpdateRule = types.Pointer("addedBy = @request.auth.id || list.user = @request.auth.id")

		// Fix Delete rule - list owner or item adder can delete
		collection.DeleteRule = types.Pointer("addedBy = @request.auth.id || list.user = @request.auth.id")

		// Fix List and View rules - use relation traversal
		listRule := `@request.auth.id != '' && (
  list.visibility = 'public' ||
  list.user = @request.auth.id ||
  (list.visibility = 'friends' && (
    (@collection.friendships.user.id ?= list.user &&
     @collection.friendships.friend.id ?= @request.auth.id &&
     @collection.friendships.status ?= 'accepted') ||
    (@collection.friendships.user.id ?= @request.auth.id &&
     @collection.friendships.friend.id ?= list.user &&
     @collection.friendships.status ?= 'accepted')
  ))
)`

		collection.ListRule = types.Pointer(listRule)
		collection.ViewRule = types.Pointer(listRule)

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Fixed list_items collection rules (using relation traversal)")
		return nil
	}, func(app core.App) error {
		// Down migration - restore original (broken) rules
		collection, err := app.FindCollectionByNameOrId("list_items")
		if err != nil {
			return err
		}

		// Restore original rules
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

		collection.ListRule = types.Pointer(listRule)
		collection.ViewRule = types.Pointer(listRule)
		collection.CreateRule = types.Pointer(`@request.auth.id != '' &&
@collection.restaurant_lists.id = list &&
@collection.restaurant_lists.user = @request.auth.id`)
		collection.UpdateRule = types.Pointer(`addedBy = @request.auth.id ||
@collection.restaurant_lists.user = @request.auth.id`)
		collection.DeleteRule = types.Pointer(`addedBy = @request.auth.id ||
@collection.restaurant_lists.user = @request.auth.id`)

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored original list_items collection rules")
		return nil
	})
}
