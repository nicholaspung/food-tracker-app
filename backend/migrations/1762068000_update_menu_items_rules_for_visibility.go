package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		// Update collection rules to respect visibility
		// Rule logic:
		// - Public menu items: visible to all authenticated users
		// - Creator's menu items: always visible to creator
		// - Friends-only menu items: visible if there's an accepted friendship (bidirectional)
		// - Private menu items: only visible to creator

		listRule := `visibility = 'public' ||
createdBy = @request.auth.id ||
(visibility = 'friends' && (
  (@collection.friendships.user.id ?= createdBy &&
   @collection.friendships.friend.id ?= @request.auth.id &&
   @collection.friendships.status ?= 'accepted') ||
  (@collection.friendships.user.id ?= @request.auth.id &&
   @collection.friendships.friend.id ?= createdBy &&
   @collection.friendships.status ?= 'accepted')
))`

		viewRule := listRule

		collection.ListRule = types.Pointer(listRule)
		collection.ViewRule = types.Pointer(viewRule)

		// Create rule: any authenticated user can create
		collection.CreateRule = types.Pointer("@request.auth.id != ''")

		// Update/Delete rules: only creator or no one (menu items are generally immutable)
		// Allow creator to update their own items
		collection.UpdateRule = types.Pointer("createdBy = @request.auth.id")
		collection.DeleteRule = types.Pointer("createdBy = @request.auth.id")

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Updated menu_items collection rules to respect visibility (including friends)")
		return nil
	}, func(app core.App) error {
		// Down migration - revert to original rules (all menu items visible to authenticated users)
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		collection.ListRule = types.Pointer("@request.auth.id != ''")
		collection.ViewRule = types.Pointer("@request.auth.id != ''")
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = nil // No one can update (immutable)
		collection.DeleteRule = nil // No one can delete

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted menu_items collection rules to show all items")
		return nil
	})
}
