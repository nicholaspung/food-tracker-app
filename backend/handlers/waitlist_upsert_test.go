package handlers

import (
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"

	"myapp/testutil"
)

func ensureWaitlistCollectionForUnitTest(t *testing.T, app core.App) {
	t.Helper()

	if collection, err := app.FindCollectionByNameOrId("waitlist_entries"); err == nil {
		ensureWaitlistApprovalTokenFieldsForUnitTest(t, app, collection)
		return
	}

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	collection := core.NewBaseCollection("waitlist_entries")
	collection.ListRule = nil
	collection.ViewRule = nil
	collection.CreateRule = nil
	collection.UpdateRule = nil
	collection.DeleteRule = nil
	collection.Fields.Add(&core.TextField{Name: "email", Required: true, Max: 320})
	collection.Fields.Add(&core.SelectField{
		Name:      "status",
		Required:  true,
		MaxSelect: 1,
		Values:    []string{"pending", "approved", "rejected", "signed_up"},
	})
	collection.Fields.Add(&core.TextField{Name: "source", Max: 120})
	collection.Fields.Add(&core.DateField{Name: "approvedAt"})
	collection.Fields.Add(&core.RelationField{Name: "approvedBy", CollectionId: usersCollection.Id, MaxSelect: 1})
	collection.Fields.Add(&core.DateField{Name: "rejectedAt"})
	collection.Fields.Add(&core.RelationField{Name: "rejectedBy", CollectionId: usersCollection.Id, MaxSelect: 1})
	collection.Fields.Add(&core.DateField{Name: "signedUpAt"})
	collection.Fields.Add(&core.RelationField{Name: "signedUpUser", CollectionId: usersCollection.Id, MaxSelect: 1})
	collection.Fields.Add(&core.TextField{Name: "loopsContactId", Max: 120})
	collection.Fields.Add(&core.BoolField{Name: "loopsSyncPending"})
	collection.Fields.Add(&core.TextField{Name: "lastLoopsSyncError", Max: 2000})
	collection.Fields.Add(&core.DateField{Name: "joinedEmailSentAt"})
	collection.Fields.Add(&core.TextField{Name: "lastJoinedEmailError", Max: 2000})
	collection.Fields.Add(&core.TextField{Name: "approvalTokenNonceHash", Max: 128})
	collection.Fields.Add(&core.DateField{Name: "approvalTokenIssuedAt"})
	collection.Fields.Add(&core.DateField{Name: "approvalTokenExpiresAt"})
	collection.Fields.Add(&core.DateField{Name: "approvalTokenUsedAt"})
	collection.Fields.Add(&core.DateField{Name: "created"})
	collection.Fields.Add(&core.DateField{Name: "updated"})

	if err := app.Save(collection); err != nil {
		t.Fatalf("failed to create waitlist_entries collection: %v", err)
	}
}

func ensureWaitlistApprovalTokenFieldsForUnitTest(t *testing.T, app core.App, collection *core.Collection) {
	t.Helper()

	changed := false
	for _, field := range []core.Field{
		&core.BoolField{Name: "loopsSyncPending"},
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

func createWaitlistRecordForUnitTest(t *testing.T, app core.App, data map[string]any) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("waitlist_entries")
	if err != nil {
		t.Fatalf("failed to resolve waitlist_entries collection: %v", err)
	}

	record := core.NewRecord(collection)
	for key, value := range data {
		record.Set(key, value)
	}
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create waitlist record: %v", err)
	}

	return record
}

func TestUpsertWaitlistEntryJoinedEmailTransitions(t *testing.T) {
	app := testutil.NewTestApp(t)
	ensureWaitlistCollectionForUnitTest(t, app)

	newResult, err := upsertWaitlistEntry(app, waitlistRequest{Email: "new@example.com", Source: "mobile_signup"}, "new@example.com")
	if err != nil {
		t.Fatalf("new upsert failed: %v", err)
	}
	if !newResult.ShouldSendJoinedEmail {
		t.Fatal("expected new waitlist record to send joined email")
	}

	createWaitlistRecordForUnitTest(t, app, map[string]any{
		"email":             "sent@example.com",
		"status":            WaitlistStatusPending,
		"source":            "mobile_signup",
		"joinedEmailSentAt": "2026-05-10 12:00:00.000Z",
	})
	sentResult, err := upsertWaitlistEntry(app, waitlistRequest{Email: "sent@example.com", Source: "mobile_signup"}, "sent@example.com")
	if err != nil {
		t.Fatalf("sent upsert failed: %v", err)
	}
	if sentResult.ShouldSendJoinedEmail {
		t.Fatal("expected existing pending record with sent joined email to skip joined email")
	}

	createWaitlistRecordForUnitTest(t, app, map[string]any{
		"email":                "retry@example.com",
		"status":               WaitlistStatusPending,
		"source":               "mobile_signup",
		"lastJoinedEmailError": "smtp unavailable",
	})
	retryResult, err := upsertWaitlistEntry(app, waitlistRequest{Email: "retry@example.com", Source: "mobile_signup"}, "retry@example.com")
	if err != nil {
		t.Fatalf("retry upsert failed: %v", err)
	}
	if !retryResult.ShouldSendJoinedEmail {
		t.Fatal("expected pending record without sent timestamp to retry joined email")
	}

	rejectedRecord := createWaitlistRecordForUnitTest(t, app, map[string]any{
		"email":      "rejected@example.com",
		"status":     WaitlistStatusRejected,
		"source":     "mobile_signup",
		"rejectedAt": "2026-05-09 12:00:00.000Z",
	})
	rejectedResult, err := upsertWaitlistEntry(app, waitlistRequest{Email: "rejected@example.com", Source: "mobile_signup"}, "rejected@example.com")
	if err != nil {
		t.Fatalf("rejected upsert failed: %v", err)
	}
	if !rejectedResult.ShouldSendJoinedEmail {
		t.Fatal("expected rejected record rejoin to send joined email")
	}
	reloaded, err := app.FindRecordById("waitlist_entries", rejectedRecord.Id)
	if err != nil {
		t.Fatalf("failed to reload rejected record: %v", err)
	}
	if got := reloaded.GetString("status"); got != WaitlistStatusPending {
		t.Fatalf("expected rejected rejoin to become pending, got %q", got)
	}
	if got := reloaded.GetString("rejectedAt"); got != "" {
		t.Fatalf("expected rejectedAt to be cleared, got %q", got)
	}
}

func TestWaitlistApprovalTokenCanBeReservedOnce(t *testing.T) {
	app := testutil.NewTestApp(t)
	ensureWaitlistCollectionForUnitTest(t, app)
	entry := createWaitlistRecordForUnitTest(t, app, map[string]any{
		"email":  "approved@example.com",
		"status": WaitlistStatusApproved,
		"source": "mobile_signup",
	})

	token, err := GenerateWaitlistApprovalToken(app, entry)
	if err != nil {
		t.Fatalf("expected waitlist approval token generation to succeed: %v", err)
	}
	if strings.TrimSpace(token) == "" {
		t.Fatal("expected generated waitlist approval token")
	}

	reloaded, err := app.FindRecordById("waitlist_entries", entry.Id)
	if err != nil {
		t.Fatalf("failed to reload waitlist entry: %v", err)
	}
	if got := reloaded.GetString("approvalTokenNonceHash"); got == "" {
		t.Fatal("expected approval token nonce hash to be stored")
	}
	if got := reloaded.GetString("approvalTokenExpiresAt"); got == "" {
		t.Fatal("expected approval token expiry to be stored")
	}

	reserved, err := ValidateAndReserveWaitlistApprovalToken(app, " APPROVED@example.com ", token)
	if err != nil {
		t.Fatalf("expected waitlist approval token reservation to succeed: %v", err)
	}
	if reserved.Id != entry.Id {
		t.Fatalf("expected reserved entry %s, got %s", entry.Id, reserved.Id)
	}
	if got := reserved.GetString("approvalTokenUsedAt"); got == "" {
		t.Fatal("expected approval token used timestamp after reservation")
	}

	if _, err := ValidateAndReserveWaitlistApprovalToken(app, "approved@example.com", token); err == nil {
		t.Fatal("expected reused waitlist approval token to fail")
	}
}

func TestWaitlistApprovalTokenRejectsEmailMismatchAndForgery(t *testing.T) {
	app := testutil.NewTestApp(t)
	ensureWaitlistCollectionForUnitTest(t, app)
	entry := createWaitlistRecordForUnitTest(t, app, map[string]any{
		"email":  "approved@example.com",
		"status": WaitlistStatusApproved,
		"source": "mobile_signup",
	})

	token, err := GenerateWaitlistApprovalToken(app, entry)
	if err != nil {
		t.Fatalf("expected waitlist approval token generation to succeed: %v", err)
	}

	if _, err := ValidateAndReserveWaitlistApprovalToken(app, "attacker@example.com", token); err == nil {
		t.Fatal("expected waitlist approval token with mismatched email to fail")
	}

	forgedToken := token + "x"
	if _, err := ValidateAndReserveWaitlistApprovalToken(app, "approved@example.com", forgedToken); err == nil {
		t.Fatal("expected forged waitlist approval token to fail")
	}
}

func TestWaitlistApprovalTokenRejectsExpiredToken(t *testing.T) {
	app := testutil.NewTestApp(t)
	ensureWaitlistCollectionForUnitTest(t, app)
	entry := createWaitlistRecordForUnitTest(t, app, map[string]any{
		"email":  "approved@example.com",
		"status": WaitlistStatusApproved,
		"source": "mobile_signup",
	})
	nonce := security.RandomString(32)
	entry.Set("approvalTokenNonceHash", hashWaitlistApprovalNonce(nonce))
	if err := app.Save(entry); err != nil {
		t.Fatalf("failed to save waitlist token nonce hash: %v", err)
	}

	token, err := security.NewJWT(map[string]any{
		"type":    waitlistApprovalTokenType,
		"entryId": entry.Id,
		"email":   "approved@example.com",
		"nonce":   nonce,
	}, waitlistApprovalSigningKey(app), -time.Minute)
	if err != nil {
		t.Fatalf("failed to build expired waitlist approval token: %v", err)
	}

	if _, err := ValidateAndReserveWaitlistApprovalToken(app, "approved@example.com", token); err == nil {
		t.Fatal("expected expired waitlist approval token to fail")
	}
}
