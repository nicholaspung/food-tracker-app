package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

const (
	feedbackReplyOwnershipWindow    = 24 * time.Hour
	defaultFeedbackMessagesPageSize = 20
	maxFeedbackMessagesPageSize     = 100
	maxFeedbackTitleLength          = 100
	maxFeedbackDescriptionLength    = 5000
)

type feedbackCreateRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

type feedbackReplyRequest struct {
	Message string `json:"message"`
}

type feedbackThreadResponse struct {
	ID                   string `json:"id"`
	User                 string `json:"user"`
	UserName             string `json:"user_name,omitempty"`
	UserEmail            string `json:"user_email,omitempty"`
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
	UserName       string `json:"user_name,omitempty"`
	UserEmail      string `json:"user_email,omitempty"`
	Message        string `json:"message"`
	IsAdminMessage bool   `json:"is_admin_message"`
	Created        string `json:"created"`
}

type feedbackMessagesPageResponse struct {
	Items       []feedbackMessageResponse `json:"items"`
	Page        int                       `json:"page"`
	PageSize    int                       `json:"pageSize"`
	TotalItems  int                       `json:"totalItems"`
	TotalPages  int                       `json:"totalPages"`
	HasNextPage bool                      `json:"hasNextPage"`
}

type feedbackDetailResponse struct {
	Feedback feedbackThreadResponse       `json:"feedback"`
	Messages feedbackMessagesPageResponse `json:"messages"`
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
	se.Router.POST("/api/feedback", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		data := feedbackCreateRequest{}
		if err := e.BindBody(&data); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		title, err := normalizeFeedbackText(data.Title, "title", maxFeedbackTitleLength)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		description, err := normalizeFeedbackText(
			data.Description,
			"description",
			maxFeedbackDescriptionLength,
		)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		replayRecordID := deriveFeatureWriteRecordID(
			"feedback",
			resolveFeatureWriteIdempotencyKey(e),
		)
		var createdThread *core.Record
		err = app.RunInTransaction(func(txApp core.App) error {
			if replayRecordID != "" {
				existingThread, findErr := txApp.FindRecordById("feedback", replayRecordID)
				if findErr == nil {
					if existingThread.GetString("user") != e.Auth.Id ||
						existingThread.GetString("title") != title ||
						existingThread.GetString("description") != description {
						return apis.NewApiError(409, "feedback idempotency key conflict", nil)
					}
					createdThread = existingThread
					return nil
				}
				if !errors.Is(findErr, sql.ErrNoRows) {
					return apis.NewApiError(500, "failed to load replayed feedback", findErr)
				}
			}

			feedbackCollection, findErr := txApp.FindCollectionByNameOrId("feedback")
			if findErr != nil {
				return apis.NewApiError(500, "feedback collection missing", findErr)
			}

			now := time.Now().UTC()
			thread := core.NewRecord(feedbackCollection)
			if replayRecordID != "" {
				thread.SetRaw("id", replayRecordID)
			}
			thread.Set("user", e.Auth.Id)
			thread.Set("title", title)
			thread.Set("description", description)
			thread.Set("status", "open")
			thread.Set("admin_unread_count", 1)
			thread.Set("user_unread_count", 0)
			thread.Set("last_message_at", now)
			clearFeedbackAssignment(thread)

			if saveErr := txApp.Save(thread); saveErr != nil {
				return apis.NewApiError(500, "failed to create feedback", saveErr)
			}

			createdThread = thread
			return nil
		})
		if err != nil {
			return err
		}

		return e.JSON(200, serializeFeedbackThreadResponse(createdThread, e.Auth))
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/feedback/{threadId}", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		threadID := strings.TrimSpace(e.Request.PathValue("threadId"))
		if threadID == "" {
			return apis.NewBadRequestError("threadId is required", nil)
		}

		pageSize, err := parseFeedbackMessagesPageSize(e.Request.URL.Query().Get("pageSize"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		order, err := parseFeedbackMessagesOrder(e.Request.URL.Query().Get("order"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		thread, err := findOwnedFeedbackThread(app, threadID, e.Auth.Id)
		if err != nil {
			return err
		}

		messagesPage, err := listFeedbackMessagesPageResponse(app, threadID, 1, pageSize, order)
		if err != nil {
			return apis.NewApiError(500, "failed to load feedback messages", err)
		}

		return e.JSON(200, feedbackDetailResponse{
			Feedback: serializeFeedbackThreadResponse(thread, e.Auth),
			Messages: messagesPage,
		})
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/feedback/{threadId}/messages", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		threadID := strings.TrimSpace(e.Request.PathValue("threadId"))
		if threadID == "" {
			return apis.NewBadRequestError("threadId is required", nil)
		}

		page, pageSize, err := parseFeedbackMessagesPagination(
			e.Request.URL.Query().Get("page"),
			e.Request.URL.Query().Get("pageSize"),
		)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		order, err := parseFeedbackMessagesOrder(e.Request.URL.Query().Get("order"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		if _, err := findOwnedFeedbackThread(app, threadID, e.Auth.Id); err != nil {
			return err
		}

		response, err := listFeedbackMessagesPageResponse(app, threadID, page, pageSize, order)
		if err != nil {
			return apis.NewApiError(500, "failed to load feedback messages", err)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

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
		replayRecordID := deriveFeatureWriteRecordID(
			"feedback-message:"+threadID+":"+e.Auth.Id,
			resolveFeatureWriteIdempotencyKey(e),
		)
		err := app.RunInTransaction(func(txApp core.App) error {
			thread, err := txApp.FindRecordById("feedback", threadID)
			if err != nil {
				return apis.NewNotFoundError("feedback thread not found", err)
			}

			if strings.TrimSpace(thread.GetString("user")) != strings.TrimSpace(e.Auth.Id) {
				return apis.NewNotFoundError("feedback thread not found", nil)
			}

			if replayRecordID != "" {
				if existingMessage, findErr := txApp.FindRecordById("feedback_messages", replayRecordID); findErr == nil {
					if existingMessage.GetString("feedback") != threadID || existingMessage.GetString("user") != e.Auth.Id {
						return apis.NewApiError(409, "idempotency key is already in use", nil)
					}
					response.Feedback = serializeFeedbackThreadResponse(thread, e.Auth)
					response.Message = serializeFeedbackMessageResponse(existingMessage, e.Auth)
					return nil
				}
			}

			messagesCollection, err := txApp.FindCollectionByNameOrId("feedback_messages")
			if err != nil {
				return apis.NewApiError(500, "feedback_messages collection missing", err)
			}

			now := time.Now().UTC()
			beforeThreadSnapshot := lib.RecordAuditSnapshot(thread)
			messageRecord := core.NewRecord(messagesCollection)
			if replayRecordID != "" {
				messageRecord.SetRaw("id", replayRecordID)
			}
			messageRecord.Set("feedback", threadID)
			messageRecord.Set("user", e.Auth.Id)
			messageRecord.Set("message", trimmedMessage)
			messageRecord.Set("is_admin_message", false)

			if err := txApp.Save(messageRecord); err != nil {
				return apis.NewApiError(500, "failed to create feedback reply", err)
			}

			thread.Set("last_message_at", now)
			thread.Set("admin_unread_count", thread.GetInt("admin_unread_count")+1)
			if activeFeedbackOwnerID(txApp, thread, now) != "" {
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

			response.Feedback = serializeFeedbackThreadResponse(thread, e.Auth)
			response.Message = serializeFeedbackMessageResponse(messageRecord, e.Auth)

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
				response.Feedback = serializeFeedbackThreadResponse(thread, e.Auth)
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
			response.Feedback = serializeFeedbackThreadResponse(thread, e.Auth)
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
			activeOwnerID := activeFeedbackOwnerID(txApp, thread, now)
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
			activeOwnerID := activeFeedbackOwnerID(txApp, thread, now)
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
			activeOwnerID := activeFeedbackOwnerID(txApp, thread, now)
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

			response.Feedback = serializeFeedbackThreadResponse(thread, nil)
			response.Message = serializeFeedbackMessageResponse(messageRecord, e.Auth)

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

func activeFeedbackOwnerID(app core.App, thread *core.Record, now time.Time) string {
	rawOwnerID := strings.TrimSpace(thread.GetString("assigned_admin"))
	if rawOwnerID == "" {
		return ""
	}
	owner, err := app.FindRecordById("users", rawOwnerID)
	if err != nil || !owner.GetBool("isAdmin") {
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

func normalizeFeedbackText(raw string, fieldName string, maxLength int) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", fmt.Errorf("%s is required", fieldName)
	}
	if utf8.RuneCountInString(value) > maxLength {
		return "", fmt.Errorf("%s must be %d characters or fewer", fieldName, maxLength)
	}
	return value, nil
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

func findOwnedFeedbackThread(app core.App, threadID string, userID string) (*core.Record, error) {
	thread, err := app.FindRecordById("feedback", threadID)
	if err != nil {
		return nil, apis.NewNotFoundError("feedback thread not found", err)
	}

	if strings.TrimSpace(thread.GetString("user")) != strings.TrimSpace(userID) {
		return nil, apis.NewNotFoundError("feedback thread not found", nil)
	}

	return thread, nil
}

func parseFeedbackMessagesPagination(pageRaw string, pageSizeRaw string) (int, int, error) {
	page := 1
	if strings.TrimSpace(pageRaw) != "" {
		parsedPage, err := strconv.Atoi(pageRaw)
		if err != nil || parsedPage < 1 {
			return 0, 0, fmt.Errorf("invalid page")
		}
		page = parsedPage
	}

	pageSize, err := parseFeedbackMessagesPageSize(pageSizeRaw)
	if err != nil {
		return 0, 0, err
	}

	return page, pageSize, nil
}

func parseFeedbackMessagesPageSize(pageSizeRaw string) (int, error) {
	pageSize := defaultFeedbackMessagesPageSize
	if strings.TrimSpace(pageSizeRaw) == "" {
		return pageSize, nil
	}

	parsedPageSize, err := strconv.Atoi(pageSizeRaw)
	if err != nil || parsedPageSize < 1 {
		return 0, fmt.Errorf("invalid pageSize")
	}

	if parsedPageSize > maxFeedbackMessagesPageSize {
		return maxFeedbackMessagesPageSize, nil
	}

	return parsedPageSize, nil
}

func parseFeedbackMessagesOrder(orderRaw string) (string, error) {
	order := strings.ToLower(strings.TrimSpace(orderRaw))
	if order == "" {
		return "desc", nil
	}

	if order != "asc" && order != "desc" {
		return "", fmt.Errorf("invalid order")
	}

	return order, nil
}

func listFeedbackMessagesPageResponse(
	app core.App,
	threadID string,
	page int,
	pageSize int,
	order string,
) (feedbackMessagesPageResponse, error) {
	totalRecords, err := app.CountRecords("feedback_messages", dbx.HashExp{"feedback": threadID})
	if err != nil {
		return feedbackMessagesPageResponse{}, err
	}
	totalItems := int(totalRecords)

	totalPages := 0
	if totalItems > 0 {
		totalPages = (totalItems + pageSize - 1) / pageSize
	}

	sortExpr := "-created"
	if order == "asc" {
		sortExpr = "created"
	}

	records, err := app.FindRecordsByFilter(
		"feedback_messages",
		"feedback = {:feedbackId}",
		sortExpr,
		pageSize,
		(page-1)*pageSize,
		map[string]any{"feedbackId": threadID},
	)
	if err != nil {
		return feedbackMessagesPageResponse{}, err
	}

	userRecordsByID := map[string]*core.Record{}
	for _, record := range records {
		userID := strings.TrimSpace(record.GetString("user"))
		if userID == "" || userRecordsByID[userID] != nil {
			continue
		}

		userRecord, userErr := app.FindRecordById("users", userID)
		if userErr != nil {
			userRecordsByID[userID] = nil
			continue
		}

		userRecordsByID[userID] = userRecord
	}

	items := make([]feedbackMessageResponse, 0, len(records))
	for _, record := range records {
		items = append(items, serializeFeedbackMessageResponse(record, userRecordsByID[strings.TrimSpace(record.GetString("user"))]))
	}

	return feedbackMessagesPageResponse{
		Items:       items,
		Page:        page,
		PageSize:    pageSize,
		TotalItems:  totalItems,
		TotalPages:  totalPages,
		HasNextPage: totalPages > 0 && page < totalPages,
	}, nil
}

func serializeFeedbackThreadResponse(record *core.Record, userRecord *core.Record) feedbackThreadResponse {
	return feedbackThreadResponse{
		ID:                   record.Id,
		User:                 record.GetString("user"),
		UserName:             resolveFeedbackUserName(userRecord),
		UserEmail:            resolveFeedbackUserEmail(userRecord),
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

func serializeFeedbackMessageResponse(record *core.Record, userRecord *core.Record) feedbackMessageResponse {
	return feedbackMessageResponse{
		ID:             record.Id,
		Feedback:       record.GetString("feedback"),
		User:           record.GetString("user"),
		UserName:       resolveFeedbackUserName(userRecord),
		UserEmail:      resolveFeedbackUserEmail(userRecord),
		Message:        record.GetString("message"),
		IsAdminMessage: record.GetBool("is_admin_message"),
		Created:        record.GetString("created"),
	}
}

func resolveFeedbackUserName(userRecord *core.Record) string {
	if userRecord == nil {
		return ""
	}

	return lib.ResolveUserDisplayName(userRecord)
}

func resolveFeedbackUserEmail(userRecord *core.Record) string {
	if userRecord == nil {
		return ""
	}

	return strings.TrimSpace(userRecord.Email())
}
