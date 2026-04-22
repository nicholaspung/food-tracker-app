package handlers_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/hooks"
	"myapp/lib"
	"myapp/testutil"
)

func newEmailVerificationPreparedServer(t *testing.T) *preparedServer {
	t.Helper()

	app := testutil.NewTestApp(t)
	hooks.RegisterEmailVerificationHooks(app)

	baseRouter, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("failed to create base router: %v", err)
	}

	serveEvent := &core.ServeEvent{
		App:    app,
		Router: baseRouter,
	}

	if err := app.OnServe().Trigger(serveEvent, func(_ *core.ServeEvent) error {
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

func createEmailVerificationTestUser(
	t *testing.T,
	app core.App,
	verified bool,
	createdAt time.Time,
) (*core.Record, string) {
	t.Helper()

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	user := core.NewRecord(usersCollection)
	user.Set("email", fmt.Sprintf("verification_%d@example.com", time.Now().UnixNano()))
	user.Set("name", "Verification Integration User")
	user.Set("defaultRestaurantVisibility", "friends")
	user.Set("defaultVisitVisibility", "friends")
	user.SetVerified(verified)
	user.SetPassword("password123")

	if err := app.Save(user); err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}

	setEmailVerificationUserCreatedAt(t, app, user.Id, createdAt)

	reloadedUser, err := app.FindRecordById("users", user.Id)
	if err != nil {
		t.Fatalf("failed to reload test user: %v", err)
	}

	token, err := reloadedUser.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create auth token: %v", err)
	}

	return reloadedUser, token
}

func setEmailVerificationUserCreatedAt(t *testing.T, app core.App, userID string, createdAt time.Time) {
	t.Helper()

	formattedCreatedAt := createdAt.UTC().Format(time.RFC3339Nano)
	if _, err := app.DB().NewQuery(`
		UPDATE users
		SET created = {:created}, updated = {:updated}
		WHERE id = {:id}
	`).
		Bind(dbx.Params{
			"created": formattedCreatedAt,
			"updated": formattedCreatedAt,
			"id":      userID,
		}).
		Execute(); err != nil {
		t.Fatalf("failed to backdate test user: %v", err)
	}
}

func assertEmailVerificationForbidden(t *testing.T, responseCode int, responseBody string) {
	t.Helper()

	if responseCode != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d: %s", responseCode, responseBody)
	}

	if !strings.Contains(responseBody, lib.EmailVerificationRequiredMessage) {
		t.Fatalf("expected verification message %q, got %s", lib.EmailVerificationRequiredMessage, responseBody)
	}
}

func TestEmailVerificationAuthWithPasswordAllowsGracePeriod(t *testing.T) {
	server := newEmailVerificationPreparedServer(t)

	user, _ := createEmailVerificationTestUser(t, server.app, false, time.Now().UTC().Add(-24*time.Hour))

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/users/auth-with-password",
		"",
		fmt.Sprintf(`{"identity":"%s","password":"password123"}`, user.GetString("email")),
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected grace-period auth to succeed, got %d: %s", response.Code, response.Body.String())
	}
}

func TestEmailVerificationAuthWithPasswordBlocksExpiredUser(t *testing.T) {
	server := newEmailVerificationPreparedServer(t)

	user, _ := createEmailVerificationTestUser(t, server.app, false, time.Now().UTC().Add(-73*time.Hour))

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/users/auth-with-password",
		"",
		fmt.Sprintf(`{"identity":"%s","password":"password123"}`, user.GetString("email")),
	)

	assertEmailVerificationForbidden(t, response.Code, response.Body.String())
}

func TestEmailVerificationAuthRefreshHonorsGracePeriod(t *testing.T) {
	server := newEmailVerificationPreparedServer(t)

	_, token := createEmailVerificationTestUser(t, server.app, false, time.Now().UTC().Add(-48*time.Hour))

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/users/auth-refresh",
		token,
		"",
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected grace-period auth refresh to succeed, got %d: %s", response.Code, response.Body.String())
	}
}

func TestEmailVerificationAuthRefreshBlocksExpiredUser(t *testing.T) {
	server := newEmailVerificationPreparedServer(t)

	_, token := createEmailVerificationTestUser(t, server.app, false, time.Now().UTC().Add(-73*time.Hour))

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/users/auth-refresh",
		token,
		"",
	)

	assertEmailVerificationForbidden(t, response.Code, response.Body.String())
}

func TestEmailVerificationAuthenticatedApiRouteAccess(t *testing.T) {
	server := newEmailVerificationPreparedServer(t)

	graceUser, graceToken := createEmailVerificationTestUser(t, server.app, false, time.Now().UTC().Add(-36*time.Hour))
	expiredUser, expiredToken := createEmailVerificationTestUser(t, server.app, false, time.Now().UTC().Add(-73*time.Hour))
	verifiedUser, verifiedToken := createEmailVerificationTestUser(t, server.app, true, time.Now().UTC().Add(-240*time.Hour))

	graceResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/users/records/"+graceUser.Id,
		graceToken,
		"",
	)
	if graceResponse.Code != http.StatusOK {
		t.Fatalf("expected grace-period api access to succeed, got %d: %s", graceResponse.Code, graceResponse.Body.String())
	}

	expiredResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/users/records/"+expiredUser.Id,
		expiredToken,
		"",
	)
	assertEmailVerificationForbidden(t, expiredResponse.Code, expiredResponse.Body.String())

	verifiedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/users/records/"+verifiedUser.Id,
		verifiedToken,
		"",
	)
	if verifiedResponse.Code != http.StatusOK {
		t.Fatalf("expected verified user api access to succeed, got %d: %s", verifiedResponse.Code, verifiedResponse.Body.String())
	}
}
