package migrations

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		if err := setTastingSessionInviteCodeHidden(app, true); err != nil {
			return err
		}

		log.Println("✓ Hid Tasting Session invite codes from generic record responses")
		return nil
	}, func(app core.App) error {
		if err := setTastingSessionInviteCodeHidden(app, false); err != nil {
			return err
		}

		log.Println("✓ Restored Tasting Session invite codes in generic record responses")
		return nil
	})
}

func setTastingSessionInviteCodeHidden(app core.App, hidden bool) error {
	collection, err := app.FindCollectionByNameOrId("tasting_sessions")
	if err != nil {
		return err
	}

	inviteCodeField, ok := collection.Fields.GetByName("invite_code").(*core.TextField)
	if !ok {
		return fmt.Errorf("tasting_sessions.invite_code is not a text field")
	}
	inviteCodeField.Hidden = hidden

	return app.Save(collection)
}
