package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	recommendationUsageActorActionIndex = "CREATE INDEX idx_recommendation_usage_actor_action ON recommendation_usage (actor, action, actedAt)"
	recommendationUsageSourceUserIndex  = "CREATE INDEX idx_recommendation_usage_source_user ON recommendation_usage (sourceUser, action, actedAt) WHERE sourceUser IS NOT NULL AND sourceUser != ''"
	recommendationUsageTargetListIndex  = "CREATE INDEX idx_recommendation_usage_target_list ON recommendation_usage (targetRestaurantList, targetRestaurant, action, actedAt)"
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
		restaurantListsCollection, err := app.FindCollectionByNameOrId("restaurant_lists")
		if err != nil {
			return err
		}
		listItemsCollection, err := app.FindCollectionByNameOrId("list_items")
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

		collection := core.NewBaseCollection("recommendation_usage")
		collection.ListRule = types.Pointer("@request.auth.isAdmin = true || actor = @request.auth.id || sourceUser = @request.auth.id")
		collection.ViewRule = collection.ListRule
		collection.CreateRule = nil
		collection.UpdateRule = nil
		collection.DeleteRule = nil

		collection.Fields.Add(&core.SelectField{
			Name:      "kind",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"saved_recommendation"},
		})
		collection.Fields.Add(&core.SelectField{
			Name:      "action",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"saved", "removed"},
		})
		collection.Fields.Add(&core.RelationField{Name: "actor", CollectionId: usersCollection.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		collection.Fields.Add(&core.RelationField{Name: "sourceUser", CollectionId: usersCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		collection.Fields.Add(&core.RelationField{Name: "sourceFoodItem", CollectionId: foodItemsCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		collection.Fields.Add(&core.RelationField{Name: "sourceMenuItem", CollectionId: menuItemsCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		collection.Fields.Add(&core.RelationField{Name: "sourceRestaurantList", CollectionId: restaurantListsCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		collection.Fields.Add(&core.RelationField{Name: "sourceListItem", CollectionId: listItemsCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		collection.Fields.Add(&core.RelationField{Name: "targetRestaurant", CollectionId: restaurantsCollection.Id, MaxSelect: 1, Required: true, CascadeDelete: false})
		collection.Fields.Add(&core.RelationField{Name: "targetRestaurantList", CollectionId: restaurantListsCollection.Id, MaxSelect: 1, Required: true, CascadeDelete: false})
		collection.Fields.Add(&core.RelationField{Name: "targetListItem", CollectionId: listItemsCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		collection.Fields.Add(&core.DateField{Name: "actedAt", Required: true})
		collection.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		collection.Indexes = []string{
			recommendationUsageActorActionIndex,
			recommendationUsageSourceUserIndex,
			recommendationUsageTargetListIndex,
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Created recommendation_usage collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("recommendation_usage")
		if err != nil {
			return err
		}
		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("Deleted recommendation_usage collection")
		return nil
	})
}
