package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Get all users
		users, err := app.FindRecordsByFilter(
			"users",
			"",
			"",
			0,
			0,
		)
		if err != nil {
			return err
		}

		// Update each user to have the default visibility preference
		for _, user := range users {
			// Only update if the field is not already set
			if user.GetString("defaultVisitVisibility") == "" {
				user.Set("defaultVisitVisibility", "friends")
				if err := app.Save(user); err != nil {
					log.Printf("Warning: Failed to update user %s: %v", user.Id, err)
				}
			}
		}

		log.Printf("✓ Backfilled defaultVisitVisibility for %d users", len(users))
		return nil
	}, func(app core.App) error {
		// Down migration - no action needed
		log.Println("✓ No action needed for down migration")
		return nil
	})
}
