package handlers_test

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/hooks"
)

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
