package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Find the menu_items collection
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		// Get all menu items
		records, err := app.FindAllRecords(collection.Name)
		if err != nil {
			return err
		}

		log.Printf("Found %d menu items to backfill", len(records))

		// Update each record
		for _, record := range records {
			// Set visibility to "public" for all existing items (maintains current shared behavior)
			record.Set("visibility", "public")

			// Try to set createdBy to the restaurant owner if possible
			restaurantId := record.GetString("restaurant")
			if restaurantId != "" {
				// Find the restaurant to get its createdBy
				restaurant, err := app.FindRecordById("restaurants", restaurantId)
				if err == nil {
					createdBy := restaurant.GetString("createdBy")
					if createdBy != "" {
						record.Set("createdBy", createdBy)
					}
				}
			}

			if err := app.Save(record); err != nil {
				log.Printf("Warning: Failed to update menu item %s: %v", record.Id, err)
			}
		}

		log.Println("✓ Backfilled visibility (public) and createdBy for existing menu items")
		return nil
	}, func(app core.App) error {
		// Down migration - clear visibility and createdBy
		_, err := app.DB().NewQuery("UPDATE menu_items SET visibility = NULL, createdBy = NULL").Execute()
		if err != nil {
			return err
		}

		log.Println("✓ Cleared visibility and createdBy from menu items")
		return nil
	})
}
