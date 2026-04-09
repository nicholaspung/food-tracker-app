package handlers

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

type restaurantListSaveBookmarkRequest struct {
	RestaurantID string  `json:"restaurantId"`
	FoodItemID   string  `json:"foodItemId"`
	Note         *string `json:"note"`
	SourceUserID string  `json:"sourceUserId"`
}

type restaurantListLinkVisitRequest struct {
	UserFoodItemID string `json:"userFoodItemId"`
}

type restaurantListAddRatingsRequest struct {
	RestaurantID string   `json:"restaurantId"`
	FoodItemIDs  []string `json:"foodItemIds"`
	Note         *string  `json:"note"`
}

type restaurantListReorderRequest struct {
	RestaurantID string `json:"restaurantId"`
	Direction    string `json:"direction"`
}

type restaurantListRemoveSourceRatingRequest struct {
	FoodItemID string `json:"foodItemId"`
}

type restaurantListMutationGroupResponse struct {
	List         restaurantListDetailListResponse   `json:"list"`
	ListID       string                             `json:"listId"`
	RestaurantID string                             `json:"restaurantId"`
	Items        []restaurantListDetailItemResponse `json:"items"`
}

type restaurantListMutationListResponse struct {
	List   restaurantListDetailListResponse   `json:"list"`
	ListID string                             `json:"listId"`
	Items  []restaurantListDetailItemResponse `json:"items"`
}

func registerRestaurantListWriteHandlers(se *core.ServeEvent, app core.App) {
	se.Router.POST("/api/restaurant-lists/{listId}/bookmarks", func(e *core.RequestEvent) error {
		listID := strings.TrimSpace(e.Request.PathValue("listId"))
		if listID == "" {
			return apis.NewBadRequestError("listId is required", nil)
		}

		requestBody := restaurantListSaveBookmarkRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var responsePayload restaurantListMutationGroupResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			restaurantID, err := saveRestaurantListBookmarkTransaction(txApp, e.Auth, listID, requestBody)
			if err != nil {
				return err
			}

			responsePayload, err = buildRestaurantListMutationGroupResponse(
				txApp,
				e.Auth.Id,
				e.Auth.GetBool("isAdmin"),
				listID,
				restaurantID,
			)
			if err != nil {
				return apis.NewApiError(500, "failed to load updated restaurant list items", err)
			}

			return nil
		}); err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/restaurant-lists/{listId}/restaurants", func(e *core.RequestEvent) error {
		listID := strings.TrimSpace(e.Request.PathValue("listId"))
		if listID == "" {
			return apis.NewBadRequestError("listId is required", nil)
		}

		requestBody := restaurantListAddRatingsRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var responsePayload restaurantListMutationGroupResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			restaurantID, err := addRestaurantListRatingsTransaction(txApp, e.Auth, listID, requestBody)
			if err != nil {
				return err
			}

			responsePayload, err = buildRestaurantListMutationGroupResponse(
				txApp,
				e.Auth.Id,
				e.Auth.GetBool("isAdmin"),
				listID,
				restaurantID,
			)
			if err != nil {
				return apis.NewApiError(500, "failed to load updated restaurant list items", err)
			}

			return nil
		}); err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/restaurant-lists/{listId}/restaurants/reorder", func(e *core.RequestEvent) error {
		listID := strings.TrimSpace(e.Request.PathValue("listId"))
		if listID == "" {
			return apis.NewBadRequestError("listId is required", nil)
		}

		requestBody := restaurantListReorderRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var responsePayload restaurantListMutationListResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			if err := reorderRestaurantListTransaction(txApp, e.Auth, listID, requestBody); err != nil {
				return err
			}

			var err error
			responsePayload, err = buildRestaurantListMutationListResponse(
				txApp,
				e.Auth.Id,
				e.Auth.GetBool("isAdmin"),
				listID,
			)
			if err != nil {
				return apis.NewApiError(500, "failed to load reordered restaurant list items", err)
			}

			return nil
		}); err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/restaurant-lists/{listId}/list-items/{listItemId}/remove-source-rating", func(e *core.RequestEvent) error {
		listID := strings.TrimSpace(e.Request.PathValue("listId"))
		if listID == "" {
			return apis.NewBadRequestError("listId is required", nil)
		}

		listItemID := strings.TrimSpace(e.Request.PathValue("listItemId"))
		if listItemID == "" {
			return apis.NewBadRequestError("listItemId is required", nil)
		}

		requestBody := restaurantListRemoveSourceRatingRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var responsePayload restaurantListMutationGroupResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			restaurantID, err := removeRestaurantListSourceRatingTransaction(
				txApp,
				e.Auth,
				listID,
				listItemID,
				requestBody,
			)
			if err != nil {
				return err
			}

			responsePayload, err = buildRestaurantListMutationGroupResponse(
				txApp,
				e.Auth.Id,
				e.Auth.GetBool("isAdmin"),
				listID,
				restaurantID,
			)
			if err != nil {
				return apis.NewApiError(500, "failed to load updated restaurant list items", err)
			}

			return nil
		}); err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/restaurant-lists/{listId}/list-items/{listItemId}/remove-user-rating", func(e *core.RequestEvent) error {
		listID := strings.TrimSpace(e.Request.PathValue("listId"))
		if listID == "" {
			return apis.NewBadRequestError("listId is required", nil)
		}

		listItemID := strings.TrimSpace(e.Request.PathValue("listItemId"))
		if listItemID == "" {
			return apis.NewBadRequestError("listItemId is required", nil)
		}

		var responsePayload restaurantListMutationGroupResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			restaurantID, err := removeRestaurantListUserRatingTransaction(txApp, e.Auth, listID, listItemID)
			if err != nil {
				return err
			}

			responsePayload, err = buildRestaurantListMutationGroupResponse(
				txApp,
				e.Auth.Id,
				e.Auth.GetBool("isAdmin"),
				listID,
				restaurantID,
			)
			if err != nil {
				return apis.NewApiError(500, "failed to load updated restaurant list items", err)
			}

			return nil
		}); err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/restaurant-lists/list-items/{listItemId}/link-visit", func(e *core.RequestEvent) error {
		listItemID := strings.TrimSpace(e.Request.PathValue("listItemId"))
		if listItemID == "" {
			return apis.NewBadRequestError("listItemId is required", nil)
		}

		requestBody := restaurantListLinkVisitRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var responsePayload restaurantListMutationGroupResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			listID, restaurantID, err := linkRestaurantListVisitTransaction(txApp, e.Auth, listItemID, requestBody)
			if err != nil {
				return err
			}

			responsePayload, err = buildRestaurantListMutationGroupResponse(
				txApp,
				e.Auth.Id,
				e.Auth.GetBool("isAdmin"),
				listID,
				restaurantID,
			)
			if err != nil {
				return apis.NewApiError(500, "failed to load updated restaurant list items", err)
			}

			return nil
		}); err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())
}

func saveRestaurantListBookmarkTransaction(
	app core.App,
	authRecord *core.Record,
	listID string,
	requestBody restaurantListSaveBookmarkRequest,
) (string, error) {
	listRecord, err := findOwnedRestaurantListRecord(app, listID, authRecord.Id)
	if err != nil {
		return "", err
	}

	restaurantID := strings.TrimSpace(requestBody.RestaurantID)
	if restaurantID == "" {
		return "", apis.NewBadRequestError("restaurantId is required", nil)
	}

	if _, err := findRestaurantRecord(app, restaurantID); err != nil {
		return "", err
	}

	foodItemID := strings.TrimSpace(requestBody.FoodItemID)
	if foodItemID == "" {
		return "", apis.NewBadRequestError("foodItemId is required", nil)
	}

	foodItemRecord, visitRecord, err := findFoodItemWithVisit(app, foodItemID)
	if err != nil {
		return "", err
	}

	if err := ensureFoodItemVisibleToUser(app, authRecord, foodItemRecord, visitRecord); err != nil {
		return "", err
	}

	if err := ensureFoodItemMatchesRestaurant(foodItemRecord, visitRecord, restaurantID, false); err != nil {
		return "", err
	}

	sourceUserID := strings.TrimSpace(requestBody.SourceUserID)
	if sourceUserID != "" && sourceUserID != strings.TrimSpace(foodItemRecord.GetString("user")) {
		return "", apis.NewBadRequestError("sourceUserId must match the saved food item owner", nil)
	}

	existingItem, err := findRestaurantListItemByFoodItem(app, listRecord.Id, foodItemID)
	if err != nil {
		return "", apis.NewApiError(500, "failed to load existing restaurant list item", err)
	}
	if existingItem != nil {
		return strings.TrimSpace(existingItem.GetString("restaurant")), nil
	}

	nextPosition, err := nextRestaurantListItemPosition(app, listRecord.Id)
	if err != nil {
		return "", apis.NewApiError(500, "failed to resolve next list position", err)
	}

	listItemsCollection, err := app.FindCollectionByNameOrId("list_items")
	if err != nil {
		return "", apis.NewApiError(500, "internal error", err)
	}

	record := core.NewRecord(listItemsCollection)
	record.Set("list", listRecord.Id)
	record.Set("restaurant", restaurantID)
	record.Set("addedBy", authRecord.Id)
	record.Set("sourceUser", emptyStringToNil(sourceUserID))
	record.Set("foodItem", foodItemID)
	record.Set("position", nextPosition)
	record.Set("note", emptyStringToNil(strings.TrimSpace(derefString(requestBody.Note))))

	if err := app.Save(record); err != nil {
		if !isUniqueConstraintError(err) {
			return "", apis.NewApiError(500, "failed to save bookmark to restaurant list", err)
		}

		existingItem, lookupErr := findRestaurantListItemByFoodItem(app, listRecord.Id, foodItemID)
		if lookupErr != nil {
			return "", apis.NewApiError(500, "failed to reload existing restaurant list item", lookupErr)
		}
		if existingItem != nil {
			return strings.TrimSpace(existingItem.GetString("restaurant")), nil
		}

		return "", apis.NewApiError(500, "failed to save bookmark to restaurant list", err)
	}

	return restaurantID, nil
}

func addRestaurantListRatingsTransaction(
	app core.App,
	authRecord *core.Record,
	listID string,
	requestBody restaurantListAddRatingsRequest,
) (string, error) {
	listRecord, err := findOwnedRestaurantListRecord(app, listID, authRecord.Id)
	if err != nil {
		return "", err
	}

	restaurantID := strings.TrimSpace(requestBody.RestaurantID)
	if restaurantID == "" {
		return "", apis.NewBadRequestError("restaurantId is required", nil)
	}

	if _, err := findRestaurantRecord(app, restaurantID); err != nil {
		return "", err
	}

	existingItems, err := listRestaurantListGroupRecords(app, listRecord.Id, restaurantID, "position,created")
	if err != nil {
		return "", apis.NewApiError(500, "failed to load existing restaurant list items", err)
	}

	existingFoodItemIDs := collectRestaurantListLinkedFoodItemIDs(existingItems)
	requestedFoodItemIDs := normalizeUniqueTrimmedIDs(requestBody.FoodItemIDs)
	newFoodItemIDs := make([]string, 0, len(requestedFoodItemIDs))

	for _, foodItemID := range requestedFoodItemIDs {
		foodItemRecord, visitRecord, resolveErr := findFoodItemWithVisit(app, foodItemID)
		if resolveErr != nil {
			return "", resolveErr
		}

		if strings.TrimSpace(foodItemRecord.GetString("user")) != authRecord.Id {
			return "", apis.NewForbiddenError("you can only add your own visit ratings to a list", nil)
		}

		if err := ensureFoodItemMatchesRestaurant(foodItemRecord, visitRecord, restaurantID, true); err != nil {
			return "", err
		}

		if _, exists := existingFoodItemIDs[foodItemID]; exists {
			continue
		}

		newFoodItemIDs = append(newFoodItemIDs, foodItemID)
	}

	noteProvided := requestBody.Note != nil
	trimmedNote := strings.TrimSpace(derefString(requestBody.Note))
	firstExistingItem := firstRecord(existingItems)

	if noteProvided && firstExistingItem != nil {
		firstExistingItem.Set("note", emptyStringToNil(trimmedNote))
		if err := app.Save(firstExistingItem); err != nil {
			return "", apis.NewApiError(500, "failed to update restaurant list note", err)
		}

		if len(newFoodItemIDs) == 0 {
			return restaurantID, nil
		}
	}

	if len(newFoodItemIDs) == 0 && len(existingItems) > 0 {
		return restaurantID, nil
	}

	nextPosition, err := nextRestaurantListItemPosition(app, listRecord.Id)
	if err != nil {
		return "", apis.NewApiError(500, "failed to resolve next list position", err)
	}

	listItemsCollection, err := app.FindCollectionByNameOrId("list_items")
	if err != nil {
		return "", apis.NewApiError(500, "internal error", err)
	}

	if len(newFoodItemIDs) == 0 {
		record := core.NewRecord(listItemsCollection)
		record.Set("list", listRecord.Id)
		record.Set("restaurant", restaurantID)
		record.Set("addedBy", authRecord.Id)
		record.Set("position", nextPosition)
		record.Set("note", emptyStringToNil(trimmedNote))
		if err := app.Save(record); err != nil {
			return "", apis.NewApiError(500, "failed to add restaurant to list", err)
		}

		return restaurantID, nil
	}

	for index, foodItemID := range newFoodItemIDs {
		record := core.NewRecord(listItemsCollection)
		record.Set("list", listRecord.Id)
		record.Set("restaurant", restaurantID)
		record.Set("addedBy", authRecord.Id)
		record.Set("foodItem", foodItemID)
		record.Set("position", nextPosition)

		if noteProvided && firstExistingItem == nil && index == 0 {
			record.Set("note", emptyStringToNil(trimmedNote))
		}

		if err := app.Save(record); err != nil {
			if !isUniqueConstraintError(err) {
				return "", apis.NewApiError(500, "failed to add restaurant ratings to list", err)
			}
		} else {
			nextPosition += 1
		}
	}

	return restaurantID, nil
}

func reorderRestaurantListTransaction(
	app core.App,
	authRecord *core.Record,
	listID string,
	requestBody restaurantListReorderRequest,
) error {
	listRecord, err := findOwnedRestaurantListRecord(app, listID, authRecord.Id)
	if err != nil {
		return err
	}

	restaurantID := strings.TrimSpace(requestBody.RestaurantID)
	if restaurantID == "" {
		return apis.NewBadRequestError("restaurantId is required", nil)
	}

	direction := strings.TrimSpace(requestBody.Direction)
	if direction != "up" && direction != "down" {
		return apis.NewBadRequestError("direction must be up or down", nil)
	}

	listItems, err := listRestaurantListMutationItemRecords(app, listRecord.Id)
	if err != nil {
		return apis.NewApiError(500, "failed to load restaurant list items", err)
	}
	if len(listItems) < 2 {
		return nil
	}

	listItemsByRestaurant := make(map[string][]*core.Record)
	restaurantOrder := make([]string, 0, len(listItems))
	for _, listItem := range listItems {
		itemRestaurantID := strings.TrimSpace(listItem.GetString("restaurant"))
		if itemRestaurantID == "" {
			continue
		}

		if existingItems := listItemsByRestaurant[itemRestaurantID]; existingItems != nil {
			listItemsByRestaurant[itemRestaurantID] = append(existingItems, listItem)
			continue
		}

		listItemsByRestaurant[itemRestaurantID] = []*core.Record{listItem}
		restaurantOrder = append(restaurantOrder, itemRestaurantID)
	}

	currentIndex := -1
	for index, orderedRestaurantID := range restaurantOrder {
		if orderedRestaurantID == restaurantID {
			currentIndex = index
			break
		}
	}
	if currentIndex == -1 {
		return nil
	}

	targetIndex := currentIndex - 1
	if direction == "down" {
		targetIndex = currentIndex + 1
	}
	if targetIndex < 0 || targetIndex >= len(restaurantOrder) {
		return nil
	}

	restaurantOrder[currentIndex], restaurantOrder[targetIndex] = restaurantOrder[targetIndex], restaurantOrder[currentIndex]

	reorderedItems := make([]*core.Record, 0, len(listItems))
	for _, orderedRestaurantID := range restaurantOrder {
		reorderedItems = append(reorderedItems, listItemsByRestaurant[orderedRestaurantID]...)
	}

	for index, listItem := range reorderedItems {
		nextPosition := index + 1
		if listItem.GetInt("position") == nextPosition {
			continue
		}

		listItem.Set("position", nextPosition)
		if err := app.Save(listItem); err != nil {
			return apis.NewApiError(500, "failed to reorder restaurant list items", err)
		}
	}

	return nil
}

func linkRestaurantListVisitTransaction(
	app core.App,
	authRecord *core.Record,
	listItemID string,
	requestBody restaurantListLinkVisitRequest,
) (string, string, error) {
	userFoodItemID := strings.TrimSpace(requestBody.UserFoodItemID)
	if userFoodItemID == "" {
		return "", "", apis.NewBadRequestError("userFoodItemId is required", nil)
	}

	listItemRecord, err := app.FindRecordById("list_items", listItemID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", "", apis.NewNotFoundError("list item not found", err)
		}
		return "", "", apis.NewApiError(500, "failed to load restaurant list item", err)
	}

	listID := strings.TrimSpace(listItemRecord.GetString("list"))
	listRecord, err := app.FindRecordById("restaurant_lists", listID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", "", apis.NewNotFoundError("restaurant list not found", err)
		}
		return "", "", apis.NewApiError(500, "failed to load restaurant list", err)
	}

	isListOwner := strings.TrimSpace(listRecord.GetString("user")) == authRecord.Id
	isItemAdder := strings.TrimSpace(listItemRecord.GetString("addedBy")) == authRecord.Id
	if !isListOwner && !isItemAdder {
		return "", "", apis.NewForbiddenError("you can only link bookmarks in your own lists", nil)
	}

	userFoodItemRecord, visitRecord, err := findFoodItemWithVisit(app, userFoodItemID)
	if err != nil {
		return "", "", err
	}

	if strings.TrimSpace(userFoodItemRecord.GetString("user")) != authRecord.Id {
		return "", "", apis.NewForbiddenError("you can only link your own rated items", nil)
	}

	restaurantID := strings.TrimSpace(listItemRecord.GetString("restaurant"))
	if err := ensureFoodItemMatchesRestaurant(userFoodItemRecord, visitRecord, restaurantID, true); err != nil {
		return "", "", err
	}

	listItemRecord.Set("userFoodItem", userFoodItemID)
	if err := app.Save(listItemRecord); err != nil {
		return "", "", apis.NewApiError(500, "failed to link visit to restaurant list bookmark", err)
	}

	return listID, restaurantID, nil
}

func removeRestaurantListSourceRatingTransaction(
	app core.App,
	authRecord *core.Record,
	listID string,
	listItemID string,
	requestBody restaurantListRemoveSourceRatingRequest,
) (string, error) {
	if _, err := findOwnedRestaurantListRecord(app, listID, authRecord.Id); err != nil {
		return "", err
	}

	foodItemID := strings.TrimSpace(requestBody.FoodItemID)
	if foodItemID == "" {
		return "", apis.NewBadRequestError("foodItemId is required", nil)
	}

	listItemRecord, err := app.FindRecordById("list_items", listItemID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", apis.NewApiError(500, "failed to load restaurant list item", err)
	}

	if strings.TrimSpace(listItemRecord.GetString("list")) != listID {
		return "", apis.NewNotFoundError("list item not found", nil)
	}

	restaurantID := strings.TrimSpace(listItemRecord.GetString("restaurant"))
	nextFoodItem := strings.TrimSpace(listItemRecord.GetString("foodItem"))
	nextUserFoodItem := strings.TrimSpace(listItemRecord.GetString("userFoodItem"))
	nextSourceUser := strings.TrimSpace(listItemRecord.GetString("sourceUser"))
	nextRecommendedItems := normalizeUniqueTrimmedIDs(listItemRecord.GetStringSlice("recommendedItems"))

	isPrimaryFoodItem := nextFoodItem == foodItemID
	hasRecommendedFoodItem := false
	for _, recommendedItemID := range nextRecommendedItems {
		if recommendedItemID == foodItemID {
			hasRecommendedFoodItem = true
			break
		}
	}

	if !isPrimaryFoodItem && !hasRecommendedFoodItem {
		return restaurantID, nil
	}

	if isPrimaryFoodItem {
		nextFoodItem = ""
	} else {
		filteredRecommendedItems := make([]string, 0, len(nextRecommendedItems))
		for _, recommendedItemID := range nextRecommendedItems {
			if recommendedItemID == foodItemID {
				continue
			}
			filteredRecommendedItems = append(filteredRecommendedItems, recommendedItemID)
		}
		nextRecommendedItems = filteredRecommendedItems
	}

	hasSourceItems := nextFoodItem != "" || len(nextRecommendedItems) > 0
	if !hasSourceItems {
		if nextUserFoodItem != "" {
			nextFoodItem = nextUserFoodItem
			nextUserFoodItem = ""
			nextSourceUser = ""
		} else {
			if err := app.Delete(listItemRecord); err != nil {
				return "", apis.NewApiError(500, "failed to remove restaurant list source rating", err)
			}
			return restaurantID, nil
		}
	}

	listItemRecord.Set("foodItem", emptyStringToNil(nextFoodItem))
	listItemRecord.Set("recommendedItems", nextRecommendedItems)
	listItemRecord.Set("sourceUser", emptyStringToNil(nextSourceUser))
	listItemRecord.Set("userFoodItem", emptyStringToNil(nextUserFoodItem))
	if err := app.Save(listItemRecord); err != nil {
		return "", apis.NewApiError(500, "failed to remove restaurant list source rating", err)
	}

	return restaurantID, nil
}

func removeRestaurantListUserRatingTransaction(
	app core.App,
	authRecord *core.Record,
	listID string,
	listItemID string,
) (string, error) {
	if _, err := findOwnedRestaurantListRecord(app, listID, authRecord.Id); err != nil {
		return "", err
	}

	listItemRecord, err := app.FindRecordById("list_items", listItemID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", apis.NewApiError(500, "failed to load restaurant list item", err)
	}

	if strings.TrimSpace(listItemRecord.GetString("list")) != listID {
		return "", apis.NewNotFoundError("list item not found", nil)
	}

	restaurantID := strings.TrimSpace(listItemRecord.GetString("restaurant"))
	if strings.TrimSpace(listItemRecord.GetString("userFoodItem")) == "" {
		return restaurantID, nil
	}

	hasSourceItems := strings.TrimSpace(listItemRecord.GetString("foodItem")) != ""
	if !hasSourceItems {
		for _, recommendedItemID := range listItemRecord.GetStringSlice("recommendedItems") {
			if strings.TrimSpace(recommendedItemID) == "" {
				continue
			}
			hasSourceItems = true
			break
		}
	}

	if !hasSourceItems {
		if err := app.Delete(listItemRecord); err != nil {
			return "", apis.NewApiError(500, "failed to remove restaurant list user rating", err)
		}
		return restaurantID, nil
	}

	listItemRecord.Set("userFoodItem", nil)
	if err := app.Save(listItemRecord); err != nil {
		return "", apis.NewApiError(500, "failed to remove restaurant list user rating", err)
	}

	return restaurantID, nil
}

func findOwnedRestaurantListRecord(app core.App, listID string, userID string) (*core.Record, error) {
	record, err := app.FindRecordById("restaurant_lists", listID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apis.NewNotFoundError("restaurant list not found", err)
		}
		return nil, apis.NewApiError(500, "failed to load restaurant list", err)
	}

	if strings.TrimSpace(record.GetString("user")) != userID {
		return nil, apis.NewForbiddenError("you can only update your own restaurant lists", nil)
	}

	return record, nil
}

func findRestaurantRecord(app core.App, restaurantID string) (*core.Record, error) {
	record, err := app.FindRecordById("restaurants", restaurantID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apis.NewNotFoundError("restaurant not found", err)
		}
		return nil, apis.NewApiError(500, "failed to load restaurant", err)
	}

	return record, nil
}

func findFoodItemWithVisit(app core.App, foodItemID string) (*core.Record, *core.Record, error) {
	record, err := app.FindRecordById("food_items", foodItemID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, apis.NewNotFoundError("food item not found", err)
		}
		return nil, nil, apis.NewApiError(500, "failed to load food item", err)
	}

	visitID := strings.TrimSpace(record.GetString("visit"))
	if visitID == "" {
		return record, nil, nil
	}

	visitRecord, err := app.FindRecordById("visits", visitID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, apis.NewApiError(500, "linked visit was not found", err)
		}
		return nil, nil, apis.NewApiError(500, "failed to load linked visit", err)
	}

	return record, visitRecord, nil
}

func ensureFoodItemVisibleToUser(
	app core.App,
	authRecord *core.Record,
	foodItemRecord *core.Record,
	visitRecord *core.Record,
) error {
	acceptedFriendIDs, err := listAcceptedFriendIDs(app, authRecord.Id)
	if err != nil {
		return apis.NewApiError(500, "failed to verify food item visibility", err)
	}

	visitsByID := map[string]*core.Record{}
	if visitRecord != nil {
		visitsByID[visitRecord.Id] = visitRecord
	}

	if !canAccessFoodItemRecord(
		foodItemRecord,
		visitsByID,
		authRecord.Id,
		authRecord.GetBool("isAdmin"),
		acceptedFriendIDs,
	) {
		return apis.NewForbiddenError("you cannot use that food item in this restaurant list", nil)
	}

	return nil
}

func ensureFoodItemMatchesRestaurant(
	foodItemRecord *core.Record,
	visitRecord *core.Record,
	restaurantID string,
	requireVisit bool,
) error {
	if visitRecord == nil {
		if requireVisit {
			return apis.NewBadRequestError("food item must be linked to a visit for this restaurant", nil)
		}
		return nil
	}

	if strings.TrimSpace(visitRecord.GetString("restaurant")) != restaurantID {
		return apis.NewBadRequestError("food item does not belong to this restaurant", nil)
	}

	if !isOwnerAccessibleModerationStatus(foodItemRecord.GetString("moderationStatus")) ||
		!isOwnerAccessibleModerationStatus(visitRecord.GetString("moderationStatus")) {
		return apis.NewForbiddenError("you cannot use that food item in this restaurant list", nil)
	}

	return nil
}

func nextRestaurantListItemPosition(app core.App, listID string) (int, error) {
	row := struct {
		MaxPosition int `db:"maxPosition"`
	}{}

	err := app.DB().NewQuery(`
		SELECT COALESCE(MAX(position), 0) AS [[maxPosition]]
		FROM list_items
		WHERE list = {:listId}
	`).
		Bind(dbx.Params{"listId": listID}).
		One(&row)
	if err != nil {
		return 0, err
	}

	return row.MaxPosition + 1, nil
}

func findRestaurantListItemByFoodItem(app core.App, listID string, foodItemID string) (*core.Record, error) {
	record, err := app.FindFirstRecordByFilter(
		"list_items",
		"list = {:listId} && foodItem = {:foodItemId}",
		dbx.Params{
			"listId":     listID,
			"foodItemId": foodItemID,
		},
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return record, nil
}

func listRestaurantListGroupRecords(
	app core.App,
	listID string,
	restaurantID string,
	sortExpr string,
) ([]*core.Record, error) {
	return app.FindRecordsByFilter(
		"list_items",
		"list = {:listId} && restaurant = {:restaurantId}",
		sortExpr,
		2000,
		0,
		dbx.Params{
			"listId":       listID,
			"restaurantId": restaurantID,
		},
	)
}

func collectRestaurantListLinkedFoodItemIDs(records []*core.Record) map[string]struct{} {
	result := make(map[string]struct{})

	for _, record := range records {
		for _, foodItemID := range restaurantListDetailLookupIDsForRecord(record) {
			result[foodItemID] = struct{}{}
		}
	}

	return result
}

func listRestaurantListMutationItemRecords(app core.App, listID string) ([]*core.Record, error) {
	return app.FindRecordsByFilter(
		"list_items",
		"list = {:listId}",
		"position,-created",
		2000,
		0,
		dbx.Params{"listId": listID},
	)
}

func buildRestaurantListMutationGroupResponse(
	app core.App,
	userID string,
	isAdmin bool,
	listID string,
	restaurantID string,
) (restaurantListMutationGroupResponse, error) {
	response := restaurantListMutationGroupResponse{
		ListID:       listID,
		RestaurantID: restaurantID,
		Items:        []restaurantListDetailItemResponse{},
	}

	listRecord, err := app.FindRecordById("restaurant_lists", listID)
	if err != nil {
		return response, err
	}
	response.List = buildRestaurantListDetailListResponse(listRecord)

	if restaurantID == "" {
		return response, nil
	}

	listItemRecords, err := listRestaurantListGroupRecords(app, listID, restaurantID, "position,-created")
	if err != nil {
		return response, err
	}
	if len(listItemRecords) == 0 {
		return response, nil
	}

	itemResponses, err := buildRestaurantListDetailItemResponses(app, userID, isAdmin, listItemRecords)
	if err != nil {
		return response, err
	}

	response.Items = itemResponses
	return response, nil
}

func buildRestaurantListMutationListResponse(
	app core.App,
	userID string,
	isAdmin bool,
	listID string,
) (restaurantListMutationListResponse, error) {
	response := restaurantListMutationListResponse{
		ListID: listID,
		Items:  []restaurantListDetailItemResponse{},
	}

	listRecord, err := app.FindRecordById("restaurant_lists", listID)
	if err != nil {
		return response, err
	}
	response.List = buildRestaurantListDetailListResponse(listRecord)

	listItemRecords, err := listRestaurantListMutationItemRecords(app, listID)
	if err != nil {
		return response, err
	}
	if len(listItemRecords) == 0 {
		return response, nil
	}

	itemResponses, err := buildRestaurantListDetailItemResponses(app, userID, isAdmin, listItemRecords)
	if err != nil {
		return response, err
	}

	response.Items = itemResponses
	return response, nil
}

func buildRestaurantListDetailItemResponses(
	app core.App,
	userID string,
	isAdmin bool,
	listItemRecords []*core.Record,
) ([]restaurantListDetailItemResponse, error) {
	restaurantIDs := make([]string, 0, len(listItemRecords))
	sourceUserIDs := make([]string, 0, len(listItemRecords))
	foodItemIDs := make([]string, 0, len(listItemRecords)*3)
	restaurantIDSet := map[string]struct{}{}
	sourceUserIDSet := map[string]struct{}{}
	foodItemIDSet := map[string]struct{}{}

	for _, listItem := range listItemRecords {
		restaurantIDs = appendUniqueTrimmedID(restaurantIDs, restaurantIDSet, listItem.GetString("restaurant"))
		sourceUserIDs = appendUniqueTrimmedID(sourceUserIDs, sourceUserIDSet, listItem.GetString("sourceUser"))
		foodItemIDs = appendUniqueTrimmedID(foodItemIDs, foodItemIDSet, listItem.GetString("foodItem"))
		foodItemIDs = appendUniqueTrimmedID(foodItemIDs, foodItemIDSet, listItem.GetString("userFoodItem"))
		for _, recommendedItemID := range listItem.GetStringSlice("recommendedItems") {
			foodItemIDs = appendUniqueTrimmedID(foodItemIDs, foodItemIDSet, recommendedItemID)
		}
	}

	restaurantRecords, err := findRecordsByIDs(app, "restaurants", restaurantIDs)
	if err != nil {
		return nil, err
	}
	restaurantsByID := mapRecordsByID(restaurantRecords)

	foodItemRecords, err := findRecordsByIDs(app, "food_items", foodItemIDs)
	if err != nil {
		return nil, err
	}

	visitIDs := make([]string, 0, len(foodItemRecords))
	visitIDSet := map[string]struct{}{}
	for _, foodItem := range foodItemRecords {
		visitIDs = appendUniqueTrimmedID(visitIDs, visitIDSet, foodItem.GetString("visit"))
	}

	visitRecords, err := findRecordsByIDs(app, "visits", visitIDs)
	if err != nil {
		return nil, err
	}
	visitsByID := mapRecordsByID(visitRecords)

	acceptedFriendIDs, err := listAcceptedFriendIDs(app, userID)
	if err != nil {
		return nil, err
	}

	accessibleFoodItems := make([]*core.Record, 0, len(foodItemRecords))
	for _, foodItem := range foodItemRecords {
		if canAccessFoodItemRecord(foodItem, visitsByID, userID, isAdmin, acceptedFriendIDs) {
			accessibleFoodItems = append(accessibleFoodItems, foodItem)
			sourceUserIDs = appendUniqueTrimmedID(sourceUserIDs, sourceUserIDSet, foodItem.GetString("user"))
		}
	}
	foodItemsByID := mapRecordsByID(accessibleFoodItems)

	userRecords, err := findRecordsByIDs(app, "users", sourceUserIDs)
	if err != nil {
		return nil, err
	}
	usersByID := mapRecordsByID(userRecords)

	items := make([]restaurantListDetailItemResponse, 0, len(listItemRecords))
	for _, listItem := range listItemRecords {
		itemResponse := restaurantListDetailItemResponse{
			ID:                    listItem.Id,
			ListID:                listItem.GetString("list"),
			RestaurantID:          listItem.GetString("restaurant"),
			RestaurantName:        defaultString(resolveRestaurantName(restaurantsByID[listItem.GetString("restaurant")]), "Unknown restaurant"),
			RestaurantCity:        resolveRestaurantLocation(restaurantsByID[listItem.GetString("restaurant")]),
			RestaurantCuisineType: resolveRestaurantCuisine(restaurantsByID[listItem.GetString("restaurant")]),
			SourceUserID:          strings.TrimSpace(listItem.GetString("sourceUser")),
			Position:              listItem.GetInt("position"),
			BookmarkedItems:       []restaurantListDetailBookmarkedItemResponse{},
			Note:                  strings.TrimSpace(listItem.GetString("note")),
			CreatedAt:             strings.TrimSpace(listItem.GetString("created")),
		}

		if sourceUserRecord := usersByID[itemResponse.SourceUserID]; sourceUserRecord != nil {
			itemResponse.SourceUserName = resolveHomeFeedUserName(sourceUserRecord)
		}

		itemResponse.BookmarkedItems = buildRestaurantListDetailBookmarkedItems(
			listItem,
			usersByID,
			foodItemsByID,
			visitsByID,
		)

		items = append(items, itemResponse)
	}

	return items, nil
}

func normalizeUniqueTrimmedIDs(values []string) []string {
	result := make([]string, 0, len(values))
	seen := map[string]struct{}{}

	for _, value := range values {
		trimmedValue := strings.TrimSpace(value)
		if trimmedValue == "" {
			continue
		}
		if _, exists := seen[trimmedValue]; exists {
			continue
		}

		seen[trimmedValue] = struct{}{}
		result = append(result, trimmedValue)
	}

	return result
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}

	return *value
}

func firstRecord(records []*core.Record) *core.Record {
	if len(records) == 0 {
		return nil
	}

	return records[0]
}
