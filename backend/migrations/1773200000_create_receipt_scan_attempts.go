package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewBaseCollection("receipt_scan_attempts")
		collection.ListRule = nil
		collection.ViewRule = nil
		collection.CreateRule = nil
		collection.UpdateRule = nil
		collection.DeleteRule = nil

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		collection.Fields.Add(&core.RelationField{
			Name:          "user",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: true,
		})
		collection.Fields.Add(&core.DateField{Name: "attempted_at", Required: true})
		collection.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		collection.Indexes = []string{
			"CREATE INDEX idx_receipt_scan_attempts_user_time ON receipt_scan_attempts (user, attempted_at)",
		}

		if err := app.Save(collection); err != nil {
			return err
		}
		log.Println("✓ Created receipt_scan_attempts collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("receipt_scan_attempts")
		if err != nil {
			return err
		}
		if err := app.Delete(collection); err != nil {
			return err
		}
		log.Println("✓ Deleted receipt_scan_attempts collection")
		return nil
	})
}
