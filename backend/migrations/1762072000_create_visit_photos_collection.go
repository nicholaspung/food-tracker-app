package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create visit_photos collection
		collection := core.NewBaseCollection("visit_photos")

		// Set collection rules (authenticated users can manage their own photos)
		collection.ListRule = types.Pointer("user = @request.auth.id")
		collection.ViewRule = types.Pointer("user = @request.auth.id")
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

		// Add photo field (file, required, max 3MB)
		collection.Fields.Add(&core.FileField{
			Name:      "photo",
			Required:  true,
			MaxSelect: 1,
			MaxSize:   3145728, // 3MB in bytes
			MimeTypes: []string{
				"image/jpeg",
				"image/png",
				"image/webp",
			},
		})

		// Add caption field (text, optional)
		collection.Fields.Add(&core.TextField{
			Name:     "caption",
			Required: false,
			Max:      500,
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
				CascadeDelete: true, // Delete photos when visit is deleted
			})
		}

		// Add food_item field (relation to food_items)
		foodItemsCollection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			log.Printf("Warning: Could not find food_items collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "food_item",
				CollectionId:  foodItemsCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete photos when food item is deleted
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
				CascadeDelete: true, // Delete photos when user is deleted
			})
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created visit_photos collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove visit_photos collection
		collection, err := app.FindCollectionByNameOrId("visit_photos")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted visit_photos collection")
		return nil
	})
}
