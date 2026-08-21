package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const catalogVisibilityReadRule = `visibility = 'public' ||
createdBy = @request.auth.id ||
(visibility = 'friends' && (
  (@collection.friendships.user.id ?= createdBy &&
   @collection.friendships.friend.id ?= @request.auth.id &&
   @collection.friendships.status ?= 'accepted') ||
  (@collection.friendships.user.id ?= @request.auth.id &&
   @collection.friendships.friend.id ?= createdBy &&
   @collection.friendships.status ?= 'accepted')
))`

const authenticatedCatalogVisibilityReadRule = `@request.auth.id != '' && (` + catalogVisibilityReadRule + `)`

func init() {
	m.Register(func(app core.App) error {
		if err := setCatalogReadRules(app, authenticatedCatalogVisibilityReadRule); err != nil {
			return err
		}

		log.Println("✓ Required authentication for Restaurant and Menu Item raw reads")
		return nil
	}, func(app core.App) error {
		return setCatalogReadRules(app, catalogVisibilityReadRule)
	})
}

func setCatalogReadRules(app core.App, rule string) error {
	for _, collectionName := range []string{"restaurants", "menu_items"} {
		collection, err := app.FindCollectionByNameOrId(collectionName)
		if err != nil {
			return err
		}

		collection.ListRule = types.Pointer(rule)
		collection.ViewRule = types.Pointer(rule)
		if err := app.Save(collection); err != nil {
			return err
		}
	}

	return nil
}
