package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Update bills collection to allow participant access
		billsCollection, err := app.FindCollectionByNameOrId("bills")
		if err != nil {
			return err
		}

		// Update ViewRule to allow participants to view bills
		billsCollection.ViewRule = types.Pointer("creator_user = @request.auth.id || bill_participants_via_bill.user ?= @request.auth.id")

		if err := app.Save(billsCollection); err != nil {
			return err
		}

		log.Println("✓ Updated bills collection access rules for participants")

		// Update bill_items collection to allow participant access
		billItemsCollection, err := app.FindCollectionByNameOrId("bill_items")
		if err != nil {
			return err
		}

		// Update ViewRule to allow participants to view items
		billItemsCollection.ViewRule = types.Pointer("bill.creator_user = @request.auth.id || bill.bill_participants_via_bill.user ?= @request.auth.id")

		if err := app.Save(billItemsCollection); err != nil {
			return err
		}

		log.Println("✓ Updated bill_items collection access rules for participants")

		return nil
	}, func(app core.App) error {
		// Down migration - revert to creator-only access
		billsCollection, err := app.FindCollectionByNameOrId("bills")
		if err != nil {
			return err
		}

		billsCollection.ViewRule = types.Pointer("creator_user = @request.auth.id")

		if err := app.Save(billsCollection); err != nil {
			return err
		}

		// Revert bill_items as well
		billItemsCollection, err := app.FindCollectionByNameOrId("bill_items")
		if err != nil {
			return err
		}

		billItemsCollection.ViewRule = types.Pointer("bill.creator_user = @request.auth.id")

		if err := app.Save(billItemsCollection); err != nil {
			return err
		}

		log.Println("✓ Reverted bills and bill_items access rules to creator-only")
		return nil
	})
}
