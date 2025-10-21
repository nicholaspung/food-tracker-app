package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Delete ratings collection (no longer needed, merged into food_items)
		collection, err := app.FindCollectionByNameOrId("ratings")
		if err != nil {
			// Collection doesn't exist, skip
			log.Println("✓ Ratings collection does not exist, skipping deletion")
			return nil
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted ratings collection (ratings now part of food_items)")
		return nil
	}, func(app core.App) error {
		// Down migration - we can't restore the ratings collection without data loss
		log.Println("✓ Cannot restore ratings collection (data would be lost)")
		return nil
	})
}
