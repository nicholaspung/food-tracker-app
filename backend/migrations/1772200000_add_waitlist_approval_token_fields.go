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
			&core.TextField{Name: "approvalTokenNonceHash", Max: 128},
			&core.DateField{Name: "approvalTokenIssuedAt"},
			&core.DateField{Name: "approvalTokenExpiresAt"},
			&core.DateField{Name: "approvalTokenUsedAt"},
		} {
			if collection.Fields.GetByName(field.GetName()) == nil {
				collection.Fields.Add(field)
			}
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added waitlist approval token fields")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("waitlist_entries")
		if err != nil {
			return err
		}

		for _, fieldName := range []string{
			"approvalTokenNonceHash",
			"approvalTokenIssuedAt",
			"approvalTokenExpiresAt",
			"approvalTokenUsedAt",
		} {
			if field := collection.Fields.GetByName(fieldName); field != nil {
				collection.Fields.RemoveById(field.GetId())
			}
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed waitlist approval token fields")
		return nil
	})
}
