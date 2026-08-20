package handlers_test

import (
	"encoding/base64"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/lib"
)

const onePixelJPEGBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEBAVFRUVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGhAQGi0fHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAbAAABBQEBAAAAAAAAAAAAAAAFAAIDBAYBB//EADQQAAIBAwMCBAQEBgMAAAAAAAECAwAEEQUSITFBEyJRYXGBkQYyobHB0fAjQlJicuHw/8QAGQEBAAMBAQAAAAAAAAAAAAAAAAECBAMF/8QAIhEBAQACAgICAgMAAAAAAAAAAAECEQMhEjEEE0FRImFx/9oADAMBAAIRAxEAPwD3qIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgP/Z"

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

	geocodeResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/places/geocode",
		token,
		`{"location":"San Francisco, CA"}`,
	)
	if geocodeResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 from /api/places/geocode, got %d, body=%s", geocodeResponse.Code, geocodeResponse.Body.String())
	}
	geocodeData := parseJSONMap(t, geocodeResponse.Body.Bytes())
	if geocodeData["metric"] != "places_queries" {
		t.Fatalf("expected places_queries metric, got %v", geocodeData["metric"])
	}
}

func TestMenuScanEndpointsDoNotConsumeUsageForInvalidUploads(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "test-key")

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterMenuParsingHandlers(se, app)
	})

	for _, tc := range []struct {
		name                  string
		path                  string
		initialMenuScans      int
		initialStorefrontRead int
	}{
		{name: "parse menu", path: "/api/parse-menu", initialMenuScans: 4},
		{name: "find restaurant name", path: "/api/find-restaurant-name", initialStorefrontRead: 4},
	} {
		t.Run(tc.name, func(t *testing.T) {
			user, token := createAuthUser(t, server.app, false, false)
			seedMonthlyUsageWithStorefrontAndHEIC(t, server.app, user.Id, 0, 0, tc.initialMenuScans, tc.initialStorefrontRead, 0)

			response := performMultipartRequest(
				t,
				server.mux,
				http.MethodPost,
				tc.path,
				token,
				"image",
				"upload.jpg",
				[]byte("not actually an image"),
			)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 from %s, got %d, body=%s", tc.path, response.Code, response.Body.String())
			}

			snapshot, err := lib.GetMonthlyUsageSnapshot(server.app, user)
			if err != nil {
				t.Fatalf("failed to load usage snapshot: %v", err)
			}
			if snapshot.Usage.MenuScans != tc.initialMenuScans {
				t.Fatalf("expected menu_scans usage to stay at %d after invalid upload, got %d", tc.initialMenuScans, snapshot.Usage.MenuScans)
			}
			if snapshot.Usage.StorefrontReads != tc.initialStorefrontRead {
				t.Fatalf("expected storefront_reads usage to stay at %d after invalid upload, got %d", tc.initialStorefrontRead, snapshot.Usage.StorefrontReads)
			}
		})
	}
}

func TestParseMenuBlocksUsersAtMonthlyLimitAfterValidation(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "test-key")

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterMenuParsingHandlers(se, app)
	})

	jpegData := decodeUsageFixture(t, onePixelJPEGBase64)

	freeUser, freeToken := createAuthUser(t, server.app, false, false)
	seedMonthlyUsage(t, server.app, freeUser.Id, 0, 0, 25)

	freeResponse := performMultipartRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/parse-menu",
		freeToken,
		"image",
		"menu.jpg",
		jpegData,
	)
	if freeResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 from /api/parse-menu for free user, got %d, body=%s", freeResponse.Code, freeResponse.Body.String())
	}
	freeData := parseJSONMap(t, freeResponse.Body.Bytes())
	if freeData["metric"] != "menu_scans" {
		t.Fatalf("expected menu_scans metric, got %v", freeData["metric"])
	}

	subscriberUser, subscriberToken := createAuthUser(t, server.app, false, true)
	seedMonthlyUsage(t, server.app, subscriberUser.Id, 0, 0, 100)

	subscriberResponse := performMultipartRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/parse-menu",
		subscriberToken,
		"image",
		"menu.jpg",
		jpegData,
	)
	if subscriberResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 from /api/parse-menu for subscriber at limit, got %d, body=%s", subscriberResponse.Code, subscriberResponse.Body.String())
	}
	subscriberData := parseJSONMap(t, subscriberResponse.Body.Bytes())
	if subscriberData["metric"] != "menu_scans" {
		t.Fatalf("expected menu_scans metric, got %v", subscriberData["metric"])
	}

	t.Setenv("GEMINI_API_KEY", "")
	adminUser, adminToken := createAuthUser(t, server.app, true, true)
	seedMonthlyUsage(t, server.app, adminUser.Id, 0, 0, 1000)

	adminResponse := performMultipartRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/parse-menu",
		adminToken,
		"image",
		"menu.jpg",
		jpegData,
	)
	if adminResponse.Code == http.StatusTooManyRequests {
		t.Fatalf("expected admin not to be rate-limited, body=%s", adminResponse.Body.String())
	}
}

func TestFindRestaurantNameBlocksFreeUsersAtMonthlyLimit(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "test-key")

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterMenuParsingHandlers(se, app)
	})

	jpegData := decodeUsageFixture(t, onePixelJPEGBase64)
	freeUser, freeToken := createAuthUser(t, server.app, false, false)
	seedMonthlyUsageWithStorefrontAndHEIC(t, server.app, freeUser.Id, 0, 0, 0, 25, 0)

	response := performMultipartRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/find-restaurant-name",
		freeToken,
		"image",
		"restaurant.jpg",
		jpegData,
	)
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 from /api/find-restaurant-name, got %d, body=%s", response.Code, response.Body.String())
	}

	data := parseJSONMap(t, response.Body.Bytes())
	if data["metric"] != "storefront_reads" {
		t.Fatalf("expected storefront_reads metric, got %v", data["metric"])
	}
}

func TestConvertHEICBlocksFreeUsersAtMonthlyLimit(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterMenuParsingHandlers(se, app)
	})

	freeUser, freeToken := createAuthUser(t, server.app, false, false)
	seedMonthlyUsageWithHEIC(t, server.app, freeUser.Id, 0, 0, 0, 100)

	response := performMultipartRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/convert-heic",
		freeToken,
		"image",
		"upload.heic",
		[]byte("\x00\x00\x00\x18ftypheic"),
	)
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 from /api/convert-heic, got %d, body=%s", response.Code, response.Body.String())
	}

	data := parseJSONMap(t, response.Body.Bytes())
	if data["metric"] != "heic_conversions" {
		t.Fatalf("expected heic_conversions metric, got %v", data["metric"])
	}
}

func TestConvertHEICReleasesUsageWhenDecodeFails(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterMenuParsingHandlers(se, app)
	})

	user, token := createAuthUser(t, server.app, false, false)

	response := performMultipartRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/convert-heic",
		token,
		"image",
		"broken.heic",
		[]byte("\x00\x00\x00\x18ftypheic"),
	)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 from /api/convert-heic invalid metadata, got %d, body=%s", response.Code, response.Body.String())
	}

	snapshot, err := lib.GetMonthlyUsageSnapshot(server.app, user)
	if err != nil {
		t.Fatalf("failed to load usage snapshot: %v", err)
	}
	if snapshot.Usage.HEICConversions != 0 {
		t.Fatalf("expected HEIC conversion usage to be released after decode failure, got %d", snapshot.Usage.HEICConversions)
	}
}

func decodeUsageFixture(t *testing.T, encoded string) []byte {
	t.Helper()

	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("failed to decode fixture: %v", err)
	}

	return data
}
