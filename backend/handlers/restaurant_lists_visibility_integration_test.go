package handlers_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestRestaurantListsRejectPublicVisibility(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {})

	owner, ownerToken := createAuthUser(t, server.app, false, false)

	collection, err := server.app.FindCollectionByNameOrId("restaurant_lists")
	if err != nil {
		t.Fatalf("failed to resolve restaurant_lists collection: %v", err)
	}

	visibilityField, ok := collection.Fields.GetByName("visibility").(*core.SelectField)
	if !ok {
		t.Fatalf("expected restaurant_lists visibility field to be a select field")
	}

	if len(visibilityField.Values) != 2 || visibilityField.Values[0] != "private" || visibilityField.Values[1] != "friends" {
		t.Fatalf("expected restaurant_lists visibility values to be [private friends], got %#v", visibilityField.Values)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/restaurant_lists/records",
		ownerToken,
		fmt.Sprintf(`{"name":"Public list","visibility":"public","user":"%s"}`, owner.Id),
	)

	if response.Code == http.StatusOK || response.Code == http.StatusCreated {
		t.Fatalf("expected public list creation to fail, got %d: %s", response.Code, response.Body.String())
	}

	if !strings.Contains(response.Body.String(), "visibility") {
		t.Fatalf("expected public list creation failure to mention visibility, got %s", response.Body.String())
	}
}

func TestFriendsCanViewSharedRestaurantListsAndItems(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {})

	owner, _ := createAuthUser(t, server.app, false, false)
	friend, friendToken := createAuthUser(t, server.app, false, false)
	_, strangerToken := createAuthUser(t, server.app, false, false)

	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   owner.Id,
		"friend": friend.Id,
		"status": "accepted",
	})

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Shared Spot",
		"location":    "San Francisco, CA",
		"cuisineType": "Italian",
		"user":        owner.Id,
		"visibility":  "public",
	})

	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":        "Weekend saves",
		"description": "Shared with friends",
		"user":        owner.Id,
		"visibility":  "friends",
	})

	listItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    owner.Id,
		"position":   1,
		"note":       "Order the pasta",
	})

	friendListResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/restaurant_lists/records?perPage=50",
		friendToken,
		"",
	)
	if friendListResponse.Code != http.StatusOK {
		t.Fatalf("expected friend list lookup to succeed, got %d: %s", friendListResponse.Code, friendListResponse.Body.String())
	}
	if !strings.Contains(friendListResponse.Body.String(), list.Id) {
		t.Fatalf("expected accepted friend to see shared list, got %s", friendListResponse.Body.String())
	}

	strangerListResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/restaurant_lists/records?perPage=50",
		strangerToken,
		"",
	)
	if strangerListResponse.Code != http.StatusOK {
		t.Fatalf("expected stranger list lookup to succeed, got %d: %s", strangerListResponse.Code, strangerListResponse.Body.String())
	}
	if strings.Contains(strangerListResponse.Body.String(), list.Id) {
		t.Fatalf("expected stranger not to see shared list, got %s", strangerListResponse.Body.String())
	}

	friendListItemsResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/list_items/records?perPage=50",
		friendToken,
		"",
	)
	if friendListItemsResponse.Code != http.StatusOK {
		t.Fatalf("expected friend list item lookup to succeed, got %d: %s", friendListItemsResponse.Code, friendListItemsResponse.Body.String())
	}
	if !strings.Contains(friendListItemsResponse.Body.String(), listItem.Id) {
		t.Fatalf("expected accepted friend to see shared list item, got %s", friendListItemsResponse.Body.String())
	}

	strangerListItemsResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/list_items/records?perPage=50",
		strangerToken,
		"",
	)
	if strangerListItemsResponse.Code != http.StatusOK {
		t.Fatalf("expected stranger list item lookup to succeed, got %d: %s", strangerListItemsResponse.Code, strangerListItemsResponse.Body.String())
	}
	if strings.Contains(strangerListItemsResponse.Body.String(), listItem.Id) {
		t.Fatalf("expected stranger not to see shared list item, got %s", strangerListItemsResponse.Body.String())
	}
}
