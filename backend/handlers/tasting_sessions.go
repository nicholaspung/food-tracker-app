package handlers

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	tastingInviteCodeLength             = 6
	maxTastingInviteCodeSaveAttempts    = 16
	maxTastingSessionNameLength         = 200
	maxTastingRestaurantNameLength      = 200
	maxTastingItemDescriptionLength     = 500
	maxTastingItemNameLength            = 300
	tastingSessionStatusAddingItems     = "adding_items"
	tastingSessionStatusRating          = "rating"
	tastingSessionStatusCompleted       = "completed"
	tastingSyntheticLeaderParticipantID = "leader"
)

var (
	errTastingInviteUnavailable = errors.New("tasting invite code is invalid or already used")
	errTastingInviteExpired     = errors.New("tasting invite code has expired")
)

type tastingInviteReservation struct {
	RecordID  string
	SessionID string
}

type tastingSessionCreateRequest struct {
	Name           string `json:"name"`
	RestaurantName string `json:"restaurantName"`
}

type tastingSessionJoinRequest struct {
	Code string `json:"code"`
}

type tastingSessionInviteCodeRequest struct {
	SessionID string `json:"sessionId"`
}

type tastingSessionItemCreateRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type tastingSessionRatingRequest struct {
	Rating float64 `json:"rating"`
	Note   string  `json:"note"`
}

type tastingSessionStatusRequest struct {
	Status string `json:"status"`
}

type tastingSessionParticipantResponse struct {
	ID       string `json:"id"`
	UserID   string `json:"userId,omitempty"`
	Name     string `json:"name"`
	JoinedAt string `json:"joinedAt"`
}

type tastingSessionRatingResponse struct {
	ParticipantID string  `json:"participantId"`
	Rating        float64 `json:"rating"`
	Note          string  `json:"note,omitempty"`
}

type tastingSessionItemResponse struct {
	ID                     string                         `json:"id"`
	Name                   string                         `json:"name"`
	Description            string                         `json:"description,omitempty"`
	CreatedByParticipantID string                         `json:"createdByParticipantId"`
	Ratings                []tastingSessionRatingResponse `json:"ratings"`
	CreatedAt              string                         `json:"createdAt"`
}

type tastingSessionResponse struct {
	ID              string                              `json:"id"`
	Name            string                              `json:"name"`
	RestaurantName  string                              `json:"restaurantName"`
	InviteCode      string                              `json:"inviteCode"`
	CreatedByUserID string                              `json:"createdByUserId"`
	Status          string                              `json:"status"`
	Participants    []tastingSessionParticipantResponse `json:"participants"`
	Items           []tastingSessionItemResponse        `json:"items"`
	CreatedAt       string                              `json:"createdAt"`
	UpdatedAt       string                              `json:"updatedAt"`
}

// RegisterTastingSessionHandlers registers all tasting session related endpoints.
func RegisterTastingSessionHandlers(se *core.ServeEvent, app core.App) {
	se.Router.GET("/api/tasting-sessions", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		sessionRecords, err := listAccessibleTastingSessions(app, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting sessions", err)
		}

		responsePayload := make([]tastingSessionResponse, 0, len(sessionRecords))
		for _, sessionRecord := range sessionRecords {
			responseRecord, responseErr := buildTastingSessionResponse(app, sessionRecord, e.Auth.Id)
			if responseErr != nil {
				return apis.NewApiError(500, "failed to load tasting session", responseErr)
			}
			responsePayload = append(responsePayload, responseRecord)
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.GET("/api/tasting-sessions/{sessionId}", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		if sessionID == "" {
			return apis.NewBadRequestError("sessionId is required", nil)
		}

		sessionRecord, err := loadAccessibleTastingSession(app, sessionID, e.Auth.Id)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return apis.NewNotFoundError("session not found", nil)
			}
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		responsePayload, err := buildTastingSessionResponse(app, sessionRecord, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		requestBody := tastingSessionCreateRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		sessionName, err := normalizeBoundedString(requestBody.Name, "name", maxTastingSessionNameLength)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		restaurantName, err := normalizeBoundedString(
			requestBody.RestaurantName,
			"restaurantName",
			maxTastingRestaurantNameLength,
		)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		sessionID := ""
		if err := app.RunInTransaction(func(txApp core.App) error {
			restaurantRecord, resolveErr := resolveRestaurantForWrite(txApp, e.Auth, restaurantResolveInput{
				RestaurantName: restaurantName,
			})
			if resolveErr != nil {
				return wrapRestaurantResolveError(resolveErr)
			}

			sessionsCollection, findErr := txApp.FindCollectionByNameOrId("tasting_sessions")
			if findErr != nil {
				return apis.NewApiError(500, "internal error", findErr)
			}

			sessionRecord := core.NewRecord(sessionsCollection)
			sessionRecord.Set("name", sessionName)
			sessionRecord.Set("restaurant", restaurantRecord.Id)
			sessionRecord.Set("leader", e.Auth.Id)
			sessionRecord.Set("status", tastingSessionStatusAddingItems)
			sessionRecord.Set("locked", false)
			if saveErr := txApp.Save(sessionRecord); saveErr != nil {
				return apis.NewApiError(500, "failed to create tasting session", saveErr)
			}

			if _, participantErr := createTastingSessionParticipant(txApp, sessionRecord.Id, e.Auth.Id); participantErr != nil {
				return participantErr
			}

			if _, inviteErr := createOrReplaceTastingSessionInvite(txApp, sessionRecord, e.Auth.Id); inviteErr != nil {
				return inviteErr
			}

			sessionID = sessionRecord.Id
			return nil
		}); err != nil {
			return err
		}

		sessionRecord, err := loadAccessibleTastingSession(app, sessionID, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		responsePayload, err := buildTastingSessionResponse(app, sessionRecord, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	// POST /api/tasting-sessions/join - Join a tasting session via invite code.
	se.Router.POST("/api/tasting-sessions/join", func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		requestBody := tastingSessionJoinRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		normalizedCode, err := normalizeTastingInviteCode(requestBody.Code)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		sessionID := ""
		err = app.RunInTransaction(func(txApp core.App) error {
			reservation, reserveErr := reserveTastingSessionInvite(txApp, normalizedCode, authRecord.Id, time.Now().UTC())
			if reserveErr != nil {
				switch {
				case errors.Is(reserveErr, errTastingInviteUnavailable):
					return apis.NewNotFoundError("invalid or already used invite code", nil)
				case errors.Is(reserveErr, errTastingInviteExpired):
					return apis.NewBadRequestError("invite code has expired", nil)
				default:
					return apis.NewApiError(500, "failed to validate invite code", reserveErr)
				}
			}

			sessionRecord, findErr := txApp.FindRecordById("tasting_sessions", reservation.SessionID)
			if findErr != nil {
				return apis.NewNotFoundError("session not found", nil)
			}

			if sessionRecord.GetBool("locked") {
				return apis.NewBadRequestError("session is locked, no new participants allowed", nil)
			}

			if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusAddingItems {
				return apis.NewBadRequestError("session is no longer accepting new participants", nil)
			}

			existingParticipant, participantErr := findTastingParticipantRecord(txApp, reservation.SessionID, authRecord.Id)
			if participantErr != nil {
				return apis.NewApiError(500, "failed to verify existing session membership", participantErr)
			}
			if existingParticipant != nil {
				sessionID = reservation.SessionID
				return nil
			}

			if _, createErr := createTastingSessionParticipant(txApp, reservation.SessionID, authRecord.Id); createErr != nil {
				return createErr
			}

			sessionID = reservation.SessionID
			return nil
		})
		if err != nil {
			return err
		}

		sessionRecord, err := loadAccessibleTastingSession(app, sessionID, authRecord.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		responsePayload, err := buildTastingSessionResponse(app, sessionRecord, authRecord.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	// Legacy custom API preserved for compatibility.
	se.Router.POST("/api/tasting-sessions/generate-code", func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		requestBody := tastingSessionInviteCodeRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		sessionID := strings.TrimSpace(requestBody.SessionID)
		if sessionID == "" {
			return apis.NewBadRequestError("sessionId is required", nil)
		}

		sessionRecord, err := loadAccessibleTastingSession(app, sessionID, authRecord.Id)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return apis.NewNotFoundError("session not found", nil)
			}
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		if strings.TrimSpace(sessionRecord.GetString("leader")) != authRecord.Id {
			return apis.NewForbiddenError("only the session leader can generate invite codes", nil)
		}
		if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusAddingItems {
			return apis.NewBadRequestError("invite codes are only available while adding items", nil)
		}

		inviteRecord, err := createOrReplaceTastingSessionInvite(app, sessionRecord, authRecord.Id)
		if err != nil {
			return err
		}

		return e.JSON(200, map[string]any{
			"success":   true,
			"code":      inviteRecord.GetString("code"),
			"expiresAt": inviteRecord.GetString("expires_at"),
		})
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/{sessionId}/invite-code", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		if sessionID == "" {
			return apis.NewBadRequestError("sessionId is required", nil)
		}

		sessionRecord, err := loadAccessibleTastingSession(app, sessionID, e.Auth.Id)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return apis.NewNotFoundError("session not found", nil)
			}
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		if strings.TrimSpace(sessionRecord.GetString("leader")) != e.Auth.Id {
			return apis.NewForbiddenError("only the session leader can generate invite codes", nil)
		}
		if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusAddingItems {
			return apis.NewBadRequestError("invite codes are only available while adding items", nil)
		}

		if _, err := createOrReplaceTastingSessionInvite(app, sessionRecord, e.Auth.Id); err != nil {
			return err
		}

		sessionRecord, err = loadAccessibleTastingSession(app, sessionID, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		responsePayload, err := buildTastingSessionResponse(app, sessionRecord, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/tasting-sessions/{sessionId}/items", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		if sessionID == "" {
			return apis.NewBadRequestError("sessionId is required", nil)
		}

		requestBody := tastingSessionItemCreateRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		itemName, err := normalizeBoundedString(requestBody.Name, "name", maxTastingItemNameLength)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		description, err := normalizeOptionalTastingString(
			requestBody.Description,
			"description",
			maxTastingItemDescriptionLength,
		)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		if err := app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, loadErr := loadAccessibleTastingSession(txApp, sessionID, e.Auth.Id)
			if loadErr != nil {
				if errors.Is(loadErr, sql.ErrNoRows) {
					return apis.NewNotFoundError("session not found", nil)
				}
				return apis.NewApiError(500, "failed to load tasting session", loadErr)
			}

			if !isTastingSessionMember(txApp, sessionRecord, e.Auth.Id) {
				return apis.NewForbiddenError("only participants can add items", nil)
			}
			if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusAddingItems {
				return apis.NewBadRequestError("items can only be added while the session is collecting items", nil)
			}

			itemsCollection, findErr := txApp.FindCollectionByNameOrId("tasting_session_items")
			if findErr != nil {
				return apis.NewApiError(500, "internal error", findErr)
			}

			itemRecord := core.NewRecord(itemsCollection)
			itemRecord.Set("session", sessionRecord.Id)
			itemRecord.Set("name", itemName)
			itemRecord.Set("description", emptyStringToNil(description))
			itemRecord.Set("added_by", e.Auth.Id)
			if saveErr := txApp.Save(itemRecord); saveErr != nil {
				return apis.NewApiError(500, "failed to add tasting item", saveErr)
			}

			return nil
		}); err != nil {
			return err
		}

		sessionRecord, err := loadAccessibleTastingSession(app, sessionID, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		responsePayload, err := buildTastingSessionResponse(app, sessionRecord, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.DELETE("/api/tasting-sessions/{sessionId}/items/{itemId}", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		itemID := strings.TrimSpace(e.Request.PathValue("itemId"))
		if sessionID == "" || itemID == "" {
			return apis.NewBadRequestError("sessionId and itemId are required", nil)
		}

		if err := app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, loadErr := loadAccessibleTastingSession(txApp, sessionID, e.Auth.Id)
			if loadErr != nil {
				if errors.Is(loadErr, sql.ErrNoRows) {
					return apis.NewNotFoundError("session not found", nil)
				}
				return apis.NewApiError(500, "failed to load tasting session", loadErr)
			}

			if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusAddingItems {
				return apis.NewBadRequestError("items can only be deleted while the session is collecting items", nil)
			}

			itemRecord, itemErr := findTastingItemRecord(txApp, sessionID, itemID)
			if itemErr != nil {
				if errors.Is(itemErr, sql.ErrNoRows) {
					return apis.NewNotFoundError("item not found", nil)
				}
				return apis.NewApiError(500, "failed to load tasting item", itemErr)
			}

			isLeader := strings.TrimSpace(sessionRecord.GetString("leader")) == e.Auth.Id
			isOwner := strings.TrimSpace(itemRecord.GetString("added_by")) == e.Auth.Id
			if !isLeader && !isOwner {
				return apis.NewForbiddenError("only the leader or item creator can delete this item", nil)
			}

			if deleteErr := txApp.Delete(itemRecord); deleteErr != nil {
				return apis.NewApiError(500, "failed to delete tasting item", deleteErr)
			}

			return nil
		}); err != nil {
			return err
		}

		sessionRecord, err := loadAccessibleTastingSession(app, sessionID, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		responsePayload, err := buildTastingSessionResponse(app, sessionRecord, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.PUT("/api/tasting-sessions/{sessionId}/items/{itemId}/rating", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		itemID := strings.TrimSpace(e.Request.PathValue("itemId"))
		if sessionID == "" || itemID == "" {
			return apis.NewBadRequestError("sessionId and itemId are required", nil)
		}

		requestBody := tastingSessionRatingRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		note, err := normalizeOptionalTastingString(requestBody.Note, "note", maxTastingItemDescriptionLength)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		if requestBody.Rating < 1 || requestBody.Rating > 5 {
			return apis.NewBadRequestError("rating must be between 1 and 5", nil)
		}

		if err := app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, loadErr := loadAccessibleTastingSession(txApp, sessionID, e.Auth.Id)
			if loadErr != nil {
				if errors.Is(loadErr, sql.ErrNoRows) {
					return apis.NewNotFoundError("session not found", nil)
				}
				return apis.NewApiError(500, "failed to load tasting session", loadErr)
			}

			if !isTastingSessionMember(txApp, sessionRecord, e.Auth.Id) {
				return apis.NewForbiddenError("only participants can rate items", nil)
			}
			if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusRating {
				return apis.NewBadRequestError("ratings can only be submitted while the session is in rating", nil)
			}

			if _, itemErr := findTastingItemRecord(txApp, sessionID, itemID); itemErr != nil {
				if errors.Is(itemErr, sql.ErrNoRows) {
					return apis.NewNotFoundError("item not found", nil)
				}
				return apis.NewApiError(500, "failed to load tasting item", itemErr)
			}

			existingRating, findErr := findTastingRatingRecord(txApp, sessionID, itemID, e.Auth.Id)
			if findErr != nil {
				return apis.NewApiError(500, "failed to load tasting rating", findErr)
			}

			if existingRating != nil {
				existingRating.Set("rating", requestBody.Rating)
				existingRating.Set("notes", emptyStringToNil(note))
				if saveErr := txApp.Save(existingRating); saveErr != nil {
					return apis.NewApiError(500, "failed to update tasting rating", saveErr)
				}
				return nil
			}

			ratingsCollection, collectionErr := txApp.FindCollectionByNameOrId("tasting_session_ratings")
			if collectionErr != nil {
				return apis.NewApiError(500, "internal error", collectionErr)
			}

			ratingRecord := core.NewRecord(ratingsCollection)
			ratingRecord.Set("session", sessionID)
			ratingRecord.Set("item", itemID)
			ratingRecord.Set("user", e.Auth.Id)
			ratingRecord.Set("rating", requestBody.Rating)
			ratingRecord.Set("notes", emptyStringToNil(note))
			if saveErr := txApp.Save(ratingRecord); saveErr != nil {
				return apis.NewApiError(500, "failed to create tasting rating", saveErr)
			}

			return nil
		}); err != nil {
			return err
		}

		sessionRecord, err := loadAccessibleTastingSession(app, sessionID, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		responsePayload, err := buildTastingSessionResponse(app, sessionRecord, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.PATCH("/api/tasting-sessions/{sessionId}/status", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		sessionID := strings.TrimSpace(e.Request.PathValue("sessionId"))
		if sessionID == "" {
			return apis.NewBadRequestError("sessionId is required", nil)
		}

		requestBody := tastingSessionStatusRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		nextStatus := strings.TrimSpace(requestBody.Status)
		if nextStatus != tastingSessionStatusRating && nextStatus != tastingSessionStatusCompleted {
			return apis.NewBadRequestError("status must be rating or completed", nil)
		}

		if err := app.RunInTransaction(func(txApp core.App) error {
			sessionRecord, loadErr := loadAccessibleTastingSession(txApp, sessionID, e.Auth.Id)
			if loadErr != nil {
				if errors.Is(loadErr, sql.ErrNoRows) {
					return apis.NewNotFoundError("session not found", nil)
				}
				return apis.NewApiError(500, "failed to load tasting session", loadErr)
			}

			if strings.TrimSpace(sessionRecord.GetString("leader")) != e.Auth.Id {
				return apis.NewForbiddenError("only the session leader can update status", nil)
			}

			currentStatus := strings.TrimSpace(sessionRecord.GetString("status"))
			if err := validateTastingStatusTransition(txApp, sessionRecord, currentStatus, nextStatus); err != nil {
				return err
			}

			sessionRecord.Set("status", nextStatus)
			sessionRecord.Set("locked", nextStatus != tastingSessionStatusAddingItems)
			if saveErr := txApp.Save(sessionRecord); saveErr != nil {
				return apis.NewApiError(500, "failed to update tasting session status", saveErr)
			}

			return nil
		}); err != nil {
			return err
		}

		sessionRecord, err := loadAccessibleTastingSession(app, sessionID, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		responsePayload, err := buildTastingSessionResponse(app, sessionRecord, e.Auth.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load tasting session", err)
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())
}

func validateTastingStatusTransition(
	app core.App,
	sessionRecord *core.Record,
	currentStatus string,
	nextStatus string,
) error {
	switch currentStatus {
	case tastingSessionStatusAddingItems:
		if nextStatus != tastingSessionStatusRating {
			return apis.NewBadRequestError("adding_items sessions can only transition to rating", nil)
		}

		itemRecords, err := app.FindRecordsByFilter(
			"tasting_session_items",
			"session = {:session}",
			"",
			1,
			0,
			dbx.Params{"session": sessionRecord.Id},
		)
		if err != nil {
			return apis.NewApiError(500, "failed to validate tasting items", err)
		}
		if len(itemRecords) == 0 {
			return apis.NewBadRequestError("add at least one item before starting rating", nil)
		}
		return nil
	case tastingSessionStatusRating:
		if nextStatus != tastingSessionStatusCompleted {
			return apis.NewBadRequestError("rating sessions can only transition to completed", nil)
		}
		return nil
	case tastingSessionStatusCompleted:
		return apis.NewBadRequestError("completed sessions cannot change status", nil)
	default:
		return apis.NewBadRequestError("session status is invalid", nil)
	}
}

func listAccessibleTastingSessions(app core.App, userID string) ([]*core.Record, error) {
	return app.FindRecordsByFilter(
		"tasting_sessions",
		"leader = {:user} || tasting_session_participants_via_session.user ?= {:user}",
		"-updated,-created",
		200,
		0,
		dbx.Params{"user": strings.TrimSpace(userID)},
	)
}

func loadAccessibleTastingSession(app core.App, sessionID string, userID string) (*core.Record, error) {
	sessionRecord, err := app.FindRecordById("tasting_sessions", strings.TrimSpace(sessionID))
	if err != nil {
		return nil, err
	}

	if strings.TrimSpace(sessionRecord.GetString("leader")) == strings.TrimSpace(userID) {
		return sessionRecord, nil
	}

	participantRecord, err := findTastingParticipantRecord(app, sessionRecord.Id, userID)
	if err != nil {
		return nil, err
	}
	if participantRecord == nil {
		return nil, sql.ErrNoRows
	}

	return sessionRecord, nil
}

func buildTastingSessionResponse(
	app core.App,
	sessionRecord *core.Record,
	viewerUserID string,
) (tastingSessionResponse, error) {
	leaderUserID := strings.TrimSpace(sessionRecord.GetString("leader"))

	var restaurantName string
	if restaurantID := strings.TrimSpace(sessionRecord.GetString("restaurant")); restaurantID != "" {
		restaurantRecord, err := app.FindRecordById("restaurants", restaurantID)
		if err == nil && restaurantRecord != nil {
			restaurantName = strings.TrimSpace(restaurantRecord.GetString("name"))
		}
	}

	participantRecords, err := app.FindRecordsByFilter(
		"tasting_session_participants",
		"session = {:session}",
		"created",
		200,
		0,
		dbx.Params{"session": sessionRecord.Id},
	)
	if err != nil {
		return tastingSessionResponse{}, err
	}

	userIDs := make([]string, 0, len(participantRecords)+1)
	userIDs = append(userIDs, leaderUserID)
	for _, participantRecord := range participantRecords {
		userIDs = append(userIDs, participantRecord.GetString("user"))
	}

	userRecords, err := findRecordsByRelationValues(app, "users", "id", userIDs, "")
	if err != nil {
		return tastingSessionResponse{}, err
	}
	userRecordsByID := mapRecordsByID(userRecords)

	participantByUserID := map[string]tastingSessionParticipantResponse{}
	participantOrder := make([]string, 0, len(participantRecords))
	for _, participantRecord := range participantRecords {
		userID := strings.TrimSpace(participantRecord.GetString("user"))
		if userID == "" {
			continue
		}

		participantByUserID[userID] = tastingSessionParticipantResponse{
			ID:       participantRecord.Id,
			UserID:   userID,
			Name:     resolveTastingUserDisplayName(userRecordsByID[userID]),
			JoinedAt: participantRecord.GetString("created"),
		}
		participantOrder = append(participantOrder, userID)
	}

	if leaderUserID != "" {
		if _, ok := participantByUserID[leaderUserID]; !ok {
			participantByUserID[leaderUserID] = tastingSessionParticipantResponse{
				ID:       fmt.Sprintf("%s_%s", tastingSyntheticLeaderParticipantID, leaderUserID),
				UserID:   leaderUserID,
				Name:     resolveTastingUserDisplayName(userRecordsByID[leaderUserID]),
				JoinedAt: sessionRecord.GetString("created"),
			}
		}
	}

	participants := make([]tastingSessionParticipantResponse, 0, len(participantByUserID))
	if leaderUserID != "" {
		participants = append(participants, participantByUserID[leaderUserID])
	}
	for _, userID := range participantOrder {
		if userID == "" || userID == leaderUserID {
			continue
		}
		if participant, ok := participantByUserID[userID]; ok {
			participants = append(participants, participant)
		}
	}

	itemRecords, err := app.FindRecordsByFilter(
		"tasting_session_items",
		"session = {:session}",
		"created",
		500,
		0,
		dbx.Params{"session": sessionRecord.Id},
	)
	if err != nil {
		return tastingSessionResponse{}, err
	}

	ratingFilter := "session = {:session}"
	ratingParams := dbx.Params{"session": sessionRecord.Id}
	if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusCompleted {
		ratingFilter += " && user = {:user}"
		ratingParams["user"] = strings.TrimSpace(viewerUserID)
	}

	ratingRecords, err := app.FindRecordsByFilter(
		"tasting_session_ratings",
		ratingFilter,
		"created",
		2000,
		0,
		ratingParams,
	)
	if err != nil {
		return tastingSessionResponse{}, err
	}

	ratingsByItemID := groupRecordsByField(ratingRecords, "item")

	items := make([]tastingSessionItemResponse, 0, len(itemRecords))
	for _, itemRecord := range itemRecords {
		itemRatings := make([]tastingSessionRatingResponse, 0, len(ratingsByItemID[itemRecord.Id]))
		for _, ratingRecord := range ratingsByItemID[itemRecord.Id] {
			ratingUserID := strings.TrimSpace(ratingRecord.GetString("user"))
			participant, ok := participantByUserID[ratingUserID]
			if !ok {
				continue
			}

			itemRatings = append(itemRatings, tastingSessionRatingResponse{
				ParticipantID: participant.ID,
				Rating:        ratingRecord.GetFloat("rating"),
				Note:          strings.TrimSpace(ratingRecord.GetString("notes")),
			})
		}

		creatorUserID := strings.TrimSpace(itemRecord.GetString("added_by"))
		creatorParticipantID := ""
		if participant, ok := participantByUserID[creatorUserID]; ok {
			creatorParticipantID = participant.ID
		}

		items = append(items, tastingSessionItemResponse{
			ID:                     itemRecord.Id,
			Name:                   strings.TrimSpace(itemRecord.GetString("name")),
			Description:            strings.TrimSpace(itemRecord.GetString("description")),
			CreatedByParticipantID: creatorParticipantID,
			Ratings:                itemRatings,
			CreatedAt:              itemRecord.GetString("created"),
		})
	}

	inviteCode, err := resolveVisibleTastingInviteCode(app, sessionRecord, viewerUserID)
	if err != nil {
		return tastingSessionResponse{}, err
	}

	return tastingSessionResponse{
		ID:              sessionRecord.Id,
		Name:            strings.TrimSpace(sessionRecord.GetString("name")),
		RestaurantName:  restaurantName,
		InviteCode:      inviteCode,
		CreatedByUserID: leaderUserID,
		Status:          strings.TrimSpace(sessionRecord.GetString("status")),
		Participants:    participants,
		Items:           items,
		CreatedAt:       sessionRecord.GetString("created"),
		UpdatedAt:       sessionRecord.GetString("updated"),
	}, nil
}

func resolveVisibleTastingInviteCode(app core.App, sessionRecord *core.Record, viewerUserID string) (string, error) {
	if sessionRecord == nil {
		return "", nil
	}

	if strings.TrimSpace(sessionRecord.GetString("leader")) != strings.TrimSpace(viewerUserID) {
		return "", nil
	}

	if strings.TrimSpace(sessionRecord.GetString("status")) != tastingSessionStatusAddingItems || sessionRecord.GetBool("locked") {
		return "", nil
	}

	inviteRecords, err := app.FindRecordsByFilter(
		"tasting_session_invites",
		"session = {:session}",
		"-created",
		50,
		0,
		dbx.Params{"session": sessionRecord.Id},
	)
	if err != nil {
		return "", err
	}

	now := time.Now().UTC()
	for _, inviteRecord := range inviteRecords {
		if strings.TrimSpace(inviteRecord.GetString("used_by")) != "" {
			continue
		}

		expiresAt := inviteRecord.GetDateTime("expires_at")
		if !expiresAt.IsZero() && expiresAt.Time().Before(now) {
			continue
		}

		return strings.TrimSpace(inviteRecord.GetString("code")), nil
	}

	return "", nil
}

func createOrReplaceTastingSessionInvite(
	app core.App,
	sessionRecord *core.Record,
	createdByUserID string,
) (*core.Record, error) {
	if sessionRecord == nil {
		return nil, apis.NewBadRequestError("session is required", nil)
	}

	inviteRecords, err := app.FindRecordsByFilter(
		"tasting_session_invites",
		"session = {:session}",
		"",
		200,
		0,
		dbx.Params{"session": sessionRecord.Id},
	)
	if err != nil {
		return nil, apis.NewApiError(500, "failed to load tasting invites", err)
	}

	for _, inviteRecord := range inviteRecords {
		if strings.TrimSpace(inviteRecord.GetString("used_by")) != "" {
			continue
		}
		if deleteErr := app.Delete(inviteRecord); deleteErr != nil {
			return nil, apis.NewApiError(500, "failed to replace invite code", deleteErr)
		}
	}

	invitesCollection, err := app.FindCollectionByNameOrId("tasting_session_invites")
	if err != nil {
		return nil, apis.NewApiError(500, "internal error", err)
	}

	inviteRecord, err := saveRecordWithUniqueCodeRetries(
		app,
		invitesCollection,
		maxTastingInviteCodeSaveAttempts,
		generateTastingCode,
		func(record *core.Record, code string) {
			record.Set("session", sessionRecord.Id)
			record.Set("code", code)
			record.Set("created_by", createdByUserID)
			record.Set("expires_at", time.Now().UTC().Add(24*time.Hour))
		},
	)
	if err != nil {
		return nil, apis.NewApiError(500, "failed to create invite code", err)
	}

	return inviteRecord, nil
}

func createTastingSessionParticipant(app core.App, sessionID string, userID string) (*core.Record, error) {
	participantsCollection, err := app.FindCollectionByNameOrId("tasting_session_participants")
	if err != nil {
		return nil, apis.NewApiError(500, "internal error", err)
	}

	participantRecord := core.NewRecord(participantsCollection)
	participantRecord.Set("session", sessionID)
	participantRecord.Set("user", userID)
	if err := app.Save(participantRecord); err != nil {
		return nil, apis.NewApiError(500, "failed to join session", err)
	}

	return participantRecord, nil
}

func isTastingSessionMember(app core.App, sessionRecord *core.Record, userID string) bool {
	if sessionRecord == nil {
		return false
	}

	if strings.TrimSpace(sessionRecord.GetString("leader")) == strings.TrimSpace(userID) {
		return true
	}

	participantRecord, err := findTastingParticipantRecord(app, sessionRecord.Id, userID)
	return err == nil && participantRecord != nil
}

func findTastingParticipantRecord(app core.App, sessionID string, userID string) (*core.Record, error) {
	participantRecord, err := app.FindFirstRecordByFilter(
		"tasting_session_participants",
		"session = {:session} && user = {:user}",
		dbx.Params{
			"session": strings.TrimSpace(sessionID),
			"user":    strings.TrimSpace(userID),
		},
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return participantRecord, nil
}

func findTastingItemRecord(app core.App, sessionID string, itemID string) (*core.Record, error) {
	itemRecord, err := app.FindRecordById("tasting_session_items", strings.TrimSpace(itemID))
	if err != nil {
		return nil, err
	}

	if strings.TrimSpace(itemRecord.GetString("session")) != strings.TrimSpace(sessionID) {
		return nil, sql.ErrNoRows
	}

	return itemRecord, nil
}

func findTastingRatingRecord(app core.App, sessionID string, itemID string, userID string) (*core.Record, error) {
	ratingRecord, err := app.FindFirstRecordByFilter(
		"tasting_session_ratings",
		"session = {:session} && item = {:item} && user = {:user}",
		dbx.Params{
			"item":    strings.TrimSpace(itemID),
			"session": strings.TrimSpace(sessionID),
			"user":    strings.TrimSpace(userID),
		},
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return ratingRecord, nil
}

func resolveTastingUserDisplayName(userRecord *core.Record) string {
	if userRecord == nil {
		return "Unknown Participant"
	}

	name := strings.TrimSpace(userRecord.GetString("name"))
	if name != "" {
		return name
	}

	email := strings.TrimSpace(userRecord.Email())
	if email != "" {
		return email
	}

	return "Unknown Participant"
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

// generateTastingCode creates a random 6-character alphanumeric uppercase code.
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
	if code == "" {
		return "", errors.New("code is required")
	}
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

func reserveTastingSessionInvite(app core.App, code string, userID string, now time.Time) (*tastingInviteReservation, error) {
	invite, err := app.FindFirstRecordByFilter(
		"tasting_session_invites",
		"code = {:code}",
		map[string]any{"code": code},
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errTastingInviteUnavailable
		}
		return nil, err
	}
	if invite == nil {
		return nil, errTastingInviteUnavailable
	}

	expiresAt := invite.GetDateTime("expires_at")
	if !expiresAt.IsZero() && expiresAt.Time().Before(now) {
		return nil, errTastingInviteExpired
	}

	result, err := app.DB().NewQuery(`
		UPDATE tasting_session_invites
		SET used_by = {:usedBy}
		WHERE id = {:id} AND (used_by = '' OR used_by IS NULL)
	`).
		Bind(dbx.Params{
			"id":     invite.Id,
			"usedBy": strings.TrimSpace(userID),
		}).
		Execute()
	if err != nil {
		return nil, fmt.Errorf("failed to reserve tasting invite code: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("failed to confirm tasting invite reservation: %w", err)
	}
	if rowsAffected == 0 {
		return nil, errTastingInviteUnavailable
	}

	return &tastingInviteReservation{
		RecordID:  invite.Id,
		SessionID: invite.GetString("session"),
	}, nil
}
