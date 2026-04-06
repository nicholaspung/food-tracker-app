package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const visitPhotosUserFoodItemCreatedIndex = "CREATE INDEX idx_visit_photos_user_food_item_created ON visit_photos (user, food_item, created)"

func init() {
	m.Register(func(app core.App) error {
		if err := addCollectionIndexes(app, "visit_photos", visitPhotosUserFoodItemCreatedIndex); err != nil {
			return err
		}

		log.Println("✓ Added visit_photos indexes")
		return nil
	}, func(app core.App) error {
		if err := removeCollectionIndexes(app, "visit_photos", visitPhotosUserFoodItemCreatedIndex); err != nil {
			return err
		}

		log.Println("✓ Removed visit_photos indexes")
		return nil
	})
}
