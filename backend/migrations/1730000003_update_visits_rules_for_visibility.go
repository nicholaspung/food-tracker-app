package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			return err
		}

		// Update collection rules to respect visibility
		// Complex rule: show if (own visit) OR (public) OR (friends-only AND are friends)
		// - Own visits: always visible
		// - Public visits: visible to all authenticated users
		// - Friends visits: visible if there's an accepted friendship (in either direction)
		// - Private visits: only visible to owner

		listRule := `user = @request.auth.id ||
visibility = 'public' ||
(visibility = 'friends' && (
  @collection.friendships.user ?= user && @collection.friendships.friend ?= @request.auth.id && @collection.friendships.status ?= 'accepted' ||
  @collection.friendships.user ?= @request.auth.id && @collection.friendships.friend ?= user && @collection.friendships.status ?= 'accepted'
))`

		viewRule := listRule

		collection.ListRule = types.Pointer(listRule)
		collection.ViewRule = types.Pointer(viewRule)
		// Create/Update/Delete rules remain the same (only owner can modify)
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Updated visits collection rules to respect visibility (including friends)")
		return nil
	}, func(app core.App) error {
		// Down migration - revert to original rules (only own visits)
		collection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			return err
		}

		collection.ListRule = types.Pointer("user = @request.auth.id")
		collection.ViewRule = types.Pointer("user = @request.auth.id")
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted visits collection rules to private-only")
		return nil
	})
}
