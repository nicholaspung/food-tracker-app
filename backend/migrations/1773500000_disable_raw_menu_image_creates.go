package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const menuImagesLegacyCreateRule = "@request.auth.id != ''"

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("menu_images")
		if err != nil {
			return err
		}

		// Trusted server workflows use app.Save and are not subject to API rules.
		collection.CreateRule = nil
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Disabled raw Menu Scan Source Image creates")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("menu_images")
		if err != nil {
			return err
		}

		collection.CreateRule = types.Pointer(menuImagesLegacyCreateRule)
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored authenticated raw Menu Scan Source Image creates")
		return nil
	})
}
