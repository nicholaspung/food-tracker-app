package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("feedback_messages")
		if err != nil {
			return err
		}

		collection.CreateRule = nil

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Locked feedback_messages collection direct creates to backend-only flows")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("feedback_messages")
		if err != nil {
			return err
		}

		collection.CreateRule = types.Pointer(
			"@request.auth.id != '' && (@request.auth.isAdmin = true || feedback.user = @request.auth.id)",
		)

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored feedback_messages collection direct create rule")
		return nil
	})
}
