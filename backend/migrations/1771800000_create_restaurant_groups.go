package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	restaurantGroupsNameIndex       = "CREATE INDEX idx_restaurant_groups_name_ci ON restaurant_groups (LOWER(name))"
	restaurantsRestaurantGroupIndex = "CREATE INDEX idx_restaurants_restaurant_group ON restaurants (restaurantGroup) WHERE restaurantGroup != ''"
)

func init() {
	m.Register(func(app core.App) error {
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		groupsCollection := core.NewBaseCollection("restaurant_groups")
		groupsCollection.ListRule = types.Pointer("@request.auth.isAdmin = true")
		groupsCollection.ViewRule = types.Pointer("@request.auth.isAdmin = true")
		groupsCollection.CreateRule = types.Pointer("@request.auth.isAdmin = true")
		groupsCollection.UpdateRule = types.Pointer("@request.auth.isAdmin = true")
		groupsCollection.DeleteRule = types.Pointer("@request.auth.isAdmin = true")
		groupsCollection.Fields.Add(&core.TextField{Name: "name", Required: true, Min: 1, Max: 200})
		groupsCollection.Fields.Add(&core.TextField{Name: "notes", Required: false, Max: 1000})
		groupsCollection.Fields.Add(&core.RelationField{
			Name:          "createdBy",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			Required:      false,
			CascadeDelete: false,
		})
		groupsCollection.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		groupsCollection.Fields.Add(&core.AutodateField{Name: "updated", OnUpdate: true})
		groupsCollection.Indexes = []string{restaurantGroupsNameIndex}

		if err := app.Save(groupsCollection); err != nil {
			return err
		}

		restaurantsCollection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}
		if restaurantsCollection.Fields.GetByName("restaurantGroup") == nil {
			restaurantsCollection.Fields.Add(&core.RelationField{
				Name:          "restaurantGroup",
				CollectionId:  groupsCollection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false,
			})
		}
		if !hasCollectionIndex(restaurantsCollection.Indexes, restaurantsRestaurantGroupIndex) {
			restaurantsCollection.Indexes = append(restaurantsCollection.Indexes, restaurantsRestaurantGroupIndex)
		}

		if err := app.Save(restaurantsCollection); err != nil {
			return err
		}

		log.Println("✓ Created restaurant groups collection and restaurant membership relation")
		return nil
	}, func(app core.App) error {
		restaurantsCollection, err := app.FindCollectionByNameOrId("restaurants")
		if err == nil {
			restaurantsCollection.Fields.RemoveByName("restaurantGroup")
			restaurantsCollection.Indexes = removeCollectionIndex(restaurantsCollection.Indexes, restaurantsRestaurantGroupIndex)
			if saveErr := app.Save(restaurantsCollection); saveErr != nil {
				return saveErr
			}
		}

		groupsCollection, err := app.FindCollectionByNameOrId("restaurant_groups")
		if err != nil {
			return err
		}
		if err := app.Delete(groupsCollection); err != nil {
			return err
		}

		log.Println("✓ Removed restaurant groups collection and restaurant membership relation")
		return nil
	})
}
