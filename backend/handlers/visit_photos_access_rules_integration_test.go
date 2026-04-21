package handlers_test

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestVisitPhotosCollectionViewRuleFollowsLinkedContentVisibility(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	friend, friendToken := createAuthUser(t, server.app, false, false)
	_, strangerToken := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, owner.Id, friend.Id, "accepted")

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Visible Photos",
		"location":   "San Francisco, CA",
		"visibility": "public",
	})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       owner.Id,
		"visitDate":  "2026-04-03 18:30:00.000Z",
		"visibility": "friends",
	})
	visitItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  visit.Id,
		"user":   owner.Id,
		"name":   "Spicy Ramen",
		"rating": 5,
	})
	quickTrack := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":       owner.Id,
		"name":       "Sesame Donut",
		"itemType":   "food-product",
		"visibility": "friends",
		"itemDate":   "2026-04-02 19:15:00.000Z",
		"rating":     4,
	})

	visitPhotoID := insertVisitPhotoRowRaw(t, server.app, owner.Id, visit.Id, visitItem.Id)
	quickTrackPhotoID := insertVisitPhotoRowRaw(t, server.app, owner.Id, "", quickTrack.Id)

	for _, path := range []string{
		"/api/collections/visit_photos/records/" + visitPhotoID,
		"/api/collections/visit_photos/records/" + quickTrackPhotoID,
	} {
		friendResponse := performJSONRequest(t, server.mux, http.MethodGet, path, friendToken, "")
		if friendResponse.Code != http.StatusOK {
			t.Fatalf("expected accepted friend to access %s, got %d: %s", path, friendResponse.Code, friendResponse.Body.String())
		}

		strangerResponse := performJSONRequest(t, server.mux, http.MethodGet, path, strangerToken, "")
		if strangerResponse.Code != http.StatusNotFound {
			t.Fatalf("expected stranger to be denied %s, got %d: %s", path, strangerResponse.Code, strangerResponse.Body.String())
		}

		ownerResponse := performJSONRequest(t, server.mux, http.MethodGet, path, ownerToken, "")
		if ownerResponse.Code != http.StatusOK {
			t.Fatalf("expected owner to access %s, got %d: %s", path, ownerResponse.Code, ownerResponse.Body.String())
		}
	}
}
