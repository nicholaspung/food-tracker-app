package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("feedback")
		if err != nil {
			return err
		}

		collection.UpdateRule = types.Pointer("@request.auth.isAdmin = true")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Tightened feedback collection update rule to admin-only")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("feedback")
		if err != nil {
			return err
		}

		collection.UpdateRule = types.Pointer(
			"@request.auth.isAdmin = true || user = @request.auth.id",
		)

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored feedback collection update rule to allow user-owned updates")
		return nil
	})
}
