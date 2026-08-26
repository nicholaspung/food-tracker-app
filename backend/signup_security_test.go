package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	pbtests "github.com/pocketbase/pocketbase/tests"

	"myapp/handlers"
	"myapp/lib"
	_ "myapp/migrations"
	"myapp/testutil"
)

func newSignupSecurityTestApp(t *testing.T) *pbtests.TestApp {
	t.Helper()

	return testutil.NewTestApp(t)
}

func createSignupSecurityUser(t *testing.T, app core.App, email string) *core.Record {
	t.Helper()

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	user := core.NewRecord(usersCollection)
	user.Set("email", email)
	user.Set("name", "Signup Security User")
	user.Set("defaultRestaurantVisibility", "friends")
	user.Set("defaultVisitVisibility", "friends")
	user.SetVerified(true)
	user.SetPassword("password123")

	if err := app.Save(user); err != nil {
		t.Fatalf("failed to save user: %v", err)
	}

	return user
}

func createInviteCodeRecord(t *testing.T, app core.App, code string, createdBy string) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("invite_codes")
	if err != nil {
		t.Fatalf("failed to resolve invite_codes collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("code", code)
	record.Set("used", false)
	record.Set("createdBy", createdBy)

	if err := app.Save(record); err != nil {
		t.Fatalf("failed to save invite code: %v", err)
	}

	return record
}

type signupSecurityPreparedServer struct {
	app *pbtests.TestApp
	mux http.Handler
}

func newSignupSecurityPreparedServer(t *testing.T) *signupSecurityPreparedServer {
	t.Helper()

	app := newSignupSecurityTestApp(t)
	ensureSignupSecurityWaitlistTokenFields(t, app)
	registerSignupHooks(app, lib.LoadRuntimeResourcesFromEnv())

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("failed to create signup security router: %v", err)
	}

	mux, err := router.BuildMux()
	if err != nil {
		t.Fatalf("failed to build signup security router mux: %v", err)
	}

	return &signupSecurityPreparedServer{
		app: app,
		mux: mux,
	}
}

func ensureSignupSecurityWaitlistTokenFields(t *testing.T, app core.App) {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("waitlist_entries")
	if err != nil {
		t.Fatalf("failed to resolve waitlist_entries collection: %v", err)
	}

	changed := false
	for _, field := range []core.Field{
		&core.TextField{Name: "approvalTokenNonceHash", Max: 128},
		&core.DateField{Name: "approvalTokenIssuedAt"},
		&core.DateField{Name: "approvalTokenExpiresAt"},
		&core.DateField{Name: "approvalTokenUsedAt"},
	} {
		if collection.Fields.GetByName(field.GetName()) == nil {
			collection.Fields.Add(field)
			changed = true
		}
	}

	if changed {
		if err := app.Save(collection); err != nil {
			t.Fatalf("failed to add waitlist approval token fields: %v", err)
		}
	}
}

func createSignupSecurityWaitlistEntry(t *testing.T, app core.App, email string) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("waitlist_entries")
	if err != nil {
		t.Fatalf("failed to resolve waitlist_entries collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("email", email)
	record.Set("status", handlers.WaitlistStatusApproved)
	record.Set("source", "mobile_signup")
	record.Set("approvedAt", time.Now().UTC())

	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create waitlist entry: %v", err)
	}

	return record
}

func performSignupSecurityJSONRequest(
	t *testing.T,
	mux http.Handler,
	method string,
	path string,
	body string,
) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, req)
	return recorder
}

func performSignupSecurityJSONRequestFromIP(
	t *testing.T,
	mux http.Handler,
	clientIP string,
	body string,
) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(http.MethodPost, "/api/collections/users/records", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", clientIP)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, req)
	return recorder
}

func TestResolveSignupClientIPDefaultsToRemoteAddr(t *testing.T) {
	t.Setenv(trustProxyHeadersEnvKey, "false")

	app := newSignupSecurityTestApp(t)

	req := httptest.NewRequest(http.MethodPost, "/api/collections/users/records", nil)
	req.Header.Set("X-Forwarded-For", "198.51.100.10")
	req.RemoteAddr = "198.51.100.44:54321"

	requestEvent := &core.RequestEvent{App: app}
	requestEvent.Request = req
	requestEvent.Response = httptest.NewRecorder()

	recordEvent := &core.RecordRequestEvent{RequestEvent: requestEvent}

	if got := resolveSignupClientIP(recordEvent); got != "198.51.100.44" {
		t.Fatalf("expected direct remote IP, got %q", got)
	}
}

func TestResolveSignupClientIPUsesTrustedProxyHeaderWhenConfigured(t *testing.T) {
	t.Setenv(trustProxyHeadersEnvKey, "true")

	app := newSignupSecurityTestApp(t)
	configureTrustedProxyHeaders(app)

	req := httptest.NewRequest(http.MethodPost, "/api/collections/users/records", nil)
	req.Header.Set("X-Forwarded-For", "198.51.100.10")
	req.RemoteAddr = "127.0.0.1:54321"

	requestEvent := &core.RequestEvent{App: app}
	requestEvent.Request = req
	requestEvent.Response = httptest.NewRecorder()

	recordEvent := &core.RecordRequestEvent{RequestEvent: requestEvent}

	if got := resolveSignupClientIP(recordEvent); got != "198.51.100.10" {
		t.Fatalf("expected trusted proxy IP, got %q", got)
	}
}

func TestInviteCodeReservationPreventsReuseAndCanBeFinalized(t *testing.T) {
	app := newSignupSecurityTestApp(t)
	owner := createSignupSecurityUser(t, app, "owner@example.com")
	usedBy := createSignupSecurityUser(t, app, "usedby@example.com")
	createInviteCodeRecord(t, app, "invite-123", owner.Id)

	reservation, err := reserveInviteCode(app, "invite-123")
	if err != nil {
		t.Fatalf("expected invite code reservation to succeed, got %v", err)
	}

	if reservation.RecordID == "" || reservation.Code == "" {
		t.Fatalf("expected populated reservation, got %#v", reservation)
	}

	if _, err := reserveInviteCode(app, "invite-123"); !errors.Is(err, errInviteCodeUnavailable) {
		t.Fatalf("expected second reservation attempt to fail with invite unavailable, got %v", err)
	}

	if err := finalizeInviteCodeReservation(app, reservation, usedBy.Id); err != nil {
		t.Fatalf("expected reservation finalization to succeed, got %v", err)
	}

	record, err := app.FindRecordById("invite_codes", reservation.RecordID)
	if err != nil {
		t.Fatalf("failed to reload invite code: %v", err)
	}

	if !record.GetBool("used") {
		t.Fatalf("expected invite code to remain used after finalization")
	}

	if record.GetString("usedBy") != usedBy.Id {
		t.Fatalf("expected usedBy=%s, got %s", usedBy.Id, record.GetString("usedBy"))
	}
}

func TestInviteCodeReservationCanBeReleasedAfterFailure(t *testing.T) {
	app := newSignupSecurityTestApp(t)
	createInviteCodeRecord(t, app, "invite-release", "")

	reservation, err := reserveInviteCode(app, "invite-release")
	if err != nil {
		t.Fatalf("expected invite code reservation to succeed, got %v", err)
	}

	if err := releaseInviteCodeReservation(app, reservation); err != nil {
		t.Fatalf("expected reservation release to succeed, got %v", err)
	}

	record, err := app.FindRecordById("invite_codes", reservation.RecordID)
	if err != nil {
		t.Fatalf("failed to reload invite code: %v", err)
	}

	if record.GetBool("used") {
		t.Fatalf("expected invite code to be unused after release")
	}

	if record.GetString("usedBy") != "" {
		t.Fatalf("expected invite code usedBy to be cleared, got %q", record.GetString("usedBy"))
	}

	releasedReservation, err := reserveInviteCode(app, "invite-release")
	if err != nil {
		t.Fatalf("expected invite code to be reservable again after release, got %v", err)
	}

	if releasedReservation.RecordID != reservation.RecordID {
		t.Fatalf("expected to reserve the same invite code record, got %s", releasedReservation.RecordID)
	}
}

func TestInviteCodesRejectCaseInsensitiveDuplicateCodes(t *testing.T) {
	app := newSignupSecurityTestApp(t)
	owner := createSignupSecurityUser(t, app, "owner@example.com")

	createInviteCodeRecord(t, app, "Invite-Dupe", owner.Id)

	collection, err := app.FindCollectionByNameOrId("invite_codes")
	if err != nil {
		t.Fatalf("failed to resolve invite_codes collection: %v", err)
	}

	duplicate := core.NewRecord(collection)
	duplicate.Set("code", "invite-dupe")
	duplicate.Set("used", false)
	duplicate.Set("createdBy", owner.Id)

	if err := app.Save(duplicate); err == nil {
		t.Fatalf("expected case-insensitive duplicate invite code to be rejected")
	}
}

func TestWaitlistApprovedEmailAloneCannotCreateAccount(t *testing.T) {
	server := newSignupSecurityPreparedServer(t)
	createSignupSecurityWaitlistEntry(t, server.app, "victim@example.com")

	response := performSignupSecurityJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/users/records",
		`{
			"email":"victim@example.com",
			"name":"Attacker",
			"password":"password123",
			"passwordConfirm":"password123"
		}`,
	)
	if response.Code == http.StatusOK {
		t.Fatalf("expected email-only waitlist signup to fail, got %d: %s", response.Code, response.Body.String())
	}
	if !strings.Contains(strings.ToLower(response.Body.String()), "waitlist approval link is invalid or expired") {
		t.Fatalf("expected invalid approval link message, got %s", response.Body.String())
	}

	if _, err := server.app.FindAuthRecordByEmail("users", "victim@example.com"); err == nil {
		t.Fatal("expected email-only waitlist signup not to create a user")
	}

	authResponse := performSignupSecurityJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/users/auth-with-password",
		`{"identity":"victim@example.com","password":"password123"}`,
	)
	if authResponse.Code == http.StatusOK {
		t.Fatalf("expected attacker auth to fail because no account was created, got %d: %s", authResponse.Code, authResponse.Body.String())
	}
}

func TestWaitlistApprovalTokenCreatesAccountAndCannotBeReplayed(t *testing.T) {
	server := newSignupSecurityPreparedServer(t)
	entry := createSignupSecurityWaitlistEntry(t, server.app, "approved@example.com")
	token, err := handlers.GenerateWaitlistApprovalToken(server.app, entry)
	if err != nil {
		t.Fatalf("expected waitlist approval token generation to succeed: %v", err)
	}

	response := performSignupSecurityJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/users/records",
		`{
			"email":"approved@example.com",
			"name":"Approved User",
			"password":"password123",
			"passwordConfirm":"password123",
			"waitlistApprovalToken":"`+token+`"
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected token-backed waitlist signup to succeed, got %d: %s", response.Code, response.Body.String())
	}

	reloadedEntry, err := server.app.FindRecordById("waitlist_entries", entry.Id)
	if err != nil {
		t.Fatalf("failed to reload waitlist entry: %v", err)
	}
	if got := reloadedEntry.GetString("status"); got != handlers.WaitlistStatusSignedUp {
		t.Fatalf("expected waitlist entry to be signed_up, got %q", got)
	}
	if got := reloadedEntry.GetString("signedUpUser"); got == "" {
		t.Fatal("expected waitlist entry to reference signed-up user")
	}
	if got := reloadedEntry.GetString("approvalTokenUsedAt"); got == "" {
		t.Fatal("expected approval token to remain marked used")
	}

	authResponse := performSignupSecurityJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/users/auth-with-password",
		`{"identity":"approved@example.com","password":"password123"}`,
	)
	if authResponse.Code != http.StatusOK {
		t.Fatalf("expected token-backed signup user to authenticate, got %d: %s", authResponse.Code, authResponse.Body.String())
	}

	replayResponse := performSignupSecurityJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/users/records",
		`{
			"email":"approved@example.com",
			"name":"Second Requester",
			"password":"password456",
			"passwordConfirm":"password456",
			"waitlistApprovalToken":"`+token+`"
		}`,
	)
	if replayResponse.Code == http.StatusOK {
		t.Fatalf("expected replayed waitlist approval token to fail, got %d: %s", replayResponse.Code, replayResponse.Body.String())
	}
	if !strings.Contains(strings.ToLower(replayResponse.Body.String()), "waitlist approval link is invalid or expired") {
		t.Fatalf("expected invalid approval link replay message, got %s", replayResponse.Body.String())
	}
}

func TestIncrementSignupFailureLocksAfterThreshold(t *testing.T) {
	app := newSignupSecurityTestApp(t)
	record, err := getOrCreateRateLimitRecord(app, "198.51.100.20")
	if err != nil {
		t.Fatalf("failed to create rate limit record: %v", err)
	}

	now := time.Now().UTC()
	for i := 0; i < signupRateLimitMaxAttempts-1; i++ {
		lockoutMinutes, locked, err := incrementSignupFailure(app, record, now)
		if err != nil {
			t.Fatalf("failed to increment signup failure: %v", err)
		}
		if locked || lockoutMinutes != 0 {
			t.Fatalf("expected no lockout before threshold, got locked=%v minutes=%d", locked, lockoutMinutes)
		}
	}

	lockoutMinutes, locked, err := incrementSignupFailure(app, record, now)
	if err != nil {
		t.Fatalf("failed to apply threshold signup failure: %v", err)
	}
	if !locked {
		t.Fatalf("expected threshold failure to lock the record")
	}
	if lockoutMinutes == 0 {
		t.Fatalf("expected a non-zero lockout duration")
	}
}

func TestSignupFailureBucketsUseForwardedClientIdentity(t *testing.T) {
	t.Setenv(trustProxyHeadersEnvKey, "true")

	server := newSignupSecurityPreparedServer(t)
	configureTrustedProxyHeaders(server.app)

	invalidSignup := `{
		"email":"blocked@example.com",
		"name":"Blocked Requester",
		"password":"password123",
		"passwordConfirm":"password123",
		"inviteCode":"invalid-code"
	}`

	for attempt := 1; attempt <= signupRateLimitMaxAttempts; attempt++ {
		response := performSignupSecurityJSONRequestFromIP(t, server.mux, "198.51.100.20", invalidSignup)
		if response.Code == http.StatusOK {
			t.Fatalf("expected client A invalid signup attempt %d to fail", attempt)
		}
	}

	lockedResponse := performSignupSecurityJSONRequestFromIP(t, server.mux, "198.51.100.20", invalidSignup)
	if !strings.Contains(strings.ToLower(lockedResponse.Body.String()), "too many failed attempts") {
		t.Fatalf("expected client A to exhaust its signup budget, got %d: %s", lockedResponse.Code, lockedResponse.Body.String())
	}

	isolatedResponse := performSignupSecurityJSONRequestFromIP(t, server.mux, "198.51.100.21", invalidSignup)
	if strings.Contains(strings.ToLower(isolatedResponse.Body.String()), "too many failed attempts") {
		t.Fatalf("expected client B to retain an isolated signup budget, got %d: %s", isolatedResponse.Code, isolatedResponse.Body.String())
	}

	clientBRecord, err := server.app.FindFirstRecordByFilter(
		"rate_limits",
		"ip_address = {:ip}",
		map[string]any{"ip": "198.51.100.21"},
	)
	if err != nil {
		t.Fatalf("failed to load client B signup bucket: %v", err)
	}
	if attempts := clientBRecord.GetInt("attempts"); attempts != 1 {
		t.Fatalf("expected client B to have one isolated failure, got %d", attempts)
	}
}
