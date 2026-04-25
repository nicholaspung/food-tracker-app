package handlers_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

type visitResponsePayload struct {
	ID                    string `json:"id"`
	RestaurantName        string `json:"restaurantName"`
	RestaurantLocation    string `json:"restaurantLocation"`
	RestaurantCuisineType string `json:"restaurantCuisineType"`
	UserName              string `json:"userName"`
	Visibility            string `json:"visibility"`
	Items                 []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"items"`
}

type billResponsePayload struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Status       string `json:"status"`
	Participants []struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		PaidStatus string `json:"paidStatus"`
	} `json:"participants"`
	Items []struct {
		ID                       string   `json:"id"`
		ItemName                 string   `json:"itemName"`
		AssignedToParticipantIDs []string `json:"assignedToParticipantIds"`
		SplitConfig              []struct {
			ParticipantID string `json:"participantId"`
		} `json:"splitConfig"`
	} `json:"items"`
}

type restaurantResponsePayload struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	PlaceID string `json:"placeId"`
}

func TestRestaurantUpsertEndpointReusesNormalizedNameMatch(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	existing := seedRestaurantRecord(t, server.app, user.Id, "Noodle House")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/restaurants/upsert",
		token,
		`{
			"restaurantName":"  noodle house  ",
			"location":"Oakland"
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload restaurantResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse restaurant payload: %v", err)
	}

	if payload.ID != existing.Id {
		t.Fatalf("expected existing restaurant id %q, got %q", existing.Id, payload.ID)
	}
	if count := countRestaurantsByName(t, server.app, "Noodle House"); count != 1 {
		t.Fatalf("expected 1 restaurant after upsert, got %d", count)
	}
}

func TestRestaurantUpsertEndpointPrefersPlaceIDMatch(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	existing := seedRestaurantRecordWithPlaceID(t, server.app, user.Id, "Original Place", "place-123")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/restaurants/upsert",
		token,
		`{
			"restaurantName":"Renamed Place",
			"placeId":"place-123",
			"isGooglePlace":true
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload restaurantResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse restaurant payload: %v", err)
	}

	if payload.ID != existing.Id {
		t.Fatalf("expected existing restaurant id %q, got %q", existing.Id, payload.ID)
	}
	if payload.PlaceID != "place-123" {
		t.Fatalf("expected placeId=place-123, got %q", payload.PlaceID)
	}
	if count := countRestaurantsByName(t, server.app, "Renamed Place"); count != 0 {
		t.Fatalf("expected 0 renamed-place duplicates, got %d", count)
	}
}

func TestRestaurantUpsertEndpointDoesNotReusePrivateNameMatchFromAnotherUser(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, _ := createAuthUser(t, server.app, false, true)
	requester, token := createAuthUser(t, server.app, false, true)

	existing := seedRestaurantRecord(t, server.app, owner.Id, "Secret Noodles")
	existing.Set("visibility", "private")
	if err := server.app.Save(existing); err != nil {
		t.Fatalf("failed to update restaurant visibility: %v", err)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/restaurants/upsert",
		token,
		`{
			"restaurantName":" secret noodles ",
			"location":"Berkeley"
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload restaurantResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse restaurant payload: %v", err)
	}

	if payload.ID == existing.Id {
		t.Fatalf("expected requester to get a new restaurant instead of private match %q", existing.Id)
	}
	if count := countRestaurantsByName(t, server.app, "Secret Noodles"); count != 2 {
		t.Fatalf("expected 2 private restaurants with the same name after isolation, got %d", count)
	}
	if count := countRecordsByFilter(t, server.app, "restaurants", "createdBy = {:userId}", map[string]any{"userId": requester.Id}); count != 1 {
		t.Fatalf("expected requester to own exactly one restaurant, got %d", count)
	}
}

func TestRestaurantUpsertEndpointDoesNotReusePrivatePlaceIDMatchFromAnotherUser(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, _ := createAuthUser(t, server.app, false, true)
	_, token := createAuthUser(t, server.app, false, true)

	existing := seedRestaurantRecordWithPlaceID(t, server.app, owner.Id, "Secret Place", "place-999")
	existing.Set("visibility", "private")
	if err := server.app.Save(existing); err != nil {
		t.Fatalf("failed to update restaurant visibility: %v", err)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/restaurants/upsert",
		token,
		`{
			"restaurantName":"Secret Place",
			"placeId":"place-999"
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload restaurantResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse restaurant payload: %v", err)
	}

	if payload.ID == existing.Id {
		t.Fatalf("expected requester to get a new restaurant instead of private place match %q", existing.Id)
	}
	if count := countRecordsByFilter(
		t,
		server.app,
		"restaurants",
		"placeId = 'place-999'",
		nil,
	); count != 2 {
		t.Fatalf("expected 2 isolated restaurants with placeId place-999, got %d", count)
	}
}

func TestRestaurantUpsertEndpointReusesFriendVisibleNameMatch(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, _ := createAuthUser(t, server.app, false, true)
	friend, token := createAuthUser(t, server.app, false, true)
	createFriendshipRecord(t, server.app, owner.Id, friend.Id, "accepted")

	existing := seedRestaurantRecord(t, server.app, owner.Id, "Friend Noodles")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/restaurants/upsert",
		token,
		`{
			"restaurantName":"friend noodles",
			"location":"Oakland"
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload restaurantResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse restaurant payload: %v", err)
	}

	if payload.ID != existing.Id {
		t.Fatalf("expected requester to reuse friend-visible restaurant id %q, got %q", existing.Id, payload.ID)
	}
	if count := countRestaurantsByName(t, server.app, "Friend Noodles"); count != 1 {
		t.Fatalf("expected 1 restaurant after friend-visible reuse, got %d", count)
	}
}

func TestVisitCreateEndpointCreatesNestedRecords(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantName":"Noodle House",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"private",
			"items":[
				{"name":"Spicy Wontons","rating":4,"description":"extra chili","notes":"shareable"},
				{"name":"Dan Dan Noodles","rating":5}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload visitResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse visit payload: %v", err)
	}

	if payload.RestaurantName != "Noodle House" {
		t.Fatalf("expected restaurantName=Noodle House, got %q", payload.RestaurantName)
	}
	if payload.Visibility != "private" {
		t.Fatalf("expected visibility=private, got %q", payload.Visibility)
	}
	if len(payload.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(payload.Items))
	}
	if payload.Items[0].Name != "Spicy Wontons" || payload.Items[1].Name != "Dan Dan Noodles" {
		t.Fatalf("unexpected item order or names: %#v", payload.Items)
	}

	if count := countRecordsByFilter(t, server.app, "visits", "user = {:userId}", map[string]any{"userId": user.Id}); count != 1 {
		t.Fatalf("expected 1 visit, got %d", count)
	}
	if count := countRecordsByFilter(t, server.app, "food_items", "visit = {:visitId}", map[string]any{"visitId": payload.ID}); count != 2 {
		t.Fatalf("expected 2 food items, got %d", count)
	}
	createdFoodItems, err := server.app.FindRecordsByFilter(
		"food_items",
		"visit = {:visitId}",
		"",
		10,
		0,
		map[string]any{"visitId": payload.ID},
	)
	if err != nil {
		t.Fatalf("failed to reload created food items: %v", err)
	}
	for _, foodItem := range createdFoodItems {
		if foodItem.GetString("itemType") != "visit-item" {
			t.Fatalf("expected created visit itemType=visit-item, got %q", foodItem.GetString("itemType"))
		}
	}
	if count := countRestaurantsByName(t, server.app, "Noodle House"); count != 1 {
		t.Fatalf("expected 1 restaurant, got %d", count)
	}
}

func TestVisitCreateEndpointRejectsInaccessibleRestaurantID(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, _ := createAuthUser(t, server.app, false, true)
	requester, token := createAuthUser(t, server.app, false, true)

	existing := seedRestaurantRecord(t, server.app, owner.Id, "Private Bistro")
	existing.Set("visibility", "private")
	if err := server.app.Save(existing); err != nil {
		t.Fatalf("failed to update restaurant visibility: %v", err)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+existing.Id+`",
			"restaurantName":"Private Bistro",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"friends",
			"items":[
				{"name":"Blocked Item","rating":4}
			]
		}`,
	)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", response.Code, response.Body.String())
	}

	if count := countRecordsByFilter(t, server.app, "visits", "user = {:userId}", map[string]any{"userId": requester.Id}); count != 0 {
		t.Fatalf("expected no requester visit to be created, got %d", count)
	}
}

func TestVisitCreateEndpointUsesProvidedRestaurantID(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	existing := seedRestaurantRecord(t, server.app, user.Id, "Known Bistro")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+existing.Id+`",
			"restaurantName":"Ignored New Name",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"friends",
			"items":[
				{"name":"Crispy Tofu","rating":4}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload visitResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse visit payload: %v", err)
	}

	reloadedVisit, err := server.app.FindRecordById("visits", payload.ID)
	if err != nil {
		t.Fatalf("failed to reload visit: %v", err)
	}
	if reloadedVisit.GetString("restaurant") != existing.Id {
		t.Fatalf("expected visit restaurant=%q, got %q", existing.Id, reloadedVisit.GetString("restaurant"))
	}
	if count := countRestaurantsByName(t, server.app, "Ignored New Name"); count != 0 {
		t.Fatalf("expected 0 duplicate restaurants, got %d", count)
	}
}

func TestVisitCreateEndpointMergesSameDayVisitsWhenRestaurantDateAndVisibilityMatch(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Known Bistro")

	firstResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Known Bistro",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visitedOn":"2026-04-05",
			"visibility":"friends",
			"items":[
				{"name":"Crispy Tofu","rating":4}
			]
		}`,
	)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first create to return 200, got %d: %s", firstResponse.Code, firstResponse.Body.String())
	}

	var firstPayload visitResponsePayload
	if err := json.Unmarshal(firstResponse.Body.Bytes(), &firstPayload); err != nil {
		t.Fatalf("failed to parse first visit payload: %v", err)
	}

	secondResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Known Bistro",
			"visitedAt":"2026-04-05T22:30:00Z",
			"visitedOn":"2026-04-05",
			"visibility":"friends",
			"items":[
				{"name":"Dan Dan Noodles","rating":5},
				{"name":"Cucumber Salad","rating":4}
			]
		}`,
	)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected second create to return 200, got %d: %s", secondResponse.Code, secondResponse.Body.String())
	}

	var secondPayload visitResponsePayload
	if err := json.Unmarshal(secondResponse.Body.Bytes(), &secondPayload); err != nil {
		t.Fatalf("failed to parse second visit payload: %v", err)
	}

	if secondPayload.ID != firstPayload.ID {
		t.Fatalf("expected merge to reuse visit id %q, got %q", firstPayload.ID, secondPayload.ID)
	}
	if count := countRecordsByFilter(t, server.app, "visits", "user = {:userId}", map[string]any{"userId": user.Id}); count != 1 {
		t.Fatalf("expected 1 visit after merge, got %d", count)
	}
	if count := countRecordsByFilter(t, server.app, "food_items", "visit = {:visitId}", map[string]any{"visitId": firstPayload.ID}); count != 3 {
		t.Fatalf("expected 3 food items after merge, got %d", count)
	}
	if len(secondPayload.Items) != 3 {
		t.Fatalf("expected 3 response items after merge, got %d: %#v", len(secondPayload.Items), secondPayload.Items)
	}
	if secondPayload.Items[0].Name != "Dan Dan Noodles" || secondPayload.Items[1].Name != "Cucumber Salad" {
		t.Fatalf("expected newly created items to be first in request order, got %#v", secondPayload.Items)
	}
	if secondPayload.Items[2].Name != "Crispy Tofu" {
		t.Fatalf("expected original item to remain after new items, got %#v", secondPayload.Items)
	}

	reloadedVisit, err := server.app.FindRecordById("visits", firstPayload.ID)
	if err != nil {
		t.Fatalf("failed to reload merged visit: %v", err)
	}
	if reloadedVisit.GetString("visitLocalDate") != "2026-04-05" {
		t.Fatalf("expected visitLocalDate=2026-04-05, got %q", reloadedVisit.GetString("visitLocalDate"))
	}
}

func TestVisitCreateEndpointDoesNotMergeWhenVisibilityDiffers(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Known Bistro")

	firstResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Known Bistro",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visitedOn":"2026-04-05",
			"visibility":"private",
			"items":[
				{"name":"Crispy Tofu","rating":4}
			]
		}`,
	)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first create to return 200, got %d: %s", firstResponse.Code, firstResponse.Body.String())
	}

	var firstPayload visitResponsePayload
	if err := json.Unmarshal(firstResponse.Body.Bytes(), &firstPayload); err != nil {
		t.Fatalf("failed to parse first visit payload: %v", err)
	}

	secondResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Known Bistro",
			"visitedAt":"2026-04-05T22:30:00Z",
			"visitedOn":"2026-04-05",
			"visibility":"friends",
			"items":[
				{"name":"Dan Dan Noodles","rating":5}
			]
		}`,
	)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected second create to return 200, got %d: %s", secondResponse.Code, secondResponse.Body.String())
	}

	var secondPayload visitResponsePayload
	if err := json.Unmarshal(secondResponse.Body.Bytes(), &secondPayload); err != nil {
		t.Fatalf("failed to parse second visit payload: %v", err)
	}

	if secondPayload.ID == firstPayload.ID {
		t.Fatalf("expected different visibility to prevent merge, but both responses used %q", secondPayload.ID)
	}
	if count := countRecordsByFilter(t, server.app, "visits", "user = {:userId}", map[string]any{"userId": user.Id}); count != 2 {
		t.Fatalf("expected 2 visits when visibility differs, got %d", count)
	}
}

func TestVisitGetEndpointReturnsHydratedVisitDetail(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Noodle House")
	restaurant.Set("location", "Oakland")
	restaurant.Set("cuisineType", "Sichuan")
	if err := server.app.Save(restaurant); err != nil {
		t.Fatalf("failed to update restaurant metadata: %v", err)
	}

	visit := seedVisitRecord(t, server.app, restaurant.Id, user.Id, "friends")
	seedFoodItemRecord(t, server.app, visit.Id, user.Id, "Spicy Wontons", 4)
	seedFoodItemRecord(t, server.app, visit.Id, user.Id, "Dan Dan Noodles", 5)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/visits/"+visit.Id,
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload visitResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse visit payload: %v", err)
	}

	if payload.RestaurantName != "Noodle House" {
		t.Fatalf("expected restaurantName=Noodle House, got %q", payload.RestaurantName)
	}
	if payload.RestaurantLocation != "Oakland" {
		t.Fatalf("expected restaurantLocation=Oakland, got %q", payload.RestaurantLocation)
	}
	if payload.RestaurantCuisineType != "Sichuan" {
		t.Fatalf("expected restaurantCuisineType=Sichuan, got %q", payload.RestaurantCuisineType)
	}
	if payload.UserName != "Integration Test User" {
		t.Fatalf("expected userName=Integration Test User, got %q", payload.UserName)
	}
	if len(payload.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(payload.Items))
	}
	itemNames := []string{payload.Items[0].Name, payload.Items[1].Name}
	if !containsString(itemNames, "Spicy Wontons") || !containsString(itemNames, "Dan Dan Noodles") {
		t.Fatalf("expected both visit items in the response, got %#v", payload.Items)
	}
}

func TestVisitGetEndpointFiltersItemsForFriends(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, _ := createAuthUser(t, server.app, false, true)
	friend, friendToken := createAuthUser(t, server.app, false, true)

	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   owner.Id,
		"friend": friend.Id,
		"status": "accepted",
	})

	restaurant := seedRestaurantRecord(t, server.app, owner.Id, "Shared Bistro")
	visit := seedVisitRecord(t, server.app, restaurant.Id, owner.Id, "friends")
	seedFoodItemRecord(t, server.app, visit.Id, owner.Id, "Visible Dish", 4)
	filteredItem := seedFoodItemRecord(t, server.app, visit.Id, owner.Id, "Under Review Dish", 5)
	filteredItem.Set("moderationStatus", "under_review")
	if err := server.app.Save(filteredItem); err != nil {
		t.Fatalf("failed to mark item under review: %v", err)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/visits/"+visit.Id,
		friendToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload visitResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse visit payload: %v", err)
	}

	if len(payload.Items) != 1 {
		t.Fatalf("expected 1 visible item, got %d: %#v", len(payload.Items), payload.Items)
	}
	if payload.Items[0].Name != "Visible Dish" {
		t.Fatalf("expected visible item to remain, got %#v", payload.Items)
	}
}

func TestVisitGetEndpointHidesPrivateVisitsFromOtherUsers(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, _ := createAuthUser(t, server.app, false, true)
	_, otherToken := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, owner.Id, "Private Bistro")
	visit := seedVisitRecord(t, server.app, restaurant.Id, owner.Id, "private")
	seedFoodItemRecord(t, server.app, visit.Id, owner.Id, "Secret Dish", 5)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/visits/"+visit.Id,
		otherToken,
		"",
	)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", response.Code, response.Body.String())
	}
}

func TestVisitCreateEndpointRollsBackOnInvalidNestedItem(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantName":"Rollback Cafe",
			"items":[
				{"name":"Valid Dish","rating":4},
				{"name":"   ","rating":5}
			]
		}`,
	)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}

	if count := countRecordsByFilter(t, server.app, "visits", "user = {:userId}", map[string]any{"userId": user.Id}); count != 0 {
		t.Fatalf("expected 0 visits after rollback, got %d", count)
	}
	if count := countRecordsByFilter(t, server.app, "food_items", "user = {:userId}", map[string]any{"userId": user.Id}); count != 0 {
		t.Fatalf("expected 0 food items after rollback, got %d", count)
	}
	if count := countRestaurantsByName(t, server.app, "Rollback Cafe"); count != 0 {
		t.Fatalf("expected 0 restaurants after rollback, got %d", count)
	}
}

func TestVisitUpdateEndpointRequiresOwner(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, _ := createAuthUser(t, server.app, false, true)
	_, intruderToken := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, owner.Id, "Owner Bistro")
	visit := seedVisitRecord(t, server.app, restaurant.Id, owner.Id, "friends")
	seedFoodItemRecord(t, server.app, visit.Id, owner.Id, "Soup", 4)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPut,
		"/api/visits/"+visit.Id,
		intruderToken,
		`{"visibility":"private"}`,
	)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", response.Code, response.Body.String())
	}

	reloadedVisit, err := server.app.FindRecordById("visits", visit.Id)
	if err != nil {
		t.Fatalf("failed to reload visit: %v", err)
	}
	if reloadedVisit.GetString("visibility") != "friends" {
		t.Fatalf("expected visit visibility to remain friends, got %q", reloadedVisit.GetString("visibility"))
	}
}

func TestVisitUpdateEndpointSynchronizesVisitLocalDate(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Owner Bistro")
	visit := seedVisitRecord(t, server.app, restaurant.Id, user.Id, "friends")
	foodItem := seedFoodItemRecord(t, server.app, visit.Id, user.Id, "Soup", 4)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPut,
		"/api/visits/"+visit.Id,
		token,
		`{
			"visitedAt":"2026-04-06T18:00:00Z",
			"visitedOn":"2026-04-06",
			"items":[
				{"id":"`+foodItem.Id+`","name":"Soup","rating":4}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	reloadedVisit, err := server.app.FindRecordById("visits", visit.Id)
	if err != nil {
		t.Fatalf("failed to reload visit: %v", err)
	}
	if !strings.HasPrefix(reloadedVisit.GetString("visitDate"), "2026-04-06") {
		t.Fatalf("expected visitDate to start with 2026-04-06, got %q", reloadedVisit.GetString("visitDate"))
	}
	if reloadedVisit.GetString("visitLocalDate") != "2026-04-06" {
		t.Fatalf("expected visitLocalDate=2026-04-06, got %q", reloadedVisit.GetString("visitLocalDate"))
	}
}

func TestVisitUpdateEndpointDeletesOmittedVisitItems(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Owner Bistro")
	visit := seedVisitRecord(t, server.app, restaurant.Id, user.Id, "friends")
	retainedItem := seedFoodItemRecord(t, server.app, visit.Id, user.Id, "Soup", 4)
	removedItem := seedFoodItemRecord(t, server.app, visit.Id, user.Id, "Noodles", 5)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPut,
		"/api/visits/"+visit.Id,
		token,
		`{
			"items":[
				{"id":"`+retainedItem.Id+`","name":"Soup","rating":4}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload visitResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse visit payload: %v", err)
	}
	if len(payload.Items) != 1 {
		t.Fatalf("expected 1 item in response, got %d: %#v", len(payload.Items), payload.Items)
	}
	if payload.Items[0].ID != retainedItem.Id {
		t.Fatalf("expected retained item %q in response, got %#v", retainedItem.Id, payload.Items)
	}

	reloadedRetainedItem, err := server.app.FindRecordById("food_items", retainedItem.Id)
	if err != nil {
		t.Fatalf("failed to reload retained item: %v", err)
	}
	if reloadedRetainedItem.GetString("visit") != visit.Id {
		t.Fatalf("expected retained item to remain attached to visit %q, got %q", visit.Id, reloadedRetainedItem.GetString("visit"))
	}

	if _, err := server.app.FindRecordById("food_items", removedItem.Id); err == nil {
		t.Fatalf("expected omitted item %q to be deleted", removedItem.Id)
	}
}

func TestMoveVisitItemEndpointMovesItemAndPhotos(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	sourceRestaurant := seedRestaurantRecord(t, server.app, user.Id, "Source Bistro")
	destinationRestaurant := seedRestaurantRecord(t, server.app, user.Id, "Destination Bistro")
	sourceVisit := seedVisitRecord(t, server.app, sourceRestaurant.Id, user.Id, "friends")
	destinationVisit := seedVisitRecord(t, server.app, destinationRestaurant.Id, user.Id, "friends")
	item := seedFoodItemRecord(t, server.app, sourceVisit.Id, user.Id, "Spicy Wontons", 4)
	photoID := insertVisitPhotoRowRaw(t, server.app, user.Id, sourceVisit.Id, item.Id)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visit-items/"+item.Id+"/move",
		token,
		`{"destinationVisitId":"`+destinationVisit.Id+`"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		ItemID             string `json:"itemId"`
		DestinationVisitID string `json:"destinationVisitId"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse move payload: %v", err)
	}
	if payload.ItemID != item.Id || payload.DestinationVisitID != destinationVisit.Id {
		t.Fatalf("unexpected move payload: %#v", payload)
	}

	reloadedItem, err := server.app.FindRecordById("food_items", item.Id)
	if err != nil {
		t.Fatalf("failed to reload moved item: %v", err)
	}
	if reloadedItem.GetString("visit") != destinationVisit.Id {
		t.Fatalf("expected moved item visit=%q, got %q", destinationVisit.Id, reloadedItem.GetString("visit"))
	}

	reloadedPhoto, err := server.app.FindRecordById("visit_photos", photoID)
	if err != nil {
		t.Fatalf("failed to reload moved photo: %v", err)
	}
	if reloadedPhoto.GetString("visit") != destinationVisit.Id {
		t.Fatalf("expected moved photo visit=%q, got %q", destinationVisit.Id, reloadedPhoto.GetString("visit"))
	}

	if count := countRecordsByFilter(t, server.app, "food_items", "visit = {:visitId}", map[string]any{"visitId": sourceVisit.Id}); count != 0 {
		t.Fatalf("expected source visit to have 0 items after move, got %d", count)
	}
	if count := countRecordsByFilter(t, server.app, "food_items", "visit = {:visitId}", map[string]any{"visitId": destinationVisit.Id}); count != 1 {
		t.Fatalf("expected destination visit to have 1 item after move, got %d", count)
	}
}

func TestMoveVisitItemEndpointIsIdempotent(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	sourceRestaurant := seedRestaurantRecord(t, server.app, user.Id, "Source Bistro")
	destinationRestaurant := seedRestaurantRecord(t, server.app, user.Id, "Destination Bistro")
	sourceVisit := seedVisitRecord(t, server.app, sourceRestaurant.Id, user.Id, "friends")
	destinationVisit := seedVisitRecord(t, server.app, destinationRestaurant.Id, user.Id, "friends")
	item := seedFoodItemRecord(t, server.app, sourceVisit.Id, user.Id, "Soup", 4)
	photoID := insertVisitPhotoRowRaw(t, server.app, user.Id, sourceVisit.Id, item.Id)

	firstResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visit-items/"+item.Id+"/move",
		token,
		`{"destinationVisitId":"`+destinationVisit.Id+`"}`,
	)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first move 200, got %d: %s", firstResponse.Code, firstResponse.Body.String())
	}

	secondResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visit-items/"+item.Id+"/move",
		token,
		`{"destinationVisitId":"`+destinationVisit.Id+`"}`,
	)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected second move 200, got %d: %s", secondResponse.Code, secondResponse.Body.String())
	}

	reloadedItem, err := server.app.FindRecordById("food_items", item.Id)
	if err != nil {
		t.Fatalf("failed to reload item after repeated move: %v", err)
	}
	if reloadedItem.GetString("visit") != destinationVisit.Id {
		t.Fatalf("expected item to remain on destination visit, got %q", reloadedItem.GetString("visit"))
	}

	reloadedPhoto, err := server.app.FindRecordById("visit_photos", photoID)
	if err != nil {
		t.Fatalf("failed to reload photo after repeated move: %v", err)
	}
	if reloadedPhoto.GetString("visit") != destinationVisit.Id {
		t.Fatalf("expected photo to remain on destination visit, got %q", reloadedPhoto.GetString("visit"))
	}
}

func TestMoveVisitItemEndpointRejectsInvalidOwnership(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, ownerToken := createAuthUser(t, server.app, false, true)
	_, intruderToken := createAuthUser(t, server.app, false, true)
	otherOwner, _ := createAuthUser(t, server.app, false, true)

	sourceRestaurant := seedRestaurantRecord(t, server.app, owner.Id, "Owner Bistro")
	ownerDestinationRestaurant := seedRestaurantRecord(t, server.app, owner.Id, "Owner Destination")
	otherDestinationRestaurant := seedRestaurantRecord(t, server.app, otherOwner.Id, "Other Destination")
	sourceVisit := seedVisitRecord(t, server.app, sourceRestaurant.Id, owner.Id, "friends")
	ownerDestinationVisit := seedVisitRecord(t, server.app, ownerDestinationRestaurant.Id, owner.Id, "friends")
	otherDestinationVisit := seedVisitRecord(t, server.app, otherDestinationRestaurant.Id, otherOwner.Id, "friends")
	item := seedFoodItemRecord(t, server.app, sourceVisit.Id, owner.Id, "Soup", 4)

	forbiddenItemResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visit-items/"+item.Id+"/move",
		intruderToken,
		`{"destinationVisitId":"`+ownerDestinationVisit.Id+`"}`,
	)
	if forbiddenItemResponse.Code != http.StatusForbidden {
		t.Fatalf("expected foreign item move to return 403, got %d: %s", forbiddenItemResponse.Code, forbiddenItemResponse.Body.String())
	}

	forbiddenDestinationResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visit-items/"+item.Id+"/move",
		ownerToken,
		`{"destinationVisitId":"`+otherDestinationVisit.Id+`"}`,
	)
	if forbiddenDestinationResponse.Code != http.StatusForbidden {
		t.Fatalf("expected foreign destination move to return 403, got %d: %s", forbiddenDestinationResponse.Code, forbiddenDestinationResponse.Body.String())
	}

	reloadedItem, err := server.app.FindRecordById("food_items", item.Id)
	if err != nil {
		t.Fatalf("failed to reload item after forbidden moves: %v", err)
	}
	if reloadedItem.GetString("visit") != sourceVisit.Id {
		t.Fatalf("expected item to remain on source visit, got %q", reloadedItem.GetString("visit"))
	}
}

func TestMoveVisitItemEndpointRejectsNonVisitItems(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	destinationRestaurant := seedRestaurantRecord(t, server.app, user.Id, "Destination Bistro")
	destinationVisit := seedVisitRecord(t, server.app, destinationRestaurant.Id, user.Id, "friends")
	foodProduct := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":     user.Id,
		"name":     "Bagged Chips",
		"rating":   4,
		"itemType": "food-product",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visit-items/"+foodProduct.Id+"/move",
		token,
		`{"destinationVisitId":"`+destinationVisit.Id+`"}`,
	)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected non-visit move to return 400, got %d: %s", response.Code, response.Body.String())
	}
}

func TestHomeFeedEndpointShowsMergedVisitAsSingleEntry(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureWriteHandlers(se, app)
		handlers.RegisterFeatureSummaryHandlers(se, app)
	})
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Known Bistro")

	firstResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Known Bistro",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visitedOn":"2026-04-05",
			"visibility":"friends",
			"items":[
				{"name":"Crispy Tofu","rating":4}
			]
		}`,
	)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first create to return 200, got %d: %s", firstResponse.Code, firstResponse.Body.String())
	}

	secondResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Known Bistro",
			"visitedAt":"2026-04-05T22:30:00Z",
			"visitedOn":"2026-04-05",
			"visibility":"friends",
			"items":[
				{"name":"Dan Dan Noodles","rating":5}
			]
		}`,
	)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected second create to return 200, got %d: %s", secondResponse.Code, secondResponse.Body.String())
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=20&scope=mine&typeFilter=visits&sort=created",
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		Items []struct {
			Source string `json:"source"`
			Visit  *struct {
				ID    string `json:"id"`
				Items []struct {
					Name string `json:"name"`
				} `json:"items"`
			} `json:"visit"`
		} `json:"items"`
		TotalVisits int `json:"totalVisits"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse home feed payload: %v", err)
	}

	if payload.TotalVisits != 1 {
		t.Fatalf("expected totalVisits=1 after merge, got %d", payload.TotalVisits)
	}
	if len(payload.Items) != 1 {
		t.Fatalf("expected 1 home feed entry after merge, got %d: %#v", len(payload.Items), payload.Items)
	}
	if payload.Items[0].Source != "visit" || payload.Items[0].Visit == nil {
		t.Fatalf("expected a merged visit entry, got %#v", payload.Items[0])
	}
	if len(payload.Items[0].Visit.Items) != 2 {
		t.Fatalf("expected 2 items on merged visit entry, got %#v", payload.Items[0].Visit.Items)
	}

	itemNames := []string{
		payload.Items[0].Visit.Items[0].Name,
		payload.Items[0].Visit.Items[1].Name,
	}
	if !containsString(itemNames, "Crispy Tofu") || !containsString(itemNames, "Dan Dan Noodles") {
		t.Fatalf("expected merged visit items in home feed, got %#v", payload.Items[0].Visit.Items)
	}
}

func TestBillCreateEndpointCreatesNestedRecords(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/bills",
		token,
		`{
			"title":"Dinner Split",
			"tax":8.25,
			"tip":12.5,
			"fees":1.75,
			"extrasSplitMode":"proportional",
			"participants":[
				{"id":"temp_alex","name":"Alex","amountOwed":18.5,"paidStatus":"pending"},
				{"id":"temp_bailey","name":"Bailey","amountOwed":22,"paidStatus":"paid"}
			],
			"items":[
				{
					"id":"temp_item_1",
					"itemName":"Wings",
					"price":20,
					"assignedToParticipantIds":["temp_alex","temp_bailey"],
					"splitMode":"advanced",
					"splitConfig":[
						{"participantId":"temp_alex","type":"amount","value":9.5},
						{"participantId":"temp_bailey","type":"amount","value":10.5}
					]
				},
				{
					"id":"temp_item_2",
					"itemName":"Fries",
					"price":8,
					"assignedToParticipantIds":[],
					"splitMode":"simple"
				}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload billResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse bill payload: %v", err)
	}

	if payload.Title != "Dinner Split" {
		t.Fatalf("expected title=Dinner Split, got %q", payload.Title)
	}
	if payload.Status != "open" {
		t.Fatalf("expected status=open, got %q", payload.Status)
	}
	if len(payload.Participants) != 2 {
		t.Fatalf("expected 2 participants, got %d", len(payload.Participants))
	}
	if len(payload.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(payload.Items))
	}
	if strings.HasPrefix(payload.Items[0].AssignedToParticipantIDs[0], "temp_") {
		t.Fatalf("expected participant ids to be remapped, got %#v", payload.Items[0].AssignedToParticipantIDs)
	}
	if len(payload.Items[0].SplitConfig) != 2 || strings.HasPrefix(payload.Items[0].SplitConfig[0].ParticipantID, "temp_") {
		t.Fatalf("expected split config ids to be remapped, got %#v", payload.Items[0].SplitConfig)
	}

	if count := countRecordsByFilter(t, server.app, "bills", "creator_user = {:userId}", map[string]any{"userId": user.Id}); count != 1 {
		t.Fatalf("expected 1 bill, got %d", count)
	}
	if count := countRecordsByFilter(t, server.app, "bill_participants", "bill = {:billId}", map[string]any{"billId": payload.ID}); count != 2 {
		t.Fatalf("expected 2 participants, got %d", count)
	}
	if count := countRecordsByFilter(t, server.app, "bill_items", "bill = {:billId}", map[string]any{"billId": payload.ID}); count != 2 {
		t.Fatalf("expected 2 bill items, got %d", count)
	}
}

func TestBillUpdateEndpointRequiresCreatorAndRollsBackOnInvalidNestedItem(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	creator, creatorToken := createAuthUser(t, server.app, false, true)
	_, intruderToken := createAuthUser(t, server.app, false, true)

	bill := seedBillRecord(t, server.app, creator.Id, "Original Bill")
	participant := seedBillParticipantRecord(t, server.app, bill.Id, "", "Alex", 18.5, "pending")
	item := seedBillItemRecord(
		t,
		server.app,
		bill.Id,
		"Original Fries",
		8,
		[]string{participant.Id},
		"simple",
		nil,
	)

	forbiddenResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPut,
		"/api/bills/"+bill.Id,
		intruderToken,
		`{"title":"Hacked Bill"}`,
	)
	if forbiddenResponse.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", forbiddenResponse.Code, forbiddenResponse.Body.String())
	}

	rollbackResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPut,
		"/api/bills/"+bill.Id,
		creatorToken,
		`{
			"title":"Updated Bill",
			"items":[
				{
					"id":"`+item.Id+`",
					"itemName":"Updated Fries",
					"price":9,
					"assignedToParticipantIds":["`+participant.Id+`"],
					"splitMode":"simple"
				},
				{
					"id":"temp_bad_item",
					"itemName":"   ",
					"price":6,
					"assignedToParticipantIds":["`+participant.Id+`"],
					"splitMode":"simple"
				}
			]
		}`,
	)
	if rollbackResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rollbackResponse.Code, rollbackResponse.Body.String())
	}

	reloadedBill, err := server.app.FindRecordById("bills", bill.Id)
	if err != nil {
		t.Fatalf("failed to reload bill: %v", err)
	}
	if reloadedBill.GetString("bill_name") != "Original Bill" {
		t.Fatalf("expected bill title rollback, got %q", reloadedBill.GetString("bill_name"))
	}

	reloadedItem, err := server.app.FindRecordById("bill_items", item.Id)
	if err != nil {
		t.Fatalf("failed to reload bill item: %v", err)
	}
	if reloadedItem.GetString("item_name") != "Original Fries" {
		t.Fatalf("expected bill item rollback, got %q", reloadedItem.GetString("item_name"))
	}
	if count := countRecordsByFilter(t, server.app, "bill_items", "bill = {:billId}", map[string]any{"billId": bill.Id}); count != 1 {
		t.Fatalf("expected 1 bill item after rollback, got %d", count)
	}
}

func TestBillDeleteEndpointDeletesNestedRecords(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	creator, creatorToken := createAuthUser(t, server.app, false, true)
	_, intruderToken := createAuthUser(t, server.app, false, true)

	bill := seedBillRecord(t, server.app, creator.Id, "Delete Me")
	participant := seedBillParticipantRecord(t, server.app, bill.Id, creator.Id, creator.GetString("name"), 18.5, "pending")
	seedBillParticipantRecord(t, server.app, bill.Id, "", "Friend", 14.25, "pending")
	seedBillItemRecord(t, server.app, bill.Id, "Shared Plate", 32.75, []string{participant.Id}, "simple", nil)

	forbiddenResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodDelete,
		"/api/bills/"+bill.Id,
		intruderToken,
		"",
	)
	if forbiddenResponse.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", forbiddenResponse.Code, forbiddenResponse.Body.String())
	}

	deleteResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodDelete,
		"/api/bills/"+bill.Id,
		creatorToken,
		"",
	)
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", deleteResponse.Code, deleteResponse.Body.String())
	}

	if count := countRecordsByFilter(t, server.app, "bills", "id = {:billId}", map[string]any{"billId": bill.Id}); count != 0 {
		t.Fatalf("expected bill to be deleted, got %d remaining", count)
	}
	if count := countRecordsByFilter(t, server.app, "bill_participants", "bill = {:billId}", map[string]any{"billId": bill.Id}); count != 0 {
		t.Fatalf("expected bill participants to be deleted, got %d remaining", count)
	}
	if count := countRecordsByFilter(t, server.app, "bill_items", "bill = {:billId}", map[string]any{"billId": bill.Id}); count != 0 {
		t.Fatalf("expected bill items to be deleted, got %d remaining", count)
	}
}

func TestBillParticipantPaidStatusEndpointUpdatesBillTransactionally(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	creator, creatorToken := createAuthUser(t, server.app, false, true)

	bill := seedBillRecord(t, server.app, creator.Id, "Settle Up")
	seedBillParticipantRecord(t, server.app, bill.Id, creator.Id, creator.GetString("name"), 18.5, "paid")
	friendParticipant := seedBillParticipantRecord(t, server.app, bill.Id, "", "Friend", 18.5, "pending")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/bills/"+bill.Id+"/participants/"+friendParticipant.Id+"/paid-status",
		creatorToken,
		`{"paidStatus":"paid"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload billResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse bill payload: %v", err)
	}

	if payload.Status != "settled" {
		t.Fatalf("expected bill status to be settled, got %q", payload.Status)
	}

	friendPayloadFound := false
	for _, participant := range payload.Participants {
		if participant.ID != friendParticipant.Id {
			continue
		}

		friendPayloadFound = true
		if participant.PaidStatus != "paid" {
			t.Fatalf("expected participant payload to be paid, got %q", participant.PaidStatus)
		}
	}
	if !friendPayloadFound {
		t.Fatalf("expected updated participant %q in response", friendParticipant.Id)
	}

	reloadedBill, err := server.app.FindRecordById("bills", bill.Id)
	if err != nil {
		t.Fatalf("failed to reload bill: %v", err)
	}
	if got := reloadedBill.GetString("status"); got != "settled" {
		t.Fatalf("expected persisted bill status settled, got %q", got)
	}

	reloadedParticipant, err := server.app.FindRecordById("bill_participants", friendParticipant.Id)
	if err != nil {
		t.Fatalf("failed to reload participant: %v", err)
	}
	if got := reloadedParticipant.GetString("paid_status"); got != "paid" {
		t.Fatalf("expected persisted participant status paid, got %q", got)
	}
}

func TestBillParticipantPaidStatusEndpointAllowsSelfMarkPaidButNotUnpaid(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	creator, _ := createAuthUser(t, server.app, false, true)
	participantUser, participantToken := createAuthUser(t, server.app, false, true)

	bill := seedBillRecord(t, server.app, creator.Id, "Self Service")
	seedBillParticipantRecord(t, server.app, bill.Id, creator.Id, creator.GetString("name"), 18.5, "paid")
	participant := seedBillParticipantRecord(
		t,
		server.app,
		bill.Id,
		participantUser.Id,
		participantUser.GetString("name"),
		18.5,
		"pending",
	)

	paidResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/bills/"+bill.Id+"/participants/"+participant.Id+"/paid-status",
		participantToken,
		`{"paidStatus":"paid"}`,
	)
	if paidResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", paidResponse.Code, paidResponse.Body.String())
	}

	unpaidResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/bills/"+bill.Id+"/participants/"+participant.Id+"/paid-status",
		participantToken,
		`{"paidStatus":"pending"}`,
	)
	if unpaidResponse.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", unpaidResponse.Code, unpaidResponse.Body.String())
	}

	reloadedParticipant, err := server.app.FindRecordById("bill_participants", participant.Id)
	if err != nil {
		t.Fatalf("failed to reload participant: %v", err)
	}
	if got := reloadedParticipant.GetString("paid_status"); got != "paid" {
		t.Fatalf("expected participant to remain paid, got %q", got)
	}
}

func countRestaurantsByName(t *testing.T, app core.App, name string) int {
	t.Helper()
	query := `
		SELECT COUNT(*) AS [[count]]
		FROM restaurants
		WHERE LOWER(TRIM(name)) = {:normalizedName}
	`
	row := struct {
		Count int `db:"count"`
	}{}
	if err := app.DB().NewQuery(query).
		Bind(map[string]any{"normalizedName": strings.ToLower(strings.TrimSpace(name))}).
		One(&row); err != nil {
		t.Fatalf("failed to count restaurants: %v", err)
	}
	return row.Count
}

func countRecordsByFilter(
	t *testing.T,
	app core.App,
	collectionName string,
	filter string,
	params map[string]any,
) int {
	t.Helper()
	records, err := app.FindRecordsByFilter(collectionName, filter, "", 200, 0, params)
	if err != nil {
		t.Fatalf("failed to count %s records: %v", collectionName, err)
	}
	return len(records)
}

func seedRestaurantRecord(t *testing.T, app core.App, userID string, name string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("restaurants")
	if err != nil {
		t.Fatalf("failed to resolve restaurants collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("name", name)
	record.Set("location", name)
	record.Set("createdBy", userID)
	record.Set("visibility", "friends")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create restaurant: %v", err)
	}
	return record
}

func seedRestaurantRecordWithPlaceID(t *testing.T, app core.App, userID string, name string, placeID string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("restaurants")
	if err != nil {
		t.Fatalf("failed to resolve restaurants collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("name", name)
	record.Set("location", name)
	record.Set("placeId", placeID)
	record.Set("createdBy", userID)
	record.Set("visibility", "friends")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create restaurant with placeId: %v", err)
	}
	return record
}

func seedVisitRecord(t *testing.T, app core.App, restaurantID string, userID string, visibility string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("visits")
	if err != nil {
		t.Fatalf("failed to resolve visits collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("restaurant", restaurantID)
	record.Set("user", userID)
	record.Set("visitDate", "2026-04-05T18:00:00Z")
	record.Set("visitLocalDate", "2026-04-05")
	record.Set("visibility", visibility)
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create visit: %v", err)
	}
	return record
}

func seedFoodItemRecord(t *testing.T, app core.App, visitID string, userID string, name string, rating float64) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		t.Fatalf("failed to resolve food_items collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("visit", visitID)
	record.Set("user", userID)
	record.Set("name", name)
	record.Set("rating", rating)
	record.Set("itemType", "visit-item")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create food item: %v", err)
	}
	return record
}

func seedBillRecord(t *testing.T, app core.App, creatorUserID string, title string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("bills")
	if err != nil {
		t.Fatalf("failed to resolve bills collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("creator_user", creatorUserID)
	record.Set("bill_name", title)
	record.Set("total_amount", 18.5)
	record.Set("tax", 0)
	record.Set("tip", 0)
	record.Set("fees", 0)
	record.Set("split_mode", "itemized")
	record.Set("extras_split_mode", "proportional")
	record.Set("status", "active")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create bill: %v", err)
	}
	return record
}

func containsString(values []string, candidate string) bool {
	for _, value := range values {
		if value == candidate {
			return true
		}
	}

	return false
}

func seedBillParticipantRecord(
	t *testing.T,
	app core.App,
	billID string,
	userID string,
	name string,
	amountOwed float64,
	paidStatus string,
) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("bill_participants")
	if err != nil {
		t.Fatalf("failed to resolve bill_participants collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("bill", billID)
	if strings.TrimSpace(userID) != "" {
		record.Set("user", userID)
	}
	record.Set("participant_name", name)
	record.Set("amount_owed", amountOwed)
	record.Set("paid_status", paidStatus)
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create bill participant: %v", err)
	}
	return record
}

func seedBillItemRecord(
	t *testing.T,
	app core.App,
	billID string,
	name string,
	price float64,
	assignedTo []string,
	splitMode string,
	splitConfig []map[string]any,
) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("bill_items")
	if err != nil {
		t.Fatalf("failed to resolve bill_items collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("bill", billID)
	record.Set("item_name", name)
	record.Set("price", price)
	record.Set("assigned_to", assignedTo)
	record.Set("split_mode", splitMode)
	record.Set("split_config", splitConfig)
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create bill item: %v", err)
	}
	return record
}
