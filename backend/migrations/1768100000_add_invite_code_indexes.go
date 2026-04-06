package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const (
	inviteCodesCodeCIIndex       = "CREATE UNIQUE INDEX idx_invite_codes_code_ci ON invite_codes (LOWER(code))"
	inviteCodesCreatedByUsedIndex = "CREATE INDEX idx_invite_codes_createdBy_used ON invite_codes (createdBy, used)"
	tastingSessionInviteCodeIndex = "CREATE UNIQUE INDEX idx_tasting_session_invites_code ON tasting_session_invites (code)"
	billInviteCodeIndex           = "CREATE UNIQUE INDEX idx_bill_invites_code ON bill_invites (code)"
)

func init() {
	m.Register(func(app core.App) error {
		if err := addCollectionIndexes(app, "invite_codes", inviteCodesCodeCIIndex, inviteCodesCreatedByUsedIndex); err != nil {
			return err
		}
		if err := addCollectionIndexes(app, "tasting_session_invites", tastingSessionInviteCodeIndex); err != nil {
			return err
		}
		if err := addCollectionIndexes(app, "bill_invites", billInviteCodeIndex); err != nil {
			return err
		}

		log.Println("✓ Added invite code indexes")
		return nil
	}, func(app core.App) error {
		if err := removeCollectionIndexes(
			app,
			"invite_codes",
			inviteCodesCodeCIIndex,
			inviteCodesCreatedByUsedIndex,
		); err != nil {
			return err
		}
		if err := removeCollectionIndexes(app, "tasting_session_invites", tastingSessionInviteCodeIndex); err != nil {
			return err
		}
		if err := removeCollectionIndexes(app, "bill_invites", billInviteCodeIndex); err != nil {
			return err
		}

		log.Println("✓ Removed invite code indexes")
		return nil
	})
}

func addCollectionIndexes(app core.App, collectionName string, indexes ...string) error {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}

	for _, index := range indexes {
		if hasCollectionIndex(collection.Indexes, index) {
			continue
		}
		collection.Indexes = append(collection.Indexes, index)
	}

	return app.Save(collection)
}

func removeCollectionIndexes(app core.App, collectionName string, indexes ...string) error {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}

	for _, index := range indexes {
		collection.Indexes = removeCollectionIndex(collection.Indexes, index)
	}

	return app.Save(collection)
}
