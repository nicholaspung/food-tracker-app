package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/testutil"
)

func TestWaitlistJoinTransitionOutboxMigratesLegacyPendingWork(t *testing.T) {
	app := testutil.NewTestApp(t)
	existingOutbox, err := app.FindCollectionByNameOrId(waitlistJoinTransitionsCollection)
	if err != nil {
		t.Fatalf("failed to resolve existing transition outbox: %v", err)
	}
	if err := app.Delete(existingOutbox); err != nil {
		t.Fatalf("failed to reset transition outbox: %v", err)
	}

	waitlistCollection, err := app.FindCollectionByNameOrId("waitlist_entries")
	if err != nil {
		t.Fatalf("failed to resolve waitlist entries: %v", err)
	}
	entry := createLegacyPendingWaitlistEntry(t, app, waitlistCollection, "legacy-approved@example.com", "approved", "legacy_source")
	secondEntry := createLegacyPendingWaitlistEntry(t, app, waitlistCollection, "legacy-second@example.com", "pending", "second_source")
	signedUpEntry := createLegacyPendingWaitlistEntry(t, app, waitlistCollection, "legacy-signed-up@example.com", "signed_up", "signed_up_source")

	if err := createWaitlistJoinTransitionOutboxWithBatchSize(app, 1); err != nil {
		t.Fatalf("failed to migrate legacy pending work: %v", err)
	}
	for _, record := range []*core.Record{entry, secondEntry, signedUpEntry} {
		reloaded, err := app.FindRecordById("waitlist_entries", record.Id)
		if err != nil {
			t.Fatalf("failed to reload legacy waitlist entry: %v", err)
		}
		if reloaded.GetBool("loopsSyncPending") {
			t.Fatalf("expected legacy pending flag for %s to move into the transition outbox", record.GetString("email"))
		}
	}
	transitions, err := app.FindRecordsByFilter(
		waitlistJoinTransitionsCollection,
		"waitlistEntry = {:entryID}",
		"created",
		10,
		0,
		map[string]any{"entryID": entry.Id},
	)
	if err != nil {
		t.Fatalf("failed to load migrated transition: %v", err)
	}
	if len(transitions) != 1 {
		t.Fatalf("expected one migrated transition, got %d", len(transitions))
	}
	transition := transitions[0]
	if !transition.GetBool("contactSyncPending") || transition.GetBool("joinedEventPending") {
		t.Fatal("expected legacy work to preserve contact reconciliation without inventing a joined event")
	}
	if transition.GetString("currentStatus") != "approved" || transition.GetString("source") != "legacy_source" {
		t.Fatalf("expected migrated authoritative state, got status=%q source=%q", transition.GetString("currentStatus"), transition.GetString("source"))
	}
	if transition.GetString("idempotencyKey") != "legacy-"+entry.Id {
		t.Fatalf("expected stable legacy idempotency key, got %q", transition.GetString("idempotencyKey"))
	}
	allTransitions, err := app.FindRecordsByFilter(waitlistJoinTransitionsCollection, "", "created,id", 10, 0)
	if err != nil || len(allTransitions) != 3 {
		t.Fatalf("expected batch continuation to migrate all records, got %d transitions (err=%v)", len(allTransitions), err)
	}
	for _, migrated := range allTransitions {
		if migrated.GetBool("joinedEventPending") {
			t.Fatalf("expected ambiguous legacy transition %s not to enqueue a joined event", migrated.Id)
		}
	}

	if err := removeWaitlistJoinTransitionOutbox(app); err != nil {
		t.Fatalf("failed to roll back transition outbox: %v", err)
	}
	for _, record := range []*core.Record{entry, secondEntry, signedUpEntry} {
		reloaded, err := app.FindRecordById("waitlist_entries", record.Id)
		if err != nil {
			t.Fatalf("failed to reload rolled-back waitlist entry: %v", err)
		}
		if !reloaded.GetBool("loopsSyncPending") {
			t.Fatalf("expected rollback to restore legacy pending work for %s", record.GetString("email"))
		}
	}
}

func createLegacyPendingWaitlistEntry(
	t *testing.T,
	app core.App,
	collection *core.Collection,
	email string,
	status string,
	source string,
) *core.Record {
	t.Helper()
	record := core.NewRecord(collection)
	record.Set("email", email)
	record.Set("status", status)
	record.Set("source", source)
	record.Set("loopsSyncPending", true)
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to seed legacy pending work: %v", err)
	}
	return record
}
