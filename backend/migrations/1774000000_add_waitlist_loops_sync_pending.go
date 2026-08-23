package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("waitlist_entries")
		if err != nil {
			return err
		}

		if collection.Fields.GetByName("loopsSyncPending") == nil {
			collection.Fields.Add(&core.BoolField{Name: "loopsSyncPending"})
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added durable waitlist Loops sync state")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("waitlist_entries")
		if err != nil {
			return err
		}

		if field := collection.Fields.GetByName("loopsSyncPending"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed durable waitlist Loops sync state")
		return nil
	})
}
