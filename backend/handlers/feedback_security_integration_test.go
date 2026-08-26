package handlers_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/hooks"
)

func TestFeedbackCreatesDeriveWorkflowMetadataAndQueueOrderOnServer(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeedbackHandlers(se, app)
		hooks.RegisterFeedbackSecurityHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	forgedTime := time.Now().UTC().Add(365 * 24 * time.Hour).Truncate(time.Second)
	beforeCreate := time.Now().UTC().Add(-time.Second)
	rawResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/feedback/records",
		ownerToken,
		fmt.Sprintf(
			`{"user":"%s","title":"Legacy client","description":"Raw collection create","status":"closed","admin_unread_count":99,"user_unread_count":88,"last_message_at":"%s","assigned_admin":"%s","assigned_at":"%s","admin_reply_deadline_at":"%s"}`,
			owner.Id,
			forgedTime.Format(time.RFC3339),
			owner.Id,
			forgedTime.Format(time.RFC3339),
			forgedTime.Format(time.RFC3339),
		),
	)
	if rawResponse.Code != http.StatusOK {
		t.Fatalf("expected legacy raw create to return 200, got %d: %s", rawResponse.Code, rawResponse.Body.String())
	}

	rawPayload := parseJSONMap(t, rawResponse.Body.Bytes())
	rawID, _ := rawPayload["id"].(string)
	rawThread, err := server.app.FindRecordById("feedback", rawID)
	if err != nil {
		t.Fatalf("failed to reload raw-created feedback: %v", err)
	}
	assertCanonicalNewFeedback(t, rawThread, owner.Id, beforeCreate, forgedTime)

	time.Sleep(10 * time.Millisecond)
	customResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/feedback",
		ownerToken,
		fmt.Sprintf(
			`{"title":"  Current client  ","description":"  Authored fields only  ","user":"forged-owner","status":"resolved","admin_unread_count":77,"last_message_at":"%s","assigned_admin":"%s"}`,
			forgedTime.Format(time.RFC3339),
			owner.Id,
		),
	)
	if customResponse.Code != http.StatusOK {
		t.Fatalf("expected custom create to return 200, got %d: %s", customResponse.Code, customResponse.Body.String())
	}

	customPayload := parseJSONMap(t, customResponse.Body.Bytes())
	customID, _ := customPayload["id"].(string)
	customThread, err := server.app.FindRecordById("feedback", customID)
	if err != nil {
		t.Fatalf("failed to reload endpoint-created feedback: %v", err)
	}
	assertCanonicalNewFeedback(t, customThread, owner.Id, beforeCreate, forgedTime)
	if customThread.GetString("title") != "Current client" || customThread.GetString("description") != "Authored fields only" {
		t.Fatalf("expected authored content to be trimmed, got title=%q description=%q", customThread.GetString("title"), customThread.GetString("description"))
	}

	ordered, err := server.app.FindRecordsByFilter("feedback", "", "-last_message_at,-created", 50, 0)
	if err != nil {
		t.Fatalf("failed to load ordered feedback queue: %v", err)
	}
	orderedIDs := make([]string, 0, len(ordered))
	for _, thread := range ordered {
		orderedIDs = append(orderedIDs, thread.Id)
	}
	if len(ordered) != 2 || ordered[0].Id != customThread.Id || ordered[1].Id != rawThread.Id {
		t.Fatalf("expected server chronology to determine queue order, got ids %#v", orderedIDs)
	}
}

func TestFeedbackCreateEndpointReplaysIdempotencyKeyWithoutDuplicateThread(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeedbackHandlers(se, app)
	})

	_, ownerToken := createAuthUser(t, server.app, false, false)
	headers := map[string]string{"Idempotency-Key": "feedback-create-response-loss-1"}
	body := `{"title":"Response loss","description":"Create this support thread once"}`
	firstResponse := performJSONRequestWithHeaders(t, server.mux, http.MethodPost, "/api/feedback", ownerToken, body, headers)
	secondResponse := performJSONRequestWithHeaders(t, server.mux, http.MethodPost, "/api/feedback", ownerToken, body, headers)
	if firstResponse.Code != http.StatusOK || secondResponse.Code != http.StatusOK {
		t.Fatalf("expected both keyed creates to return 200, got first=%d second=%d: %s", firstResponse.Code, secondResponse.Code, secondResponse.Body.String())
	}

	firstPayload := parseJSONMap(t, firstResponse.Body.Bytes())
	secondPayload := parseJSONMap(t, secondResponse.Body.Bytes())
	if firstPayload["id"] == "" || secondPayload["id"] != firstPayload["id"] {
		t.Fatalf("expected replay to return the same feedback id, got first=%#v second=%#v", firstPayload["id"], secondPayload["id"])
	}
	if count := countRecordsByFilter(t, server.app, "feedback", "title = {:title}", map[string]any{"title": "Response loss"}); count != 1 {
		t.Fatalf("expected exactly one feedback thread after replay, got %d", count)
	}
}

func TestFeedbackCreateEndpointUsesCharacterLimitsForUnicodeContent(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeedbackHandlers(se, app)
	})

	_, ownerToken := createAuthUser(t, server.app, false, false)
	acceptedTitle := strings.Repeat("🍜", 100)
	acceptedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/feedback",
		ownerToken,
		fmt.Sprintf(`{"title":"%s","description":"Unicode title"}`, acceptedTitle),
	)
	if acceptedResponse.Code != http.StatusOK {
		t.Fatalf("expected 100-character Unicode title to return 200, got %d: %s", acceptedResponse.Code, acceptedResponse.Body.String())
	}

	rejectedTitle := strings.Repeat("🍜", 101)
	rejectedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/feedback",
		ownerToken,
		fmt.Sprintf(`{"title":"%s","description":"Unicode title"}`, rejectedTitle),
	)
	if rejectedResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 101-character Unicode title to return 400, got %d: %s", rejectedResponse.Code, rejectedResponse.Body.String())
	}
}

func TestFeedbackAssignmentRequiresHandlersAndClaimRepairsInvalidLegacyOwner(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeedbackHandlers(se, app)
		hooks.RegisterFeedbackSecurityHooks(app)
	})

	_, ownerToken := createAuthUser(t, server.app, false, false)
	nonAdmin, _ := createAuthUser(t, server.app, false, false)
	admin, adminToken := createAuthUser(t, server.app, true, false)
	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/feedback",
		ownerToken,
		`{"title":"Assignment validation","description":"Only current admins may own this thread"}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected new feedback create to return 200, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	createdPayload := parseJSONMap(t, createResponse.Body.Bytes())
	threadID, _ := createdPayload["id"].(string)
	thread, err := server.app.FindRecordById("feedback", threadID)
	if err != nil {
		t.Fatalf("failed to reload newly created feedback: %v", err)
	}

	directAssignment := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/collections/feedback/records/"+thread.Id,
		adminToken,
		fmt.Sprintf(`{"assigned_admin":"%s"}`, nonAdmin.Id),
	)
	if directAssignment.Code != http.StatusForbidden {
		t.Fatalf("expected direct assignment to return 403, got %d: %s", directAssignment.Code, directAssignment.Body.String())
	}

	thread.Set("assigned_admin", nonAdmin.Id)
	thread.Set("assigned_at", time.Now().UTC())
	thread.Set("admin_reply_deadline_at", time.Now().UTC().Add(24*time.Hour))
	if err := server.app.Save(thread); err != nil {
		t.Fatalf("failed to seed invalid legacy assignment: %v", err)
	}

	claimResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/feedback/"+thread.Id+"/claim",
		adminToken,
		"",
	)
	if claimResponse.Code != http.StatusOK {
		t.Fatalf("expected valid admin claim to repair legacy assignment, got %d: %s", claimResponse.Code, claimResponse.Body.String())
	}

	reloadedThread, err := server.app.FindRecordById("feedback", thread.Id)
	if err != nil {
		t.Fatalf("failed to reload claimed feedback: %v", err)
	}
	if reloadedThread.GetString("assigned_admin") != admin.Id {
		t.Fatalf("expected assigned admin %q, got %q", admin.Id, reloadedThread.GetString("assigned_admin"))
	}
	if reloadedThread.GetDateTime("assigned_at").IsZero() || reloadedThread.GetDateTime("admin_reply_deadline_at").IsZero() {
		t.Fatalf("expected claim to derive assignment timestamps")
	}
}

func assertCanonicalNewFeedback(
	t *testing.T,
	thread *core.Record,
	ownerID string,
	notBefore time.Time,
	forgedTime time.Time,
) {
	t.Helper()

	if thread.GetString("user") != ownerID {
		t.Fatalf("expected server-owned user %q, got %q", ownerID, thread.GetString("user"))
	}
	if thread.GetString("status") != "open" || thread.GetInt("admin_unread_count") != 1 || thread.GetInt("user_unread_count") != 0 {
		t.Fatalf("unexpected canonical workflow state: status=%q adminUnread=%d userUnread=%d", thread.GetString("status"), thread.GetInt("admin_unread_count"), thread.GetInt("user_unread_count"))
	}
	if strings.TrimSpace(thread.GetString("assigned_admin")) != "" ||
		!thread.GetDateTime("assigned_at").IsZero() ||
		!thread.GetDateTime("admin_reply_deadline_at").IsZero() {
		t.Fatalf("expected new feedback to be unassigned")
	}
	activityAt := thread.GetDateTime("last_message_at").Time()
	if activityAt.Before(notBefore) || !activityAt.Before(forgedTime) {
		t.Fatalf("expected server-derived activity time between %s and %s, got %s", notBefore, forgedTime, activityAt)
	}
}

func TestFeedbackMessageCollectionRejectsDirectCreateRequests(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeedbackHandlers(se, app)
		hooks.RegisterFeedbackMessageSecurityHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)
	thread := createCollectionRecord(t, server.app, "feedback", map[string]any{
		"user":               owner.Id,
		"title":              "Spoof test",
		"description":        "Checking direct create protection",
		"status":             "open",
		"admin_unread_count": 1,
		"user_unread_count":  0,
		"last_message_at":    time.Now().UTC(),
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/collections/feedback_messages/records",
		ownerToken,
		fmt.Sprintf(
			`{"feedback":"%s","user":"%s","message":"forged reply","is_admin_message":true}`,
			thread.Id,
			otherUser.Id,
		),
	)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", response.Code, response.Body.String())
	}

	rows, err := server.app.FindRecordsByFilter(
		"feedback_messages",
		"feedback = {:feedbackId}",
		"",
		10,
		0,
		map[string]any{"feedbackId": thread.Id},
	)
	if err != nil {
		t.Fatalf("failed to list feedback messages: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("expected no feedback messages to be created, found %d", len(rows))
	}
}

func TestUserFeedbackReplyEndpointCreatesBoundUserMessage(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeedbackHandlers(se, app)
		hooks.RegisterFeedbackMessageSecurityHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	admin, _ := createAuthUser(t, server.app, true, false)
	initialDeadline := time.Now().UTC().Add(2 * time.Hour).Truncate(time.Second)
	thread := createCollectionRecord(t, server.app, "feedback", map[string]any{
		"user":                    owner.Id,
		"assigned_admin":          admin.Id,
		"admin_reply_deadline_at": initialDeadline,
		"title":                   "Reply endpoint test",
		"description":             "Ensure replies are server-authored",
		"status":                  "open",
		"admin_unread_count":      2,
		"user_unread_count":       1,
		"last_message_at":         time.Now().UTC().Add(-1 * time.Hour),
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/feedback/"+thread.Id+"/reply",
		ownerToken,
		`{"message":"  Please take another look.  "}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	body := parseJSONMap(t, response.Body.Bytes())
	replyFeedback, ok := body["feedback"].(map[string]any)
	if !ok {
		t.Fatalf("expected feedback payload in reply response, got %#v", body["feedback"])
	}
	if replyFeedback["id"] != thread.Id {
		t.Fatalf("expected feedback payload id %q, got %#v", thread.Id, replyFeedback["id"])
	}
	if replyFeedback["admin_unread_count"] != float64(3) {
		t.Fatalf("expected feedback payload admin_unread_count=3, got %#v", replyFeedback["admin_unread_count"])
	}
	replyMessage, ok := body["message"].(map[string]any)
	if !ok {
		t.Fatalf("expected message payload in reply response, got %#v", body["message"])
	}
	if replyMessage["feedback"] != thread.Id {
		t.Fatalf("expected reply message feedback id %q, got %#v", thread.Id, replyMessage["feedback"])
	}
	if replyMessage["message"] != "Please take another look." {
		t.Fatalf("expected trimmed reply payload, got %#v", replyMessage["message"])
	}
	if replyMessage["is_admin_message"] != false {
		t.Fatalf("expected is_admin_message=false, got %#v", replyMessage["is_admin_message"])
	}

	rows, err := server.app.FindRecordsByFilter(
		"feedback_messages",
		"feedback = {:feedbackId}",
		"created",
		10,
		0,
		map[string]any{"feedbackId": thread.Id},
	)
	if err != nil {
		t.Fatalf("failed to list feedback messages: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 feedback message, found %d", len(rows))
	}

	messageRecord := rows[0]
	if messageRecord.GetString("user") != owner.Id {
		t.Fatalf("expected message user %q, got %q", owner.Id, messageRecord.GetString("user"))
	}
	if messageRecord.GetBool("is_admin_message") {
		t.Fatalf("expected user reply to remain non-admin")
	}
	if messageRecord.GetString("message") != "Please take another look." {
		t.Fatalf("expected trimmed message body, got %q", messageRecord.GetString("message"))
	}

	updatedThread, err := server.app.FindRecordById("feedback", thread.Id)
	if err != nil {
		t.Fatalf("failed to reload feedback thread: %v", err)
	}
	if updatedThread.GetInt("admin_unread_count") != 3 {
		t.Fatalf("expected admin_unread_count=3, got %d", updatedThread.GetInt("admin_unread_count"))
	}
	if updatedThread.GetInt("user_unread_count") != 1 {
		t.Fatalf("expected user_unread_count to stay 1, got %d", updatedThread.GetInt("user_unread_count"))
	}

	updatedDeadline := updatedThread.GetDateTime("admin_reply_deadline_at").Time()
	if !updatedDeadline.After(initialDeadline) {
		t.Fatalf("expected admin reply deadline to extend beyond %s, got %s", initialDeadline, updatedDeadline)
	}
}

func TestUserFeedbackReplyEndpointReplaysIdempotencyKeyWithoutDuplicateMessage(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeedbackHandlers(se, app)
		hooks.RegisterFeedbackMessageSecurityHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	thread := createCollectionRecord(t, server.app, "feedback", map[string]any{
		"user":               owner.Id,
		"title":              "Response loss test",
		"description":        "The same reply should be stored once",
		"status":             "open",
		"admin_unread_count": 2,
		"user_unread_count":  0,
		"last_message_at":    time.Now().UTC(),
	})
	headers := map[string]string{"Idempotency-Key": "feedback-reply-response-loss-1"}

	firstResponse := performJSONRequestWithHeaders(
		t,
		server.mux,
		http.MethodPost,
		"/api/feedback/"+thread.Id+"/reply",
		ownerToken,
		`{"message":"Please take another look."}`,
		headers,
	)
	secondResponse := performJSONRequestWithHeaders(
		t,
		server.mux,
		http.MethodPost,
		"/api/feedback/"+thread.Id+"/reply",
		ownerToken,
		`{"message":"Please take another look."}`,
		headers,
	)

	if firstResponse.Code != http.StatusOK || secondResponse.Code != http.StatusOK {
		t.Fatalf(
			"expected both keyed replies to return 200, got first=%d second=%d: %s",
			firstResponse.Code,
			secondResponse.Code,
			secondResponse.Body.String(),
		)
	}
	if count := countRecordsByFilter(
		t,
		server.app,
		"feedback_messages",
		"feedback = {:feedbackId}",
		map[string]any{"feedbackId": thread.Id},
	); count != 1 {
		t.Fatalf("expected exactly 1 feedback message after replay, got %d", count)
	}

	updatedThread, err := server.app.FindRecordById("feedback", thread.Id)
	if err != nil {
		t.Fatalf("failed to reload feedback thread: %v", err)
	}
	if updatedThread.GetInt("admin_unread_count") != 3 {
		t.Fatalf(
			"expected admin_unread_count to increment once to 3, got %d",
			updatedThread.GetInt("admin_unread_count"),
		)
	}
}

func TestUserFeedbackReplyEndpointRejectsOtherUsers(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeedbackHandlers(se, app)
		hooks.RegisterFeedbackMessageSecurityHooks(app)
	})

	owner, _ := createAuthUser(t, server.app, false, false)
	otherUser, otherToken := createAuthUser(t, server.app, false, false)
	thread := createCollectionRecord(t, server.app, "feedback", map[string]any{
		"user":               owner.Id,
		"title":              "Unauthorized reply test",
		"description":        "Only the thread owner should reply",
		"status":             "open",
		"admin_unread_count": 0,
		"user_unread_count":  0,
		"last_message_at":    time.Now().UTC(),
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/feedback/"+thread.Id+"/reply",
		otherToken,
		`{"message":"I should not be able to send this."}`,
	)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", response.Code, response.Body.String())
	}

	rows, err := server.app.FindRecordsByFilter(
		"feedback_messages",
		"feedback = {:feedbackId} && user = {:userId}",
		"",
		10,
		0,
		map[string]any{
			"feedbackId": thread.Id,
			"userId":     otherUser.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to list feedback messages: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("expected no feedback messages for unauthorized user, found %d", len(rows))
	}
}

func TestFeedbackDetailEndpointReturnsThreadAndFirstMessagesPage(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeedbackHandlers(se, app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	admin, _ := createAuthUser(t, server.app, true, false)
	owner.Set("name", "Taylor Owner")
	admin.Set("name", "Jordan Admin")
	if err := server.app.Save(owner); err != nil {
		t.Fatalf("failed to save owner name: %v", err)
	}
	if err := server.app.Save(admin); err != nil {
		t.Fatalf("failed to save admin name: %v", err)
	}

	thread := createCollectionRecord(t, server.app, "feedback", map[string]any{
		"user":               owner.Id,
		"title":              "Thread detail endpoint",
		"description":        "Check combined thread response",
		"status":             "open",
		"admin_unread_count": 1,
		"user_unread_count":  2,
		"last_message_at":    time.Now().UTC(),
	})

	firstMessage := createCollectionRecord(t, server.app, "feedback_messages", map[string]any{
		"feedback":         thread.Id,
		"user":             owner.Id,
		"message":          "Initial message",
		"is_admin_message": false,
	})
	time.Sleep(10 * time.Millisecond)
	secondMessage := createCollectionRecord(t, server.app, "feedback_messages", map[string]any{
		"feedback":         thread.Id,
		"user":             admin.Id,
		"message":          "Admin follow-up",
		"is_admin_message": true,
	})
	time.Sleep(10 * time.Millisecond)
	thirdMessage := createCollectionRecord(t, server.app, "feedback_messages", map[string]any{
		"feedback":         thread.Id,
		"user":             owner.Id,
		"message":          "Latest reply",
		"is_admin_message": false,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/feedback/"+thread.Id+"?pageSize=2&order=desc",
		ownerToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())
	feedbackPayload, ok := body["feedback"].(map[string]any)
	if !ok {
		t.Fatalf("expected feedback payload, got %#v", body["feedback"])
	}
	if feedbackPayload["id"] != thread.Id {
		t.Fatalf("expected feedback id %q, got %#v", thread.Id, feedbackPayload["id"])
	}
	if feedbackPayload["user_name"] != "Taylor Owner" {
		t.Fatalf("expected hydrated owner name, got %#v", feedbackPayload["user_name"])
	}

	messagesPayload, ok := body["messages"].(map[string]any)
	if !ok {
		t.Fatalf("expected messages payload, got %#v", body["messages"])
	}
	if messagesPayload["page"] != float64(1) || messagesPayload["pageSize"] != float64(2) {
		t.Fatalf("unexpected pagination payload: %#v", messagesPayload)
	}
	if messagesPayload["totalItems"] != float64(3) || messagesPayload["totalPages"] != float64(2) {
		t.Fatalf("unexpected message totals: %#v", messagesPayload)
	}
	if messagesPayload["hasNextPage"] != true {
		t.Fatalf("expected more messages to be available, got %#v", messagesPayload["hasNextPage"])
	}

	items, ok := messagesPayload["items"].([]any)
	if !ok || len(items) != 2 {
		t.Fatalf("expected two message items, got %#v", messagesPayload["items"])
	}

	firstItem, ok := items[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first message object, got %#v", items[0])
	}
	secondItem, ok := items[1].(map[string]any)
	if !ok {
		t.Fatalf("expected second message object, got %#v", items[1])
	}

	if firstItem["id"] != thirdMessage.Id || firstItem["message"] != "Latest reply" {
		t.Fatalf("expected latest message first, got %#v", firstItem)
	}
	if secondItem["id"] != secondMessage.Id || secondItem["user_name"] != "Jordan Admin" {
		t.Fatalf("expected hydrated admin reply second, got %#v", secondItem)
	}
	if secondItem["is_admin_message"] != true {
		t.Fatalf("expected admin message flag, got %#v", secondItem["is_admin_message"])
	}
	if firstMessage.Id == "" {
		t.Fatalf("expected first message fixture to be created")
	}
}

func TestFeedbackDetailEndpointRejectsOtherUsers(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeedbackHandlers(se, app)
	})

	owner, _ := createAuthUser(t, server.app, false, false)
	otherUser, otherToken := createAuthUser(t, server.app, false, false)
	thread := createCollectionRecord(t, server.app, "feedback", map[string]any{
		"user":               owner.Id,
		"title":              "Private feedback thread",
		"description":        "Only the owner should read this",
		"status":             "open",
		"admin_unread_count": 0,
		"user_unread_count":  0,
		"last_message_at":    time.Now().UTC(),
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/feedback/"+thread.Id,
		otherToken,
		"",
	)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", response.Code, response.Body.String())
	}

	if otherUser.Id == "" {
		t.Fatalf("expected requesting user fixture to be created")
	}
}

func TestFeedbackMessagesEndpointPaginatesAndHydratesSenders(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeedbackHandlers(se, app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	admin, _ := createAuthUser(t, server.app, true, false)
	admin.Set("name", "Support Agent")
	if err := server.app.Save(admin); err != nil {
		t.Fatalf("failed to save admin name: %v", err)
	}

	thread := createCollectionRecord(t, server.app, "feedback", map[string]any{
		"user":               owner.Id,
		"title":              "Paged thread",
		"description":        "Check message pagination",
		"status":             "open",
		"admin_unread_count": 0,
		"user_unread_count":  1,
		"last_message_at":    time.Now().UTC(),
	})

	firstMessage := createCollectionRecord(t, server.app, "feedback_messages", map[string]any{
		"feedback":         thread.Id,
		"user":             owner.Id,
		"message":          "One",
		"is_admin_message": false,
	})
	time.Sleep(10 * time.Millisecond)
	secondMessage := createCollectionRecord(t, server.app, "feedback_messages", map[string]any{
		"feedback":         thread.Id,
		"user":             admin.Id,
		"message":          "Two",
		"is_admin_message": true,
	})
	time.Sleep(10 * time.Millisecond)
	createCollectionRecord(t, server.app, "feedback_messages", map[string]any{
		"feedback":         thread.Id,
		"user":             owner.Id,
		"message":          "Three",
		"is_admin_message": false,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/feedback/"+thread.Id+"/messages?page=2&pageSize=1&order=asc",
		ownerToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())
	if body["page"] != float64(2) || body["pageSize"] != float64(1) {
		t.Fatalf("unexpected pagination metadata: %#v", body)
	}
	if body["hasNextPage"] != true {
		t.Fatalf("expected a third page, got %#v", body["hasNextPage"])
	}

	items, ok := body["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one message item, got %#v", body["items"])
	}

	item, ok := items[0].(map[string]any)
	if !ok {
		t.Fatalf("expected message object, got %#v", items[0])
	}
	if item["id"] != secondMessage.Id || item["message"] != "Two" {
		t.Fatalf("expected second chronological message, got %#v", item)
	}
	if item["user_name"] != "Support Agent" || item["is_admin_message"] != true {
		t.Fatalf("expected hydrated admin sender, got %#v", item)
	}
	if firstMessage.Id == "" {
		t.Fatalf("expected first message fixture to be created")
	}
}

func TestFeedbackCollectionRejectsDirectMetadataUpdatesFromNonAdmins(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeedbackHandlers(se, app)
		hooks.RegisterFeedbackSecurityHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	initialLastMessageAt := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	initialDeadline := time.Now().UTC().Add(4 * time.Hour).Truncate(time.Second)
	thread := createCollectionRecord(t, server.app, "feedback", map[string]any{
		"user":                    owner.Id,
		"title":                   "Metadata tamper test",
		"description":             "Users should not patch workflow metadata",
		"status":                  "open",
		"admin_unread_count":      2,
		"user_unread_count":       1,
		"last_message_at":         initialLastMessageAt,
		"admin_reply_deadline_at": initialDeadline,
	})

	forgedLastMessageAt := time.Now().UTC().Add(48 * time.Hour).Truncate(time.Second)
	forgedDeadline := time.Now().UTC().Add(72 * time.Hour).Truncate(time.Second)
	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/collections/feedback/records/"+thread.Id,
		ownerToken,
		fmt.Sprintf(
			`{"admin_unread_count":99,"last_message_at":"%s","admin_reply_deadline_at":"%s"}`,
			forgedLastMessageAt.Format(time.RFC3339),
			forgedDeadline.Format(time.RFC3339),
		),
	)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", response.Code, response.Body.String())
	}

	reloadedThread, err := server.app.FindRecordById("feedback", thread.Id)
	if err != nil {
		t.Fatalf("failed to reload feedback thread: %v", err)
	}
	if reloadedThread.GetInt("admin_unread_count") != 2 {
		t.Fatalf("expected admin_unread_count to remain 2, got %d", reloadedThread.GetInt("admin_unread_count"))
	}
	if !reloadedThread.GetDateTime("last_message_at").Time().Equal(initialLastMessageAt) {
		t.Fatalf(
			"expected last_message_at to remain %s, got %s",
			initialLastMessageAt,
			reloadedThread.GetDateTime("last_message_at").Time(),
		)
	}
	if !reloadedThread.GetDateTime("admin_reply_deadline_at").Time().Equal(initialDeadline) {
		t.Fatalf(
			"expected admin_reply_deadline_at to remain %s, got %s",
			initialDeadline,
			reloadedThread.GetDateTime("admin_reply_deadline_at").Time(),
		)
	}
}

func TestUserFeedbackMarkReadEndpointClearsUnreadCount(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeedbackHandlers(se, app)
		hooks.RegisterFeedbackSecurityHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	lastMessageAt := time.Now().UTC().Add(-30 * time.Minute).Truncate(time.Second)
	thread := createCollectionRecord(t, server.app, "feedback", map[string]any{
		"user":               owner.Id,
		"title":              "Mark read test",
		"description":        "Unread counts should clear through the endpoint",
		"status":             "open",
		"admin_unread_count": 4,
		"user_unread_count":  3,
		"last_message_at":    lastMessageAt,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/feedback/"+thread.Id+"/mark-read",
		ownerToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())
	if body["markedRead"] != true {
		t.Fatalf("expected markedRead=true, got %#v", body["markedRead"])
	}
	feedbackPayload, ok := body["feedback"].(map[string]any)
	if !ok {
		t.Fatalf("expected feedback payload in mark-read response, got %#v", body["feedback"])
	}
	if feedbackPayload["id"] != thread.Id {
		t.Fatalf("expected feedback payload id %q, got %#v", thread.Id, feedbackPayload["id"])
	}
	if feedbackPayload["user_unread_count"] != float64(0) {
		t.Fatalf("expected feedback payload user_unread_count=0, got %#v", feedbackPayload["user_unread_count"])
	}
	if feedbackPayload["admin_unread_count"] != float64(4) {
		t.Fatalf("expected feedback payload admin_unread_count=4, got %#v", feedbackPayload["admin_unread_count"])
	}

	updatedThread, err := server.app.FindRecordById("feedback", thread.Id)
	if err != nil {
		t.Fatalf("failed to reload feedback thread: %v", err)
	}
	if updatedThread.GetInt("user_unread_count") != 0 {
		t.Fatalf("expected user_unread_count=0, got %d", updatedThread.GetInt("user_unread_count"))
	}
	if updatedThread.GetInt("admin_unread_count") != 4 {
		t.Fatalf("expected admin_unread_count to remain 4, got %d", updatedThread.GetInt("admin_unread_count"))
	}
	if !updatedThread.GetDateTime("last_message_at").Time().Equal(lastMessageAt) {
		t.Fatalf("expected last_message_at to remain %s, got %s", lastMessageAt, updatedThread.GetDateTime("last_message_at").Time())
	}
}

func TestUserFeedbackMarkReadEndpointRejectsOtherUsers(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterFeedbackHandlers(se, app)
		hooks.RegisterFeedbackSecurityHooks(app)
	})

	owner, _ := createAuthUser(t, server.app, false, false)
	otherUser, otherToken := createAuthUser(t, server.app, false, false)
	thread := createCollectionRecord(t, server.app, "feedback", map[string]any{
		"user":               owner.Id,
		"title":              "Unauthorized mark read test",
		"description":        "Only the owner should mark a thread as read",
		"status":             "open",
		"admin_unread_count": 0,
		"user_unread_count":  2,
		"last_message_at":    time.Now().UTC(),
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/feedback/"+thread.Id+"/mark-read",
		otherToken,
		"",
	)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", response.Code, response.Body.String())
	}

	updatedThread, err := server.app.FindRecordById("feedback", thread.Id)
	if err != nil {
		t.Fatalf("failed to reload feedback thread: %v", err)
	}
	if updatedThread.GetInt("user_unread_count") != 2 {
		t.Fatalf("expected user_unread_count to remain 2, got %d", updatedThread.GetInt("user_unread_count"))
	}
	if updatedThread.GetString("user") != owner.Id {
		t.Fatalf("expected thread owner to remain %q, got %q", owner.Id, updatedThread.GetString("user"))
	}
	if updatedThread.GetString("user") == otherUser.Id {
		t.Fatalf("other user should not own the thread")
	}
}
