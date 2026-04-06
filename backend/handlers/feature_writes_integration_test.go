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
	ID             string `json:"id"`
	RestaurantName string `json:"restaurantName"`
	Visibility     string `json:"visibility"`
	Items          []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"items"`
}

type billResponsePayload struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Status       string `json:"status"`
	Participants []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
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
	if count := countRestaurantsByName(t, server.app, "Noodle House"); count != 1 {
		t.Fatalf("expected 1 restaurant, got %d", count)
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
