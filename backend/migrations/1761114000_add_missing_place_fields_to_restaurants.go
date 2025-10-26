package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		// Add placeId field (text, optional - for Google Places integration)
		collection.Fields.Add(&core.TextField{
			Name:     "placeId",
			Required: false,
			Max:      200,
		})

		// Add latitude field (number, optional - for location-based features)
		collection.Fields.Add(&core.NumberField{
			Name:     "latitude",
			Required: false,
			Min:      types.Pointer(-90.0),
			Max:      types.Pointer(90.0),
		})

		// Add longitude field (number, optional - for location-based features)
		collection.Fields.Add(&core.NumberField{
			Name:     "longitude",
			Required: false,
			Min:      types.Pointer(-180.0),
			Max:      types.Pointer(180.0),
		})

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added placeId, latitude, and longitude fields to restaurants collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove the fields
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		// Remove the fields
		collection.Fields.RemoveById("placeId")
		collection.Fields.RemoveById("latitude")
		collection.Fields.RemoveById("longitude")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed placeId, latitude, and longitude fields from restaurants collection")
		return nil
	})
}
