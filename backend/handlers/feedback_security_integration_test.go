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
