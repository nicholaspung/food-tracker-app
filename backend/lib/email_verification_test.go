package lib

import (
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"myapp/testutil"
)

func newEmailVerificationTestRecord(t *testing.T) (core.App, *core.Record) {
	t.Helper()

	app := testutil.NewTestApp(t)
	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	record := core.NewRecord(usersCollection)
	record.Set("email", "verification_test@example.com")
	record.Set("name", "Verification Test")
	record.Set("defaultRestaurantVisibility", "friends")
	record.Set("defaultVisitVisibility", "friends")
	record.SetPassword("password123")

	if err := app.Save(record); err != nil {
		t.Fatalf("failed to save test user: %v", err)
	}

	return app, record
}

func reloadEmailVerificationTestRecord(t *testing.T, app core.App, recordID string) *core.Record {
	t.Helper()

	record, err := app.FindRecordById("users", recordID)
	if err != nil {
		t.Fatalf("failed to reload user %s: %v", recordID, err)
	}

	return record
}

func setEmailVerificationTestCreatedAt(t *testing.T, app core.App, recordID string, createdAt string) *core.Record {
	t.Helper()

	if _, err := app.DB().NewQuery(`
		UPDATE users
		SET created = {:created}
		WHERE id = {:id}
	`).
		Bind(dbx.Params{
			"created": createdAt,
			"id":      recordID,
		}).
		Execute(); err != nil {
		t.Fatalf("failed to set created value for user %s: %v", recordID, err)
	}

	return reloadEmailVerificationTestRecord(t, app, recordID)
}

func TestResolveEmailVerificationAccessVerifiedUser(t *testing.T) {
	app, record := newEmailVerificationTestRecord(t)
	record.SetVerified(true)
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to save verified user: %v", err)
	}
	record = setEmailVerificationTestCreatedAt(t, app, record.Id, "2026-04-18 12:00:00.000Z")

	access := ResolveEmailVerificationAccess(record, time.Date(2026, 4, 21, 12, 0, 0, 0, time.UTC))

	if access.Status != EmailVerificationStatusVerified {
		t.Fatalf("expected verified status, got %q", access.Status)
	}
	if !access.GraceEndsAt.IsZero() {
		t.Fatalf("expected zero grace deadline for verified user, got %s", access.GraceEndsAt)
	}
}

func TestResolveEmailVerificationAccessWithinGracePeriod(t *testing.T) {
	app, record := newEmailVerificationTestRecord(t)
	record.SetVerified(false)
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to save unverified user: %v", err)
	}
	record = setEmailVerificationTestCreatedAt(t, app, record.Id, "2026-04-20 12:00:00.000Z")

	access := ResolveEmailVerificationAccess(record, time.Date(2026, 4, 21, 12, 0, 0, 0, time.UTC))

	if access.Status != EmailVerificationStatusGracePeriod {
		t.Fatalf("expected grace period status, got %q", access.Status)
	}

	expectedGraceEndsAt := time.Date(2026, 4, 23, 12, 0, 0, 0, time.UTC)
	if !access.GraceEndsAt.Equal(expectedGraceEndsAt) {
		t.Fatalf("expected grace deadline %s, got %s", expectedGraceEndsAt, access.GraceEndsAt)
	}
}

func TestResolveEmailVerificationAccessGraceExpired(t *testing.T) {
	app, record := newEmailVerificationTestRecord(t)
	record.SetVerified(false)
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to save expired user: %v", err)
	}
	record = setEmailVerificationTestCreatedAt(t, app, record.Id, "2026-04-17 11:59:59.000Z")

	access := ResolveEmailVerificationAccess(record, time.Date(2026, 4, 20, 12, 0, 0, 0, time.UTC))

	if access.Status != EmailVerificationStatusGraceExpired {
		t.Fatalf("expected grace expired status, got %q", access.Status)
	}
}

func TestResolveEmailVerificationAccessInvalidCreatedValue(t *testing.T) {
	app, record := newEmailVerificationTestRecord(t)
	record = setEmailVerificationTestCreatedAt(t, app, record.Id, "not-a-date")

	access := ResolveEmailVerificationAccess(record, time.Date(2026, 4, 21, 12, 0, 0, 0, time.UTC))

	if access.Status != EmailVerificationStatusGraceExpired {
		t.Fatalf("expected invalid created value to fail closed, got %q", access.Status)
	}
}
