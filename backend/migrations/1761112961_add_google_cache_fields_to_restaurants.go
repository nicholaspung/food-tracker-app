package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		// Add isGooglePlace field (boolean) to track if this is from Google Places API
		collection.Fields.Add(&core.BoolField{
			Name:     "isGooglePlace",
			Required: false,
		})

		// Add googlePlaceCachedAt field (datetime) to track when Google data was last fetched
		collection.Fields.Add(&core.DateField{
			Name:     "googlePlaceCachedAt",
			Required: false,
		})

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added Google Places cache fields to restaurants collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove the fields
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		// Remove the fields
		collection.Fields.RemoveById("isGooglePlace")
		collection.Fields.RemoveById("googlePlaceCachedAt")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed Google Places cache fields from restaurants collection")
		return nil
	})
}
