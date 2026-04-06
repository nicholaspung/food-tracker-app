package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	menuImagesRestrictedReadRule = "@request.auth.isAdmin = true || uploadedBy = @request.auth.id"
	menuImagesLegacyReadRule     = "@request.auth.id != ''"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("menu_images")
		if err != nil {
			return err
		}

		collection.ListRule = types.Pointer(menuImagesRestrictedReadRule)
		collection.ViewRule = types.Pointer(menuImagesRestrictedReadRule)

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restricted menu_images read access to owners and admins")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("menu_images")
		if err != nil {
			return err
		}

		collection.ListRule = types.Pointer(menuImagesLegacyReadRule)
		collection.ViewRule = types.Pointer(menuImagesLegacyReadRule)

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored legacy menu_images read access")
		return nil
	})
}
