package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Update bill_participants collection to allow participants to update their own record
		collection, err := app.FindCollectionByNameOrId("bill_participants")
		if err != nil {
			return err
		}

		// Update UpdateRule to allow:
		// - Bill creator can update any participant record
		// - Participants can update their own record (e.g., mark themselves as paid)
		collection.UpdateRule = types.Pointer("bill.creator_user = @request.auth.id || user = @request.auth.id")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Updated bill_participants to allow participant self-update")
		return nil
	}, func(app core.App) error {
		// Down migration - revert to creator-only update
		collection, err := app.FindCollectionByNameOrId("bill_participants")
		if err != nil {
			return err
		}

		collection.UpdateRule = types.Pointer("bill.creator_user = @request.auth.id")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted bill_participants to creator-only update")
		return nil
	})
}
