package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const usersOwnerOrAdminViewRule = "@request.auth.isAdmin = true || id = @request.auth.id"

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.ViewRule = types.Pointer(usersOwnerOrAdminViewRule)
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restricted raw user views to owners and administrators")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.ViewRule = types.Pointer(usersAcceptedFriendOnlyViewRule)
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored accepted-friend raw user views")
		return nil
	})
}
