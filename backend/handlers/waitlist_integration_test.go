package handlers_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/lib"
)

func ensureWaitlistCollection(t *testing.T, app core.App) {
	t.Helper()

	if collection, err := app.FindCollectionByNameOrId("waitlist_entries"); err == nil {
		ensureWaitlistApprovalTokenFields(t, app, collection)
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

func ensureWaitlistApprovalTokenFields(t *testing.T, app core.App, collection *core.Collection) {
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

func TestWaitlistJoinCreatesAndUpdatesPendingEntry(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		ensureWaitlistCollection(t, app)
		handlers.RegisterWaitlistHandlers(se, app, lib.LoadRuntimeResourcesFromEnv())
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/waitlist",
		"",
		`{"email":" USER@example.COM ","source":"mobile_signup"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", response.Code, response.Body.String())
	}
	normalizedRecord, err := server.app.FindFirstRecordByFilter(
		"waitlist_entries",
		"email = {:email}",
		map[string]any{"email": "user@example.com"},
	)
	if err != nil {
		t.Fatalf("expected normalized waitlist record: %v", err)
	}
	if got := normalizedRecord.GetString("status"); got != "pending" {
		t.Fatalf("expected pending status, got %q", got)
	}
	waitForWaitlistRecordField(t, server.app, normalizedRecord.Id, "joinedEmailSentAt")
	normalizedRecord, err = server.app.FindRecordById("waitlist_entries", normalizedRecord.Id)
	if err != nil {
		t.Fatalf("failed to reload normalized waitlist record: %v", err)
	}
	if got := normalizedRecord.GetString("lastJoinedEmailError"); got != "" {
		t.Fatalf("expected no joined email error after successful test send, got %q", got)
	}
	waitForWaitlistTransitionCompletion(t, server.app, normalizedRecord.Id)

	record := createCollectionRecord(t, server.app, "waitlist_entries", map[string]any{
		"email":  "dupe@example.com",
		"status": "pending",
		"source": "old",
	})

	response = performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/waitlist",
		"",
		`{"email":"dupe@example.com","source":"mobile_signup"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected duplicate upsert 200, got %d body=%s", response.Code, response.Body.String())
	}

	reloaded, err := server.app.FindRecordById("waitlist_entries", record.Id)
	if err != nil {
		t.Fatalf("failed to reload waitlist entry: %v", err)
	}
	if got := reloaded.GetString("source"); got != "old" {
		t.Fatalf("expected pending replay to preserve source, got %q", got)
	}
}

func TestWaitlistJoinReturnsEquivalentResponsesWithoutDowngradingState(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		ensureWaitlistCollection(t, app)
		handlers.RegisterWaitlistHandlers(se, app, lib.LoadRuntimeResourcesFromEnv())
	})

	testCases := []struct {
		name           string
		email          string
		initialStatus  string
		expectedStatus string
	}{
		{name: "absent", email: "absent@example.com", expectedStatus: "pending"},
		{name: "pending", email: "pending@example.com", initialStatus: "pending", expectedStatus: "pending"},
		{name: "rejected", email: "rejected@example.com", initialStatus: "rejected", expectedStatus: "pending"},
		{name: "approved", email: "approved@example.com", initialStatus: "approved", expectedStatus: "approved"},
		{name: "signed up", email: "signed-up@example.com", initialStatus: "signed_up", expectedStatus: "signed_up"},
	}

	var expectedBody string
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if testCase.initialStatus != "" {
				createCollectionRecord(t, server.app, "waitlist_entries", map[string]any{
					"email":  testCase.email,
					"status": testCase.initialStatus,
					"source": "mobile_signup",
				})
			}

			response := performJSONRequest(
				t,
				server.mux,
				http.MethodPost,
				"/api/waitlist",
				"",
				`{"email":"`+testCase.email+`","source":"mobile_signup"}`,
			)
			if response.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d body=%s", response.Code, response.Body.String())
			}
			if expectedBody == "" {
				expectedBody = response.Body.String()
			}
			if got := response.Body.String(); got != expectedBody || got != "{\"success\":true}\n" {
				t.Fatalf("expected generic response %q, got %q", expectedBody, got)
			}

			record, err := server.app.FindFirstRecordByFilter(
				"waitlist_entries",
				"email = {:email}",
				map[string]any{"email": testCase.email},
			)
			if err != nil {
				t.Fatalf("expected waitlist entry: %v", err)
			}
			if got := record.GetString("status"); got != testCase.expectedStatus {
				t.Fatalf("expected status %q, got %q", testCase.expectedStatus, got)
			}
		})
	}
}

func TestWaitlistJoinResponseDoesNotWaitForStateDependentEmail(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		ensureWaitlistCollection(t, app)
		handlers.RegisterWaitlistHandlers(se, app, lib.LoadRuntimeResourcesFromEnv())
	})

	mailerStarted := make(chan struct{})
	releaseMailer := make(chan struct{})
	server.app.OnMailerSend().BindFunc(func(e *core.MailerEvent) error {
		close(mailerStarted)
		<-releaseMailer
		return e.Next()
	})
	t.Cleanup(func() {
		select {
		case <-releaseMailer:
		default:
			close(releaseMailer)
		}
	})

	responseReady := make(chan *http.Response, 1)
	go func() {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			"/api/waitlist",
			"",
			`{"email":"timing@example.com","source":"mobile_signup"}`,
		)
		responseReady <- response.Result()
	}()

	select {
	case <-mailerStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("expected joined email side effect to start")
	}

	select {
	case response := <-responseReady:
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 while email was blocked, got %d", response.StatusCode)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("waitlist response was delayed by state-dependent email work")
	}

	record, err := server.app.FindFirstRecordByFilter(
		"waitlist_entries",
		"email = {:email}",
		map[string]any{"email": "timing@example.com"},
	)
	if err != nil {
		t.Fatalf("expected waitlist entry: %v", err)
	}
	record.Set("status", "approved")
	record.Set("approvalTokenNonceHash", "approval-token-state")
	if err := server.app.Save(record); err != nil {
		t.Fatalf("failed to simulate concurrent approval: %v", err)
	}

	close(releaseMailer)
	waitForWaitlistRecordField(t, server.app, record.Id, "joinedEmailSentAt")
	record, err = server.app.FindRecordById("waitlist_entries", record.Id)
	if err != nil {
		t.Fatalf("failed to reload concurrently approved entry: %v", err)
	}
	if got := record.GetString("status"); got != "approved" {
		t.Fatalf("expected joined email metadata update to preserve approved status, got %q", got)
	}
	if got := record.GetString("approvalTokenNonceHash"); got != "approval-token-state" {
		t.Fatalf("expected joined email metadata update to preserve approval token state, got %q", got)
	}
}

func waitForWaitlistRecordField(t *testing.T, app core.App, recordID string, fieldName string) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		record, err := app.FindRecordById("waitlist_entries", recordID)
		if err == nil && record.GetString(fieldName) != "" {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("timed out waiting for waitlist field %s", fieldName)
}

func waitForWaitlistTransitionCompletion(t *testing.T, app core.App, entryID string) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		transitions, err := app.FindRecordsByFilter(
			"waitlist_join_transitions",
			"waitlistEntry = {:entryID}",
			"created",
			10,
			0,
			map[string]any{"entryID": entryID},
		)
		if err == nil && len(transitions) == 1 &&
			!transitions[0].GetBool("contactSyncPending") &&
			!transitions[0].GetBool("joinedEventPending") {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatal("timed out waiting for waitlist transition completion")
}

func TestAdminWaitlistApproveAndReject(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		ensureWaitlistCollection(t, app)
		handlers.RegisterWaitlistHandlers(se, app, lib.LoadRuntimeResourcesFromEnv())
	})
	admin, token := createAuthUser(t, server.app, true, true)
	entry := createCollectionRecord(t, server.app, "waitlist_entries", map[string]any{
		"email":  "pending@example.com",
		"status": "pending",
		"source": "mobile_signup",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/waitlist/"+entry.Id+"/approve",
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected approve 200, got %d body=%s", response.Code, response.Body.String())
	}
	reloaded, err := server.app.FindRecordById("waitlist_entries", entry.Id)
	if err != nil {
		t.Fatalf("failed to reload approved entry: %v", err)
	}
	if got := reloaded.GetString("status"); got != "approved" {
		t.Fatalf("expected approved status, got %q", got)
	}
	if got := reloaded.GetString("approvedBy"); got != admin.Id {
		t.Fatalf("expected approvedBy=%s, got %s", admin.Id, got)
	}
	auditLogs, err := server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         core.ModelEventTypeUpdate,
			"collection":     "waitlist_entries",
			"targetRecordId": entry.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load approve audit logs: %v", err)
	}
	if len(auditLogs) != 1 {
		t.Fatalf("expected 1 approve audit log, got %d", len(auditLogs))
	}
	metadataMap := parseAuditMetadata(t, auditLogs[0].Get("metadataJson"))
	if metadataMap["source"] != "admin_waitlist_decision" || metadataMap["decision"] != "approved" {
		t.Fatalf("unexpected approve audit metadata: %#v", metadataMap)
	}

	response = performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/waitlist/"+entry.Id+"/reject",
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected reject 200, got %d body=%s", response.Code, response.Body.String())
	}
	reloaded, err = server.app.FindRecordById("waitlist_entries", entry.Id)
	if err != nil {
		t.Fatalf("failed to reload rejected entry: %v", err)
	}
	if got := reloaded.GetString("status"); got != "rejected" {
		t.Fatalf("expected rejected status, got %q", got)
	}
	auditLogs, err = server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         core.ModelEventTypeUpdate,
			"collection":     "waitlist_entries",
			"targetRecordId": entry.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load reject audit logs: %v", err)
	}
	if len(auditLogs) != 2 {
		t.Fatalf("expected approve and reject audit logs, got %d", len(auditLogs))
	}
	foundRejectAudit := false
	for _, auditLog := range auditLogs {
		metadataMap = parseAuditMetadata(t, auditLog.Get("metadataJson"))
		if metadataMap["source"] == "admin_waitlist_decision" && metadataMap["decision"] == "rejected" {
			foundRejectAudit = true
			break
		}
	}
	if !foundRejectAudit {
		t.Fatalf("expected reject audit metadata in logs, got %#v", auditLogs)
	}
}
