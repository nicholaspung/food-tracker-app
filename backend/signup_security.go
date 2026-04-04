package main

import (
	"database/sql"
	"errors"
	"fmt"
	"net/netip"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	signupRateLimitMaxAttempts        = 5
	signupRateLimitBaseLockoutSeconds = 15 * 60
	signupRateLimitUnavailableMessage = "signup rate limiting is temporarily unavailable, please try again shortly"
)

var (
	errInviteCodeUnavailable = errors.New("invite code is invalid or already used")
)

type inviteCodeReservation struct {
	Code      string
	CreatedBy string
	RecordID  string
}

func configureTrustedProxyHeaders(app core.App) {
	settings := app.Settings()
	if len(settings.TrustedProxy.Headers) > 0 {
		return
	}

	settings.TrustedProxy.Headers = []string{"X-Forwarded-For", "X-Real-IP"}
	settings.TrustedProxy.UseLeftmostIP = false
}

func resolveSignupClientIP(e *core.RecordRequestEvent) string {
	if e == nil || e.RequestEvent == nil {
		return ""
	}

	candidate := strings.TrimSpace(e.RealIP())
	if candidate == "" {
		return ""
	}

	if parsed, err := netip.ParseAddr(candidate); err == nil {
		return parsed.String()
	}

	return candidate
}

func getOrCreateRateLimitRecord(app core.App, clientIP string) (*core.Record, error) {
	if strings.TrimSpace(clientIP) == "" {
		return nil, errors.New("client IP is required")
	}

	record, err := app.FindFirstRecordByFilter(
		"rate_limits",
		"ip_address = {:ip}",
		map[string]any{"ip": clientIP},
	)
	if err == nil && record != nil {
		return record, nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("could not load rate limit record: %w", err)
	}

	collection, err := app.FindCollectionByNameOrId("rate_limits")
	if err != nil {
		return nil, fmt.Errorf("could not find rate_limits collection: %w", err)
	}

	record = core.NewRecord(collection)
	record.Set("ip_address", clientIP)
	record.Set("attempts", 0)
	record.Set("locked_until", int64(0))

	if err := app.Save(record); err != nil {
		existing, lookupErr := app.FindFirstRecordByFilter(
			"rate_limits",
			"ip_address = {:ip}",
			map[string]any{"ip": clientIP},
		)
		if lookupErr == nil && existing != nil {
			return existing, nil
		}

		return nil, fmt.Errorf("could not create rate limit record: %w", err)
	}

	return record, nil
}

func remainingSignupLockout(record *core.Record, now time.Time) int64 {
	if record == nil {
		return 0
	}

	lockedUntil := int64(record.GetInt("locked_until"))
	if lockedUntil <= now.Unix() {
		return 0
	}

	return lockedUntil - now.Unix()
}

func clearSignupRateLimit(app core.App, record *core.Record) error {
	if record == nil {
		return nil
	}

	record.Set("attempts", 0)
	record.Set("locked_until", int64(0))
	record.Set("last_attempt_at", time.Now().UTC())

	return app.Save(record)
}

func incrementSignupFailure(app core.App, record *core.Record, now time.Time) (lockoutMinutes int64, locked bool, err error) {
	if record == nil {
		return 0, false, errors.New("rate limit record is required")
	}

	attempts := record.GetInt("attempts") + 1
	record.Set("attempts", attempts)
	record.Set("last_attempt_at", now.UTC())

	if attempts >= signupRateLimitMaxAttempts {
		backoffMultiplier := int64(1 << uint(attempts-signupRateLimitMaxAttempts))
		lockoutSeconds := int64(signupRateLimitBaseLockoutSeconds) * backoffMultiplier

		const maxLockoutSeconds = int64(24 * 60 * 60)
		if lockoutSeconds > maxLockoutSeconds {
			lockoutSeconds = maxLockoutSeconds
		}

		record.Set("locked_until", now.Unix()+lockoutSeconds)
		if err := app.Save(record); err != nil {
			return 0, false, err
		}

		return lockoutSeconds / 60, true, nil
	}

	if err := app.Save(record); err != nil {
		return 0, false, err
	}

	return 0, false, nil
}

func reserveInviteCode(app core.App, rawCode string) (*inviteCodeReservation, error) {
	inviteCode := strings.TrimSpace(rawCode)
	if inviteCode == "" {
		return nil, errInviteCodeUnavailable
	}

	var lookup struct {
		Code      string         `db:"code"`
		CreatedBy sql.NullString `db:"createdBy"`
		ID        string         `db:"id"`
	}

	if err := app.DB().NewQuery(`
		SELECT id, code, createdBy
		FROM invite_codes
		WHERE LOWER(code) = LOWER({:code})
		LIMIT 1
	`).
		Bind(dbx.Params{"code": inviteCode}).
		One(&lookup); err != nil {
		return nil, errInviteCodeUnavailable
	}

	result, err := app.DB().NewQuery(`
		UPDATE invite_codes
		SET used = 1
		WHERE id = {:id} AND (used = 0 OR used IS NULL)
	`).
		Bind(dbx.Params{"id": lookup.ID}).
		Execute()
	if err != nil {
		return nil, fmt.Errorf("failed to reserve invite code: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("failed to confirm invite code reservation: %w", err)
	}

	if rowsAffected == 0 {
		return nil, errInviteCodeUnavailable
	}

	return &inviteCodeReservation{
		Code:      lookup.Code,
		CreatedBy: strings.TrimSpace(lookup.CreatedBy.String),
		RecordID:  lookup.ID,
	}, nil
}

func releaseInviteCodeReservation(app core.App, reservation *inviteCodeReservation) error {
	if reservation == nil || reservation.RecordID == "" {
		return nil
	}

	_, err := app.DB().NewQuery(`
		UPDATE invite_codes
		SET used = 0, usedBy = ''
		WHERE id = {:id}
	`).
		Bind(dbx.Params{"id": reservation.RecordID}).
		Execute()

	if err != nil {
		return fmt.Errorf("failed to release invite code reservation: %w", err)
	}

	return nil
}

func finalizeInviteCodeReservation(app core.App, reservation *inviteCodeReservation, userID string) error {
	if reservation == nil || reservation.RecordID == "" {
		return nil
	}

	_, err := app.DB().NewQuery(`
		UPDATE invite_codes
		SET used = 1, usedBy = {:usedBy}
		WHERE id = {:id}
	`).
		Bind(dbx.Params{
			"id":     reservation.RecordID,
			"usedBy": strings.TrimSpace(userID),
		}).
		Execute()
	if err != nil {
		return fmt.Errorf("failed to finalize invite code reservation: %w", err)
	}

	return nil
}
