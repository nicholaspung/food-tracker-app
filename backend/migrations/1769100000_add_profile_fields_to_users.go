package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.Fields.Add(&core.TextField{
			Name:     "bio",
			Required: false,
			Max:      500,
		})

		collection.Fields.Add(&core.TextField{
			Name:     "location",
			Required: false,
			Max:      200,
		})

		collection.Fields.Add(&core.TextField{
			Name:     "favoriteCuisine",
			Required: false,
			Max:      120,
		})

		collection.Fields.Add(&core.BoolField{
			Name:     "receiveMarketingEmails",
			Required: false,
		})

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added profile fields to users collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.Fields.RemoveByName("bio")
		collection.Fields.RemoveByName("location")
		collection.Fields.RemoveByName("favoriteCuisine")
		collection.Fields.RemoveByName("receiveMarketingEmails")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed profile fields from users collection")
		return nil
	})
}
