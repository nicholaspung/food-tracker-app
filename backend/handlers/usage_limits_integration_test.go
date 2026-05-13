package handlers_test

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

func TestUsageMonthlyAuthRequired(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUsageLimitHandlers(se, app)
	})

	response := performJSONRequest(t, server.mux, http.MethodGet, "/api/usage/monthly", "", "")
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d, body=%s", response.Code, response.Body.String())
	}
}

func TestUsageMonthlyReflectsSeededUsageData(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUsageLimitHandlers(se, app)
	})
	user, token := createAuthUser(t, server.app, false, false)

	initialSnapshot := performJSONRequest(t, server.mux, http.MethodGet, "/api/usage/monthly", token, "")
	if initialSnapshot.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", initialSnapshot.Code, initialSnapshot.Body.String())
	}

	initialData := parseJSONMap(t, initialSnapshot.Body.Bytes())
	initialUsage, ok := initialData["usage"].(map[string]any)
	if !ok {
		t.Fatalf("usage object missing in response: %v", initialData)
	}
	if initialUsage["menuScans"].(float64) != 0 {
		t.Fatalf("expected initial menuScans usage to be 0")
	}

	seedMonthlyUsage(t, server.app, user.Id, 0, 0, 1)

	latestSnapshot := performJSONRequest(t, server.mux, http.MethodGet, "/api/usage/monthly", token, "")
	if latestSnapshot.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", latestSnapshot.Code, latestSnapshot.Body.String())
	}

	latestData := parseJSONMap(t, latestSnapshot.Body.Bytes())
	latestUsage := latestData["usage"].(map[string]any)
	if latestUsage["menuScans"].(float64) != 1 {
		t.Fatalf("expected menuScans usage=1 after consume, got %v", latestUsage["menuScans"])
	}

	remaining := latestData["remaining"].(map[string]any)
	if remaining["menuScansMonthly"].(float64) != 24 {
		t.Fatalf("expected remaining menu scans=24, got %v", remaining["menuScansMonthly"])
	}

	if latestData["userTier"] != "free" {
		t.Fatalf("expected user tier free, got %v", latestData["userTier"])
	}

	seedMonthlyUsage(t, server.app, user.Id, 0, 0, 25)
	atLimitSnapshot := performJSONRequest(t, server.mux, http.MethodGet, "/api/usage/monthly", token, "")
	if atLimitSnapshot.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", atLimitSnapshot.Code, atLimitSnapshot.Body.String())
	}

	atLimitData := parseJSONMap(t, atLimitSnapshot.Body.Bytes())
	atLimitRemaining := atLimitData["remaining"].(map[string]any)
	if atLimitRemaining["menuScansMonthly"].(float64) != 0 {
		t.Fatalf("expected remaining menu scans=0 at limit, got %v", atLimitRemaining["menuScansMonthly"])
	}
}

func TestUsageConsumeEndpointIsDisabled(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUsageLimitHandlers(se, app)
	})
	_, token := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/usage/consume",
		token,
		`{"metric":"menu_scans","amount":1}`,
	)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d, body=%s", response.Code, response.Body.String())
	}
}

func TestUsageMonthlyPreviewTierRequiresAdmin(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUsageLimitHandlers(se, app)
	})
	_, token := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/usage/monthly?view_as_tier=free",
		token,
		"",
	)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d, body=%s", response.Code, response.Body.String())
	}
}

func TestUsageMonthlyAdminPreviewTierShowsPreviewLimitsWithoutBlockingAdmin(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUsageLimitHandlers(se, app)
	})
	adminUser, adminToken := createAuthUser(t, server.app, true, true)
	seedMonthlyUsage(t, server.app, adminUser.Id, 4, 95, 4)

	initialPreview := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/usage/monthly?view_as_tier=free",
		adminToken,
		"",
	)
	if initialPreview.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", initialPreview.Code, initialPreview.Body.String())
	}

	initialData := parseJSONMap(t, initialPreview.Body.Bytes())
	if initialData["userTier"] != "free" {
		t.Fatalf("expected preview tier free, got %v", initialData["userTier"])
	}

	initialUsage := initialData["usage"].(map[string]any)
	if initialUsage["photoUploads"].(float64) != 4 {
		t.Fatalf("expected preview usage photoUploads=4, got %v", initialUsage["photoUploads"])
	}
	if initialUsage["placesQueries"].(float64) != 95 {
		t.Fatalf("expected preview usage placesQueries=95, got %v", initialUsage["placesQueries"])
	}
	if initialUsage["menuScans"].(float64) != 4 {
		t.Fatalf("expected preview usage menuScans=4, got %v", initialUsage["menuScans"])
	}

	initialRemaining := initialData["remaining"].(map[string]any)
	if initialRemaining["photoUploadsMonthly"].(float64) != 1 {
		t.Fatalf("expected preview remaining photoUploadsMonthly=1, got %v", initialRemaining["photoUploadsMonthly"])
	}
	if initialRemaining["placesQueriesMonthly"].(float64) != 5 {
		t.Fatalf("expected preview remaining placesQueriesMonthly=5, got %v", initialRemaining["placesQueriesMonthly"])
	}
	if initialRemaining["menuScansMonthly"].(float64) != 1 {
		t.Fatalf("expected preview remaining menuScansMonthly=1, got %v", initialRemaining["menuScansMonthly"])
	}

	seedMonthlyUsage(t, server.app, adminUser.Id, 4, 95, 6)

	afterPreview := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/usage/monthly?view_as_tier=free",
		adminToken,
		"",
	)
	if afterPreview.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", afterPreview.Code, afterPreview.Body.String())
	}

	afterData := parseJSONMap(t, afterPreview.Body.Bytes())
	afterUsage := afterData["usage"].(map[string]any)
	if afterUsage["menuScans"].(float64) != 6 {
		t.Fatalf("expected menuScans usage=6 after two consumes, got %v", afterUsage["menuScans"])
	}

	afterRemaining := afterData["remaining"].(map[string]any)
	if afterRemaining["menuScansMonthly"].(float64) != 0 {
		t.Fatalf("expected preview remaining menuScansMonthly=0, got %v", afterRemaining["menuScansMonthly"])
	}
}
