package handlers

import (
	"fmt"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

const feedbackReplyOwnershipWindow = 24 * time.Hour

type feedbackReplyRequest struct {
	Message string `json:"message"`
}

type feedbackThreadResponse struct {
	ID                   string `json:"id"`
	User                 string `json:"user"`
	AssignedAdmin        string `json:"assigned_admin"`
	AdminReplyDeadlineAt string `json:"admin_reply_deadline_at"`
	Title                string `json:"title"`
	Description          string `json:"description"`
	Status               string `json:"status"`
	AdminUnreadCount     int    `json:"admin_unread_count"`
	UserUnreadCount      int    `json:"user_unread_count"`
	LastMessageAt        string `json:"last_message_at"`
	Created              string `json:"created"`
	Updated              string `json:"updated"`
}

type feedbackMessageResponse struct {
	ID             string `json:"id"`
	Feedback       string `json:"feedback"`
	User           string `json:"user"`
	Message        string `json:"message"`
	IsAdminMessage bool   `json:"is_admin_message"`
	Created        string `json:"created"`
}

type feedbackReplyResponse struct {
	Feedback feedbackThreadResponse  `json:"feedback"`
	Message  feedbackMessageResponse `json:"message"`
	Success  bool                    `json:"success"`
}

type feedbackMarkReadResponse struct {
	Feedback   feedbackThreadResponse `json:"feedback"`
	MarkedRead bool                   `json:"markedRead"`
	Success    bool                   `json:"success"`
}

// RegisterFeedbackHandlers registers feedback messaging, ownership, and read-state endpoints.
func RegisterFeedbackHandlers(se *core.ServeEvent, app core.App) {
	userMessageHandler := func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		threadID := strings.TrimSpace(e.Request.PathValue("threadId"))
		if threadID == "" {
			return apis.NewBadRequestError("threadId is required", nil)
		}

		data := feedbackReplyRequest{}
		if err := e.BindBody(&data); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		trimmedMessage := strings.TrimSpace(data.Message)
		if trimmedMessage == "" {
			return apis.NewBadRequestError("reply is required", nil)
		}

		response := feedbackReplyResponse{
			Success: true,
		}
		err := app.RunInTransaction(func(txApp core.App) error {
			thread, err := txApp.FindRecordById("feedback", threadID)
			if err != nil {
				return apis.NewNotFoundError("feedback thread not found", err)
			}

			if strings.TrimSpace(thread.GetString("user")) != strings.TrimSpace(e.Auth.Id) {
				return apis.NewNotFoundError("feedback thread not found", nil)
			}

			messagesCollection, err := txApp.FindCollectionByNameOrId("feedback_messages")
			if err != nil {
				return apis.NewApiError(500, "feedback_messages collection missing", err)
			}

			now := time.Now().UTC()
			beforeThreadSnapshot := lib.RecordAuditSnapshot(thread)
			messageRecord := core.NewRecord(messagesCollection)
			messageRecord.Set("feedback", threadID)
			messageRecord.Set("user", e.Auth.Id)
			messageRecord.Set("message", trimmedMessage)
			messageRecord.Set("is_admin_message", false)

			if err := txApp.Save(messageRecord); err != nil {
				return apis.NewApiError(500, "failed to create feedback reply", err)
			}

			thread.Set("last_message_at", now)
			thread.Set("admin_unread_count", thread.GetInt("admin_unread_count")+1)
			if activeFeedbackOwnerID(thread, now) != "" {
				thread.Set("admin_reply_deadline_at", now.Add(feedbackReplyOwnershipWindow))
			}

			if err := txApp.Save(thread); err != nil {
				return apis.NewApiError(500, "failed to update feedback thread after reply", err)
			}

			if auditErr := lib.CreateAuditLog(txApp, lib.AuditLogInput{
				Action:           core.ModelEventTypeCreate,
				Actor:            e.Auth,
				After:            lib.RecordAuditSnapshot(messageRecord),
				Metadata:         map[string]any{"source": "user_feedback_reply", "threadId": threadID},
				RequestIP:        e.RealIP(),
				RequestMethod:    e.Request.Method,
				RequestPath:      e.Request.URL.Path,
				TargetCollection: "feedback_messages",
				TargetLabel:      lib.ResolveAuditTargetLabel(messageRecord, lib.RecordAuditSnapshot(messageRecord)),
				TargetRecordID:   messageRecord.Id,
				UserAgent:        e.Request.UserAgent(),
			}); auditErr != nil {
				return apis.NewApiError(500, "failed to audit feedback reply", auditErr)
			}

			if auditErr := lib.CreateAuditLog(txApp, lib.AuditLogInput{
				Action:           core.ModelEventTypeUpdate,
				Actor:            e.Auth,
				Before:           beforeThreadSnapshot,
				After:            lib.RecordAuditSnapshot(thread),
				Metadata:         map[string]any{"source": "user_feedback_reply"},
				RequestIP:        e.RealIP(),
				RequestMethod:    e.Request.Method,
				RequestPath:      e.Request.URL.Path,
				TargetCollection: "feedback",
				TargetLabel:      lib.ResolveAuditTargetLabel(thread, beforeThreadSnapshot),
				TargetRecordID:   thread.Id,
				UserAgent:        e.Request.UserAgent(),
			}); auditErr != nil {
				return apis.NewApiError(500, "failed to audit feedback thread update", auditErr)
			}

			response.Feedback = serializeFeedbackThreadResponse(thread)
			response.Message = serializeFeedbackMessageResponse(messageRecord)

			return nil
		})
		if err != nil {
			return err
		}

		return e.JSON(200, response)
	}

	se.Router.POST("/api/feedback/{threadId}/messages", userMessageHandler).Bind(apis.RequireAuth())
	se.Router.POST("/api/feedback/{threadId}/reply", userMessageHandler).Bind(apis.RequireAuth())

	se.Router.POST("/api/feedback/{threadId}/mark-read", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		threadID := strings.TrimSpace(e.Request.PathValue("threadId"))
		if threadID == "" {
			return apis.NewBadRequestError("threadId is required", nil)
		}

		response := feedbackMarkReadResponse{
			Success: true,
		}
		err := app.RunInTransaction(func(txApp core.App) error {
			thread, err := txApp.FindRecordById("feedback", threadID)
			if err != nil {
				return apis.NewNotFoundError("feedback thread not found", err)
			}

			if strings.TrimSpace(thread.GetString("user")) != strings.TrimSpace(e.Auth.Id) {
				return apis.NewNotFoundError("feedback thread not found", nil)
			}

			if thread.GetInt("user_unread_count") <= 0 {
				response.Feedback = serializeFeedbackThreadResponse(thread)
				return nil
			}

			beforeThreadSnapshot := lib.RecordAuditSnapshot(thread)
			thread.Set("user_unread_count", 0)
			if err := txApp.Save(thread); err != nil {
				return apis.NewApiError(500, "failed to mark feedback thread as read", err)
			}

			if auditErr := lib.CreateAuditLog(txApp, lib.AuditLogInput{
				Action:           core.ModelEventTypeUpdate,
				Actor:            e.Auth,
				Before:           beforeThreadSnapshot,
				After:            lib.RecordAuditSnapshot(thread),
				Metadata:         map[string]any{"source": "user_feedback_mark_read"},
				RequestIP:        e.RealIP(),
				RequestMethod:    e.Request.Method,
				RequestPath:      e.Request.URL.Path,
				TargetCollection: "feedback",
				TargetLabel:      lib.ResolveAuditTargetLabel(thread, beforeThreadSnapshot),
				TargetRecordID:   thread.Id,
				UserAgent:        e.Request.UserAgent(),
			}); auditErr != nil {
				return apis.NewApiError(500, "failed to audit feedback mark-read", auditErr)
			}

			response.MarkedRead = true
			response.Feedback = serializeFeedbackThreadResponse(thread)
			return nil
		})
		if err != nil {
			return err
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/admin/feedback/{threadId}/claim", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		threadID := strings.TrimSpace(e.Request.PathValue("threadId"))
		if threadID == "" {
			return apis.NewBadRequestError("threadId is required", nil)
		}

		err := app.RunInTransaction(func(txApp core.App) error {
			thread, err := txApp.FindRecordById("feedback", threadID)
			if err != nil {
				return apis.NewNotFoundError("feedback thread not found", err)
			}

			now := time.Now().UTC()
			activeOwnerID := activeFeedbackOwnerID(thread, now)
			if activeOwnerID != "" && activeOwnerID != e.Auth.Id {
				owner, _ := txApp.FindRecordById("users", activeOwnerID)
				return apis.NewApiError(
					409,
					fmt.Sprintf("This thread is already owned by %s.", resolveFeedbackAdminLabel(owner, activeOwnerID)),
					nil,
				)
			}

			if activeOwnerID == e.Auth.Id {
				return nil
			}

			beforeSnapshot := lib.RecordAuditSnapshot(thread)
			thread.Set("assigned_admin", e.Auth.Id)
			thread.Set("assigned_at", now)
			if thread.GetInt("admin_unread_count") > 0 {
				thread.Set("admin_reply_deadline_at", now.Add(feedbackReplyOwnershipWindow))
			} else {
				thread.Set("admin_reply_deadline_at", "")
			}

			if err := txApp.Save(thread); err != nil {
				return apis.NewApiError(500, "failed to claim feedback thread", err)
			}

			if auditErr := lib.CreateAuditLog(txApp, lib.AuditLogInput{
				Action:           core.ModelEventTypeUpdate,
				Actor:            e.Auth,
				Before:           beforeSnapshot,
				After:            lib.RecordAuditSnapshot(thread),
				Metadata:         map[string]any{"source": "admin_feedback_claim"},
				RequestIP:        e.RealIP(),
				RequestMethod:    e.Request.Method,
				RequestPath:      e.Request.URL.Path,
				TargetCollection: "feedback",
				TargetLabel:      lib.ResolveAuditTargetLabel(thread, beforeSnapshot),
				TargetRecordID:   thread.Id,
				UserAgent:        e.Request.UserAgent(),
			}); auditErr != nil {
				return apis.NewApiError(500, "failed to audit feedback claim", auditErr)
			}

			return nil
		})
		if err != nil {
			return err
		}

		return e.JSON(200, map[string]any{"success": true})
	})

	se.Router.POST("/api/admin/feedback/{threadId}/release", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		threadID := strings.TrimSpace(e.Request.PathValue("threadId"))
		if threadID == "" {
			return apis.NewBadRequestError("threadId is required", nil)
		}

		err := app.RunInTransaction(func(txApp core.App) error {
			thread, err := txApp.FindRecordById("feedback", threadID)
			if err != nil {
				return apis.NewNotFoundError("feedback thread not found", err)
			}

			now := time.Now().UTC()
			activeOwnerID := activeFeedbackOwnerID(thread, now)
			rawOwnerID := strings.TrimSpace(thread.GetString("assigned_admin"))
			if activeOwnerID != "" && activeOwnerID != e.Auth.Id {
				return apis.NewForbiddenError("Only the owning admin can release this thread.", nil)
			}

			if rawOwnerID == "" {
				return nil
			}

			beforeSnapshot := lib.RecordAuditSnapshot(thread)
			clearFeedbackAssignment(thread)
			if err := txApp.Save(thread); err != nil {
				return apis.NewApiError(500, "failed to release feedback thread", err)
			}

			if auditErr := lib.CreateAuditLog(txApp, lib.AuditLogInput{
				Action:           core.ModelEventTypeUpdate,
				Actor:            e.Auth,
				Before:           beforeSnapshot,
				After:            lib.RecordAuditSnapshot(thread),
				Metadata:         map[string]any{"source": "admin_feedback_release"},
				RequestIP:        e.RealIP(),
				RequestMethod:    e.Request.Method,
				RequestPath:      e.Request.URL.Path,
				TargetCollection: "feedback",
				TargetLabel:      lib.ResolveAuditTargetLabel(thread, beforeSnapshot),
				TargetRecordID:   thread.Id,
				UserAgent:        e.Request.UserAgent(),
			}); auditErr != nil {
				return apis.NewApiError(500, "failed to audit feedback release", auditErr)
			}

			return nil
		})
		if err != nil {
			return err
		}

		return e.JSON(200, map[string]any{"success": true})
	})

	adminMessageHandler := func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		threadID := strings.TrimSpace(e.Request.PathValue("threadId"))
		if threadID == "" {
			return apis.NewBadRequestError("threadId is required", nil)
		}

		data := feedbackReplyRequest{}
		if err := e.BindBody(&data); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		trimmedMessage := strings.TrimSpace(data.Message)
		if trimmedMessage == "" {
			return apis.NewBadRequestError("reply is required", nil)
		}

		response := feedbackReplyResponse{
			Success: true,
		}
		err := app.RunInTransaction(func(txApp core.App) error {
			thread, err := txApp.FindRecordById("feedback", threadID)
			if err != nil {
				return apis.NewNotFoundError("feedback thread not found", err)
			}

			now := time.Now().UTC()
			activeOwnerID := activeFeedbackOwnerID(thread, now)
			if activeOwnerID == "" {
				return apis.NewBadRequestError("Pick up this thread before replying.", nil)
			}

			if activeOwnerID != e.Auth.Id {
				return apis.NewForbiddenError("Only the owning admin can reply to this thread.", nil)
			}

			messagesCollection, err := txApp.FindCollectionByNameOrId("feedback_messages")
			if err != nil {
				return apis.NewApiError(500, "feedback_messages collection missing", err)
			}

			beforeThreadSnapshot := lib.RecordAuditSnapshot(thread)
			messageRecord := core.NewRecord(messagesCollection)
			messageRecord.Set("feedback", threadID)
			messageRecord.Set("user", e.Auth.Id)
			messageRecord.Set("message", trimmedMessage)
			messageRecord.Set("is_admin_message", true)

			if err := txApp.Save(messageRecord); err != nil {
				return apis.NewApiError(500, "failed to create feedback reply", err)
			}

			thread.Set("last_message_at", now)
			thread.Set("admin_reply_deadline_at", "")
			thread.Set("admin_unread_count", 0)
			thread.Set("user_unread_count", thread.GetInt("user_unread_count")+1)
			if err := txApp.Save(thread); err != nil {
				return apis.NewApiError(500, "failed to update feedback thread after reply", err)
			}

			if auditErr := lib.CreateAuditLog(txApp, lib.AuditLogInput{
				Action:           core.ModelEventTypeCreate,
				Actor:            e.Auth,
				After:            lib.RecordAuditSnapshot(messageRecord),
				Metadata:         map[string]any{"source": "admin_feedback_reply", "threadId": threadID},
				RequestIP:        e.RealIP(),
				RequestMethod:    e.Request.Method,
				RequestPath:      e.Request.URL.Path,
				TargetCollection: "feedback_messages",
				TargetLabel:      lib.ResolveAuditTargetLabel(messageRecord, lib.RecordAuditSnapshot(messageRecord)),
				TargetRecordID:   messageRecord.Id,
				UserAgent:        e.Request.UserAgent(),
			}); auditErr != nil {
				return apis.NewApiError(500, "failed to audit feedback reply", auditErr)
			}

			if auditErr := lib.CreateAuditLog(txApp, lib.AuditLogInput{
				Action:           core.ModelEventTypeUpdate,
				Actor:            e.Auth,
				Before:           beforeThreadSnapshot,
				After:            lib.RecordAuditSnapshot(thread),
				Metadata:         map[string]any{"source": "admin_feedback_reply"},
				RequestIP:        e.RealIP(),
				RequestMethod:    e.Request.Method,
				RequestPath:      e.Request.URL.Path,
				TargetCollection: "feedback",
				TargetLabel:      lib.ResolveAuditTargetLabel(thread, beforeThreadSnapshot),
				TargetRecordID:   thread.Id,
				UserAgent:        e.Request.UserAgent(),
			}); auditErr != nil {
				return apis.NewApiError(500, "failed to audit feedback thread update", auditErr)
			}

			response.Feedback = serializeFeedbackThreadResponse(thread)
			response.Message = serializeFeedbackMessageResponse(messageRecord)

			return nil
		})
		if err != nil {
			return err
		}

		return e.JSON(200, response)
	}

	se.Router.POST("/api/admin/feedback/{threadId}/messages", adminMessageHandler)
	se.Router.POST("/api/admin/feedback/{threadId}/reply", adminMessageHandler)
}

func activeFeedbackOwnerID(thread *core.Record, now time.Time) string {
	rawOwnerID := strings.TrimSpace(thread.GetString("assigned_admin"))
	if rawOwnerID == "" {
		return ""
	}

	deadline := thread.GetDateTime("admin_reply_deadline_at")
	if !deadline.IsZero() && !deadline.Time().After(now) {
		return ""
	}

	return rawOwnerID
}

func clearFeedbackAssignment(thread *core.Record) {
	thread.Set("assigned_admin", "")
	thread.Set("assigned_at", "")
	thread.Set("admin_reply_deadline_at", "")
}

func resolveFeedbackAdminLabel(user *core.Record, fallbackID string) string {
	if user == nil {
		if strings.TrimSpace(fallbackID) != "" {
			return "another admin"
		}
		return "another admin"
	}

	if name := strings.TrimSpace(user.GetString("name")); name != "" {
		return name
	}

	if email := strings.TrimSpace(user.Email()); email != "" {
		return email
	}

	return "another admin"
}

func serializeFeedbackThreadResponse(record *core.Record) feedbackThreadResponse {
	return feedbackThreadResponse{
		ID:                   record.Id,
		User:                 record.GetString("user"),
		AssignedAdmin:        record.GetString("assigned_admin"),
		AdminReplyDeadlineAt: record.GetString("admin_reply_deadline_at"),
		Title:                record.GetString("title"),
		Description:          record.GetString("description"),
		Status:               record.GetString("status"),
		AdminUnreadCount:     record.GetInt("admin_unread_count"),
		UserUnreadCount:      record.GetInt("user_unread_count"),
		LastMessageAt:        record.GetString("last_message_at"),
		Created:              record.GetString("created"),
		Updated:              record.GetString("updated"),
	}
}

func serializeFeedbackMessageResponse(record *core.Record) feedbackMessageResponse {
	return feedbackMessageResponse{
		ID:             record.Id,
		Feedback:       record.GetString("feedback"),
		User:           record.GetString("user"),
		Message:        record.GetString("message"),
		IsAdminMessage: record.GetBool("is_admin_message"),
		Created:        record.GetString("created"),
	}
}
