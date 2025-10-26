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

		// Update collection rules to properly support friends visibility
		// Show visit if:
		// 1. User owns the visit, OR
		// 2. Visit is public, OR
		// 3. Visit is friends-only AND there's an accepted friendship (bidirectional check)

		// Using @request.data syntax in the filter to check if specific friendship exists
		listRule := `user = @request.auth.id ||
visibility = 'public' ||
(visibility = 'friends' && (
  @collection.friendships.user.id ?= user &&
  @collection.friendships.friend.id ?= @request.auth.id &&
  @collection.friendships.status ?= 'accepted'
) || (
  @collection.friendships.user.id ?= @request.auth.id &&
  @collection.friendships.friend.id ?= user &&
  @collection.friendships.status ?= 'accepted'
))`

		viewRule := listRule

		collection.ListRule = types.Pointer(listRule)
		collection.ViewRule = types.Pointer(viewRule)

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			log.Printf("Error saving visits collection rules: %v", err)
			return err
		}

		log.Println("✓ Fixed visits collection rules for friends visibility")
		return nil
	}, func(app core.App) error {
		// Down migration - revert to simpler rules
		collection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			return err
		}

		listRule := `user = @request.auth.id || visibility = 'public'`
		viewRule := listRule

		collection.ListRule = types.Pointer(listRule)
		collection.ViewRule = types.Pointer(viewRule)

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted visits collection rules")
		return nil
	})
}
