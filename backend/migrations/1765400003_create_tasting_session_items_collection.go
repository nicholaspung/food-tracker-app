package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewBaseCollection("tasting_session_items")

		collection.ListRule = types.Pointer("@request.auth.id != ''")
		collection.ViewRule = types.Pointer("@request.auth.id != ''")
		collection.CreateRule = types.Pointer("@request.auth.id != '' && added_by = @request.auth.id")
		collection.UpdateRule = types.Pointer("added_by = @request.auth.id")
		collection.DeleteRule = types.Pointer("added_by = @request.auth.id || session.leader = @request.auth.id")

		tastingSessionsCollection, err := app.FindCollectionByNameOrId("tasting_sessions")
		if err != nil {
			log.Printf("Warning: Could not find tasting_sessions collection: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "session",
				CollectionId:  tastingSessionsCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true,
			})
		}

		collection.Fields.Add(&core.TextField{
			Name:     "name",
			Required: true,
			Max:      300,
		})

		collection.Fields.Add(&core.TextField{
			Name:     "description",
			Required: false,
			Max:      500,
		})

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "added_by",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true,
			})
		}

		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created tasting_session_items collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("tasting_session_items")
		if err != nil {
			return err
		}
		if err := app.Delete(collection); err != nil {
			return err
		}
		log.Println("✓ Deleted tasting_session_items collection")
		return nil
	})
}
