package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	billAccessRule            = "creator_user = @request.auth.id || bill_participants_via_bill.user ?= @request.auth.id"
	billParticipantAccessRule = "bill.creator_user = @request.auth.id || bill.bill_participants_via_bill.user ?= @request.auth.id"
	billParticipantLegacyView = "bill.creator_user = @request.auth.id || user = @request.auth.id"
	billInviteCreatorOnlyRule = "bill.creator_user = @request.auth.id"
	anyAuthenticatedUserRule  = "@request.auth.id != ''"
)

func init() {
	m.Register(func(app core.App) error {
		if err := updateBillCollectionRule(app, "bills", billAccessRule, billAccessRule); err != nil {
			return err
		}

		if err := updateBillCollectionRule(app, "bill_participants", billParticipantAccessRule, billParticipantAccessRule); err != nil {
			return err
		}

		if err := updateBillCollectionRule(app, "bill_items", billParticipantAccessRule, billParticipantAccessRule); err != nil {
			return err
		}

		if err := updateBillCollectionRule(app, "bill_invites", billInviteCreatorOnlyRule, billInviteCreatorOnlyRule); err != nil {
			return err
		}

		log.Println("✓ Tightened bill collection access rules")
		return nil
	}, func(app core.App) error {
		if err := updateBillCollectionRule(app, "bills", anyAuthenticatedUserRule, billAccessRule); err != nil {
			return err
		}

		if err := updateBillCollectionRule(app, "bill_participants", anyAuthenticatedUserRule, billParticipantLegacyView); err != nil {
			return err
		}

		if err := updateBillCollectionRule(app, "bill_items", anyAuthenticatedUserRule, billParticipantAccessRule); err != nil {
			return err
		}

		if err := updateBillCollectionRule(app, "bill_invites", anyAuthenticatedUserRule, anyAuthenticatedUserRule); err != nil {
			return err
		}

		log.Println("✓ Restored legacy bill collection access rules")
		return nil
	})
}

func updateBillCollectionRule(app core.App, collectionName string, listRule string, viewRule string) error {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}

	collection.ListRule = types.Pointer(listRule)
	collection.ViewRule = types.Pointer(viewRule)

	return app.Save(collection)
}
