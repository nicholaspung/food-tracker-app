package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		// Update food_items rules to allow viewing food items from visits that are visible
		// This follows the same logic as visits: own items + items from visible visits
		//
		// Show food item if:
		// 1. User owns the food item, OR
		// 2. The visit is public, OR
		// 3. The visit is friends-only AND there's an accepted friendship

		listRule := `user = @request.auth.id ||
visit.visibility = 'public' ||
(visit.visibility = 'friends' && (
  @collection.friendships.user.id ?= visit.user &&
  @collection.friendships.friend.id ?= @request.auth.id &&
  @collection.friendships.status ?= 'accepted'
) || (
  @collection.friendships.user.id ?= @request.auth.id &&
  @collection.friendships.friend.id ?= visit.user &&
  @collection.friendships.status ?= 'accepted'
))`

		viewRule := listRule

		collection.ListRule = types.Pointer(listRule)
		collection.ViewRule = types.Pointer(viewRule)

		// Keep create/update/delete rules as owner-only
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			log.Printf("Error saving food_items collection rules: %v", err)
			return err
		}

		log.Println("✓ Updated food_items collection rules to respect visit visibility")
		return nil
	}, func(app core.App) error {
		// Down migration - revert to owner-only
		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		listRule := `user = @request.auth.id`
		viewRule := listRule

		collection.ListRule = types.Pointer(listRule)
		collection.ViewRule = types.Pointer(viewRule)
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted food_items collection rules to owner-only")
		return nil
	})
}
