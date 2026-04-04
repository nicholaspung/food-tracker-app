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

		if collection.Fields.GetByName("heic_conversions") == nil {
			minZero := float64(0)
			collection.Fields.Add(&core.NumberField{
				Name:    "heic_conversions",
				Min:     &minZero,
				OnlyInt: true,
			})
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added heic_conversions to user_monthly_usage")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("user_monthly_usage")
		if err != nil {
			return err
		}

		collection.Fields.RemoveByName("heic_conversions")
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed heic_conversions from user_monthly_usage")
		return nil
	})
}
