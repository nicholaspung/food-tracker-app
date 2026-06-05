package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const menuItemsGroupSuitableIndex = "CREATE INDEX idx_menu_items_group_suitable ON menu_items (restaurant, LOWER(TRIM(name))) WHERE approvalStatus = 'approved' AND visibility = 'public' AND groupSuitable = TRUE"

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		if collection.Fields.GetByName("groupSuitable") == nil {
			collection.Fields.Add(&core.BoolField{
				Name: "groupSuitable",
			})
		}
		if !hasCollectionIndex(collection.Indexes, menuItemsGroupSuitableIndex) {
			collection.Indexes = append(collection.Indexes, menuItemsGroupSuitableIndex)
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Added menu item group-suitable field")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		collection.Indexes = removeCollectionIndex(collection.Indexes, menuItemsGroupSuitableIndex)
		collection.Fields.RemoveByName("groupSuitable")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Removed menu item group-suitable field")
		return nil
	})
}
