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

const tastingInviteCodeLength = 6

var (
	errTastingInviteUnavailable = errors.New("tasting invite code is invalid or already used")
	errTastingInviteExpired     = errors.New("tasting invite code has expired")
)

type tastingInviteReservation struct {
	RecordID  string
	SessionID string
}

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

		normalizedCode, err := normalizeTastingInviteCode(data.Code)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		data.Code = normalizedCode

		var responsePayload map[string]any
		err = app.RunInTransaction(func(txApp core.App) error {
			reservation, err := reserveTastingSessionInvite(txApp, data.Code, authRecord.Id, time.Now().UTC())
			if err != nil {
				switch {
				case errors.Is(err, errTastingInviteUnavailable):
					return apis.NewNotFoundError("invalid or already used invite code", nil)
				case errors.Is(err, errTastingInviteExpired):
					return apis.NewBadRequestError("invite code has expired", nil)
				default:
					return apis.NewApiError(500, "failed to validate invite code", err)
				}
			}

			session, err := txApp.FindRecordById("tasting_sessions", reservation.SessionID)
			if err != nil {
				return apis.NewNotFoundError("session not found", nil)
			}

			if session.GetBool("locked") {
				return apis.NewBadRequestError("session is locked, no new participants allowed", nil)
			}

			if session.GetString("status") != "adding_items" {
				return apis.NewBadRequestError("session is no longer accepting new participants", nil)
			}

			existing, err := txApp.FindFirstRecordByFilter(
				"tasting_session_participants",
				"session = {:session} && user = {:user}",
				map[string]any{"session": reservation.SessionID, "user": authRecord.Id},
			)
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				return apis.NewApiError(500, "failed to verify existing session membership", err)
			}
			if existing != nil {
				return apis.NewBadRequestError("you are already a participant in this session", nil)
			}

			participantsCollection, err := txApp.FindCollectionByNameOrId("tasting_session_participants")
			if err != nil {
				return apis.NewApiError(500, "internal error", err)
			}

			participant := core.NewRecord(participantsCollection)
			participant.Set("session", reservation.SessionID)
			participant.Set("user", authRecord.Id)

			if err := txApp.Save(participant); err != nil {
				return apis.NewApiError(500, "failed to join session", err)
			}

			restaurant, _ := txApp.FindRecordById("restaurants", session.GetString("restaurant"))
			restaurantName := ""
			if restaurant != nil {
				restaurantName = restaurant.GetString("name")
			}

			responsePayload = map[string]any{
				"success":   true,
				"sessionId": reservation.SessionID,
				"session": map[string]any{
					"id":             session.Id,
					"name":           session.GetString("name"),
					"status":         session.GetString("status"),
					"restaurantName": restaurantName,
				},
			}

			return nil
		})
		if err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
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
