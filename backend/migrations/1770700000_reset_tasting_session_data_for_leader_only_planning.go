package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		for _, collectionName := range []string{
			"tasting_session_ratings",
			"tasting_session_items",
			"tasting_session_restaurants",
			"tasting_session_blocks",
			"tasting_session_invites",
			"tasting_session_participants",
			"tasting_sessions",
		} {
			deletedCount, err := deleteAllTastingSessionRecords(app, collectionName)
			if err != nil {
				return err
			}
			log.Printf("Deleted %d records from %s", deletedCount, collectionName)
		}

		log.Println("Reset group tasting session data for leader-only planning")
		return nil
	}, func(app core.App) error {
		log.Println("Skipping down migration for destructive group tasting session reset")
		return nil
	})
}

func deleteAllTastingSessionRecords(app core.App, collectionName string) (int, error) {
	records, err := app.FindRecordsByFilter(collectionName, "", "", 0, 0)
	if err != nil {
		return 0, err
	}

	deletedCount := 0
	for _, record := range records {
		if err := app.Delete(record); err != nil {
			return deletedCount, err
		}
		deletedCount++
	}

	return deletedCount, nil
}
