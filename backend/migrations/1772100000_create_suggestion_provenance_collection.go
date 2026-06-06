package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	suggestionProvenanceVisitItemSourceIndex  = "CREATE UNIQUE INDEX idx_suggestion_provenance_visit_item_source ON suggestion_provenance (visitItem, sourceMenuItem)"
	suggestionProvenanceTargetRestaurantIndex = "CREATE INDEX idx_suggestion_provenance_target_restaurant ON suggestion_provenance (targetRestaurant, normalizedItemName)"
)

func init() {
	m.Register(func(app core.App) error {
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		restaurantsCollection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}
		visitsCollection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			return err
		}
		foodItemsCollection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}
		menuItemsCollection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}
		restaurantGroupsCollection, err := app.FindCollectionByNameOrId("restaurant_groups")
		if err != nil {
			return err
		}

		collection := core.NewBaseCollection("suggestion_provenance")
		collection.ListRule = types.Pointer("@request.auth.isAdmin = true")
		collection.ViewRule = types.Pointer("@request.auth.isAdmin = true")
		collection.CreateRule = nil
		collection.UpdateRule = nil
		collection.DeleteRule = nil

		collection.Fields.Add(&core.SelectField{
			Name:      "sourceType",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"group_menu_suggestion"},
		})
		collection.Fields.Add(&core.TextField{
			Name:     "normalizedItemName",
			Required: true,
			Min:      1,
			Max:      300,
		})
		collection.Fields.Add(&core.RelationField{
			Name:          "user",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: true,
		})
		collection.Fields.Add(&core.RelationField{
			Name:          "visit",
			CollectionId:  visitsCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: true,
		})
		collection.Fields.Add(&core.RelationField{
			Name:          "visitItem",
			CollectionId:  foodItemsCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: true,
		})
		collection.Fields.Add(&core.RelationField{
			Name:          "targetRestaurant",
			CollectionId:  restaurantsCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: false,
		})
		collection.Fields.Add(&core.RelationField{
			Name:          "sourceRestaurant",
			CollectionId:  restaurantsCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: false,
		})
		collection.Fields.Add(&core.RelationField{
			Name:          "sourceMenuItem",
			CollectionId:  menuItemsCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: false,
		})
		collection.Fields.Add(&core.RelationField{
			Name:          "restaurantGroup",
			CollectionId:  restaurantGroupsCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: false,
		})
		collection.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		collection.Indexes = []string{
			suggestionProvenanceVisitItemSourceIndex,
			suggestionProvenanceTargetRestaurantIndex,
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Created suggestion provenance collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("suggestion_provenance")
		if err != nil {
			return err
		}
		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("Deleted suggestion provenance collection")
		return nil
	})
}
