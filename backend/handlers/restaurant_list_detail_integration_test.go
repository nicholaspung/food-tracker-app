package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/hooks"
)

func TestRestaurantListBookmarkStateEndpointMatchesRestaurantOnlyTargets(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureSummaryHandlers(se, app)
	})

	user, token := createAuthUser(t, server.app, false, false)
	savedRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Saved Restaurant",
		"location":   "San Francisco, CA",
		"visibility": "public",
	})
	unsavedRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Unsaved Restaurant",
		"location":   "Oakland, CA",
		"visibility": "public",
	})
	defaultList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"user":       user.Id,
		"visibility": "private",
		"isDefault":  true,
	})
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       defaultList.Id,
		"restaurant": savedRestaurant.Id,
		"addedBy":    user.Id,
		"position":   1,
	})

	body := fmt.Sprintf(`{"targets":[{"bookmarkKey":"restaurant:%s","restaurantId":"%s"},{"bookmarkKey":"restaurant:%s","restaurantId":"%s"}]}`,
		savedRestaurant.Id,
		savedRestaurant.Id,
		unsavedRestaurant.Id,
		unsavedRestaurant.Id,
	)
	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/restaurant-lists/"+defaultList.Id+"/bookmark-state",
		token,
		body,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected bookmark state response 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		SavedTargetsByBookmarkKey map[string]struct {
			RestaurantID string `json:"restaurantId"`
		} `json:"savedTargetsByBookmarkKey"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode bookmark state response: %v", err)
	}
	if got := payload.SavedTargetsByBookmarkKey["restaurant:"+savedRestaurant.Id].RestaurantID; got != savedRestaurant.Id {
		t.Fatalf("expected saved restaurant target %q, got %q", savedRestaurant.Id, got)
	}
	if _, exists := payload.SavedTargetsByBookmarkKey["restaurant:"+unsavedRestaurant.Id]; exists {
		t.Fatalf("unexpected unsaved restaurant target in response: %#v", payload.SavedTargetsByBookmarkKey)
	}
}

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

	paginatedViewerResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/restaurant-lists/"+sharedList.Id+"/detail?page=1&pageSize=1",
		viewerToken,
		"",
	)
	if paginatedViewerResponse.Code != http.StatusOK {
		t.Fatalf("expected paginated viewer response 200 OK, got %d: %s", paginatedViewerResponse.Code, paginatedViewerResponse.Body.String())
	}
	var paginatedViewerPayload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
		Page        int  `json:"page"`
		PageSize    int  `json:"pageSize"`
		TotalItems  int  `json:"totalItems"`
		TotalPages  int  `json:"totalPages"`
		HasNextPage bool `json:"hasNextPage"`
	}
	if err := json.Unmarshal(paginatedViewerResponse.Body.Bytes(), &paginatedViewerPayload); err != nil {
		t.Fatalf("failed to decode paginated viewer payload: %v; body=%s", err, paginatedViewerResponse.Body.String())
	}
	if len(paginatedViewerPayload.Items) != 1 || paginatedViewerPayload.Page != 1 || paginatedViewerPayload.PageSize != 1 || paginatedViewerPayload.TotalItems != 2 || paginatedViewerPayload.TotalPages != 2 || !paginatedViewerPayload.HasNextPage {
		t.Fatalf("unexpected paginated viewer payload: %#v", paginatedViewerPayload)
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

func TestRestaurantListDetailEndpointReturnsFriendRecommendationUsageProofs(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	owner, ownerToken := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)
	stranger, _ := createAuthUser(t, server.app, false, false)

	friend.Set("name", "Proof Friend")
	stranger.Set("name", "Hidden Stranger")
	if err := server.app.Save(friend); err != nil {
		t.Fatalf("failed to save friend: %v", err)
	}
	if err := server.app.Save(stranger); err != nil {
		t.Fatalf("failed to save stranger: %v", err)
	}
	createFriendshipRecord(t, server.app, owner.Id, friend.Id, "accepted")

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Proof Cafe",
		"location":   "San Francisco, CA",
		"visibility": "public",
	})
	ownerList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "My Recommendations",
		"user":       owner.Id,
		"visibility": "private",
	})
	sourceListItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       ownerList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    owner.Id,
		"position":   1,
	})
	emptyListItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       ownerList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    owner.Id,
		"position":   2,
	})
	friendList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Saved",
		"user":       friend.Id,
		"visibility": "private",
	})
	friendTargetListItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       friendList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    friend.Id,
		"position":   1,
	})
	friendVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       friend.Id,
		"visitDate":  "2026-04-08 18:30:00.000Z",
		"visibility": "friends",
	})
	friendVisitItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  friendVisit.Id,
		"user":   friend.Id,
		"name":   "Latte",
		"rating": 5,
	})
	privateMenuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"restaurant": restaurant.Id,
		"createdBy":  friend.Id,
		"name":       "Hidden Latte",
		"visibility": "private",
	})
	privateMenuVisitItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":    friendVisit.Id,
		"user":     friend.Id,
		"name":     "Hidden Latte",
		"rating":   5,
		"menuItem": privateMenuItem.Id,
	})
	privateFriendVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       friend.Id,
		"visitDate":  "2026-04-09 18:30:00.000Z",
		"visibility": "private",
	})

	createCollectionRecord(t, server.app, "recommendation_usage", map[string]any{
		"kind":                     "saved_recommendation",
		"action":                   "saved",
		"actor":                    friend.Id,
		"sourceUser":               owner.Id,
		"sourceListItem":           sourceListItem.Id,
		"sourceListItemSnapshotId": sourceListItem.Id,
		"targetRestaurant":         restaurant.Id,
		"targetRestaurantList":     friendList.Id,
		"targetListItem":           friendTargetListItem.Id,
		"actedAt":                  "2026-04-08 18:31:00.000Z",
	})
	createCollectionRecord(t, server.app, "recommendation_usage", map[string]any{
		"kind":                     "tried_recommendation",
		"action":                   "tried",
		"actor":                    friend.Id,
		"sourceUser":               owner.Id,
		"sourceListItem":           sourceListItem.Id,
		"sourceListItemSnapshotId": sourceListItem.Id,
		"targetRestaurant":         restaurant.Id,
		"targetRestaurantList":     friendList.Id,
		"targetVisit":              friendVisit.Id,
		"actedAt":                  "2026-04-08 18:32:00.000Z",
	})
	createCollectionRecord(t, server.app, "recommendation_usage", map[string]any{
		"kind":                     "rated_after_try",
		"action":                   "rated",
		"actor":                    friend.Id,
		"sourceUser":               owner.Id,
		"sourceListItem":           sourceListItem.Id,
		"sourceListItemSnapshotId": sourceListItem.Id,
		"targetRestaurant":         restaurant.Id,
		"targetRestaurantList":     friendList.Id,
		"targetVisit":              friendVisit.Id,
		"targetVisitItem":          friendVisitItem.Id,
		"actedAt":                  "2026-04-08 18:33:00.000Z",
	})
	createCollectionRecord(t, server.app, "recommendation_usage", map[string]any{
		"kind":                     "saved_recommendation",
		"action":                   "saved",
		"actor":                    stranger.Id,
		"sourceUser":               owner.Id,
		"sourceListItem":           sourceListItem.Id,
		"sourceListItemSnapshotId": sourceListItem.Id,
		"targetRestaurant":         restaurant.Id,
		"targetRestaurantList":     friendList.Id,
		"actedAt":                  "2026-04-08 18:34:00.000Z",
	})
	createCollectionRecord(t, server.app, "recommendation_usage", map[string]any{
		"kind":                     "tried_recommendation",
		"action":                   "tried",
		"actor":                    friend.Id,
		"sourceUser":               owner.Id,
		"sourceListItem":           sourceListItem.Id,
		"sourceListItemSnapshotId": sourceListItem.Id,
		"targetRestaurant":         restaurant.Id,
		"targetRestaurantList":     friendList.Id,
		"targetVisit":              privateFriendVisit.Id,
		"actedAt":                  "2026-04-08 18:35:00.000Z",
	})
	createCollectionRecord(t, server.app, "recommendation_usage", map[string]any{
		"kind":                     "rated_after_try",
		"action":                   "rated",
		"actor":                    friend.Id,
		"sourceUser":               owner.Id,
		"sourceListItem":           sourceListItem.Id,
		"sourceListItemSnapshotId": sourceListItem.Id,
		"targetRestaurant":         restaurant.Id,
		"targetRestaurantList":     friendList.Id,
		"targetVisit":              friendVisit.Id,
		"targetVisitItem":          privateMenuVisitItem.Id,
		"actedAt":                  "2026-04-08 18:36:00.000Z",
	})

	response := performJSONRequest(t, server.mux, http.MethodGet, "/api/restaurant-lists/"+ownerList.Id+"/detail", ownerToken, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected owner response 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		Items []struct {
			ID                        string `json:"id"`
			RecommendationUsageProofs []struct {
				ActorID   string `json:"actorId"`
				ActorName string `json:"actorName"`
				Kind      string `json:"kind"`
				Action    string `json:"action"`
			} `json:"recommendationUsageProofs"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse response JSON: %v; body=%s", err, response.Body.String())
	}

	proofsByListItemID := map[string][]struct {
		ActorID   string `json:"actorId"`
		ActorName string `json:"actorName"`
		Kind      string `json:"kind"`
		Action    string `json:"action"`
	}{}
	for _, item := range payload.Items {
		proofsByListItemID[item.ID] = item.RecommendationUsageProofs
	}

	proofs := proofsByListItemID[sourceListItem.Id]
	if len(proofs) != 3 {
		t.Fatalf("expected accepted friend saved/tried/rated proofs only, got %#v", proofs)
	}
	kinds := map[string]string{}
	for _, proof := range proofs {
		if proof.ActorID != friend.Id || proof.ActorName != "Proof Friend" {
			t.Fatalf("expected named accepted friend proof, got %#v", proof)
		}
		kinds[proof.Kind] = proof.Action
	}
	if kinds["saved_recommendation"] != "saved" || kinds["tried_recommendation"] != "tried" || kinds["rated_after_try"] != "rated" {
		t.Fatalf("expected saved/tried/rated proof kinds, got %#v", kinds)
	}
	if len(proofsByListItemID[emptyListItem.Id]) != 0 {
		t.Fatalf("expected empty proof state on unrelated list item, got %#v", proofsByListItemID[emptyListItem.Id])
	}
}

func TestRestaurantListDetailEndpointReturnsAnonymousCreatorGuideUsageProof(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	owner, ownerToken := createAuthUser(t, server.app, false, false)
	friend, friendToken := createAuthUser(t, server.app, false, false)
	stranger, strangerToken := createAuthUser(t, server.app, false, false)

	friend.Set("name", "Named Friend")
	stranger.Set("name", "Private Reader")
	if err := server.app.Save(friend); err != nil {
		t.Fatalf("failed to save friend: %v", err)
	}
	if err := server.app.Save(stranger); err != nil {
		t.Fatalf("failed to save stranger: %v", err)
	}
	createFriendshipRecord(t, server.app, owner.Id, friend.Id, "accepted")

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Guide Cafe",
		"location":   "San Francisco, CA",
		"visibility": "public",
	})
	secondRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Guide Diner",
		"location":   "Oakland, CA",
		"visibility": "public",
	})
	guideList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":         "Creator Picks",
		"user":         owner.Id,
		"visibility":   "friends",
		"shareEnabled": true,
	})
	sourceListItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       guideList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    owner.Id,
		"position":   1,
	})
	secondSourceListItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       guideList.Id,
		"restaurant": secondRestaurant.Id,
		"addedBy":    owner.Id,
		"position":   2,
	})
	friendList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Friend Saved",
		"user":       friend.Id,
		"visibility": "private",
	})
	friendTargetListItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       friendList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    friend.Id,
		"position":   1,
	})
	strangerList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Reader Saved",
		"user":       stranger.Id,
		"visibility": "private",
	})
	strangerTargetListItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       strangerList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    stranger.Id,
		"position":   1,
	})
	secondStrangerTargetListItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       strangerList.Id,
		"restaurant": secondRestaurant.Id,
		"addedBy":    stranger.Id,
		"position":   2,
	})
	strangerVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       stranger.Id,
		"visitDate":  "2026-04-10 18:30:00.000Z",
		"visibility": "private",
	})
	secondStrangerVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": secondRestaurant.Id,
		"user":       stranger.Id,
		"visitDate":  "2026-04-11 18:30:00.000Z",
		"visibility": "private",
	})
	strangerVisitItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  secondStrangerVisit.Id,
		"user":   stranger.Id,
		"name":   "Guide Latte",
		"rating": 5,
	})

	createCollectionRecord(t, server.app, "recommendation_usage", map[string]any{
		"kind":                     "saved_recommendation",
		"action":                   "saved",
		"actor":                    friend.Id,
		"sourceUser":               owner.Id,
		"sourceRestaurantList":     guideList.Id,
		"sourceListItem":           sourceListItem.Id,
		"sourceListItemSnapshotId": sourceListItem.Id,
		"targetRestaurant":         restaurant.Id,
		"targetRestaurantList":     friendList.Id,
		"targetListItem":           friendTargetListItem.Id,
		"targetListItemSnapshotId": friendTargetListItem.Id,
		"actedAt":                  "2026-04-10 18:31:00.000Z",
	})
	createCollectionRecord(t, server.app, "recommendation_usage", map[string]any{
		"kind":                     "saved_recommendation",
		"action":                   "saved",
		"actor":                    stranger.Id,
		"sourceUser":               owner.Id,
		"sourceRestaurantList":     guideList.Id,
		"sourceListItem":           sourceListItem.Id,
		"sourceListItemSnapshotId": sourceListItem.Id,
		"targetRestaurant":         restaurant.Id,
		"targetRestaurantList":     strangerList.Id,
		"targetListItem":           strangerTargetListItem.Id,
		"targetListItemSnapshotId": strangerTargetListItem.Id,
		"actedAt":                  "2026-04-10 18:32:00.000Z",
	})
	createCollectionRecord(t, server.app, "recommendation_usage", map[string]any{
		"kind":                     "saved_recommendation",
		"action":                   "saved",
		"actor":                    stranger.Id,
		"sourceUser":               owner.Id,
		"sourceRestaurantList":     guideList.Id,
		"sourceListItem":           secondSourceListItem.Id,
		"sourceListItemSnapshotId": secondSourceListItem.Id,
		"targetRestaurant":         secondRestaurant.Id,
		"targetRestaurantList":     strangerList.Id,
		"targetListItem":           secondStrangerTargetListItem.Id,
		"targetListItemSnapshotId": secondStrangerTargetListItem.Id,
		"actedAt":                  "2026-04-10 18:32:30.000Z",
	})
	createCollectionRecord(t, server.app, "recommendation_usage", map[string]any{
		"kind":                     "tried_recommendation",
		"action":                   "tried",
		"actor":                    stranger.Id,
		"sourceUser":               owner.Id,
		"sourceRestaurantList":     strangerList.Id,
		"sourceListItem":           strangerTargetListItem.Id,
		"sourceListItemSnapshotId": strangerTargetListItem.Id,
		"targetRestaurant":         restaurant.Id,
		"targetRestaurantList":     strangerList.Id,
		"targetVisit":              strangerVisit.Id,
		"actedAt":                  "2026-04-10 18:33:00.000Z",
	})
	createCollectionRecord(t, server.app, "recommendation_usage", map[string]any{
		"kind":                     "rated_after_try",
		"action":                   "rated",
		"actor":                    stranger.Id,
		"sourceUser":               owner.Id,
		"sourceRestaurantList":     strangerList.Id,
		"sourceListItem":           secondStrangerTargetListItem.Id,
		"sourceListItemSnapshotId": secondStrangerTargetListItem.Id,
		"targetRestaurant":         secondRestaurant.Id,
		"targetRestaurantList":     strangerList.Id,
		"targetVisit":              secondStrangerVisit.Id,
		"targetVisitItem":          strangerVisitItem.Id,
		"actedAt":                  "2026-04-10 18:34:00.000Z",
	})
	createCollectionRecord(t, server.app, "recommendation_usage", map[string]any{
		"kind":                     "saved_recommendation",
		"action":                   "saved",
		"actor":                    owner.Id,
		"sourceUser":               owner.Id,
		"sourceRestaurantList":     guideList.Id,
		"sourceListItem":           sourceListItem.Id,
		"sourceListItemSnapshotId": sourceListItem.Id,
		"targetRestaurant":         restaurant.Id,
		"targetRestaurantList":     guideList.Id,
		"actedAt":                  "2026-04-10 18:35:00.000Z",
	})
	createCollectionRecord(t, server.app, "recommendation_usage", map[string]any{
		"kind":                     "saved_recommendation",
		"action":                   "removed",
		"actor":                    stranger.Id,
		"sourceUser":               owner.Id,
		"sourceRestaurantList":     guideList.Id,
		"sourceListItem":           sourceListItem.Id,
		"sourceListItemSnapshotId": sourceListItem.Id,
		"targetRestaurant":         restaurant.Id,
		"targetRestaurantList":     strangerList.Id,
		"actedAt":                  "2026-04-10 18:36:00.000Z",
	})

	response := performJSONRequest(t, server.mux, http.MethodGet, "/api/restaurant-lists/"+guideList.Id+"/detail", ownerToken, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected owner response 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		CreatorGuideUsageProof map[string]any `json:"creatorGuideUsageProof"`
		Items                  []struct {
			ID                        string `json:"id"`
			RecommendationUsageProofs []struct {
				ActorName string `json:"actorName"`
				Kind      string `json:"kind"`
			} `json:"recommendationUsageProofs"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse response JSON: %v; body=%s", err, response.Body.String())
	}

	if payload.CreatorGuideUsageProof["actorId"] != nil || payload.CreatorGuideUsageProof["actorName"] != nil {
		t.Fatalf("expected anonymous aggregate proof, got %#v", payload.CreatorGuideUsageProof)
	}
	if payload.CreatorGuideUsageProof["savedCount"] != float64(3) ||
		payload.CreatorGuideUsageProof["triedCount"] != float64(1) ||
		payload.CreatorGuideUsageProof["ratedAfterTryCount"] != float64(1) ||
		payload.CreatorGuideUsageProof["sourceRecommendationCount"] != float64(2) ||
		payload.CreatorGuideUsageProof["totalRecommendationUsageCount"] != float64(5) {
		t.Fatalf("unexpected creator guide aggregate proof: %#v", payload.CreatorGuideUsageProof)
	}

	proofsByListItemID := map[string][]struct {
		ActorName string `json:"actorName"`
		Kind      string `json:"kind"`
	}{}
	for _, item := range payload.Items {
		proofsByListItemID[item.ID] = item.RecommendationUsageProofs
	}
	namedProofs := proofsByListItemID[sourceListItem.Id]
	if len(namedProofs) != 1 || namedProofs[0].ActorName != "Named Friend" || namedProofs[0].Kind != "saved_recommendation" {
		t.Fatalf("expected friend named proof to remain separate from aggregate proof, got %#v", namedProofs)
	}

	friendResponse := performJSONRequest(t, server.mux, http.MethodGet, "/api/restaurant-lists/"+guideList.Id+"/detail", friendToken, "")
	if friendResponse.Code != http.StatusOK {
		t.Fatalf("expected accepted friend detail response 200 OK, got %d: %s", friendResponse.Code, friendResponse.Body.String())
	}
	if strings.Contains(friendResponse.Body.String(), "creatorGuideUsageProof") {
		t.Fatalf("expected aggregate proof hidden from non-owner response, got %s", friendResponse.Body.String())
	}

	strangerResponse := performJSONRequest(t, server.mux, http.MethodGet, "/api/restaurant-lists/"+guideList.Id+"/detail", strangerToken, "")
	if strangerResponse.Code != http.StatusNotFound {
		t.Fatalf("expected inaccessible non-friend detail response 404, got %d: %s", strangerResponse.Code, strangerResponse.Body.String())
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
	menuItemFriend, _ := createAuthUser(t, server.app, false, false)
	pendingFriend, _ := createAuthUser(t, server.app, false, false)
	stranger, _ := createAuthUser(t, server.app, false, false)

	createFriendshipRecord(t, server.app, user.Id, friend.Id, "accepted")
	createFriendshipRecord(t, server.app, user.Id, secondFriend.Id, "accepted")
	createFriendshipRecord(t, server.app, user.Id, menuItemFriend.Id, "accepted")
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

	menuItemFriendDefaultList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"user":       menuItemFriend.Id,
		"visibility": "friends",
		"isDefault":  true,
	})
	menuItemFriendVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       menuItemFriend.Id,
		"visitDate":  "2026-04-04 18:30:00.000Z",
		"visibility": "friends",
	})
	menuItemFriendFoodItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  menuItemFriendVisit.Id,
		"user":   menuItemFriend.Id,
		"name":   "Burger",
		"rating": 5,
	})
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       menuItemFriendDefaultList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    menuItemFriend.Id,
		"foodItem":   menuItemFriendFoodItem.Id,
		"position":   1,
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
			FriendMatches      []struct {
				FriendID   string  `json:"friendId"`
				FriendName string  `json:"friendName"`
				Kind       string  `json:"kind"`
				ItemName   string  `json:"itemName"`
				Rating     float64 `json:"rating"`
			} `json:"friendMatches"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode payload: %v; body=%s", err, response.Body.String())
	}

	if len(payload.Items) != 1 || payload.Items[0].ID != userListItem.Id {
		t.Fatalf("expected one restaurant bookmark with one eligible friend overlap, got %#v", payload.Items)
	}
	if payload.Items[0].FriendOverlapCount != 3 {
		t.Fatalf("expected accepted-friend restaurant and menu-item bookmarks to count, got %#v", payload.Items[0])
	}
	if len(payload.Items[0].FriendMatches) != 4 {
		t.Fatalf("expected restaurant and menu-item friend match details, got %#v", payload.Items[0].FriendMatches)
	}

	hasMenuItemMatch := false
	hasPrivateDefaultListMatch := false
	for _, match := range payload.Items[0].FriendMatches {
		if match.FriendID == menuItemFriend.Id && match.Kind == "menu_item" && match.ItemName == "Burger" && match.Rating == 5 {
			hasMenuItemMatch = true
		}
		if match.FriendID == secondFriend.Id && match.Kind == "restaurant" {
			hasPrivateDefaultListMatch = true
		}
	}
	if !hasMenuItemMatch {
		t.Fatalf("expected menu item friend match detail, got %#v", payload.Items[0].FriendMatches)
	}
	if !hasPrivateDefaultListMatch {
		t.Fatalf("expected private default-list accepted-friend match detail, got %#v", payload.Items[0].FriendMatches)
	}
}

func TestRestaurantListDetailEndpointAuthorizesWantToTryFriendMatchDetails(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureSummaryHandlers(se, app)
		hooks.RegisterRestaurantListCountHooks(app)
	})

	viewer, viewerToken := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)
	hiddenListFriend, _ := createAuthUser(t, server.app, false, false)
	pendingFriend, _ := createAuthUser(t, server.app, false, false)
	stranger, _ := createAuthUser(t, server.app, false, false)
	friend.Set("name", "Overlap Friend")
	if err := server.app.Save(friend); err != nil {
		t.Fatalf("failed to name overlap friend: %v", err)
	}
	createFriendshipRecord(t, server.app, viewer.Id, friend.Id, "accepted")
	createFriendshipRecord(t, server.app, viewer.Id, hiddenListFriend.Id, "accepted")
	createFriendshipRecord(t, server.app, viewer.Id, pendingFriend.Id, "pending")

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Policy Overlap Cafe",
		"location":   "San Francisco, CA",
		"visibility": "public",
	})
	viewerList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"user":       viewer.Id,
		"visibility": "private",
		"isDefault":  true,
	})
	viewerListItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       viewerList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    viewer.Id,
		"position":   1,
	})

	friendList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"user":       friend.Id,
		"visibility": "private",
		"isDefault":  true,
	})
	createFriendListItem := func(position int, relations map[string]any) *core.Record {
		data := map[string]any{
			"list":       friendList.Id,
			"restaurant": restaurant.Id,
			"addedBy":    friend.Id,
			"position":   position,
		}
		for key, value := range relations {
			data[key] = value
		}
		return createCollectionRecord(t, server.app, "list_items", data)
	}

	visibleVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       friend.Id,
		"visitDate":  "2026-07-01 18:30:00.000Z",
		"visibility": "friends",
	})
	privateVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       friend.Id,
		"visitDate":  "2026-07-02 18:30:00.000Z",
		"visibility": "private",
	})
	visiblePrimaryItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  visibleVisit.Id,
		"user":   friend.Id,
		"name":   "Visible Primary Item",
		"rating": 4,
	})
	privateVisitItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  privateVisit.Id,
		"user":   friend.Id,
		"name":   "Private Visit Secret",
		"rating": 5,
	})
	hiddenFoodItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":            visibleVisit.Id,
		"user":             friend.Id,
		"name":             "Hidden Food Secret",
		"rating":           5,
		"moderationStatus": "hidden",
	})
	visibleUserFoodItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  visibleVisit.Id,
		"user":   friend.Id,
		"name":   "Visible User Item",
		"rating": 3,
	})
	privateUserFoodItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  privateVisit.Id,
		"user":   friend.Id,
		"name":   "Private User Item Secret",
		"rating": 2,
	})
	visibleRecommendedItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  visibleVisit.Id,
		"user":   friend.Id,
		"name":   "Visible Recommended Item",
		"rating": 4,
	})
	privateRecommendedItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  privateVisit.Id,
		"user":   friend.Id,
		"name":   "Private Recommended Secret",
		"rating": 5,
	})
	hiddenListItemFoodItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  visibleVisit.Id,
		"user":   friend.Id,
		"name":   "Hidden List Item Detail",
		"rating": 4,
	})
	visibleMenuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"restaurant": restaurant.Id,
		"createdBy":  friend.Id,
		"name":       "Visible Menu Item",
		"visibility": "friends",
	})
	privateMenuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"restaurant": restaurant.Id,
		"createdBy":  friend.Id,
		"name":       "Private Menu Secret",
		"visibility": "private",
	})

	createFriendListItem(1, nil)
	createFriendListItem(2, map[string]any{"foodItem": visiblePrimaryItem.Id})
	createFriendListItem(3, map[string]any{"foodItem": privateVisitItem.Id})
	createFriendListItem(4, map[string]any{"foodItem": hiddenFoodItem.Id})
	createFriendListItem(5, map[string]any{"userFoodItem": visibleUserFoodItem.Id})
	createFriendListItem(6, map[string]any{"userFoodItem": privateUserFoodItem.Id})
	createFriendListItem(7, map[string]any{"menuItem": visibleMenuItem.Id})
	createFriendListItem(8, map[string]any{"menuItem": privateMenuItem.Id})
	createFriendListItem(9, map[string]any{"recommendedItems": []string{visibleRecommendedItem.Id}})
	createFriendListItem(10, map[string]any{"recommendedItems": []string{privateRecommendedItem.Id}})
	createFriendListItem(11, map[string]any{
		"foodItem":         hiddenListItemFoodItem.Id,
		"moderationStatus": "hidden",
	})

	hiddenFriendList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":             "Want to Try",
		"user":             hiddenListFriend.Id,
		"visibility":       "friends",
		"isDefault":        true,
		"moderationStatus": "hidden",
	})
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       hiddenFriendList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    hiddenListFriend.Id,
		"foodItem":   visiblePrimaryItem.Id,
		"position":   1,
	})
	for _, user := range []*core.Record{pendingFriend, stranger} {
		list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
			"name":       "Want to Try",
			"user":       user.Id,
			"visibility": "friends",
			"isDefault":  true,
		})
		createCollectionRecord(t, server.app, "list_items", map[string]any{
			"list":       list.Id,
			"restaurant": restaurant.Id,
			"addedBy":    user.Id,
			"foodItem":   visiblePrimaryItem.Id,
			"position":   1,
		})
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/restaurant-lists/"+viewerList.Id+"/detail",
		viewerToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected response 200 OK, got %d: %s", response.Code, response.Body.String())
	}
	for _, secret := range []string{
		"Private Visit Secret",
		"Hidden Food Secret",
		"Private User Item Secret",
		"Private Menu Secret",
		"Private Recommended Secret",
	} {
		if strings.Contains(response.Body.String(), secret) {
			t.Fatalf("expected inaccessible nested detail %q to be absent: %s", secret, response.Body.String())
		}
	}

	var payload struct {
		Items []struct {
			ID                 string           `json:"id"`
			FriendOverlapCount int              `json:"friendOverlapCount"`
			FriendMatches      []map[string]any `json:"friendMatches"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode payload: %v; body=%s", err, response.Body.String())
	}
	if len(payload.Items) != 1 || payload.Items[0].ID != viewerListItem.Id {
		t.Fatalf("expected the viewer's restaurant bookmark, got %#v", payload.Items)
	}
	if payload.Items[0].FriendOverlapCount != 1 {
		t.Fatalf("expected only the accepted friend to count, got %#v", payload.Items[0])
	}
	if len(payload.Items[0].FriendMatches) != 5 {
		t.Fatalf("expected hidden list/list-item and non-friends excluded, got %#v", payload.Items[0].FriendMatches)
	}

	coarseMatches := 0
	visibleDetails := map[string]bool{}
	for _, match := range payload.Items[0].FriendMatches {
		if match["friendId"] != friend.Id || match["friendName"] != "Overlap Friend" {
			t.Fatalf("expected only the accepted friend's identity, got %#v", match)
		}
		kind, _ := match["kind"].(string)
		if kind == "restaurant" {
			coarseMatches++
			if len(match) != 3 || match["itemName"] != nil || match["rating"] != nil || match["savedAt"] != nil {
				t.Fatalf("expected coarse Restaurant match without nested detail or precise time, got %#v", match)
			}
			continue
		}

		itemName, _ := match["itemName"].(string)
		if savedAt, _ := match["savedAt"].(string); savedAt == "" {
			t.Fatalf("expected authorized nested detail to retain save time, got %#v", match)
		}
		switch itemName {
		case "Visible Primary Item":
			visibleDetails[itemName] = match["rating"] == float64(4)
		case "Visible User Item":
			visibleDetails[itemName] = match["rating"] == float64(3)
		case "Visible Menu Item", "recommended items":
			visibleDetails[itemName] = true
		default:
			t.Fatalf("unexpected nested detail in friend match: %#v", match)
		}
	}
	if coarseMatches != 1 {
		t.Fatalf("expected inaccessible nested rows to collapse into one coarse Restaurant match, got %d", coarseMatches)
	}
	for _, itemName := range []string{"Visible Primary Item", "Visible User Item", "Visible Menu Item", "recommended items"} {
		if !visibleDetails[itemName] {
			t.Fatalf("expected authorized nested detail %q, got %#v", itemName, payload.Items[0].FriendMatches)
		}
	}
}

func TestRestaurantListCandidateRestaurantsEndpointSplitsSummaryFromPaginatedItems(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)

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
	otherUserVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantIDOrFail(annotatedRestaurant),
		"user":       otherUser.Id,
		"visitDate":  "2026-04-03 18:30:00.000Z",
		"visibility": "private",
	})
	otherUserItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  otherUserVisit.Id,
		"user":   otherUser.Id,
		"name":   "Friend's Nigiri",
		"rating": 5,
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  otherVisit.Id,
		"user":   user.Id,
		"name":   "Fries",
		"rating": 4,
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
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": annotatedRestaurant.Id,
		"addedBy":    user.Id,
		"position":   2,
		"foodItem":   otherUserItem.Id,
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
		AlreadyAdded bool   `json:"alreadyAdded"`
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
			ID              string          `json:"id"`
			Name            string          `json:"name"`
			Visibility      string          `json:"visibility"`
			ItemCount       int             `json:"itemCount"`
			LatestVisitDate string          `json:"latestVisitDate"`
			AlreadyInList   bool            `json:"alreadyInList"`
			ExistingNote    string          `json:"existingNote"`
			LinkedItemCount int             `json:"linkedItemCount"`
			VisitDates      json.RawMessage `json:"visitDates"`
			FoodItems       json.RawMessage `json:"foodItems"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse response JSON: %v; body=%s", err, response.Body.String())
	}

	if payload.List.ID != list.Id {
		t.Fatalf("expected target list metadata, got %#v", payload.List)
	}
	if len(payload.Items) != 2 {
		t.Fatalf("expected candidate restaurant summaries, got %d: %#v", len(payload.Items), payload.Items)
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
	if item.ItemCount != 3 || item.LinkedItemCount != 3 {
		t.Fatalf("expected summary counts for 3 rated items, got %#v", item)
	}
	if item.LatestVisitDate != "2026-04-05 18:30:00.000Z" {
		t.Fatalf("expected latest visit date summary, got %#v", item.LatestVisitDate)
	}
	if item.FoodItems != nil || item.VisitDates != nil {
		t.Fatalf("expected candidate response to omit full history arrays, got %#v", item)
	}

	legacyResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		fmt.Sprintf("/api/restaurant-lists/%s/visited-restaurants", list.Id),
		token,
		"",
	)
	if legacyResponse.Code != http.StatusOK {
		t.Fatalf("expected legacy visited restaurants 200 OK, got %d: %s", legacyResponse.Code, legacyResponse.Body.String())
	}
	var legacyPayload struct {
		Items []struct {
			ID                string          `json:"id"`
			VisitDates        json.RawMessage `json:"visitDates"`
			FoodItems         json.RawMessage `json:"foodItems"`
			LinkedFoodItemIDs json.RawMessage `json:"linkedFoodItemIds"`
		} `json:"items"`
	}
	if err := json.Unmarshal(legacyResponse.Body.Bytes(), &legacyPayload); err != nil {
		t.Fatalf("failed to parse legacy response JSON: %v; body=%s", err, legacyResponse.Body.String())
	}
	var emptyLegacyItem *struct {
		ID                string          `json:"id"`
		VisitDates        json.RawMessage `json:"visitDates"`
		FoodItems         json.RawMessage `json:"foodItems"`
		LinkedFoodItemIDs json.RawMessage `json:"linkedFoodItemIds"`
	}
	for index := range legacyPayload.Items {
		if legacyPayload.Items[index].ID == otherRestaurant.Id {
			emptyLegacyItem = &legacyPayload.Items[index]
			break
		}
	}
	if emptyLegacyItem == nil {
		t.Fatalf("expected legacy payload for restaurant %s, got %#v", otherRestaurant.Id, legacyPayload.Items)
	}
	if string(emptyLegacyItem.LinkedFoodItemIDs) != "[]" {
		t.Fatalf("expected legacy empty linkedFoodItemIds array to be preserved, got %#v", emptyLegacyItem)
	}
	if emptyLegacyItem.VisitDates == nil || emptyLegacyItem.FoodItems == nil {
		t.Fatalf("expected legacy history array fields to remain present, got %#v", emptyLegacyItem)
	}

	firstItemsResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		fmt.Sprintf(
			"/api/restaurant-lists/%s/candidate-restaurants/%s/items?page=1&pageSize=2",
			list.Id,
			annotatedRestaurant.Id,
		),
		token,
		"",
	)
	if firstItemsResponse.Code != http.StatusOK {
		t.Fatalf("expected first item page 200 OK, got %d: %s", firstItemsResponse.Code, firstItemsResponse.Body.String())
	}

	var firstItemsPayload struct {
		Items       []candidateFoodItemPayload `json:"items"`
		Page        int                        `json:"page"`
		PageSize    int                        `json:"pageSize"`
		TotalItems  int                        `json:"totalItems"`
		TotalPages  int                        `json:"totalPages"`
		HasNextPage bool                       `json:"hasNextPage"`
	}
	if err := json.Unmarshal(firstItemsResponse.Body.Bytes(), &firstItemsPayload); err != nil {
		t.Fatalf("failed to parse first item page: %v; body=%s", err, firstItemsResponse.Body.String())
	}
	if len(firstItemsPayload.Items) != 2 || firstItemsPayload.Page != 1 || firstItemsPayload.PageSize != 2 || firstItemsPayload.TotalItems != 3 || firstItemsPayload.TotalPages != 2 || !firstItemsPayload.HasNextPage {
		t.Fatalf("expected bounded first item page, got %#v", firstItemsPayload)
	}

	secondItemsResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		fmt.Sprintf(
			"/api/restaurant-lists/%s/candidate-restaurants/%s/items?page=2&pageSize=2",
			list.Id,
			annotatedRestaurant.Id,
		),
		token,
		"",
	)
	if secondItemsResponse.Code != http.StatusOK {
		t.Fatalf("expected second item page 200 OK, got %d: %s", secondItemsResponse.Code, secondItemsResponse.Body.String())
	}
	var secondItemsPayload struct {
		Items       []candidateFoodItemPayload `json:"items"`
		Page        int                        `json:"page"`
		HasNextPage bool                       `json:"hasNextPage"`
	}
	if err := json.Unmarshal(secondItemsResponse.Body.Bytes(), &secondItemsPayload); err != nil {
		t.Fatalf("failed to parse second item page: %v; body=%s", err, secondItemsResponse.Body.String())
	}
	if len(secondItemsPayload.Items) != 1 || secondItemsPayload.Page != 2 || secondItemsPayload.HasNextPage {
		t.Fatalf("expected final bounded item page, got %#v", secondItemsPayload)
	}

	allFoodItems := append(firstItemsPayload.Items, secondItemsPayload.Items...)
	foodItemIDs := make([]string, 0, len(allFoodItems))
	for _, foodItem := range allFoodItems {
		foodItemIDs = append(foodItemIDs, foodItem.ID)
		if !foodItem.AlreadyAdded {
			t.Fatalf("expected linked item %s to be marked already added", foodItem.ID)
		}
	}
	if !containsVisitedRestaurantString(foodItemIDs, recommendedItem.Id) ||
		!containsVisitedRestaurantString(foodItemIDs, sourceItem.Id) ||
		!containsVisitedRestaurantString(foodItemIDs, userLinkedItem.Id) {
		t.Fatalf("expected all restaurant food items across pages, got %#v", allFoodItems)
	}

	var sourceItemPayload *candidateFoodItemPayload
	var recommendedItemPayload *candidateFoodItemPayload
	for index := range allFoodItems {
		switch allFoodItems[index].ID {
		case sourceItem.Id:
			sourceItemPayload = &allFoodItems[index]
		case recommendedItem.Id:
			recommendedItemPayload = &allFoodItems[index]
		}
	}
	if sourceItemPayload == nil {
		t.Fatalf("expected source item payload for %s, got %#v", sourceItem.Id, allFoodItems)
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
		t.Fatalf("expected recommended item payload for %s, got %#v", recommendedItem.Id, allFoodItems)
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

func TestRestaurantListCandidateRestaurantsEndpointPaginatesAndClampsPageSize(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)

	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Saved",
		"visibility": "private",
		"user":       user.Id,
	})
	newerRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Newer Match",
		"location":   "San Jose, CA",
		"visibility": "public",
	})
	olderRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Older Match",
		"location":   "Oakland, CA",
		"visibility": "public",
	})
	otherRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Other Place",
		"location":   "Berkeley, CA",
		"visibility": "public",
	})

	newerVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": newerRestaurant.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-08 18:30:00.000Z",
		"visibility": "private",
	})
	olderVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": olderRestaurant.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-06 18:30:00.000Z",
		"visibility": "private",
	})
	otherVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": otherRestaurant.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-04 18:30:00.000Z",
		"visibility": "private",
	})

	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  newerVisit.Id,
		"user":   user.Id,
		"name":   "Shoyu Ramen",
		"notes":  "special broth",
		"rating": 5,
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  olderVisit.Id,
		"user":   user.Id,
		"name":   "Tonkotsu",
		"notes":  "special broth",
		"rating": 4,
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  otherVisit.Id,
		"user":   user.Id,
		"name":   "Burger",
		"rating": 3,
	})

	firstPageResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		fmt.Sprintf("/api/restaurant-lists/%s/candidate-restaurants?search=special&page=1&pageSize=1", list.Id),
		token,
		"",
	)
	if firstPageResponse.Code != http.StatusOK {
		t.Fatalf("expected first page 200 OK, got %d: %s", firstPageResponse.Code, firstPageResponse.Body.String())
	}

	var firstPagePayload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
		Page        int  `json:"page"`
		PageSize    int  `json:"pageSize"`
		TotalItems  int  `json:"totalItems"`
		TotalPages  int  `json:"totalPages"`
		HasNextPage bool `json:"hasNextPage"`
	}
	if err := json.Unmarshal(firstPageResponse.Body.Bytes(), &firstPagePayload); err != nil {
		t.Fatalf("failed to parse first page response JSON: %v; body=%s", err, firstPageResponse.Body.String())
	}
	if firstPagePayload.Page != 1 || firstPagePayload.PageSize != 1 || firstPagePayload.TotalItems != 2 || firstPagePayload.TotalPages != 2 || !firstPagePayload.HasNextPage {
		t.Fatalf("expected first page metadata, got %#v", firstPagePayload)
	}
	if len(firstPagePayload.Items) != 1 || firstPagePayload.Items[0].ID != newerRestaurant.Id {
		t.Fatalf("expected newer matching restaurant on first page, got %#v", firstPagePayload.Items)
	}

	secondPageResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		fmt.Sprintf("/api/restaurant-lists/%s/candidate-restaurants?search=special&page=2&pageSize=1", list.Id),
		token,
		"",
	)
	if secondPageResponse.Code != http.StatusOK {
		t.Fatalf("expected second page 200 OK, got %d: %s", secondPageResponse.Code, secondPageResponse.Body.String())
	}

	var secondPagePayload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
		Page        int  `json:"page"`
		PageSize    int  `json:"pageSize"`
		TotalItems  int  `json:"totalItems"`
		TotalPages  int  `json:"totalPages"`
		HasNextPage bool `json:"hasNextPage"`
	}
	if err := json.Unmarshal(secondPageResponse.Body.Bytes(), &secondPagePayload); err != nil {
		t.Fatalf("failed to parse second page response JSON: %v; body=%s", err, secondPageResponse.Body.String())
	}
	if secondPagePayload.Page != 2 || secondPagePayload.PageSize != 1 || secondPagePayload.TotalItems != 2 || secondPagePayload.TotalPages != 2 || secondPagePayload.HasNextPage {
		t.Fatalf("expected second page metadata, got %#v", secondPagePayload)
	}
	if len(secondPagePayload.Items) != 1 || secondPagePayload.Items[0].ID != olderRestaurant.Id {
		t.Fatalf("expected older matching restaurant on second page, got %#v", secondPagePayload.Items)
	}

	clampedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		fmt.Sprintf("/api/restaurant-lists/%s/candidate-restaurants?pageSize=999", list.Id),
		token,
		"",
	)
	if clampedResponse.Code != http.StatusOK {
		t.Fatalf("expected clamped page 200 OK, got %d: %s", clampedResponse.Code, clampedResponse.Body.String())
	}

	var clampedPayload struct {
		PageSize int `json:"pageSize"`
	}
	if err := json.Unmarshal(clampedResponse.Body.Bytes(), &clampedPayload); err != nil {
		t.Fatalf("failed to parse clamped response JSON: %v; body=%s", err, clampedResponse.Body.String())
	}
	if clampedPayload.PageSize != 50 {
		t.Fatalf("expected pageSize to clamp to 50, got %#v", clampedPayload)
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
