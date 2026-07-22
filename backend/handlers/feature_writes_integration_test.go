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
	RestaurantID          string `json:"restaurantId"`
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
			"placeId":"place-123"
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

func TestRestaurantUpsertEndpointRejectsGoogleCatalogPromotion(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	maliciousRequests := []string{
		`{
			"restaurantName":"Poisoned Google Place",
			"location":"Fake City",
			"placeId":"real-place-id",
			"isGooglePlace":true
		}`,
		`{
			"restaurantName":"Public Place ID Claim",
			"location":"Fake City",
			"visibility":"public",
			"placeId":"reserved-place-id"
		}`,
	}
	for _, body := range maliciousRequests {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			"/api/restaurants/upsert",
			token,
			body,
		)
		if response.Code != http.StatusForbidden {
			t.Fatalf("expected Google catalog promotion 403, got %d: %s", response.Code, response.Body.String())
		}
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"restaurants",
		"createdBy = {:userId}",
		map[string]any{"userId": user.Id},
	); count != 0 {
		t.Fatalf("expected rejected promotion to create no restaurants, got %d", count)
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

func TestRestaurantUpsertEndpointDoesNotTrustPublicNonGooglePlaceIDMatch(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, _ := createAuthUser(t, server.app, false, true)
	requester, token := createAuthUser(t, server.app, false, true)

	legacy := seedRestaurantRecordWithPlaceID(t, server.app, owner.Id, "Unverified Public Place", "unverified-public-place")
	legacy.Set("visibility", "public")
	if err := server.app.Save(legacy); err != nil {
		t.Fatalf("failed to save legacy public Place ID record: %v", err)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/restaurants/upsert",
		token,
		`{
			"restaurantName":"Requester Private Place",
			"visibility":"private",
			"placeId":"unverified-public-place"
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected private owner-bound upsert 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload restaurantResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse restaurant payload: %v", err)
	}
	if payload.ID == legacy.Id {
		t.Fatalf("expected public non-Google Place ID record %q not to be trusted", legacy.Id)
	}
	created, err := server.app.FindRecordById("restaurants", payload.ID)
	if err != nil {
		t.Fatalf("failed to reload requester restaurant: %v", err)
	}
	if created.GetString("createdBy") != requester.Id || created.GetString("visibility") != "private" {
		t.Fatalf("expected private owner-bound restaurant, got %#v", created)
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

func TestVisitCreateEndpointRecordsSuggestionProvenanceForQualifiedGroupSuggestion(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	admin, adminToken := createAuthUser(t, server.app, true, true)
	user, token := createAuthUser(t, server.app, false, true)
	group := createCollectionRecord(t, server.app, "restaurant_groups", map[string]any{
		"name":      "Noodle Group",
		"createdBy": admin.Id,
	})
	targetRestaurant := seedRestaurantRecord(t, server.app, user.Id, "Noodle House Downtown")
	targetRestaurant.Set("restaurantGroup", group.Id)
	if err := server.app.Save(targetRestaurant); err != nil {
		t.Fatalf("failed to assign target restaurant group: %v", err)
	}
	sourceRestaurant := seedRestaurantRecord(t, server.app, user.Id, "Noodle House Uptown")
	sourceRestaurant.Set("restaurantGroup", group.Id)
	if err := server.app.Save(sourceRestaurant); err != nil {
		t.Fatalf("failed to assign source restaurant group: %v", err)
	}
	sourceMenuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"restaurant":     sourceRestaurant.Id,
		"createdBy":      admin.Id,
		"name":           "Coconut Yogurt",
		"visibility":     "public",
		"approvalStatus": "approved",
		"groupSuitable":  true,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+targetRestaurant.Id+`",
			"restaurantName":"Noodle House Downtown",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"friends",
			"items":[
				{
					"name":"Coconut Yogurt",
					"rating":5,
					"suggestionSource":{
						"type":"groupMenuSuggestion",
						"sourceMenuItemId":"`+sourceMenuItem.Id+`",
						"sourceRestaurantId":"`+sourceRestaurant.Id+`",
						"restaurantGroupId":"`+group.Id+`",
						"normalizedItemName":"coconut yogurt"
					}
				}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "suggestion_provenance") ||
		strings.Contains(response.Body.String(), "sourceMenuItem") {
		t.Fatalf("expected normal visit response to omit provenance fields, got %s", response.Body.String())
	}

	records, err := server.app.FindRecordsByFilter(
		"suggestion_provenance",
		"sourceMenuItem = {:sourceMenuItemId}",
		"",
		10,
		0,
		map[string]any{"sourceMenuItemId": sourceMenuItem.Id},
	)
	if err != nil {
		t.Fatalf("failed to load suggestion provenance: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected one provenance record, got %d", len(records))
	}
	provenance := records[0]
	if provenance.GetString("user") != user.Id ||
		provenance.GetString("targetRestaurant") != targetRestaurant.Id ||
		provenance.GetString("sourceRestaurant") != sourceRestaurant.Id ||
		provenance.GetString("restaurantGroup") != group.Id ||
		provenance.GetString("normalizedItemName") != "coconut yogurt" {
		t.Fatalf("unexpected provenance record: %#v", provenance.PublicExport())
	}

	userListResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/suggestion_provenance/records?perPage=50",
		token,
		"",
	)
	if strings.Contains(userListResponse.Body.String(), provenance.Id) {
		t.Fatalf("expected normal user provenance list to hide record, got %d: %s", userListResponse.Code, userListResponse.Body.String())
	}

	adminListResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/suggestion_provenance/records?perPage=50",
		adminToken,
		"",
	)
	if adminListResponse.Code != http.StatusOK || !strings.Contains(adminListResponse.Body.String(), provenance.Id) {
		t.Fatalf("expected admin to see provenance record, got %d: %s", adminListResponse.Code, adminListResponse.Body.String())
	}
}

func TestVisitCreateEndpointSkipsStaleSuggestionProvenanceWithoutFailingVisit(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	admin, _ := createAuthUser(t, server.app, true, true)
	user, token := createAuthUser(t, server.app, false, true)
	group := createCollectionRecord(t, server.app, "restaurant_groups", map[string]any{
		"name":      "Stale Group",
		"createdBy": admin.Id,
	})
	targetRestaurant := seedRestaurantRecord(t, server.app, user.Id, "Stale Target")
	targetRestaurant.Set("restaurantGroup", group.Id)
	if err := server.app.Save(targetRestaurant); err != nil {
		t.Fatalf("failed to assign target restaurant group: %v", err)
	}
	sourceRestaurant := seedRestaurantRecord(t, server.app, user.Id, "Stale Source")
	sourceRestaurant.Set("restaurantGroup", group.Id)
	if err := server.app.Save(sourceRestaurant); err != nil {
		t.Fatalf("failed to assign source restaurant group: %v", err)
	}
	sourceMenuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"restaurant":     sourceRestaurant.Id,
		"createdBy":      admin.Id,
		"name":           "Coconut Yogurt",
		"visibility":     "public",
		"approvalStatus": "approved",
		"groupSuitable":  false,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+targetRestaurant.Id+`",
			"restaurantName":"Stale Target",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"friends",
			"items":[
				{
					"name":"Coconut Yogurt",
					"rating":5,
					"suggestionSource":{
						"type":"groupMenuSuggestion",
						"sourceMenuItemId":"`+sourceMenuItem.Id+`",
						"sourceRestaurantId":"`+sourceRestaurant.Id+`",
						"restaurantGroupId":"`+group.Id+`",
						"normalizedItemName":"coconut yogurt"
					}
				}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected stale provenance to keep visit create successful, got %d: %s", response.Code, response.Body.String())
	}
	if count := countRecordsByFilter(t, server.app, "visits", "user = {:userId}", map[string]any{"userId": user.Id}); count != 1 {
		t.Fatalf("expected visit to be created despite stale provenance, got %d", count)
	}
	if count := countRecordsByFilter(t, server.app, "suggestion_provenance", "sourceMenuItem = {:sourceMenuItemId}", map[string]any{"sourceMenuItemId": sourceMenuItem.Id}); count != 0 {
		t.Fatalf("expected stale source provenance to be skipped, got %d", count)
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

func TestVisitCreateEndpointAllowsSourceListItemRestaurantFromAccessibleFriendBookmark(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, _ := createAuthUser(t, server.app, false, true)
	requester, token := createAuthUser(t, server.app, false, true)
	createFriendshipRecord(t, server.app, owner.Id, requester.Id, "accepted")

	restaurant := seedRestaurantRecord(t, server.app, owner.Id, "Hidden Friend Bistro")
	restaurant.Set("visibility", "private")
	if err := server.app.Save(restaurant); err != nil {
		t.Fatalf("failed to make restaurant private: %v", err)
	}
	visit := seedVisitRecord(t, server.app, restaurant.Id, owner.Id, "friends")
	foodItem := seedFoodItemRecord(t, server.app, visit.Id, owner.Id, "Magic Noodles", 4)
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Saved",
		"visibility": "private",
		"user":       requester.Id,
	})
	listItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    requester.Id,
		"sourceUser": owner.Id,
		"foodItem":   foodItem.Id,
		"position":   1,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Hidden Friend Bistro",
			"sourceListItemId":"`+listItem.Id+`",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"friends",
			"items":[
				{"name":"Magic Noodles","rating":5}
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
	if payload.RestaurantID != restaurant.Id {
		t.Fatalf("expected created visit to reuse restaurant %q, got %q", restaurant.Id, payload.RestaurantID)
	}

	reloadedVisit, err := server.app.FindRecordById("visits", payload.ID)
	if err != nil {
		t.Fatalf("failed to reload visit: %v", err)
	}
	if reloadedVisit.GetString("user") != requester.Id {
		t.Fatalf("expected created visit user=%q, got %q", requester.Id, reloadedVisit.GetString("user"))
	}
	if reloadedVisit.GetString("restaurant") != restaurant.Id {
		t.Fatalf("expected created visit restaurant=%q, got %q", restaurant.Id, reloadedVisit.GetString("restaurant"))
	}

	usageRecords := findRecommendationUsageRecords(t, server.app, "actor = {:actorId}", map[string]any{"actorId": requester.Id})
	if len(usageRecords) != 2 {
		t.Fatalf("expected tried and rated-after-try usage records, got %d", len(usageRecords))
	}
	kinds := map[string]*core.Record{}
	for _, usage := range usageRecords {
		kinds[usage.GetString("kind")] = usage
		if usage.GetString("sourceUser") != owner.Id {
			t.Fatalf("expected sourceUser=%q, got %q", owner.Id, usage.GetString("sourceUser"))
		}
		if usage.GetString("sourceFoodItem") != foodItem.Id {
			t.Fatalf("expected sourceFoodItem=%q, got %q", foodItem.Id, usage.GetString("sourceFoodItem"))
		}
		if usage.GetString("sourceRestaurantList") != list.Id {
			t.Fatalf("expected sourceRestaurantList=%q, got %q", list.Id, usage.GetString("sourceRestaurantList"))
		}
		if usage.GetString("sourceListItem") != listItem.Id {
			t.Fatalf("expected sourceListItem=%q, got %q", listItem.Id, usage.GetString("sourceListItem"))
		}
		if usage.GetString("targetVisit") != payload.ID {
			t.Fatalf("expected targetVisit=%q, got %q", payload.ID, usage.GetString("targetVisit"))
		}
	}
	if kinds["tried_recommendation"] == nil || kinds["rated_after_try"] == nil {
		t.Fatalf("expected tried and rated-after-try usage kinds, got %#v", kinds)
	}
	if kinds["rated_after_try"].GetString("targetVisitItem") != payload.Items[0].ID {
		t.Fatalf("expected rated-after-try targetVisitItem=%q, got %q", payload.Items[0].ID, kinds["rated_after_try"].GetString("targetVisitItem"))
	}
}

func TestVisitCreateEndpointRemovesSourceWantToTryRestaurantBookmark(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Bookmark Cafe")
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"visibility": "private",
		"user":       user.Id,
		"isDefault":  true,
	})
	listItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    user.Id,
		"position":   1,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Bookmark Cafe",
			"sourceListItemId":"`+listItem.Id+`",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"friends",
			"items":[
				{"name":"Latte","rating":5}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"list_items",
		"id = {:listItemId}",
		map[string]any{"listItemId": listItem.Id},
	); count != 0 {
		t.Fatalf("expected source Want to Try restaurant bookmark to be removed, got %d", count)
	}

	usageRecords := findRecommendationUsageRecords(t, server.app, "actor = {:actorId}", map[string]any{"actorId": user.Id})
	if len(usageRecords) != 1 {
		t.Fatalf("expected one restaurant-only tried usage record, got %d", len(usageRecords))
	}
	if usageRecords[0].GetString("kind") != "tried_recommendation" {
		t.Fatalf("expected tried usage kind, got %q", usageRecords[0].GetString("kind"))
	}
	if usageRecords[0].GetString("sourceFoodItem") != "" || usageRecords[0].GetString("sourceMenuItem") != "" {
		t.Fatalf("expected restaurant-only usage to omit item sources, got food=%q menu=%q", usageRecords[0].GetString("sourceFoodItem"), usageRecords[0].GetString("sourceMenuItem"))
	}
	if usageRecords[0].GetString("targetVisit") == "" {
		t.Fatal("expected restaurant-only tried usage to include targetVisit")
	}
}

func TestVisitCreateEndpointRemovesSourceWantToTryMenuItemBookmark(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Tea Room")
	menuItem := seedMenuItemRecord(t, server.app, restaurant.Id, user.Id, "Matcha Latte", "public", false)
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"visibility": "private",
		"user":       user.Id,
		"isDefault":  true,
	})
	listItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    user.Id,
		"menuItem":   menuItem.Id,
		"position":   1,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Tea Room",
			"sourceListItemId":"`+listItem.Id+`",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"friends",
			"items":[
				{"name":"Matcha Latte","rating":5,"menuItemId":"`+menuItem.Id+`"}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"list_items",
		"id = {:listItemId}",
		map[string]any{"listItemId": listItem.Id},
	); count != 0 {
		t.Fatalf("expected source Want to Try menu item bookmark to be removed, got %d", count)
	}

	usageRecords := findRecommendationUsageRecords(t, server.app, "actor = {:actorId}", map[string]any{"actorId": user.Id})
	if len(usageRecords) != 2 {
		t.Fatalf("expected tried and rated-after-try usage records, got %d", len(usageRecords))
	}
	kinds := map[string]*core.Record{}
	for _, usage := range usageRecords {
		kinds[usage.GetString("kind")] = usage
		if usage.GetString("sourceMenuItem") != menuItem.Id {
			t.Fatalf("expected sourceMenuItem=%q, got %q", menuItem.Id, usage.GetString("sourceMenuItem"))
		}
		if usage.GetString("targetVisit") == "" {
			t.Fatal("expected menu item usage to include targetVisit")
		}
	}
	if kinds["tried_recommendation"] == nil || kinds["rated_after_try"] == nil {
		t.Fatalf("expected tried and rated-after-try usage kinds, got %#v", kinds)
	}
	if kinds["rated_after_try"].GetString("targetVisitItem") == "" {
		t.Fatal("expected rated-after-try usage to include targetVisitItem")
	}
}

func TestVisitCreateEndpointReplaysSourceListItemCreateWithoutDuplicateItemsOrUsage(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Replay Cafe")
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"visibility": "private",
		"user":       user.Id,
		"isDefault":  true,
	})
	listItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    user.Id,
		"position":   1,
	})
	body := `{
		"restaurantId":"` + restaurant.Id + `",
		"restaurantName":"Replay Cafe",
		"sourceListItemId":"` + listItem.Id + `",
		"visitedAt":"2026-04-05T18:00:00Z",
		"visibility":"friends",
		"items":[
			{"name":"Latte","rating":5}
		]
	}`

	firstResponse := performJSONRequest(t, server.mux, http.MethodPost, "/api/visits", token, body)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first create 200, got %d: %s", firstResponse.Code, firstResponse.Body.String())
	}
	var firstPayload visitResponsePayload
	if err := json.Unmarshal(firstResponse.Body.Bytes(), &firstPayload); err != nil {
		t.Fatalf("failed to parse first visit payload: %v", err)
	}

	secondResponse := performJSONRequest(t, server.mux, http.MethodPost, "/api/visits", token, body)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected replay create 200, got %d: %s", secondResponse.Code, secondResponse.Body.String())
	}
	var secondPayload visitResponsePayload
	if err := json.Unmarshal(secondResponse.Body.Bytes(), &secondPayload); err != nil {
		t.Fatalf("failed to parse replay visit payload: %v", err)
	}
	if secondPayload.ID != firstPayload.ID {
		t.Fatalf("expected replay to return visit %q, got %q", firstPayload.ID, secondPayload.ID)
	}

	if count := countRecordsByFilter(t, server.app, "food_items", "visit = {:visitId}", map[string]any{"visitId": firstPayload.ID}); count != 1 {
		t.Fatalf("expected replay to avoid duplicate visit items, got %d", count)
	}
	usageRecords := findRecommendationUsageRecords(t, server.app, "actor = {:actorId}", map[string]any{"actorId": user.Id})
	if len(usageRecords) != 1 {
		t.Fatalf("expected replay to avoid duplicate usage records, got %d", len(usageRecords))
	}
}

func TestVisitCreateEndpointDoesNotReplayLiveSourceListItemCreate(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Live Saved Cafe")
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Saved",
		"visibility": "private",
		"user":       user.Id,
	})
	listItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    user.Id,
		"position":   1,
	})

	firstResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Live Saved Cafe",
			"sourceListItemId":"`+listItem.Id+`",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"friends",
			"items":[
				{"name":"Latte","rating":5}
			]
		}`,
	)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first create 200, got %d: %s", firstResponse.Code, firstResponse.Body.String())
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
			"restaurantName":"Live Saved Cafe",
			"sourceListItemId":"`+listItem.Id+`",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"private",
			"items":[
				{"name":"Tea","rating":4}
			]
		}`,
	)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected second create 200, got %d: %s", secondResponse.Code, secondResponse.Body.String())
	}
	var secondPayload visitResponsePayload
	if err := json.Unmarshal(secondResponse.Body.Bytes(), &secondPayload); err != nil {
		t.Fatalf("failed to parse second visit payload: %v", err)
	}
	if secondPayload.ID == firstPayload.ID {
		t.Fatalf("expected live source list item with different visibility to create a separate visit, got %q", secondPayload.ID)
	}
	if count := countRecordsByFilter(t, server.app, "visits", "user = {:userId}", map[string]any{"userId": user.Id}); count != 2 {
		t.Fatalf("expected two visits for live source list item writes, got %d", count)
	}
}

func TestVisitCreateEndpointDoesNotRateAfterTryUnmatchedMenuRecommendation(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Tea Room")
	menuItem := seedMenuItemRecord(t, server.app, restaurant.Id, user.Id, "Matcha Latte", "public", false)
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"visibility": "private",
		"user":       user.Id,
		"isDefault":  true,
	})
	listItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    user.Id,
		"menuItem":   menuItem.Id,
		"position":   1,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Tea Room",
			"sourceListItemId":"`+listItem.Id+`",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"friends",
			"items":[
				{"name":"Hojicha","rating":4}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	usageRecords := findRecommendationUsageRecords(t, server.app, "actor = {:actorId}", map[string]any{"actorId": user.Id})
	if len(usageRecords) != 1 {
		t.Fatalf("expected only tried usage for unmatched menu recommendation, got %d", len(usageRecords))
	}
	if usageRecords[0].GetString("kind") != "tried_recommendation" || usageRecords[0].GetString("targetVisitItem") != "" {
		t.Fatalf("expected visit-level tried usage only, got kind=%q targetVisitItem=%q", usageRecords[0].GetString("kind"), usageRecords[0].GetString("targetVisitItem"))
	}
}

func TestVisitCreateEndpointRatesAfterTryFromRecommendedItemsSource(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, _ := createAuthUser(t, server.app, false, true)
	requester, token := createAuthUser(t, server.app, false, true)
	createFriendshipRecord(t, server.app, owner.Id, requester.Id, "accepted")

	restaurant := seedRestaurantRecord(t, server.app, owner.Id, "Recommended Items Cafe")
	visit := seedVisitRecord(t, server.app, restaurant.Id, owner.Id, "friends")
	recommendedItem := seedFoodItemRecord(t, server.app, visit.Id, owner.Id, "Shared Pancake", 5)
	secondRecommendedItem := seedFoodItemRecord(t, server.app, visit.Id, owner.Id, "Shared Waffle", 4)
	duplicateNameRecommendedItem := seedFoodItemRecord(t, server.app, visit.Id, owner.Id, "Shared Pancake", 4)
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Saved",
		"visibility": "private",
		"user":       requester.Id,
	})
	listItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":             list.Id,
		"restaurant":       restaurant.Id,
		"addedBy":          requester.Id,
		"sourceUser":       owner.Id,
		"recommendedItems": []string{recommendedItem.Id, secondRecommendedItem.Id, duplicateNameRecommendedItem.Id},
		"position":         1,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Recommended Items Cafe",
			"sourceListItemId":"`+listItem.Id+`",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"friends",
			"items":[
				{"name":"Shared Pancake","rating":5},
				{"name":"Shared Waffle","rating":4}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	usageRecords := findRecommendationUsageRecords(t, server.app, "actor = {:actorId}", map[string]any{"actorId": requester.Id})
	if len(usageRecords) != 4 {
		t.Fatalf("expected tried and three rated-after-try usage records, got %d", len(usageRecords))
	}
	ratedSourceIDs := map[string]struct{}{}
	for _, usage := range usageRecords {
		if usage.GetString("kind") != "rated_after_try" {
			continue
		}
		if usage.GetString("targetVisitItem") == "" {
			t.Fatal("expected recommendedItems rated-after-try usage to include targetVisitItem")
		}
		ratedSourceIDs[usage.GetString("sourceFoodItem")] = struct{}{}
	}
	if _, exists := ratedSourceIDs[recommendedItem.Id]; !exists {
		t.Fatalf("expected rated sourceFoodItem %q, got %#v", recommendedItem.Id, ratedSourceIDs)
	}
	if _, exists := ratedSourceIDs[secondRecommendedItem.Id]; !exists {
		t.Fatalf("expected rated sourceFoodItem %q, got %#v", secondRecommendedItem.Id, ratedSourceIDs)
	}
	if _, exists := ratedSourceIDs[duplicateNameRecommendedItem.Id]; !exists {
		t.Fatalf("expected rated sourceFoodItem %q, got %#v", duplicateNameRecommendedItem.Id, ratedSourceIDs)
	}
}

func TestVisitCreateEndpointReturnsSelectedMenuItemIDForVisitItem(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureWriteHandlers(se, app)
		handlers.RegisterFeatureSummaryHandlers(se, app)
	})
	user, token := createAuthUser(t, server.app, false, true)
	friend, friendToken := createAuthUser(t, server.app, false, true)
	createFriendshipRecord(t, server.app, user.Id, friend.Id, "accepted")

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Tea Room")
	privateMenuItem := seedMenuItemRecord(t, server.app, restaurant.Id, user.Id, "Matcha Latte", "private", false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Tea Room",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"friends",
			"items":[
				{"name":"Matcha Latte","rating":5,"menuItemId":"`+privateMenuItem.Id+`"}
			]
		}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", createResponse.Code, createResponse.Body.String())
	}

	var createdPayload struct {
		Items []struct {
			MenuItemID         string `json:"menuItemId"`
			MenuItemVisibility string `json:"menuItemVisibility"`
			Name               string `json:"name"`
		} `json:"items"`
	}
	if err := json.Unmarshal(createResponse.Body.Bytes(), &createdPayload); err != nil {
		t.Fatalf("failed to parse create response JSON: %v; body=%s", err, createResponse.Body.String())
	}
	if len(createdPayload.Items) != 1 {
		t.Fatalf("expected one created visit item, got %#v", createdPayload.Items)
	}
	if createdPayload.Items[0].MenuItemID != privateMenuItem.Id {
		t.Fatalf("expected created visit item to retain selected menuItemId %q, got %#v", privateMenuItem.Id, createdPayload.Items[0])
	}
	if createdPayload.Items[0].MenuItemVisibility != "private" {
		t.Fatalf("expected created visit item to expose private menu item visibility, got %#v", createdPayload.Items[0])
	}

	privateMenuItem.Set("visibility", "friends")
	if err := server.app.Save(privateMenuItem); err != nil {
		t.Fatalf("failed to update menu item visibility: %v", err)
	}

	friendFeedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=10&scope=friends&typeFilter=visits",
		friendToken,
		"",
	)
	if friendFeedResponse.Code != http.StatusOK {
		t.Fatalf("expected friend feed 200, got %d: %s", friendFeedResponse.Code, friendFeedResponse.Body.String())
	}

	var friendFeedPayload struct {
		Items []struct {
			Visit *struct {
				Items []struct {
					MenuItemID         string `json:"menuItemId"`
					MenuItemVisibility string `json:"menuItemVisibility"`
					Name               string `json:"name"`
				} `json:"items"`
			} `json:"visit"`
		} `json:"items"`
	}
	if err := json.Unmarshal(friendFeedResponse.Body.Bytes(), &friendFeedPayload); err != nil {
		t.Fatalf("failed to parse friend feed JSON: %v; body=%s", err, friendFeedResponse.Body.String())
	}
	if len(friendFeedPayload.Items) != 1 || friendFeedPayload.Items[0].Visit == nil || len(friendFeedPayload.Items[0].Visit.Items) != 1 {
		t.Fatalf("expected friend feed visit with one item, got %#v", friendFeedPayload.Items)
	}
	if friendFeedPayload.Items[0].Visit.Items[0].MenuItemID != privateMenuItem.Id {
		t.Fatalf("expected friend feed item to retain selected menuItemId %q after visibility change, got %#v", privateMenuItem.Id, friendFeedPayload.Items[0].Visit.Items[0])
	}
	if friendFeedPayload.Items[0].Visit.Items[0].MenuItemVisibility != "friends" {
		t.Fatalf("expected friend feed item to expose friends menu item visibility after visibility change, got %#v", friendFeedPayload.Items[0].Visit.Items[0])
	}

	privateMenuItem.Set("visibility", "private")
	if err := server.app.Save(privateMenuItem); err != nil {
		t.Fatalf("failed to update menu item visibility back to private: %v", err)
	}

	friendFeedAfterPrivateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=10&scope=friends&typeFilter=visits",
		friendToken,
		"",
	)
	if friendFeedAfterPrivateResponse.Code != http.StatusOK {
		t.Fatalf("expected friend feed 200 after menu item privacy update, got %d: %s", friendFeedAfterPrivateResponse.Code, friendFeedAfterPrivateResponse.Body.String())
	}

	var friendFeedAfterPrivatePayload struct {
		Items []struct {
			Visit *struct {
				ID string `json:"id"`
			} `json:"visit"`
		} `json:"items"`
	}
	if err := json.Unmarshal(friendFeedAfterPrivateResponse.Body.Bytes(), &friendFeedAfterPrivatePayload); err != nil {
		t.Fatalf("failed to parse friend feed JSON after menu item privacy update: %v; body=%s", err, friendFeedAfterPrivateResponse.Body.String())
	}
	if len(friendFeedAfterPrivatePayload.Items) != 0 {
		t.Fatalf("expected friend feed to hide visit after selected menu item returns to private, got %#v", friendFeedAfterPrivatePayload.Items)
	}
}

func TestHomeFeedShowsVisitAfterPrivateVisitUpdatedToFriendsWithPublicMenuItem(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureWriteHandlers(se, app)
		handlers.RegisterFeatureSummaryHandlers(se, app)
	})
	user, token := createAuthUser(t, server.app, false, true)
	friend, friendToken := createAuthUser(t, server.app, false, true)
	createFriendshipRecord(t, server.app, user.Id, friend.Id, "accepted")

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Counter Cafe")
	publicMenuItem := seedMenuItemRecord(t, server.app, restaurant.Id, user.Id, "Pancakes", "public", false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Counter Cafe",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"private",
			"items":[
				{"name":"Pancakes","rating":4,"menuItemId":"`+publicMenuItem.Id+`"}
			]
		}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", createResponse.Code, createResponse.Body.String())
	}

	var createdPayload struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createResponse.Body.Bytes(), &createdPayload); err != nil {
		t.Fatalf("failed to parse create response JSON: %v; body=%s", err, createResponse.Body.String())
	}
	if createdPayload.ID == "" {
		t.Fatalf("expected created visit id, got %#v", createdPayload)
	}

	beforeUpdateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=10&scope=friends&typeFilter=visits",
		friendToken,
		"",
	)
	if beforeUpdateResponse.Code != http.StatusOK {
		t.Fatalf("expected friend feed 200 before update, got %d: %s", beforeUpdateResponse.Code, beforeUpdateResponse.Body.String())
	}

	var beforeUpdatePayload struct {
		Items []struct {
			Visit *struct {
				ID string `json:"id"`
			} `json:"visit"`
		} `json:"items"`
	}
	if err := json.Unmarshal(beforeUpdateResponse.Body.Bytes(), &beforeUpdatePayload); err != nil {
		t.Fatalf("failed to parse friend feed JSON before update: %v; body=%s", err, beforeUpdateResponse.Body.String())
	}
	if len(beforeUpdatePayload.Items) != 0 {
		t.Fatalf("expected private visit to be hidden from friend before update, got %#v", beforeUpdatePayload.Items)
	}

	updateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPut,
		"/api/visits/"+createdPayload.ID,
		token,
		`{"visibility":"friends"}`,
	)
	if updateResponse.Code != http.StatusOK {
		t.Fatalf("expected update 200, got %d: %s", updateResponse.Code, updateResponse.Body.String())
	}

	afterUpdateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=10&scope=friends&typeFilter=visits",
		friendToken,
		"",
	)
	if afterUpdateResponse.Code != http.StatusOK {
		t.Fatalf("expected friend feed 200 after update, got %d: %s", afterUpdateResponse.Code, afterUpdateResponse.Body.String())
	}

	var afterUpdatePayload struct {
		Items []struct {
			Visit *struct {
				ID    string `json:"id"`
				Items []struct {
					MenuItemID string `json:"menuItemId"`
					Name       string `json:"name"`
				} `json:"items"`
			} `json:"visit"`
		} `json:"items"`
	}
	if err := json.Unmarshal(afterUpdateResponse.Body.Bytes(), &afterUpdatePayload); err != nil {
		t.Fatalf("failed to parse friend feed JSON after update: %v; body=%s", err, afterUpdateResponse.Body.String())
	}
	if len(afterUpdatePayload.Items) != 1 || afterUpdatePayload.Items[0].Visit == nil {
		t.Fatalf("expected updated friends visit in friend feed, got %#v", afterUpdatePayload.Items)
	}
	if afterUpdatePayload.Items[0].Visit.ID != createdPayload.ID {
		t.Fatalf("expected friend feed visit id %q, got %#v", createdPayload.ID, afterUpdatePayload.Items[0].Visit)
	}
	if len(afterUpdatePayload.Items[0].Visit.Items) != 1 || afterUpdatePayload.Items[0].Visit.Items[0].MenuItemID != publicMenuItem.Id {
		t.Fatalf("expected public selected menu item in friend feed, got %#v", afterUpdatePayload.Items[0].Visit.Items)
	}
}

func TestHomeFeedOmitsFriendVisitWhenOnlySelectedMenuItemIsPrivate(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureWriteHandlers(se, app)
		handlers.RegisterFeatureSummaryHandlers(se, app)
	})
	user, token := createAuthUser(t, server.app, false, true)
	friend, friendToken := createAuthUser(t, server.app, false, true)
	createFriendshipRecord(t, server.app, user.Id, friend.Id, "accepted")

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Hidden Menu Cafe")
	privateMenuItem := seedMenuItemRecord(t, server.app, restaurant.Id, user.Id, "Secret Toast", "private", false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Hidden Menu Cafe",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"friends",
			"items":[
				{"name":"Secret Toast","rating":5,"menuItemId":"`+privateMenuItem.Id+`"}
			]
		}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", createResponse.Code, createResponse.Body.String())
	}

	var createdPayload struct {
		ID    string `json:"id"`
		Items []struct {
			MenuItemID         string `json:"menuItemId"`
			MenuItemVisibility string `json:"menuItemVisibility"`
			Name               string `json:"name"`
		} `json:"items"`
	}
	if err := json.Unmarshal(createResponse.Body.Bytes(), &createdPayload); err != nil {
		t.Fatalf("failed to parse create response JSON: %v; body=%s", err, createResponse.Body.String())
	}
	if createdPayload.ID == "" || len(createdPayload.Items) != 1 || createdPayload.Items[0].MenuItemID != privateMenuItem.Id {
		t.Fatalf("expected owner create response to retain private selected menu item, got %#v", createdPayload)
	}
	if createdPayload.Items[0].MenuItemVisibility != "private" {
		t.Fatalf("expected owner create response to expose private selected menu item visibility, got %#v", createdPayload.Items[0])
	}

	ownerFeedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=10&scope=mine&typeFilter=visits",
		token,
		"",
	)
	if ownerFeedResponse.Code != http.StatusOK {
		t.Fatalf("expected owner feed 200, got %d: %s", ownerFeedResponse.Code, ownerFeedResponse.Body.String())
	}

	var ownerFeedPayload struct {
		Items []struct {
			Visit *struct {
				ID    string `json:"id"`
				Items []struct {
					MenuItemID         string `json:"menuItemId"`
					MenuItemVisibility string `json:"menuItemVisibility"`
				} `json:"items"`
			} `json:"visit"`
		} `json:"items"`
	}
	if err := json.Unmarshal(ownerFeedResponse.Body.Bytes(), &ownerFeedPayload); err != nil {
		t.Fatalf("failed to parse owner feed JSON: %v; body=%s", err, ownerFeedResponse.Body.String())
	}
	if len(ownerFeedPayload.Items) != 1 || ownerFeedPayload.Items[0].Visit == nil || len(ownerFeedPayload.Items[0].Visit.Items) != 1 {
		t.Fatalf("expected owner feed to include private selected menu item, got %#v", ownerFeedPayload.Items)
	}
	if ownerFeedPayload.Items[0].Visit.Items[0].MenuItemVisibility != "private" {
		t.Fatalf("expected owner feed item to expose private selected menu item visibility, got %#v", ownerFeedPayload.Items[0].Visit.Items[0])
	}

	friendFeedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=10&scope=friends&typeFilter=visits",
		friendToken,
		"",
	)
	if friendFeedResponse.Code != http.StatusOK {
		t.Fatalf("expected friend feed 200, got %d: %s", friendFeedResponse.Code, friendFeedResponse.Body.String())
	}

	var friendFeedPayload struct {
		Items []struct {
			Visit *struct {
				ID string `json:"id"`
			} `json:"visit"`
		} `json:"items"`
	}
	if err := json.Unmarshal(friendFeedResponse.Body.Bytes(), &friendFeedPayload); err != nil {
		t.Fatalf("failed to parse friend feed JSON: %v; body=%s", err, friendFeedResponse.Body.String())
	}
	if len(friendFeedPayload.Items) != 0 {
		t.Fatalf("expected friend feed to hide visit with only a private selected menu item, got %#v", friendFeedPayload.Items)
	}

	friendVisitResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/visits/"+createdPayload.ID,
		friendToken,
		"",
	)
	if friendVisitResponse.Code != http.StatusNotFound {
		t.Fatalf("expected direct friend visit lookup to be hidden with 404, got %d: %s", friendVisitResponse.Code, friendVisitResponse.Body.String())
	}
}

func TestHomeFeedOmitsOnlyPrivateSelectedMenuItemsFromFriendVisit(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureWriteHandlers(se, app)
		handlers.RegisterFeatureSummaryHandlers(se, app)
	})
	user, token := createAuthUser(t, server.app, false, true)
	friend, friendToken := createAuthUser(t, server.app, false, true)
	createFriendshipRecord(t, server.app, user.Id, friend.Id, "accepted")

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Split Visibility Cafe")
	privateMenuItem := seedMenuItemRecord(t, server.app, restaurant.Id, user.Id, "Secret Toast", "private", false)
	visibleMenuItem := seedMenuItemRecord(t, server.app, restaurant.Id, user.Id, "Shared Toast", "friends", false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Split Visibility Cafe",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"friends",
			"items":[
				{"name":"Secret Toast","rating":5,"menuItemId":"`+privateMenuItem.Id+`"},
				{"name":"Shared Toast","rating":4,"menuItemId":"`+visibleMenuItem.Id+`"}
			]
		}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", createResponse.Code, createResponse.Body.String())
	}

	friendFeedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=10&scope=friends&typeFilter=visits",
		friendToken,
		"",
	)
	if friendFeedResponse.Code != http.StatusOK {
		t.Fatalf("expected friend feed 200, got %d: %s", friendFeedResponse.Code, friendFeedResponse.Body.String())
	}

	var friendFeedPayload struct {
		Items []struct {
			Visit *struct {
				Items []struct {
					MenuItemID         string `json:"menuItemId"`
					MenuItemVisibility string `json:"menuItemVisibility"`
					Name               string `json:"name"`
				} `json:"items"`
			} `json:"visit"`
		} `json:"items"`
	}
	if err := json.Unmarshal(friendFeedResponse.Body.Bytes(), &friendFeedPayload); err != nil {
		t.Fatalf("failed to parse friend feed JSON: %v; body=%s", err, friendFeedResponse.Body.String())
	}
	if len(friendFeedPayload.Items) != 1 || friendFeedPayload.Items[0].Visit == nil {
		t.Fatalf("expected friend feed to include visit with visible selected menu item, got %#v", friendFeedPayload.Items)
	}
	if len(friendFeedPayload.Items[0].Visit.Items) != 1 {
		t.Fatalf("expected friend feed to include only one visible visit item, got %#v", friendFeedPayload.Items[0].Visit.Items)
	}
	visibleItem := friendFeedPayload.Items[0].Visit.Items[0]
	if visibleItem.MenuItemID != visibleMenuItem.Id || visibleItem.MenuItemVisibility != "friends" || visibleItem.Name != "Shared Toast" {
		t.Fatalf("expected friend feed to include only the friends-visible menu item, got %#v", visibleItem)
	}
	if strings.Contains(friendFeedResponse.Body.String(), privateMenuItem.Id) || strings.Contains(friendFeedResponse.Body.String(), "Secret Toast") {
		t.Fatalf("expected friend feed response to omit private selected menu item, got %s", friendFeedResponse.Body.String())
	}
}

func TestVisitCreateEndpointRemovesMatchingWantToTryBookmarks(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Ramen Bar")
	targetMenuItem := seedMenuItemRecord(t, server.app, restaurant.Id, user.Id, "Tonkotsu", "public", false)
	otherMenuItem := seedMenuItemRecord(t, server.app, restaurant.Id, user.Id, "Karaage", "public", false)
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Want to Try",
		"visibility": "private",
		"user":       user.Id,
		"isDefault":  true,
	})
	restaurantBookmark := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    user.Id,
		"position":   1,
	})
	targetMenuBookmark := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    user.Id,
		"menuItem":   targetMenuItem.Id,
		"position":   2,
	})
	otherMenuBookmark := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    user.Id,
		"menuItem":   otherMenuItem.Id,
		"position":   3,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Ramen Bar",
			"visitedAt":"2026-04-05T18:00:00Z",
			"visibility":"friends",
			"items":[
				{"name":"Tonkotsu","rating":5,"menuItemId":"`+targetMenuItem.Id+`"}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	for _, removedID := range []string{restaurantBookmark.Id, targetMenuBookmark.Id} {
		if count := countRecordsByFilter(
			t,
			server.app,
			"list_items",
			"id = {:listItemId}",
			map[string]any{"listItemId": removedID},
		); count != 0 {
			t.Fatalf("expected Want to Try bookmark %s to be removed, got %d", removedID, count)
		}
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"list_items",
		"id = {:listItemId}",
		map[string]any{"listItemId": otherMenuBookmark.Id},
	); count != 1 {
		t.Fatalf("expected unrelated Want to Try menu item bookmark to remain, got %d", count)
	}
}

func TestVisitCreateEndpointRejectsSourceListItemFromAnotherUserList(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, _ := createAuthUser(t, server.app, false, true)
	requester, token := createAuthUser(t, server.app, false, true)
	otherUser, _ := createAuthUser(t, server.app, false, true)
	createFriendshipRecord(t, server.app, owner.Id, requester.Id, "accepted")

	restaurant := seedRestaurantRecord(t, server.app, owner.Id, "Other Saved Bistro")
	visit := seedVisitRecord(t, server.app, restaurant.Id, owner.Id, "friends")
	foodItem := seedFoodItemRecord(t, server.app, visit.Id, owner.Id, "Borrowed Dish", 4)
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Other Saved",
		"visibility": "private",
		"user":       otherUser.Id,
	})
	listItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    otherUser.Id,
		"sourceUser": owner.Id,
		"foodItem":   foodItem.Id,
		"position":   1,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Other Saved Bistro",
			"sourceListItemId":"`+listItem.Id+`",
			"items":[
				{"name":"Borrowed Dish","rating":5}
			]
		}`,
	)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", response.Code, response.Body.String())
	}
}

func TestVisitCreateEndpointRejectsSourceListItemRestaurantMismatch(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, _ := createAuthUser(t, server.app, false, true)
	requester, token := createAuthUser(t, server.app, false, true)
	createFriendshipRecord(t, server.app, owner.Id, requester.Id, "accepted")

	restaurantA := seedRestaurantRecord(t, server.app, owner.Id, "List Item Bistro")
	restaurantB := seedRestaurantRecord(t, server.app, requester.Id, "Wrong Bistro")
	visit := seedVisitRecord(t, server.app, restaurantA.Id, owner.Id, "friends")
	foodItem := seedFoodItemRecord(t, server.app, visit.Id, owner.Id, "Listed Dish", 4)
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Saved",
		"visibility": "private",
		"user":       requester.Id,
	})
	listItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurantA.Id,
		"addedBy":    requester.Id,
		"sourceUser": owner.Id,
		"foodItem":   foodItem.Id,
		"position":   1,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurantB.Id+`",
			"restaurantName":"Wrong Bistro",
			"sourceListItemId":"`+listItem.Id+`",
			"items":[
				{"name":"Listed Dish","rating":5}
			]
		}`,
	)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}
}

func TestVisitCreateEndpointRejectsSourceListItemWhenSourceFoodItemHidden(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, _ := createAuthUser(t, server.app, false, true)
	requester, token := createAuthUser(t, server.app, false, true)
	createFriendshipRecord(t, server.app, owner.Id, requester.Id, "accepted")

	restaurant := seedRestaurantRecord(t, server.app, owner.Id, "Private Visit Bistro")
	visit := seedVisitRecord(t, server.app, restaurant.Id, owner.Id, "private")
	foodItem := seedFoodItemRecord(t, server.app, visit.Id, owner.Id, "Hidden Dish", 4)
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Saved",
		"visibility": "private",
		"user":       requester.Id,
	})
	listItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    requester.Id,
		"sourceUser": owner.Id,
		"foodItem":   foodItem.Id,
		"position":   1,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visits",
		token,
		`{
			"restaurantId":"`+restaurant.Id+`",
			"restaurantName":"Private Visit Bistro",
			"sourceListItemId":"`+listItem.Id+`",
			"items":[
				{"name":"Hidden Dish","rating":5}
			]
		}`,
	)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", response.Code, response.Body.String())
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

func TestConvertVisitItemToFoodProductDeletesSingleItemSourceVisitAndCarriesFields(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Corner Market")
	visit := seedVisitRecord(t, server.app, restaurant.Id, user.Id, "private")
	item := seedFoodItemRecord(t, server.app, visit.Id, user.Id, "Bottled Tea", 4)
	item.Set("description", "Peach flavor")
	item.Set("notes", "Would buy again")
	if err := server.app.Save(item); err != nil {
		t.Fatalf("failed to update seeded item: %v", err)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visit-items/"+item.Id+"/convert-to-food-product",
		token,
		`{}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected convert to return 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		FoodProductID      string `json:"foodProductId"`
		SourceVisitID      string `json:"sourceVisitId"`
		DeletedSourceVisit bool   `json:"deletedSourceVisit"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse conversion payload: %v", err)
	}
	if payload.FoodProductID != item.Id {
		t.Fatalf("expected converted food product id %q, got %q", item.Id, payload.FoodProductID)
	}
	if payload.SourceVisitID != visit.Id {
		t.Fatalf("expected source visit id %q, got %q", visit.Id, payload.SourceVisitID)
	}
	if !payload.DeletedSourceVisit {
		t.Fatal("expected single-item source visit to be deleted")
	}

	reloadedItem, err := server.app.FindRecordById("food_items", item.Id)
	if err != nil {
		t.Fatalf("failed to reload converted item: %v", err)
	}
	if reloadedItem.GetString("itemType") != "food-product" {
		t.Fatalf("expected itemType food-product, got %q", reloadedItem.GetString("itemType"))
	}
	if reloadedItem.GetString("visit") != "" {
		t.Fatalf("expected visit relation to be cleared, got %q", reloadedItem.GetString("visit"))
	}
	if reloadedItem.GetString("location_text") != "Corner Market" {
		t.Fatalf("expected location_text to use restaurant name, got %q", reloadedItem.GetString("location_text"))
	}
	if reloadedItem.GetString("itemDate") != visit.GetString("visitDate") {
		t.Fatalf("expected itemDate %q, got %q", visit.GetString("visitDate"), reloadedItem.GetString("itemDate"))
	}
	if reloadedItem.GetString("visibility") != "private" {
		t.Fatalf("expected visibility private, got %q", reloadedItem.GetString("visibility"))
	}
	if reloadedItem.GetString("notes") != "Peach flavor\n\nWould buy again" {
		t.Fatalf("expected description and notes to be preserved, got %q", reloadedItem.GetString("notes"))
	}
	if _, err := server.app.FindRecordById("visits", visit.Id); err == nil {
		t.Fatal("expected source visit to be deleted")
	}
}

func TestConvertVisitItemToFoodProductKeepsMultiItemSourceVisitAndCarriesPhotos(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	user, token := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, user.Id, "Shared Cafe")
	visit := seedVisitRecord(t, server.app, restaurant.Id, user.Id, "friends")
	convertedItem := seedFoodItemRecord(t, server.app, visit.Id, user.Id, "Packaged Cookie", 5)
	retainedItem := seedFoodItemRecord(t, server.app, visit.Id, user.Id, "Latte", 3)
	photoID := insertVisitPhotoRowRaw(t, server.app, user.Id, visit.Id, convertedItem.Id)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visit-items/"+convertedItem.Id+"/convert-to-food-product",
		token,
		`{}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected convert to return 200, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		DeletedSourceVisit bool `json:"deletedSourceVisit"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse conversion payload: %v", err)
	}
	if payload.DeletedSourceVisit {
		t.Fatal("expected multi-item source visit to remain")
	}

	reloadedConvertedItem, err := server.app.FindRecordById("food_items", convertedItem.Id)
	if err != nil {
		t.Fatalf("failed to reload converted item: %v", err)
	}
	if reloadedConvertedItem.GetString("itemType") != "food-product" {
		t.Fatalf("expected converted itemType food-product, got %q", reloadedConvertedItem.GetString("itemType"))
	}
	if reloadedConvertedItem.GetString("visit") != "" {
		t.Fatalf("expected converted item visit to be cleared, got %q", reloadedConvertedItem.GetString("visit"))
	}

	reloadedRetainedItem, err := server.app.FindRecordById("food_items", retainedItem.Id)
	if err != nil {
		t.Fatalf("failed to reload retained item: %v", err)
	}
	if reloadedRetainedItem.GetString("itemType") != "visit-item" {
		t.Fatalf("expected retained itemType visit-item, got %q", reloadedRetainedItem.GetString("itemType"))
	}
	if reloadedRetainedItem.GetString("visit") != visit.Id {
		t.Fatalf("expected retained item to stay on visit %q, got %q", visit.Id, reloadedRetainedItem.GetString("visit"))
	}
	if _, err := server.app.FindRecordById("visits", visit.Id); err != nil {
		t.Fatalf("expected source visit to remain: %v", err)
	}

	reloadedPhoto, err := server.app.FindRecordById("visit_photos", photoID)
	if err != nil {
		t.Fatalf("failed to reload carried photo: %v", err)
	}
	if reloadedPhoto.GetString("food_item") != convertedItem.Id {
		t.Fatalf("expected photo food_item to stay %q, got %q", convertedItem.Id, reloadedPhoto.GetString("food_item"))
	}
	if reloadedPhoto.GetString("visit") != "" {
		t.Fatalf("expected photo visit to be cleared, got %q", reloadedPhoto.GetString("visit"))
	}
	if count := countRecordsByFilter(t, server.app, "visit_photos", "food_item = {:itemId}", map[string]any{"itemId": convertedItem.Id}); count != 1 {
		t.Fatalf("expected exactly 1 photo for converted item, got %d", count)
	}
}

func TestConvertVisitItemToFoodProductRejectsInvalidRequests(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	owner, ownerToken := createAuthUser(t, server.app, false, true)
	_, intruderToken := createAuthUser(t, server.app, false, true)

	restaurant := seedRestaurantRecord(t, server.app, owner.Id, "Owner Cafe")
	visit := seedVisitRecord(t, server.app, restaurant.Id, owner.Id, "friends")
	item := seedFoodItemRecord(t, server.app, visit.Id, owner.Id, "Soup", 4)
	foodProduct := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":     owner.Id,
		"name":     "Bagged Chips",
		"rating":   4,
		"itemType": "food-product",
	})

	forbiddenResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visit-items/"+item.Id+"/convert-to-food-product",
		intruderToken,
		`{}`,
	)
	if forbiddenResponse.Code != http.StatusForbidden {
		t.Fatalf("expected foreign item conversion to return 403, got %d: %s", forbiddenResponse.Code, forbiddenResponse.Body.String())
	}

	nonVisitItemResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visit-items/"+foodProduct.Id+"/convert-to-food-product",
		ownerToken,
		`{}`,
	)
	if nonVisitItemResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected food product conversion to return 400, got %d: %s", nonVisitItemResponse.Code, nonVisitItemResponse.Body.String())
	}

	missingResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visit-items/missing123/convert-to-food-product",
		ownerToken,
		`{}`,
	)
	if missingResponse.Code != http.StatusNotFound {
		t.Fatalf("expected missing item conversion to return 404, got %d: %s", missingResponse.Code, missingResponse.Body.String())
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

func TestBillCreateEndpointMakesUserParticipantsVisibleInBillSummary(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureWriteHandlers(se, app)
		handlers.RegisterFeatureSummaryHandlers(se, app)
	})
	leader, leaderToken := createAuthUser(t, server.app, false, true)
	friend, friendToken := createAuthUser(t, server.app, false, true)
	nonFriend, nonFriendToken := createAuthUser(t, server.app, false, true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/bills",
		leaderToken,
		`{
			"title":"Tasting Session Bill",
			"totalAmount":90,
			"tax":0,
			"tip":0,
			"fees":0,
			"extrasSplitMode":"equal",
			"participants":[
				{"id":"user:`+leader.Id+`","name":"Leader","userId":"`+leader.Id+`","amountOwed":30,"paidStatus":"paid"},
				{"id":"user:friendship_1","name":"Friend","userId":"`+friend.Id+`","amountOwed":30,"paidStatus":"pending"},
				{"id":"custom:tasting:participant_1","name":"Non Friend","userId":"`+nonFriend.Id+`","amountOwed":30,"paidStatus":"pending"}
			],
			"items":[
				{
					"id":"item_1",
					"itemName":"Shared meal",
					"price":90,
					"assignedToParticipantIds":["user:`+leader.Id+`","user:friendship_1","custom:tasting:participant_1"],
					"splitMode":"simple"
				}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var createdBill billResponsePayload
	if err := json.Unmarshal(response.Body.Bytes(), &createdBill); err != nil {
		t.Fatalf("failed to parse bill payload: %v", err)
	}

	assertBillSummaryContains := func(token string, userLabel string, expectedYouOwe float64) {
		t.Helper()

		summaryResponse := performJSONRequest(t, server.mux, http.MethodGet, "/api/bills/summary", token, "")
		if summaryResponse.Code != http.StatusOK {
			t.Fatalf("expected %s summary 200, got %d: %s", userLabel, summaryResponse.Code, summaryResponse.Body.String())
		}

		var summaries []struct {
			ID     string  `json:"id"`
			YouOwe float64 `json:"youOwe"`
		}
		if err := json.Unmarshal(summaryResponse.Body.Bytes(), &summaries); err != nil {
			t.Fatalf("failed to parse %s summary: %v; body=%s", userLabel, err, summaryResponse.Body.String())
		}

		for _, summary := range summaries {
			if summary.ID == createdBill.ID {
				if summary.YouOwe != expectedYouOwe {
					t.Fatalf("expected %s youOwe=%v, got %v", userLabel, expectedYouOwe, summary.YouOwe)
				}
				return
			}
		}

		t.Fatalf("expected %s summary to include created bill %s, got %#v", userLabel, createdBill.ID, summaries)
	}

	assertBillSummaryContains(leaderToken, "leader", 0)
	assertBillSummaryContains(friendToken, "friend", 30)
	assertBillSummaryContains(nonFriendToken, "non-friend", 30)
}

func TestBillUpdateEndpointMakesAddedUserParticipantVisibleInBillSummary(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureWriteHandlers(se, app)
		handlers.RegisterFeatureSummaryHandlers(se, app)
	})
	creator, creatorToken := createAuthUser(t, server.app, false, true)
	addedParticipant, addedParticipantToken := createAuthUser(t, server.app, false, true)

	bill := seedBillRecord(t, server.app, creator.Id, "Edited Dinner")
	creatorParticipant := seedBillParticipantRecord(t, server.app, bill.Id, creator.Id, creator.GetString("name"), 1, "paid")
	customParticipant := seedBillParticipantRecord(t, server.app, bill.Id, "", "Guest", 23, "pending")
	item := seedBillItemRecord(t, server.app, bill.Id, "Original Split", 24, []string{creatorParticipant.Id, customParticipant.Id}, "simple", nil)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPut,
		"/api/bills/"+bill.Id,
		creatorToken,
		`{
			"title":"Edited Dinner",
			"totalAmount":48,
			"tax":0,
			"tip":0,
			"fees":0,
			"extrasSplitMode":"equal",
			"participants":[
				{"id":"`+creatorParticipant.Id+`","name":"Creator","userId":"`+creator.Id+`","amountOwed":1,"paidStatus":"paid"},
				{"id":"`+customParticipant.Id+`","name":"Guest","amountOwed":23,"paidStatus":"pending"},
				{"id":"temp_added_participant","name":"Added Friend","userId":"`+addedParticipant.Id+`","amountOwed":24,"paidStatus":"pending"}
			],
			"items":[
				{
					"id":"`+item.Id+`",
					"itemName":"Updated Split",
					"price":48,
					"assignedToParticipantIds":["`+creatorParticipant.Id+`","`+customParticipant.Id+`","temp_added_participant"],
					"splitMode":"simple"
				}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	summaryResponse := performJSONRequest(t, server.mux, http.MethodGet, "/api/bills/summary", addedParticipantToken, "")
	if summaryResponse.Code != http.StatusOK {
		t.Fatalf("expected added participant summary 200, got %d: %s", summaryResponse.Code, summaryResponse.Body.String())
	}

	var summaries []struct {
		ID     string  `json:"id"`
		YouOwe float64 `json:"youOwe"`
	}
	if err := json.Unmarshal(summaryResponse.Body.Bytes(), &summaries); err != nil {
		t.Fatalf("failed to parse added participant summary: %v; body=%s", err, summaryResponse.Body.String())
	}

	for _, summary := range summaries {
		if summary.ID == bill.Id {
			if summary.YouOwe != 24 {
				t.Fatalf("expected added participant youOwe=24, got %v", summary.YouOwe)
			}
			return
		}
	}

	t.Fatalf("expected added participant summary to include edited bill %s, got %#v", bill.Id, summaries)
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
