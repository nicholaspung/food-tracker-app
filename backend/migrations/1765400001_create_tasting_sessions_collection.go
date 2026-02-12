package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewBaseCollection("tasting_sessions")

		collection.ListRule = types.Pointer("@request.auth.id != ''")
		collection.ViewRule = types.Pointer("leader = @request.auth.id")
		collection.CreateRule = types.Pointer("@request.auth.id != '' && leader = @request.auth.id")
		collection.UpdateRule = types.Pointer("leader = @request.auth.id")
		collection.DeleteRule = types.Pointer("leader = @request.auth.id")

		collection.Fields.Add(&core.TextField{
			Name:     "name",
			Required: true,
			Max:      200,
		})

		restaurantsCollection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			log.Printf("Warning: Could not find restaurants collection: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "restaurant",
				CollectionId:  restaurantsCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: false,
			})
		}

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "leader",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true,
			})
		}

		collection.Fields.Add(&core.SelectField{
			Name:      "status",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"adding_items", "rating", "completed"},
		})

		collection.Fields.Add(&core.BoolField{
			Name:     "locked",
			Required: false,
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

		log.Println("✓ Created tasting_sessions collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("tasting_sessions")
		if err != nil {
			return err
		}
		if err := app.Delete(collection); err != nil {
			return err
		}
		log.Println("✓ Deleted tasting_sessions collection")
		return nil
	})
}
