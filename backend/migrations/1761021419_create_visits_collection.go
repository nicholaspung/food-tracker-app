package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create visits collection
		collection := core.NewBaseCollection("visits")

		// Set collection rules (authenticated users can manage their own visits)
		collection.ListRule = types.Pointer("user = @request.auth.id")
		collection.ViewRule = types.Pointer("user = @request.auth.id")
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

		// Add visitDate field (date, required)
		collection.Fields.Add(&core.DateField{
			Name:     "visitDate",
			Required: true,
		})

		// Add notes field (text, optional - for overall visit notes)
		collection.Fields.Add(&core.TextField{
			Name:     "notes",
			Required: false,
			Max:      1000,
		})

		// Add created timestamp field (auto-managed by PocketBase)
		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})

		// Add updated timestamp field (auto-managed by PocketBase)
		collection.Fields.Add(&core.AutodateField{
			Name:     "updated",
			OnUpdate: true,
		})

		// Add restaurant field (relation to restaurants)
		restaurantsCollection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			log.Printf("Warning: Could not find restaurants collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "restaurant",
				CollectionId:  restaurantsCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete visits when restaurant is deleted
			})
		}

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
				CascadeDelete: true, // Delete visits when user is deleted
			})
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created visits collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove visits collection
		collection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted visits collection")
		return nil
	})
}
