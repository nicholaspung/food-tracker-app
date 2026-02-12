package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewBaseCollection("tasting_session_invites")

		collection.ListRule = types.Pointer("@request.auth.id != ''")
		collection.ViewRule = types.Pointer("@request.auth.id != ''")
		collection.CreateRule = types.Pointer("@request.auth.id != '' && session.leader = @request.auth.id")
		collection.UpdateRule = types.Pointer("session.leader = @request.auth.id")
		collection.DeleteRule = types.Pointer("session.leader = @request.auth.id")

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
			Name:     "code",
			Required: true,
			Max:      10,
			Pattern:  "^[A-Z0-9]{6}$",
		})

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "created_by",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true,
			})

			collection.Fields.Add(&core.RelationField{
				Name:          "used_by",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false,
			})
		}

		collection.Fields.Add(&core.DateField{
			Name:     "expires_at",
			Required: true,
		})

		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created tasting_session_invites collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("tasting_session_invites")
		if err != nil {
			return err
		}
		if err := app.Delete(collection); err != nil {
			return err
		}
		log.Println("✓ Deleted tasting_session_invites collection")
		return nil
	})
}
