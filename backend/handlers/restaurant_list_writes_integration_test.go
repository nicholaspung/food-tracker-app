package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"myapp/handlers"
)

type restaurantListMutationGroupPayload struct {
	ListID       string `json:"listId"`
	RestaurantID string `json:"restaurantId"`
	Items        []struct {
		ID              string `json:"id"`
		RestaurantID    string `json:"restaurantId"`
		Note            string `json:"note"`
		BookmarkedItems []struct {
			ID             string `json:"id"`
			UserFoodItemID string `json:"userFoodItemId"`
		} `json:"bookmarkedItems"`
	} `json:"items"`
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
