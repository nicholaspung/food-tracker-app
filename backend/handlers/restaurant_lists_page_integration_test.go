package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/hooks"
)

func TestRestaurantListsPageEndpointReturnsMyScopePaginationAndCounts(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureSummaryHandlers(se, app)
		hooks.RegisterRestaurantListCountHooks(app)
	})

	user, token := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)

	user.Set("name", "Primary User")
	if err := server.app.Save(user); err != nil {
		t.Fatalf("failed to save user name: %v", err)
	}

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Saved Place",
		"location":    "San Francisco, CA",
		"cuisineType": "Cafe",
		"visibility":  "public",
	})

	savedList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Saved",
		"user":       user.Id,
		"visibility": "private",
		"isDefault":  true,
	})
	createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       savedList.Id,
		"restaurant": restaurant.Id,
		"addedBy":    user.Id,
		"position":   1,
	})

	brunchList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":        "Brunch Ideas",
		"description": "Weekend plans",
		"user":        user.Id,
		"visibility":  "friends",
	})

	createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":             "Moderated Away",
		"user":             user.Id,
		"visibility":       "private",
		"moderationStatus": "under_review",
	})

	createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Someone Else",
		"user":       otherUser.Id,
		"visibility": "private",
	})

	firstPageResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/restaurant-lists?scope=my&page=1&pageSize=1",
		token,
		"",
	)
	if firstPageResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", firstPageResponse.Code, firstPageResponse.Body.String())
	}

	var firstPagePayload struct {
		Items []struct {
			ID              string `json:"id"`
			Name            string `json:"name"`
			OwnerName       string `json:"ownerName"`
			IsDefault       bool   `json:"isDefault"`
			RestaurantCount int    `json:"restaurantCount"`
			MenuItemCount   int    `json:"menuItemCount"`
		} `json:"items"`
		Page        int  `json:"page"`
		PageSize    int  `json:"pageSize"`
		TotalItems  int  `json:"totalItems"`
		TotalPages  int  `json:"totalPages"`
		HasNextPage bool `json:"hasNextPage"`
	}
	if err := json.Unmarshal(firstPageResponse.Body.Bytes(), &firstPagePayload); err != nil {
		t.Fatalf("failed to decode first page payload: %v; body=%s", err, firstPageResponse.Body.String())
	}

	if firstPagePayload.Page != 1 || firstPagePayload.PageSize != 1 {
		t.Fatalf("unexpected paging metadata: %#v", firstPagePayload)
	}
	if firstPagePayload.TotalItems != 2 || firstPagePayload.TotalPages != 2 || !firstPagePayload.HasNextPage {
		t.Fatalf("expected 2 visible lists with another page, got %#v", firstPagePayload)
	}
	if len(firstPagePayload.Items) != 1 || firstPagePayload.Items[0].ID != savedList.Id {
		t.Fatalf("expected default list first, got %#v", firstPagePayload.Items)
	}
	if !firstPagePayload.Items[0].IsDefault {
		t.Fatalf("expected first list to be default, got %#v", firstPagePayload.Items[0])
	}
	if firstPagePayload.Items[0].OwnerName != "Primary User" {
		t.Fatalf("expected owner name to be hydrated, got %#v", firstPagePayload.Items[0])
	}
	if firstPagePayload.Items[0].RestaurantCount != 1 || firstPagePayload.Items[0].MenuItemCount != 1 {
		t.Fatalf("expected synced list counts, got %#v", firstPagePayload.Items[0])
	}

	secondPageResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/restaurant-lists?scope=my&page=2&pageSize=1",
		token,
		"",
	)
	if secondPageResponse.Code != http.StatusOK {
		t.Fatalf("expected second page 200 OK, got %d: %s", secondPageResponse.Code, secondPageResponse.Body.String())
	}

	var secondPagePayload struct {
		Items []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"items"`
		HasNextPage bool `json:"hasNextPage"`
	}
	if err := json.Unmarshal(secondPageResponse.Body.Bytes(), &secondPagePayload); err != nil {
		t.Fatalf("failed to decode second page payload: %v; body=%s", err, secondPageResponse.Body.String())
	}

	if len(secondPagePayload.Items) != 1 || secondPagePayload.Items[0].ID != brunchList.Id {
		t.Fatalf("expected brunch list on second page, got %#v", secondPagePayload.Items)
	}
	if secondPagePayload.HasNextPage {
		t.Fatalf("expected last page to have no next page, got %#v", secondPagePayload)
	}

	searchResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/restaurant-lists?scope=my&search=brunch",
		token,
		"",
	)
	if searchResponse.Code != http.StatusOK {
		t.Fatalf("expected search response 200 OK, got %d: %s", searchResponse.Code, searchResponse.Body.String())
	}

	var searchPayload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
		TotalItems int `json:"totalItems"`
	}
	if err := json.Unmarshal(searchResponse.Body.Bytes(), &searchPayload); err != nil {
		t.Fatalf("failed to decode search payload: %v; body=%s", err, searchResponse.Body.String())
	}

	if searchPayload.TotalItems != 1 || len(searchPayload.Items) != 1 || searchPayload.Items[0].ID != brunchList.Id {
		t.Fatalf("expected brunch search to return only the brunch list, got %#v", searchPayload)
	}
}

func TestRestaurantListsDefaultEndpointReturnsOnlyDefaultList(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureSummaryHandlers(se, app)
		hooks.RegisterRestaurantListCountHooks(app)
	})

	user, token := createAuthUser(t, server.app, false, false)

	defaultList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":        "Want to Try",
		"description": "Restaurants and recommendations you want to try later",
		"user":        user.Id,
		"visibility":  "private",
		"isDefault":   true,
	})
	createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Brunch Ideas",
		"user":       user.Id,
		"visibility": "friends",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/restaurant-lists/default",
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		UserID    string `json:"userId"`
		IsDefault bool   `json:"isDefault"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode default-list payload: %v; body=%s", err, response.Body.String())
	}

	if payload.ID != defaultList.Id || payload.UserID != user.Id || !payload.IsDefault {
		t.Fatalf("expected default list payload, got %#v", payload)
	}
	if payload.Name != "Want to Try" {
		t.Fatalf("expected Want to Try default list, got %#v", payload)
	}
}

func TestRestaurantListsPageEndpointSearchesFriendsScopeServerSide(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)

	viewer, viewerToken := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)
	pendingFriend, _ := createAuthUser(t, server.app, false, false)
	stranger, _ := createAuthUser(t, server.app, false, false)

	friend.Set("name", "Avery Stone")
	if err := server.app.Save(friend); err != nil {
		t.Fatalf("failed to save friend name: %v", err)
	}

	createFriendshipRecord(t, server.app, viewer.Id, friend.Id, "accepted")
	createFriendshipRecord(t, server.app, viewer.Id, pendingFriend.Id, "pending")

	friendSharedList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":        "City Favorites",
		"description": "Late night noodles",
		"user":        friend.Id,
		"visibility":  "friends",
	})
	createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Private Friend List",
		"user":       friend.Id,
		"visibility": "private",
	})
	createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Pending Friend List",
		"user":       pendingFriend.Id,
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Viewer Shared List",
		"user":       viewer.Id,
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Stranger Shared List",
		"user":       stranger.Id,
		"visibility": "friends",
	})

	allFriendsResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/restaurant-lists?scope=friends&page=1&pageSize=20",
		viewerToken,
		"",
	)
	if allFriendsResponse.Code != http.StatusOK {
		t.Fatalf("expected friends scope 200 OK, got %d: %s", allFriendsResponse.Code, allFriendsResponse.Body.String())
	}

	var allFriendsPayload struct {
		Items []struct {
			ID        string `json:"id"`
			UserID    string `json:"userId"`
			OwnerName string `json:"ownerName"`
		} `json:"items"`
		TotalItems int `json:"totalItems"`
	}
	if err := json.Unmarshal(allFriendsResponse.Body.Bytes(), &allFriendsPayload); err != nil {
		t.Fatalf("failed to decode friends payload: %v; body=%s", err, allFriendsResponse.Body.String())
	}

	if allFriendsPayload.TotalItems != 1 || len(allFriendsPayload.Items) != 1 {
		t.Fatalf("expected exactly one accepted-friend shared list, got %#v", allFriendsPayload)
	}
	if allFriendsPayload.Items[0].ID != friendSharedList.Id || allFriendsPayload.Items[0].UserID != friend.Id {
		t.Fatalf("unexpected accepted-friend list payload: %#v", allFriendsPayload.Items[0])
	}
	if allFriendsPayload.Items[0].OwnerName != "Avery Stone" {
		t.Fatalf("expected hydrated owner name, got %#v", allFriendsPayload.Items[0])
	}

	for _, search := range []string{"avery", "noodles"} {
		searchResponse := performJSONRequest(
			t,
			server.mux,
			http.MethodGet,
			fmt.Sprintf("/api/restaurant-lists?scope=friends&search=%s", search),
			viewerToken,
			"",
		)
		if searchResponse.Code != http.StatusOK {
			t.Fatalf("expected search=%s response 200 OK, got %d: %s", search, searchResponse.Code, searchResponse.Body.String())
		}

		var searchPayload struct {
			Items []struct {
				ID string `json:"id"`
			} `json:"items"`
			TotalItems int `json:"totalItems"`
		}
		if err := json.Unmarshal(searchResponse.Body.Bytes(), &searchPayload); err != nil {
			t.Fatalf("failed to decode search=%s payload: %v; body=%s", search, err, searchResponse.Body.String())
		}

		if searchPayload.TotalItems != 1 || len(searchPayload.Items) != 1 || searchPayload.Items[0].ID != friendSharedList.Id {
			t.Fatalf("expected search=%s to return the accepted friend's shared list, got %#v", search, searchPayload)
		}
	}
}
