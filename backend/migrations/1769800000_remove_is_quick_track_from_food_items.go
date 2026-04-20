package migrations

import (
	"log"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const legacyFoodItemQuickTrackFieldName = "isQuickTrack"

type foodItemsPhase3BCutoverStats struct {
	mismatchedLegacyFlagCount  int
	repairedBlankItemTypeCount int
}

func init() {
	m.Register(func(app core.App) error {
		if err := updateFoodItemsItemTypeFieldDefinition(app, true); err != nil {
			return err
		}

		stats, err := applyFoodItemsPhase3BCutover(app)
		if err != nil {
			return err
		}

		if err := updateFoodItemsItemTypeOnlyRules(app); err != nil {
			return err
		}

		if err := removeFoodItemsLegacyQuickTrackField(app); err != nil {
			return err
		}

		log.Printf(
			"✓ Removed food_items.isQuickTrack and finished itemType cutover (repaired=%d mismatched=%d)",
			stats.repairedBlankItemTypeCount,
			stats.mismatchedLegacyFlagCount,
		)
		return nil
	}, func(app core.App) error {
		if err := addFoodItemsLegacyQuickTrackField(app); err != nil {
			return err
		}

		if err := backfillFoodItemsLegacyQuickTrackFlag(app); err != nil {
			return err
		}

		if err := updateFoodItemsItemTypeFieldDefinition(app, false); err != nil {
			return err
		}

		if err := updateFoodItemsItemTypeRules(app); err != nil {
			return err
		}

		log.Println("✓ Restored food_items.isQuickTrack and Phase 3A dual-support itemType rules")
		return nil
	})
}

func updateFoodItemsItemTypeFieldDefinition(app core.App, required bool) error {
	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		return err
	}

	if existingField := collection.Fields.GetByName(foodItemTypeFieldName); existingField != nil {
		collection.Fields.RemoveByName(foodItemTypeFieldName)
	}

	collection.Fields.Add(&core.SelectField{
		Name:      foodItemTypeFieldName,
		Required:  required,
		MaxSelect: 1,
		Values: []string{
			"visit-item",
			"food-product",
		},
	})

	return app.Save(collection)
}

func applyFoodItemsPhase3BCutover(app core.App) (foodItemsPhase3BCutoverStats, error) {
	records, err := app.FindAllRecords("food_items")
	if err != nil {
		return foodItemsPhase3BCutoverStats{}, err
	}

	stats := foodItemsPhase3BCutoverStats{}
	for _, record := range records {
		trimmedItemType := strings.TrimSpace(record.GetString(foodItemTypeFieldName))
		legacyIsFoodProduct := record.GetBool(legacyFoodItemQuickTrackFieldName)

		if trimmedItemType == "" {
			nextItemType := "visit-item"
			if legacyIsFoodProduct {
				nextItemType = "food-product"
			}

			record.Set(foodItemTypeFieldName, nextItemType)
			if err := app.Save(record); err != nil {
				return foodItemsPhase3BCutoverStats{}, err
			}
			stats.repairedBlankItemTypeCount++
			continue
		}

		if (trimmedItemType == "food-product" && !legacyIsFoodProduct) ||
			(trimmedItemType == "visit-item" && legacyIsFoodProduct) {
			stats.mismatchedLegacyFlagCount++
		}
	}

	return stats, nil
}

func updateFoodItemsItemTypeOnlyRules(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		return err
	}

	rule := `@request.auth.isAdmin = true || (
(user = @request.auth.id && ` + ownerAccessibleModerationStatusesRule + `) ||
(` + visibleModerationStatusesRule + ` && (
(visit != '' && ` + foodItemVisitItemItemTypeOnlyRuleExpression() + ` && ` + visibleVisitModerationStatusesRule + ` && (
  visit.visibility = 'public' ||
  (visit.visibility = 'friends' && (
    visit.user.id ?~ @request.auth.friendships_via_user.friend.id ||
    visit.user.id ?~ @request.auth.friendships_via_friend.user.id
  ))
)) ||
(` + foodItemFoodProductItemTypeOnlyRuleExpression() + ` && visibility = 'public') ||
(` + foodItemFoodProductItemTypeOnlyRuleExpression() + ` && visibility = 'friends' && (
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

func removeFoodItemsLegacyQuickTrackField(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		return err
	}

	if collection.Fields.GetByName(legacyFoodItemQuickTrackFieldName) == nil {
		return nil
	}

	collection.Fields.RemoveByName(legacyFoodItemQuickTrackFieldName)
	return app.Save(collection)
}

func addFoodItemsLegacyQuickTrackField(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		return err
	}

	if existingField := collection.Fields.GetByName(legacyFoodItemQuickTrackFieldName); existingField != nil {
		collection.Fields.RemoveByName(legacyFoodItemQuickTrackFieldName)
	}

	collection.Fields.Add(&core.BoolField{
		Name:     legacyFoodItemQuickTrackFieldName,
		Required: false,
	})

	return app.Save(collection)
}

func backfillFoodItemsLegacyQuickTrackFlag(app core.App) error {
	records, err := app.FindAllRecords("food_items")
	if err != nil {
		return err
	}

	for _, record := range records {
		record.Set(legacyFoodItemQuickTrackFieldName, strings.TrimSpace(record.GetString(foodItemTypeFieldName)) == "food-product")
		if err := app.Save(record); err != nil {
			return err
		}
	}

	return nil
}

func foodItemFoodProductItemTypeOnlyRuleExpression() string {
	return `(itemType = 'food-product')`
}

func foodItemVisitItemItemTypeOnlyRuleExpression() string {
	return `(itemType = 'visit-item')`
}
