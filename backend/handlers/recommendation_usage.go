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
	recommendationUsageKindTriedRecommendation = "tried_recommendation"
	recommendationUsageKindRatedAfterTry       = "rated_after_try"
	recommendationUsageActionSaved             = "saved"
	recommendationUsageActionRemoved           = "removed"
	recommendationUsageActionTried             = "tried"
	recommendationUsageActionRated             = "rated"
)

type recommendationUsageEventInput struct {
	Kind                   string
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
	TargetVisitID          string
	TargetVisitItemID      string
}

type recommendationUsageSourceResponse struct {
	Kind           string `json:"kind"`
	SourceUserID   string `json:"sourceUserId,omitempty"`
	SourceUserName string `json:"sourceUserName,omitempty"`
}

type recommendationUsageSourceMaps struct {
	ByVisitID     map[string]*recommendationUsageSourceResponse
	ByVisitItemID map[string]*recommendationUsageSourceResponse
}

func recordSavedRecommendationUsageEvent(app core.App, input recommendationUsageEventInput) error {
	input.Kind = recommendationUsageKindSavedRecommendation
	return recordRecommendationUsageEvent(app, input)
}

func recordRecommendationUsageEvent(app core.App, input recommendationUsageEventInput) error {
	kind := strings.TrimSpace(input.Kind)
	if kind != recommendationUsageKindSavedRecommendation &&
		kind != recommendationUsageKindTriedRecommendation &&
		kind != recommendationUsageKindRatedAfterTry {
		return apis.NewApiError(500, "invalid recommendation usage kind", nil)
	}

	action := strings.TrimSpace(input.Action)
	if action != recommendationUsageActionSaved &&
		action != recommendationUsageActionRemoved &&
		action != recommendationUsageActionTried &&
		action != recommendationUsageActionRated {
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

	existingEvent, err := findExistingRecommendationUsageEvent(app, input)
	if err != nil {
		return err
	}
	if existingEvent != nil {
		return nil
	}

	record := core.NewRecord(collection)
	record.Set("kind", kind)
	record.Set("action", action)
	record.Set("actor", actorID)
	record.Set("sourceUser", emptyStringToNil(input.SourceUserID))
	record.Set("sourceFoodItem", emptyStringToNil(input.SourceFoodItemID))
	record.Set("sourceMenuItem", emptyStringToNil(input.SourceMenuItemID))
	record.Set("sourceRestaurantList", emptyStringToNil(input.SourceRestaurantListID))
	record.Set("sourceListItem", emptyStringToNil(input.SourceListItemID))
	record.Set("sourceListItemSnapshotId", strings.TrimSpace(input.SourceListItemID))
	record.Set("targetRestaurant", targetRestaurantID)
	record.Set("targetRestaurantList", targetRestaurantListID)
	record.Set("targetListItem", emptyStringToNil(input.TargetListItemID))
	record.Set("targetListItemSnapshotId", strings.TrimSpace(input.TargetListItemID))
	record.Set("targetVisit", emptyStringToNil(input.TargetVisitID))
	record.Set("targetVisitItem", emptyStringToNil(input.TargetVisitItemID))
	record.Set("actedAt", time.Now().UTC())

	if err := app.Save(record); err != nil {
		return apis.NewApiError(500, "failed to record recommendation usage", err)
	}

	return nil
}

func findExistingRecommendationUsageEvent(app core.App, input recommendationUsageEventInput) (*core.Record, error) {
	sourceListItemID := strings.TrimSpace(input.SourceListItemID)
	targetVisitID := strings.TrimSpace(input.TargetVisitID)
	if sourceListItemID == "" || targetVisitID == "" {
		return nil, nil
	}

	params := map[string]any{
		"kind":             strings.TrimSpace(input.Kind),
		"action":           strings.TrimSpace(input.Action),
		"actorId":          strings.TrimSpace(input.ActorID),
		"sourceListItemId": sourceListItemID,
		"targetVisitId":    targetVisitID,
	}
	filter := "kind = {:kind} && action = {:action} && actor = {:actorId} && (sourceListItem = {:sourceListItemId} || sourceListItemSnapshotId = {:sourceListItemId}) && targetVisit = {:targetVisitId}"
	if targetVisitItemID := strings.TrimSpace(input.TargetVisitItemID); targetVisitItemID != "" {
		params["targetVisitItemId"] = targetVisitItemID
		filter += " && targetVisitItem = {:targetVisitItemId}"
		if sourceFoodItemID := strings.TrimSpace(input.SourceFoodItemID); sourceFoodItemID != "" {
			params["sourceFoodItemId"] = sourceFoodItemID
			filter += " && sourceFoodItem = {:sourceFoodItemId}"
		}
		if sourceMenuItemID := strings.TrimSpace(input.SourceMenuItemID); sourceMenuItemID != "" {
			params["sourceMenuItemId"] = sourceMenuItemID
			filter += " && sourceMenuItem = {:sourceMenuItemId}"
		}
	}

	records, err := app.FindRecordsByFilter("recommendation_usage", filter, "-created", 1, 0, params)
	if err != nil {
		return nil, apis.NewApiError(500, "failed to load recommendation usage event", err)
	}
	if len(records) == 0 {
		return nil, nil
	}
	return records[0], nil
}

func findReplayedRecommendationVisitCreateResult(
	app core.App,
	actorID string,
	sourceListItemID string,
	requestRestaurantID string,
	visitLocalDate string,
) (visitCreateTransactionResult, bool, error) {
	result := visitCreateTransactionResult{}
	trimmedSourceListItemID := strings.TrimSpace(sourceListItemID)
	if trimmedSourceListItemID == "" {
		return result, false, nil
	}

	records, err := app.FindRecordsByFilter(
		"recommendation_usage",
		"kind = {:kind} && action = {:action} && actor = {:actorId} && (sourceListItem = {:sourceListItemId} || sourceListItemSnapshotId = {:sourceListItemId})",
		"-created",
		20,
		0,
		map[string]any{
			"kind":             recommendationUsageKindTriedRecommendation,
			"action":           recommendationUsageActionTried,
			"actorId":          strings.TrimSpace(actorID),
			"sourceListItemId": trimmedSourceListItemID,
		},
	)
	if err != nil {
		return result, false, apis.NewApiError(500, "failed to load recommendation usage replay state", err)
	}

	for _, usageRecord := range records {
		targetVisitID := strings.TrimSpace(usageRecord.GetString("targetVisit"))
		if targetVisitID == "" {
			continue
		}

		visitRecord, err := app.FindRecordById("visits", targetVisitID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return result, false, apis.NewApiError(500, "failed to load replayed visit", err)
		}

		if strings.TrimSpace(visitRecord.GetString("user")) != strings.TrimSpace(actorID) {
			continue
		}
		if trimmedRequestRestaurantID := strings.TrimSpace(requestRestaurantID); trimmedRequestRestaurantID != "" &&
			strings.TrimSpace(visitRecord.GetString("restaurant")) != trimmedRequestRestaurantID {
			continue
		}
		if trimmedVisitLocalDate := strings.TrimSpace(visitLocalDate); trimmedVisitLocalDate != "" &&
			strings.TrimSpace(visitRecord.GetString(visitLocalDateFieldName)) != trimmedVisitLocalDate {
			continue
		}

		result.VisitRecord = visitRecord
		result.PrioritizedItemIDs, err = findRecommendationUsageVisitItemIDs(app, actorID, trimmedSourceListItemID, targetVisitID)
		if err != nil {
			return result, false, err
		}
		return result, true, nil
	}

	return result, false, nil
}

func findRecommendationUsageVisitItemIDs(app core.App, actorID string, sourceListItemID string, targetVisitID string) ([]string, error) {
	records, err := app.FindRecordsByFilter(
		"recommendation_usage",
		"kind = {:kind} && action = {:action} && actor = {:actorId} && (sourceListItem = {:sourceListItemId} || sourceListItemSnapshotId = {:sourceListItemId}) && targetVisit = {:targetVisitId}",
		"created",
		50,
		0,
		map[string]any{
			"kind":             recommendationUsageKindRatedAfterTry,
			"action":           recommendationUsageActionRated,
			"actorId":          strings.TrimSpace(actorID),
			"sourceListItemId": strings.TrimSpace(sourceListItemID),
			"targetVisitId":    strings.TrimSpace(targetVisitID),
		},
	)
	if err != nil {
		return nil, apis.NewApiError(500, "failed to load recommendation usage visit items", err)
	}

	itemIDs := make([]string, 0, len(records))
	seen := map[string]struct{}{}
	for _, record := range records {
		itemIDs = appendUniqueTrimmedID(itemIDs, seen, record.GetString("targetVisitItem"))
	}
	return itemIDs, nil
}

func buildRecommendationUsageSourceMaps(
	app core.App,
	viewerUserID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
	visitRecords []*core.Record,
) (recommendationUsageSourceMaps, error) {
	result := recommendationUsageSourceMaps{
		ByVisitID:     map[string]*recommendationUsageSourceResponse{},
		ByVisitItemID: map[string]*recommendationUsageSourceResponse{},
	}

	ownVisitIDs := make([]string, 0, len(visitRecords))
	ownVisitIDSet := map[string]struct{}{}
	trimmedViewerUserID := strings.TrimSpace(viewerUserID)
	for _, visitRecord := range visitRecords {
		if visitRecord == nil || strings.TrimSpace(visitRecord.GetString("user")) != trimmedViewerUserID {
			continue
		}
		ownVisitIDs = appendUniqueTrimmedID(ownVisitIDs, ownVisitIDSet, visitRecord.Id)
	}
	if len(ownVisitIDs) == 0 {
		return result, nil
	}

	usageRecords, err := findRecordsByRelationValues(app, "recommendation_usage", "targetVisit", ownVisitIDs, "created")
	if err != nil {
		return result, apis.NewApiError(500, "failed to load recommendation usage sources", err)
	}

	sourceUserIDs := make([]string, 0, len(usageRecords))
	sourceUserIDSet := map[string]struct{}{}
	for _, usageRecord := range usageRecords {
		if !recommendationUsageRecordBelongsToActorVisit(usageRecord, trimmedViewerUserID, ownVisitIDSet) {
			continue
		}
		sourceUserID := strings.TrimSpace(usageRecord.GetString("sourceUser"))
		if sourceUserID == "" || (!isAdmin && sourceUserID != trimmedViewerUserID && !hasAcceptedFriend(acceptedFriendIDs, sourceUserID)) {
			continue
		}
		sourceUserIDs = appendUniqueTrimmedID(sourceUserIDs, sourceUserIDSet, sourceUserID)
	}

	userRecords, err := findRecordsByIDs(app, "users", sourceUserIDs)
	if err != nil {
		return result, apis.NewApiError(500, "failed to load recommendation usage source users", err)
	}
	usersByID := mapRecordsByID(userRecords)

	for _, usageRecord := range usageRecords {
		if !recommendationUsageRecordBelongsToActorVisit(usageRecord, trimmedViewerUserID, ownVisitIDSet) {
			continue
		}

		source := recommendationUsageSourceFromRecord(usageRecord, trimmedViewerUserID, isAdmin, acceptedFriendIDs, usersByID)
		switch strings.TrimSpace(usageRecord.GetString("kind")) {
		case recommendationUsageKindRatedAfterTry:
			targetVisitItemID := strings.TrimSpace(usageRecord.GetString("targetVisitItem"))
			if targetVisitItemID != "" && result.ByVisitItemID[targetVisitItemID] == nil {
				source.Kind = "item"
				result.ByVisitItemID[targetVisitItemID] = source
			}
		case recommendationUsageKindTriedRecommendation:
			targetVisitID := strings.TrimSpace(usageRecord.GetString("targetVisit"))
			if targetVisitID != "" && result.ByVisitID[targetVisitID] == nil {
				source.Kind = "restaurant"
				result.ByVisitID[targetVisitID] = source
			}
		}
	}

	return result, nil
}

func recommendationUsageRecordBelongsToActorVisit(record *core.Record, actorID string, visitIDSet map[string]struct{}) bool {
	if record == nil || strings.TrimSpace(record.GetString("actor")) != strings.TrimSpace(actorID) {
		return false
	}
	_, exists := visitIDSet[strings.TrimSpace(record.GetString("targetVisit"))]
	return exists
}

func recommendationUsageSourceFromRecord(
	record *core.Record,
	viewerUserID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
	usersByID map[string]*core.Record,
) *recommendationUsageSourceResponse {
	source := &recommendationUsageSourceResponse{}
	sourceUserID := strings.TrimSpace(record.GetString("sourceUser"))
	if sourceUserID == "" || (!isAdmin && sourceUserID != strings.TrimSpace(viewerUserID) && !hasAcceptedFriend(acceptedFriendIDs, sourceUserID)) {
		return source
	}

	source.SourceUserID = sourceUserID
	source.SourceUserName = resolveHomeFeedUserName(usersByID[sourceUserID])
	return source
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

func recordRecommendationUsageForVisitCreate(
	app core.App,
	authRecord *core.Record,
	sourceListItemID string,
	targetRestaurantID string,
	targetVisitID string,
	requestItems []visitItemWriteRequest,
	createdItemIDs []string,
) error {
	trimmedSourceListItemID := strings.TrimSpace(sourceListItemID)
	if trimmedSourceListItemID == "" {
		return nil
	}

	listItemRecord, err := app.FindRecordById("list_items", trimmedSourceListItemID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return apis.NewApiError(500, "failed to load recommendation usage source list item", err)
	}

	sourceListID := strings.TrimSpace(listItemRecord.GetString("list"))
	sourceFoodItemIDs := recommendationUsageSourceFoodItemIDs(listItemRecord)
	sourceFoodItemID := firstString(sourceFoodItemIDs)
	sourceMenuItemID := strings.TrimSpace(listItemRecord.GetString("menuItem"))

	sourceUserID := strings.TrimSpace(listItemRecord.GetString("sourceUser"))
	if sourceUserID == "" && sourceFoodItemID != "" {
		foodItemRecord, _, err := findFoodItemWithVisit(app, sourceFoodItemID)
		if err != nil {
			return err
		}
		sourceUserID = recommendationUsageSourceUserFromFoodItem("", foodItemRecord)
	}
	if sourceUserID == "" && sourceMenuItemID != "" {
		menuItemRecord, err := app.FindRecordById("menu_items", sourceMenuItemID)
		if err != nil {
			return apis.NewApiError(500, "failed to load recommendation usage menu item source", err)
		}
		sourceUserID = recommendationUsageSourceUserFromMenuItem(menuItemRecord)
	}

	baseInput := recommendationUsageEventInput{
		ActorID:                authRecord.Id,
		SourceUserID:           sourceUserID,
		SourceFoodItemID:       sourceFoodItemID,
		SourceMenuItemID:       sourceMenuItemID,
		SourceRestaurantListID: sourceListID,
		SourceListItemID:       listItemRecord.Id,
		TargetRestaurantID:     strings.TrimSpace(targetRestaurantID),
		TargetRestaurantListID: sourceListID,
		TargetListItemID:       listItemRecord.Id,
		TargetVisitID:          strings.TrimSpace(targetVisitID),
	}

	triedInput := baseInput
	triedInput.Kind = recommendationUsageKindTriedRecommendation
	triedInput.Action = recommendationUsageActionTried
	if err := recordRecommendationUsageEvent(app, triedInput); err != nil {
		return err
	}

	if sourceMenuItemID != "" {
		targetVisitItemID := resolveRatedAfterTryVisitItemIDForMenuItem(sourceMenuItemID, requestItems, createdItemIDs)
		if targetVisitItemID != "" {
			ratedInput := baseInput
			ratedInput.Kind = recommendationUsageKindRatedAfterTry
			ratedInput.Action = recommendationUsageActionRated
			ratedInput.TargetVisitItemID = targetVisitItemID
			if err := recordRecommendationUsageEvent(app, ratedInput); err != nil {
				return err
			}
		}
	}

	foodMatches, err := resolveRatedAfterTryVisitItemIDsForFoodItems(app, sourceFoodItemIDs, requestItems, createdItemIDs)
	if err != nil {
		return err
	}
	for _, match := range foodMatches {
		ratedSourceUserID := sourceUserID
		if ratedSourceUserID == "" {
			foodItemRecord, _, err := findFoodItemWithVisit(app, match.SourceFoodItemID)
			if err != nil {
				return err
			}
			ratedSourceUserID = recommendationUsageSourceUserFromFoodItem("", foodItemRecord)
		}
		ratedInput := baseInput
		ratedInput.Kind = recommendationUsageKindRatedAfterTry
		ratedInput.Action = recommendationUsageActionRated
		ratedInput.SourceUserID = ratedSourceUserID
		ratedInput.SourceFoodItemID = match.SourceFoodItemID
		ratedInput.SourceMenuItemID = ""
		ratedInput.TargetVisitItemID = match.TargetVisitItemID
		if err := recordRecommendationUsageEvent(app, ratedInput); err != nil {
			return err
		}
	}

	return nil
}

type recommendationUsageFoodItemMatch struct {
	SourceFoodItemID  string
	TargetVisitItemID string
}

func recommendationUsageSourceFoodItemIDs(listItemRecord *core.Record) []string {
	if listItemRecord == nil {
		return nil
	}
	ids := make([]string, 0, 2+len(listItemRecord.GetStringSlice("recommendedItems")))
	seen := map[string]struct{}{}
	ids = appendUniqueTrimmedID(ids, seen, listItemRecord.GetString("foodItem"))
	ids = appendUniqueTrimmedID(ids, seen, listItemRecord.GetString("userFoodItem"))
	for _, recommendedItemID := range listItemRecord.GetStringSlice("recommendedItems") {
		ids = appendUniqueTrimmedID(ids, seen, recommendedItemID)
	}
	return ids
}

func firstString(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func resolveRatedAfterTryVisitItemIDForMenuItem(
	sourceMenuItemID string,
	requestItems []visitItemWriteRequest,
	createdItemIDs []string,
) string {
	for index, item := range requestItems {
		if index >= len(createdItemIDs) {
			break
		}
		if strings.TrimSpace(item.MenuItemID) == strings.TrimSpace(sourceMenuItemID) {
			return createdItemIDs[index]
		}
	}
	return ""
}

func resolveRatedAfterTryVisitItemIDsForFoodItems(
	app core.App,
	sourceFoodItemIDs []string,
	requestItems []visitItemWriteRequest,
	createdItemIDs []string,
) ([]recommendationUsageFoodItemMatch, error) {
	sourceNameByID := map[string]string{}
	for _, sourceFoodItemID := range sourceFoodItemIDs {
		trimmedSourceFoodItemID := strings.TrimSpace(sourceFoodItemID)
		if trimmedSourceFoodItemID == "" {
			continue
		}
		foodItemRecord, _, err := findFoodItemWithVisit(app, trimmedSourceFoodItemID)
		if err != nil {
			return nil, err
		}
		if sourceName := normalizeMenuItemName(foodItemRecord.GetString("name")); sourceName != "" {
			sourceNameByID[trimmedSourceFoodItemID] = sourceName
		}
	}

	matches := []recommendationUsageFoodItemMatch{}
	seen := map[string]struct{}{}
	for index, item := range requestItems {
		if index >= len(createdItemIDs) {
			break
		}
		requestName := normalizeMenuItemName(item.Name)
		if requestName == "" {
			continue
		}
		for sourceFoodItemID, sourceName := range sourceNameByID {
			if sourceName == requestName {
				matchKey := sourceFoodItemID + ":" + createdItemIDs[index]
				if _, exists := seen[matchKey]; exists {
					continue
				}
				seen[matchKey] = struct{}{}
				matches = append(matches, recommendationUsageFoodItemMatch{
					SourceFoodItemID:  sourceFoodItemID,
					TargetVisitItemID: createdItemIDs[index],
				})
			}
		}
	}

	return matches, nil
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
