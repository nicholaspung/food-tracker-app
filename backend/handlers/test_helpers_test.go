package handlers_test

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	pbtests "github.com/pocketbase/pocketbase/tests"

	"myapp/lib"
	_ "myapp/migrations"
	"myapp/testutil"
)

type preparedServer struct {
	app *pbtests.TestApp
	mux http.Handler
}

func newPreparedServer(
	t *testing.T,
	register func(se *core.ServeEvent, app core.App),
) *preparedServer {
	t.Helper()

	app := testutil.NewTestApp(t)

	var err error
	baseRouter, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("failed to create base router: %v", err)
	}

	serveEvent := &core.ServeEvent{
		App:    app,
		Router: baseRouter,
	}

	if err := app.OnServe().Trigger(serveEvent, func(e *core.ServeEvent) error {
		register(e, app)
		return nil
	}); err != nil {
		t.Fatalf("failed to trigger OnServe: %v", err)
	}

	mux, err := baseRouter.BuildMux()
	if err != nil {
		t.Fatalf("failed to build router mux: %v", err)
	}

	return &preparedServer{
		app: app,
		mux: mux,
	}
}

func performJSONRequest(
	t *testing.T,
	mux http.Handler,
	method string,
	path string,
	authToken string,
	body string,
) *httptest.ResponseRecorder {
	t.Helper()

	var reader *bytes.Reader
	if body == "" {
		reader = bytes.NewReader([]byte{})
	} else {
		reader = bytes.NewReader([]byte(body))
	}

	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	if authToken != "" {
		req.Header.Set("Authorization", "Bearer "+authToken)
	}

	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, req)
	return recorder
}

func performMultipartRequest(
	t *testing.T,
	mux http.Handler,
	method string,
	path string,
	authToken string,
	fieldName string,
	filename string,
	fileContents []byte,
) *httptest.ResponseRecorder {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile(fieldName, filename)
	if err != nil {
		t.Fatalf("failed to create multipart form file: %v", err)
	}

	if _, err := io.Copy(part, bytes.NewReader(fileContents)); err != nil {
		t.Fatalf("failed to write multipart form file: %v", err)
	}

	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}

	req := httptest.NewRequest(method, path, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if authToken != "" {
		req.Header.Set("Authorization", "Bearer "+authToken)
	}

	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, req)
	return recorder
}

func parseJSONMap(t *testing.T, body []byte) map[string]any {
	t.Helper()

	result := map[string]any{}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatalf("failed to parse response JSON: %v; body=%s", err, string(body))
	}
	return result
}

func createAuthUser(t *testing.T, app core.App, isAdmin bool, isSubscriber bool) (*core.Record, string) {
	t.Helper()

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	user := core.NewRecord(usersCollection)
	user.Set("email", fmt.Sprintf("user_%d@example.com", time.Now().UnixNano()))
	user.Set("name", "Integration Test User")
	user.Set("isAdmin", isAdmin)
	user.Set("isSubscriber", isSubscriber)
	user.Set("defaultRestaurantVisibility", "friends")
	user.Set("defaultVisitVisibility", "friends")
	user.SetVerified(true)
	user.SetPassword("password123")

	if err := app.Save(user); err != nil {
		t.Fatalf("failed to create auth user: %v", err)
	}

	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create auth token: %v", err)
	}

	return user, token
}

func seedMonthlyUsage(
	t *testing.T,
	app core.App,
	userID string,
	photoUploads int,
	placesQueries int,
	menuScans int,
) {
	seedMonthlyUsageWithStorefrontAndHEIC(t, app, userID, photoUploads, placesQueries, menuScans, 0, 0)
}

func seedMonthlyUsageWithHEIC(
	t *testing.T,
	app core.App,
	userID string,
	photoUploads int,
	placesQueries int,
	menuScans int,
	heicConversions int,
) {
	seedMonthlyUsageWithStorefrontAndHEIC(t, app, userID, photoUploads, placesQueries, menuScans, 0, heicConversions)
}

func seedMonthlyUsageWithStorefrontAndHEIC(
	t *testing.T,
	app core.App,
	userID string,
	photoUploads int,
	placesQueries int,
	menuScans int,
	storefrontReads int,
	heicConversions int,
) {
	t.Helper()

	monthKey := lib.CurrentUTCMonthKey()
	record, err := app.FindFirstRecordByFilter(
		"user_monthly_usage",
		"user = {:user} && month_key = {:monthKey}",
		dbx.Params{
			"user":     userID,
			"monthKey": monthKey,
		},
	)
	if err != nil && err != sql.ErrNoRows {
		t.Fatalf("failed to find usage record: %v", err)
	}

	if record == nil {
		usageCollection, findErr := app.FindCollectionByNameOrId("user_monthly_usage")
		if findErr != nil {
			t.Fatalf("failed to resolve usage collection: %v", findErr)
		}

		record = core.NewRecord(usageCollection)
		record.Set("user", userID)
		record.Set("month_key", monthKey)
	}

	record.Set("photo_uploads", photoUploads)
	record.Set("places_queries", placesQueries)
	record.Set("menu_scans", menuScans)
	record.Set("storefront_reads", storefrontReads)
	record.Set("heic_conversions", heicConversions)

	if saveErr := app.Save(record); saveErr != nil {
		t.Fatalf("failed to save usage record: %v", saveErr)
	}
}
