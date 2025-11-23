package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Get food_items collection
		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		// Make visit field optional for Quick Track support
		visitField := collection.Fields.GetByName("visit")
		if visitField != nil {
			if relationField, ok := visitField.(*core.RelationField); ok {
				relationField.Required = false
				log.Println("✓ Made visit field optional in food_items")
			}
		}

		// Add itemCategory field (for Quick Track: convenience_store, packaged_food, homemade, restaurant, recipe, etc.)
		collection.Fields.Add(&core.SelectField{
			Name:     "itemCategory",
			Required: false,
			MaxSelect: 1,
			Values: []string{
				"restaurant",
				"convenience_store",
				"packaged_food",
				"homemade",
				"recipe",
				"other",
			},
		})

		// Add location_text field (optional text for non-restaurant locations)
		collection.Fields.Add(&core.TextField{
			Name:     "location_text",
			Required: false,
			Max:      200,
		})

		// Add latitude field (optional GPS coordinate)
		collection.Fields.Add(&core.NumberField{
			Name:     "latitude",
			Required: false,
			Min:      types.Pointer(-90.0),
			Max:      types.Pointer(90.0),
		})

		// Add longitude field (optional GPS coordinate)
		collection.Fields.Add(&core.NumberField{
			Name:     "longitude",
			Required: false,
			Min:      types.Pointer(-180.0),
			Max:      types.Pointer(180.0),
		})

		// Update rules to handle items without visits (Quick Track mode)
		// Users can still only see/manage their own items
		collection.ListRule = types.Pointer("user = @request.auth.id")
		collection.ViewRule = types.Pointer("user = @request.auth.id")
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

		// Save the collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added Quick Track support to food_items collection")
		return nil
	}, func(app core.App) error {
		// Down migration - revert changes
		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		// Make visit field required again
		visitField := collection.Fields.GetByName("visit")
		if visitField != nil {
			if relationField, ok := visitField.(*core.RelationField); ok {
				relationField.Required = true
			}
		}

		// Remove new fields
		collection.Fields.RemoveByName("itemCategory")
		collection.Fields.RemoveByName("location_text")
		collection.Fields.RemoveByName("latitude")
		collection.Fields.RemoveByName("longitude")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted Quick Track changes from food_items")
		return nil
	})
}
