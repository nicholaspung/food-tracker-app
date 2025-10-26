package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("invite_codes")
		if err != nil {
			return err
		}

		// Allow anyone (including unauthenticated users) to read invite codes
		// This is needed during signup to find who invited them
		// Note: Only List and View are allowed, Create/Update/Delete remain admin-only
		collection.ListRule = types.Pointer("")
		collection.ViewRule = types.Pointer("")
		// Keep create/update/delete as admin-only (nil)

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Updated invite_codes collection to allow public reading")
		return nil
	}, func(app core.App) error {
		// Down migration - revert to authenticated users or admin only
		collection, err := app.FindCollectionByNameOrId("invite_codes")
		if err != nil {
			return err
		}

		// Restore previous rule (authenticated users can view their own codes)
		collection.ListRule = types.Pointer("createdBy = @request.auth.id")
		collection.ViewRule = types.Pointer("createdBy = @request.auth.id")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted invite_codes collection to authenticated-only reading")
		return nil
	})
}
