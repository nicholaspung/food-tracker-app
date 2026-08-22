package handlers

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	tastingInviteNotificationSignalType = "tasting_invite"
	billOwedNotificationSignalType      = "bill_owed"
	billPaymentReminderSignalType       = "bill_payment_reminder"
	monthlyFriendsActivitySignalType    = "monthly_friends_activity"

	notificationDeliverySentRetentionDays   = 30
	notificationDeliveryFailedRetentionDays = 14
	notificationDeviceStaleAfterDays        = 90
	notificationReceiptPendingDelay         = 15 * time.Minute

	expoPushAccessTokenEnvKey = "EXPO_PUSH_ACCESS_TOKEN"
	expoPushSendEndpoint      = "https://exp.host/--/api/v2/push/send"
	expoPushReceiptsEndpoint  = "https://exp.host/--/api/v2/push/getReceipts"
)

var (
	expoPushTokenPattern                     = regexp.MustCompile(`(?:ExponentPushToken|ExpoPushToken)\[[^\]]+\]`)
	notificationDeviceRevocationValuePattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

type remoteNotificationPreferenceCategory string

const (
	remoteNotificationPreferenceTastingInvites         remoteNotificationPreferenceCategory = "tasting_invites"
	remoteNotificationPreferenceBills                  remoteNotificationPreferenceCategory = "bills"
	remoteNotificationPreferenceMonthlyFriendsActivity remoteNotificationPreferenceCategory = "monthly_friends_activity"
)

type notificationDeviceRegistrationRequest struct {
	DeviceID             string `json:"deviceId"`
	Platform             string `json:"platform"`
	PushToken            string `json:"pushToken"`
	RevocationCapability string `json:"revocationCapability"`
	RevocationID         string `json:"revocationId"`
}

type notificationDeviceRevocationRequest struct {
	RevocationCapability string `json:"revocationCapability"`
	RevocationID         string `json:"revocationId"`
}

type notificationPreferencesRequest struct {
	TastingInvitesEnabled         bool `json:"tastingInvitesEnabled"`
	BillOwedEnabled               bool `json:"billOwedEnabled"`
	MonthlyFriendsActivityEnabled bool `json:"monthlyFriendsActivityEnabled"`
}

type notificationPreferencesResponse struct {
	TastingInvitesEnabled         bool `json:"tastingInvitesEnabled"`
	BillOwedEnabled               bool `json:"billOwedEnabled"`
	MonthlyFriendsActivityEnabled bool `json:"monthlyFriendsActivityEnabled"`
}

type monthlyFriendsActivityTestRequest struct {
	Force  bool   `json:"force"`
	Month  string `json:"month"`
	UserID string `json:"userId"`
}

type billOwedNotificationTestRequest struct {
	ActorUserID string   `json:"actorUserId"`
	BillID      string   `json:"billId"`
	UserIDs     []string `json:"userIds"`
}

type tastingInviteNotificationTestRequest struct {
	ActorUserID string `json:"actorUserId"`
	SessionID   string `json:"sessionId"`
	UserID      string `json:"userId"`
}

type adminNotificationTestRecipientResult struct {
	Status string `json:"status"`
	UserID string `json:"userId"`
}

type RemoteDeviceNotificationPayload struct {
	Title string         `json:"title"`
	Body  string         `json:"body"`
	Data  map[string]any `json:"data"`
}

type remoteNotificationSignalPayloadInput struct {
	SignalType string
	SessionID  string
	BillID     string
	Period     string
}

type NotificationPushSender interface {
	SendRemoteDeviceNotification(token string, payload RemoteDeviceNotificationPayload) (string, error)
}

type NotificationPushReceiptChecker interface {
	CheckRemoteDeviceNotificationReceipts(receiptIDs []string) (map[string]RemoteDeviceNotificationReceipt, error)
}

type RemoteDeviceNotificationReceipt struct {
	Status    string
	ErrorCode string
}

type billNotificationParticipantSignal struct {
	UserID     string
	AmountOwed float64
	PaidStatus string
}

type billOwedNotificationSignalInput struct {
	BillID               string
	BillTitle            string
	ActorUserID          string
	IdempotencyKey       string
	PreviousParticipants []billNotificationParticipantSignal
	NextParticipants     []billNotificationParticipantSignal
}

type billPaymentReminderInput struct {
	BillID        string
	BillTitle     string
	ParticipantID string
	ActorUserID   string
	RecipientID   string
}

type billPaymentReminderResult struct {
	Status string
}

type billPaymentReminderAvailability struct {
	Available   bool
	AvailableAt *string
}

type MonthlyFriendsActivityDeliveryResult struct {
	MonthStart time.Time
	MonthEnd   time.Time
	Eligible   int
	Sent       int
	Skipped    int
}

type MonthlyFriendsActivityDiagnostics struct {
	AcceptedFriendCount                int  `json:"acceptedFriendCount"`
	AcceptedFriendVisitCountInMonth    int  `json:"acceptedFriendVisitCountInMonth"`
	FriendVisibleCreatedCountInMonth   int  `json:"friendVisibleCreatedCountInMonth"`
	FriendVisibleVisitCountAllTime     int  `json:"friendVisibleVisitCountAllTime"`
	FriendVisibleVisitDateCountInMonth int  `json:"friendVisibleVisitDateCountInMonth"`
	PrivateAcceptedFriendCountInMonth  int  `json:"privateAcceptedFriendCountInMonth"`
	TargetUserExists                   bool `json:"targetUserExists"`
}

type monthlyFriendsActivityCandidate struct {
	UserID      string `db:"user_id"`
	VisitCount  int    `db:"visit_count"`
	FriendCount int    `db:"friend_count"`
}

type monthlyFriendsActivityDeliveryOptions struct {
	ForceTestSend bool
}

type expoNotificationPushSender struct {
	client           *http.Client
	endpoint         string
	receiptsEndpoint string
}

var activeNotificationPushSender NotificationPushSender = expoNotificationPushSender{
	client: &http.Client{Timeout: 5 * time.Second},
}

var activeNotificationPushReceiptChecker NotificationPushReceiptChecker = expoNotificationPushSender{
	client: &http.Client{Timeout: 5 * time.Second},
}

func SetNotificationPushSenderForTests(sender NotificationPushSender) func() {
	previous := activeNotificationPushSender
	activeNotificationPushSender = sender
	return func() {
		activeNotificationPushSender = previous
	}
}

func SetNotificationPushReceiptCheckerForTests(checker NotificationPushReceiptChecker) func() {
	previous := activeNotificationPushReceiptChecker
	activeNotificationPushReceiptChecker = checker
	return func() {
		activeNotificationPushReceiptChecker = previous
	}
}

func RegisterNotificationHandlers(se *core.ServeEvent, app core.App) {
	if err := RegisterMonthlyFriendsActivityNotificationJob(app); err != nil {
		log.Printf("Warning: failed to register monthly friends activity notification job: %v", err)
	}
	if err := RegisterNotificationDeliveryCleanupJob(app); err != nil {
		log.Printf("Warning: failed to register notification delivery cleanup job: %v", err)
	}
	if err := RegisterStaleNotificationDeviceCleanupJob(app); err != nil {
		log.Printf("Warning: failed to register stale notification device cleanup job: %v", err)
	}
	if err := RegisterNotificationReceiptCheckJob(app); err != nil {
		log.Printf("Warning: failed to register notification receipt check job: %v", err)
	}

	se.Router.POST("/api/admin/notifications/monthly-friends-activity/test", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		requestBody := monthlyFriendsActivityTestRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		userID, err := normalizeBoundedString(requestBody.UserID, "userId", 100)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		monthStart, monthEnd, err := parseMonthlyFriendsActivityMonth(requestBody.Month, time.Now().UTC())
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		candidate, found, err := findMonthlyFriendsActivityCandidate(app, userID, monthStart, monthEnd)
		if err != nil {
			return apis.NewApiError(500, "failed to inspect monthly friends activity", err)
		}
		if !found {
			diagnostics, diagnosticsErr := diagnoseMonthlyFriendsActivityCandidate(app, userID, monthStart, monthEnd)
			if diagnosticsErr != nil {
				return apis.NewApiError(500, "failed to inspect monthly friends activity diagnostics", diagnosticsErr)
			}
			if auditErr := createAdminActionAuditLog(
				app,
				e,
				core.ModelEventTypeCreate,
				"notification_delivery_logs",
				userID,
				userID,
				map[string]any{
					"force":  requestBody.Force,
					"month":  monthStart.Format("2006-01"),
					"source": "admin_monthly_friends_activity_notification_test",
					"status": "skipped_no_matching_activity",
					"userId": userID,
				},
				"Tested monthly friends activity notification for "+userID,
			); auditErr != nil {
				log.Printf("Admin monthly friends activity notification test audit failed for user %s: %v", userID, auditErr)
			}
			return e.JSON(200, map[string]any{
				"diagnostics": diagnostics,
				"month":       monthStart.Format("2006-01"),
				"status":      "skipped_no_matching_activity",
				"userId":      userID,
			})
		}

		status, err := deliverMonthlyFriendsActivityNotificationWithOptions(app, candidate, monthStart, monthlyFriendsActivityDeliveryOptions{
			ForceTestSend: requestBody.Force,
		})
		if err != nil {
			return apis.NewApiError(500, "failed to deliver monthly friends activity notification", err)
		}
		if status == "" {
			status = "skipped_duplicate"
		}

		if auditErr := createAdminActionAuditLog(
			app,
			e,
			core.ModelEventTypeCreate,
			"notification_delivery_logs",
			candidate.UserID,
			candidate.UserID,
			map[string]any{
				"force":       requestBody.Force,
				"friendCount": candidate.FriendCount,
				"month":       monthStart.Format("2006-01"),
				"source":      "admin_monthly_friends_activity_notification_test",
				"status":      status,
				"userId":      candidate.UserID,
				"visitCount":  candidate.VisitCount,
			},
			"Tested monthly friends activity notification for "+candidate.UserID,
		); auditErr != nil {
			log.Printf("Admin monthly friends activity notification test audit failed for user %s: %v", candidate.UserID, auditErr)
		}

		return e.JSON(200, map[string]any{
			"friendCount": candidate.FriendCount,
			"month":       monthStart.Format("2006-01"),
			"status":      status,
			"userId":      candidate.UserID,
			"visitCount":  candidate.VisitCount,
		})
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/admin/notifications/bill-owed/test", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		requestBody := billOwedNotificationTestRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		userIDs, err := normalizeNotificationTestUserIDs(requestBody.UserIDs)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		actorUserID := strings.TrimSpace(requestBody.ActorUserID)
		billID := strings.TrimSpace(requestBody.BillID)
		if billID == "" {
			billID = fmt.Sprintf("admin-test-bill-%d", time.Now().UTC().UnixNano())
		}

		results := make([]adminNotificationTestRecipientResult, 0, len(userIDs))
		for _, userID := range userIDs {
			status, err := deliverBillOwedNotification(app, billID, actorUserID, userID, "")
			if err != nil {
				return apis.NewApiError(500, "failed to deliver bill notification test", err)
			}
			results = append(results, adminNotificationTestRecipientResult{
				Status: status,
				UserID: userID,
			})
		}

		if auditErr := createAdminActionAuditLog(
			app,
			e,
			core.ModelEventTypeCreate,
			"notification_delivery_logs",
			billID,
			billID,
			map[string]any{
				"actorUserId":    actorUserID,
				"billId":         billID,
				"recipientCount": len(results),
				"source":         "admin_bill_owed_notification_test",
				"userIds":        userIDs,
			},
			"Tested bill owed notification for "+fmt.Sprintf("%d", len(results))+" user(s)",
		); auditErr != nil {
			log.Printf("Admin bill owed notification test audit failed for bill %s: %v", billID, auditErr)
		}

		return e.JSON(200, map[string]any{
			"billId":     billID,
			"recipients": results,
			"status":     "completed",
		})
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/admin/notifications/tasting-invite/test", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		requestBody := tastingInviteNotificationTestRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		userID, err := normalizeBoundedString(requestBody.UserID, "userId", 100)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		actorUserID := strings.TrimSpace(requestBody.ActorUserID)
		sessionID := strings.TrimSpace(requestBody.SessionID)
		if sessionID == "" {
			sessionID = fmt.Sprintf("admin-test-session-%d", time.Now().UTC().UnixNano())
		}

		status, err := deliverTastingInviteNotification(app, sessionID, actorUserID, userID, "", nil)
		if err != nil {
			return apis.NewApiError(500, "failed to deliver tasting invite notification test", err)
		}

		if auditErr := createAdminActionAuditLog(
			app,
			e,
			core.ModelEventTypeCreate,
			"notification_delivery_logs",
			sessionID,
			sessionID,
			map[string]any{
				"actorUserId": actorUserID,
				"sessionId":   sessionID,
				"source":      "admin_tasting_invite_notification_test",
				"status":      status,
				"userId":      userID,
			},
			"Tested tasting invite notification for "+userID,
		); auditErr != nil {
			log.Printf("Admin tasting invite notification test audit failed for session %s: %v", sessionID, auditErr)
		}

		return e.JSON(200, map[string]any{
			"sessionId": sessionID,
			"status":    status,
			"userId":    userID,
		})
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/notification-devices", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}

		requestBody := notificationDeviceRegistrationRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		deviceID, err := normalizeBoundedString(requestBody.DeviceID, "deviceId", 200)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		pushToken, err := normalizeBoundedString(requestBody.PushToken, "pushToken", 500)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		platform := normalizeNotificationDevicePlatform(requestBody.Platform)
		revocationCapability, revocationID, err := normalizeNotificationDeviceRevocationCredentials(
			requestBody.RevocationCapability,
			requestBody.RevocationID,
		)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		now := time.Now().UTC()

		if err := app.RunInTransaction(func(txApp core.App) error {
			record, findErr := txApp.FindFirstRecordByFilter(
				"notification_devices",
				"user = {:user} && device_id = {:deviceID}",
				dbx.Params{"user": authRecord.Id, "deviceID": deviceID},
			)
			if findErr != nil {
				if !errors.Is(findErr, sql.ErrNoRows) {
					return findErr
				}
				collection, collectionErr := txApp.FindCollectionByNameOrId("notification_devices")
				if collectionErr != nil {
					return collectionErr
				}
				record = core.NewRecord(collection)
				record.Set("user", authRecord.Id)
				record.Set("device_id", deviceID)
			}

			record.Set("push_token", pushToken)
			record.Set("platform", platform)
			record.Set("active", true)
			record.Set("auth_token_key_hash", hashNotificationDeviceSecret(authRecord.TokenKey()))
			record.Set("last_registered_at", now)
			record.Set("last_seen_at", now)
			if revocationID != "" {
				record.Set("revocation_id", revocationID)
				record.Set("revocation_capability_hash", hashNotificationDeviceSecret(revocationCapability))
			}
			if err := txApp.Save(record); err != nil {
				return err
			}
			return deactivateOtherNotificationDevicesForRegistration(txApp, authRecord.Id, deviceID, pushToken)
		}); err != nil {
			return apis.NewApiError(500, "failed to save notification device", err)
		}

		return e.JSON(200, map[string]any{"success": true})
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/notification-devices/revoke", func(e *core.RequestEvent) error {
		requestBody := notificationDeviceRevocationRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		revocationCapability, revocationID, err := normalizeNotificationDeviceRevocationCredentials(
			requestBody.RevocationCapability,
			requestBody.RevocationID,
		)
		if err != nil || revocationID == "" {
			return apis.NewBadRequestError("valid revocation credentials are required", nil)
		}

		record, findErr := app.FindFirstRecordByFilter(
			"notification_devices",
			"revocation_id = {:revocationID}",
			dbx.Params{"revocationID": revocationID},
		)
		if findErr != nil {
			if errors.Is(findErr, sql.ErrNoRows) {
				return e.JSON(200, map[string]any{"success": true})
			}
			return apis.NewApiError(500, "failed to load notification device", findErr)
		}

		expectedHash := record.GetString("revocation_capability_hash")
		providedHash := hashNotificationDeviceSecret(revocationCapability)
		if subtle.ConstantTimeCompare([]byte(expectedHash), []byte(providedHash)) != 1 {
			return e.JSON(200, map[string]any{"success": true})
		}
		if err := deactivateNotificationDeviceRecord(app, record); err != nil {
			return apis.NewApiError(500, "failed to deactivate notification device", err)
		}

		return e.JSON(200, map[string]any{"success": true})
	})

	se.Router.GET("/api/notification-preferences", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}

		preferences, err := getNotificationPreferencesResponse(app, authRecord.Id)
		if err != nil {
			return apis.NewApiError(500, "failed to load notification preferences", err)
		}

		return e.JSON(200, preferences)
	}).Bind(apis.RequireAuth())

	se.Router.PUT("/api/notification-preferences", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}

		requestBody := notificationPreferencesRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		preferences, err := saveNotificationPreferencesResponse(app, authRecord.Id, requestBody)
		if err != nil {
			return apis.NewApiError(500, "failed to save notification preferences", err)
		}

		return e.JSON(200, preferences)
	}).Bind(apis.RequireAuth())

	se.Router.DELETE("/api/notification-devices/{deviceId}", func(e *core.RequestEvent) error {
		authRecord, err := requireTastingAuth(e)
		if err != nil {
			return err
		}
		deviceID := strings.TrimSpace(e.Request.PathValue("deviceId"))
		if deviceID == "" {
			return apis.NewBadRequestError("deviceId is required", nil)
		}

		record, findErr := app.FindFirstRecordByFilter(
			"notification_devices",
			"user = {:user} && device_id = {:deviceID}",
			dbx.Params{"user": authRecord.Id, "deviceID": deviceID},
		)
		if findErr != nil {
			if errors.Is(findErr, sql.ErrNoRows) {
				return e.JSON(200, map[string]any{"success": true})
			}
			return apis.NewApiError(500, "failed to load notification device", findErr)
		}

		if err := deactivateNotificationDeviceRecord(app, record); err != nil {
			return apis.NewApiError(500, "failed to deactivate notification device", err)
		}
		return e.JSON(200, map[string]any{"success": true})
	}).Bind(apis.RequireAuth())
}

func RegisterMonthlyFriendsActivityNotificationJob(app core.App) error {
	return app.Cron().Add("monthly_friends_activity_notifications", "0 17 1 * *", func() {
		if _, err := DeliverMonthlyFriendsActivityNotifications(app, time.Now().UTC()); err != nil {
			log.Printf("Monthly friends activity notifications failed: %v", err)
		}
	})
}

func RegisterNotificationDeliveryCleanupJob(app core.App) error {
	return app.Cron().Add("notification_delivery_log_retention_cleanup", "0 3 * * *", func() {
		removed, err := CleanupNotificationDeliveryLogs(app, time.Now().UTC())
		if err != nil {
			log.Printf("Notification delivery log cleanup failed: %v", err)
			return
		}
		if removed > 0 {
			log.Printf("Notification delivery log cleanup removed %d records", removed)
		}
	})
}

func RegisterStaleNotificationDeviceCleanupJob(app core.App) error {
	return app.Cron().Add("stale_notification_device_cleanup", "30 3 * * *", func() {
		deactivated, err := CleanupStaleNotificationDevices(app, time.Now().UTC())
		if err != nil {
			log.Printf("Stale notification device cleanup failed: %v", err)
			return
		}
		if deactivated > 0 {
			log.Printf("Stale notification device cleanup deactivated %d records", deactivated)
		}
	})
}

func RegisterNotificationReceiptCheckJob(app core.App) error {
	return app.Cron().Add("notification_push_receipt_checks", "*/5 * * * *", func() {
		checked, err := CheckPendingExpoPushReceipts(app, time.Now().UTC())
		if err != nil {
			log.Printf("Notification receipt check failed: %v", err)
			return
		}
		if checked > 0 {
			log.Printf("Notification receipt check processed %d records", checked)
		}
	})
}

func CleanupStaleNotificationDevices(app core.App, now time.Time) (int, error) {
	cutoff := now.UTC().AddDate(0, 0, -notificationDeviceStaleAfterDays)
	deviceIDs := make([]string, 0)
	offset := 0

	for {
		records, err := app.FindRecordsByFilter(
			"notification_devices",
			"active = true",
			"created",
			200,
			offset,
			nil,
		)
		if err != nil {
			return 0, err
		}
		if len(records) == 0 {
			break
		}

		for _, record := range records {
			if isStaleNotificationDeviceRecord(record, cutoff) {
				deviceIDs = append(deviceIDs, record.Id)
			}
		}

		offset += len(records)
	}

	deactivated := 0
	for _, deviceID := range deviceIDs {
		record, err := app.FindRecordById("notification_devices", deviceID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return deactivated, err
		}
		if !record.GetBool("active") {
			continue
		}
		record.Set("active", false)
		if err := app.Save(record); err != nil {
			return deactivated, err
		}
		deactivated++
	}

	return deactivated, nil
}

func isStaleNotificationDeviceRecord(record *core.Record, cutoff time.Time) bool {
	lastSeenAt := record.GetDateTime("last_seen_at")
	lastRegisteredAt := record.GetDateTime("last_registered_at")
	if lastSeenAt.IsZero() && lastRegisteredAt.IsZero() {
		return true
	}

	lastActivityAt := lastSeenAt.Time()
	if lastActivityAt.IsZero() || (!lastRegisteredAt.IsZero() && lastRegisteredAt.Time().After(lastActivityAt)) {
		lastActivityAt = lastRegisteredAt.Time()
	}

	return lastActivityAt.Before(cutoff)
}

func CleanupNotificationDeliveryLogs(app core.App, now time.Time) (int, error) {
	sentCutoff := formatPocketBaseDateTime(now.UTC().AddDate(0, 0, -notificationDeliverySentRetentionDays))
	failedCutoff := formatPocketBaseDateTime(now.UTC().AddDate(0, 0, -notificationDeliveryFailedRetentionDays))
	removed := 0

	for {
		records, err := app.FindRecordsByFilter(
			"notification_delivery_logs",
			"(status = 'sent' && created < {:sentCutoff}) || (status != 'sent' && created < {:failedCutoff})",
			"",
			200,
			0,
			dbx.Params{
				"failedCutoff": failedCutoff,
				"sentCutoff":   sentCutoff,
			},
		)
		if err != nil {
			return removed, err
		}
		if len(records) == 0 {
			return removed, nil
		}
		for _, record := range records {
			if err := app.Delete(record); err != nil {
				return removed, err
			}
			removed++
		}
	}
}

func CheckPendingExpoPushReceipts(app core.App, now time.Time) (int, error) {
	checked, err := checkPendingPerDeviceNotificationReceipts(app, now)
	if err != nil {
		return checked, err
	}
	legacyChecked, err := checkPendingLegacyNotificationLogReceipts(app, now)
	if err != nil {
		return checked + legacyChecked, err
	}
	return checked + legacyChecked, nil
}

func checkPendingPerDeviceNotificationReceipts(app core.App, now time.Time) (int, error) {
	records, err := app.FindRecordsByFilter(
		"notification_delivery_receipts",
		"receipt_status = 'pending' && provider_message_id != '' && receipt_next_check_at <= {:now}",
		"receipt_next_check_at",
		1000,
		0,
		dbx.Params{"now": formatPocketBaseDateTime(now.UTC())},
	)
	if err != nil {
		if strings.Contains(err.Error(), "notification_delivery_receipts") {
			return 0, nil
		}
		return 0, err
	}
	if len(records) == 0 {
		return 0, nil
	}

	receiptIDs := make([]string, 0, len(records))
	recordsByReceiptID := map[string]*core.Record{}
	for _, record := range records {
		receiptID := strings.TrimSpace(record.GetString("provider_message_id"))
		if receiptID == "" {
			continue
		}
		receiptIDs = append(receiptIDs, receiptID)
		recordsByReceiptID[receiptID] = record
	}
	if len(receiptIDs) == 0 {
		return 0, nil
	}

	receipts, err := activeNotificationPushReceiptChecker.CheckRemoteDeviceNotificationReceipts(receiptIDs)
	if err != nil {
		return 0, err
	}

	checked := 0
	for _, receiptID := range receiptIDs {
		record := recordsByReceiptID[receiptID]
		receipt, ok := receipts[receiptID]
		if !ok {
			record.Set("receipt_status", "missing")
			record.Set("receipt_checked_at", now.UTC())
			record.Set("receipt_error_code", "receipt_missing")
			if err := app.Save(record); err != nil {
				return checked, err
			}
			if err := updateParentNotificationDeliveryLogReceiptSummary(app, record, "missing", "receipt_missing", now); err != nil {
				return checked, err
			}
			checked++
			continue
		}

		receiptStatus := normalizeExpoReceiptStatus(receipt.Status)
		record.Set("receipt_status", receiptStatus)
		record.Set("receipt_checked_at", now.UTC())
		if receiptStatus == "error" {
			errorCode := normalizeReceiptProviderErrorCode(receipt)
			record.Set("receipt_error_code", errorCode)
			if err := updateParentNotificationDeliveryLogReceiptSummary(app, record, receiptStatus, errorCode, now); err != nil {
				return checked, err
			}
			if isInvalidProviderTokenErrorCode(receipt.ErrorCode) {
				deviceID := strings.TrimSpace(record.GetString("notification_device"))
				if deviceID != "" {
					deviceRecord, findErr := app.FindRecordById("notification_devices", deviceID)
					if findErr == nil && deviceRecord.GetBool("active") {
						if err := deactivateNotificationDeviceRecord(app, deviceRecord); err != nil {
							return checked, err
						}
					} else if findErr != nil && !errors.Is(findErr, sql.ErrNoRows) {
						return checked, findErr
					}
				}
			}
		} else if err := updateParentNotificationDeliveryLogReceiptSummary(app, record, receiptStatus, "", now); err != nil {
			return checked, err
		}
		if err := app.Save(record); err != nil {
			return checked, err
		}
		checked++
	}

	return checked, nil
}

func checkPendingLegacyNotificationLogReceipts(app core.App, now time.Time) (int, error) {
	records, err := app.FindRecordsByFilter(
		"notification_delivery_logs",
		"status = 'sent' && receipt_status = 'pending' && provider_message_id != '' && receipt_next_check_at <= {:now}",
		"receipt_next_check_at",
		1000,
		0,
		dbx.Params{"now": formatPocketBaseDateTime(now.UTC())},
	)
	if err != nil {
		return 0, err
	}
	if len(records) == 0 {
		return 0, nil
	}

	receiptIDs := make([]string, 0, len(records))
	recordsByReceiptID := map[string]*core.Record{}
	for _, record := range records {
		hasPerDeviceReceipts, err := hasNotificationDeliveryReceiptRecords(app, record.Id)
		if err != nil {
			return 0, err
		}
		if hasPerDeviceReceipts {
			continue
		}
		receiptID := strings.TrimSpace(record.GetString("provider_message_id"))
		if receiptID == "" {
			continue
		}
		receiptIDs = append(receiptIDs, receiptID)
		recordsByReceiptID[receiptID] = record
	}
	if len(receiptIDs) == 0 {
		return 0, nil
	}

	receipts, err := activeNotificationPushReceiptChecker.CheckRemoteDeviceNotificationReceipts(receiptIDs)
	if err != nil {
		return 0, err
	}

	checked := 0
	for _, receiptID := range receiptIDs {
		record := recordsByReceiptID[receiptID]
		receipt, ok := receipts[receiptID]
		if !ok {
			record.Set("receipt_status", "missing")
			record.Set("receipt_checked_at", now.UTC())
			record.Set("receipt_error_code", "receipt_missing")
			if err := app.Save(record); err != nil {
				return checked, err
			}
			checked++
			continue
		}

		receiptStatus := normalizeExpoReceiptStatus(receipt.Status)
		record.Set("receipt_status", receiptStatus)
		record.Set("receipt_checked_at", now.UTC())
		if receiptStatus == "error" {
			errorCode := normalizeReceiptProviderErrorCode(receipt)
			record.Set("status", "provider_failed")
			record.Set("error_code", errorCode)
			record.Set("receipt_error_code", errorCode)
			if isInvalidProviderTokenErrorCode(receipt.ErrorCode) {
				deviceID := strings.TrimSpace(record.GetString("notification_device"))
				if deviceID != "" {
					deviceRecord, findErr := app.FindRecordById("notification_devices", deviceID)
					if findErr == nil && deviceRecord.GetBool("active") {
						if err := deactivateNotificationDeviceRecord(app, deviceRecord); err != nil {
							return checked, err
						}
					} else if findErr != nil && !errors.Is(findErr, sql.ErrNoRows) {
						return checked, findErr
					}
				}
			}
		}
		if err := app.Save(record); err != nil {
			return checked, err
		}
		checked++
	}

	return checked, nil
}

func hasNotificationDeliveryReceiptRecords(app core.App, deliveryLogID string) (bool, error) {
	records, err := app.FindRecordsByFilter(
		"notification_delivery_receipts",
		"notification_delivery_log = {:deliveryLogID}",
		"",
		1,
		0,
		dbx.Params{"deliveryLogID": strings.TrimSpace(deliveryLogID)},
	)
	if err != nil {
		return false, err
	}
	return len(records) > 0, nil
}

func updateParentNotificationDeliveryLogReceiptSummary(
	app core.App,
	receiptRecord *core.Record,
	receiptStatus string,
	errorCode string,
	now time.Time,
) error {
	logID := strings.TrimSpace(receiptRecord.GetString("notification_delivery_log"))
	if logID == "" {
		return nil
	}
	logRecord, err := app.FindRecordById("notification_delivery_logs", logID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}

	providerMessageID := strings.TrimSpace(receiptRecord.GetString("provider_message_id"))
	if strings.TrimSpace(logRecord.GetString("provider_message_id")) != providerMessageID {
		if receiptStatus != "error" {
			return nil
		}
	} else {
		logRecord.Set("receipt_status", receiptStatus)
		logRecord.Set("receipt_checked_at", now.UTC())
	}

	if receiptStatus == "error" {
		logRecord.Set("error_code", errorCode)
		logRecord.Set("receipt_error_code", errorCode)
		logRecord.Set("receipt_status", "error")
		logRecord.Set("receipt_checked_at", now.UTC())
	} else if receiptStatus == "missing" && strings.TrimSpace(logRecord.GetString("provider_message_id")) == providerMessageID {
		logRecord.Set("receipt_error_code", errorCode)
	}

	return app.Save(logRecord)
}

func DeliverMonthlyFriendsActivityNotifications(app core.App, now time.Time) (MonthlyFriendsActivityDeliveryResult, error) {
	monthStart, monthEnd := previousCalendarMonthBounds(now.UTC())
	result := MonthlyFriendsActivityDeliveryResult{
		MonthStart: monthStart,
		MonthEnd:   monthEnd,
	}

	candidates, err := listMonthlyFriendsActivityCandidates(app, monthStart, monthEnd)
	if err != nil {
		return result, err
	}
	result.Eligible = len(candidates)

	for _, candidate := range candidates {
		status, err := deliverMonthlyFriendsActivityNotificationWithOptions(app, candidate, monthStart, monthlyFriendsActivityDeliveryOptions{})
		if err != nil {
			return result, err
		}
		if status == "sent" {
			result.Sent++
		} else if status != "" {
			result.Skipped++
		}
	}

	return result, nil
}

func getNotificationPreferencesResponse(app core.App, userID string) (notificationPreferencesResponse, error) {
	record, err := findNotificationPreferencesRecord(app, userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return notificationPreferencesResponse{
				TastingInvitesEnabled:         true,
				BillOwedEnabled:               true,
				MonthlyFriendsActivityEnabled: true,
			}, nil
		}
		return notificationPreferencesResponse{}, err
	}

	return notificationPreferencesResponse{
		TastingInvitesEnabled:         record.GetBool("tasting_invites_enabled"),
		BillOwedEnabled:               record.GetBool("bill_owed_enabled"),
		MonthlyFriendsActivityEnabled: record.GetBool("monthly_friends_activity_enabled"),
	}, nil
}

func saveNotificationPreferencesResponse(
	app core.App,
	userID string,
	input notificationPreferencesRequest,
) (notificationPreferencesResponse, error) {
	record, err := findNotificationPreferencesRecord(app, userID)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return notificationPreferencesResponse{}, err
		}
		collection, collectionErr := app.FindCollectionByNameOrId("notification_preferences")
		if collectionErr != nil {
			return notificationPreferencesResponse{}, collectionErr
		}
		record = core.NewRecord(collection)
		record.Set("user", strings.TrimSpace(userID))
	}

	record.Set("tasting_invites_enabled", input.TastingInvitesEnabled)
	record.Set("bill_owed_enabled", input.BillOwedEnabled)
	record.Set("monthly_friends_activity_enabled", input.MonthlyFriendsActivityEnabled)
	if err := app.Save(record); err != nil {
		return notificationPreferencesResponse{}, err
	}

	return notificationPreferencesResponse{
		TastingInvitesEnabled:         record.GetBool("tasting_invites_enabled"),
		BillOwedEnabled:               record.GetBool("bill_owed_enabled"),
		MonthlyFriendsActivityEnabled: record.GetBool("monthly_friends_activity_enabled"),
	}, nil
}

func findNotificationPreferencesRecord(app core.App, userID string) (*core.Record, error) {
	return app.FindFirstRecordByFilter(
		"notification_preferences",
		"user = {:user}",
		dbx.Params{"user": strings.TrimSpace(userID)},
	)
}

func listMonthlyFriendsActivityCandidates(app core.App, monthStart time.Time, monthEnd time.Time) ([]monthlyFriendsActivityCandidate, error) {
	candidates := []monthlyFriendsActivityCandidate{}
	err := app.DB().NewQuery(`
		SELECT
			viewer.id AS user_id,
			COUNT(DISTINCT visits.id) AS visit_count,
			COUNT(DISTINCT visits.user) AS friend_count
		FROM users viewer
		INNER JOIN friendships friendship
			ON friendship.status = 'accepted'
			AND (friendship.user = viewer.id OR friendship.friend = viewer.id)
		INNER JOIN visits
			ON visits.user = CASE
				WHEN friendship.user = viewer.id THEN friendship.friend
				ELSE friendship.user
			END
			AND visits.visibility = 'friends'
			AND COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created) >= {:monthStart}
			AND COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created) < {:monthEnd}
		GROUP BY viewer.id
		HAVING COUNT(DISTINCT visits.id) > 0
		ORDER BY viewer.id
	`).
		Bind(dbx.Params{
			"monthStart": formatPocketBaseDateTime(monthStart),
			"monthEnd":   formatPocketBaseDateTime(monthEnd),
		}).
		All(&candidates)
	return candidates, err
}

func diagnoseMonthlyFriendsActivityCandidate(
	app core.App,
	userID string,
	monthStart time.Time,
	monthEnd time.Time,
) (MonthlyFriendsActivityDiagnostics, error) {
	diagnostics := MonthlyFriendsActivityDiagnostics{}
	trimmedUserID := strings.TrimSpace(userID)

	userRecord, err := app.FindRecordById("users", trimmedUserID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return diagnostics, nil
		}
		return diagnostics, err
	}
	diagnostics.TargetUserExists = userRecord != nil

	countQueries := []struct {
		assign func(int)
		query  string
	}{
		{
			assign: func(value int) { diagnostics.AcceptedFriendCount = value },
			query: `
				SELECT COUNT(DISTINCT CASE
					WHEN friendship.user = {:user} THEN friendship.friend
					ELSE friendship.user
				END) AS count
				FROM friendships friendship
				WHERE friendship.status = 'accepted'
					AND (friendship.user = {:user} OR friendship.friend = {:user})
			`,
		},
		{
			assign: func(value int) { diagnostics.FriendVisibleVisitCountAllTime = value },
			query: `
				SELECT COUNT(DISTINCT visits.id) AS count
				FROM friendships friendship
				INNER JOIN visits
					ON visits.user = CASE
						WHEN friendship.user = {:user} THEN friendship.friend
						ELSE friendship.user
					END
					AND visits.visibility = 'friends'
				WHERE friendship.status = 'accepted'
					AND (friendship.user = {:user} OR friendship.friend = {:user})
			`,
		},
		{
			assign: func(value int) { diagnostics.FriendVisibleVisitDateCountInMonth = value },
			query: `
				SELECT COUNT(DISTINCT visits.id) AS count
				FROM friendships friendship
				INNER JOIN visits
					ON visits.user = CASE
						WHEN friendship.user = {:user} THEN friendship.friend
						ELSE friendship.user
					END
					AND visits.visibility = 'friends'
					AND COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created) >= {:monthStart}
					AND COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created) < {:monthEnd}
				WHERE friendship.status = 'accepted'
					AND (friendship.user = {:user} OR friendship.friend = {:user})
			`,
		},
		{
			assign: func(value int) { diagnostics.AcceptedFriendVisitCountInMonth = value },
			query: `
				SELECT COUNT(DISTINCT visits.id) AS count
				FROM friendships friendship
				INNER JOIN visits
					ON visits.user = CASE
						WHEN friendship.user = {:user} THEN friendship.friend
						ELSE friendship.user
					END
					AND COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created) >= {:monthStart}
					AND COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created) < {:monthEnd}
				WHERE friendship.status = 'accepted'
					AND (friendship.user = {:user} OR friendship.friend = {:user})
			`,
		},
		{
			assign: func(value int) { diagnostics.PrivateAcceptedFriendCountInMonth = value },
			query: `
				SELECT COUNT(DISTINCT visits.id) AS count
				FROM friendships friendship
				INNER JOIN visits
					ON visits.user = CASE
						WHEN friendship.user = {:user} THEN friendship.friend
						ELSE friendship.user
					END
					AND visits.visibility = 'private'
					AND COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created) >= {:monthStart}
					AND COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created) < {:monthEnd}
				WHERE friendship.status = 'accepted'
					AND (friendship.user = {:user} OR friendship.friend = {:user})
			`,
		},
		{
			assign: func(value int) { diagnostics.FriendVisibleCreatedCountInMonth = value },
			query: `
				SELECT COUNT(DISTINCT visits.id) AS count
				FROM friendships friendship
				INNER JOIN visits
					ON visits.user = CASE
						WHEN friendship.user = {:user} THEN friendship.friend
						ELSE friendship.user
					END
					AND visits.visibility = 'friends'
					AND visits.created >= {:monthStart}
					AND visits.created < {:monthEnd}
				WHERE friendship.status = 'accepted'
					AND (friendship.user = {:user} OR friendship.friend = {:user})
			`,
		},
	}

	for _, countQuery := range countQueries {
		count, err := runMonthlyFriendsActivityDiagnosticCount(app, countQuery.query, trimmedUserID, monthStart, monthEnd)
		if err != nil {
			return diagnostics, err
		}
		countQuery.assign(count)
	}

	return diagnostics, nil
}

func runMonthlyFriendsActivityDiagnosticCount(
	app core.App,
	query string,
	userID string,
	monthStart time.Time,
	monthEnd time.Time,
) (int, error) {
	type countRow struct {
		Count int `db:"count"`
	}
	rows := []countRow{}
	err := app.DB().NewQuery(query).
		Bind(dbx.Params{
			"monthEnd":   formatPocketBaseDateTime(monthEnd),
			"monthStart": formatPocketBaseDateTime(monthStart),
			"user":       strings.TrimSpace(userID),
		}).
		All(&rows)
	if err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 0, nil
	}
	return rows[0].Count, nil
}

func findMonthlyFriendsActivityCandidate(app core.App, userID string, monthStart time.Time, monthEnd time.Time) (monthlyFriendsActivityCandidate, bool, error) {
	candidates := []monthlyFriendsActivityCandidate{}
	err := app.DB().NewQuery(`
		SELECT
			viewer.id AS user_id,
			COUNT(DISTINCT visits.id) AS visit_count,
			COUNT(DISTINCT visits.user) AS friend_count
		FROM users viewer
		INNER JOIN friendships friendship
			ON friendship.status = 'accepted'
			AND (friendship.user = viewer.id OR friendship.friend = viewer.id)
		INNER JOIN visits
			ON visits.user = CASE
				WHEN friendship.user = viewer.id THEN friendship.friend
				ELSE friendship.user
			END
			AND visits.visibility = 'friends'
			AND COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created) >= {:monthStart}
			AND COALESCE(NULLIF(TRIM(visits.visitDate), ''), visits.created) < {:monthEnd}
		WHERE viewer.id = {:user}
		GROUP BY viewer.id
		HAVING COUNT(DISTINCT visits.id) > 0
		LIMIT 1
	`).
		Bind(dbx.Params{
			"monthStart": formatPocketBaseDateTime(monthStart),
			"monthEnd":   formatPocketBaseDateTime(monthEnd),
			"user":       strings.TrimSpace(userID),
		}).
		All(&candidates)
	if err != nil {
		return monthlyFriendsActivityCandidate{}, false, err
	}
	if len(candidates) == 0 {
		return monthlyFriendsActivityCandidate{}, false, nil
	}
	return candidates[0], true, nil
}

func deliverMonthlyFriendsActivityNotificationWithOptions(
	app core.App,
	candidate monthlyFriendsActivityCandidate,
	monthStart time.Time,
	options monthlyFriendsActivityDeliveryOptions,
) (string, error) {
	userID := strings.TrimSpace(candidate.UserID)
	if userID == "" {
		return "", nil
	}

	deliveryKey := monthlyFriendsActivityDeliveryKey(userID, monthStart)
	if options.ForceTestSend {
		deliveryKey = fmt.Sprintf("%s:admin-test:%d", deliveryKey, time.Now().UTC().UnixNano())
	} else {
		alreadyLogged, err := hasNotificationDeliveryLogWithKey(app, deliveryKey)
		if err != nil {
			return "", err
		}
		if alreadyLogged {
			return "", nil
		}
	}

	baseLog := notificationDeliveryLogInput{
		UserID:           userID,
		SignalType:       monthlyFriendsActivitySignalType,
		SourceCollection: "visits",
		SourceRecord:     monthStart.Format("2006-01"),
		DeliveryKey:      deliveryKey,
	}

	enabled, err := isMonthlyFriendsActivityNotificationPreferenceEnabled(app, userID)
	if err != nil {
		return "", err
	}
	if !enabled {
		baseLog.Status = "skipped_preference_disabled"
		if err := createNotificationDeliveryLog(app, baseLog); err != nil {
			return "", err
		}
		return baseLog.Status, nil
	}

	devices, err := listActiveNotificationDevices(app, userID)
	if err != nil {
		return "", err
	}
	if len(devices) == 0 {
		baseLog.Status = "skipped_no_active_device"
		if err := createNotificationDeliveryLog(app, baseLog); err != nil {
			return "", err
		}
		return baseLog.Status, nil
	}

	payload := remoteDeviceNotificationPayloadForSignal(remoteNotificationSignalPayloadInput{
		SignalType: monthlyFriendsActivitySignalType,
		Period:     monthStart.Format("2006-01"),
	})

	sendResult := sendRemoteNotificationToActiveDevices(app, devices, payload)
	if sendResult.Err != nil {
		baseLog.Status = "provider_failed"
		baseLog.DeviceCount = sendResult.DeviceCount
		baseLog.ErrorCode = sendResult.ErrorCode
		if err := createNotificationDeliveryLogWithReceipts(app, baseLog, sendResult); err != nil {
			return "", err
		}
		return baseLog.Status, nil
	}

	baseLog.Status = "sent"
	baseLog.DeviceCount = sendResult.DeviceCount
	baseLog.ProviderMessageID = sendResult.ProviderMessageID
	baseLog.NotificationDeviceID = sendResult.NotificationDeviceID
	logRecord, err := createNotificationDeliveryLogRecord(app, baseLog)
	if err != nil {
		return "", err
	}
	if err := createNotificationDeliveryReceiptRecords(app, logRecord.Id, sendResult.Receipts); err != nil {
		return "", err
	}
	return baseLog.Status, nil
}

func parseMonthlyFriendsActivityMonth(month string, now time.Time) (time.Time, time.Time, error) {
	trimmedMonth := strings.TrimSpace(month)
	if trimmedMonth == "" {
		monthStart, monthEnd := previousCalendarMonthBounds(now)
		return monthStart, monthEnd, nil
	}

	parsed, err := time.Parse("2006-01", trimmedMonth)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("month must use YYYY-MM format")
	}
	monthStart := time.Date(parsed.Year(), parsed.Month(), 1, 0, 0, 0, 0, time.UTC)
	return monthStart, monthStart.AddDate(0, 1, 0), nil
}

func normalizeNotificationTestUserIDs(rawUserIDs []string) ([]string, error) {
	userIDs := make([]string, 0, len(rawUserIDs))
	seen := map[string]struct{}{}
	for _, rawUserID := range rawUserIDs {
		userID := strings.TrimSpace(rawUserID)
		if userID == "" {
			continue
		}
		if len(userID) > 100 {
			return nil, fmt.Errorf("userId must be 100 characters or fewer")
		}
		if _, ok := seen[userID]; ok {
			continue
		}
		seen[userID] = struct{}{}
		userIDs = append(userIDs, userID)
	}
	if len(userIDs) == 0 {
		return nil, fmt.Errorf("at least one userId is required")
	}
	if len(userIDs) > 25 {
		return nil, fmt.Errorf("no more than 25 userIds can be tested at once")
	}
	return userIDs, nil
}

func previousCalendarMonthBounds(now time.Time) (time.Time, time.Time) {
	utc := now.UTC()
	currentMonthStart := time.Date(utc.Year(), utc.Month(), 1, 0, 0, 0, 0, time.UTC)
	previousMonthStart := currentMonthStart.AddDate(0, -1, 0)
	return previousMonthStart, currentMonthStart
}

func monthlyFriendsActivityDeliveryKey(userID string, monthStart time.Time) string {
	return fmt.Sprintf("%s:%s:%s", monthlyFriendsActivitySignalType, monthStart.UTC().Format("2006-01"), strings.TrimSpace(userID))
}

func durableNotificationDeliveryKey(
	signalType string,
	sourceRecordID string,
	userID string,
	idempotencyKey string,
) string {
	trimmedIdempotencyKey := strings.TrimSpace(idempotencyKey)
	if trimmedIdempotencyKey != "" {
		return fmt.Sprintf(
			"%s:%s:%s:%s",
			strings.TrimSpace(signalType),
			strings.TrimSpace(sourceRecordID),
			strings.TrimSpace(userID),
			trimmedIdempotencyKey,
		)
	}

	return fmt.Sprintf(
		"%s:%s:%s:%d",
		strings.TrimSpace(signalType),
		strings.TrimSpace(sourceRecordID),
		strings.TrimSpace(userID),
		time.Now().UTC().UnixNano(),
	)
}

func billOwedNotificationIntentDeliveryKey(
	billID string,
	userID string,
	idempotencyKey string,
) string {
	return fmt.Sprintf(
		"%s:intent:%s:%s:%s",
		billOwedNotificationSignalType,
		strings.TrimSpace(billID),
		strings.TrimSpace(userID),
		strings.TrimSpace(idempotencyKey),
	)
}

func formatPocketBaseDateTime(value time.Time) string {
	return value.UTC().Format("2006-01-02 15:04:05.000Z")
}

type tastingInviteNotificationReservation struct {
	LogID       string
	SessionID   string
	ActorUserID string
	UserID      string
	DeliveryKey string
}

func reserveTastingInviteNotifications(
	app core.App,
	sessionID string,
	actorUserID string,
	invitedUserIDs []string,
	idempotencyKey string,
) ([]tastingInviteNotificationReservation, error) {
	reservations := make([]tastingInviteNotificationReservation, 0, len(invitedUserIDs))
	for _, rawUserID := range invitedUserIDs {
		userID := strings.TrimSpace(rawUserID)
		if userID == "" {
			continue
		}
		deliveryKey := durableNotificationDeliveryKey(
			tastingInviteNotificationSignalType,
			sessionID,
			userID,
			idempotencyKey,
		)
		logRecord, created, err := createNotificationDeliveryLogRecordOnce(app, notificationDeliveryLogInput{
			UserID:           userID,
			SignalType:       tastingInviteNotificationSignalType,
			SourceCollection: "tasting_sessions",
			SourceRecord:     strings.TrimSpace(sessionID),
			ActorUserID:      strings.TrimSpace(actorUserID),
			DeliveryKey:      deliveryKey,
			Status:           "provider_failed",
			ErrorCode:        "delivery_reserved",
		})
		if err != nil {
			return nil, err
		}
		if !created || logRecord == nil {
			return nil, fmt.Errorf("tasting invite delivery was already reserved")
		}
		reservations = append(reservations, tastingInviteNotificationReservation{
			LogID:       logRecord.Id,
			SessionID:   strings.TrimSpace(sessionID),
			ActorUserID: strings.TrimSpace(actorUserID),
			UserID:      userID,
			DeliveryKey: deliveryKey,
		})
	}
	return reservations, nil
}

func deliverReservedTastingInviteNotifications(
	app core.App,
	reservations []tastingInviteNotificationReservation,
) error {
	for _, reservation := range reservations {
		if _, err := deliverTastingInviteNotification(
			app,
			reservation.SessionID,
			reservation.ActorUserID,
			reservation.UserID,
			"",
			&reservation,
		); err != nil {
			return err
		}
	}
	return nil
}

func deliverTastingInviteNotifications(
	app core.App,
	sessionID string,
	actorUserID string,
	invitedUserIDs []string,
	idempotencyKey string,
) error {
	if len(invitedUserIDs) == 0 {
		return nil
	}

	sessionRecord, err := app.FindRecordById("tasting_sessions", strings.TrimSpace(sessionID))
	if err != nil {
		return err
	}
	seen := map[string]struct{}{}
	for _, rawUserID := range invitedUserIDs {
		userID := strings.TrimSpace(rawUserID)
		if userID == "" {
			continue
		}
		if _, ok := seen[userID]; ok {
			continue
		}
		seen[userID] = struct{}{}

		if _, err := deliverTastingInviteNotification(
			app,
			sessionRecord.Id,
			actorUserID,
			userID,
			idempotencyKey,
			nil,
		); err != nil {
			return err
		}
	}

	return nil
}

func deliverTastingInviteNotification(
	app core.App,
	sessionID string,
	actorUserID string,
	userID string,
	idempotencyKey string,
	reservation *tastingInviteNotificationReservation,
) (string, error) {
	deliveryKey := ""
	if reservation != nil {
		deliveryKey = strings.TrimSpace(reservation.DeliveryKey)
	} else {
		deliveryKey = durableNotificationDeliveryKey(
			tastingInviteNotificationSignalType,
			sessionID,
			userID,
			idempotencyKey,
		)
	}
	baseLog := notificationDeliveryLogInput{
		UserID:           userID,
		SignalType:       tastingInviteNotificationSignalType,
		SourceCollection: "tasting_sessions",
		SourceRecord:     sessionID,
		ActorUserID:      actorUserID,
		DeliveryKey:      deliveryKey,
	}
	var logRecord *core.Record
	if reservation != nil {
		reservedRecord, err := app.FindRecordById("notification_delivery_logs", strings.TrimSpace(reservation.LogID))
		if err != nil {
			return "", err
		}
		if strings.TrimSpace(reservedRecord.GetString("delivery_key")) != deliveryKey ||
			strings.TrimSpace(reservedRecord.GetString("actor")) != strings.TrimSpace(actorUserID) ||
			strings.TrimSpace(reservedRecord.GetString("user")) != strings.TrimSpace(userID) {
			return "", fmt.Errorf("invalid tasting invite delivery reservation")
		}
		logRecord = reservedRecord
	} else if strings.TrimSpace(idempotencyKey) != "" {
		alreadyReserved, err := hasNotificationDeliveryLogWithKey(app, deliveryKey)
		if err != nil {
			return "", err
		}
		if alreadyReserved {
			return "already_processed", nil
		}
	}
	persistSkippedStatus := func(status string) error {
		baseLog.Status = status
		if logRecord != nil {
			return updateNotificationDeliveryLogAfterSend(app, logRecord, notificationDeliveryLogSendUpdate{
				Status:      status,
				DeliveryKey: deliveryKey,
			})
		}
		_, _, err := createNotificationDeliveryLogRecordOnce(app, baseLog)
		return err
	}

	if strings.TrimSpace(actorUserID) != "" && strings.TrimSpace(actorUserID) == strings.TrimSpace(userID) {
		return "skipped_actor", persistSkippedStatus("skipped_actor")
	}

	enabled, err := isTastingInviteNotificationPreferenceEnabled(app, userID)
	if err != nil {
		return "", err
	}
	if !enabled {
		return "skipped_preference_disabled", persistSkippedStatus("skipped_preference_disabled")
	}

	devices, err := listActiveNotificationDevices(app, userID)
	if err != nil {
		return "", err
	}
	if len(devices) == 0 {
		return "skipped_no_active_device", persistSkippedStatus("skipped_no_active_device")
	}

	if logRecord == nil {
		baseLog.Status = "provider_failed"
		baseLog.ErrorCode = "delivery_reserved"
		var created bool
		logRecord, created, err = createNotificationDeliveryLogRecordOnce(app, baseLog)
		if err != nil {
			return "", err
		}
		if !created {
			return "already_processed", nil
		}
	}

	payload := remoteDeviceNotificationPayloadForSignal(remoteNotificationSignalPayloadInput{
		SignalType: tastingInviteNotificationSignalType,
		SessionID:  sessionID,
	})

	sendResult := sendRemoteNotificationToActiveDevices(app, devices, payload)
	if sendResult.Err != nil {
		if err := updateNotificationDeliveryLogAfterSend(app, logRecord, notificationDeliveryLogSendUpdate{
			Status:               "provider_failed",
			DeviceCount:          sendResult.DeviceCount,
			ErrorCode:            sendResult.ErrorCode,
			NotificationDeviceID: sendResult.NotificationDeviceID,
			ProviderMessageID:    sendResult.ProviderMessageID,
		}); err != nil {
			return "", err
		}
		return "provider_failed", createNotificationDeliveryReceiptRecords(app, logRecord.Id, sendResult.Receipts)
	}

	if err := updateNotificationDeliveryLogAfterSend(app, logRecord, notificationDeliveryLogSendUpdate{
		Status:               "sent",
		DeviceCount:          sendResult.DeviceCount,
		NotificationDeviceID: sendResult.NotificationDeviceID,
		ProviderMessageID:    sendResult.ProviderMessageID,
	}); err != nil {
		return "", err
	}
	return "sent", createNotificationDeliveryReceiptRecords(app, logRecord.Id, sendResult.Receipts)
}

func deliverBillOwedNotifications(app core.App, input billOwedNotificationSignalInput) error {
	billID := strings.TrimSpace(input.BillID)
	if billID == "" {
		return nil
	}

	recipientUserIDs := billOwedNotificationRecipientUserIDs(input)
	if strings.TrimSpace(input.IdempotencyKey) != "" {
		persistedRecipientUserIDs, err := billOwedNotificationIntentRecipientUserIDs(app, input)
		if err != nil {
			return err
		}
		if len(persistedRecipientUserIDs) > 0 {
			recipientUserIDs = persistedRecipientUserIDs
		}
	}
	if len(recipientUserIDs) == 0 {
		return nil
	}

	for _, userID := range recipientUserIDs {
		if _, err := deliverBillOwedNotification(
			app,
			billID,
			input.ActorUserID,
			userID,
			input.IdempotencyKey,
		); err != nil {
			return err
		}
	}

	return nil
}

func reserveBillOwedNotificationIntents(app core.App, input billOwedNotificationSignalInput) error {
	idempotencyKey := strings.TrimSpace(input.IdempotencyKey)
	if idempotencyKey == "" {
		return nil
	}

	for _, userID := range billOwedNotificationRecipientUserIDs(input) {
		_, _, err := createNotificationDeliveryLogRecordOnce(app, notificationDeliveryLogInput{
			UserID:           userID,
			SignalType:       billOwedNotificationSignalType,
			SourceCollection: "bills",
			SourceRecord:     strings.TrimSpace(input.BillID),
			ActorUserID:      strings.TrimSpace(input.ActorUserID),
			DeliveryKey: billOwedNotificationIntentDeliveryKey(
				input.BillID,
				userID,
				idempotencyKey,
			),
			Status:    "provider_failed",
			ErrorCode: "delivery_intent",
		})
		if err != nil {
			return err
		}
	}

	return nil
}

func billOwedNotificationIntentRecipientUserIDs(
	app core.App,
	input billOwedNotificationSignalInput,
) ([]string, error) {
	idempotencyKey := strings.TrimSpace(input.IdempotencyKey)
	if idempotencyKey == "" {
		return nil, nil
	}

	recipients := []string{}
	seen := map[string]struct{}{}
	actorUserID := strings.TrimSpace(input.ActorUserID)
	for _, participant := range input.NextParticipants {
		userID := strings.TrimSpace(participant.UserID)
		if userID == "" || userID == actorUserID || !billParticipantOwesMoney(participant) {
			continue
		}
		if _, alreadyIncluded := seen[userID]; alreadyIncluded {
			continue
		}

		hasIntent, err := hasNotificationDeliveryLogWithKey(
			app,
			billOwedNotificationIntentDeliveryKey(input.BillID, userID, idempotencyKey),
		)
		if err != nil {
			return nil, err
		}
		if !hasIntent {
			continue
		}

		seen[userID] = struct{}{}
		recipients = append(recipients, userID)
	}

	return recipients, nil
}

func billOwedNotificationRecipientUserIDs(input billOwedNotificationSignalInput) []string {
	previousOwingUsers := map[string]struct{}{}
	for _, participant := range input.PreviousParticipants {
		userID := strings.TrimSpace(participant.UserID)
		if userID == "" || !billParticipantOwesMoney(participant) {
			continue
		}
		previousOwingUsers[userID] = struct{}{}
	}

	recipients := []string{}
	seen := map[string]struct{}{}
	actorUserID := strings.TrimSpace(input.ActorUserID)
	for _, participant := range input.NextParticipants {
		userID := strings.TrimSpace(participant.UserID)
		if userID == "" || userID == actorUserID || !billParticipantOwesMoney(participant) {
			continue
		}
		if _, alreadyOwed := previousOwingUsers[userID]; alreadyOwed {
			continue
		}
		if _, alreadyQueued := seen[userID]; alreadyQueued {
			continue
		}
		seen[userID] = struct{}{}
		recipients = append(recipients, userID)
	}

	return recipients
}

func billParticipantOwesMoney(participant billNotificationParticipantSignal) bool {
	return sanitizeCurrency(participant.AmountOwed) > 0 && normalizePaidStatus(participant.PaidStatus) == "pending"
}

func deliverBillOwedNotification(
	app core.App,
	billID string,
	actorUserID string,
	userID string,
	idempotencyKey string,
) (string, error) {
	trimmedUserID := strings.TrimSpace(userID)
	deliveryKey := durableNotificationDeliveryKey(
		billOwedNotificationSignalType,
		billID,
		trimmedUserID,
		idempotencyKey,
	)
	baseLog := notificationDeliveryLogInput{
		UserID:           trimmedUserID,
		SignalType:       billOwedNotificationSignalType,
		SourceCollection: "bills",
		SourceRecord:     billID,
		ActorUserID:      actorUserID,
		DeliveryKey:      deliveryKey,
	}
	if strings.TrimSpace(idempotencyKey) != "" {
		alreadyReserved, err := hasNotificationDeliveryLogWithKey(app, deliveryKey)
		if err != nil {
			return "", err
		}
		if alreadyReserved {
			return "already_processed", nil
		}
	}

	if strings.TrimSpace(actorUserID) != "" && strings.TrimSpace(actorUserID) == trimmedUserID {
		baseLog.Status = "skipped_actor"
		_, _, err := createNotificationDeliveryLogRecordOnce(app, baseLog)
		return baseLog.Status, err
	}

	enabled, err := isBillOwedNotificationPreferenceEnabled(app, trimmedUserID)
	if err != nil {
		return "", err
	}
	if !enabled {
		baseLog.Status = "skipped_preference_disabled"
		_, _, err := createNotificationDeliveryLogRecordOnce(app, baseLog)
		return baseLog.Status, err
	}

	devices, err := listActiveNotificationDevices(app, trimmedUserID)
	if err != nil {
		return "", err
	}
	if len(devices) == 0 {
		baseLog.Status = "skipped_no_active_device"
		_, _, err := createNotificationDeliveryLogRecordOnce(app, baseLog)
		return baseLog.Status, err
	}

	baseLog.Status = "provider_failed"
	baseLog.ErrorCode = "delivery_reserved"
	logRecord, created, err := createNotificationDeliveryLogRecordOnce(app, baseLog)
	if err != nil {
		return "", err
	}
	if !created {
		return "already_processed", nil
	}

	payload := remoteDeviceNotificationPayloadForSignal(remoteNotificationSignalPayloadInput{
		SignalType: billOwedNotificationSignalType,
		BillID:     billID,
	})

	sendResult := sendRemoteNotificationToActiveDevices(app, devices, payload)
	if sendResult.Err != nil {
		if err := updateNotificationDeliveryLogAfterSend(app, logRecord, notificationDeliveryLogSendUpdate{
			Status:               "provider_failed",
			DeviceCount:          sendResult.DeviceCount,
			ErrorCode:            sendResult.ErrorCode,
			NotificationDeviceID: sendResult.NotificationDeviceID,
			ProviderMessageID:    sendResult.ProviderMessageID,
		}); err != nil {
			return "", err
		}
		return "provider_failed", createNotificationDeliveryReceiptRecords(app, logRecord.Id, sendResult.Receipts)
	}

	if err := updateNotificationDeliveryLogAfterSend(app, logRecord, notificationDeliveryLogSendUpdate{
		Status:               "sent",
		DeviceCount:          sendResult.DeviceCount,
		NotificationDeviceID: sendResult.NotificationDeviceID,
		ProviderMessageID:    sendResult.ProviderMessageID,
	}); err != nil {
		return "", err
	}
	return "sent", createNotificationDeliveryReceiptRecords(app, logRecord.Id, sendResult.Receipts)
}

func deliverBillPaymentReminder(app core.App, input billPaymentReminderInput) (billPaymentReminderResult, error) {
	billID := strings.TrimSpace(input.BillID)
	participantID := strings.TrimSpace(input.ParticipantID)
	actorUserID := strings.TrimSpace(input.ActorUserID)
	recipientID := strings.TrimSpace(input.RecipientID)

	deliveryKey := billPaymentReminderDeliveryAttemptKey(participantID, recipientID)
	baseLog := notificationDeliveryLogInput{
		UserID:           recipientID,
		SignalType:       billPaymentReminderSignalType,
		SourceCollection: "bill_participants",
		SourceRecord:     participantID,
		ActorUserID:      actorUserID,
		DeliveryKey:      deliveryKey,
	}

	if billID == "" || participantID == "" || recipientID == "" {
		return billPaymentReminderResult{}, nil
	}

	wasSentThisWeek, err := hasRecentBillPaymentReminderDelivery(app, participantID, recipientID, time.Now().UTC().AddDate(0, 0, -7))
	if err != nil {
		return billPaymentReminderResult{}, err
	}
	if wasSentThisWeek {
		baseLog.Status = "skipped_rate_limited"
		if err := createNotificationDeliveryLog(app, baseLog); err != nil {
			return billPaymentReminderResult{}, err
		}
		return billPaymentReminderResult{Status: "skipped_rate_limited"}, nil
	}

	enabled, err := isBillOwedNotificationPreferenceEnabled(app, recipientID)
	if err != nil {
		return billPaymentReminderResult{}, err
	}
	if !enabled {
		baseLog.Status = "skipped_preference_disabled"
		if err := createNotificationDeliveryLog(app, baseLog); err != nil {
			return billPaymentReminderResult{}, err
		}
		return billPaymentReminderResult{Status: "skipped_preference_disabled"}, nil
	}

	devices, err := listActiveNotificationDevices(app, recipientID)
	if err != nil {
		return billPaymentReminderResult{}, err
	}
	if len(devices) == 0 {
		baseLog.Status = "skipped_no_active_device"
		if err := createNotificationDeliveryLog(app, baseLog); err != nil {
			return billPaymentReminderResult{}, err
		}
		return billPaymentReminderResult{Status: "skipped_no_active_device"}, nil
	}

	baseLog.Status = "sent"
	baseLog.DeliveryKey = billPaymentReminderReservationDeliveryKey(participantID, recipientID)
	logRecord, err := createNotificationDeliveryLogRecord(app, baseLog)
	if err != nil {
		if isUniqueConstraintError(err) {
			return billPaymentReminderResult{Status: "skipped_rate_limited"}, nil
		}
		return billPaymentReminderResult{}, err
	}

	payload := remoteDeviceNotificationPayloadForSignal(remoteNotificationSignalPayloadInput{
		SignalType: billPaymentReminderSignalType,
		BillID:     billID,
	})

	sendResult := sendRemoteNotificationToActiveDevices(app, devices, payload)
	if sendResult.Err != nil {
		if err := updateNotificationDeliveryLogAfterSend(app, logRecord, notificationDeliveryLogSendUpdate{
			DeliveryKey:          billPaymentReminderDeliveryAttemptKey(participantID, recipientID),
			Status:               "provider_failed",
			DeviceCount:          sendResult.DeviceCount,
			ErrorCode:            sendResult.ErrorCode,
			NotificationDeviceID: sendResult.NotificationDeviceID,
			ProviderMessageID:    sendResult.ProviderMessageID,
		}); err != nil {
			return billPaymentReminderResult{}, err
		}
		if err := createNotificationDeliveryReceiptRecords(app, logRecord.Id, sendResult.Receipts); err != nil {
			return billPaymentReminderResult{}, err
		}
		return billPaymentReminderResult{Status: "provider_failed"}, nil
	}

	if err := updateNotificationDeliveryLogAfterSend(app, logRecord, notificationDeliveryLogSendUpdate{
		DeliveryKey:          billPaymentReminderDeliveryAttemptKey(participantID, recipientID),
		Status:               "sent",
		DeviceCount:          sendResult.DeviceCount,
		NotificationDeviceID: sendResult.NotificationDeviceID,
		ProviderMessageID:    sendResult.ProviderMessageID,
	}); err != nil {
		return billPaymentReminderResult{}, err
	}
	if err := createNotificationDeliveryReceiptRecords(app, logRecord.Id, sendResult.Receipts); err != nil {
		return billPaymentReminderResult{}, err
	}
	return billPaymentReminderResult{Status: "sent"}, nil
}

func remoteDeviceNotificationPayloadForSignal(input remoteNotificationSignalPayloadInput) RemoteDeviceNotificationPayload {
	switch strings.TrimSpace(input.SignalType) {
	case tastingInviteNotificationSignalType:
		return RemoteDeviceNotificationPayload{
			Title: "Tasting invite",
			Body:  "You have a new tasting invite.",
			Data: map[string]any{
				"notificationType": tastingInviteNotificationSignalType,
				"sessionId":        strings.TrimSpace(input.SessionID),
				"route":            "TastingSessions",
			},
		}
	case billOwedNotificationSignalType:
		return RemoteDeviceNotificationPayload{
			Title: "Bill split update",
			Body:  "You have a bill update.",
			Data: map[string]any{
				"billId":           strings.TrimSpace(input.BillID),
				"notificationType": billOwedNotificationSignalType,
				"route":            "Bills",
			},
		}
	case billPaymentReminderSignalType:
		return RemoteDeviceNotificationPayload{
			Title: "Bill payment reminder",
			Body:  "You have a payment reminder.",
			Data: map[string]any{
				"billId":           strings.TrimSpace(input.BillID),
				"notificationType": billPaymentReminderSignalType,
				"route":            "BillDetail",
			},
		}
	case monthlyFriendsActivitySignalType:
		return RemoteDeviceNotificationPayload{
			Title: "Friends were active",
			Body:  "Your friends added restaurant visits last month.",
			Data: map[string]any{
				"feedMode":         "friends",
				"notificationType": monthlyFriendsActivitySignalType,
				"period":           strings.TrimSpace(input.Period),
				"route":            "Home",
			},
		}
	default:
		return RemoteDeviceNotificationPayload{
			Title: "Food Tracker update",
			Body:  "Open Food Tracker to view the update.",
			Data: map[string]any{
				"notificationType": strings.TrimSpace(input.SignalType),
			},
		}
	}
}

type notificationDeliveryLogInput struct {
	UserID               string
	SignalType           string
	SourceCollection     string
	SourceRecord         string
	ActorUserID          string
	DeliveryKey          string
	Status               string
	DeviceCount          int
	NotificationDeviceID string
	ProviderMessageID    string
	ErrorCode            string
}

type notificationDeliveryLogSendUpdate struct {
	DeliveryKey          string
	Status               string
	DeviceCount          int
	NotificationDeviceID string
	ProviderMessageID    string
	ErrorCode            string
}

func createNotificationDeliveryLog(app core.App, input notificationDeliveryLogInput) error {
	_, err := createNotificationDeliveryLogRecord(app, input)
	return err
}

func createNotificationDeliveryLogWithReceipts(
	app core.App,
	input notificationDeliveryLogInput,
	sendResult remoteNotificationSendResult,
) error {
	if strings.TrimSpace(input.ProviderMessageID) == "" {
		input.ProviderMessageID = sendResult.ProviderMessageID
	}
	if strings.TrimSpace(input.NotificationDeviceID) == "" {
		input.NotificationDeviceID = sendResult.NotificationDeviceID
	}

	logRecord, err := createNotificationDeliveryLogRecord(app, input)
	if err != nil {
		return err
	}
	return createNotificationDeliveryReceiptRecords(app, logRecord.Id, sendResult.Receipts)
}

func createNotificationDeliveryLogRecord(app core.App, input notificationDeliveryLogInput) (*core.Record, error) {
	collection, err := app.FindCollectionByNameOrId("notification_delivery_logs")
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	record.Set("user", input.UserID)
	record.Set("signal_type", input.SignalType)
	record.Set("source_collection", input.SourceCollection)
	record.Set("source_record", input.SourceRecord)
	record.Set("delivery_key", input.DeliveryKey)
	record.Set("status", input.Status)
	record.Set("device_count", input.DeviceCount)
	if strings.TrimSpace(input.ActorUserID) != "" {
		record.Set("actor", input.ActorUserID)
	}
	if strings.TrimSpace(input.ProviderMessageID) != "" {
		record.Set("provider_message_id", input.ProviderMessageID)
	}
	if strings.TrimSpace(input.NotificationDeviceID) != "" {
		record.Set("notification_device", input.NotificationDeviceID)
		record.Set("receipt_status", "pending")
		record.Set("receipt_next_check_at", time.Now().UTC().Add(notificationReceiptPendingDelay))
	}
	record.Set("error_code", input.ErrorCode)
	if err := app.Save(record); err != nil {
		return nil, err
	}
	return record, nil
}

func createNotificationDeliveryLogRecordOnce(
	app core.App,
	input notificationDeliveryLogInput,
) (*core.Record, bool, error) {
	record, err := createNotificationDeliveryLogRecord(app, input)
	if err != nil {
		if isUniqueConstraintError(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return record, true, nil
}

func updateNotificationDeliveryLogAfterSend(app core.App, record *core.Record, input notificationDeliveryLogSendUpdate) error {
	if strings.TrimSpace(input.DeliveryKey) != "" {
		record.Set("delivery_key", input.DeliveryKey)
	}
	record.Set("status", input.Status)
	record.Set("device_count", input.DeviceCount)
	if strings.TrimSpace(input.ProviderMessageID) != "" {
		record.Set("provider_message_id", input.ProviderMessageID)
	}
	if strings.TrimSpace(input.NotificationDeviceID) != "" {
		record.Set("notification_device", input.NotificationDeviceID)
		record.Set("receipt_status", "pending")
		record.Set("receipt_next_check_at", time.Now().UTC().Add(notificationReceiptPendingDelay))
	}
	record.Set("error_code", input.ErrorCode)
	return app.Save(record)
}

func isTastingInviteNotificationPreferenceEnabled(app core.App, userID string) (bool, error) {
	return isRemoteNotificationPreferenceEnabled(app, userID, remoteNotificationPreferenceTastingInvites)
}

func isBillOwedNotificationPreferenceEnabled(app core.App, userID string) (bool, error) {
	return isRemoteNotificationPreferenceEnabled(app, userID, remoteNotificationPreferenceBills)
}

func isMonthlyFriendsActivityNotificationPreferenceEnabled(app core.App, userID string) (bool, error) {
	return isRemoteNotificationPreferenceEnabled(app, userID, remoteNotificationPreferenceMonthlyFriendsActivity)
}

func isRemoteNotificationPreferenceEnabled(
	app core.App,
	userID string,
	category remoteNotificationPreferenceCategory,
) (bool, error) {
	record, err := app.FindFirstRecordByFilter(
		"notification_preferences",
		"user = {:user}",
		dbx.Params{"user": strings.TrimSpace(userID)},
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return true, nil
		}
		return false, err
	}

	switch category {
	case remoteNotificationPreferenceTastingInvites:
		return record.GetBool("tasting_invites_enabled"), nil
	case remoteNotificationPreferenceBills:
		return record.GetBool("bill_owed_enabled"), nil
	case remoteNotificationPreferenceMonthlyFriendsActivity:
		return record.GetBool("monthly_friends_activity_enabled"), nil
	default:
		return true, nil
	}
}

func hasRecentBillPaymentReminderDelivery(app core.App, participantID string, userID string, since time.Time) (bool, error) {
	if strings.TrimSpace(participantID) == "" || strings.TrimSpace(userID) == "" {
		return false, nil
	}
	availability, err := getBillPaymentReminderAvailability(app, participantID, userID, since.AddDate(0, 0, 7))
	if err != nil {
		return false, err
	}
	return !availability.Available, nil
}

func getBillPaymentReminderAvailability(app core.App, participantID string, userID string, now time.Time) (billPaymentReminderAvailability, error) {
	trimmedParticipantID := strings.TrimSpace(participantID)
	trimmedUserID := strings.TrimSpace(userID)
	if trimmedParticipantID == "" || trimmedUserID == "" {
		return billPaymentReminderAvailability{Available: false}, nil
	}

	cooldownStartsAt := now.UTC().AddDate(0, 0, -7)
	records, err := app.FindRecordsByFilter(
		"notification_delivery_logs",
		"signal_type = {:signalType} && source_collection = 'bill_participants' && source_record = {:participantID} && user = {:user} && status = 'sent' && created >= {:since}",
		"-created",
		1,
		0,
		dbx.Params{
			"signalType":    billPaymentReminderSignalType,
			"participantID": trimmedParticipantID,
			"user":          trimmedUserID,
			"since":         cooldownStartsAt.Format(time.RFC3339Nano),
		},
	)
	if err != nil {
		return billPaymentReminderAvailability{}, err
	}
	if len(records) == 0 {
		return billPaymentReminderAvailability{Available: true}, nil
	}

	sentAt := records[0].GetDateTime("created")
	if sentAt.IsZero() {
		return billPaymentReminderAvailability{Available: true}, nil
	}

	availableAt := sentAt.Time().UTC().AddDate(0, 0, 7)
	if !availableAt.After(now.UTC()) {
		return billPaymentReminderAvailability{Available: true}, nil
	}

	availableAtText := availableAt.Format(time.RFC3339Nano)
	return billPaymentReminderAvailability{
		Available:   false,
		AvailableAt: &availableAtText,
	}, nil
}

func hasNotificationDeliveryLogWithKey(app core.App, deliveryKey string) (bool, error) {
	records, err := app.FindRecordsByFilter(
		"notification_delivery_logs",
		"delivery_key = {:deliveryKey}",
		"",
		1,
		0,
		dbx.Params{"deliveryKey": strings.TrimSpace(deliveryKey)},
	)
	if err != nil {
		return false, err
	}
	return len(records) > 0, nil
}

func billPaymentReminderReservationDeliveryKey(participantID string, recipientID string) string {
	return fmt.Sprintf("%s:%s:%s", billPaymentReminderSignalType, strings.TrimSpace(participantID), strings.TrimSpace(recipientID))
}

func billPaymentReminderDeliveryAttemptKey(participantID string, recipientID string) string {
	return fmt.Sprintf("%s:%s:%s:%d", billPaymentReminderSignalType, strings.TrimSpace(participantID), strings.TrimSpace(recipientID), time.Now().UTC().UnixNano())
}

func listActiveNotificationDevices(app core.App, userID string) ([]*core.Record, error) {
	trimmedUserID := strings.TrimSpace(userID)
	user, err := app.FindRecordById("users", trimmedUserID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return []*core.Record{}, nil
		}
		return nil, err
	}
	currentAuthTokenKeyHash := hashNotificationDeviceSecret(user.TokenKey())
	records, err := app.FindRecordsByFilter(
		"notification_devices",
		"user = {:user} && active = true",
		"updated",
		100,
		0,
		dbx.Params{"user": trimmedUserID},
	)
	if err != nil {
		return nil, err
	}

	eligible := make([]*core.Record, 0, len(records))
	for _, record := range records {
		registeredAuthTokenKeyHash := record.GetString("auth_token_key_hash")
		if registeredAuthTokenKeyHash == "" || subtle.ConstantTimeCompare(
			[]byte(registeredAuthTokenKeyHash),
			[]byte(currentAuthTokenKeyHash),
		) != 1 {
			if err := deactivateNotificationDeviceRecord(app, record); err != nil {
				return nil, err
			}
			continue
		}
		eligible = append(eligible, record)
	}

	return eligible, nil
}

type remoteNotificationSendResult struct {
	ProviderMessageID    string
	NotificationDeviceID string
	Receipts             []remoteNotificationReceiptInput
	DeviceCount          int
	ErrorCode            string
	Err                  error
}

type remoteNotificationReceiptInput struct {
	NotificationDeviceID string
	ProviderMessageID    string
}

func sendRemoteNotificationToActiveDevices(
	app core.App,
	devices []*core.Record,
	payload RemoteDeviceNotificationPayload,
) remoteNotificationSendResult {
	var providerMessageID string
	var notificationDeviceID string
	receipts := make([]remoteNotificationReceiptInput, 0, len(devices))
	seenPushTokens := map[string]struct{}{}
	deviceCount := 0
	for _, device := range devices {
		pushToken := strings.TrimSpace(device.GetString("push_token"))
		if pushToken == "" {
			continue
		}
		if _, alreadyQueued := seenPushTokens[pushToken]; alreadyQueued {
			if err := deactivateNotificationDeviceRecord(app, device); err != nil {
				return remoteNotificationSendResult{
					ProviderMessageID:    providerMessageID,
					NotificationDeviceID: notificationDeviceID,
					Receipts:             receipts,
					DeviceCount:          deviceCount,
					ErrorCode:            "duplicate_push_token_cleanup_failed",
					Err:                  err,
				}
			}
			continue
		}
		seenPushTokens[pushToken] = struct{}{}

		deviceCount++
		messageID, err := activeNotificationPushSender.SendRemoteDeviceNotification(pushToken, payload)
		if err != nil {
			errorCode := normalizeProviderErrorCode(err, payload)
			if isInvalidProviderTokenErrorCode(errorCode) {
				if deactivateErr := deactivateNotificationDeviceRecord(app, device); deactivateErr != nil {
					return remoteNotificationSendResult{
						ProviderMessageID:    providerMessageID,
						NotificationDeviceID: notificationDeviceID,
						Receipts:             receipts,
						DeviceCount:          deviceCount,
						ErrorCode:            errorCode,
						Err:                  deactivateErr,
					}
				}
			}
			return remoteNotificationSendResult{
				ProviderMessageID:    providerMessageID,
				NotificationDeviceID: notificationDeviceID,
				Receipts:             receipts,
				DeviceCount:          deviceCount,
				ErrorCode:            errorCode,
				Err:                  err,
			}
		}
		if providerMessageID == "" {
			providerMessageID = messageID
			notificationDeviceID = device.Id
		}
		if strings.TrimSpace(messageID) != "" {
			receipts = append(receipts, remoteNotificationReceiptInput{
				NotificationDeviceID: device.Id,
				ProviderMessageID:    messageID,
			})
		}
	}
	return remoteNotificationSendResult{
		ProviderMessageID:    providerMessageID,
		NotificationDeviceID: notificationDeviceID,
		Receipts:             receipts,
		DeviceCount:          deviceCount,
	}
}

func createNotificationDeliveryReceiptRecords(
	app core.App,
	deliveryLogID string,
	receipts []remoteNotificationReceiptInput,
) error {
	if strings.TrimSpace(deliveryLogID) == "" || len(receipts) == 0 {
		return nil
	}
	collection, err := app.FindCollectionByNameOrId("notification_delivery_receipts")
	if err != nil {
		return err
	}
	nextCheckAt := time.Now().UTC().Add(notificationReceiptPendingDelay)
	for _, input := range receipts {
		if strings.TrimSpace(input.NotificationDeviceID) == "" || strings.TrimSpace(input.ProviderMessageID) == "" {
			continue
		}
		record := core.NewRecord(collection)
		record.Set("notification_delivery_log", deliveryLogID)
		record.Set("notification_device", input.NotificationDeviceID)
		record.Set("provider_message_id", input.ProviderMessageID)
		record.Set("receipt_status", "pending")
		record.Set("receipt_next_check_at", nextCheckAt)
		if err := app.Save(record); err != nil {
			return err
		}
	}
	return nil
}

func deactivateNotificationDeviceRecord(app core.App, record *core.Record) error {
	record.Set("active", false)
	record.Set("last_seen_at", time.Now().UTC())
	return app.Save(record)
}

func deactivateOtherNotificationDevicesForRegistration(app core.App, userID string, deviceID string, pushToken string) error {
	records, err := app.FindRecordsByFilter(
		"notification_devices",
		"active = true && ((user != {:user} && (device_id = {:deviceID} || push_token = {:pushToken})) || (user = {:user} && device_id != {:deviceID} && push_token = {:pushToken}))",
		"",
		100,
		0,
		dbx.Params{
			"deviceID":  strings.TrimSpace(deviceID),
			"pushToken": strings.TrimSpace(pushToken),
			"user":      strings.TrimSpace(userID),
		},
	)
	if err != nil {
		return err
	}

	for _, record := range records {
		if err := deactivateNotificationDeviceRecord(app, record); err != nil {
			return err
		}
	}

	return nil
}

func normalizeNotificationDevicePlatform(platform string) string {
	switch strings.TrimSpace(strings.ToLower(platform)) {
	case "ios", "android", "web":
		return strings.TrimSpace(strings.ToLower(platform))
	default:
		return "unknown"
	}
}

func normalizeNotificationDeviceRevocationCredentials(capability string, revocationID string) (string, string, error) {
	trimmedCapability := strings.TrimSpace(capability)
	trimmedRevocationID := strings.TrimSpace(revocationID)
	if trimmedCapability == "" && trimmedRevocationID == "" {
		return "", "", nil
	}
	if !notificationDeviceRevocationValuePattern.MatchString(trimmedCapability) ||
		!notificationDeviceRevocationValuePattern.MatchString(trimmedRevocationID) {
		return "", "", errors.New("revocationCapability and revocationId must be 64 lowercase hexadecimal characters")
	}
	return trimmedCapability, trimmedRevocationID, nil
}

func hashNotificationDeviceSecret(value string) string {
	hash := sha256.Sum256([]byte(strings.TrimSpace(value)))
	return fmt.Sprintf("%x", hash[:])
}

func isInvalidProviderTokenErrorCode(errorCode string) bool {
	normalized := strings.ToLower(strings.TrimSpace(errorCode))
	return strings.Contains(normalized, "devicenotregistered") ||
		strings.Contains(normalized, "not registered") ||
		strings.Contains(normalized, "invalid push token") ||
		strings.Contains(normalized, "invalid token") ||
		strings.Contains(normalized, "unregistered")
}

func normalizeExpoReceiptStatus(status string) string {
	switch strings.TrimSpace(strings.ToLower(status)) {
	case "ok":
		return "ok"
	case "error":
		return "error"
	default:
		return "missing"
	}
}

func normalizeReceiptProviderErrorCode(receipt RemoteDeviceNotificationReceipt) string {
	errorCode := strings.TrimSpace(receipt.ErrorCode)
	if errorCode == "" {
		return "receipt_error"
	}
	errorCode = redactSensitiveProviderErrorText(errorCode, RemoteDeviceNotificationPayload{})
	if len(errorCode) > 100 {
		return errorCode[:100]
	}
	return errorCode
}

func normalizeProviderErrorCode(err error, payload RemoteDeviceNotificationPayload) string {
	message := strings.TrimSpace(err.Error())
	if message == "" {
		return "provider_error"
	}
	message = redactSensitiveProviderErrorText(message, payload)
	if len(message) > 100 {
		return message[:100]
	}
	return message
}

func redactSensitiveProviderErrorText(message string, payload RemoteDeviceNotificationPayload) string {
	redacted := expoPushTokenPattern.ReplaceAllString(message, "[redacted_push_token]")

	if accessToken := resolveExpoPushAccessToken(); accessToken != "" {
		redacted = strings.ReplaceAll(redacted, accessToken, "[redacted_expo_access_token]")
	}
	for _, value := range []string{payload.Title, payload.Body} {
		value = strings.TrimSpace(value)
		if value != "" {
			redacted = strings.ReplaceAll(redacted, value, "[redacted_notification_text]")
		}
	}
	return redacted
}

func resolveExpoPushAccessToken() string {
	return strings.TrimSpace(os.Getenv(expoPushAccessTokenEnvKey))
}

func (sender expoNotificationPushSender) SendRemoteDeviceNotification(token string, payload RemoteDeviceNotificationPayload) (string, error) {
	requestBody := map[string]any{
		"to":    token,
		"title": payload.Title,
		"body":  payload.Body,
		"data":  payload.Data,
	}
	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		return "", err
	}

	client := sender.client
	if client == nil {
		client = http.DefaultClient
	}
	endpoint := strings.TrimSpace(sender.endpoint)
	if endpoint == "" {
		endpoint = expoPushSendEndpoint
	}
	request, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	request.Header.Set("Content-Type", "application/json")
	if accessToken := resolveExpoPushAccessToken(); accessToken != "" {
		request.Header.Set("Authorization", "Bearer "+accessToken)
	}

	response, err := client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	var responseBody struct {
		Data struct {
			ID      string `json:"id"`
			Status  string `json:"status"`
			Message string `json:"message"`
			Details struct {
				Error string `json:"error"`
			} `json:"details"`
		} `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&responseBody); err != nil {
		return "", err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || responseBody.Data.Status == "error" {
		message := responseBody.Data.Message
		if strings.TrimSpace(responseBody.Data.Details.Error) != "" {
			message = responseBody.Data.Details.Error
		}
		if message == "" {
			message = fmt.Sprintf("expo_push_status_%d", response.StatusCode)
		}
		return "", errors.New(message)
	}

	return responseBody.Data.ID, nil
}

func (sender expoNotificationPushSender) CheckRemoteDeviceNotificationReceipts(receiptIDs []string) (map[string]RemoteDeviceNotificationReceipt, error) {
	requestBody := map[string]any{"ids": receiptIDs}
	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		return nil, err
	}

	client := sender.client
	if client == nil {
		client = http.DefaultClient
	}
	endpoint := strings.TrimSpace(sender.receiptsEndpoint)
	if endpoint == "" {
		endpoint = expoPushReceiptsEndpoint
	}
	request, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	if accessToken := resolveExpoPushAccessToken(); accessToken != "" {
		request.Header.Set("Authorization", "Bearer "+accessToken)
	}

	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	var responseBody struct {
		Data map[string]struct {
			Status  string `json:"status"`
			Details struct {
				Error string `json:"error"`
			} `json:"details"`
		} `json:"data"`
		Errors []struct {
			Code string `json:"code"`
		} `json:"errors"`
	}
	if err := json.NewDecoder(response.Body).Decode(&responseBody); err != nil {
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || len(responseBody.Errors) > 0 {
		if len(responseBody.Errors) > 0 && strings.TrimSpace(responseBody.Errors[0].Code) != "" {
			return nil, errors.New(responseBody.Errors[0].Code)
		}
		return nil, fmt.Errorf("expo_push_receipts_status_%d", response.StatusCode)
	}

	receipts := map[string]RemoteDeviceNotificationReceipt{}
	for receiptID, receipt := range responseBody.Data {
		receipts[receiptID] = RemoteDeviceNotificationReceipt{
			Status:    receipt.Status,
			ErrorCode: receipt.Details.Error,
		}
	}
	return receipts, nil
}
