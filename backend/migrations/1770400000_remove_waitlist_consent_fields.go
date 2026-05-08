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

		for _, fieldName := range []string{
			"productUpdatesConsent",
			"marketingConsent",
			"onboardingEmailsAcknowledged",
			"consentVersion",
			"consentCapturedAt",
		} {
			if field := collection.Fields.GetByName(fieldName); field != nil {
				collection.Fields.RemoveById(field.GetId())
			}
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed consent fields from waitlist_entries")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("waitlist_entries")
		if err != nil {
			return err
		}

		for _, field := range []core.Field{
			&core.BoolField{Name: "productUpdatesConsent"},
			&core.BoolField{Name: "marketingConsent"},
			&core.BoolField{Name: "onboardingEmailsAcknowledged"},
			&core.TextField{Name: "consentVersion", Max: 80},
			&core.DateField{Name: "consentCapturedAt"},
		} {
			if collection.Fields.GetByName(field.GetName()) == nil {
				collection.Fields.Add(field)
			}
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored consent fields on waitlist_entries")
		return nil
	})
}
