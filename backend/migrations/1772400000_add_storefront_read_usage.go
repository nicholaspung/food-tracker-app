package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("user_monthly_usage")
		if err != nil {
			return err
		}

		if collection.Fields.GetByName("storefront_reads") == nil {
			minZero := float64(0)
			collection.Fields.Add(&core.NumberField{
				Name:    "storefront_reads",
				Min:     &minZero,
				OnlyInt: true,
			})
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		log.Println("✓ Added storefront_reads to user_monthly_usage")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("user_monthly_usage")
		if err != nil {
			return err
		}

		if field := collection.Fields.GetByName("storefront_reads"); field != nil {
			collection.Fields.RemoveById(field.GetId())
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		log.Println("✓ Removed storefront_reads from user_monthly_usage")
		return nil
	})
}
