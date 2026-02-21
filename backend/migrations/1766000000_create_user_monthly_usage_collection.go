package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewBaseCollection("user_monthly_usage")

		// Internal-only usage table.
		collection.ListRule = nil
		collection.ViewRule = nil
		collection.CreateRule = nil
		collection.UpdateRule = nil
		collection.DeleteRule = nil

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.Fields.Add(&core.RelationField{
			Name:          "user",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: true,
		})

		collection.Fields.Add(&core.TextField{
			Name:     "month_key",
			Required: true,
			Pattern:  `^\d{4}-\d{2}$`,
			Min:      7,
			Max:      7,
		})

		minZero := float64(0)
		collection.Fields.Add(&core.NumberField{
			Name:    "photo_uploads",
			Min:     &minZero,
			OnlyInt: true,
		})
		collection.Fields.Add(&core.NumberField{
			Name:    "places_queries",
			Min:     &minZero,
			OnlyInt: true,
		})
		collection.Fields.Add(&core.NumberField{
			Name:    "menu_scans",
			Min:     &minZero,
			OnlyInt: true,
		})

		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})
		collection.Fields.Add(&core.AutodateField{
			Name:     "updated",
			OnUpdate: true,
		})

		collection.Indexes = []string{
			"CREATE UNIQUE INDEX idx_user_monthly_usage_user_month ON user_monthly_usage (user, month_key)",
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created user_monthly_usage collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("user_monthly_usage")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted user_monthly_usage collection")
		return nil
	})
}
