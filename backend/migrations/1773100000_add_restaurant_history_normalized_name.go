package migrations

import (
	"log"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"

	"myapp/lib"
)

const restaurantsHistoryNormalizedNameIndex = "CREATE INDEX idx_restaurants_history_normalized_name ON restaurants (historyNormalizedName)"

type restaurantHistoryNameMigrationRow struct {
	ID   string `db:"id"`
	Name string `db:"name"`
}

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		if collection.Fields.GetByName("historyNormalizedName") == nil {
			collection.Fields.Add(&core.TextField{
				Name:   "historyNormalizedName",
				Hidden: true,
				Max:    200,
			})
		}
		if !hasCollectionIndex(collection.Indexes, restaurantsHistoryNormalizedNameIndex) {
			collection.Indexes = append(collection.Indexes, restaurantsHistoryNormalizedNameIndex)
		}
		if err := app.Save(collection); err != nil {
			return err
		}

		rows := []restaurantHistoryNameMigrationRow{}
		if err := app.DB().NewQuery(`SELECT id, name FROM restaurants`).All(&rows); err != nil {
			return err
		}
		for _, row := range rows {
			if _, err := app.DB().NewQuery(`
				UPDATE restaurants
				SET historyNormalizedName = {:normalizedName}
				WHERE id = {:restaurantId}
			`).Bind(dbx.Params{
				"normalizedName": lib.NormalizeRestaurantHistoryName(row.Name),
				"restaurantId":   row.ID,
			}).Execute(); err != nil {
				return err
			}
		}

		log.Println("✓ Added indexed Restaurant history normalized names")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		collection.Indexes = removeCollectionIndex(collection.Indexes, restaurantsHistoryNormalizedNameIndex)
		collection.Fields.RemoveByName("historyNormalizedName")
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed indexed Restaurant history normalized names")
		return nil
	})
}
