package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		if err := backfillRestaurantListVisibility(app); err != nil {
			return err
		}

		if err := updateRestaurantListsVisibilityFieldAndRules(app); err != nil {
			return err
		}

		if err := updateListItemsRulesForRestaurantListVisibility(app); err != nil {
			return err
		}

		log.Println("✓ Removed public visibility from restaurant lists")
		return nil
	}, func(app core.App) error {
		if err := restoreRestaurantListsVisibilityFieldAndRules(app); err != nil {
			return err
		}

		if err := restoreListItemsRulesForRestaurantListVisibility(app); err != nil {
			return err
		}

		log.Println("✓ Restored public visibility option for restaurant lists")
		return nil
	})
}

func backfillRestaurantListVisibility(app core.App) error {
	records, err := app.FindAllRecords("restaurant_lists")
	if err != nil {
		return err
	}

	updatedCount := 0
	for _, record := range records {
		switch record.GetString("visibility") {
		case "private", "friends":
			continue
		default:
			record.Set("visibility", "friends")
			if err := app.Save(record); err != nil {
				log.Printf("Warning: Failed to update restaurant list %s visibility: %v", record.Id, err)
			} else {
				updatedCount++
			}
		}
	}

	log.Printf("✓ Backfilled %d restaurant lists to friends visibility", updatedCount)
	return nil
}

func restaurantListsVisibilityRuleWithoutPublic() string {
	return `@request.auth.isAdmin = true || (` + visibleModerationStatusesRule + ` && (
user = @request.auth.id ||
(visibility = 'friends' && (
  (@collection.friendships.user.id ?= user &&
   @collection.friendships.friend.id ?= @request.auth.id &&
   @collection.friendships.status ?= 'accepted') ||
  (@collection.friendships.user.id ?= @request.auth.id &&
   @collection.friendships.friend.id ?= user &&
   @collection.friendships.status ?= 'accepted')
))))`
}

func restaurantListsVisibilityRuleWithPublic() string {
	return `@request.auth.isAdmin = true || (` + visibleModerationStatusesRule + ` && (
visibility = 'public' ||
user = @request.auth.id ||
(visibility = 'friends' && (
  (@collection.friendships.user.id ?= user &&
   @collection.friendships.friend.id ?= @request.auth.id &&
   @collection.friendships.status ?= 'accepted') ||
  (@collection.friendships.user.id ?= @request.auth.id &&
   @collection.friendships.friend.id ?= user &&
   @collection.friendships.status ?= 'accepted')
))))`
}

func listItemsVisibilityRuleWithoutPublic() string {
	return `@request.auth.isAdmin = true || (` + visibleModerationStatusesRule + ` && ` + visibleListModerationStatusesRule + ` && (
  @collection.restaurant_lists.id ?= list &&
  (@collection.restaurant_lists.user ?= @request.auth.id ||
   (@collection.restaurant_lists.visibility ?= 'friends' && (
     (@collection.friendships.user.id ?= @collection.restaurant_lists.user &&
      @collection.friendships.friend.id ?= @request.auth.id &&
      @collection.friendships.status ?= 'accepted') ||
     (@collection.friendships.user.id ?= @request.auth.id &&
      @collection.friendships.friend.id ?= @collection.restaurant_lists.user &&
      @collection.friendships.status ?= 'accepted')
   )))
))`
}

func listItemsVisibilityRuleWithPublic() string {
	return `@request.auth.isAdmin = true || (` + visibleModerationStatusesRule + ` && ` + visibleListModerationStatusesRule + ` && (
  @collection.restaurant_lists.id ?= list &&
  (@collection.restaurant_lists.visibility ?= 'public' ||
   @collection.restaurant_lists.user ?= @request.auth.id ||
   (@collection.restaurant_lists.visibility ?= 'friends' && (
     (@collection.friendships.user.id ?= @collection.restaurant_lists.user &&
      @collection.friendships.friend.id ?= @request.auth.id &&
      @collection.friendships.status ?= 'accepted') ||
     (@collection.friendships.user.id ?= @request.auth.id &&
      @collection.friendships.friend.id ?= @collection.restaurant_lists.user &&
      @collection.friendships.status ?= 'accepted')
   )))
))`
}

func updateRestaurantListsVisibilityFieldAndRules(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("restaurant_lists")
	if err != nil {
		return err
	}

	visibilityField := collection.Fields.GetByName("visibility")
	if visibilityField != nil {
		if selectField, ok := visibilityField.(*core.SelectField); ok {
			selectField.Values = []string{"private", "friends"}
		}
	}

	rule := restaurantListsVisibilityRuleWithoutPublic()
	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + visibleModerationStatusesRule + `)`)
	collection.DeleteRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + visibleModerationStatusesRule + `)`)

	return app.Save(collection)
}

func updateListItemsRulesForRestaurantListVisibility(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("list_items")
	if err != nil {
		return err
	}

	rule := listItemsVisibilityRuleWithoutPublic()
	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(`@request.auth.isAdmin = true || ((addedBy = @request.auth.id || @collection.restaurant_lists.user = @request.auth.id) && ` + visibleModerationStatusesRule + ` && ` + visibleListModerationStatusesRule + `)`)
	collection.DeleteRule = types.Pointer(`@request.auth.isAdmin = true || ((addedBy = @request.auth.id || @collection.restaurant_lists.user = @request.auth.id) && ` + visibleModerationStatusesRule + ` && ` + visibleListModerationStatusesRule + `)`)

	return app.Save(collection)
}

func restoreRestaurantListsVisibilityFieldAndRules(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("restaurant_lists")
	if err != nil {
		return err
	}

	visibilityField := collection.Fields.GetByName("visibility")
	if visibilityField != nil {
		if selectField, ok := visibilityField.(*core.SelectField); ok {
			selectField.Values = []string{"private", "friends", "public"}
		}
	}

	rule := restaurantListsVisibilityRuleWithPublic()
	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + visibleModerationStatusesRule + `)`)
	collection.DeleteRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + visibleModerationStatusesRule + `)`)

	return app.Save(collection)
}

func restoreListItemsRulesForRestaurantListVisibility(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("list_items")
	if err != nil {
		return err
	}

	rule := listItemsVisibilityRuleWithPublic()
	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(`@request.auth.isAdmin = true || ((addedBy = @request.auth.id || @collection.restaurant_lists.user = @request.auth.id) && ` + visibleModerationStatusesRule + ` && ` + visibleListModerationStatusesRule + `)`)
	collection.DeleteRule = types.Pointer(`@request.auth.isAdmin = true || ((addedBy = @request.auth.id || @collection.restaurant_lists.user = @request.auth.id) && ` + visibleModerationStatusesRule + ` && ` + visibleListModerationStatusesRule + `)`)

	return app.Save(collection)
}
