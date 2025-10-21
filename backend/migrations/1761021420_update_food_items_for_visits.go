package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Get existing food_items collection or create new one
		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			// Collection doesn't exist, create new one
			collection = core.NewBaseCollection("food_items")
			log.Println("✓ Creating new food_items collection")
		} else {
			// Collection exists, clear all fields to rebuild it
			collection.Fields = core.NewFieldsList()
			log.Println("✓ Found existing food_items collection, rebuilding fields")
		}

		// Set collection rules (authenticated users can manage their own food items)
		collection.ListRule = types.Pointer("user = @request.auth.id")
		collection.ViewRule = types.Pointer("user = @request.auth.id")
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

		// Add description field (text, optional)
		collection.Fields.Add(&core.TextField{
			Name:     "description",
			Required: false,
			Max:      500,
		})

		// Add rating field (number, required, 1-5)
		collection.Fields.Add(&core.NumberField{
			Name:     "rating",
			Required: true,
			Min:      types.Pointer(1.0),
			Max:      types.Pointer(5.0),
		})

		// Add notes field (text, optional - rating notes)
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

		// Add visit field (relation to visits)
		visitsCollection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			log.Printf("Warning: Could not find visits collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "visit",
				CollectionId:  visitsCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete food items when visit is deleted
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
				CascadeDelete: true, // Delete food items when user is deleted
			})
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Updated food_items collection for visits with ratings")
		return nil
	}, func(app core.App) error {
		// Down migration - revert to old food_items collection
		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted food_items collection changes")
		return nil
	})
}
