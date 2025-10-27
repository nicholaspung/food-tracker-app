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

		// Update rule:
		// - Admins can update anything
		// - Users can update their own feedback (will be validated further in the future)
		collection.UpdateRule = types.Pointer(
			"@request.auth.isAdmin = true || user = @request.auth.id",
		)

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Updated feedback collection update rule to allow users to mark as read")
		return nil
	}, func(app core.App) error {
		// Down migration - revert to admin-only updates
		collection, err := app.FindCollectionByNameOrId("feedback")
		if err != nil {
			return err
		}

		collection.UpdateRule = types.Pointer("@request.auth.isAdmin = true")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted feedback collection update rule to admin-only")
		return nil
	})
}
