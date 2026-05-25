package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const restaurantListsShareTokenIndex = "CREATE UNIQUE INDEX idx_restaurant_lists_share_token ON restaurant_lists (shareToken) WHERE shareToken != ''"

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("restaurant_lists")
		if err != nil {
			return err
		}

		if collection.Fields.GetByName("shareEnabled") == nil {
			collection.Fields.Add(&core.BoolField{Name: "shareEnabled"})
		}
		if collection.Fields.GetByName("shareToken") == nil {
			collection.Fields.Add(&core.TextField{Name: "shareToken", Max: 120})
		}
		if collection.Fields.GetByName("shareTokenCreatedAt") == nil {
			collection.Fields.Add(&core.DateField{Name: "shareTokenCreatedAt"})
		}
		if collection.Fields.GetByName("shareTokenUpdatedAt") == nil {
			collection.Fields.Add(&core.DateField{Name: "shareTokenUpdatedAt"})
		}

		if !hasCollectionIndex(collection.Indexes, restaurantListsShareTokenIndex) {
			collection.Indexes = append(collection.Indexes, restaurantListsShareTokenIndex)
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added Restaurant List share link fields")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("restaurant_lists")
		if err != nil {
			return err
		}

		collection.Indexes = removeCollectionIndex(collection.Indexes, restaurantListsShareTokenIndex)
		for _, fieldName := range []string{"shareEnabled", "shareToken", "shareTokenCreatedAt", "shareTokenUpdatedAt"} {
			if field := collection.Fields.GetByName(fieldName); field != nil {
				collection.Fields.RemoveById(field.GetId())
			}
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed Restaurant List share link fields")
		return nil
	})
}
