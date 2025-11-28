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

		// Update ListRule and ViewRule to support BOTH:
		// 1. Food items from visits (based on visit visibility)
		// 2. Quick track items (based on their own visibility)
		//
		// Show food item if:
		// - User owns the food item, OR
		// - Food item is from a visit AND:
		//   - The visit visibility is 'friends' AND there's an accepted friendship
		// - Food item is a quick track item AND:
		//   - The visibility is 'friends' AND there's an accepted friendship

		rule := `user = @request.auth.id ||
(visit != '' && visit.visibility = 'friends' && (
  visit.user.id ?~ @request.auth.friendships_via_user.friend.id ||
  visit.user.id ?~ @request.auth.friendships_via_friend.user.id
)) ||
(isQuickTrack = true && visibility = 'friends' && (
  user.id ?~ @request.auth.friendships_via_user.friend.id ||
  user.id ?~ @request.auth.friendships_via_friend.user.id
))`

		collection.ListRule = types.Pointer(rule)
		collection.ViewRule = types.Pointer(rule)

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Fixed food_items rules to include both visit visibility and quick track visibility")
		return nil
	}, func(app core.App) error {
		// Down migration - revert to previous state (only quick track visibility)
		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		collection.ListRule = types.Pointer(
			"user = @request.auth.id || " +
				"(isQuickTrack = true && visibility = 'friends' && " +
				"(user.id ?~ @request.auth.friendships_via_user.friend.id || " +
				"user.id ?~ @request.auth.friendships_via_friend.user.id))",
		)

		collection.ViewRule = types.Pointer(
			"user = @request.auth.id || " +
				"(isQuickTrack = true && visibility = 'friends' && " +
				"(user.id ?~ @request.auth.friendships_via_user.friend.id || " +
				"user.id ?~ @request.auth.friendships_via_friend.user.id))",
		)

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted food_items rules to quick track only")
		return nil
	})
}
