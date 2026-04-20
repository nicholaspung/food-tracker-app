package migrations

import (
	"log"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const foodItemTypeFieldName = "itemType"

func init() {
	m.Register(func(app core.App) error {
		if err := addFoodItemTypeField(app); err != nil {
			return err
		}

		if err := backfillFoodItemTypes(app); err != nil {
			return err
		}

		if err := updateFoodItemsItemTypeRules(app); err != nil {
			return err
		}

		log.Println("✓ Added food_items.itemType with staged dual support for food products and visit items")
		return nil
	}, func(app core.App) error {
		if err := updateFoodItemOwnerReviewRules(app); err != nil {
			return err
		}

		if err := removeFoodItemTypeField(app); err != nil {
			return err
		}

		log.Println("✓ Removed food_items.itemType and restored legacy food item rules")
		return nil
	})
}

func addFoodItemTypeField(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		return err
	}

	if existingField := collection.Fields.GetByName(foodItemTypeFieldName); existingField != nil {
		collection.Fields.RemoveByName(foodItemTypeFieldName)
	}

	collection.Fields.Add(&core.SelectField{
		Name:      foodItemTypeFieldName,
		Required:  false,
		MaxSelect: 1,
		Values: []string{
			"visit-item",
			"food-product",
		},
	})

	return app.Save(collection)
}

func removeFoodItemTypeField(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		return err
	}

	if collection.Fields.GetByName(foodItemTypeFieldName) == nil {
		return nil
	}

	collection.Fields.RemoveByName(foodItemTypeFieldName)
	return app.Save(collection)
}

func backfillFoodItemTypes(app core.App) error {
	records, err := app.FindAllRecords("food_items")
	if err != nil {
		return err
	}

	updatedCount := 0
	for _, record := range records {
		nextItemType := "visit-item"
		if record.GetBool("isQuickTrack") {
			nextItemType = "food-product"
		}

		if strings.TrimSpace(record.GetString(foodItemTypeFieldName)) == nextItemType {
			continue
		}

		record.Set(foodItemTypeFieldName, nextItemType)
		if err := app.Save(record); err != nil {
			return err
		}
		updatedCount++
	}

	log.Printf("✓ Backfilled food_items.itemType for %d records", updatedCount)
	return nil
}

func updateFoodItemsItemTypeRules(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		return err
	}

	rule := `@request.auth.isAdmin = true || (
(user = @request.auth.id && ` + ownerAccessibleModerationStatusesRule + `) ||
(` + visibleModerationStatusesRule + ` && (
(visit != '' && ` + foodItemVisitItemRuleExpression() + ` && ` + visibleVisitModerationStatusesRule + ` && (
  visit.visibility = 'public' ||
  (visit.visibility = 'friends' && (
    visit.user.id ?~ @request.auth.friendships_via_user.friend.id ||
    visit.user.id ?~ @request.auth.friendships_via_friend.user.id
  ))
)) ||
(` + foodItemFoodProductRuleExpression() + ` && visibility = 'public') ||
(` + foodItemFoodProductRuleExpression() + ` && visibility = 'friends' && (
  user.id ?~ @request.auth.friendships_via_user.friend.id ||
  user.id ?~ @request.auth.friendships_via_friend.user.id
))
))
)`

	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + ownerAccessibleModerationStatusesRule + `)`)
	collection.DeleteRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + ownerAccessibleModerationStatusesRule + `)`)
	return app.Save(collection)
}

func foodItemFoodProductRuleExpression() string {
	return `(itemType = 'food-product' || (itemType = '' && isQuickTrack = true))`
}

func foodItemVisitItemRuleExpression() string {
	return `(itemType = 'visit-item' || (itemType = '' && isQuickTrack != true))`
}
