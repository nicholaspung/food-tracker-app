package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("ai_error_logs")
		if err != nil {
			log.Println("ai_error_logs collection already absent")
			return nil
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("Deleted ai_error_logs collection")
		return nil
	}, func(app core.App) error {
		log.Println("Skipped recreating retired ai_error_logs collection")
		return nil
	})
}
