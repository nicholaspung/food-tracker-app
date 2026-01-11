package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("list_items")
		if err != nil {
			return err
		}

		// Add sourceUser field (relation to users, optional)
		// This tracks which friend the bookmark came from (null for user's own items)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "sourceUser",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      false, // Optional - null for user's own items
				CascadeDelete: false,
			})
		}

		// Update unique index from (list, restaurant) to (list, restaurant, sourceUser)
		// This allows the same restaurant to appear multiple times in a list if from different friends
		// Use COALESCE to handle NULL sourceUser (for user's own items) by treating empty string as the value
		// This prevents multiple entries with NULL sourceUser for the same (list, restaurant)
		collection.Indexes = []string{
			"CREATE UNIQUE INDEX idx_list_restaurant_source ON list_items (list, restaurant, COALESCE(sourceUser, ''))",
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added sourceUser field to list_items and updated unique index")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("list_items")
		if err != nil {
			return err
		}

		// Remove sourceUser field
		sourceUserField := collection.Fields.GetByName("sourceUser")
		if sourceUserField != nil {
			collection.Fields.RemoveById(sourceUserField.GetId())
		}

		// Restore original unique index
		collection.Indexes = []string{
			"CREATE UNIQUE INDEX idx_list_restaurant ON list_items (list, restaurant)",
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed sourceUser field from list_items and restored original unique index")
		return nil
	})
}
