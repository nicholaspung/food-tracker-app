package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	usersAcceptedFriendOnlyViewRule = "@request.auth.isAdmin = true || id = @request.auth.id || ((@collection.friendships.user.id ?= id && @collection.friendships.friend.id ?= @request.auth.id && @collection.friendships.status ?= 'accepted') || (@collection.friendships.user.id ?= @request.auth.id && @collection.friendships.friend.id ?= id && @collection.friendships.status ?= 'accepted'))"
	usersAnyFriendshipViewRule      = "@request.auth.isAdmin = true || id = @request.auth.id || @request.auth.friendships_via_user.friend.id ?= id || @request.auth.friendships_via_friend.user.id ?= id"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.ViewRule = types.Pointer(usersAcceptedFriendOnlyViewRule)
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restricted users view rule to accepted friendships")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.ViewRule = types.Pointer(usersAnyFriendshipViewRule)
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored users view rule to any friendship")
		return nil
	})
}
