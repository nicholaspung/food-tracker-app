package handlers_test

import (
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/lib"
)

func TestUserMonthlyUsageCollectionWriteApisAreForbiddenForAuthenticatedUsers(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {})
	user, token := createAuthUser(t, server.app, false, false)
	seedMonthlyUsage(t, server.app, user.Id, 1, 2, 3)

	usageRecord, err := server.app.FindFirstRecordByFilter(
		"user_monthly_usage",
		"user = {:user} && month_key = {:monthKey}",
		dbx.Params{
			"user":     user.Id,
			"monthKey": lib.CurrentUTCMonthKey(),
		},
	)
	if err != nil {
		t.Fatalf("failed to load seeded usage record: %v", err)
	}

	listResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/user_monthly_usage/records",
		token,
		"",
	)
	if listResponse.Code != http.StatusForbidden {
		t.Fatalf(
			"expected list status 403, got %d, body=%s",
			listResponse.Code,
			listResponse.Body.String(),
		)
	}

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/user_monthly_usage/records",
		token,
		`{"user":"`+user.Id+`","month_key":"`+lib.CurrentUTCMonthKey()+`","menu_scans":999}`,
	)
	if createResponse.Code != http.StatusForbidden {
		t.Fatalf(
			"expected create status 403, got %d, body=%s",
			createResponse.Code,
			createResponse.Body.String(),
		)
	}

	updateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/collections/user_monthly_usage/records/"+usageRecord.Id,
		token,
		`{"menu_scans":0}`,
	)
	if updateResponse.Code != http.StatusForbidden {
		t.Fatalf(
			"expected update status 403, got %d, body=%s",
			updateResponse.Code,
			updateResponse.Body.String(),
		)
	}

	deleteResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodDelete,
		"/api/collections/user_monthly_usage/records/"+usageRecord.Id,
		token,
		"",
	)
	if deleteResponse.Code != http.StatusForbidden {
		t.Fatalf(
			"expected delete status 403, got %d, body=%s",
			deleteResponse.Code,
			deleteResponse.Body.String(),
		)
	}
}

func TestUsageConsumeEndpointDisabledForAuthenticatedUsers(t *testing.T) {
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
		t.Fatalf(
			"expected consume endpoint status 403, got %d, body=%s",
			response.Code,
			response.Body.String(),
		)
	}
}
