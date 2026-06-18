package handlers

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	recommendationUsageKindSavedRecommendation = "saved_recommendation"
	recommendationUsageActionSaved             = "saved"
	recommendationUsageActionRemoved           = "removed"
)

type recommendationUsageEventInput struct {
	Action                 string
	ActorID                string
	SourceUserID           string
	SourceFoodItemID       string
	SourceMenuItemID       string
	SourceRestaurantListID string
	SourceListItemID       string
	TargetRestaurantID     string
	TargetRestaurantListID string
	TargetListItemID       string
}

func recordSavedRecommendationUsageEvent(app core.App, input recommendationUsageEventInput) error {
	action := strings.TrimSpace(input.Action)
	if action != recommendationUsageActionSaved && action != recommendationUsageActionRemoved {
		return apis.NewApiError(500, "invalid recommendation usage action", nil)
	}

	actorID := strings.TrimSpace(input.ActorID)
	targetRestaurantID := strings.TrimSpace(input.TargetRestaurantID)
	targetRestaurantListID := strings.TrimSpace(input.TargetRestaurantListID)
	if actorID == "" || targetRestaurantID == "" || targetRestaurantListID == "" {
		return apis.NewApiError(500, "incomplete recommendation usage event", nil)
	}

	collection, err := app.FindCollectionByNameOrId("recommendation_usage")
	if err != nil {
		return apis.NewApiError(500, "failed to resolve recommendation usage collection", err)
	}

	record := core.NewRecord(collection)
	record.Set("kind", recommendationUsageKindSavedRecommendation)
	record.Set("action", action)
	record.Set("actor", actorID)
	record.Set("sourceUser", emptyStringToNil(input.SourceUserID))
	record.Set("sourceFoodItem", emptyStringToNil(input.SourceFoodItemID))
	record.Set("sourceMenuItem", emptyStringToNil(input.SourceMenuItemID))
	record.Set("sourceRestaurantList", emptyStringToNil(input.SourceRestaurantListID))
	record.Set("sourceListItem", emptyStringToNil(input.SourceListItemID))
	record.Set("targetRestaurant", targetRestaurantID)
	record.Set("targetRestaurantList", targetRestaurantListID)
	record.Set("targetListItem", emptyStringToNil(input.TargetListItemID))
	record.Set("actedAt", time.Now().UTC())

	if err := app.Save(record); err != nil {
		return apis.NewApiError(500, "failed to record recommendation usage", err)
	}

	return nil
}

func resolveRecommendationUsageListSource(
	app core.App,
	requestBody restaurantListSaveBookmarkRequest,
	restaurantID string,
	foodItemID string,
	menuItemID string,
) (string, string, error) {
	sourceListID := strings.TrimSpace(requestBody.SourceListID)
	sourceListItemID := strings.TrimSpace(requestBody.SourceItemID)
	if sourceListID == "" && sourceListItemID == "" {
		return "", "", nil
	}

	if sourceListItemID != "" {
		listItemRecord, err := app.FindRecordById("list_items", sourceListItemID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return "", "", apis.NewBadRequestError("sourceListItemId was not found", err)
			}
			return "", "", apis.NewApiError(500, "failed to load source list item", err)
		}

		listItemListID := strings.TrimSpace(listItemRecord.GetString("list"))
		if sourceListID != "" && listItemListID != sourceListID {
			return "", "", apis.NewBadRequestError("sourceListItemId must belong to sourceListId", nil)
		}
		if strings.TrimSpace(listItemRecord.GetString("restaurant")) != strings.TrimSpace(restaurantID) {
			return "", "", apis.NewBadRequestError("sourceListItemId must belong to the saved restaurant", nil)
		}
		if foodItemID != "" && !restaurantListItemReferencesFoodItem(listItemRecord, foodItemID) {
			return "", "", apis.NewBadRequestError("sourceListItemId must reference the saved food item", nil)
		}
		if menuItemID != "" && strings.TrimSpace(listItemRecord.GetString("menuItem")) != strings.TrimSpace(menuItemID) {
			return "", "", apis.NewBadRequestError("sourceListItemId must reference the saved menu item", nil)
		}

		return listItemListID, sourceListItemID, nil
	}

	if _, err := app.FindRecordById("restaurant_lists", sourceListID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", "", apis.NewBadRequestError("sourceListId was not found", err)
		}
		return "", "", apis.NewApiError(500, "failed to load source restaurant list", err)
	}

	return sourceListID, "", nil
}

func restaurantListItemReferencesFoodItem(listItemRecord *core.Record, foodItemID string) bool {
	normalizedFoodItemID := strings.TrimSpace(foodItemID)
	if normalizedFoodItemID == "" {
		return false
	}
	if strings.TrimSpace(listItemRecord.GetString("foodItem")) == normalizedFoodItemID ||
		strings.TrimSpace(listItemRecord.GetString("userFoodItem")) == normalizedFoodItemID {
		return true
	}
	for _, recommendedItemID := range listItemRecord.GetStringSlice("recommendedItems") {
		if strings.TrimSpace(recommendedItemID) == normalizedFoodItemID {
			return true
		}
	}
	return false
}

func recommendationUsageSourceUserFromFoodItem(requestSourceUserID string, foodItemRecord *core.Record) string {
	sourceUserID := strings.TrimSpace(requestSourceUserID)
	if sourceUserID != "" {
		return sourceUserID
	}
	if foodItemRecord == nil {
		return ""
	}
	return strings.TrimSpace(foodItemRecord.GetString("user"))
}

func recommendationUsageSourceUserFromMenuItem(menuItemRecord *core.Record) string {
	if menuItemRecord == nil {
		return ""
	}
	return strings.TrimSpace(menuItemRecord.GetString("createdBy"))
}

func recommendationUsageInputForSourceRatingRemoval(
	app core.App,
	authRecord *core.Record,
	listID string,
	listItemRecord *core.Record,
	sourceFoodItemID string,
) (recommendationUsageEventInput, error) {
	sourceUserID := strings.TrimSpace(listItemRecord.GetString("sourceUser"))
	foodItemRecord, _, err := findFoodItemWithVisit(app, sourceFoodItemID)
	if err != nil {
		return recommendationUsageEventInput{}, err
	}
	sourceUserID = recommendationUsageSourceUserFromFoodItem(sourceUserID, foodItemRecord)

	return recommendationUsageEventInput{
		Action:                 recommendationUsageActionRemoved,
		ActorID:                authRecord.Id,
		SourceUserID:           sourceUserID,
		SourceFoodItemID:       strings.TrimSpace(sourceFoodItemID),
		TargetRestaurantID:     strings.TrimSpace(listItemRecord.GetString("restaurant")),
		TargetRestaurantListID: strings.TrimSpace(listID),
		TargetListItemID:       listItemRecord.Id,
	}, nil
}

func recommendationUsageInputFromListItem(
	app core.App,
	action string,
	authRecord *core.Record,
	listID string,
	listItemRecord *core.Record,
) (recommendationUsageEventInput, error) {
	sourceUserID := strings.TrimSpace(listItemRecord.GetString("sourceUser"))
	sourceFoodItemID := strings.TrimSpace(listItemRecord.GetString("foodItem"))
	sourceMenuItemID := strings.TrimSpace(listItemRecord.GetString("menuItem"))
	if sourceUserID == "" && sourceFoodItemID != "" {
		foodItemRecord, _, err := findFoodItemWithVisit(app, sourceFoodItemID)
		if err != nil {
			return recommendationUsageEventInput{}, err
		}
		sourceUserID = recommendationUsageSourceUserFromFoodItem("", foodItemRecord)
	}
	if sourceUserID == "" && sourceMenuItemID != "" {
		menuItemRecord, err := app.FindRecordById("menu_items", sourceMenuItemID)
		if err != nil {
			return recommendationUsageEventInput{}, apis.NewApiError(500, "failed to load recommendation usage menu item source", err)
		}
		sourceUserID = recommendationUsageSourceUserFromMenuItem(menuItemRecord)
	}

	return recommendationUsageEventInput{
		Action:                 action,
		ActorID:                authRecord.Id,
		SourceUserID:           sourceUserID,
		SourceFoodItemID:       sourceFoodItemID,
		SourceMenuItemID:       sourceMenuItemID,
		TargetRestaurantID:     strings.TrimSpace(listItemRecord.GetString("restaurant")),
		TargetRestaurantListID: strings.TrimSpace(listID),
		TargetListItemID:       listItemRecord.Id,
	}, nil
}
