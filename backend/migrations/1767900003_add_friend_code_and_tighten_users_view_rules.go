package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"

	"myapp/lib"
)

const (
	usersFriendCodeIndex = "CREATE UNIQUE INDEX idx_users_friend_code ON users (friendCode) WHERE friendCode != ''"
	usersScopedViewRule  = "@request.auth.isAdmin = true || id = @request.auth.id || @request.auth.friendships_via_user.friend.id ?= id || @request.auth.friendships_via_friend.user.id ?= id"
	usersScopedListRule  = "@request.auth.isAdmin = true || id = @request.auth.id"
	usersLegacyViewRule  = ""
	usersLegacyListRule  = "id = @request.auth.id"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		if collection.Fields.GetByName("friendCode") == nil {
			collection.Fields.Add(&core.TextField{
				Name:     "friendCode",
				Required: false,
				Min:      lib.FriendCodeLength,
				Max:      lib.FriendCodeLength,
				Pattern:  "^[A-Z0-9]{8}$",
			})
		}

		collection.ViewRule = types.Pointer(usersScopedViewRule)
		collection.ListRule = types.Pointer(usersScopedListRule)

		if err := app.Save(collection); err != nil {
			return err
		}

		users, err := app.FindRecordsByFilter("users", "", "", 0, 0, nil)
		if err != nil {
			return err
		}

		for _, user := range users {
			friendCode, err := lib.EnsureUserFriendCode(app, user)
			if err != nil {
				return err
			}
			user.Set("friendCode", friendCode)

			if err := app.Save(user); err != nil {
				return err
			}
		}

		collection, err = app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		if !hasCollectionIndex(collection.Indexes, usersFriendCodeIndex) {
			collection.Indexes = append(collection.Indexes, usersFriendCodeIndex)
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added friendCode field and tightened users view rules")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.ViewRule = types.Pointer(usersLegacyViewRule)
		collection.ListRule = types.Pointer(usersLegacyListRule)
		collection.Fields.RemoveByName("friendCode")
		collection.Indexes = removeCollectionIndex(collection.Indexes, usersFriendCodeIndex)

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed friendCode field and restored legacy users view rules")
		return nil
	})
}

func hasCollectionIndex(indexes []string, target string) bool {
	for _, index := range indexes {
		if index == target {
			return true
		}
	}

	return false
}

func removeCollectionIndex(indexes []string, target string) []string {
	filtered := make([]string, 0, len(indexes))
	for _, index := range indexes {
		if index == target {
			continue
		}
		filtered = append(filtered, index)
	}

	return filtered
}
