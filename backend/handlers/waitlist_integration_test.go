package handlers_test

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/lib"
)

func ensureWaitlistCollection(t *testing.T, app core.App) {
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
	if got := normalizedRecord.GetString("joinedEmailSentAt"); got == "" {
		t.Fatal("expected joined email sent timestamp")
	}
	if got := normalizedRecord.GetString("lastJoinedEmailError"); got != "" {
		t.Fatalf("expected no joined email error after successful test send, got %q", got)
	}

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
	if got := reloaded.GetString("source"); got != "mobile_signup" {
		t.Fatalf("expected source update, got %q", got)
	}
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
	metadataMap = parseAuditMetadata(t, auditLogs[0].Get("metadataJson"))
	if metadataMap["source"] != "admin_waitlist_decision" || metadataMap["decision"] != "rejected" {
		t.Fatalf("unexpected reject audit metadata: %#v", metadataMap)
	}
}
