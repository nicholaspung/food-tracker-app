package migrations

import (
	"log"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const fixedListFoodItemUniqueIndex = "CREATE UNIQUE INDEX idx_list_food_item ON list_items (list, foodItem) WHERE foodItem IS NOT NULL AND foodItem != ''"

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("list_items")
		if err != nil {
			return err
		}

		nextIndexes := make([]string, 0, len(collection.Indexes))
		replaced := false
		for _, index := range collection.Indexes {
			if strings.Contains(index, "idx_list_food_item") {
				nextIndexes = append(nextIndexes, fixedListFoodItemUniqueIndex)
				replaced = true
				continue
			}
			nextIndexes = append(nextIndexes, index)
		}
		if !replaced {
			nextIndexes = append(nextIndexes, fixedListFoodItemUniqueIndex)
		}
		collection.Indexes = nextIndexes

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Fixed list_items foodItem unique index to ignore blank bookmarks")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("list_items")
		if err != nil {
			return err
		}

		legacyIndex := "CREATE UNIQUE INDEX idx_list_food_item ON list_items (list, foodItem) WHERE foodItem IS NOT NULL"
		for index, value := range collection.Indexes {
			if strings.Contains(value, "idx_list_food_item") {
				collection.Indexes[index] = legacyIndex
				break
			}
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Restored legacy list_items foodItem unique index")
		return nil
	})
}
