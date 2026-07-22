package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const billParticipantLegacySelfUpdateRule = "bill.creator_user = @request.auth.id || user = @request.auth.id"

func init() {
	m.Register(func(app core.App) error {
		if err := setBillParticipantUpdateRule(app, nil); err != nil {
			return err
		}

		log.Println("✓ Disabled direct bill participant updates")
		return nil
	}, func(app core.App) error {
		legacyRule := billParticipantLegacySelfUpdateRule
		if err := setBillParticipantUpdateRule(app, &legacyRule); err != nil {
			return err
		}

		log.Println("✓ Restored legacy bill participant self-update rule")
		return nil
	})
}

func setBillParticipantUpdateRule(app core.App, rule *string) error {
	collection, err := app.FindCollectionByNameOrId("bill_participants")
	if err != nil {
		return err
	}

	collection.UpdateRule = rule
	return app.Save(collection)
}
