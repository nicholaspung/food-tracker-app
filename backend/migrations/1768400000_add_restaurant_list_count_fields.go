package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("restaurant_lists")
		if err != nil {
			return err
		}

		zero := float64(0)
		collection.Fields.Add(&core.NumberField{
			Name:     "restaurantCount",
			Required: false,
			OnlyInt:  true,
			Min:      &zero,
		})
		collection.Fields.Add(&core.NumberField{
			Name:     "menuItemCount",
			Required: false,
			OnlyInt:  true,
			Min:      &zero,
		})

		if err := app.Save(collection); err != nil {
			return err
		}

		if _, err := app.DB().NewQuery(`
			UPDATE restaurant_lists
			SET
				"restaurantCount" = COALESCE(
					(
						SELECT COUNT(DISTINCT restaurant)
						FROM list_items
						WHERE "list" = restaurant_lists.id
					),
					0
				),
				"menuItemCount" = COALESCE(
					(
						SELECT COUNT(*)
						FROM list_items
						WHERE "list" = restaurant_lists.id
					),
					0
				)
		`).Execute(); err != nil {
			return err
		}

		log.Println("Added restaurant list count fields")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("restaurant_lists")
		if err != nil {
			return err
		}

		collection.Fields.RemoveByName("restaurantCount")
		collection.Fields.RemoveByName("menuItemCount")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Removed restaurant list count fields")
		return nil
	})
}
