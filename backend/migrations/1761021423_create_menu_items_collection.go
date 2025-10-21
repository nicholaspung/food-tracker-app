package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Create menu_items collection (shared menu database)
		collection := core.NewBaseCollection("menu_items")

		// Set collection rules (all authenticated users can view and create)
		// This is a shared menu database - anyone can contribute
		collection.ListRule = types.Pointer("@request.auth.id != ''")   // Any authenticated user can list
		collection.ViewRule = types.Pointer("@request.auth.id != ''")   // Any authenticated user can view
		collection.CreateRule = types.Pointer("@request.auth.id != ''") // Any authenticated user can create
		collection.UpdateRule = nil                                     // No one can update (menu items are immutable once created)
		collection.DeleteRule = nil                                     // No one can delete (preserve menu history)

		// Add name field (text, required)
		collection.Fields.Add(&core.TextField{
			Name:     "name",
			Required: true,
			Min:      1,
			Max:      200,
			Pattern:  `^.+$`, // At least one character
		})

		// Add description field (text, optional)
		collection.Fields.Add(&core.TextField{
			Name:     "description",
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
				CascadeDelete: true, // Delete menu items when restaurant is deleted
			})
		}

		// Add sourceImage field (relation to menu_images, optional)
		// Tracks which menu image this item was extracted from
		menuImagesCollection, err := app.FindCollectionByNameOrId("menu_images")
		if err != nil {
			log.Printf("Warning: Could not find menu_images collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "sourceImage",
				CollectionId:  menuImagesCollection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false, // Keep menu items even if source image is deleted
			})
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created menu_items collection (shared menu database)")
		return nil
	}, func(app core.App) error {
		// Down migration - remove menu_items collection
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted menu_items collection")
		return nil
	})
}
