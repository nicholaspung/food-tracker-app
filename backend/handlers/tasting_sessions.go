package handlers

import (
	"crypto/rand"
	"fmt"
	"log"
	"math/big"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// RegisterTastingSessionHandlers registers all tasting session related endpoints
func RegisterTastingSessionHandlers(se *core.ServeEvent, app core.App) {
	// POST /api/tasting-sessions/join - Join a tasting session via invite code
	se.Router.POST("/api/tasting-sessions/join", func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		// Parse request body
		data := struct {
			Code string `json:"code"`
		}{}
		if err := e.BindBody(&data); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		if data.Code == "" {
			return apis.NewBadRequestError("code is required", nil)
		}

		// Find the invite code
		invite, err := app.FindFirstRecordByFilter(
			"tasting_session_invites",
			"code = {:code} && used_by = ''",
			map[string]any{"code": data.Code},
		)

		if err != nil || invite == nil {
			return apis.NewNotFoundError("invalid or already used invite code", nil)
		}

		// Check if expired
		expiresAt := invite.GetDateTime("expires_at")
		if !expiresAt.IsZero() && expiresAt.Time().Before(time.Now()) {
			return apis.NewBadRequestError("invite code has expired", nil)
		}

		// Get the session
		sessionId := invite.GetString("session")
		session, err := app.FindRecordById("tasting_sessions", sessionId)
		if err != nil {
			return apis.NewNotFoundError("session not found", nil)
		}

		// Check if session is locked
		if session.GetBool("locked") {
			return apis.NewBadRequestError("session is locked, no new participants allowed", nil)
		}

		// Check if session is still in adding_items phase
		if session.GetString("status") != "adding_items" {
			return apis.NewBadRequestError("session is no longer accepting new participants", nil)
		}

		// Check if user is already a participant
		existing, _ := app.FindFirstRecordByFilter(
			"tasting_session_participants",
			"session = {:session} && user = {:user}",
			map[string]any{"session": sessionId, "user": authRecord.Id},
		)

		if existing != nil {
			return apis.NewBadRequestError("you are already a participant in this session", nil)
		}

		// Create participant record
		participantsCollection, err := app.FindCollectionByNameOrId("tasting_session_participants")
		if err != nil {
			return apis.NewApiError(500, "internal error", err)
		}

		participant := core.NewRecord(participantsCollection)
		participant.Set("session", sessionId)
		participant.Set("user", authRecord.Id)

		if err := app.Save(participant); err != nil {
			return apis.NewApiError(500, "failed to join session", err)
		}

		// Mark invite as used
		invite.Set("used_by", authRecord.Id)
		if err := app.Save(invite); err != nil {
			log.Printf("Warning: Failed to mark invite as used: %v", err)
		}

		// Return session details
		restaurant, _ := app.FindRecordById("restaurants", session.GetString("restaurant"))
		restaurantName := ""
		if restaurant != nil {
			restaurantName = restaurant.GetString("name")
		}

		return e.JSON(200, map[string]any{
			"success":   true,
			"sessionId": sessionId,
			"session": map[string]any{
				"id":             session.Id,
				"name":           session.GetString("name"),
				"status":         session.GetString("status"),
				"restaurantName": restaurantName,
			},
		})
	}).Bind(apis.RequireAuth())

	// POST /api/tasting-sessions/generate-code - Generate a new invite code for a session
	se.Router.POST("/api/tasting-sessions/generate-code", func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		data := struct {
			SessionId string `json:"sessionId"`
		}{}
		if err := e.BindBody(&data); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		if data.SessionId == "" {
			return apis.NewBadRequestError("sessionId is required", nil)
		}

		// Verify user is the leader
		session, err := app.FindRecordById("tasting_sessions", data.SessionId)
		if err != nil {
			return apis.NewNotFoundError("session not found", nil)
		}

		if session.GetString("leader") != authRecord.Id {
			return apis.NewForbiddenError("only the session leader can generate invite codes", nil)
		}

		// Generate 6-char alphanumeric code
		code, err := generateTastingCode()
		if err != nil {
			return apis.NewApiError(500, "failed to generate code", err)
		}

		// Create invite record
		invitesCollection, err := app.FindCollectionByNameOrId("tasting_session_invites")
		if err != nil {
			return apis.NewApiError(500, "internal error", err)
		}

		invite := core.NewRecord(invitesCollection)
		invite.Set("session", data.SessionId)
		invite.Set("code", code)
		invite.Set("created_by", authRecord.Id)
		invite.Set("expires_at", time.Now().Add(24*time.Hour))

		if err := app.Save(invite); err != nil {
			return apis.NewApiError(500, "failed to create invite code", err)
		}

		return e.JSON(200, map[string]any{
			"success":   true,
			"code":      code,
			"expiresAt": invite.GetString("expires_at"),
		})
	}).Bind(apis.RequireAuth())
}

// generateTastingCode creates a random 6-character alphanumeric uppercase code
func generateTastingCode() (string, error) {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	code := make([]byte, 6)
	for i := range code {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			return "", fmt.Errorf("failed to generate random code: %w", err)
		}
		code[i] = charset[n.Int64()]
	}
	return string(code), nil
}
