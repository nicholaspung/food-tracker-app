package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		menuItemsCollection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		if collection.Fields.GetByName("menuItem") == nil {
			collection.Fields.Add(&core.RelationField{
				Name:          "menuItem",
				CollectionId:  menuItemsCollection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false,
			})
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		if _, err := app.DB().NewQuery(`
			CREATE INDEX IF NOT EXISTS idx_food_items_menu_item
			ON food_items (menuItem)
			WHERE menuItem IS NOT NULL AND menuItem != ''
		`).Execute(); err != nil {
			return err
		}

		log.Println("Added food_items.menuItem relation")
		return nil
	}, func(app core.App) error {
		if _, err := app.DB().NewQuery("DROP INDEX IF EXISTS idx_food_items_menu_item").Execute(); err != nil {
			return err
		}

		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		collection.Fields.RemoveByName("menuItem")
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Removed food_items.menuItem relation")
		return nil
	})
}
