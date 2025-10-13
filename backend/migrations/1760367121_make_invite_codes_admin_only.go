package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Get the invite_codes collection
		collection, err := app.FindCollectionByNameOrId("invite_codes")
		if err != nil {
			return err
		}

		// Lock down all API rules to admin-only (nil = admin-only)
		// Backend hooks can still access the collection
		collection.ListRule = nil
		collection.ViewRule = nil
		collection.CreateRule = nil
		collection.UpdateRule = nil
		collection.DeleteRule = nil

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Made invite_codes collection admin-only (backend hooks still have access)")
		return nil
	}, func(app core.App) error {
		// Down migration - restore user access to list/view their codes
		collection, err := app.FindCollectionByNameOrId("invite_codes")
		if err != nil {
			return err
		}

		// Restore previous rules (users could list/view their own codes)
		collection.ListRule = types.Pointer("createdBy = @request.auth.id")
		collection.ViewRule = types.Pointer("createdBy = @request.auth.id")

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored invite_codes collection rules")
		return nil
	})
}
