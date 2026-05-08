package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const waitlistEmailCIIndex = "CREATE UNIQUE INDEX idx_waitlist_entries_email_ci ON waitlist_entries (LOWER(email))"

func init() {
	m.Register(func(app core.App) error {
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		waitlistCollection := core.NewBaseCollection("waitlist_entries")
		waitlistCollection.ListRule = nil
		waitlistCollection.ViewRule = nil
		waitlistCollection.CreateRule = nil
		waitlistCollection.UpdateRule = nil
		waitlistCollection.DeleteRule = nil
		waitlistCollection.Indexes = append(waitlistCollection.Indexes, waitlistEmailCIIndex)

		waitlistCollection.Fields.Add(&core.TextField{
			Name:     "email",
			Required: true,
			Max:      320,
		})
		waitlistCollection.Fields.Add(&core.SelectField{
			Name:      "status",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"pending", "approved", "rejected", "signed_up"},
		})
		waitlistCollection.Fields.Add(&core.TextField{Name: "source", Max: 120})
		waitlistCollection.Fields.Add(&core.DateField{Name: "approvedAt"})
		waitlistCollection.Fields.Add(&core.RelationField{
			Name:          "approvedBy",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			CascadeDelete: false,
		})
		waitlistCollection.Fields.Add(&core.DateField{Name: "rejectedAt"})
		waitlistCollection.Fields.Add(&core.RelationField{
			Name:          "rejectedBy",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			CascadeDelete: false,
		})
		waitlistCollection.Fields.Add(&core.DateField{Name: "signedUpAt"})
		waitlistCollection.Fields.Add(&core.RelationField{
			Name:          "signedUpUser",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			CascadeDelete: false,
		})
		waitlistCollection.Fields.Add(&core.TextField{Name: "loopsContactId", Max: 120})
		waitlistCollection.Fields.Add(&core.TextField{Name: "lastLoopsSyncError", Max: 2000})
		waitlistCollection.Fields.Add(&core.DateField{Name: "created"})
		waitlistCollection.Fields.Add(&core.DateField{Name: "updated"})

		if err := app.Save(waitlistCollection); err != nil {
			return err
		}

		for _, field := range []core.Field{
			&core.BoolField{Name: "productUpdatesConsent"},
			&core.BoolField{Name: "marketingConsent"},
			&core.BoolField{Name: "onboardingEmailsAcknowledged"},
			&core.TextField{Name: "emailConsentVersion", Max: 80},
			&core.DateField{Name: "emailConsentCapturedAt"},
		} {
			if usersCollection.Fields.GetByName(field.GetName()) == nil {
				usersCollection.Fields.Add(field)
			}
		}

		if err := app.Save(usersCollection); err != nil {
			return err
		}

		log.Println("✓ Created waitlist_entries collection and user email preference fields")
		return nil
	}, func(app core.App) error {
		if collection, err := app.FindCollectionByNameOrId("waitlist_entries"); err == nil {
			if err := app.Delete(collection); err != nil {
				return err
			}
		}

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		for _, fieldName := range []string{
			"productUpdatesConsent",
			"marketingConsent",
			"onboardingEmailsAcknowledged",
			"emailConsentVersion",
			"emailConsentCapturedAt",
		} {
			if field := usersCollection.Fields.GetByName(fieldName); field != nil {
				usersCollection.Fields.RemoveById(field.GetId())
			}
		}

		if err := app.Save(usersCollection); err != nil {
			return err
		}

		log.Println("✓ Removed waitlist_entries collection and user email preference fields")
		return nil
	})
}
