package handlers

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"

	"myapp/lib"
	"myapp/testutil"
)

type fakeWaitlistLoopsClient struct {
	contactAttempts       []lib.LoopsContactInput
	eventAttempts         []lib.LoopsEventInput
	successfulEvents      []lib.LoopsEventInput
	contactFailuresBefore int
	eventFailuresBefore   int
}

func (client *fakeWaitlistLoopsClient) UpsertContact(input lib.LoopsContactInput) (string, error) {
	client.contactAttempts = append(client.contactAttempts, input)
	if client.contactFailuresBefore > 0 {
		client.contactFailuresBefore--
		return "", fmt.Errorf("contact provider unavailable")
	}
	return "loops-contact-id", nil
}

func (client *fakeWaitlistLoopsClient) SendEvent(input lib.LoopsEventInput) error {
	client.eventAttempts = append(client.eventAttempts, input)
	if client.eventFailuresBefore > 0 {
		client.eventFailuresBefore--
		return fmt.Errorf("event provider unavailable")
	}
	client.successfulEvents = append(client.successfulEvents, input)
	return nil
}

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

func findWaitlistJoinTransitionsForUnitTest(t *testing.T, app core.App, entryID string) []*core.Record {
	t.Helper()

	records, err := app.FindRecordsByFilter(
		waitlistJoinTransitionsName,
		"waitlistEntry = {:entryID}",
		"created",
		100,
		0,
		map[string]any{"entryID": entryID},
	)
	if err != nil {
		t.Fatalf("failed to load waitlist join transitions: %v", err)
	}
	return records
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

func TestUpsertWaitlistEntryPreservesNonTransitions(t *testing.T) {
	app := testutil.NewTestApp(t)
	ensureWaitlistCollectionForUnitTest(t, app)

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}
	user := core.NewRecord(usersCollection)
	user.Set("email", "waitlist-owner@example.com")
	user.Set("defaultRestaurantVisibility", "friends")
	user.Set("defaultVisitVisibility", "friends")
	user.SetPassword("password123")
	if err := app.Save(user); err != nil {
		t.Fatalf("failed to create associated user: %v", err)
	}

	testCases := []struct {
		name        string
		status      string
		association string
	}{
		{name: "pending", status: WaitlistStatusPending},
		{name: "approved", status: WaitlistStatusApproved, association: "approvedBy"},
		{name: "signed up", status: WaitlistStatusSignedUp, association: "signedUpUser"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			data := map[string]any{
				"email":             strings.ReplaceAll(testCase.name, " ", "-") + "@example.com",
				"status":            testCase.status,
				"source":            "original_source",
				"joinedEmailSentAt": "2026-05-10 12:00:00.000Z",
			}
			if testCase.association != "" {
				data[testCase.association] = user.Id
			}
			record := createWaitlistRecordForUnitTest(t, app, data)

			result, err := upsertWaitlistEntry(
				app,
				waitlistRequest{Email: data["email"].(string), Source: "attacker_source"},
				data["email"].(string),
			)
			if err != nil {
				t.Fatalf("replay upsert failed: %v", err)
			}
			if result.DidTransition {
				t.Fatal("expected replay not to create a lifecycle transition")
			}
			if result.PreviousStatus != testCase.status || result.CurrentStatus != testCase.status {
				t.Fatalf("expected stable %q status, got %#v", testCase.status, result)
			}

			reloaded, err := app.FindRecordById("waitlist_entries", record.Id)
			if err != nil {
				t.Fatalf("failed to reload replayed record: %v", err)
			}
			if got := reloaded.GetString("source"); got != "original_source" {
				t.Fatalf("expected source preservation, got %q", got)
			}
			if transitions := findWaitlistJoinTransitionsForUnitTest(t, app, record.Id); len(transitions) != 0 {
				t.Fatalf("expected replay not to enqueue Loops work, got %d transitions", len(transitions))
			}
			if testCase.association != "" && reloaded.GetString(testCase.association) != user.Id {
				t.Fatalf("expected %s association to be preserved", testCase.association)
			}
		})
	}
}

func TestWaitlistJoinWorkerEmitsOnlyForLifecycleTransitions(t *testing.T) {
	app := testutil.NewTestApp(t)
	ensureWaitlistCollectionForUnitTest(t, app)
	client := &fakeWaitlistLoopsClient{}
	worker := &waitlistJoinWorker{
		app:              app,
		runtimeResources: lib.RuntimeResources{},
		workBatchSize:    1,
		newLoopsClient: func() waitlistLoopsClient {
			return client
		},
	}

	result, err := upsertWaitlistEntry(app, waitlistRequest{Source: "first_source"}, "lifecycle@example.com")
	if err != nil {
		t.Fatalf("first join failed: %v", err)
	}
	if !result.DidTransition || result.PreviousStatus != "" || result.CurrentStatus != WaitlistStatusPending {
		t.Fatalf("expected absent-to-pending transition, got %#v", result)
	}
	record, err := findWaitlistRecordByEmail(app, "lifecycle@example.com")
	if err != nil {
		t.Fatalf("failed to find first join record: %v", err)
	}
	if err := updateWaitlistJoinedEmailState(app, record.Id, "2026-05-10 12:00:00.000Z", ""); err != nil {
		t.Fatalf("failed to suppress SMTP work in Loops test: %v", err)
	}
	worker.drain()

	if len(client.contactAttempts) != 1 || client.contactAttempts[0].Properties["waitlistStatus"] != WaitlistStatusPending {
		t.Fatalf("expected one authoritative pending contact sync, got %#v", client.contactAttempts)
	}
	if len(client.successfulEvents) != 1 || client.successfulEvents[0].EventName != WaitlistJoinedEventName {
		t.Fatalf("expected one successful joined event, got %#v", client.successfulEvents)
	}

	if _, err := upsertWaitlistEntry(app, waitlistRequest{Source: "replay_source"}, "lifecycle@example.com"); err != nil {
		t.Fatalf("pending replay failed: %v", err)
	}
	worker.drain()
	if len(client.contactAttempts) != 1 || len(client.successfulEvents) != 1 {
		t.Fatalf("expected pending replay to emit no Loops work, got %d contacts and %d events", len(client.contactAttempts), len(client.successfulEvents))
	}

	record, err = findWaitlistRecordByEmail(app, "lifecycle@example.com")
	if err != nil {
		t.Fatalf("failed to reload waitlist record: %v", err)
	}
	if got := record.GetString("source"); got != "first_source" {
		t.Fatalf("expected pending replay to preserve source, got %q", got)
	}
	record.Set("status", WaitlistStatusRejected)
	record.Set("rejectedAt", "2026-05-11 12:00:00.000Z")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to prepare rejected entry: %v", err)
	}

	result, err = upsertWaitlistEntry(app, waitlistRequest{Source: "rejoin_source"}, "lifecycle@example.com")
	if err != nil {
		t.Fatalf("rejected rejoin failed: %v", err)
	}
	if !result.DidTransition || result.PreviousStatus != WaitlistStatusRejected || result.CurrentStatus != WaitlistStatusPending {
		t.Fatalf("expected rejected-to-pending transition, got %#v", result)
	}
	record, err = findWaitlistRecordByEmail(app, "lifecycle@example.com")
	if err != nil {
		t.Fatalf("failed to reload rejoined record: %v", err)
	}
	if err := updateWaitlistJoinedEmailState(app, record.Id, "2026-05-12 12:00:00.000Z", ""); err != nil {
		t.Fatalf("failed to suppress rejoin SMTP work: %v", err)
	}
	worker.drain()

	if len(client.contactAttempts) != 2 || len(client.successfulEvents) != 2 {
		t.Fatalf("expected exactly one contact sync and event per transition, got %d contacts and %d events", len(client.contactAttempts), len(client.successfulEvents))
	}
	if got := client.successfulEvents[1].EventProperties["source"]; got != "rejoin_source" {
		t.Fatalf("expected rejoin event source, got %#v", got)
	}
}

func TestWaitlistJoinWorkerPreservesOverlappingTransitions(t *testing.T) {
	app := testutil.NewTestApp(t)
	ensureWaitlistCollectionForUnitTest(t, app)
	client := &fakeWaitlistLoopsClient{}
	worker := &waitlistJoinWorker{
		app:              app,
		runtimeResources: lib.RuntimeResources{},
		newLoopsClient: func() waitlistLoopsClient {
			return client
		},
	}

	if _, err := upsertWaitlistEntry(app, waitlistRequest{Source: "first_source"}, "overlap@example.com"); err != nil {
		t.Fatalf("first join failed: %v", err)
	}
	record, err := findWaitlistRecordByEmail(app, "overlap@example.com")
	if err != nil {
		t.Fatalf("failed to find first join record: %v", err)
	}
	record.Set("status", WaitlistStatusRejected)
	record.Set("rejectedAt", "2026-05-10 12:00:00.000Z")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to prepare rejected entry: %v", err)
	}
	if _, err := upsertWaitlistEntry(app, waitlistRequest{Source: "rejoin_source"}, "overlap@example.com"); err != nil {
		t.Fatalf("rejected rejoin failed: %v", err)
	}
	if err := updateWaitlistJoinedEmailState(app, record.Id, "2026-05-11 12:00:00.000Z", ""); err != nil {
		t.Fatalf("failed to suppress SMTP work: %v", err)
	}

	transitions := findWaitlistJoinTransitionsForUnitTest(t, app, record.Id)
	if len(transitions) != 2 {
		t.Fatalf("expected two durable transitions, got %d", len(transitions))
	}
	if transitions[0].GetString("idempotencyKey") == transitions[1].GetString("idempotencyKey") {
		t.Fatal("expected each lifecycle transition to have its own idempotency key")
	}
	worker.drain()

	if len(client.contactAttempts) != 2 || len(client.successfulEvents) != 2 {
		t.Fatalf("expected both overlapping transitions to complete, got %d contacts and %d events", len(client.contactAttempts), len(client.successfulEvents))
	}
	eventSources := map[any]bool{}
	for _, event := range client.successfulEvents {
		eventSources[event.EventProperties["source"]] = true
	}
	if !eventSources["first_source"] || !eventSources["rejoin_source"] {
		t.Fatalf("expected one event for each transition source, got %#v", eventSources)
	}
	for _, transition := range findWaitlistJoinTransitionsForUnitTest(t, app, record.Id) {
		if transition.GetBool("contactSyncPending") || transition.GetBool("joinedEventPending") {
			t.Fatalf("expected transition %s to complete independently", transition.Id)
		}
	}
}

func TestWaitlistJoinWorkerLoopsFailureDoesNotStarveSMTPOrLaterEntries(t *testing.T) {
	app := testutil.NewTestApp(t)
	ensureWaitlistCollectionForUnitTest(t, app)
	client := &fakeWaitlistLoopsClient{contactFailuresBefore: 1}
	worker := &waitlistJoinWorker{
		app:              app,
		runtimeResources: lib.RuntimeResources{},
		workBatchSize:    1,
		newLoopsClient: func() waitlistLoopsClient {
			return client
		},
	}

	for _, email := range []string{"provider-failure@example.com", "later-join@example.com"} {
		if _, err := upsertWaitlistEntry(app, waitlistRequest{Source: "mobile_signup"}, email); err != nil {
			t.Fatalf("join for %s failed: %v", email, err)
		}
	}
	worker.drain()

	for _, email := range []string{"provider-failure@example.com", "later-join@example.com"} {
		record, err := findWaitlistRecordByEmail(app, email)
		if err != nil {
			t.Fatalf("failed to reload %s: %v", email, err)
		}
		if record.GetString("joinedEmailSentAt") == "" {
			t.Fatalf("expected Loops failure not to block SMTP for %s", email)
		}
	}
	if len(client.contactAttempts) != 2 || len(client.successfulEvents) != 1 {
		t.Fatalf("expected later Loops work to progress after one failure, got %d contacts and %d events", len(client.contactAttempts), len(client.successfulEvents))
	}
}

func TestSyncWaitlistContactToLoopsUsesAuthoritativeFinalizedState(t *testing.T) {
	app := testutil.NewTestApp(t)
	ensureWaitlistCollectionForUnitTest(t, app)

	testCases := []struct {
		status    string
		dateField string
		userID    string
	}{
		{status: WaitlistStatusApproved, dateField: "approvedAt"},
		{status: WaitlistStatusSignedUp, dateField: "signedUpAt", userID: "signed-up-user-id"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.status, func(t *testing.T) {
			record := createWaitlistRecordForUnitTest(t, app, map[string]any{
				"email":  testCase.status + "-sync@example.com",
				"status": testCase.status,
				"source": "original_source",
			})
			record.Set(testCase.dateField, "2026-05-10 12:00:00.000Z")
			record.Set("signedUpUser", testCase.userID)
			client := &fakeWaitlistLoopsClient{}

			if _, err := syncWaitlistContactToLoops(lib.RuntimeResources{}, client, record); err != nil {
				t.Fatalf("contact sync failed: %v", err)
			}
			if len(client.contactAttempts) != 1 {
				t.Fatalf("expected one contact sync, got %d", len(client.contactAttempts))
			}
			input := client.contactAttempts[0]
			if got := input.Properties["waitlistStatus"]; got != testCase.status {
				t.Fatalf("expected authoritative status %q, got %#v", testCase.status, got)
			}
			if got := input.Properties[testCase.dateField]; got != "2026-05-10 12:00:00.000Z" {
				t.Fatalf("expected authoritative lifecycle date, got %#v", got)
			}
			if input.Source != "original_source" || input.UserID != testCase.userID {
				t.Fatalf("expected preserved source and user association, got %#v", input)
			}
		})
	}
}

func TestWaitlistJoinWorkerTreatsMissingLoopsConfigurationAsCompletedNoOp(t *testing.T) {
	t.Setenv("LOOPS_API_KEY", "")
	app := testutil.NewTestApp(t)
	ensureWaitlistCollectionForUnitTest(t, app)
	worker := &waitlistJoinWorker{
		app:              app,
		runtimeResources: lib.RuntimeResources{},
		newLoopsClient: func() waitlistLoopsClient {
			return lib.NewLoopsClientFromEnv()
		},
	}

	if _, err := upsertWaitlistEntry(app, waitlistRequest{Source: "mobile_signup"}, "unconfigured-loops@example.com"); err != nil {
		t.Fatalf("join failed: %v", err)
	}
	record, err := findWaitlistRecordByEmail(app, "unconfigured-loops@example.com")
	if err != nil {
		t.Fatalf("failed to find waitlist record: %v", err)
	}
	if err := updateWaitlistJoinedEmailState(app, record.Id, "2026-05-10 12:00:00.000Z", ""); err != nil {
		t.Fatalf("failed to suppress SMTP work: %v", err)
	}

	worker.drain()
	record, err = app.FindRecordById("waitlist_entries", record.Id)
	if err != nil {
		t.Fatalf("failed to reload waitlist record: %v", err)
	}
	transitions := findWaitlistJoinTransitionsForUnitTest(t, app, record.Id)
	if len(transitions) != 1 || transitions[0].GetBool("contactSyncPending") || transitions[0].GetBool("joinedEventPending") {
		t.Fatal("expected missing Loops configuration to complete as a safe no-op")
	}
	if record.GetString("lastLoopsSyncError") != "" {
		t.Fatalf("expected no provider error without configuration, got %q", record.GetString("lastLoopsSyncError"))
	}
}

func TestWaitlistJoinWorkerRetriesProviderPhasesWithoutDuplicateSuccessfulEvents(t *testing.T) {
	app := testutil.NewTestApp(t)
	ensureWaitlistCollectionForUnitTest(t, app)
	client := &fakeWaitlistLoopsClient{contactFailuresBefore: 1, eventFailuresBefore: 1}
	worker := &waitlistJoinWorker{
		app:              app,
		runtimeResources: lib.RuntimeResources{},
		newLoopsClient: func() waitlistLoopsClient {
			return client
		},
	}

	if _, err := upsertWaitlistEntry(app, waitlistRequest{Source: "mobile_signup"}, "retry-loops@example.com"); err != nil {
		t.Fatalf("join failed: %v", err)
	}
	record, err := findWaitlistRecordByEmail(app, "retry-loops@example.com")
	if err != nil {
		t.Fatalf("failed to find retry record: %v", err)
	}
	if err := updateWaitlistJoinedEmailState(app, record.Id, "2026-05-10 12:00:00.000Z", ""); err != nil {
		t.Fatalf("failed to suppress SMTP work in retry test: %v", err)
	}

	transitions := findWaitlistJoinTransitionsForUnitTest(t, app, record.Id)
	if len(transitions) != 1 {
		t.Fatalf("expected one durable transition, got %d", len(transitions))
	}
	transition := transitions[0]

	worker.drain()
	transition, _ = app.FindRecordById(waitlistJoinTransitionsName, transition.Id)
	if !transition.GetBool("contactSyncPending") || !transition.GetBool("joinedEventPending") {
		t.Fatal("expected contact failure to preserve both pending phases")
	}

	worker.drain()
	transition, _ = app.FindRecordById(waitlistJoinTransitionsName, transition.Id)
	if transition.GetBool("contactSyncPending") || !transition.GetBool("joinedEventPending") {
		t.Fatal("expected contact success and event failure to preserve only event work")
	}
	firstAttemptedAt := transition.GetString("joinedEventAttemptedAt")
	if firstAttemptedAt == "" {
		t.Fatal("expected the provider attempt to be recorded before retry")
	}

	worker.drain()
	worker.drain()
	record, _ = app.FindRecordById("waitlist_entries", record.Id)
	transition, _ = app.FindRecordById(waitlistJoinTransitionsName, transition.Id)
	if transition.GetBool("contactSyncPending") || transition.GetBool("joinedEventPending") {
		t.Fatal("expected successful retry to complete all provider work")
	}
	if len(client.contactAttempts) != 2 {
		t.Fatalf("expected contact phase not to replay after success, got %d attempts", len(client.contactAttempts))
	}
	if len(client.eventAttempts) != 2 || len(client.successfulEvents) != 1 {
		t.Fatalf("expected one failed and one successful event attempt, got %d attempts and %d successes", len(client.eventAttempts), len(client.successfulEvents))
	}
	if client.eventAttempts[0].IdempotencyKey == "" || client.eventAttempts[0].IdempotencyKey != client.eventAttempts[1].IdempotencyKey {
		t.Fatalf("expected retries to reuse one durable event idempotency key, got %#v", client.eventAttempts)
	}
	if transition.GetString("joinedEventSentAt") == "" || transition.GetString("lastError") != "" || record.GetString("lastLoopsSyncError") != "" {
		t.Fatalf("expected successful event state, got sentAt=%q transitionError=%q recordError=%q", transition.GetString("joinedEventSentAt"), transition.GetString("lastError"), record.GetString("lastLoopsSyncError"))
	}
	if transition.GetString("joinedEventAttemptedAt") != firstAttemptedAt {
		t.Fatalf("expected retries to preserve the first attempt time, got first=%q final=%q", firstAttemptedAt, transition.GetString("joinedEventAttemptedAt"))
	}
}

func TestWaitlistJoinWorkerDoesNotResendAmbiguousEventAfterIdempotencyWindow(t *testing.T) {
	app := testutil.NewTestApp(t)
	ensureWaitlistCollectionForUnitTest(t, app)
	client := &fakeWaitlistLoopsClient{}
	worker := &waitlistJoinWorker{
		app:              app,
		runtimeResources: lib.RuntimeResources{},
		newLoopsClient: func() waitlistLoopsClient {
			return client
		},
	}

	if _, err := upsertWaitlistEntry(app, waitlistRequest{Source: "mobile_signup"}, "ambiguous-delivery@example.com"); err != nil {
		t.Fatalf("join failed: %v", err)
	}
	record, err := findWaitlistRecordByEmail(app, "ambiguous-delivery@example.com")
	if err != nil {
		t.Fatalf("failed to find waitlist record: %v", err)
	}
	transition := findWaitlistJoinTransitionsForUnitTest(t, app, record.Id)[0]
	if err := completeWaitlistLoopsContactSync(app, transition.Id, record.Id, "loops-contact-id"); err != nil {
		t.Fatalf("failed to complete contact phase: %v", err)
	}

	// Model provider acceptance followed by a crash or local completion failure:
	// the event was sent, but the durable pending bit was never cleared.
	if err := recordWaitlistJoinedEventAttempt(app, transition.Id, time.Now().UTC().Format("2006-01-02 15:04:05.000Z")); err != nil {
		t.Fatalf("failed to record prior attempt: %v", err)
	}
	if err := sendWaitlistJoinedEventToLoops(lib.RuntimeResources{}, client, record, transition); err != nil {
		t.Fatalf("simulated accepted event failed: %v", err)
	}
	transition, err = app.FindRecordById(waitlistJoinTransitionsName, transition.Id)
	if err != nil {
		t.Fatalf("failed to reload attempted transition: %v", err)
	}
	transition.Set("joinedEventAttemptedAt", time.Now().UTC().Add(-24*time.Hour))
	if err := app.Save(transition); err != nil {
		t.Fatalf("failed to advance beyond provider idempotency window: %v", err)
	}

	worker.drainLoopsTransitions()
	transition, err = app.FindRecordById(waitlistJoinTransitionsName, transition.Id)
	if err != nil {
		t.Fatalf("failed to reload transition: %v", err)
	}
	record, err = app.FindRecordById("waitlist_entries", record.Id)
	if err != nil {
		t.Fatalf("failed to reload waitlist record: %v", err)
	}
	if len(client.eventAttempts) != 1 || len(client.successfulEvents) != 1 {
		t.Fatalf("expected stale ambiguous delivery not to be resent, got %d attempts and %d successes", len(client.eventAttempts), len(client.successfulEvents))
	}
	if transition.GetBool("joinedEventPending") {
		t.Fatal("expected stale ambiguous delivery to leave the automatic retry queue")
	}
	if !strings.Contains(transition.GetString("lastError"), "manual reconciliation") ||
		!strings.Contains(record.GetString("lastLoopsSyncError"), "manual reconciliation") {
		t.Fatalf("expected visible reconciliation state, got transition=%q record=%q", transition.GetString("lastError"), record.GetString("lastLoopsSyncError"))
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
