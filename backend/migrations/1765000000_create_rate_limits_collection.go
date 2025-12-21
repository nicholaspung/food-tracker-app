package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Create rate_limits collection for persistent rate limiting
		collection := core.NewBaseCollection("rate_limits")

		// Set collection rules (admin-only access for security)
		collection.ListRule = nil
		collection.ViewRule = nil
		collection.CreateRule = nil
		collection.UpdateRule = nil
		collection.DeleteRule = nil

		// Add ip_address field (text, required, unique)
		collection.Fields.Add(&core.TextField{
			Name:     "ip_address",
			Required: true,
			Pattern:  `^\S+$`, // No whitespace allowed
			Min:      7,       // Minimum for IPv4: x.x.x.x
			Max:      45,      // Maximum for IPv6
		})

		// Add attempts field (number)
		minAttempts := float64(0)
		maxAttempts := float64(1000)
		collection.Fields.Add(&core.NumberField{
			Name:     "attempts",
			Required: true,
			Min:      &minAttempts,
			Max:      &maxAttempts, // Reasonable upper limit
		})

		// Add locked_until field (number for Unix timestamp, 0 means not locked)
		minLockedUntil := float64(0)
		collection.Fields.Add(&core.NumberField{
			Name:     "locked_until",
			Required: true,
			Min:      &minLockedUntil,
		})

		// Add last_attempt_at field (date for tracking last attempt time)
		collection.Fields.Add(&core.DateField{
			Name:     "last_attempt_at",
			Required: false,
		})

		// Create unique index on ip_address to prevent duplicates
		collection.Indexes = []string{
			"CREATE UNIQUE INDEX idx_rate_limits_ip ON rate_limits (ip_address)",
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created rate_limits collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove rate_limits collection
		collection, err := app.FindCollectionByNameOrId("rate_limits")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted rate_limits collection")
		return nil
	})
}
