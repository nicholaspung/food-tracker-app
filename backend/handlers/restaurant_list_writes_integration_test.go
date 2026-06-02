package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

type restaurantListDetailPayload struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Visibility  string `json:"visibility"`
	UserID      string `json:"userId"`
	IsDefault   bool   `json:"isDefault"`
}

type restaurantListMutationGroupPayload struct {
	List struct {
		ID string `json:"id"`
	} `json:"list"`
	ListID       string `json:"listId"`
	RestaurantID string `json:"restaurantId"`
	Items        []struct {
		ID              string `json:"id"`
		RestaurantID    string `json:"restaurantId"`
		Position        int    `json:"position"`
		Note            string `json:"note"`
		BookmarkedItems []struct {
			ID             string `json:"id"`
			MenuItemID     string `json:"menuItemId"`
			UserFoodItemID string `json:"userFoodItemId"`
		} `json:"bookmarkedItems"`
	} `json:"items"`
}

type restaurantListMutationListPayload struct {
	List struct {
		ID string `json:"id"`
	} `json:"list"`
	ListID string `json:"listId"`
	Items  []struct {
		ID           string `json:"id"`
		RestaurantID string `json:"restaurantId"`
		Position     int    `json:"position"`
	} `json:"items"`
}

func TestRestaurantListDefaultEndpointIsIdempotent(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	firstResponse := performJSONRequest(t, server.mux, http.MethodPost, "/api/restaurant-lists/default", token, "")
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first request 200, got %d: %s", firstResponse.Code, firstResponse.Body.String())
	}

	secondResponse := performJSONRequest(t, server.mux, http.MethodPost, "/api/restaurant-lists/default", token, "")
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected second request 200, got %d: %s", secondResponse.Code, secondResponse.Body.String())
	}

	var firstPayload restaurantListDetailPayload
	if err := json.Unmarshal(firstResponse.Body.Bytes(), &firstPayload); err != nil {
		t.Fatalf("failed to parse first default-list payload: %v", err)
	}

	var secondPayload restaurantListDetailPayload
	if err := json.Unmarshal(secondResponse.Body.Bytes(), &secondPayload); err != nil {
		t.Fatalf("failed to parse second default-list payload: %v", err)
	}

	if firstPayload.ID == "" {
		t.Fatal("expected created default list id to be present")
	}
	if secondPayload.ID != firstPayload.ID {
		t.Fatalf("expected second request to reuse list %q, got %q", firstPayload.ID, secondPayload.ID)
	}
	if firstPayload.Name != "Want to Try" {
		t.Fatalf("expected default list name Want to Try, got %q", firstPayload.Name)
	}
	if firstPayload.Description != "Restaurants and recommendations you want to try later" {
		t.Fatalf("expected default list description to match seed copy, got %q", firstPayload.Description)
	}
	if firstPayload.Visibility != "private" {
		t.Fatalf("expected default list visibility private, got %q", firstPayload.Visibility)
	}
	if firstPayload.UserID != user.Id {
		t.Fatalf("expected default list userId %q, got %q", user.Id, firstPayload.UserID)
	}
	if !firstPayload.IsDefault || !secondPayload.IsDefault {
		t.Fatalf("expected endpoint to return isDefault=true, got first=%v second=%v", firstPayload.IsDefault, secondPayload.IsDefault)
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"restaurant_lists",
		"user = {:userId} && isDefault = true",
		map[string]any{"userId": user.Id},
	); count != 1 {
		t.Fatalf("expected exactly 1 default list after repeated calls, got %d", count)
	}
}

func TestRestaurantListDefaultEndpointUsesUniqueDefaultIndex(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	response := performJSONRequest(t, server.mux, http.MethodPost, "/api/restaurant-lists/default", token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected request 200, got %d: %s", response.Code, response.Body.String())
	}

	restaurantListsCollection, err := server.app.FindCollectionByNameOrId("restaurant_lists")
	if err != nil {
		t.Fatalf("failed to resolve restaurant_lists collection: %v", err)
	}

	duplicateRecord := core.NewRecord(restaurantListsCollection)
	duplicateRecord.Set("name", "Saved Copy")
	duplicateRecord.Set("description", "Duplicate default")
	duplicateRecord.Set("visibility", "private")
	duplicateRecord.Set("user", user.Id)
	duplicateRecord.Set("isDefault", true)

	if err := server.app.Save(duplicateRecord); err == nil {
		t.Fatal("expected duplicate default list save to fail with unique constraint")
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"restaurant_lists",
		"user = {:userId} && isDefault = true",
		map[string]any{"userId": user.Id},
	); count != 1 {
		t.Fatalf("expected unique index to preserve a single default list, got %d", count)
	}
}

func TestRestaurantListSaveBookmarkEndpointDedupesExistingFoodItem(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Noodle House")
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Saved",
		"visibility": "private",
		"user":       user.Id,
	})
	visit := seedVisitRecord(t, server.app, restaurant.Id, user.Id, "friends")
	foodItem := seedFoodItemRecord(t, server.app, visit.Id, user.Id, "Spicy Wontons", 4)

	requestBody := fmt.Sprintf(`{
		"restaurantId":"%s",
		"foodItemId":"%s"
	}`, restaurant.Id, foodItem.Id)

	firstResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/bookmarks", list.Id),
		token,
		requestBody,
	)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first request 200, got %d: %s", firstResponse.Code, firstResponse.Body.String())
	}

	secondResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/bookmarks", list.Id),
		token,
		requestBody,
	)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected second request 200, got %d: %s", secondResponse.Code, secondResponse.Body.String())
	}

	var payload restaurantListMutationGroupPayload
	if err := json.Unmarshal(secondResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse bookmark payload: %v", err)
	}

	if payload.RestaurantID != restaurant.Id {
		t.Fatalf("expected restaurantId=%q, got %q", restaurant.Id, payload.RestaurantID)
	}
	if len(payload.Items) != 1 {
		t.Fatalf("expected 1 grouped list item, got %d", len(payload.Items))
	}
	if len(payload.Items[0].BookmarkedItems) != 1 || payload.Items[0].BookmarkedItems[0].ID != foodItem.Id {
		t.Fatalf("expected grouped payload to include saved food item %q, got %#v", foodItem.Id, payload.Items[0].BookmarkedItems)
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"list_items",
		"list = {:listId} && restaurant = {:restaurantId}",
		map[string]any{
			"listId":       list.Id,
			"restaurantId": restaurant.Id,
		},
	); count != 1 {
		t.Fatalf("expected 1 deduped list item, got %d", count)
	}
}

func TestRestaurantListSaveBookmarkEndpointAllowsRestaurantOnlyDefaultBookmark(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Bookmark Cafe")
	defaultList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"visibility": "private",
		"user":       user.Id,
		"isDefault":  true,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/bookmarks", defaultList.Id),
		token,
		fmt.Sprintf(`{
			"restaurantId":"%s",
			"note":"Dinner shortlist"
		}`, restaurant.Id),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected request 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload restaurantListMutationGroupPayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse restaurant-only bookmark payload: %v", err)
	}

	if payload.RestaurantID != restaurant.Id {
		t.Fatalf("expected restaurantId=%q, got %q", restaurant.Id, payload.RestaurantID)
	}
	if len(payload.Items) != 1 {
		t.Fatalf("expected 1 restaurant-only list item, got %d", len(payload.Items))
	}
	if len(payload.Items[0].BookmarkedItems) != 0 {
		t.Fatalf("expected restaurant-only item to have no bookmarked items, got %#v", payload.Items[0].BookmarkedItems)
	}
	if payload.Items[0].Note != "Dinner shortlist" {
		t.Fatalf("expected restaurant-only note to round-trip, got %q", payload.Items[0].Note)
	}
}

func TestRestaurantListSaveBookmarkEndpointDedupesRestaurantOnlyDefaultBookmark(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Repeat Ramen")
	defaultList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"visibility": "private",
		"user":       user.Id,
		"isDefault":  true,
	})
	requestBody := fmt.Sprintf(`{"restaurantId":"%s"}`, restaurant.Id)

	for index := 0; index < 2; index++ {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			fmt.Sprintf("/api/restaurant-lists/%s/bookmarks", defaultList.Id),
			token,
			requestBody,
		)
		if response.Code != http.StatusOK {
			t.Fatalf("expected request %d to return 200, got %d: %s", index+1, response.Code, response.Body.String())
		}
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"list_items",
		"list = {:listId} && restaurant = {:restaurantId}",
		map[string]any{
			"listId":       defaultList.Id,
			"restaurantId": restaurant.Id,
		},
	); count != 1 {
		t.Fatalf("expected duplicate restaurant-only save to preserve 1 list item, got %d", count)
	}
}

func TestRestaurantListSaveBookmarkEndpointAllowsMultipleRestaurantOnlyDefaultBookmarks(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	firstRestaurant := seedRestaurantRecord(t, server.app, user.Id, "First Cafe")
	secondRestaurant := seedRestaurantRecord(t, server.app, user.Id, "Second Cafe")
	defaultList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"visibility": "private",
		"user":       user.Id,
		"isDefault":  true,
	})

	for _, restaurant := range []*core.Record{firstRestaurant, secondRestaurant} {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			fmt.Sprintf("/api/restaurant-lists/%s/bookmarks", defaultList.Id),
			token,
			fmt.Sprintf(`{"restaurantId":"%s"}`, restaurant.Id),
		)
		if response.Code != http.StatusOK {
			t.Fatalf("expected restaurant-only bookmark save for %s to return 200, got %d: %s", restaurant.Id, response.Code, response.Body.String())
		}
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"list_items",
		"list = {:listId}",
		map[string]any{"listId": defaultList.Id},
	); count != 2 {
		t.Fatalf("expected two restaurant-only bookmarks in Want to Try, got %d", count)
	}
}

func TestRestaurantListSaveBookmarkEndpointRejectsRestaurantOnlyNonDefaultBookmark(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Regular List Grill")
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Favorites",
		"visibility": "private",
		"user":       user.Id,
		"isDefault":  false,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/bookmarks", list.Id),
		token,
		fmt.Sprintf(`{"restaurantId":"%s"}`, restaurant.Id),
	)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "default Want to Try list") {
		t.Fatalf("expected clear default-list error, got %s", response.Body.String())
	}
}

func TestRestaurantListSaveBookmarkEndpointAllowsDefaultMenuItemBookmark(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Menu Cafe")
	menuItem := seedMenuItemRecord(t, server.app, restaurant.Id, user.Id, "Tonic Smoothie", "public", false)
	defaultList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"visibility": "private",
		"user":       user.Id,
		"isDefault":  true,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/bookmarks", defaultList.Id),
		token,
		fmt.Sprintf(`{"restaurantId":"%s","menuItemId":"%s"}`, restaurant.Id, menuItem.Id),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected request 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload restaurantListMutationGroupPayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse menu item bookmark payload: %v", err)
	}

	if len(payload.Items) != 1 || len(payload.Items[0].BookmarkedItems) != 1 {
		t.Fatalf("expected one menu item bookmark, got %#v", payload.Items)
	}
	if payload.Items[0].BookmarkedItems[0].MenuItemID != menuItem.Id {
		t.Fatalf("expected menuItemId=%q, got %#v", menuItem.Id, payload.Items[0].BookmarkedItems[0])
	}
}

func TestRestaurantListRemoveBookmarkEndpointRemovesRestaurantOnlyDefaultBookmark(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Remove Cafe")
	defaultList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"visibility": "private",
		"user":       user.Id,
		"isDefault":  true,
	})
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       defaultList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    user.Id,
		"position":   1,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/bookmarks/remove", defaultList.Id),
		token,
		fmt.Sprintf(`{"restaurantId":"%s"}`, restaurant.Id),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected request 200, got %d: %s", response.Code, response.Body.String())
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"list_items",
		"list = {:listId} && restaurant = {:restaurantId}",
		map[string]any{
			"listId":       defaultList.Id,
			"restaurantId": restaurant.Id,
		},
	); count != 0 {
		t.Fatalf("expected restaurant-only bookmark to be removed, got %d records", count)
	}
}

func TestRestaurantListRemoveBookmarkEndpointRemovesMenuItemBookmark(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Remove Menu Cafe")
	menuItem := seedMenuItemRecord(t, server.app, restaurant.Id, user.Id, "Matcha Latte", "public", false)
	defaultList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"visibility": "private",
		"user":       user.Id,
		"isDefault":  true,
	})
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       defaultList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    user.Id,
		"menuItem":   menuItem.Id,
		"position":   1,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/bookmarks/remove", defaultList.Id),
		token,
		fmt.Sprintf(`{"restaurantId":"%s","menuItemId":"%s"}`, restaurant.Id, menuItem.Id),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected request 200, got %d: %s", response.Code, response.Body.String())
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"list_items",
		"list = {:listId} && menuItem = {:menuItemId}",
		map[string]any{
			"listId":     defaultList.Id,
			"menuItemId": menuItem.Id,
		},
	); count != 0 {
		t.Fatalf("expected menu item bookmark to be removed, got %d records", count)
	}
}

func TestRestaurantListSaveBookmarkEndpointRejectsMismatchedSourceUser(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)
	otherUser, _ := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Bento Place")
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Saved",
		"visibility": "private",
		"user":       user.Id,
	})
	visit := seedVisitRecord(t, server.app, restaurant.Id, user.Id, "friends")
	foodItem := seedFoodItemRecord(t, server.app, visit.Id, user.Id, "Salmon Bento", 5)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/bookmarks", list.Id),
		token,
		fmt.Sprintf(`{
			"restaurantId":"%s",
			"foodItemId":"%s",
			"sourceUserId":"%s"
		}`, restaurant.Id, foodItem.Id, otherUser.Id),
	)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}
}

func TestRestaurantListRemoveBookmarkEndpointDeletesSavedFoodItem(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Bookmark Bistro")
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"visibility": "private",
		"user":       user.Id,
		"isDefault":  true,
	})
	visit := seedVisitRecord(t, server.app, restaurant.Id, user.Id, "friends")
	foodItem := seedFoodItemRecord(t, server.app, visit.Id, user.Id, "Crispy Rice", 5)
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    user.Id,
		"foodItem":   foodItem.Id,
		"position":   1,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/bookmarks/remove", list.Id),
		token,
		fmt.Sprintf(`{
			"restaurantId":"%s",
			"foodItemId":"%s"
		}`, restaurant.Id, foodItem.Id),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected request 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload restaurantListMutationGroupPayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse remove bookmark payload: %v", err)
	}
	if payload.RestaurantID != restaurant.Id {
		t.Fatalf("expected restaurantId=%q, got %q", restaurant.Id, payload.RestaurantID)
	}
	if len(payload.Items) != 0 {
		t.Fatalf("expected empty group after bookmark removal, got %#v", payload.Items)
	}
	if count := countRecordsByFilter(
		t,
		server.app,
		"list_items",
		"list = {:listId} && foodItem = {:foodItemId}",
		map[string]any{
			"listId":     list.Id,
			"foodItemId": foodItem.Id,
		},
	); count != 0 {
		t.Fatalf("expected saved bookmark list item to be deleted, got %d", count)
	}
}

func TestRestaurantListLinkVisitEndpointRequiresMatchingRestaurant(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurantA := seedRestaurantRecord(t, server.app, user.Id, "Ramen One")
	restaurantB := seedRestaurantRecord(t, server.app, user.Id, "Burger Two")
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Try Again",
		"visibility": "private",
		"user":       user.Id,
	})
	sourceVisit := seedVisitRecord(t, server.app, restaurantA.Id, user.Id, "friends")
	sourceFoodItem := seedFoodItemRecord(t, server.app, sourceVisit.Id, user.Id, "Tonkotsu", 4)
	listItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurantA.Id,
		"addedBy":    user.Id,
		"foodItem":   sourceFoodItem.Id,
		"position":   1,
	})
	otherVisit := seedVisitRecord(t, server.app, restaurantB.Id, user.Id, "friends")
	otherFoodItem := seedFoodItemRecord(t, server.app, otherVisit.Id, user.Id, "Cheeseburger", 3)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/list-items/%s/link-visit", listItem.Id),
		token,
		fmt.Sprintf(`{
			"userFoodItemId":"%s"
		}`, otherFoodItem.Id),
	)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}

	reloadedListItem, err := server.app.FindRecordById("list_items", listItem.Id)
	if err != nil {
		t.Fatalf("failed to reload list item: %v", err)
	}
	if reloadedListItem.GetString("userFoodItem") != "" {
		t.Fatalf("expected userFoodItem to remain empty, got %q", reloadedListItem.GetString("userFoodItem"))
	}
}

func TestRestaurantListAddRatingsEndpointUpdatesNoteAndAddsOnlyNewItems(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Curry Club")
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Dinner List",
		"visibility": "private",
		"user":       user.Id,
	})
	firstVisit := seedVisitRecord(t, server.app, restaurant.Id, user.Id, "friends")
	secondVisit := seedVisitRecord(t, server.app, restaurant.Id, user.Id, "friends")
	firstFoodItem := seedFoodItemRecord(t, server.app, firstVisit.Id, user.Id, "Katsu Curry", 4)
	secondFoodItem := seedFoodItemRecord(t, server.app, secondVisit.Id, user.Id, "Croquette", 5)
	existingListItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    user.Id,
		"foodItem":   firstFoodItem.Id,
		"position":   1,
		"note":       "Old note",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/restaurants", list.Id),
		token,
		fmt.Sprintf(`{
			"restaurantId":"%s",
			"foodItemIds":["%s","%s"],
			"note":"Updated note"
		}`, restaurant.Id, firstFoodItem.Id, secondFoodItem.Id),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload restaurantListMutationGroupPayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse add-ratings payload: %v", err)
	}

	if len(payload.Items) != 2 {
		t.Fatalf("expected 2 grouped list items after dedupe, got %d", len(payload.Items))
	}

	reloadedExistingItem, err := server.app.FindRecordById("list_items", existingListItem.Id)
	if err != nil {
		t.Fatalf("failed to reload existing list item: %v", err)
	}
	if reloadedExistingItem.GetString("note") != "Updated note" {
		t.Fatalf("expected note to update, got %q", reloadedExistingItem.GetString("note"))
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"list_items",
		"list = {:listId} && restaurant = {:restaurantId}",
		map[string]any{
			"listId":       list.Id,
			"restaurantId": restaurant.Id,
		},
	); count != 2 {
		t.Fatalf("expected 2 list items after adding only the new rating, got %d", count)
	}
}

func TestRestaurantListReorderEndpointUpdatesGroupedPositions(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurantA := seedRestaurantRecord(t, server.app, user.Id, "Alpha")
	restaurantB := seedRestaurantRecord(t, server.app, user.Id, "Bravo")
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Order Test",
		"visibility": "private",
		"user":       user.Id,
	})

	visitA1 := seedVisitRecord(t, server.app, restaurantA.Id, user.Id, "friends")
	visitA2 := seedVisitRecord(t, server.app, restaurantA.Id, user.Id, "friends")
	visitB1 := seedVisitRecord(t, server.app, restaurantB.Id, user.Id, "friends")
	foodItemA1 := seedFoodItemRecord(t, server.app, visitA1.Id, user.Id, "A1", 4)
	foodItemA2 := seedFoodItemRecord(t, server.app, visitA2.Id, user.Id, "A2", 5)
	foodItemB1 := seedFoodItemRecord(t, server.app, visitB1.Id, user.Id, "B1", 3)

	listItemA1 := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurantA.Id,
		"addedBy":    user.Id,
		"foodItem":   foodItemA1.Id,
		"position":   1,
	})
	listItemA2 := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurantA.Id,
		"addedBy":    user.Id,
		"foodItem":   foodItemA2.Id,
		"position":   2,
	})
	listItemB1 := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurantB.Id,
		"addedBy":    user.Id,
		"foodItem":   foodItemB1.Id,
		"position":   3,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/restaurants/reorder", list.Id),
		token,
		fmt.Sprintf(`{
			"restaurantId":"%s",
			"direction":"up"
		}`, restaurantB.Id),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload restaurantListMutationListPayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse reorder payload: %v", err)
	}

	if payload.ListID != list.Id || payload.List.ID != list.Id {
		t.Fatalf("expected hydrated list payload for %q, got %#v", list.Id, payload.List)
	}
	if len(payload.Items) != 3 {
		t.Fatalf("expected 3 hydrated list items, got %d", len(payload.Items))
	}
	if payload.Items[0].RestaurantID != restaurantB.Id || payload.Items[0].Position != 1 {
		t.Fatalf("expected restaurant %q to move to position 1, got %#v", restaurantB.Id, payload.Items[0])
	}
	if payload.Items[1].RestaurantID != restaurantA.Id || payload.Items[1].Position != 2 {
		t.Fatalf("expected first Alpha item at position 2, got %#v", payload.Items[1])
	}
	if payload.Items[2].RestaurantID != restaurantA.Id || payload.Items[2].Position != 3 {
		t.Fatalf("expected second Alpha item at position 3, got %#v", payload.Items[2])
	}

	reloadedA1, err := server.app.FindRecordById("list_items", listItemA1.Id)
	if err != nil {
		t.Fatalf("failed to reload first Alpha item: %v", err)
	}
	reloadedA2, err := server.app.FindRecordById("list_items", listItemA2.Id)
	if err != nil {
		t.Fatalf("failed to reload second Alpha item: %v", err)
	}
	reloadedB1, err := server.app.FindRecordById("list_items", listItemB1.Id)
	if err != nil {
		t.Fatalf("failed to reload Bravo item: %v", err)
	}

	if reloadedB1.GetInt("position") != 1 || reloadedA1.GetInt("position") != 2 || reloadedA2.GetInt("position") != 3 {
		t.Fatalf(
			"expected positions [Bravo=1 Alpha1=2 Alpha2=3], got [Bravo=%d Alpha1=%d Alpha2=%d]",
			reloadedB1.GetInt("position"),
			reloadedA1.GetInt("position"),
			reloadedA2.GetInt("position"),
		)
	}
}

func TestRestaurantListRemoveSourceRatingEndpointPromotesUserRating(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)
	otherUser, _ := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Promotion Cafe")
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Promotion List",
		"visibility": "private",
		"user":       user.Id,
	})
	sourceVisit := seedVisitRecord(t, server.app, restaurant.Id, user.Id, "friends")
	userVisit := seedVisitRecord(t, server.app, restaurant.Id, user.Id, "friends")
	sourceFoodItem := seedFoodItemRecord(t, server.app, sourceVisit.Id, user.Id, "Friend Pick", 4)
	userFoodItem := seedFoodItemRecord(t, server.app, userVisit.Id, user.Id, "Mine", 5)
	listItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":         list.Id,
		"restaurant":   restaurant.Id,
		"addedBy":      user.Id,
		"foodItem":     sourceFoodItem.Id,
		"userFoodItem": userFoodItem.Id,
		"sourceUser":   otherUser.Id,
		"position":     1,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/list-items/%s/remove-source-rating", list.Id, listItem.Id),
		token,
		fmt.Sprintf(`{
			"foodItemId":"%s"
		}`, sourceFoodItem.Id),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload restaurantListMutationGroupPayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse remove-source payload: %v", err)
	}

	if payload.List.ID != list.Id || payload.RestaurantID != restaurant.Id {
		t.Fatalf("expected hydrated list and restaurant ids, got %#v", payload)
	}
	if len(payload.Items) != 1 {
		t.Fatalf("expected 1 remaining grouped item, got %d", len(payload.Items))
	}
	if len(payload.Items[0].BookmarkedItems) != 1 || payload.Items[0].BookmarkedItems[0].ID != userFoodItem.Id {
		t.Fatalf("expected promoted user item %q, got %#v", userFoodItem.Id, payload.Items[0].BookmarkedItems)
	}
	if payload.Items[0].BookmarkedItems[0].UserFoodItemID != "" {
		t.Fatalf("expected promoted user item to become primary foodItem, got %#v", payload.Items[0].BookmarkedItems[0])
	}

	reloadedListItem, err := server.app.FindRecordById("list_items", listItem.Id)
	if err != nil {
		t.Fatalf("failed to reload list item: %v", err)
	}
	if reloadedListItem.GetString("foodItem") != userFoodItem.Id {
		t.Fatalf("expected primary foodItem=%q, got %q", userFoodItem.Id, reloadedListItem.GetString("foodItem"))
	}
	if reloadedListItem.GetString("userFoodItem") != "" {
		t.Fatalf("expected userFoodItem to be cleared, got %q", reloadedListItem.GetString("userFoodItem"))
	}
	if reloadedListItem.GetString("sourceUser") != "" {
		t.Fatalf("expected sourceUser to be cleared, got %q", reloadedListItem.GetString("sourceUser"))
	}
}

func TestRestaurantListRemoveUserRatingEndpointDeletesOrphanedItem(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Cleanup Diner")
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Cleanup List",
		"visibility": "private",
		"user":       user.Id,
	})
	visit := seedVisitRecord(t, server.app, restaurant.Id, user.Id, "friends")
	userFoodItem := seedFoodItemRecord(t, server.app, visit.Id, user.Id, "Only Item", 4)
	listItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":         list.Id,
		"restaurant":   restaurant.Id,
		"addedBy":      user.Id,
		"userFoodItem": userFoodItem.Id,
		"position":     1,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/list-items/%s/remove-user-rating", list.Id, listItem.Id),
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload restaurantListMutationGroupPayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse remove-user payload: %v", err)
	}

	if payload.List.ID != list.Id || payload.RestaurantID != restaurant.Id {
		t.Fatalf("expected hydrated list and restaurant ids, got %#v", payload)
	}
	if len(payload.Items) != 0 {
		t.Fatalf("expected empty group after orphaned item delete, got %#v", payload.Items)
	}

	if _, err := server.app.FindRecordById("list_items", listItem.Id); err == nil {
		t.Fatalf("expected orphaned list item to be deleted")
	}
}
