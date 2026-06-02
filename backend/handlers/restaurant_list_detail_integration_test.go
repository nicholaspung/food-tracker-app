package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/hooks"
)

func TestRestaurantListDetailEndpointReturnsHydratedItemsBookmarkStateAndViewerLists(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureSummaryHandlers(se, app)
		hooks.RegisterRestaurantListCountHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	viewer, viewerToken := createAuthUser(t, server.app, false, false)
	_, strangerToken := createAuthUser(t, server.app, false, false)

	owner.Set("name", "List Owner")
	viewer.Set("name", "Saved Viewer")
	if err := server.app.Save(owner); err != nil {
		t.Fatalf("failed to save owner: %v", err)
	}
	if err := server.app.Save(viewer); err != nil {
		t.Fatalf("failed to save viewer: %v", err)
	}

	createFriendshipRecord(t, server.app, owner.Id, viewer.Id, "accepted")

	restaurantA := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Shared Noodles",
		"location":   "San Francisco, CA",
		"visibility": "public",
	})
	restaurantB := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Shared Dumplings",
		"location":   "Oakland, CA",
		"visibility": "private",
	})

	sharedList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":        "Friend Faves",
		"description": "Shared for detail endpoint coverage",
		"user":        owner.Id,
		"visibility":  "friends",
	})

	ownerVisitA := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantA.Id,
		"user":       owner.Id,
		"visitDate":  "2026-04-03 18:30:00.000Z",
		"visibility": "friends",
	})
	ownerFoodItemA := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  ownerVisitA.Id,
		"user":   owner.Id,
		"name":   "Spicy Ramen",
		"rating": 5,
	})
	insertVisitPhotoRowRaw(t, server.app, owner.Id, ownerVisitA.Id, ownerFoodItemA.Id)

	ownerVisitB := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantB.Id,
		"user":       owner.Id,
		"visitDate":  "2026-04-01 19:00:00.000Z",
		"visibility": "friends",
	})
	ownerFoodItemB := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  ownerVisitB.Id,
		"user":   owner.Id,
		"name":   "Soup Dumplings",
		"rating": 4,
	})

	firstListItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       sharedList.Id,
		"restaurant": restaurantA.Id,
		"addedBy":    owner.Id,
		"sourceUser": owner.Id,
		"foodItem":   ownerFoodItemA.Id,
		"position":   1,
		"note":       "Order this first",
	})
	secondListItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       sharedList.Id,
		"restaurant": restaurantB.Id,
		"addedBy":    owner.Id,
		"sourceUser": owner.Id,
		"foodItem":   ownerFoodItemB.Id,
		"position":   2,
	})

	viewerSavedList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Saved",
		"user":       viewer.Id,
		"visibility": "private",
		"isDefault":  true,
	})
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       viewerSavedList.Id,
		"restaurant": restaurantA.Id,
		"addedBy":    viewer.Id,
		"foodItem":   ownerFoodItemA.Id,
		"position":   1,
	})

	viewerResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/restaurant-lists/"+sharedList.Id+"/detail",
		viewerToken,
		"",
	)
	if viewerResponse.Code != http.StatusOK {
		t.Fatalf("expected viewer response 200 OK, got %d: %s", viewerResponse.Code, viewerResponse.Body.String())
	}

	var viewerPayload struct {
		List struct {
			ID              string `json:"id"`
			Name            string `json:"name"`
			UserID          string `json:"userId"`
			OwnerName       string `json:"ownerName"`
			RestaurantCount int    `json:"restaurantCount"`
			MenuItemCount   int    `json:"menuItemCount"`
		} `json:"list"`
		Items []struct {
			ID                   string `json:"id"`
			RestaurantID         string `json:"restaurantId"`
			RestaurantName       string `json:"restaurantName"`
			RestaurantVisibility string `json:"restaurantVisibility"`
			SourceUserID         string `json:"sourceUserId"`
			SourceUserName       string `json:"sourceUserName"`
			BookmarkedItems      []struct {
				ID             string  `json:"id"`
				Name           string  `json:"name"`
				Rating         float64 `json:"rating"`
				SourceUserID   string  `json:"sourceUserId"`
				SourceUserName string  `json:"sourceUserName"`
			} `json:"bookmarkedItems"`
		} `json:"items"`
		BookmarkState struct {
			SavedListIDsByBookmarkLookupID map[string][]string `json:"savedListIdsByBookmarkLookupId"`
		} `json:"bookmarkState"`
		PhotoPreviews []struct {
			ID         string `json:"id"`
			FoodItemID string `json:"food_item"`
			OwnerName  string `json:"ownerName"`
			Photo      string `json:"photo"`
		} `json:"photoPreviews"`
		ViewerLists []struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			IsDefault bool   `json:"isDefault"`
		} `json:"viewerLists"`
	}
	if err := json.Unmarshal(viewerResponse.Body.Bytes(), &viewerPayload); err != nil {
		t.Fatalf("failed to decode viewer payload: %v; body=%s", err, viewerResponse.Body.String())
	}

	if viewerPayload.List.ID != sharedList.Id || viewerPayload.List.Name != "Friend Faves" {
		t.Fatalf("unexpected list payload: %#v", viewerPayload.List)
	}
	if viewerPayload.List.UserID != owner.Id || viewerPayload.List.OwnerName != "List Owner" {
		t.Fatalf("unexpected owner info: %#v", viewerPayload.List)
	}
	if viewerPayload.List.RestaurantCount != 2 || viewerPayload.List.MenuItemCount != 2 {
		t.Fatalf("expected list counts to be updated, got %#v", viewerPayload.List)
	}
	if len(viewerPayload.Items) != 2 {
		t.Fatalf("expected hydrated list items, got %#v", viewerPayload.Items)
	}
	if viewerPayload.Items[0].ID != firstListItem.Id || viewerPayload.Items[0].RestaurantID != restaurantA.Id {
		t.Fatalf("unexpected first list item payload: %#v", viewerPayload.Items[0])
	}
	if viewerPayload.Items[1].ID != secondListItem.Id || viewerPayload.Items[1].RestaurantID != restaurantB.Id {
		t.Fatalf("unexpected second list item payload: %#v", viewerPayload.Items[1])
	}
	if viewerPayload.Items[0].RestaurantVisibility != "public" || viewerPayload.Items[1].RestaurantVisibility != "private" {
		t.Fatalf("expected restaurant visibility metadata, got %#v", viewerPayload.Items)
	}
	if len(viewerPayload.Items[0].BookmarkedItems) != 1 {
		t.Fatalf("expected one bookmarked item, got %#v", viewerPayload.Items[0].BookmarkedItems)
	}
	if viewerPayload.Items[0].BookmarkedItems[0].ID != ownerFoodItemA.Id || viewerPayload.Items[0].BookmarkedItems[0].Name != "Spicy Ramen" {
		t.Fatalf("unexpected bookmarked item payload: %#v", viewerPayload.Items[0].BookmarkedItems[0])
	}
	if viewerPayload.Items[0].BookmarkedItems[0].SourceUserID != owner.Id || viewerPayload.Items[0].BookmarkedItems[0].SourceUserName != "List Owner" {
		t.Fatalf("expected source user attribution, got %#v", viewerPayload.Items[0].BookmarkedItems[0])
	}
	if got := viewerPayload.BookmarkState.SavedListIDsByBookmarkLookupID[ownerFoodItemA.Id]; len(got) != 1 || got[0] != viewerSavedList.Id {
		t.Fatalf("expected bookmark state for %s, got %#v", ownerFoodItemA.Id, viewerPayload.BookmarkState.SavedListIDsByBookmarkLookupID)
	}
	if len(viewerPayload.PhotoPreviews) != 1 {
		t.Fatalf("expected accepted friend to see one photo preview, got %#v", viewerPayload.PhotoPreviews)
	}
	if viewerPayload.PhotoPreviews[0].FoodItemID != ownerFoodItemA.Id || viewerPayload.PhotoPreviews[0].OwnerName != "List Owner" {
		t.Fatalf("unexpected viewer photo preview payload: %#v", viewerPayload.PhotoPreviews[0])
	}
	if viewerPayload.PhotoPreviews[0].Photo != "test-photo.jpg" {
		t.Fatalf("expected viewer photo preview filename test-photo.jpg, got %#v", viewerPayload.PhotoPreviews[0])
	}
	if len(viewerPayload.ViewerLists) != 1 || viewerPayload.ViewerLists[0].ID != viewerSavedList.Id || !viewerPayload.ViewerLists[0].IsDefault {
		t.Fatalf("expected hydrated viewer save targets, got %#v", viewerPayload.ViewerLists)
	}

	ownerResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/restaurant-lists/"+sharedList.Id+"/detail",
		ownerToken,
		"",
	)
	if ownerResponse.Code != http.StatusOK {
		t.Fatalf("expected owner response 200 OK, got %d: %s", ownerResponse.Code, ownerResponse.Body.String())
	}

	var ownerPayload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
		PhotoPreviews []struct {
			ID         string `json:"id"`
			FoodItemID string `json:"food_item"`
			OwnerName  string `json:"ownerName"`
			Photo      string `json:"photo"`
		} `json:"photoPreviews"`
		BookmarkState struct {
			SavedListIDsByBookmarkLookupID map[string][]string `json:"savedListIdsByBookmarkLookupId"`
		} `json:"bookmarkState"`
		ViewerLists []struct {
			ID string `json:"id"`
		} `json:"viewerLists"`
	}
	if err := json.Unmarshal(ownerResponse.Body.Bytes(), &ownerPayload); err != nil {
		t.Fatalf("failed to decode owner payload: %v; body=%s", err, ownerResponse.Body.String())
	}

	if len(ownerPayload.Items) != 2 || ownerPayload.Items[0].ID != firstListItem.Id || ownerPayload.Items[1].ID != secondListItem.Id {
		t.Fatalf("expected both owner items, got %#v", ownerPayload.Items)
	}
	if len(ownerPayload.PhotoPreviews) != 1 {
		t.Fatalf("expected a single owner photo preview, got %#v", ownerPayload.PhotoPreviews)
	}
	if ownerPayload.PhotoPreviews[0].FoodItemID != ownerFoodItemA.Id || ownerPayload.PhotoPreviews[0].OwnerName != "List Owner" {
		t.Fatalf("unexpected owner photo preview payload: %#v", ownerPayload.PhotoPreviews[0])
	}
	if ownerPayload.PhotoPreviews[0].Photo != "test-photo.jpg" {
		t.Fatalf("expected photo filename test-photo.jpg, got %#v", ownerPayload.PhotoPreviews[0])
	}
	if len(ownerPayload.BookmarkState.SavedListIDsByBookmarkLookupID) != 0 {
		t.Fatalf("expected owner bookmark state to be empty, got %#v", ownerPayload.BookmarkState)
	}
	if len(ownerPayload.ViewerLists) != 0 {
		t.Fatalf("expected owner viewer lists to be empty, got %#v", ownerPayload.ViewerLists)
	}

	strangerResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/restaurant-lists/"+sharedList.Id+"/detail",
		strangerToken,
		"",
	)
	if strangerResponse.Code != http.StatusNotFound {
		t.Fatalf("expected stranger response 404 Not Found, got %d: %s", strangerResponse.Code, strangerResponse.Body.String())
	}
}

func TestRestaurantListDetailEndpointReturnsWantToTryFriendOverlapCounts(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureSummaryHandlers(se, app)
		hooks.RegisterRestaurantListCountHooks(app)
	})

	user, token := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)
	secondFriend, _ := createAuthUser(t, server.app, false, false)
	pendingFriend, _ := createAuthUser(t, server.app, false, false)
	stranger, _ := createAuthUser(t, server.app, false, false)

	createFriendshipRecord(t, server.app, user.Id, friend.Id, "accepted")
	createFriendshipRecord(t, server.app, user.Id, secondFriend.Id, "accepted")
	createFriendshipRecord(t, server.app, user.Id, pendingFriend.Id, "pending")

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Shared Bookmark Cafe",
		"location":   "San Francisco, CA",
		"visibility": "public",
	})

	userDefaultList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"user":       user.Id,
		"visibility": "private",
		"isDefault":  true,
	})
	userListItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       userDefaultList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    user.Id,
		"position":   1,
	})

	friendDefaultList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"user":       friend.Id,
		"visibility": "friends",
		"isDefault":  true,
	})
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       friendDefaultList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    friend.Id,
		"position":   1,
	})

	privateFriendDefaultList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"user":       secondFriend.Id,
		"visibility": "private",
		"isDefault":  true,
	})
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       privateFriendDefaultList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    secondFriend.Id,
		"position":   1,
	})

	pendingFriendDefaultList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"user":       pendingFriend.Id,
		"visibility": "friends",
		"isDefault":  true,
	})
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       pendingFriendDefaultList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    pendingFriend.Id,
		"position":   1,
	})

	strangerDefaultList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"user":       stranger.Id,
		"visibility": "friends",
		"isDefault":  true,
	})
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       strangerDefaultList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    stranger.Id,
		"position":   1,
	})

	friendVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       friend.Id,
		"visitDate":  "2026-04-03 18:30:00.000Z",
		"visibility": "friends",
	})
	friendFoodItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  friendVisit.Id,
		"user":   friend.Id,
		"name":   "Latte",
		"rating": 4,
	})
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       friendDefaultList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    friend.Id,
		"foodItem":   friendFoodItem.Id,
		"position":   2,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/restaurant-lists/"+userDefaultList.Id+"/detail",
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected response 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		Items []struct {
			ID                 string `json:"id"`
			FriendOverlapCount int    `json:"friendOverlapCount"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode payload: %v; body=%s", err, response.Body.String())
	}

	if len(payload.Items) != 1 || payload.Items[0].ID != userListItem.Id {
		t.Fatalf("expected one restaurant bookmark with one eligible friend overlap, got %#v", payload.Items)
	}
	if payload.Items[0].FriendOverlapCount != 1 {
		t.Fatalf("expected only the visible accepted-friend restaurant bookmark to count, got %#v", payload.Items[0])
	}
}

func TestRestaurantListCandidateRestaurantsEndpointReturnsHydratedCandidates(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)

	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Saved",
		"visibility": "private",
		"user":       user.Id,
	})
	annotatedRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Sushi Corner",
		"location":    "San Francisco, CA",
		"cuisineType": "Japanese",
		"visibility":  "private",
	})
	otherRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Burger Barn",
		"location":    "Oakland, CA",
		"cuisineType": "American",
		"visibility":  "public",
	})

	olderVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantIDOrFail(annotatedRestaurant),
		"user":       user.Id,
		"visitDate":  "2026-04-02 18:30:00.000Z",
		"visibility": "private",
	})
	newerVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantIDOrFail(annotatedRestaurant),
		"user":       user.Id,
		"visitDate":  "2026-04-05 18:30:00.000Z",
		"visibility": "private",
	})
	otherVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantIDOrFail(otherRestaurant),
		"user":       user.Id,
		"visitDate":  "2026-04-04 18:30:00.000Z",
		"visibility": "private",
	})

	recommendedItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  olderVisit.Id,
		"user":   user.Id,
		"name":   "Miso Soup",
		"rating": 4,
		"notes":  "Savory broth",
	})
	sourceItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  newerVisit.Id,
		"user":   user.Id,
		"name":   "Spicy Tuna Roll",
		"rating": 5,
	})
	firstPhotoID := insertVisitPhotoRowRaw(t, server.app, user.Id, newerVisit.Id, sourceItem.Id)
	secondPhotoID := insertVisitPhotoRowRaw(t, server.app, user.Id, newerVisit.Id, sourceItem.Id)
	if _, err := server.app.DB().NewQuery(`
		UPDATE visit_photos
		SET created = {:created}, updated = {:updated}
		WHERE id = {:id}
	`).
		Bind(dbx.Params{
			"id":      firstPhotoID,
			"created": "2026-04-05T18:30:00Z",
			"updated": "2026-04-05T18:30:00Z",
		}).
		Execute(); err != nil {
		t.Fatalf("failed to update older visit photo timestamp: %v", err)
	}
	if _, err := server.app.DB().NewQuery(`
		UPDATE visit_photos
		SET created = {:created}, updated = {:updated}
		WHERE id = {:id}
	`).
		Bind(dbx.Params{
			"id":      secondPhotoID,
			"created": "2026-04-05T18:31:00Z",
			"updated": "2026-04-05T18:31:00Z",
		}).
		Execute(); err != nil {
		t.Fatalf("failed to update latest visit photo timestamp: %v", err)
	}
	userLinkedItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  newerVisit.Id,
		"user":   user.Id,
		"name":   "Yuzu Soda",
		"rating": 3,
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  otherVisit.Id,
		"user":   user.Id,
		"name":   "Fries",
		"rating": 4,
	})

	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":             list.Id,
		"restaurant":       annotatedRestaurant.Id,
		"addedBy":          user.Id,
		"position":         1,
		"foodItem":         sourceItem.Id,
		"userFoodItem":     userLinkedItem.Id,
		"recommendedItems": []string{recommendedItem.Id},
		"note":             "Already bookmarked",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		fmt.Sprintf("/api/restaurant-lists/%s/candidate-restaurants", list.Id),
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	type candidateFoodItemPayload struct {
		ID           string `json:"id"`
		Name         string `json:"name"`
		VisitedAt    string `json:"visitedAt"`
		PhotoCount   int    `json:"photoCount"`
		PhotoPreview *struct {
			ID    string `json:"id"`
			Photo string `json:"photo"`
		} `json:"photoPreview"`
	}

	var payload struct {
		List struct {
			ID string `json:"id"`
		} `json:"list"`
		Items []struct {
			ID                string                     `json:"id"`
			Name              string                     `json:"name"`
			Visibility        string                     `json:"visibility"`
			ItemCount         int                        `json:"itemCount"`
			VisitDates        []string                   `json:"visitDates"`
			AlreadyInList     bool                       `json:"alreadyInList"`
			ExistingNote      string                     `json:"existingNote"`
			LinkedFoodItemIDs []string                   `json:"linkedFoodItemIds"`
			FoodItems         []candidateFoodItemPayload `json:"foodItems"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse response JSON: %v; body=%s", err, response.Body.String())
	}

	if payload.List.ID != list.Id {
		t.Fatalf("expected target list metadata, got %#v", payload.List)
	}
	if len(payload.Items) != 2 {
		t.Fatalf("expected hydrated candidate restaurants, got %d: %#v", len(payload.Items), payload.Items)
	}

	item := payload.Items[0]
	if item.ID != annotatedRestaurant.Id || item.Name != "Sushi Corner" {
		t.Fatalf("expected annotated restaurant first, got %#v", item)
	}
	if item.Visibility != "private" {
		t.Fatalf("expected private restaurant visibility, got %#v", item)
	}
	if !item.AlreadyInList || item.ExistingNote != "Already bookmarked" {
		t.Fatalf("expected list annotation metadata, got %#v", item)
	}
	if item.ItemCount != 3 || len(item.FoodItems) != 3 {
		t.Fatalf("expected 3 rated items, got %#v", item)
	}
	if len(item.VisitDates) != 2 || item.VisitDates[0] != "2026-04-05 18:30:00.000Z" || item.VisitDates[1] != "2026-04-02 18:30:00.000Z" {
		t.Fatalf("expected visit dates ordered newest first, got %#v", item.VisitDates)
	}

	foodItemIDs := make([]string, 0, len(item.FoodItems))
	for _, foodItem := range item.FoodItems {
		foodItemIDs = append(foodItemIDs, foodItem.ID)
	}
	if !containsVisitedRestaurantString(item.LinkedFoodItemIDs, recommendedItem.Id) ||
		!containsVisitedRestaurantString(item.LinkedFoodItemIDs, sourceItem.Id) ||
		!containsVisitedRestaurantString(item.LinkedFoodItemIDs, userLinkedItem.Id) {
		t.Fatalf("expected linked food item ids to include existing list links, got %#v", item.LinkedFoodItemIDs)
	}
	if !containsVisitedRestaurantString(foodItemIDs, recommendedItem.Id) ||
		!containsVisitedRestaurantString(foodItemIDs, sourceItem.Id) ||
		!containsVisitedRestaurantString(foodItemIDs, userLinkedItem.Id) {
		t.Fatalf("expected restaurant food items in response, got %#v", item.FoodItems)
	}

	var sourceItemPayload *candidateFoodItemPayload
	var recommendedItemPayload *candidateFoodItemPayload
	for index := range item.FoodItems {
		switch item.FoodItems[index].ID {
		case sourceItem.Id:
			sourceItemPayload = &item.FoodItems[index]
		case recommendedItem.Id:
			recommendedItemPayload = &item.FoodItems[index]
		}
	}
	if sourceItemPayload == nil {
		t.Fatalf("expected source item payload for %s, got %#v", sourceItem.Id, item.FoodItems)
	}
	if sourceItemPayload.PhotoPreview == nil {
		t.Fatalf("expected source item photo preview, got %#v", sourceItemPayload)
	}
	if sourceItemPayload.PhotoPreview.ID != secondPhotoID || sourceItemPayload.PhotoPreview.Photo != "test-photo.jpg" {
		t.Fatalf("expected latest photo preview metadata, got %#v", sourceItemPayload.PhotoPreview)
	}
	if sourceItemPayload.PhotoCount != 2 {
		t.Fatalf("expected photoCount=2 for source item, got %#v", sourceItemPayload)
	}
	if recommendedItemPayload == nil {
		t.Fatalf("expected recommended item payload for %s, got %#v", recommendedItem.Id, item.FoodItems)
	}
	if recommendedItemPayload.PhotoPreview != nil {
		t.Fatalf("expected no photo preview for recommended item, got %#v", recommendedItemPayload.PhotoPreview)
	}
	if recommendedItemPayload.PhotoCount != 0 {
		t.Fatalf("expected no photo count for recommended item, got %#v", recommendedItemPayload)
	}
}

func TestRestaurantListCandidateRestaurantsEndpointSearchesRestaurantAndFoodItemMetadata(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)

	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Saved",
		"visibility": "private",
		"user":       user.Id,
	})
	ramenRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Ramen House",
		"location":    "San Jose, CA",
		"cuisineType": "Japanese",
		"visibility":  "public",
	})
	burgerRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Burger Barn",
		"location":    "Berkeley, CA",
		"cuisineType": "American",
		"visibility":  "public",
	})

	ramenVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": ramenRestaurant.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-06 18:30:00.000Z",
		"visibility": "private",
	})
	burgerVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": burgerRestaurant.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-04 18:30:00.000Z",
		"visibility": "private",
	})

	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  ramenVisit.Id,
		"user":   user.Id,
		"name":   "Shoyu Ramen",
		"rating": 5,
		"notes":  "Rich broth and great noodles",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  burgerVisit.Id,
		"user":   user.Id,
		"name":   "Double Burger",
		"rating": 4,
	})

	searchByItemResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		fmt.Sprintf("/api/restaurant-lists/%s/candidate-restaurants?search=broth", list.Id),
		token,
		"",
	)
	if searchByItemResponse.Code != http.StatusOK {
		t.Fatalf("expected item search 200 OK, got %d: %s", searchByItemResponse.Code, searchByItemResponse.Body.String())
	}

	var itemSearchPayload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	if err := json.Unmarshal(searchByItemResponse.Body.Bytes(), &itemSearchPayload); err != nil {
		t.Fatalf("failed to parse item search response JSON: %v; body=%s", err, searchByItemResponse.Body.String())
	}

	if len(itemSearchPayload.Items) != 1 || itemSearchPayload.Items[0].ID != ramenRestaurant.Id {
		t.Fatalf("expected broth search to match only the ramen restaurant, got %#v", itemSearchPayload)
	}

	searchByRestaurantResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		fmt.Sprintf("/api/restaurant-lists/%s/candidate-restaurants?search=burger", list.Id),
		token,
		"",
	)
	if searchByRestaurantResponse.Code != http.StatusOK {
		t.Fatalf("expected restaurant search 200 OK, got %d: %s", searchByRestaurantResponse.Code, searchByRestaurantResponse.Body.String())
	}

	var restaurantSearchPayload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	if err := json.Unmarshal(searchByRestaurantResponse.Body.Bytes(), &restaurantSearchPayload); err != nil {
		t.Fatalf("failed to parse restaurant search response JSON: %v; body=%s", err, searchByRestaurantResponse.Body.String())
	}

	if len(restaurantSearchPayload.Items) != 1 || restaurantSearchPayload.Items[0].ID != burgerRestaurant.Id {
		t.Fatalf("expected burger search to match only the burger restaurant, got %#v", restaurantSearchPayload)
	}
}

func TestRestaurantListCandidateRestaurantsEndpointRequiresListOwnership(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	owner, _ := createAuthUser(t, server.app, false, false)
	_, otherToken := createAuthUser(t, server.app, false, false)

	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Private List",
		"visibility": "private",
		"user":       owner.Id,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		fmt.Sprintf("/api/restaurant-lists/%s/candidate-restaurants", list.Id),
		otherToken,
		"",
	)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for non-owner, got %d: %s", response.Code, response.Body.String())
	}
}

func extractVisitedRestaurantCandidateFoodItemIDs(items []struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	VisitedAt string `json:"visitedAt"`
}) []string {
	result := make([]string, 0, len(items))
	for _, item := range items {
		result = append(result, item.ID)
	}

	return result
}

func containsVisitedRestaurantString(values []string, candidate string) bool {
	for _, value := range values {
		if value == candidate {
			return true
		}
	}

	return false
}
