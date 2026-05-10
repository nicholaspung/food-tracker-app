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

		for _, field := range []core.Field{
			&core.DateField{Name: "joinedEmailSentAt"},
			&core.TextField{Name: "lastJoinedEmailError", Max: 2000},
		} {
			if collection.Fields.GetByName(field.GetName()) == nil {
				collection.Fields.Add(field)
			}
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added waitlist joined email state fields")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("waitlist_entries")
		if err != nil {
			return err
		}

		for _, fieldName := range []string{"joinedEmailSentAt", "lastJoinedEmailError"} {
			if field := collection.Fields.GetByName(fieldName); field != nil {
				collection.Fields.RemoveById(field.GetId())
			}
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed waitlist joined email state fields")
		return nil
	})
}
