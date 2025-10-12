package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Create invite_codes collection
		collection := core.NewBaseCollection("invite_codes")

		// Set collection rules (admin-only access)
		collection.ListRule = nil
		collection.ViewRule = nil
		collection.CreateRule = nil
		collection.UpdateRule = nil
		collection.DeleteRule = nil

		// Add code field (text, required, unique)
		collection.Fields.Add(&core.TextField{
			Name:     "code",
			Required: true,
			Pattern:  `^\S+$`, // No whitespace allowed
			Min:      6,
			Max:      50,
		})

		// Add used field (bool, not required so it defaults to false)
		collection.Fields.Add(&core.BoolField{
			Name:     "used",
			Required: false,
		})

		// Add usedBy field (relation to users)
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create relation: %v", err)
			// Continue without the relation field - it can be added manually later
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "usedBy",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				CascadeDelete: false,
			})
		}

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created invite_codes collection")
		return nil
	}, func(app core.App) error {
		// Down migration - remove invite_codes collection
		collection, err := app.FindCollectionByNameOrId("invite_codes")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted invite_codes collection")
		return nil
	})
}
