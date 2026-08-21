package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create menu_images collection
		collection := core.NewBaseCollection("menu_images")

		// Menu Scan Source Images are created only by the trusted parse-menu workflow.
		collection.ListRule = types.Pointer("@request.auth.id != ''") // Any authenticated user can list
		collection.ViewRule = types.Pointer("@request.auth.id != ''") // Any authenticated user can view
		collection.CreateRule = nil
		collection.UpdateRule = types.Pointer("uploadedBy = @request.auth.id")
		collection.DeleteRule = types.Pointer("uploadedBy = @request.auth.id")

		// Add image field (file, required)
		collection.Fields.Add(&core.FileField{
			Name:      "image",
			Required:  true,
			MaxSelect: 1,
			MaxSize:   5242880, // 5MB
			MimeTypes: []string{"image/jpeg", "image/png", "image/webp"},
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
				CascadeDelete: true, // Delete menu images when restaurant is deleted
			})
		}

		// Add uploadedBy field (relation to users)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "uploadedBy",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      true,
				CascadeDelete: true, // Delete menu images when user is deleted
			})
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created menu_images collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove menu_images collection
		collection, err := app.FindCollectionByNameOrId("menu_images")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted menu_images collection")
		return nil
	})
}
