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

		if collection.Fields.GetByName("defaultHomeFeedMode") == nil {
			collection.Fields.Add(&core.SelectField{
				Name:      "defaultHomeFeedMode",
				Required:  false,
				Values:    []string{"mine", "friends"},
				MaxSelect: 1,
			})
		}

		if collection.Fields.GetByName("defaultHomeFeedTypeFilter") == nil {
			collection.Fields.Add(&core.SelectField{
				Name:      "defaultHomeFeedTypeFilter",
				Required:  false,
				Values:    []string{"all", "visits", "food-products"},
				MaxSelect: 1,
			})
		}

		if collection.Fields.GetByName("defaultHomeFeedSort") == nil {
			collection.Fields.Add(&core.SelectField{
				Name:      "defaultHomeFeedSort",
				Required:  false,
				Values:    []string{"created", "tracked"},
				MaxSelect: 1,
			})
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		users, err := app.FindRecordsByFilter("users", "", "", 0, 0)
		if err != nil {
			return err
		}

		for _, user := range users {
			changed := false
			if user.GetString("defaultHomeFeedMode") == "" {
				user.Set("defaultHomeFeedMode", "mine")
				changed = true
			}
			if user.GetString("defaultHomeFeedTypeFilter") == "" {
				user.Set("defaultHomeFeedTypeFilter", "visits")
				changed = true
			}
			if user.GetString("defaultHomeFeedSort") == "" {
				user.Set("defaultHomeFeedSort", "created")
				changed = true
			}
			if changed {
				if err := app.Save(user); err != nil {
					log.Printf("Warning: Failed to update user %s: %v", user.Id, err)
				}
			}
		}

		log.Printf("✓ Added and backfilled Home feed default fields for %d users", len(users))
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		for _, fieldName := range []string{
			"defaultHomeFeedMode",
			"defaultHomeFeedTypeFilter",
			"defaultHomeFeedSort",
		} {
			if field := collection.Fields.GetByName(fieldName); field != nil {
				collection.Fields.RemoveById(field.GetId())
			}
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed Home feed default fields from users collection")
		return nil
	})
}
