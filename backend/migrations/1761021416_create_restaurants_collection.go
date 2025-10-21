package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create restaurants collection
		collection := core.NewBaseCollection("restaurants")

		// Set collection rules (authenticated users can manage their own restaurants)
		collection.ListRule = types.Pointer("@request.auth.id != ''")
		collection.ViewRule = types.Pointer("@request.auth.id != ''")
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

		// Add name field (text, required)
		collection.Fields.Add(&core.TextField{
			Name:     "name",
			Required: true,
			Min:      1,
			Max:      200,
		})

		// Add location field (text, required)
		collection.Fields.Add(&core.TextField{
			Name:     "location",
			Required: true,
			Min:      1,
			Max:      300,
		})

		// Add cuisineType field (text, optional)
		collection.Fields.Add(&core.TextField{
			Name:     "cuisineType",
			Required: false,
			Max:      100,
		})

		// Add user field (relation to users)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "user",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete restaurants when user is deleted
			})
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created restaurants collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove restaurants collection
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted restaurants collection")
		return nil
	})
}
