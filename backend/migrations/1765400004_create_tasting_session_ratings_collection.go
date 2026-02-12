package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewBaseCollection("tasting_session_ratings")

		// View own ratings always, all ratings when session is completed
		collection.ListRule = types.Pointer("@request.auth.id != '' && (user = @request.auth.id || session.status = 'completed')")
		collection.ViewRule = types.Pointer("@request.auth.id != '' && (user = @request.auth.id || session.status = 'completed')")
		collection.CreateRule = types.Pointer("@request.auth.id != '' && user = @request.auth.id")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

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

		tastingSessionItemsCollection, err := app.FindCollectionByNameOrId("tasting_session_items")
		if err != nil {
			log.Printf("Warning: Could not find tasting_session_items collection: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "item",
				CollectionId:  tastingSessionItemsCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true,
			})
		}

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "user",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true,
			})
		}

		collection.Fields.Add(&core.NumberField{
			Name:     "rating",
			Required: true,
			Min:      types.Pointer(float64(1)),
			Max:      types.Pointer(float64(5)),
		})

		collection.Fields.Add(&core.TextField{
			Name:     "notes",
			Required: false,
			Max:      500,
		})

		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})

		collection.Fields.Add(&core.AutodateField{
			Name:     "updated",
			OnUpdate: true,
		})

		if err := app.Save(collection); err != nil {
			return err
		}

		// Create unique index on (session, item, user)
		collection, err = app.FindCollectionByNameOrId("tasting_session_ratings")
		if err != nil {
			return err
		}

		collection.AddIndex("idx_unique_session_item_user", true, "session, item, user", "")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created tasting_session_ratings collection with unique index")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("tasting_session_ratings")
		if err != nil {
			return err
		}
		if err := app.Delete(collection); err != nil {
			return err
		}
		log.Println("✓ Deleted tasting_session_ratings collection")
		return nil
	})
}
