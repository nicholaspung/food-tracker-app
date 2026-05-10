package handlers

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/testutil"
)

func ensureWaitlistCollectionForUnitTest(t *testing.T, app core.App) {
	t.Helper()

	if _, err := app.FindCollectionByNameOrId("waitlist_entries"); err == nil {
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
	collection.Fields.Add(&core.TextField{Name: "lastLoopsSyncError", Max: 2000})
	collection.Fields.Add(&core.DateField{Name: "joinedEmailSentAt"})
	collection.Fields.Add(&core.TextField{Name: "lastJoinedEmailError", Max: 2000})
	collection.Fields.Add(&core.DateField{Name: "created"})
	collection.Fields.Add(&core.DateField{Name: "updated"})

	if err := app.Save(collection); err != nil {
		t.Fatalf("failed to create waitlist_entries collection: %v", err)
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
