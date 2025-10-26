package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Backfill all existing visits with visibility='friends'
		// This ensures old visits (created before the visibility feature) are visible to friends

		// Get all visits that have empty or NULL visibility
		records, err := app.FindAllRecords("visits")
		if err != nil {
			return err
		}

		updatedCount := 0
		for _, record := range records {
			visibility := record.GetString("visibility")
			// If visibility is empty, set it to 'friends'
			if visibility == "" {
				record.Set("visibility", "friends")
				if err := app.Save(record); err != nil {
					log.Printf("Warning: Failed to update visit %s: %v", record.Id, err)
				} else {
					updatedCount++
				}
			}
		}

		log.Printf("✓ Backfilled visibility field for %d visits", updatedCount)
		return nil
	}, func(app core.App) error {
		// Down migration - no action needed
		// We don't want to remove the visibility values we just set
		log.Println("✓ Skipping down migration for visibility backfill")
		return nil
	})
}
