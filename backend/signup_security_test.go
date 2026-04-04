package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	pbtests "github.com/pocketbase/pocketbase/tests"

	_ "myapp/migrations"
)

func newSignupSecurityTestApp(t *testing.T) *pbtests.TestApp {
	t.Helper()

	app, err := pbtests.NewTestApp("pb_data")
	if err != nil {
		t.Fatalf("failed to initialize test app: %v", err)
	}
	t.Cleanup(app.Cleanup)

	return app
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

func TestResolveSignupClientIPUsesTrustedProxyHeader(t *testing.T) {
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
