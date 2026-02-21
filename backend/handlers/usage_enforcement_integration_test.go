package handlers_test

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/lib"
)

func TestPlacesEndpointsBlockFreeUsersAtMonthlyLimit(t *testing.T) {
	t.Setenv("GOOGLE_PLACES_API_KEY", "test-key")

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterPlacesHandlers(se, app)
	})
	user, token := createAuthUser(t, server.app, false, false)

	seedMonthlyUsage(t, server.app, user.Id, 0, 100, 0)

	searchResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/places/search",
		token,
		`{"query":"pizza","location":"","radius":5000}`,
	)
	if searchResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 from /api/places/search, got %d, body=%s", searchResponse.Code, searchResponse.Body.String())
	}
	searchData := parseJSONMap(t, searchResponse.Body.Bytes())
	if searchData["metric"] != "places_queries" {
		t.Fatalf("expected places_queries metric, got %v", searchData["metric"])
	}

	nearbyResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/places/nearby",
		token,
		`{"latitude":37.7749,"longitude":-122.4194,"radius":1500}`,
	)
	if nearbyResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 from /api/places/nearby, got %d, body=%s", nearbyResponse.Code, nearbyResponse.Body.String())
	}
	nearbyData := parseJSONMap(t, nearbyResponse.Body.Bytes())
	if nearbyData["metric"] != "places_queries" {
		t.Fatalf("expected places_queries metric, got %v", nearbyData["metric"])
	}
}

func TestParseMenuConsumesAndEnforcesMonthlyLimit(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "")

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterMenuParsingHandlers(se, app)
	})

	freeUser, freeToken := createAuthUser(t, server.app, false, false)
	seedMonthlyUsage(t, server.app, freeUser.Id, 0, 0, 4)

	firstResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/parse-menu",
		freeToken,
		"",
	)
	if firstResponse.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 (missing GEMINI key), got %d, body=%s", firstResponse.Code, firstResponse.Body.String())
	}

	snapshotAfterFirst, err := lib.GetMonthlyUsageSnapshot(server.app, freeUser)
	if err != nil {
		t.Fatalf("failed to load usage snapshot: %v", err)
	}
	if snapshotAfterFirst.Usage.MenuScans != 5 {
		t.Fatalf("expected menu_scans usage=5 after first attempt, got %d", snapshotAfterFirst.Usage.MenuScans)
	}

	secondResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/parse-menu",
		freeToken,
		"",
	)
	if secondResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after free user reached limit, got %d, body=%s", secondResponse.Code, secondResponse.Body.String())
	}

	subscriberUser, subscriberToken := createAuthUser(t, server.app, false, true)
	seedMonthlyUsage(t, server.app, subscriberUser.Id, 0, 0, 100)
	subscriberResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/parse-menu",
		subscriberToken,
		"",
	)
	if subscriberResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 for subscriber at 100 limit, got %d, body=%s", subscriberResponse.Code, subscriberResponse.Body.String())
	}

	adminUser, adminToken := createAuthUser(t, server.app, true, true)
	seedMonthlyUsage(t, server.app, adminUser.Id, 0, 0, 1000)
	adminResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/parse-menu",
		adminToken,
		"",
	)
	if adminResponse.Code == http.StatusTooManyRequests {
		t.Fatalf("expected admin not to be rate-limited, body=%s", adminResponse.Body.String())
	}
}
