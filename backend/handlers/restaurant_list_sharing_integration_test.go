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

func TestRestaurantListShareLinkLifecycleAndPublicProjection(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeatureSummaryHandlers(se, app)
		handlers.RegisterFeatureWriteHandlers(se, app)
		hooks.RegisterRestaurantListCountHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	owner.Set("name", "Share Owner")
	if err := server.app.Save(owner); err != nil {
		t.Fatalf("failed to save owner name: %v", err)
	}
	stranger, strangerToken := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Shared Ramen",
		"location":   "San Francisco, CA",
		"visibility": "public",
	})
	list := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":        "Weekend Recs",
		"description": "Use this when you visit.",
		"user":        owner.Id,
		"visibility":  "private",
	})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       owner.Id,
		"visitDate":  "2026-04-03 18:30:00.000Z",
		"visibility": "friends",
	})
	foodItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  visit.Id,
		"user":   owner.Id,
		"name":   "Spicy Miso",
		"rating": 5,
	})
	insertVisitPhotoRowRaw(t, server.app, owner.Id, visit.Id, foodItem.Id)
	sourceListItem := createCollectionRecord(t, server.app, "list_items", map[string]any{
		"list":       list.Id,
		"restaurant": restaurant.Id,
		"addedBy":    owner.Id,
		"sourceUser": owner.Id,
		"foodItem":   foodItem.Id,
		"position":   1,
		"note":       "Order this first",
	})

	shareResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/restaurant-lists/"+list.Id+"/share-link",
		ownerToken,
		"",
	)
	if shareResponse.Code != http.StatusOK {
		t.Fatalf("expected share response 200, got %d: %s", shareResponse.Code, shareResponse.Body.String())
	}

	var sharePayload struct {
		ListID     string `json:"listId"`
		ShareToken string `json:"shareToken"`
		Path       string `json:"path"`
	}
	if err := json.Unmarshal(shareResponse.Body.Bytes(), &sharePayload); err != nil {
		t.Fatalf("failed to parse share payload: %v", err)
	}
	if sharePayload.ListID != list.Id || sharePayload.ShareToken == "" || sharePayload.Path != "/lists/shared/"+sharePayload.ShareToken {
		t.Fatalf("unexpected share payload: %#v", sharePayload)
	}

	secondShareResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/restaurant-lists/"+list.Id+"/share-link",
		ownerToken,
		"",
	)
	if secondShareResponse.Code != http.StatusOK {
		t.Fatalf("expected idempotent share response 200, got %d: %s", secondShareResponse.Code, secondShareResponse.Body.String())
	}
	var secondSharePayload struct {
		ShareToken string `json:"shareToken"`
	}
	if err := json.Unmarshal(secondShareResponse.Body.Bytes(), &secondSharePayload); err != nil {
		t.Fatalf("failed to parse second share payload: %v", err)
	}
	if secondSharePayload.ShareToken != sharePayload.ShareToken {
		t.Fatalf("expected idempotent token %q, got %q", sharePayload.ShareToken, secondSharePayload.ShareToken)
	}

	strangerResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/restaurant-lists/"+list.Id+"/share-link",
		strangerToken,
		"",
	)
	if strangerResponse.Code == http.StatusOK {
		t.Fatalf("expected stranger share creation to fail, got %d: %s", strangerResponse.Code, strangerResponse.Body.String())
	}

	publicResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/public/restaurant-lists/"+sharePayload.ShareToken,
		"",
		"",
	)
	if publicResponse.Code != http.StatusOK {
		t.Fatalf("expected public response 200, got %d: %s", publicResponse.Code, publicResponse.Body.String())
	}
	if publicResponse.Header().Get("X-Robots-Tag") == "" {
		t.Fatal("expected noindex header on shared list response")
	}

	var publicPayload struct {
		List struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			OwnerName string `json:"ownerName"`
			UserID    string `json:"userId"`
		} `json:"list"`
		Items []struct {
			RestaurantName  string `json:"restaurantName"`
			SourceUserID    string `json:"sourceUserId"`
			SourceUserName  string `json:"sourceUserName"`
			BookmarkedItems []struct {
				Name           string  `json:"name"`
				Rating         float64 `json:"rating"`
				SourceUserID   string  `json:"sourceUserId"`
				SourceUserName string  `json:"sourceUserName"`
			} `json:"bookmarkedItems"`
		} `json:"items"`
		Page          int  `json:"page"`
		PageSize      int  `json:"pageSize"`
		TotalItems    int  `json:"totalItems"`
		TotalPages    int  `json:"totalPages"`
		HasNextPage   bool `json:"hasNextPage"`
		PhotoPreviews []struct {
			FoodItemID string `json:"food_item"`
			OwnerName  string `json:"ownerName"`
			UserID     string `json:"user"`
			Photo      string `json:"photo"`
		} `json:"photoPreviews"`
		BookmarkState map[string]any `json:"bookmarkState"`
	}
	if err := json.Unmarshal(publicResponse.Body.Bytes(), &publicPayload); err != nil {
		t.Fatalf("failed to parse public payload: %v; body=%s", err, publicResponse.Body.String())
	}
	if publicPayload.List.ID != list.Id || publicPayload.List.Name != "Weekend Recs" || publicPayload.List.OwnerName != "Share Owner" {
		t.Fatalf("unexpected public list payload: %#v", publicPayload.List)
	}
	if publicPayload.List.UserID != "" {
		t.Fatalf("public list payload leaked user id: %#v", publicPayload.List)
	}
	if len(publicPayload.Items) != 1 || publicPayload.Items[0].RestaurantName != "Shared Ramen" {
		t.Fatalf("unexpected public items: %#v", publicPayload.Items)
	}
	if publicPayload.Page != 1 || publicPayload.PageSize != 20 || publicPayload.TotalItems != 1 || publicPayload.TotalPages != 1 || publicPayload.HasNextPage {
		t.Fatalf("unexpected public pagination metadata: %#v", publicPayload)
	}
	if publicPayload.Items[0].SourceUserID != "" || publicPayload.Items[0].SourceUserName != "" {
		t.Fatalf("public item leaked source user identity: %#v", publicPayload.Items[0])
	}
	if len(publicPayload.Items[0].BookmarkedItems) != 1 || publicPayload.Items[0].BookmarkedItems[0].Name != "Spicy Miso" || publicPayload.Items[0].BookmarkedItems[0].Rating != 5 {
		t.Fatalf("unexpected public bookmarked item: %#v", publicPayload.Items[0].BookmarkedItems)
	}
	if publicPayload.Items[0].BookmarkedItems[0].SourceUserID != "" || publicPayload.Items[0].BookmarkedItems[0].SourceUserName != "" {
		t.Fatalf("public bookmark leaked source user identity: %#v", publicPayload.Items[0].BookmarkedItems[0])
	}
	if len(publicPayload.PhotoPreviews) != 1 || publicPayload.PhotoPreviews[0].FoodItemID != foodItem.Id || publicPayload.PhotoPreviews[0].Photo != "test-photo.jpg" {
		t.Fatalf("unexpected public photo previews: %#v", publicPayload.PhotoPreviews)
	}
	if publicPayload.PhotoPreviews[0].OwnerName != "" || publicPayload.PhotoPreviews[0].UserID != "" {
		t.Fatalf("public photo leaked owner identity: %#v", publicPayload.PhotoPreviews[0])
	}
	if publicPayload.BookmarkState != nil {
		t.Fatalf("public payload leaked bookmark state: %#v", publicPayload.BookmarkState)
	}

	targetList := createCollectionRecord(t, server.app, "restaurant_lists", map[string]any{
		"name":       "Try Next",
		"user":       stranger.Id,
		"visibility": "private",
	})
	authenticatedSharedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/public/restaurant-lists/"+sharePayload.ShareToken,
		strangerToken,
		"",
	)
	if authenticatedSharedResponse.Code != http.StatusOK {
		t.Fatalf("expected authenticated shared response 200, got %d: %s", authenticatedSharedResponse.Code, authenticatedSharedResponse.Body.String())
	}
	var authenticatedPayload struct {
		BookmarkState struct {
			SavedListIDsByBookmarkLookupID map[string][]string `json:"savedListIdsByBookmarkLookupId"`
		} `json:"bookmarkState"`
		ViewerLists []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"viewerLists"`
	}
	if err := json.Unmarshal(authenticatedSharedResponse.Body.Bytes(), &authenticatedPayload); err != nil {
		t.Fatalf("failed to parse authenticated shared payload: %v; body=%s", err, authenticatedSharedResponse.Body.String())
	}
	if authenticatedPayload.BookmarkState.SavedListIDsByBookmarkLookupID == nil {
		t.Fatalf("expected authenticated payload to include bookmark state")
	}
	if len(authenticatedPayload.ViewerLists) != 1 || authenticatedPayload.ViewerLists[0].ID != targetList.Id {
		t.Fatalf("expected authenticated payload to include viewer lists, got %#v", authenticatedPayload.ViewerLists)
	}

	targetSaveResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/public/restaurant-lists/"+sharePayload.ShareToken+"/bookmarks",
		strangerToken,
		fmt.Sprintf(
			`{"restaurantId":"%s","foodItemId":"%s","sourceListItemId":"%s","targetListIds":["%s"]}`,
			restaurant.Id,
			foodItem.Id,
			sourceListItem.Id,
			targetList.Id,
		),
	)
	if targetSaveResponse.Code != http.StatusOK {
		t.Fatalf("expected signed-in viewer to save shared recommendation to target list, got %d: %s", targetSaveResponse.Code, targetSaveResponse.Body.String())
	}
	if count := countRecordsByFilter(
		t,
		server.app,
		"list_items",
		"list = {:listId} && addedBy = {:userId} && foodItem = {:foodItemId}",
		map[string]any{"listId": targetList.Id, "userId": stranger.Id, "foodItemId": foodItem.Id},
	); count != 1 {
		t.Fatalf("expected shared save to create one targeted recommendation, got %d", count)
	}
	repeatedTargetSaveResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/public/restaurant-lists/"+sharePayload.ShareToken+"/bookmarks",
		strangerToken,
		fmt.Sprintf(
			`{"restaurantId":"%s","foodItemId":"%s","sourceListItemId":"%s","targetListIds":["%s"]}`,
			restaurant.Id,
			foodItem.Id,
			sourceListItem.Id,
			targetList.Id,
		),
	)
	if repeatedTargetSaveResponse.Code != http.StatusOK {
		t.Fatalf("expected duplicate shared save to target list to stay idempotent, got %d: %s", repeatedTargetSaveResponse.Code, repeatedTargetSaveResponse.Body.String())
	}
	if count := countRecordsByFilter(
		t,
		server.app,
		"list_items",
		"list = {:listId} && addedBy = {:userId} && foodItem = {:foodItemId}",
		map[string]any{"listId": targetList.Id, "userId": stranger.Id, "foodItemId": foodItem.Id},
	); count != 1 {
		t.Fatalf("expected duplicate shared save to preserve one targeted recommendation, got %d", count)
	}
	targetUsageRecords := findRecommendationUsageRecords(
		t,
		server.app,
		"actor = {:actorId} && targetRestaurantList = {:targetListId}",
		map[string]any{"actorId": stranger.Id, "targetListId": targetList.Id},
	)
	if len(targetUsageRecords) != 1 {
		t.Fatalf("expected one targeted recommendation usage record after duplicate save, got %d", len(targetUsageRecords))
	}
	if targetUsageRecords[0].GetString("sourceFoodItem") != foodItem.Id {
		t.Fatalf("expected sourceFoodItem=%q, got %q", foodItem.Id, targetUsageRecords[0].GetString("sourceFoodItem"))
	}
	if targetUsageRecords[0].GetString("sourceRestaurantList") != list.Id {
		t.Fatalf("expected sourceRestaurantList=%q, got %q", list.Id, targetUsageRecords[0].GetString("sourceRestaurantList"))
	}
	if targetUsageRecords[0].GetString("sourceListItem") != sourceListItem.Id {
		t.Fatalf("expected sourceListItem=%q, got %q", sourceListItem.Id, targetUsageRecords[0].GetString("sourceListItem"))
	}

	saveResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/public/restaurant-lists/"+sharePayload.ShareToken+"/bookmarks",
		strangerToken,
		fmt.Sprintf(
			`{"restaurantId":"%s","foodItemId":"%s","sourceListItemId":"%s"}`,
			restaurant.Id,
			foodItem.Id,
			sourceListItem.Id,
		),
	)
	if saveResponse.Code != http.StatusOK {
		t.Fatalf("expected signed-in viewer to save shared recommendation, got %d: %s", saveResponse.Code, saveResponse.Body.String())
	}
	if count := countRecordsByFilter(
		t,
		server.app,
		"restaurant_lists",
		"user = {:userId} && isDefault = true",
		map[string]any{"userId": stranger.Id},
	); count != 1 {
		t.Fatalf("expected shared save to create one default list, got %d", count)
	}
	if count := countRecordsByFilter(
		t,
		server.app,
		"list_items",
		"addedBy = {:userId} && foodItem = {:foodItemId}",
		map[string]any{"userId": stranger.Id, "foodItemId": foodItem.Id},
	); count != 2 {
		t.Fatalf("expected shared save to create two saved recommendations, got %d", count)
	}
	usageRecords := findRecommendationUsageRecords(
		t,
		server.app,
		"actor = {:actorId} && action = 'saved'",
		map[string]any{"actorId": stranger.Id},
	)
	if len(usageRecords) != 2 {
		t.Fatalf("expected shared saves to record two durable usage rows, got %d", len(usageRecords))
	}
	for _, usage := range usageRecords {
		if usage.GetString("sourceUser") != owner.Id {
			t.Fatalf("expected sourceUser=%q, got %q", owner.Id, usage.GetString("sourceUser"))
		}
		if usage.GetString("sourceFoodItem") != foodItem.Id {
			t.Fatalf("expected sourceFoodItem=%q, got %q", foodItem.Id, usage.GetString("sourceFoodItem"))
		}
		if usage.GetString("sourceRestaurantList") != list.Id {
			t.Fatalf("expected sourceRestaurantList=%q, got %q", list.Id, usage.GetString("sourceRestaurantList"))
		}
		if usage.GetString("sourceListItem") != sourceListItem.Id {
			t.Fatalf("expected sourceListItem=%q, got %q", sourceListItem.Id, usage.GetString("sourceListItem"))
		}
	}

	regenerateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/share-link/regenerate", list.Id),
		ownerToken,
		"",
	)
	if regenerateResponse.Code != http.StatusOK {
		t.Fatalf("expected regenerate response 200, got %d: %s", regenerateResponse.Code, regenerateResponse.Body.String())
	}
	var regeneratePayload struct {
		ShareToken string `json:"shareToken"`
	}
	if err := json.Unmarshal(regenerateResponse.Body.Bytes(), &regeneratePayload); err != nil {
		t.Fatalf("failed to parse regenerate payload: %v", err)
	}
	if regeneratePayload.ShareToken == "" || regeneratePayload.ShareToken == sharePayload.ShareToken {
		t.Fatalf("expected regenerate to rotate token, got %#v", regeneratePayload)
	}

	oldTokenResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/public/restaurant-lists/"+sharePayload.ShareToken,
		"",
		"",
	)
	if oldTokenResponse.Code == http.StatusOK {
		t.Fatalf("expected old token to be invalidated, got %d: %s", oldTokenResponse.Code, oldTokenResponse.Body.String())
	}

	disableResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		fmt.Sprintf("/api/restaurant-lists/%s/share-link/disable", list.Id),
		ownerToken,
		"",
	)
	if disableResponse.Code != http.StatusOK {
		t.Fatalf("expected disable response 200, got %d: %s", disableResponse.Code, disableResponse.Body.String())
	}

	disabledResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/public/restaurant-lists/"+regeneratePayload.ShareToken,
		"",
		"",
	)
	if disabledResponse.Code == http.StatusOK {
		t.Fatalf("expected disabled token to be unavailable, got %d: %s", disabledResponse.Code, disabledResponse.Body.String())
	}
}
