package main

import (
	"database/sql"
	"errors"
	"fmt"
	"net/netip"
	"os"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"

	"myapp/lib"
)

const (
	signupRateLimitMaxAttempts        = 5
	signupRateLimitBaseLockoutSeconds = 15 * 60
	signupRateLimitUnavailableMessage = "signup rate limiting is temporarily unavailable, please try again shortly"
	trustProxyHeadersEnvKey           = "TRUST_PROXY_HEADERS"
	hostedTrustedProxyReloadHookID    = "foodTrackerHostedTrustedProxy"
	hostedTrustedProxyUpdateHookID    = "foodTrackerHostedTrustedProxyUpdate"
)

var (
	errInviteCodeUnavailable  = errors.New("invite code is invalid or already used")
	hostedTrustedProxyHeaders = []string{"X-Forwarded-For", "X-Real-IP"}
)

type inviteCodeReservation struct {
	Code      string
	CreatedBy string
	RecordID  string
}

func configureTrustedProxyHeaders(app core.App) {
	if app == nil || !trustedProxyHeadersEnabled() {
		return
	}

	configureHostedTrustedProxySettings(app.Settings())
}

func configureHostedTrustedProxySettings(settings *core.Settings) {
	settings.TrustedProxy.Headers = append([]string(nil), hostedTrustedProxyHeaders...)
	settings.TrustedProxy.UseLeftmostIP = false
}

func validateHostedTrustedProxyConfiguration(app core.App, environment lib.RuntimeEnvironment) error {
	if environment == lib.RuntimeEnvironmentLocal {
		return nil
	}

	if !trustedProxyHeadersEnabled() {
		return fmt.Errorf("%s must be enabled in %s", trustProxyHeadersEnvKey, environment)
	}

	if app == nil {
		return errors.New("trusted proxy configuration requires an initialized app")
	}

	settings := app.Settings().TrustedProxy
	if settings.UseLeftmostIP || len(settings.Headers) != len(hostedTrustedProxyHeaders) {
		return errors.New("trusted proxy configuration does not match the hosted Caddy boundary")
	}

	for index, header := range hostedTrustedProxyHeaders {
		if !strings.EqualFold(strings.TrimSpace(settings.Headers[index]), header) {
			return errors.New("trusted proxy configuration does not match the hosted Caddy boundary")
		}
	}

	return nil
}

func registerHostedTrustedProxyEnforcement(app core.App, environment lib.RuntimeEnvironment) error {
	configureTrustedProxyHeaders(app)
	if err := validateHostedTrustedProxyConfiguration(app, environment); err != nil {
		return err
	}

	if environment == lib.RuntimeEnvironmentLocal {
		return nil
	}

	app.OnSettingsUpdateRequest().Bind(&hook.Handler[*core.SettingsUpdateRequestEvent]{
		Id: hostedTrustedProxyUpdateHookID,
		Func: func(e *core.SettingsUpdateRequestEvent) error {
			if e.NewSettings == nil {
				return errors.New("hosted settings update requires new settings")
			}

			configureHostedTrustedProxySettings(e.NewSettings)
			return e.Next()
		},
	})

	app.OnSettingsReload().Bind(&hook.Handler[*core.SettingsReloadEvent]{
		Id: hostedTrustedProxyReloadHookID,
		Func: func(e *core.SettingsReloadEvent) error {
			if err := e.Next(); err != nil {
				return err
			}

			configureTrustedProxyHeaders(e.App)
			return validateHostedTrustedProxyConfiguration(e.App, environment)
		},
	})

	return nil
}

func resolveSignupClientIP(e *core.RecordRequestEvent) string {
	if e == nil || e.RequestEvent == nil {
		return ""
	}

	candidate := strings.TrimSpace(e.RemoteIP())
	if hasTrustedProxyHeadersConfigured(e.App) {
		if realIP := strings.TrimSpace(e.RealIP()); realIP != "" {
			candidate = realIP
		}
	}
	if candidate == "" {
		return ""
	}

	if parsed, err := netip.ParseAddr(candidate); err == nil {
		return parsed.String()
	}

	return candidate
}

func trustedProxyHeadersEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(trustProxyHeadersEnvKey))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func hasTrustedProxyHeadersConfigured(app core.App) bool {
	return app != nil && len(app.Settings().TrustedProxy.Headers) > 0
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
