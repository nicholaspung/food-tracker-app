package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.Fields.Add(&core.TextField{
			Name:     "subscriptionProvider",
			Required: false,
		})
		collection.Fields.Add(&core.TextField{
			Name:     "subscriptionStatus",
			Required: false,
		})
		collection.Fields.Add(&core.TextField{
			Name:     "stripeCustomerId",
			Required: false,
		})
		collection.Fields.Add(&core.TextField{
			Name:     "subscriptionId",
			Required: false,
		})
		collection.Fields.Add(&core.DateField{
			Name:     "subscriptionCurrentPeriodEnd",
			Required: false,
		})

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added Stripe billing fields to users collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.Fields.RemoveByName("subscriptionProvider")
		collection.Fields.RemoveByName("subscriptionStatus")
		collection.Fields.RemoveByName("stripeCustomerId")
		collection.Fields.RemoveByName("subscriptionId")
		collection.Fields.RemoveByName("subscriptionCurrentPeriodEnd")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed Stripe billing fields from users collection")
		return nil
	})
}
