package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create notes collection
		collection := core.NewBaseCollection("notes")

		// Set collection rules (authenticated users can manage their own notes)
		collection.ListRule = types.Pointer("user = @request.auth.id")
		collection.ViewRule = types.Pointer("user = @request.auth.id")
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

		// Add content field (text, required, max 2000 chars)
		collection.Fields.Add(&core.TextField{
			Name:     "content",
			Required: true,
			Max:      2000,
		})

		// Add location_text field (text, optional, max 200 chars)
		collection.Fields.Add(&core.TextField{
			Name:     "location_text",
			Required: false,
			Max:      200,
		})

		// Add latitude field (number, optional)
		collection.Fields.Add(&core.NumberField{
			Name:     "latitude",
			Required: false,
		})

		// Add longitude field (number, optional)
		collection.Fields.Add(&core.NumberField{
			Name:     "longitude",
			Required: false,
		})

		// Add status field (select, required)
		collection.Fields.Add(&core.SelectField{
			Name:     "status",
			Required: true,
			Values:   []string{"draft", "used"},
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
				CascadeDelete: true, // Delete notes when user is deleted
			})
		}

		// Add restaurant field (relation to restaurants, optional)
		restaurantsCollection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			log.Printf("Warning: Could not find restaurants collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "restaurant",
				CollectionId:  restaurantsCollection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false,
			})
		}

		// Add usedInVisit field (relation to visits, optional)
		visitsCollection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			log.Printf("Warning: Could not find visits collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "usedInVisit",
				CollectionId:  visitsCollection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false,
			})
		}

		// Add usedInFoodItem field (relation to food_items, optional)
		foodItemsCollection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			log.Printf("Warning: Could not find food_items collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "usedInFoodItem",
				CollectionId:  foodItemsCollection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false,
			})
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Created notes collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove notes collection
		collection, err := app.FindCollectionByNameOrId("notes")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("Deleted notes collection")
		return nil
	})
}
