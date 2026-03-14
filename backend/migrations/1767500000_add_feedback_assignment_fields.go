package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("feedback")
		if err != nil {
			return err
		}

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.Fields.Add(&core.RelationField{
			Name:          "assigned_admin",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			Required:      false,
			CascadeDelete: false,
		})

		collection.Fields.Add(&core.DateField{
			Name:     "assigned_at",
			Required: false,
		})

		collection.Fields.Add(&core.DateField{
			Name:     "admin_reply_deadline_at",
			Required: false,
		})

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added feedback assignment fields")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("feedback")
		if err != nil {
			return err
		}

		collection.Fields.RemoveByName("assigned_admin")
		collection.Fields.RemoveByName("assigned_at")
		collection.Fields.RemoveByName("admin_reply_deadline_at")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed feedback assignment fields")
		return nil
	})
}
