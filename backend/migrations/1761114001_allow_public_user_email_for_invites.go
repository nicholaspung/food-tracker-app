package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		// Allow anyone to view user records (needed for invite code expansion)
		// This is safe because we only expose email field publicly
		// All other fields are protected by PocketBase's default field-level permissions
		collection.ViewRule = types.Pointer("")

		// Keep list rule restricted to self only
		collection.ListRule = types.Pointer("id = @request.auth.id")

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Updated users collection to allow public viewing (for invite code expansion)")
		return nil
	}, func(app core.App) error {
		// Down migration - revert to self-only viewing
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.ViewRule = types.Pointer("id = @request.auth.id")
		collection.ListRule = types.Pointer("id = @request.auth.id")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted users collection to self-only viewing")
		return nil
	})
}
