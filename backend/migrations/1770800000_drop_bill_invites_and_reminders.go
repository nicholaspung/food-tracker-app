package migrations

import (
	"database/sql"
	"errors"
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		for _, collectionName := range []string{"bill_invites", "bill_reminders"} {
			collection, err := app.FindCollectionByNameOrId(collectionName)
			if err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					log.Printf("%s collection already absent", collectionName)
					continue
				}
				return err
			}

			if err := app.Delete(collection); err != nil {
				return err
			}

			log.Printf("Deleted %s collection", collectionName)
		}

		return nil
	}, func(app core.App) error {
		log.Println("Skipped recreating retired bill_invites and bill_reminders collections")
		return nil
	})
}
