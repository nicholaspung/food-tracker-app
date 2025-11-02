package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		// Update collection rules to respect visibility
		// Rule logic:
		// - Public restaurants: visible to all authenticated users
		// - Owner's restaurants: always visible to owner
		// - Friends-only restaurants: visible if there's an accepted friendship (bidirectional)
		// - Private restaurants: only visible to owner

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
		// Create/Update/Delete rules remain the same (only owner can modify)
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("createdBy = @request.auth.id")
		collection.DeleteRule = types.Pointer("createdBy = @request.auth.id")

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Updated restaurants collection rules to respect visibility (including friends)")
		return nil
	}, func(app core.App) error {
		// Down migration - revert to original rules (all restaurants visible)
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		collection.ListRule = types.Pointer("@request.auth.id != ''")
		collection.ViewRule = types.Pointer("@request.auth.id != ''")
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("createdBy = @request.auth.id")
		collection.DeleteRule = types.Pointer("createdBy = @request.auth.id")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted restaurants collection rules to show all restaurants")
		return nil
	})
}
