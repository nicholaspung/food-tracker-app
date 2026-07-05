package handlers

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	tastingInviteCodeLength           = 6
	maxTastingInviteCodeSaveAttempts  = 16
	maxTastingSessionNameLength       = 200
	maxTastingRestaurantNameLength    = 200
	maxTastingItemNameLength          = 300
	maxTastingNoteLength              = 500
	tastingSessionStatusLobby         = "lobby"
	tastingSessionStatusPlanning      = "planning"
	tastingSessionStatusTasting       = "tasting"
	tastingSessionStatusCompleted     = "completed"
	tastingSuggestionStatusPending    = "pending"
	tastingSuggestionStatusApproved   = "approved"
	tastingSuggestionStatusRejected   = "rejected"
	tastingInviteStatusPending        = "pending"
	tastingInviteStatusAccepted       = "accepted"
	tastingInviteStatusDismissed      = "dismissed"
	tastingInviteStatusRevoked        = "revoked"
	tastingRoleLeader                 = "leader"
	tastingRoleParticipant            = "participant"
	defaultTastingMaxParticipants     = 12
	defaultTastingMaxRestaurants      = 5
	defaultTastingMaxApprovedItems    = 30
	defaultTastingSessionListPageSize = 20
	maxTastingSessionListPageSize     = 50
)

type tastingSessionCreateRequest struct {
	Name                string   `json:"name"`
	JoinDurationMinutes int      `json:"joinDurationMinutes"`
	InvitedUserIDs      []string `json:"invitedUserIds"`
}

type tastingSessionJoinRequest struct {
	Code string `json:"code"`
}

type tastingInviteWindowReopenRequest struct {
	JoinDurationMinutes int `json:"joinDurationMinutes"`
}

type tastingRestaurantSuggestRequest struct {
	RestaurantID   string `json:"restaurantId"`
	RestaurantName string `json:"restaurantName"`
}

type tastingMenuItemSuggestRequest struct {
	MenuItemID string `json:"menuItemId"`
	Name       string `json:"name"`
}

type tastingSuggestionStatusRequest struct {
	Status string `json:"status"`
}

type tastingRatingSubmissionRequest struct {
	Restaurants []tastingRatingSubmissionRestaurant `json:"restaurants"`
}

type tastingRatingSubmissionRestaurant struct {
	RestaurantSuggestionID string                        `json:"restaurantSuggestionId"`
	Items                  []tastingRatingSubmissionItem `json:"items"`
}

type tastingRatingSubmissionItem struct {
	ItemID string  `json:"itemId"`
	Rating float64 `json:"rating"`
	Note   string  `json:"note"`
}

type tastingParticipantResponse struct {
	ID          string `json:"id"`
	UserID      string `json:"userId"`
	Name        string `json:"name"`
	Role        string `json:"role"`
	JoinedAt    string `json:"joinedAt"`
	SubmittedAt string `json:"submittedAt,omitempty"`
}

type tastingInviteResponse struct {
	ID              string `json:"id"`
	InvitedUserID   string `json:"invitedUserId"`
	InvitedUserName string `json:"invitedUserName"`
	Status          string `json:"status"`
	CreatedAt       string `json:"createdAt"`
}

type tastingRatingResponse struct {
	ID                  string  `json:"id"`
	ParticipantID       string  `json:"participantId"`
	UserID              string  `json:"userId"`
	Rating              float64 `json:"rating"`
	Note                string  `json:"note,omitempty"`
	GeneratedVisitID    string  `json:"generatedVisitId,omitempty"`
	GeneratedFoodItemID string  `json:"generatedFoodItemId,omitempty"`
	CreatedAt           string  `json:"createdAt"`
	UpdatedAt           string  `json:"updatedAt"`
}

type tastingMenuItemResponse struct {
	ID                       string                  `json:"id"`
	RestaurantSuggestionID   string                  `json:"restaurantSuggestionId"`
	MenuItemID               string                  `json:"menuItemId"`
	Name                     string                  `json:"name"`
	SuggestedByParticipantID string                  `json:"suggestedByParticipantId"`
	Status                   string                  `json:"status"`
	Ratings                  []tastingRatingResponse `json:"ratings"`
	CreatedAt                string                  `json:"createdAt"`
}

type tastingRestaurantResponse struct {
	ID                       string                    `json:"id"`
	RestaurantID             string                    `json:"restaurantId"`
	RestaurantName           string                    `json:"restaurantName"`
	SuggestedByParticipantID string                    `json:"suggestedByParticipantId"`
	Status                   string                    `json:"status"`
	Items                    []tastingMenuItemResponse `json:"items"`
	CreatedAt                string                    `json:"createdAt"`
}

type tastingSessionResponse struct {
	ID               string                       `json:"id"`
	Name             string                       `json:"name"`
	LeaderUserID     string                       `json:"leaderUserId"`
	Status           string                       `json:"status"`
	InviteCode       string                       `json:"inviteCode,omitempty"`
	JoinExpiresAt    string                       `json:"joinExpiresAt"`
	JoinedCount      int                          `json:"joinedCount"`
	MaxParticipants  int                          `json:"maxParticipants"`
	MaxRestaurants   int                          `json:"maxRestaurants"`
	MaxApprovedItems int                          `json:"maxApprovedItems"`
	Participants     []tastingParticipantResponse `json:"participants"`
	Invites          []tastingInviteResponse      `json:"invites"`
	Restaurants      []tastingRestaurantResponse  `json:"restaurants"`
	CreatedAt        string                       `json:"createdAt"`
	UpdatedAt        string                       `json:"updatedAt"`
}

type tastingSessionListInviteSummaryResponse struct {
	ID              string `json:"id"`
	InvitedUserID   string `json:"invitedUserId"`
	InvitedUserName string `json:"invitedUserName"`
	Status          string `json:"status"`
	CreatedAt       string `json:"createdAt"`
}

type tastingSessionListSummaryResponse struct {
	ID                      string                                   `json:"id"`
	Name                    string                                   `json:"name"`
	LeaderUserID            string                                   `json:"leaderUserId"`
	Status                  string                                   `json:"status"`
	JoinExpiresAt           string                                   `json:"joinExpiresAt"`
	JoinedCount             int                                      `json:"joinedCount"`
	MaxParticipants         int                                      `json:"maxParticipants"`
	MaxRestaurants          int                                      `json:"maxRestaurants"`
	MaxApprovedItems        int                                      `json:"maxApprovedItems"`
	ApprovedRestaurantCount int                                      `json:"approvedRestaurantCount"`
	ApprovedItemCount       int                                      `json:"approvedItemCount"`
	ViewerParticipant       bool                                     `json:"viewerParticipant"`
	ViewerInvite            *tastingSessionListInviteSummaryResponse `json:"viewerInvite,omitempty"`
	CreatedAt               string                                   `json:"createdAt"`
	UpdatedAt               string                                   `json:"updatedAt"`
}

type tastingSessionListPageResponse struct {
	Items       []tastingSessionListSummaryResponse `json:"items"`
	Page        int                                 `json:"page"`
	PageSize    int                                 `json:"pageSize"`
	TotalItems  int                                 `json:"totalItems"`
	TotalPages  int                                 `json:"totalPages"`
	HasNextPage bool                                `json:"hasNextPage"`
}

type tastingSessionListSummaryRow struct {
	ID                      string `db:"id"`
	Name                    string `db:"name"`
	LeaderUserID            string `db:"leaderUserId"`
	Status                  string `db:"status"`
	JoinExpiresAt           string `db:"joinExpiresAt"`
	JoinedCount             int    `db:"joinedCount"`
	MaxParticipants         int    `db:"maxParticipants"`
	MaxRestaurants          int    `db:"maxRestaurants"`
	MaxApprovedItems        int    `db:"maxApprovedItems"`
	ApprovedRestaurantCount int    `db:"approvedRestaurantCount"`
	ApprovedItemCount       int    `db:"approvedItemCount"`
	ViewerParticipant       int    `db:"viewerParticipant"`
	ViewerInviteID          string `db:"viewerInviteId"`
	ViewerInviteStatus      string `db:"viewerInviteStatus"`
	ViewerInviteCreatedAt   string `db:"viewerInviteCreatedAt"`
	CreatedAt               string `db:"createdAt"`
	UpdatedAt               string `db:"updatedAt"`
}

func RegisterTastingSessionHandlers(se *core.ServeEvent, app core.App) {
	se.Router.GET("/api/tasting-sessions", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}

		sessionRecords, err := listAccessibleTastingSessions(app, authRecord.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting sessions", err)
		}

		response := make([]tastingSessionResponse, 0, len(sessionRecords))
		for _, sessionRecord := range sessionRecords {
			sessionResponse, buildErr := buildTastingSessionResponse(app, sessionRecord, authRecord.Id)
			if buildErr != nil {
				return apis.NewApiError(500, "failed to build tasting session", buildErr)
			}
			response = append(response, sessionResponse)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/tasting-sessions/summary-page", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}

		filter, filterErr := normalizeTastingSessionListFilter(e.Request.URL.Query().Get("filter"))
		if filterErr != nil {
			return apis.NewBadRequestError(filterErr.Error(), nil)
		}

		page, pageSize, parseErr := parseTastingSessionListPagination(
			e.Request.URL.Query().Get("page"),
			e.Request.URL.Query().Get("pageSize"),
		)
		if parseErr != nil {
			return apis.NewBadRequestError(parseErr.Error(), nil)
		}

		response, responseErr := getTastingSessionListPageResponse(app, authRecord.Id, filter, page, pageSize)
		if responseErr != nil {
			return apis.NewApiError(500, "failed to load tasting session summaries", responseErr)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}

		requestBody := tastingSessionCreateRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		sessionName, err := normalizeBoundedString(requestBody.Name, "name", maxTastingSessionNameLength)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		durationMinutes, durationErr := normalizeTastingJoinDuration(requestBody.JoinDurationMinutes, true)
		if durationErr != nil {
			return apis.NewBadRequestError(durationErr.Error(), nil)
		}

		sessionID := ""
		notificationUserIDs := []string{}
		err = app.RunInTransaction(func(txApp core.App) error {
			sessionsCollection, collectionErr := txApp.FindCollectionByNameOrId("tasting_sessions")
			if collectionErr != nil {
				return apis.NewApiError(500, "internal error", collectionErr)
			}

			sessionRecord := core.NewRecord(sessionsCollection)
			sessionRecord.Set("name", sessionName)
			sessionRecord.Set("leader", authRecord.Id)
			sessionRecord.Set("status", tastingSessionStatusLobby)
			sessionRecord.Set("join_expires_at", time.Now().UTC().Add(time.Duration(durationMinutes)*time.Minute))
			sessionRecord.Set("invite_code", "")
			sessionRecord.Set("max_participants", defaultTastingMaxParticipants)
			sessionRecord.Set("max_restaurants", defaultTastingMaxRestaurants)
			sessionRecord.Set("max_approved_items", defaultTastingMaxApprovedItems)
			if saveErr := txApp.Save(sessionRecord); saveErr != nil {
				return apis.NewApiError(500, "failed to create tasting session", saveErr)
			}

			code, codeErr := generateTastingCode()
			if codeErr != nil {
				return apis.NewApiError(500, "failed to create invite code", codeErr)
			}
			sessionRecord.Set("invite_code", code)
			if saveErr := txApp.Save(sessionRecord); saveErr != nil {
				return apis.NewApiError(500, "failed to save invite code", saveErr)
			}

			if _, participantErr := createTastingParticipant(txApp, sessionRecord.Id, authRecord.Id, tastingRoleLeader); participantErr != nil {
				return participantErr
			}

			invitedUserIDs, inviteErr := upsertTastingInvites(txApp, sessionRecord.Id, requestBody.InvitedUserIDs)
			if inviteErr != nil {
				return inviteErr
			}

			sessionID = sessionRecord.Id
			notificationUserIDs = invitedUserIDs
			return nil
		})
		if err != nil {
			return err
		}
		if err := deliverTastingInviteNotifications(app, sessionID, authRecord.Id, notificationUserIDs); err != nil {
			return apis.NewApiError(500, "failed to deliver tasting invite notifications", err)
		}

		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/join", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}

		requestBody := tastingSessionJoinRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		code, err := normalizeTastingInviteCode(requestBody.Code)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		sessionID := ""
		err = app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, findErr := txApp.FindFirstRecordByFilter(
				"tasting_sessions",
				"invite_code = {:code}",
				dbx.Params{"code": code},
			)
			if findErr != nil {
				if errors.Is(findErr, sql.ErrNoRows) {
					return apis.NewNotFoundError("invalid invite code", nil)
				}
				return apis.NewApiError(500, "failed to load tasting session", findErr)
			}
			if joinErr := validateTastingJoin(txApp, sessionRecord, authRecord.Id); joinErr != nil {
				return joinErr
			}
			if _, participantErr := ensureTastingParticipant(txApp, sessionRecord.Id, authRecord.Id, tastingRoleParticipant); participantErr != nil {
				return participantErr
			}
			if inviteRecord, inviteErr := findTastingInvite(txApp, sessionRecord.Id, authRecord.Id); inviteErr != nil {
				return inviteErr
			} else if inviteRecord != nil && strings.TrimSpace(inviteRecord.GetString("status")) == tastingInviteStatusPending {
				inviteRecord.Set("status", tastingInviteStatusAccepted)
				if saveErr := txApp.Save(inviteRecord); saveErr != nil {
					return apis.NewApiError(500, "failed to accept invite", saveErr)
				}
			}
			sessionID = sessionRecord.Id
			return nil
		})
		if err != nil {
			return err
		}

		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/tasting-sessions/{sessionId}", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		if sessionID == "" {
			return apis.NewBadRequestError("sessionId is required", nil)
		}
		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/{sessionId}/accept-invite", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		err = app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, loadErr := loadVisibleTastingSession(txApp, sessionID, authRecord.Id)
			if loadErr != nil {
				return mapTastingLoadError(loadErr)
			}
			if joinErr := validateTastingJoin(txApp, sessionRecord, authRecord.Id); joinErr != nil {
				return joinErr
			}
			if _, participantErr := ensureTastingParticipant(txApp, sessionRecord.Id, authRecord.Id, tastingRoleParticipant); participantErr != nil {
				return participantErr
			}
			inviteRecord, inviteErr := findTastingInvite(txApp, sessionRecord.Id, authRecord.Id)
			if inviteErr != nil {
				return inviteErr
			}
			if inviteRecord != nil {
				inviteRecord.Set("status", tastingInviteStatusAccepted)
				if saveErr := txApp.Save(inviteRecord); saveErr != nil {
					return apis.NewApiError(500, "failed to accept invite", saveErr)
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/{sessionId}/dismiss-invite", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		inviteRecord, err := findTastingInvite(app, sessionID, authRecord.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load invite", err)
		}
		if inviteRecord == nil {
			return apis.NewNotFoundError("invite not found", nil)
		}
		inviteRecord.Set("status", tastingInviteStatusDismissed)
		if err := app.Save(inviteRecord); err != nil {
			return apis.NewApiError(500, "failed to dismiss invite", err)
		}
		return e.JSON(200, map[string]any{"success": true})
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/{sessionId}/invites/{inviteId}/resend", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		inviteID := strings.TrimSpace(e.Request.PathValue("inviteId"))
		notificationUserIDs := []string{}
		err = app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, loadErr := loadAccessibleTastingSession(txApp, sessionID, authRecord.Id)
			if loadErr != nil {
				return mapTastingLoadError(loadErr)
			}
			if strings.TrimSpace(sessionRecord.GetString("leader")) != authRecord.Id {
				return apis.NewForbiddenError("only the leader can resend invites", nil)
			}
			if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusLobby {
				return apis.NewBadRequestError("invites can only be resent during lobby", nil)
			}
			if !isTastingJoinWindowOpen(sessionRecord, time.Now().UTC()) {
				return apis.NewBadRequestError("invite window is closed", nil)
			}
			inviteRecord, inviteErr := txApp.FindRecordById("tasting_session_invites", inviteID)
			if inviteErr != nil || strings.TrimSpace(inviteRecord.GetString("session")) != sessionID {
				return apis.NewNotFoundError("invite not found", inviteErr)
			}
			inviteStatus := strings.TrimSpace(inviteRecord.GetString("status"))
			if inviteStatus != tastingInviteStatusDismissed && inviteStatus != tastingInviteStatusRevoked {
				return apis.NewBadRequestError("only dismissed or revoked invites can be resent", nil)
			}
			if inviteStatus == tastingInviteStatusRevoked {
				if err := clearTastingBlock(txApp, sessionID, strings.TrimSpace(inviteRecord.GetString("invited_user"))); err != nil {
					return err
				}
			}
			inviteRecord.Set("status", tastingInviteStatusPending)
			if err := txApp.Save(inviteRecord); err != nil {
				return apis.NewApiError(500, "failed to resend invite", err)
			}
			notificationUserIDs = append(notificationUserIDs, strings.TrimSpace(inviteRecord.GetString("invited_user")))
			return nil
		})
		if err != nil {
			return err
		}
		if err := deliverTastingInviteNotifications(app, sessionID, authRecord.Id, notificationUserIDs); err != nil {
			return apis.NewApiError(500, "failed to deliver tasting invite notifications", err)
		}
		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/{sessionId}/participants/{participantId}/kick", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		participantID := strings.TrimSpace(e.Request.PathValue("participantId"))
		err = app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, loadErr := loadAccessibleTastingSession(txApp, sessionID, authRecord.Id)
			if loadErr != nil {
				return mapTastingLoadError(loadErr)
			}
			if strings.TrimSpace(sessionRecord.GetString("leader")) != authRecord.Id {
				return apis.NewForbiddenError("only the leader can remove participants", nil)
			}
			if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusLobby {
				return apis.NewBadRequestError("participants can only be removed during lobby", nil)
			}
			participantRecord, participantErr := txApp.FindRecordById("tasting_session_participants", participantID)
			if participantErr != nil || strings.TrimSpace(participantRecord.GetString("session")) != sessionID {
				return apis.NewNotFoundError("participant not found", participantErr)
			}
			if strings.TrimSpace(participantRecord.GetString("role")) == tastingRoleLeader {
				return apis.NewBadRequestError("the leader cannot be removed", nil)
			}
			removedUserID := strings.TrimSpace(participantRecord.GetString("user"))
			if err := txApp.Delete(participantRecord); err != nil {
				return apis.NewApiError(500, "failed to remove participant", err)
			}
			if err := revokeTastingInvite(txApp, sessionID, removedUserID); err != nil {
				return err
			}
			if err := createTastingBlock(txApp, sessionID, removedUserID, authRecord.Id); err != nil {
				return err
			}
			return nil
		})
		if err != nil {
			return err
		}
		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/{sessionId}/leave", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		err = app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, loadErr := loadAccessibleTastingSession(txApp, sessionID, authRecord.Id)
			if loadErr != nil {
				return mapTastingLoadError(loadErr)
			}
			if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusLobby {
				return apis.NewBadRequestError("participants can only leave during lobby", nil)
			}
			if strings.TrimSpace(sessionRecord.GetString("leader")) == authRecord.Id {
				return apis.NewBadRequestError("the leader cannot leave their own tasting session", nil)
			}
			participantRecord, participantErr := findTastingParticipantRecord(txApp, sessionID, authRecord.Id)
			if participantErr != nil {
				return apis.NewApiError(500, "failed to load participant", participantErr)
			}
			if participantRecord == nil {
				return apis.NewNotFoundError("participant not found", nil)
			}
			if err := txApp.Delete(participantRecord); err != nil {
				return apis.NewApiError(500, "failed to leave tasting session", err)
			}
			if inviteRecord, inviteErr := findTastingInvite(txApp, sessionID, authRecord.Id); inviteErr != nil {
				return apis.NewApiError(500, "failed to load invite", inviteErr)
			} else if inviteRecord != nil {
				inviteRecord.Set("status", tastingInviteStatusDismissed)
				if saveErr := txApp.Save(inviteRecord); saveErr != nil {
					return apis.NewApiError(500, "failed to dismiss invite", saveErr)
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
		return e.JSON(200, map[string]any{"success": true})
	}).Bind(apis.RequireAuth())

	se.Router.DELETE("/api/tasting-sessions/{sessionId}", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		err = app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, loadErr := loadAccessibleTastingSession(txApp, sessionID, authRecord.Id)
			if loadErr != nil {
				return mapTastingLoadError(loadErr)
			}
			if strings.TrimSpace(sessionRecord.GetString("leader")) != authRecord.Id {
				return apis.NewForbiddenError("only the leader can delete this tasting session", nil)
			}
			sessionStatus := strings.TrimSpace(sessionRecord.GetString("status"))
			if sessionStatus != tastingSessionStatusLobby && sessionStatus != tastingSessionStatusPlanning {
				return apis.NewBadRequestError("only lobby or planning sessions can be deleted", nil)
			}
			if err := deleteTastingSessionDependents(txApp, sessionRecord.Id); err != nil {
				return err
			}
			if err := txApp.Delete(sessionRecord); err != nil {
				return apis.NewApiError(500, "failed to delete tasting session", err)
			}
			return nil
		})
		if err != nil {
			return err
		}
		return e.JSON(200, map[string]any{"success": true})
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/{sessionId}/lock-membership", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		err = app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, loadErr := loadAccessibleTastingSession(txApp, sessionID, authRecord.Id)
			if loadErr != nil {
				return mapTastingLoadError(loadErr)
			}
			if strings.TrimSpace(sessionRecord.GetString("leader")) != authRecord.Id {
				return apis.NewForbiddenError("only the leader can lock membership", nil)
			}
			if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusLobby {
				return apis.NewBadRequestError("only lobby sessions can be locked", nil)
			}
			sessionRecord.Set("status", tastingSessionStatusPlanning)
			if err := txApp.Save(sessionRecord); err != nil {
				return apis.NewApiError(500, "failed to lock membership", err)
			}
			return nil
		})
		if err != nil {
			return err
		}
		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/{sessionId}/reopen-invite-window", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		requestBody := tastingInviteWindowReopenRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}
		durationMinutes, durationErr := normalizeTastingJoinDuration(requestBody.JoinDurationMinutes, false)
		if durationErr != nil {
			return apis.NewBadRequestError(durationErr.Error(), nil)
		}
		err = app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, loadErr := loadAccessibleTastingSession(txApp, sessionID, authRecord.Id)
			if loadErr != nil {
				return mapTastingLoadError(loadErr)
			}
			if strings.TrimSpace(sessionRecord.GetString("leader")) != authRecord.Id {
				return apis.NewForbiddenError("only the leader can reopen the invite window", nil)
			}
			if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusLobby {
				return apis.NewBadRequestError("only lobby sessions can reopen the invite window", nil)
			}
			if isTastingJoinWindowOpen(sessionRecord, time.Now().UTC()) {
				return apis.NewBadRequestError("invite window is already open", nil)
			}
			previousCode := strings.TrimSpace(sessionRecord.GetString("invite_code"))
			code := ""
			for attempt := 0; attempt < maxTastingInviteCodeSaveAttempts; attempt++ {
				generatedCode, codeErr := generateTastingCode()
				if codeErr != nil {
					return apis.NewApiError(500, "failed to create invite code", codeErr)
				}
				if generatedCode != previousCode {
					code = generatedCode
					break
				}
			}
			if code == "" {
				return apis.NewApiError(500, "failed to create invite code", nil)
			}
			sessionRecord.Set("invite_code", code)
			sessionRecord.Set("join_expires_at", time.Now().UTC().Add(time.Duration(durationMinutes)*time.Minute))
			if err := txApp.Save(sessionRecord); err != nil {
				return apis.NewApiError(500, "failed to reopen invite window", err)
			}
			if err := reactivateDismissedTastingInvites(txApp, sessionRecord.Id); err != nil {
				return err
			}
			return nil
		})
		if err != nil {
			return err
		}
		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/{sessionId}/restaurants", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		requestBody := tastingRestaurantSuggestRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}
		err = app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, participantRecord, prepErr := loadPlanningLeaderParticipant(txApp, sessionID, authRecord.Id)
			if prepErr != nil {
				return prepErr
			}
			if count, countErr := countTastingApprovedRestaurants(txApp, sessionRecord.Id); countErr != nil {
				return countErr
			} else if count >= maxIntRecordValue(sessionRecord, "max_restaurants", defaultTastingMaxRestaurants) {
				return apis.NewBadRequestError("restaurant limit reached", nil)
			}
			restaurantName, nameErr := normalizeBoundedString(requestBody.RestaurantName, "restaurantName", maxTastingRestaurantNameLength)
			if nameErr != nil && strings.TrimSpace(requestBody.RestaurantID) == "" {
				return apis.NewBadRequestError(nameErr.Error(), nil)
			}
			restaurantRecord, resolveErr := resolveRestaurantForWrite(txApp, authRecord, restaurantResolveInput{
				RestaurantID:   requestBody.RestaurantID,
				RestaurantName: restaurantName,
			})
			if resolveErr != nil {
				return wrapRestaurantResolveError(resolveErr)
			}
			collection, collectionErr := txApp.FindCollectionByNameOrId("tasting_session_restaurants")
			if collectionErr != nil {
				return apis.NewApiError(500, "internal error", collectionErr)
			}
			record := core.NewRecord(collection)
			record.Set("session", sessionRecord.Id)
			record.Set("restaurant", restaurantRecord.Id)
			record.Set("suggested_by_participant", participantRecord.Id)
			record.Set("status", tastingSuggestionStatusApproved)
			if err := txApp.Save(record); err != nil {
				return apis.NewApiError(500, "failed to suggest restaurant", err)
			}
			return nil
		})
		if err != nil {
			return err
		}
		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())

	se.Router.PATCH("/api/tasting-sessions/{sessionId}/restaurants/{restaurantSuggestionId}/status", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		restaurantSuggestionID := strings.TrimSpace(e.Request.PathValue("restaurantSuggestionId"))
		requestBody := tastingSuggestionStatusRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}
		if err := setTastingSuggestionStatus(app, authRecord.Id, sessionID, "tasting_session_restaurants", restaurantSuggestionID, requestBody.Status); err != nil {
			return err
		}
		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/{sessionId}/restaurants/{restaurantSuggestionId}/items", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		restaurantSuggestionID := strings.TrimSpace(e.Request.PathValue("restaurantSuggestionId"))
		requestBody := tastingMenuItemSuggestRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}
		err = app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, participantRecord, prepErr := loadPlanningLeaderParticipant(txApp, sessionID, authRecord.Id)
			if prepErr != nil {
				return prepErr
			}
			if count, countErr := countTastingApprovedItems(txApp, sessionRecord.Id); countErr != nil {
				return countErr
			} else if count >= maxIntRecordValue(sessionRecord, "max_approved_items", defaultTastingMaxApprovedItems) {
				return apis.NewBadRequestError("approved item limit reached", nil)
			}
			restaurantSuggestion, err := txApp.FindRecordById("tasting_session_restaurants", restaurantSuggestionID)
			if err != nil || strings.TrimSpace(restaurantSuggestion.GetString("session")) != sessionID {
				return apis.NewNotFoundError("restaurant suggestion not found", err)
			}
			menuItemRecord, resolveErr := resolveTastingMenuItem(txApp, authRecord.Id, strings.TrimSpace(restaurantSuggestion.GetString("restaurant")), requestBody)
			if resolveErr != nil {
				return resolveErr
			}
			collection, collectionErr := txApp.FindCollectionByNameOrId("tasting_session_items")
			if collectionErr != nil {
				return apis.NewApiError(500, "internal error", collectionErr)
			}
			record := core.NewRecord(collection)
			record.Set("session", sessionRecord.Id)
			record.Set("restaurant_suggestion", restaurantSuggestion.Id)
			record.Set("menu_item", menuItemRecord.Id)
			record.Set("suggested_by_participant", participantRecord.Id)
			record.Set("status", tastingSuggestionStatusApproved)
			if err := txApp.Save(record); err != nil {
				return apis.NewApiError(500, "failed to suggest item", err)
			}
			return nil
		})
		if err != nil {
			return err
		}
		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())

	se.Router.PATCH("/api/tasting-sessions/{sessionId}/items/{itemSuggestionId}/status", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		itemSuggestionID := strings.TrimSpace(e.Request.PathValue("itemSuggestionId"))
		requestBody := tastingSuggestionStatusRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}
		if err := setTastingSuggestionStatus(app, authRecord.Id, sessionID, "tasting_session_items", itemSuggestionID, requestBody.Status); err != nil {
			return err
		}
		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/{sessionId}/start", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		err = app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, loadErr := loadAccessibleTastingSession(txApp, sessionID, authRecord.Id)
			if loadErr != nil {
				return mapTastingLoadError(loadErr)
			}
			if strings.TrimSpace(sessionRecord.GetString("leader")) != authRecord.Id {
				return apis.NewForbiddenError("only the leader can start tasting", nil)
			}
			if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusPlanning {
				return apis.NewBadRequestError("only planning sessions can start tasting", nil)
			}
			if err := validateTastingReadyToStart(txApp, sessionID); err != nil {
				return err
			}
			sessionRecord.Set("status", tastingSessionStatusTasting)
			if err := txApp.Save(sessionRecord); err != nil {
				return apis.NewApiError(500, "failed to start tasting", err)
			}
			return nil
		})
		if err != nil {
			return err
		}
		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/{sessionId}/ratings", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		requestBody := tastingRatingSubmissionRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}
		err = app.RunInTransaction(func(txApp core.App) error {
			return submitTastingRatings(txApp, authRecord, sessionID, requestBody)
		})
		if err != nil {
			return err
		}
		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/{sessionId}/complete", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		err = app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, loadErr := loadAccessibleTastingSession(txApp, sessionID, authRecord.Id)
			if loadErr != nil {
				return mapTastingLoadError(loadErr)
			}
			if strings.TrimSpace(sessionRecord.GetString("leader")) != authRecord.Id {
				return apis.NewForbiddenError("only the leader can complete the session", nil)
			}
			if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusTasting {
				return apis.NewBadRequestError("only tasting sessions can be completed", nil)
			}
			sessionRecord.Set("status", tastingSessionStatusCompleted)
			if err := txApp.Save(sessionRecord); err != nil {
				return apis.NewApiError(500, "failed to complete tasting session", err)
			}
			return nil
		})
		if err != nil {
			return err
		}
		return writeTastingSessionResponse(e, app, sessionID, authRecord.Id)
	}).Bind(apis.RequireAuth())
}

func requireTastingAuth(e *core.RequestEvent) (*core.Record, error) {
	if e.Auth == nil {
		return nil, apis.NewUnauthorizedError("authentication required", nil)
	}
	return e.Auth, nil
}

func writeTastingSessionResponse(e *core.RequestEvent, app core.App, sessionID string, viewerUserID string) error {
	sessionRecord, err := loadVisibleTastingSession(app, sessionID, viewerUserID)
	if err != nil {
		return mapTastingLoadError(err)
	}
	response, err := buildTastingSessionResponse(app, sessionRecord, viewerUserID)
	if err != nil {
		return apis.NewApiError(500, "failed to build tasting session", err)
	}
	return e.JSON(200, response)
}

func mapTastingLoadError(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return apis.NewNotFoundError("session not found", nil)
	}
	return apis.NewApiError(500, "failed to load tasting session", err)
}

func normalizeTastingSessionListFilter(filterRaw string) (string, error) {
	switch strings.TrimSpace(filterRaw) {
	case "", "active":
		return "active", nil
	case "completed":
		return "completed", nil
	default:
		return "", fmt.Errorf("invalid tasting session filter")
	}
}

func parseTastingSessionListPagination(pageRaw string, pageSizeRaw string) (int, int, error) {
	page := 1
	if strings.TrimSpace(pageRaw) != "" {
		parsedPage, err := strconv.Atoi(pageRaw)
		if err != nil || parsedPage < 1 {
			return 0, 0, fmt.Errorf("invalid page")
		}
		page = parsedPage
	}

	pageSize := defaultTastingSessionListPageSize
	if strings.TrimSpace(pageSizeRaw) != "" {
		parsedPageSize, err := strconv.Atoi(pageSizeRaw)
		if err != nil || parsedPageSize < 1 {
			return 0, 0, fmt.Errorf("invalid pageSize")
		}
		if parsedPageSize > maxTastingSessionListPageSize {
			pageSize = maxTastingSessionListPageSize
		} else {
			pageSize = parsedPageSize
		}
	}

	return page, pageSize, nil
}

func tastingSessionListFilterSQL(filter string) string {
	if filter == "completed" {
		return "COALESCE(sessions.status, '') = 'completed'"
	}
	return "COALESCE(sessions.status, '') != 'completed'"
}

func tastingSessionListAccessSQL(filter string) string {
	if filter == "completed" {
		return `
			(
				sessions.leader = {:userId}
				OR EXISTS (
					SELECT 1
					FROM tasting_session_participants current_user_participants
					WHERE current_user_participants.session = sessions.id
						AND current_user_participants.user = {:userId}
				)
			)
		`
	}

	return `
		(
			sessions.leader = {:userId}
			OR EXISTS (
				SELECT 1
				FROM tasting_session_participants current_user_participants
				WHERE current_user_participants.session = sessions.id
					AND current_user_participants.user = {:userId}
			)
			OR (
				COALESCE(sessions.status, '') = 'lobby'
				AND sessions.join_expires_at > {:now}
				AND EXISTS (
					SELECT 1
					FROM tasting_session_invites current_user_invites
					WHERE current_user_invites.session = sessions.id
						AND current_user_invites.invited_user = {:userId}
						AND current_user_invites.status = 'pending'
				)
			)
		)
	`
}

func tastingSessionListSummaryCTE(filter string) string {
	return fmt.Sprintf(`
		WITH visible_sessions AS (
			SELECT
				sessions.id,
				sessions.name,
				sessions.leader,
				sessions.status,
				sessions.join_expires_at,
				sessions.max_participants,
				sessions.max_restaurants,
				sessions.max_approved_items,
				sessions.created,
				sessions.updated
			FROM tasting_sessions sessions
			WHERE %s
				AND %s
				AND NOT (
					sessions.leader != {:userId}
					AND EXISTS (
						SELECT 1
						FROM tasting_session_invites revoked_invites
						WHERE revoked_invites.session = sessions.id
							AND revoked_invites.invited_user = {:userId}
							AND revoked_invites.status = 'revoked'
					)
				)
		),
		session_summaries AS (
			SELECT
				visible_sessions.id AS [[id]],
				visible_sessions.name AS [[name]],
				visible_sessions.leader AS [[leaderUserId]],
				visible_sessions.status AS [[status]],
				visible_sessions.join_expires_at AS [[joinExpiresAt]],
				COUNT(DISTINCT participants.id) AS [[joinedCount]],
				COALESCE(visible_sessions.max_participants, 0) AS [[maxParticipants]],
				COALESCE(visible_sessions.max_restaurants, 0) AS [[maxRestaurants]],
				COALESCE(visible_sessions.max_approved_items, 0) AS [[maxApprovedItems]],
				COUNT(DISTINCT CASE WHEN restaurants.status = 'approved' THEN restaurants.id END) AS [[approvedRestaurantCount]],
				COUNT(DISTINCT CASE WHEN restaurants.status = 'approved' AND items.status = 'approved' THEN items.id END) AS [[approvedItemCount]],
				MAX(CASE WHEN participants.user = {:userId} THEN 1 ELSE 0 END) AS [[viewerParticipant]],
				COALESCE(MAX(viewer_invites.id), '') AS [[viewerInviteId]],
				COALESCE(MAX(viewer_invites.status), '') AS [[viewerInviteStatus]],
				COALESCE(MAX(viewer_invites.created), '') AS [[viewerInviteCreatedAt]],
				visible_sessions.created AS [[createdAt]],
				visible_sessions.updated AS [[updatedAt]]
			FROM visible_sessions
			LEFT JOIN tasting_session_participants participants
				ON participants.session = visible_sessions.id
			LEFT JOIN tasting_session_invites viewer_invites
				ON viewer_invites.session = visible_sessions.id
				AND viewer_invites.invited_user = {:userId}
			LEFT JOIN tasting_session_restaurants restaurants
				ON restaurants.session = visible_sessions.id
			LEFT JOIN tasting_session_items items
				ON items.session = visible_sessions.id
				AND items.restaurant_suggestion = restaurants.id
			GROUP BY
				visible_sessions.id,
				visible_sessions.name,
				visible_sessions.leader,
				visible_sessions.status,
				visible_sessions.join_expires_at,
				visible_sessions.max_participants,
				visible_sessions.max_restaurants,
				visible_sessions.max_approved_items,
				visible_sessions.created,
				visible_sessions.updated
		)
	`, tastingSessionListFilterSQL(filter), tastingSessionListAccessSQL(filter))
}

func getTastingSessionListPageResponse(
	app core.App,
	userID string,
	filter string,
	page int,
	pageSize int,
) (tastingSessionListPageResponse, error) {
	var totalItems int
	countQuery := fmt.Sprintf(`
		%s
		SELECT COUNT(*)
		FROM session_summaries
	`, tastingSessionListSummaryCTE(filter))
	if err := app.DB().NewQuery(countQuery).
		Bind(dbx.Params{
			"now":    time.Now().UTC(),
			"userId": strings.TrimSpace(userID),
		}).
		Row(&totalItems); err != nil {
		return tastingSessionListPageResponse{}, err
	}

	rows := []tastingSessionListSummaryRow{}
	rowsQuery := fmt.Sprintf(`
		%s
		SELECT
			id AS [[id]],
			name AS [[name]],
			leaderUserId AS [[leaderUserId]],
			status AS [[status]],
			joinExpiresAt AS [[joinExpiresAt]],
			joinedCount AS [[joinedCount]],
			maxParticipants AS [[maxParticipants]],
			maxRestaurants AS [[maxRestaurants]],
			maxApprovedItems AS [[maxApprovedItems]],
			approvedRestaurantCount AS [[approvedRestaurantCount]],
			approvedItemCount AS [[approvedItemCount]],
			viewerParticipant AS [[viewerParticipant]],
			viewerInviteId AS [[viewerInviteId]],
			viewerInviteStatus AS [[viewerInviteStatus]],
			viewerInviteCreatedAt AS [[viewerInviteCreatedAt]],
			createdAt AS [[createdAt]],
			updatedAt AS [[updatedAt]]
		FROM session_summaries
		ORDER BY updatedAt DESC, createdAt DESC, id DESC
		LIMIT {:limit} OFFSET {:offset}
	`, tastingSessionListSummaryCTE(filter))
	if err := app.DB().NewQuery(rowsQuery).
		Bind(dbx.Params{
			"limit":  pageSize,
			"now":    time.Now().UTC(),
			"offset": (page - 1) * pageSize,
			"userId": strings.TrimSpace(userID),
		}).
		All(&rows); err != nil {
		return tastingSessionListPageResponse{}, err
	}

	totalPages := 0
	if totalItems > 0 {
		totalPages = (totalItems + pageSize - 1) / pageSize
	}

	items := make([]tastingSessionListSummaryResponse, 0, len(rows))
	for _, row := range rows {
		items = append(items, mapTastingSessionListSummaryRow(row, userID))
	}

	return tastingSessionListPageResponse{
		Items:       items,
		Page:        page,
		PageSize:    pageSize,
		TotalItems:  totalItems,
		TotalPages:  totalPages,
		HasNextPage: totalPages > 0 && page < totalPages,
	}, nil
}

func mapTastingSessionListSummaryRow(row tastingSessionListSummaryRow, viewerUserID string) tastingSessionListSummaryResponse {
	var viewerInvite *tastingSessionListInviteSummaryResponse
	if strings.TrimSpace(row.ViewerInviteID) != "" {
		viewerInvite = &tastingSessionListInviteSummaryResponse{
			ID:              strings.TrimSpace(row.ViewerInviteID),
			InvitedUserID:   strings.TrimSpace(viewerUserID),
			InvitedUserName: "",
			Status:          strings.TrimSpace(row.ViewerInviteStatus),
			CreatedAt:       row.ViewerInviteCreatedAt,
		}
	}

	return tastingSessionListSummaryResponse{
		ID:                      strings.TrimSpace(row.ID),
		Name:                    strings.TrimSpace(row.Name),
		LeaderUserID:            strings.TrimSpace(row.LeaderUserID),
		Status:                  strings.TrimSpace(row.Status),
		JoinExpiresAt:           row.JoinExpiresAt,
		JoinedCount:             row.JoinedCount,
		MaxParticipants:         row.MaxParticipants,
		MaxRestaurants:          row.MaxRestaurants,
		MaxApprovedItems:        row.MaxApprovedItems,
		ApprovedRestaurantCount: row.ApprovedRestaurantCount,
		ApprovedItemCount:       row.ApprovedItemCount,
		ViewerParticipant:       row.ViewerParticipant != 0,
		ViewerInvite:            viewerInvite,
		CreatedAt:               row.CreatedAt,
		UpdatedAt:               row.UpdatedAt,
	}
}

func listAccessibleTastingSessions(app core.App, userID string) ([]*core.Record, error) {
	trimmedUserID := strings.TrimSpace(userID)
	records, err := app.FindRecordsByFilter(
		"tasting_sessions",
		"leader = {:user} || tasting_session_participants_via_session.user ?= {:user} || tasting_session_invites_via_session.invited_user ?= {:user}",
		"-updated,-created",
		200,
		0,
		dbx.Params{"user": trimmedUserID},
	)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	visibleRecords := make([]*core.Record, 0, len(records))
	for _, record := range records {
		if strings.TrimSpace(record.GetString("leader")) == trimmedUserID {
			visibleRecords = append(visibleRecords, record)
			continue
		}
		participant, participantErr := findTastingParticipantRecord(app, record.Id, trimmedUserID)
		if participantErr != nil {
			return nil, participantErr
		}
		if participant != nil {
			visibleRecords = append(visibleRecords, record)
			continue
		}
		invite, inviteErr := findTastingInvite(app, record.Id, trimmedUserID)
		if inviteErr != nil {
			return nil, inviteErr
		}
		if strings.TrimSpace(record.GetString("status")) == tastingSessionStatusLobby &&
			invite != nil &&
			strings.TrimSpace(invite.GetString("status")) == tastingInviteStatusPending &&
			isTastingJoinWindowOpen(record, now) {
			visibleRecords = append(visibleRecords, record)
		}
	}

	return visibleRecords, nil
}

func loadVisibleTastingSession(app core.App, sessionID string, userID string) (*core.Record, error) {
	sessionRecord, err := app.FindRecordById("tasting_sessions", strings.TrimSpace(sessionID))
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(sessionRecord.GetString("leader")) == strings.TrimSpace(userID) {
		return sessionRecord, nil
	}
	if participant, err := findTastingParticipantRecord(app, sessionRecord.Id, userID); err != nil {
		return nil, err
	} else if participant != nil {
		return sessionRecord, nil
	}
	if invite, err := findTastingInvite(app, sessionRecord.Id, userID); err != nil {
		return nil, err
	} else if strings.TrimSpace(sessionRecord.GetString("status")) == tastingSessionStatusLobby &&
		invite != nil &&
		strings.TrimSpace(invite.GetString("status")) == tastingInviteStatusPending &&
		isTastingJoinWindowOpen(sessionRecord, time.Now().UTC()) {
		return sessionRecord, nil
	}
	return nil, sql.ErrNoRows
}

func loadAccessibleTastingSession(app core.App, sessionID string, userID string) (*core.Record, error) {
	sessionRecord, err := app.FindRecordById("tasting_sessions", strings.TrimSpace(sessionID))
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(sessionRecord.GetString("leader")) == strings.TrimSpace(userID) {
		return sessionRecord, nil
	}
	if participant, err := findTastingParticipantRecord(app, sessionRecord.Id, userID); err != nil {
		return nil, err
	} else if participant != nil {
		return sessionRecord, nil
	}
	return nil, sql.ErrNoRows
}

func buildTastingSessionResponse(app core.App, sessionRecord *core.Record, viewerUserID string) (tastingSessionResponse, error) {
	participants, participantByUserID, participantByID, err := buildTastingParticipants(app, sessionRecord.Id)
	if err != nil {
		return tastingSessionResponse{}, err
	}
	invites, err := buildTastingInvites(app, sessionRecord.Id)
	if err != nil {
		return tastingSessionResponse{}, err
	}
	restaurants, err := buildTastingRestaurants(app, sessionRecord, viewerUserID, participantByUserID, participantByID)
	if err != nil {
		return tastingSessionResponse{}, err
	}
	inviteCode := ""
	if strings.TrimSpace(sessionRecord.GetString("leader")) == strings.TrimSpace(viewerUserID) &&
		strings.TrimSpace(sessionRecord.GetString("status")) == tastingSessionStatusLobby &&
		isTastingJoinWindowOpen(sessionRecord, time.Now().UTC()) {
		inviteCode = strings.TrimSpace(sessionRecord.GetString("invite_code"))
	}
	return tastingSessionResponse{
		ID:               sessionRecord.Id,
		Name:             strings.TrimSpace(sessionRecord.GetString("name")),
		LeaderUserID:     strings.TrimSpace(sessionRecord.GetString("leader")),
		Status:           strings.TrimSpace(sessionRecord.GetString("status")),
		InviteCode:       inviteCode,
		JoinExpiresAt:    sessionRecord.GetString("join_expires_at"),
		JoinedCount:      len(participants),
		MaxParticipants:  maxIntRecordValue(sessionRecord, "max_participants", defaultTastingMaxParticipants),
		MaxRestaurants:   maxIntRecordValue(sessionRecord, "max_restaurants", defaultTastingMaxRestaurants),
		MaxApprovedItems: maxIntRecordValue(sessionRecord, "max_approved_items", defaultTastingMaxApprovedItems),
		Participants:     participants,
		Invites:          invites,
		Restaurants:      restaurants,
		CreatedAt:        sessionRecord.GetString("created"),
		UpdatedAt:        sessionRecord.GetString("updated"),
	}, nil
}

func buildTastingParticipants(app core.App, sessionID string) ([]tastingParticipantResponse, map[string]tastingParticipantResponse, map[string]tastingParticipantResponse, error) {
	records, err := app.FindRecordsByFilter("tasting_session_participants", "session = {:session}", "created", 200, 0, dbx.Params{"session": sessionID})
	if err != nil {
		return nil, nil, nil, err
	}
	userIDs := make([]string, 0, len(records))
	for _, record := range records {
		userIDs = append(userIDs, record.GetString("user"))
	}
	users, err := findRecordsByRelationValues(app, "users", "id", userIDs, "")
	if err != nil {
		return nil, nil, nil, err
	}
	usersByID := mapRecordsByID(users)
	responses := make([]tastingParticipantResponse, 0, len(records))
	byUser := map[string]tastingParticipantResponse{}
	byID := map[string]tastingParticipantResponse{}
	for _, record := range records {
		userID := strings.TrimSpace(record.GetString("user"))
		response := tastingParticipantResponse{
			ID:          record.Id,
			UserID:      userID,
			Name:        resolveTastingUserDisplayName(usersByID[userID]),
			Role:        firstNonEmpty(strings.TrimSpace(record.GetString("role")), tastingRoleParticipant),
			JoinedAt:    record.GetString("created"),
			SubmittedAt: strings.TrimSpace(record.GetString("submitted_at")),
		}
		responses = append(responses, response)
		byUser[userID] = response
		byID[record.Id] = response
	}
	return responses, byUser, byID, nil
}

func buildTastingInvites(app core.App, sessionID string) ([]tastingInviteResponse, error) {
	records, err := app.FindRecordsByFilter("tasting_session_invites", "session = {:session}", "created", 200, 0, dbx.Params{"session": sessionID})
	if err != nil {
		return nil, err
	}
	userIDs := make([]string, 0, len(records))
	for _, record := range records {
		userIDs = append(userIDs, record.GetString("invited_user"))
	}
	users, err := findRecordsByRelationValues(app, "users", "id", userIDs, "")
	if err != nil {
		return nil, err
	}
	usersByID := mapRecordsByID(users)
	responses := make([]tastingInviteResponse, 0, len(records))
	for _, record := range records {
		userID := strings.TrimSpace(record.GetString("invited_user"))
		responses = append(responses, tastingInviteResponse{
			ID:              record.Id,
			InvitedUserID:   userID,
			InvitedUserName: resolveTastingUserDisplayName(usersByID[userID]),
			Status:          strings.TrimSpace(record.GetString("status")),
			CreatedAt:       record.GetString("created"),
		})
	}
	return responses, nil
}

func buildTastingRestaurants(
	app core.App,
	sessionRecord *core.Record,
	viewerUserID string,
	participantByUserID map[string]tastingParticipantResponse,
	participantByID map[string]tastingParticipantResponse,
) ([]tastingRestaurantResponse, error) {
	restaurantRecords, err := app.FindRecordsByFilter("tasting_session_restaurants", "session = {:session}", "created", 200, 0, dbx.Params{"session": sessionRecord.Id})
	if err != nil {
		return nil, err
	}
	restaurantIDs := make([]string, 0, len(restaurantRecords))
	for _, record := range restaurantRecords {
		restaurantIDs = append(restaurantIDs, record.GetString("restaurant"))
	}
	restaurants, err := findRecordsByRelationValues(app, "restaurants", "id", restaurantIDs, "")
	if err != nil {
		return nil, err
	}
	restaurantsByID := mapRecordsByID(restaurants)

	itemRecords, err := app.FindRecordsByFilter("tasting_session_items", "session = {:session}", "created", 500, 0, dbx.Params{"session": sessionRecord.Id})
	if err != nil {
		return nil, err
	}
	menuItemIDs := make([]string, 0, len(itemRecords))
	for _, record := range itemRecords {
		menuItemIDs = append(menuItemIDs, record.GetString("menu_item"))
	}
	menuItems, err := findRecordsByRelationValues(app, "menu_items", "id", menuItemIDs, "")
	if err != nil {
		return nil, err
	}
	menuItemsByID := mapRecordsByID(menuItems)

	ratingFilter := "session = {:session}"
	ratingParams := dbx.Params{"session": sessionRecord.Id}
	if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusCompleted {
		ratingFilter += " && user = {:user}"
		ratingParams["user"] = strings.TrimSpace(viewerUserID)
	}
	ratingRecords, err := app.FindRecordsByFilter("tasting_session_ratings", ratingFilter, "created", 2000, 0, ratingParams)
	if err != nil {
		return nil, err
	}
	ratingsByItemID := groupRecordsByField(ratingRecords, "item")
	itemsByRestaurantSuggestionID := map[string][]tastingMenuItemResponse{}
	for _, itemRecord := range itemRecords {
		itemRatings := make([]tastingRatingResponse, 0, len(ratingsByItemID[itemRecord.Id]))
		for _, ratingRecord := range ratingsByItemID[itemRecord.Id] {
			participantID := strings.TrimSpace(ratingRecord.GetString("participant"))
			itemRatings = append(itemRatings, tastingRatingResponse{
				ID:                  ratingRecord.Id,
				ParticipantID:       participantID,
				UserID:              strings.TrimSpace(ratingRecord.GetString("user")),
				Rating:              ratingRecord.GetFloat("rating"),
				Note:                strings.TrimSpace(ratingRecord.GetString("note")),
				GeneratedVisitID:    strings.TrimSpace(ratingRecord.GetString("generated_visit")),
				GeneratedFoodItemID: strings.TrimSpace(ratingRecord.GetString("generated_food_item")),
				CreatedAt:           ratingRecord.GetString("created"),
				UpdatedAt:           ratingRecord.GetString("updated"),
			})
		}
		menuItemID := strings.TrimSpace(itemRecord.GetString("menu_item"))
		menuItemName := ""
		if menuItemsByID[menuItemID] != nil {
			menuItemName = strings.TrimSpace(menuItemsByID[menuItemID].GetString("name"))
		}
		suggestedByID := strings.TrimSpace(itemRecord.GetString("suggested_by_participant"))
		if participantByID[suggestedByID].ID == "" {
			suggestedByID = ""
		}
		response := tastingMenuItemResponse{
			ID:                       itemRecord.Id,
			RestaurantSuggestionID:   strings.TrimSpace(itemRecord.GetString("restaurant_suggestion")),
			MenuItemID:               menuItemID,
			Name:                     menuItemName,
			SuggestedByParticipantID: suggestedByID,
			Status:                   strings.TrimSpace(itemRecord.GetString("status")),
			Ratings:                  itemRatings,
			CreatedAt:                itemRecord.GetString("created"),
		}
		itemsByRestaurantSuggestionID[response.RestaurantSuggestionID] = append(itemsByRestaurantSuggestionID[response.RestaurantSuggestionID], response)
	}

	responses := make([]tastingRestaurantResponse, 0, len(restaurantRecords))
	for _, record := range restaurantRecords {
		restaurantID := strings.TrimSpace(record.GetString("restaurant"))
		restaurantName := ""
		if restaurantsByID[restaurantID] != nil {
			restaurantName = strings.TrimSpace(restaurantsByID[restaurantID].GetString("name"))
		}
		suggestedByID := strings.TrimSpace(record.GetString("suggested_by_participant"))
		if participantByID[suggestedByID].ID == "" {
			suggestedByID = participantByUserID[strings.TrimSpace(sessionRecord.GetString("leader"))].ID
		}
		responses = append(responses, tastingRestaurantResponse{
			ID:                       record.Id,
			RestaurantID:             restaurantID,
			RestaurantName:           restaurantName,
			SuggestedByParticipantID: suggestedByID,
			Status:                   strings.TrimSpace(record.GetString("status")),
			Items:                    itemsByRestaurantSuggestionID[record.Id],
			CreatedAt:                record.GetString("created"),
		})
	}
	return responses, nil
}

func validateTastingJoin(app core.App, sessionRecord *core.Record, userID string) error {
	if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusLobby {
		return apis.NewBadRequestError("session is no longer accepting new participants", nil)
	}
	if !isTastingJoinWindowOpen(sessionRecord, time.Now().UTC()) {
		return apis.NewBadRequestError("invite code has expired", nil)
	}
	if blocked, err := isTastingUserBlocked(app, sessionRecord.Id, userID); err != nil {
		return apis.NewApiError(500, "failed to validate tasting access", err)
	} else if blocked {
		return apis.NewForbiddenError("you cannot rejoin this session", nil)
	}
	participants, err := app.FindRecordsByFilter("tasting_session_participants", "session = {:session}", "", 200, 0, dbx.Params{"session": sessionRecord.Id})
	if err != nil {
		return apis.NewApiError(500, "failed to count participants", err)
	}
	if len(participants) >= maxIntRecordValue(sessionRecord, "max_participants", defaultTastingMaxParticipants) {
		return apis.NewBadRequestError("session is full", nil)
	}
	return nil
}

func normalizeTastingJoinDuration(minutes int, allowDefault bool) (int, error) {
	if minutes == 0 && allowDefault {
		return 60, nil
	}
	if minutes != 15 && minutes != 30 && minutes != 60 && minutes != 120 {
		return 0, errors.New("joinDurationMinutes must be 15, 30, 60, or 120")
	}
	return minutes, nil
}

func isTastingJoinWindowOpen(sessionRecord *core.Record, now time.Time) bool {
	expiresAt := sessionRecord.GetDateTime("join_expires_at")
	return !expiresAt.IsZero() && now.UTC().Before(expiresAt.Time())
}

func createTastingParticipant(app core.App, sessionID string, userID string, role string) (*core.Record, error) {
	collection, err := app.FindCollectionByNameOrId("tasting_session_participants")
	if err != nil {
		return nil, apis.NewApiError(500, "internal error", err)
	}
	record := core.NewRecord(collection)
	record.Set("session", sessionID)
	record.Set("user", userID)
	record.Set("role", role)
	if err := app.Save(record); err != nil {
		return nil, apis.NewApiError(500, "failed to join session", err)
	}
	return record, nil
}

func ensureTastingParticipant(app core.App, sessionID string, userID string, role string) (*core.Record, error) {
	existing, err := findTastingParticipantRecord(app, sessionID, userID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return existing, nil
	}
	return createTastingParticipant(app, sessionID, userID, role)
}

func findTastingParticipantRecord(app core.App, sessionID string, userID string) (*core.Record, error) {
	record, err := app.FindFirstRecordByFilter("tasting_session_participants", "session = {:session} && user = {:user}", dbx.Params{"session": strings.TrimSpace(sessionID), "user": strings.TrimSpace(userID)})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return record, nil
}

func findTastingInvite(app core.App, sessionID string, userID string) (*core.Record, error) {
	record, err := app.FindFirstRecordByFilter("tasting_session_invites", "session = {:session} && invited_user = {:user}", dbx.Params{"session": strings.TrimSpace(sessionID), "user": strings.TrimSpace(userID)})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return record, nil
}

func upsertTastingInvites(app core.App, sessionID string, userIDs []string) ([]string, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	collection, err := app.FindCollectionByNameOrId("tasting_session_invites")
	if err != nil {
		return nil, apis.NewApiError(500, "internal error", err)
	}
	seen := map[string]struct{}{}
	notificationUserIDs := []string{}
	for _, rawUserID := range userIDs {
		userID := strings.TrimSpace(rawUserID)
		if userID == "" {
			continue
		}
		if _, ok := seen[userID]; ok {
			continue
		}
		seen[userID] = struct{}{}
		existing, err := findTastingInvite(app, sessionID, userID)
		if err != nil {
			return nil, apis.NewApiError(500, "failed to load tasting invite", err)
		}
		if existing != nil {
			if strings.TrimSpace(existing.GetString("status")) == tastingInviteStatusRevoked {
				continue
			}
			existing.Set("status", tastingInviteStatusPending)
			if err := app.Save(existing); err != nil {
				return nil, apis.NewApiError(500, "failed to update tasting invite", err)
			}
			notificationUserIDs = append(notificationUserIDs, userID)
			continue
		}
		record := core.NewRecord(collection)
		record.Set("session", sessionID)
		record.Set("invited_user", userID)
		record.Set("status", tastingInviteStatusPending)
		if err := app.Save(record); err != nil {
			return nil, apis.NewApiError(500, "failed to create tasting invite", err)
		}
		notificationUserIDs = append(notificationUserIDs, userID)
	}
	return notificationUserIDs, nil
}

func reactivateDismissedTastingInvites(app core.App, sessionID string) error {
	records, err := app.FindRecordsByFilter(
		"tasting_session_invites",
		"session = {:session} && status = {:status}",
		"created",
		200,
		0,
		dbx.Params{"session": strings.TrimSpace(sessionID), "status": tastingInviteStatusDismissed},
	)
	if err != nil {
		return apis.NewApiError(500, "failed to load dismissed tasting invites", err)
	}

	for _, record := range records {
		record.Set("status", tastingInviteStatusPending)
		if err := app.Save(record); err != nil {
			return apis.NewApiError(500, "failed to reactivate tasting invite", err)
		}
	}

	return nil
}

func revokeTastingInvite(app core.App, sessionID string, userID string) error {
	invite, err := findTastingInvite(app, sessionID, userID)
	if err != nil {
		return apis.NewApiError(500, "failed to load invite", err)
	}
	if invite == nil {
		return nil
	}
	invite.Set("status", tastingInviteStatusRevoked)
	if err := app.Save(invite); err != nil {
		return apis.NewApiError(500, "failed to revoke invite", err)
	}
	return nil
}

func createTastingBlock(app core.App, sessionID string, userID string, blockedBy string) error {
	if existing, err := app.FindFirstRecordByFilter("tasting_session_blocks", "session = {:session} && user = {:user}", dbx.Params{"session": sessionID, "user": userID}); err == nil && existing != nil {
		return nil
	} else if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return apis.NewApiError(500, "failed to load tasting block", err)
	}
	collection, err := app.FindCollectionByNameOrId("tasting_session_blocks")
	if err != nil {
		return apis.NewApiError(500, "internal error", err)
	}
	record := core.NewRecord(collection)
	record.Set("session", sessionID)
	record.Set("user", userID)
	record.Set("blocked_by", blockedBy)
	record.Set("reason", "removed_from_lobby")
	if err := app.Save(record); err != nil {
		return apis.NewApiError(500, "failed to block participant", err)
	}
	return nil
}

func deleteTastingSessionDependents(app core.App, sessionID string) error {
	collections := []string{
		"tasting_session_ratings",
		"tasting_session_items",
		"tasting_session_restaurants",
		"tasting_session_blocks",
		"tasting_session_invites",
		"tasting_session_participants",
	}
	for _, collectionName := range collections {
		records, err := app.FindRecordsByFilter(
			collectionName,
			"session = {:session}",
			"",
			5000,
			0,
			dbx.Params{"session": sessionID},
		)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session dependents", err)
		}
		for _, record := range records {
			if err := app.Delete(record); err != nil {
				return apis.NewApiError(500, "failed to delete tasting session dependents", err)
			}
		}
	}
	return nil
}

func isTastingUserBlocked(app core.App, sessionID string, userID string) (bool, error) {
	record, err := app.FindFirstRecordByFilter("tasting_session_blocks", "session = {:session} && user = {:user}", dbx.Params{"session": strings.TrimSpace(sessionID), "user": strings.TrimSpace(userID)})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return record != nil, nil
}

func clearTastingBlock(app core.App, sessionID string, userID string) error {
	record, err := app.FindFirstRecordByFilter("tasting_session_blocks", "session = {:session} && user = {:user}", dbx.Params{"session": strings.TrimSpace(sessionID), "user": strings.TrimSpace(userID)})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return apis.NewApiError(500, "failed to load tasting block", err)
	}
	if err := app.Delete(record); err != nil {
		return apis.NewApiError(500, "failed to clear tasting block", err)
	}
	return nil
}

func loadPlanningLeaderParticipant(app core.App, sessionID string, userID string) (*core.Record, *core.Record, error) {
	sessionRecord, err := loadAccessibleTastingSession(app, sessionID, userID)
	if err != nil {
		return nil, nil, mapTastingLoadError(err)
	}
	if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusPlanning {
		return nil, nil, apis.NewBadRequestError("suggestions are only available during planning", nil)
	}
	if strings.TrimSpace(sessionRecord.GetString("leader")) != strings.TrimSpace(userID) {
		return nil, nil, apis.NewForbiddenError("only the leader can choose tasting restaurants and items", nil)
	}
	participantRecord, err := findTastingParticipantRecord(app, sessionRecord.Id, userID)
	if err != nil {
		return nil, nil, apis.NewApiError(500, "failed to load participant", err)
	}
	if participantRecord == nil {
		return nil, nil, apis.NewForbiddenError("only the leader participant can choose tasting restaurants and items", nil)
	}
	return sessionRecord, participantRecord, nil
}

func setTastingSuggestionStatus(app core.App, leaderUserID string, sessionID string, collectionName string, recordID string, status string) error {
	nextStatus := strings.TrimSpace(status)
	if nextStatus != tastingSuggestionStatusApproved && nextStatus != tastingSuggestionStatusRejected {
		return apis.NewBadRequestError("status must be approved or rejected", nil)
	}
	return app.RunInTransaction(func(txApp core.App) error {
		sessionRecord, err := loadAccessibleTastingSession(txApp, sessionID, leaderUserID)
		if err != nil {
			return mapTastingLoadError(err)
		}
		if strings.TrimSpace(sessionRecord.GetString("leader")) != leaderUserID {
			return apis.NewForbiddenError("only the leader can resolve suggestions", nil)
		}
		if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusPlanning {
			return apis.NewBadRequestError("suggestions can only be resolved during planning", nil)
		}
		record, err := txApp.FindRecordById(collectionName, recordID)
		if err != nil || strings.TrimSpace(record.GetString("session")) != sessionID {
			return apis.NewNotFoundError("suggestion not found", err)
		}
		record.Set("status", nextStatus)
		if err := txApp.Save(record); err != nil {
			return apis.NewApiError(500, "failed to update suggestion", err)
		}
		return nil
	})
}

func resolveTastingMenuItem(app core.App, userID string, restaurantID string, request tastingMenuItemSuggestRequest) (*core.Record, error) {
	if menuItemID := strings.TrimSpace(request.MenuItemID); menuItemID != "" {
		record, err := app.FindRecordById("menu_items", menuItemID)
		if err != nil {
			return nil, apis.NewNotFoundError("menu item not found", err)
		}
		if strings.TrimSpace(record.GetString("restaurant")) != restaurantID {
			return nil, apis.NewBadRequestError("menu item does not belong to this restaurant", nil)
		}
		return record, nil
	}
	name, err := normalizeBoundedString(request.Name, "name", maxTastingItemNameLength)
	if err != nil {
		return nil, apis.NewBadRequestError(err.Error(), nil)
	}
	existing, err := app.FindFirstRecordByFilter("menu_items", "restaurant = {:restaurant} && LOWER(name) = {:name}", dbx.Params{"restaurant": restaurantID, "name": strings.ToLower(name)})
	if err == nil && existing != nil {
		return existing, nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, apis.NewApiError(500, "failed to resolve menu item", err)
	}
	collection, err := app.FindCollectionByNameOrId("menu_items")
	if err != nil {
		return nil, apis.NewApiError(500, "internal error", err)
	}
	record := core.NewRecord(collection)
	record.Set("restaurant", restaurantID)
	record.Set("name", name)
	record.Set("createdBy", userID)
	record.Set("visibility", "friends")
	if err := app.Save(record); err != nil {
		return nil, apis.NewApiError(500, "failed to create menu item", err)
	}
	return record, nil
}

func validateTastingReadyToStart(app core.App, sessionID string) error {
	pendingRestaurants, err := app.FindRecordsByFilter("tasting_session_restaurants", "session = {:session} && status = {:status}", "", 1, 0, dbx.Params{"session": sessionID, "status": tastingSuggestionStatusPending})
	if err != nil {
		return apis.NewApiError(500, "failed to validate restaurants", err)
	}
	if len(pendingRestaurants) > 0 {
		return apis.NewBadRequestError("resolve all restaurant suggestions before starting", nil)
	}
	pendingItems, err := app.FindRecordsByFilter("tasting_session_items", "session = {:session} && status = {:status} && restaurant_suggestion.status != {:rejected}", "", 1, 0, dbx.Params{"session": sessionID, "status": tastingSuggestionStatusPending, "rejected": tastingSuggestionStatusRejected})
	if err != nil {
		return apis.NewApiError(500, "failed to validate items", err)
	}
	if len(pendingItems) > 0 {
		return apis.NewBadRequestError("resolve all item suggestions before starting", nil)
	}
	approvedRestaurants, err := countTastingApprovedRestaurants(app, sessionID)
	if err != nil {
		return err
	}
	if approvedRestaurants == 0 {
		return apis.NewBadRequestError("approve at least one restaurant before starting", nil)
	}
	approvedItems, err := countTastingApprovedItems(app, sessionID)
	if err != nil {
		return err
	}
	if approvedItems == 0 {
		return apis.NewBadRequestError("approve at least one item before starting", nil)
	}
	return nil
}

func submitTastingRatings(app core.App, authRecord *core.Record, sessionID string, request tastingRatingSubmissionRequest) error {
	sessionRecord, err := loadAccessibleTastingSession(app, sessionID, authRecord.Id)
	if err != nil {
		return mapTastingLoadError(err)
	}
	if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusTasting {
		return apis.NewBadRequestError("ratings can only be submitted during tasting", nil)
	}
	participantRecord, err := findTastingParticipantRecord(app, sessionID, authRecord.Id)
	if err != nil {
		return apis.NewApiError(500, "failed to load participant", err)
	}
	if participantRecord == nil {
		return apis.NewForbiddenError("only participants can submit ratings", nil)
	}

	payloadByItemID := map[string]tastingRatingSubmissionItem{}
	restaurantByItemID := map[string]*core.Record{}
	for _, restaurantPayload := range request.Restaurants {
		restaurantSuggestion, err := app.FindRecordById("tasting_session_restaurants", strings.TrimSpace(restaurantPayload.RestaurantSuggestionID))
		if err != nil || strings.TrimSpace(restaurantSuggestion.GetString("session")) != sessionID || strings.TrimSpace(restaurantSuggestion.GetString("status")) != tastingSuggestionStatusApproved {
			return apis.NewBadRequestError("ratings can only be submitted for approved restaurants", err)
		}
		for _, itemPayload := range restaurantPayload.Items {
			if itemPayload.Rating < 1 || itemPayload.Rating > 5 {
				return apis.NewBadRequestError("rating must be between 1 and 5", nil)
			}
			note, noteErr := normalizeOptionalTastingString(itemPayload.Note, "note", maxTastingNoteLength)
			if noteErr != nil {
				return apis.NewBadRequestError(noteErr.Error(), nil)
			}
			itemRecord, itemErr := app.FindRecordById("tasting_session_items", strings.TrimSpace(itemPayload.ItemID))
			if itemErr != nil ||
				strings.TrimSpace(itemRecord.GetString("session")) != sessionID ||
				strings.TrimSpace(itemRecord.GetString("restaurant_suggestion")) != restaurantSuggestion.Id ||
				strings.TrimSpace(itemRecord.GetString("status")) != tastingSuggestionStatusApproved {
				return apis.NewBadRequestError("ratings can only be submitted for approved items", itemErr)
			}
			itemPayload.Note = note
			payloadByItemID[itemRecord.Id] = itemPayload
			restaurantByItemID[itemRecord.Id] = restaurantSuggestion
		}
	}

	existingRatings, err := app.FindRecordsByFilter("tasting_session_ratings", "session = {:session} && user = {:user}", "", 2000, 0, dbx.Params{"session": sessionID, "user": authRecord.Id})
	if err != nil {
		return apis.NewApiError(500, "failed to load existing ratings", err)
	}
	existingByItemID := map[string]*core.Record{}
	for _, ratingRecord := range existingRatings {
		itemID := strings.TrimSpace(ratingRecord.GetString("item"))
		if _, keep := payloadByItemID[itemID]; !keep {
			if generatedItemID := strings.TrimSpace(ratingRecord.GetString("generated_food_item")); generatedItemID != "" {
				if generatedItemRecord, findErr := app.FindRecordById("food_items", generatedItemID); findErr == nil {
					_ = app.Delete(generatedItemRecord)
				}
			}
			if err := app.Delete(ratingRecord); err != nil {
				return apis.NewApiError(500, "failed to remove omitted rating", err)
			}
			continue
		}
		existingByItemID[itemID] = ratingRecord
	}

	visitsByRestaurantID := map[string]*core.Record{}
	ratingsCollection, err := app.FindCollectionByNameOrId("tasting_session_ratings")
	if err != nil {
		return apis.NewApiError(500, "internal error", err)
	}
	for itemID, payload := range payloadByItemID {
		restaurantSuggestion := restaurantByItemID[itemID]
		restaurantID := strings.TrimSpace(restaurantSuggestion.GetString("restaurant"))
		visitRecord, err := resolveGeneratedTastingVisit(app, authRecord.Id, restaurantID, visitsByRestaurantID)
		if err != nil {
			return err
		}
		tastingItemRecord, err := app.FindRecordById("tasting_session_items", itemID)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting item", err)
		}
		menuItemRecord, err := app.FindRecordById("menu_items", strings.TrimSpace(tastingItemRecord.GetString("menu_item")))
		if err != nil {
			return apis.NewApiError(500, "failed to load menu item", err)
		}
		ratingRecord := existingByItemID[itemID]
		generatedFoodItemID := ""
		if ratingRecord != nil {
			generatedFoodItemID = strings.TrimSpace(ratingRecord.GetString("generated_food_item"))
		}
		foodItemRecord, err := upsertGeneratedTastingFoodItem(app, authRecord.Id, visitRecord.Id, generatedFoodItemID, menuItemRecord, payload)
		if err != nil {
			return err
		}
		if ratingRecord == nil {
			ratingRecord = core.NewRecord(ratingsCollection)
			ratingRecord.Set("session", sessionID)
			ratingRecord.Set("restaurant_suggestion", restaurantSuggestion.Id)
			ratingRecord.Set("item", itemID)
			ratingRecord.Set("participant", participantRecord.Id)
			ratingRecord.Set("user", authRecord.Id)
		}
		ratingRecord.Set("rating", payload.Rating)
		ratingRecord.Set("note", emptyStringToNil(payload.Note))
		ratingRecord.Set("generated_visit", visitRecord.Id)
		ratingRecord.Set("generated_food_item", foodItemRecord.Id)
		if err := app.Save(ratingRecord); err != nil {
			return apis.NewApiError(500, "failed to save tasting rating", err)
		}
	}
	participantRecord.Set("submitted_at", time.Now().UTC())
	if err := app.Save(participantRecord); err != nil {
		return apis.NewApiError(500, "failed to mark tasting submission", err)
	}
	return nil
}

func resolveGeneratedTastingVisit(app core.App, userID string, restaurantID string, cache map[string]*core.Record) (*core.Record, error) {
	if cache[restaurantID] != nil {
		return cache[restaurantID], nil
	}
	now := time.Now().UTC()
	visitLocalDate := now.Format("2006-01-02")
	record, err := app.FindFirstRecordByFilter(
		"visits",
		"user = {:user} && restaurant = {:restaurant} && visibility = 'friends' && "+visitLocalDateFieldName+" = {:visitLocalDate}",
		dbx.Params{
			"user":           userID,
			"restaurant":     restaurantID,
			"visitLocalDate": visitLocalDate,
		},
	)
	if err == nil && record != nil {
		cache[restaurantID] = record
		return record, nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, apis.NewApiError(500, "failed to load generated visit", err)
	}
	collection, err := app.FindCollectionByNameOrId("visits")
	if err != nil {
		return nil, apis.NewApiError(500, "internal error", err)
	}
	record = core.NewRecord(collection)
	record.Set("restaurant", restaurantID)
	record.Set("user", userID)
	record.Set("visitDate", now)
	record.Set(visitLocalDateFieldName, visitLocalDate)
	record.Set("visibility", "friends")
	if err := app.Save(record); err != nil {
		return nil, apis.NewApiError(500, "failed to create generated visit", err)
	}
	cache[restaurantID] = record
	return record, nil
}

func upsertGeneratedTastingFoodItem(app core.App, userID string, visitID string, existingFoodItemID string, menuItemRecord *core.Record, payload tastingRatingSubmissionItem) (*core.Record, error) {
	var record *core.Record
	if existingFoodItemID != "" {
		if existing, err := app.FindRecordById("food_items", existingFoodItemID); err == nil {
			record = existing
		}
	}
	if record == nil {
		collection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return nil, apis.NewApiError(500, "internal error", err)
		}
		record = core.NewRecord(collection)
	}
	record.Set("visit", visitID)
	record.Set("user", userID)
	record.Set("itemType", foodItemTypeVisitItem)
	record.Set("name", strings.TrimSpace(menuItemRecord.GetString("name")))
	record.Set("rating", payload.Rating)
	record.Set("notes", emptyStringToNil(payload.Note))
	record.Set("visibility", "friends")
	if err := app.Save(record); err != nil {
		return nil, apis.NewApiError(500, "failed to save generated visit item", err)
	}
	return record, nil
}

func countTastingApprovedRestaurants(app core.App, sessionID string) (int, error) {
	records, err := app.FindRecordsByFilter("tasting_session_restaurants", "session = {:session} && status = {:status}", "", 500, 0, dbx.Params{"session": sessionID, "status": tastingSuggestionStatusApproved})
	if err != nil {
		return 0, apis.NewApiError(500, "failed to count restaurants", err)
	}
	return len(records), nil
}

func countTastingApprovedItems(app core.App, sessionID string) (int, error) {
	records, err := app.FindRecordsByFilter("tasting_session_items", "session = {:session} && status = {:status} && restaurant_suggestion.status = {:restaurantStatus}", "", 500, 0, dbx.Params{"session": sessionID, "status": tastingSuggestionStatusApproved, "restaurantStatus": tastingSuggestionStatusApproved})
	if err != nil {
		return 0, apis.NewApiError(500, "failed to count items", err)
	}
	return len(records), nil
}

func maxIntRecordValue(record *core.Record, field string, fallback int) int {
	value := record.GetInt(field)
	if value <= 0 {
		return fallback
	}
	return value
}

func resolveTastingUserDisplayName(userRecord *core.Record) string {
	if userRecord == nil {
		return "Unknown"
	}
	if name := strings.TrimSpace(userRecord.GetString("name")); name != "" {
		return name
	}
	if email := strings.TrimSpace(userRecord.Email()); email != "" {
		return email
	}
	return "Unknown"
}

func normalizeOptionalTastingString(raw string, fieldName string, maxLength int) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", nil
	}
	if len(value) > maxLength {
		return "", fmt.Errorf("%s must be %d characters or fewer", fieldName, maxLength)
	}
	return value, nil
}

func generateTastingCode() (string, error) {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	code := make([]byte, tastingInviteCodeLength)
	for i := range code {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			return "", fmt.Errorf("failed to generate random code: %w", err)
		}
		code[i] = charset[n.Int64()]
	}
	return string(code), nil
}

func normalizeTastingInviteCode(raw string) (string, error) {
	code := strings.ToUpper(strings.TrimSpace(raw))
	if len(code) != tastingInviteCodeLength {
		return "", errors.New("invite code is invalid")
	}
	for _, char := range code {
		if (char < 'A' || char > 'Z') && (char < '0' || char > '9') {
			return "", errors.New("invite code is invalid")
		}
	}
	return code, nil
}
