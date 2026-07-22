package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

var foodItemsNoLegacyPublicVisitReadRule = `@request.auth.isAdmin = true || (
(user = @request.auth.id && ` + ownerAccessibleModerationStatusesRule + `) ||
(` + visibleModerationStatusesRule + ` && (
(visit != '' && ` + foodItemVisitItemItemTypeOnlyRuleExpression() + ` && ` + visibleVisitModerationStatusesRule + ` &&
  visit.visibility = 'friends' && (
    @collection.friendships.user.id ?= visit.user && @collection.friendships.friend.id ?= @request.auth.id && @collection.friendships.status ?= 'accepted' ||
    @collection.friendships.user.id ?= @request.auth.id && @collection.friendships.friend.id ?= visit.user && @collection.friendships.status ?= 'accepted'
  )
) ||
(` + foodItemFoodProductItemTypeOnlyRuleExpression() + ` && visibility = 'public') ||
(` + foodItemFoodProductItemTypeOnlyRuleExpression() + ` && visibility = 'friends' && (
  @collection.friendships.user.id ?= user && @collection.friendships.friend.id ?= @request.auth.id && @collection.friendships.status ?= 'accepted' ||
  @collection.friendships.user.id ?= @request.auth.id && @collection.friendships.friend.id ?= user && @collection.friendships.status ?= 'accepted'
))
))
)`

func init() {
	m.Register(func(app core.App) error {
		if err := setFoodItemReadRule(app, foodItemsNoLegacyPublicVisitReadRule); err != nil {
			return err
		}

		log.Println("✓ Removed legacy public visit branch from food item reads")
		return nil
	}, func(app core.App) error {
		return updateFoodItemsItemTypeOnlyRules(app)
	})
}

func setFoodItemReadRule(app core.App, rule string) error {
	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		return err
	}

	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	return app.Save(collection)
}
