package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Get food_items collection
		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		// Update ListRule to allow friends to see quick track items with 'friends' visibility
		// Rule explanation:
		// - user = @request.auth.id: User can see their own items
		// - OR (isQuickTrack = true AND visibility = 'friends' AND user.id ?~ @request.auth.friendships_via_user.friend.id):
		//   Quick track items with friends visibility are visible to friends
		// - OR (isQuickTrack = true AND visibility = 'friends' AND user.id ?~ @request.auth.friendships_via_friend.user.id):
		//   Quick track items with friends visibility are visible to friends (reverse relationship)
		collection.ListRule = types.Pointer(
			"user = @request.auth.id || " +
				"(isQuickTrack = true && visibility = 'friends' && " +
				"(user.id ?~ @request.auth.friendships_via_user.friend.id || " +
				"user.id ?~ @request.auth.friendships_via_friend.user.id))",
		)

		// Update ViewRule (same as ListRule)
		collection.ViewRule = types.Pointer(
			"user = @request.auth.id || " +
				"(isQuickTrack = true && visibility = 'friends' && " +
				"(user.id ?~ @request.auth.friendships_via_user.friend.id || " +
				"user.id ?~ @request.auth.friendships_via_friend.user.id))",
		)

		// CreateRule, UpdateRule, and DeleteRule remain the same (only owner can create/update/delete)
		// These are already set correctly in the previous migration

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Updated food_items rules to support quick track visibility")
		return nil
	}, func(app core.App) error {
		// Down migration - revert to simple user-only rules
		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		// Revert to simple user-only rules
		collection.ListRule = types.Pointer("user = @request.auth.id")
		collection.ViewRule = types.Pointer("user = @request.auth.id")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted food_items rules to user-only access")
		return nil
	})
}
