package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create ratings collection
		collection := core.NewBaseCollection("ratings")

		// Set collection rules (authenticated users can manage their own ratings)
		collection.ListRule = types.Pointer("@request.auth.id != ''")
		collection.ViewRule = types.Pointer("@request.auth.id != ''")
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

		// Add rating field (number, required, 1-5)
		collection.Fields.Add(&core.NumberField{
			Name:     "rating",
			Required: true,
			Min:      types.Pointer(1.0),
			Max:      types.Pointer(5.0),
		})

		// Add notes field (text, optional)
		collection.Fields.Add(&core.TextField{
			Name:     "notes",
			Required: false,
			Max:      1000,
		})

		// Add visitDate field (date, required)
		collection.Fields.Add(&core.DateField{
			Name:     "visitDate",
			Required: true,
		})

		// Add food_item field (relation to food_items)
		foodItemsCollection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			log.Printf("Warning: Could not find food_items collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "foodItem",
				CollectionId:  foodItemsCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete ratings when food item is deleted
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
				CascadeDelete: true, // Delete ratings when user is deleted
			})
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created ratings collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove ratings collection
		collection, err := app.FindCollectionByNameOrId("ratings")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted ratings collection")
		return nil
	})
}
