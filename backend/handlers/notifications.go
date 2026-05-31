package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
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
)

type notificationDeviceRegistrationRequest struct {
	DeviceID  string `json:"deviceId"`
	Platform  string `json:"platform"`
	PushToken string `json:"pushToken"`
}

type monthlyFriendsActivityTestRequest struct {
	Force  bool   `json:"force"`
	Month  string `json:"month"`
	UserID string `json:"userId"`
}

type RemoteDeviceNotificationPayload struct {
	Title string         `json:"title"`
	Body  string         `json:"body"`
	Data  map[string]any `json:"data"`
}

type NotificationPushSender interface {
	SendRemoteDeviceNotification(token string, payload RemoteDeviceNotificationPayload) (string, error)
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

type MonthlyFriendsActivityDeliveryResult struct {
	MonthStart time.Time
	MonthEnd   time.Time
	Eligible   int
	Sent       int
	Skipped    int
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
	client *http.Client
}

var activeNotificationPushSender NotificationPushSender = expoNotificationPushSender{
	client: &http.Client{Timeout: 5 * time.Second},
}

func SetNotificationPushSenderForTests(sender NotificationPushSender) func() {
	previous := activeNotificationPushSender
	activeNotificationPushSender = sender
	return func() {
		activeNotificationPushSender = previous
	}
}

func RegisterNotificationHandlers(se *core.ServeEvent, app core.App) {
	if err := RegisterMonthlyFriendsActivityNotificationJob(app); err != nil {
		log.Printf("Warning: failed to register monthly friends activity notification job: %v", err)
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
			return apis.NewBadRequestError("user has no accepted-friend friend-visible visits for that month", nil)
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

		return e.JSON(200, map[string]any{
			"friendCount": candidate.FriendCount,
			"month":       monthStart.Format("2006-01"),
			"status":      status,
			"userId":      candidate.UserID,
			"visitCount":  candidate.VisitCount,
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
		now := time.Now().UTC()

		record, findErr := app.FindFirstRecordByFilter(
			"notification_devices",
			"user = {:user} && device_id = {:deviceID}",
			dbx.Params{"user": authRecord.Id, "deviceID": deviceID},
		)
		if findErr != nil {
			if !errors.Is(findErr, sql.ErrNoRows) {
				return apis.NewApiError(500, "failed to load notification device", findErr)
			}
			collection, collectionErr := app.FindCollectionByNameOrId("notification_devices")
			if collectionErr != nil {
				return apis.NewApiError(500, "internal error", collectionErr)
			}
			record = core.NewRecord(collection)
			record.Set("user", authRecord.Id)
			record.Set("device_id", deviceID)
		}

		record.Set("push_token", pushToken)
		record.Set("platform", platform)
		record.Set("active", true)
		record.Set("last_registered_at", now)
		record.Set("last_seen_at", now)
		if err := app.Save(record); err != nil {
			return apis.NewApiError(500, "failed to save notification device", err)
		}

		return e.JSON(200, map[string]any{"success": true})
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

		record.Set("active", false)
		record.Set("last_seen_at", time.Now().UTC())
		if err := app.Save(record); err != nil {
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

	payload := RemoteDeviceNotificationPayload{
		Title: "Friends were active",
		Body:  monthlyFriendsActivityNotificationBody(candidate),
		Data: map[string]any{
			"feedMode":         "friends",
			"notificationType": monthlyFriendsActivitySignalType,
			"period":           monthStart.Format("2006-01"),
			"route":            "Home",
		},
	}

	var providerMessageID string
	for _, device := range devices {
		messageID, sendErr := activeNotificationPushSender.SendRemoteDeviceNotification(device.GetString("push_token"), payload)
		if sendErr != nil {
			baseLog.Status = "provider_failed"
			baseLog.DeviceCount = len(devices)
			baseLog.ErrorCode = normalizeProviderErrorCode(sendErr)
			if err := createNotificationDeliveryLog(app, baseLog); err != nil {
				return "", err
			}
			return baseLog.Status, nil
		}
		if providerMessageID == "" {
			providerMessageID = messageID
		}
	}

	baseLog.Status = "sent"
	baseLog.DeviceCount = len(devices)
	baseLog.ProviderMessageID = providerMessageID
	if err := createNotificationDeliveryLog(app, baseLog); err != nil {
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

func previousCalendarMonthBounds(now time.Time) (time.Time, time.Time) {
	utc := now.UTC()
	currentMonthStart := time.Date(utc.Year(), utc.Month(), 1, 0, 0, 0, 0, time.UTC)
	previousMonthStart := currentMonthStart.AddDate(0, -1, 0)
	return previousMonthStart, currentMonthStart
}

func monthlyFriendsActivityDeliveryKey(userID string, monthStart time.Time) string {
	return fmt.Sprintf("%s:%s:%s", monthlyFriendsActivitySignalType, monthStart.UTC().Format("2006-01"), strings.TrimSpace(userID))
}

func monthlyFriendsActivityNotificationBody(candidate monthlyFriendsActivityCandidate) string {
	if candidate.FriendCount == 1 {
		return "A friend added restaurant visits last month."
	}
	return "Your friends added restaurant visits last month."
}

func formatPocketBaseDateTime(value time.Time) string {
	return value.UTC().Format("2006-01-02 15:04:05.000Z")
}

func deliverTastingInviteNotifications(app core.App, sessionID string, actorUserID string, invitedUserIDs []string) error {
	if len(invitedUserIDs) == 0 {
		return nil
	}

	sessionRecord, err := app.FindRecordById("tasting_sessions", strings.TrimSpace(sessionID))
	if err != nil {
		return err
	}
	sessionName := strings.TrimSpace(sessionRecord.GetString("name"))
	if sessionName == "" {
		sessionName = "a tasting session"
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

		if err := deliverTastingInviteNotification(app, sessionRecord.Id, sessionName, actorUserID, userID); err != nil {
			return err
		}
	}

	return nil
}

func deliverTastingInviteNotification(app core.App, sessionID string, sessionName string, actorUserID string, userID string) error {
	deliveryKey := fmt.Sprintf("%s:%s:%s:%d", tastingInviteNotificationSignalType, sessionID, strings.TrimSpace(userID), time.Now().UTC().UnixNano())

	if strings.TrimSpace(actorUserID) != "" && strings.TrimSpace(actorUserID) == strings.TrimSpace(userID) {
		return createNotificationDeliveryLog(app, notificationDeliveryLogInput{
			UserID:           userID,
			SignalType:       tastingInviteNotificationSignalType,
			SourceCollection: "tasting_sessions",
			SourceRecord:     sessionID,
			ActorUserID:      actorUserID,
			DeliveryKey:      deliveryKey,
			Status:           "skipped_actor",
		})
	}

	enabled, err := isTastingInviteNotificationPreferenceEnabled(app, userID)
	if err != nil {
		return err
	}
	if !enabled {
		return createNotificationDeliveryLog(app, notificationDeliveryLogInput{
			UserID:           userID,
			SignalType:       tastingInviteNotificationSignalType,
			SourceCollection: "tasting_sessions",
			SourceRecord:     sessionID,
			ActorUserID:      actorUserID,
			DeliveryKey:      deliveryKey,
			Status:           "skipped_preference_disabled",
		})
	}

	devices, err := listActiveNotificationDevices(app, userID)
	if err != nil {
		return err
	}
	if len(devices) == 0 {
		return createNotificationDeliveryLog(app, notificationDeliveryLogInput{
			UserID:           userID,
			SignalType:       tastingInviteNotificationSignalType,
			SourceCollection: "tasting_sessions",
			SourceRecord:     sessionID,
			ActorUserID:      actorUserID,
			DeliveryKey:      deliveryKey,
			Status:           "skipped_no_active_device",
		})
	}

	payload := RemoteDeviceNotificationPayload{
		Title: "Tasting invite",
		Body:  fmt.Sprintf("You were invited to %s.", sessionName),
		Data: map[string]any{
			"notificationType": "tasting_invite",
			"sessionId":        sessionID,
			"route":            "TastingSessions",
		},
	}

	var providerMessageID string
	for _, device := range devices {
		messageID, sendErr := activeNotificationPushSender.SendRemoteDeviceNotification(device.GetString("push_token"), payload)
		if sendErr != nil {
			return createNotificationDeliveryLog(app, notificationDeliveryLogInput{
				UserID:           userID,
				SignalType:       tastingInviteNotificationSignalType,
				SourceCollection: "tasting_sessions",
				SourceRecord:     sessionID,
				ActorUserID:      actorUserID,
				DeliveryKey:      deliveryKey,
				Status:           "provider_failed",
				DeviceCount:      len(devices),
				ErrorCode:        normalizeProviderErrorCode(sendErr),
			})
		}
		if providerMessageID == "" {
			providerMessageID = messageID
		}
	}

	return createNotificationDeliveryLog(app, notificationDeliveryLogInput{
		UserID:            userID,
		SignalType:        tastingInviteNotificationSignalType,
		SourceCollection:  "tasting_sessions",
		SourceRecord:      sessionID,
		ActorUserID:       actorUserID,
		DeliveryKey:       deliveryKey,
		Status:            "sent",
		DeviceCount:       len(devices),
		ProviderMessageID: providerMessageID,
	})
}

func deliverBillOwedNotifications(app core.App, input billOwedNotificationSignalInput) error {
	billID := strings.TrimSpace(input.BillID)
	if billID == "" {
		return nil
	}

	recipientUserIDs := billOwedNotificationRecipientUserIDs(input)
	if len(recipientUserIDs) == 0 {
		return nil
	}

	billTitle := strings.TrimSpace(input.BillTitle)
	if billTitle == "" {
		billTitle = "a bill"
	}

	for _, userID := range recipientUserIDs {
		if err := deliverBillOwedNotification(app, billID, billTitle, input.ActorUserID, userID); err != nil {
			return err
		}
	}

	return nil
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

func deliverBillOwedNotification(app core.App, billID string, billTitle string, actorUserID string, userID string) error {
	trimmedUserID := strings.TrimSpace(userID)
	deliveryKey := fmt.Sprintf("%s:%s:%s:%d", billOwedNotificationSignalType, billID, trimmedUserID, time.Now().UTC().UnixNano())

	if strings.TrimSpace(actorUserID) != "" && strings.TrimSpace(actorUserID) == trimmedUserID {
		return createNotificationDeliveryLog(app, notificationDeliveryLogInput{
			UserID:           trimmedUserID,
			SignalType:       billOwedNotificationSignalType,
			SourceCollection: "bills",
			SourceRecord:     billID,
			ActorUserID:      actorUserID,
			DeliveryKey:      deliveryKey,
			Status:           "skipped_actor",
		})
	}

	enabled, err := isBillOwedNotificationPreferenceEnabled(app, trimmedUserID)
	if err != nil {
		return err
	}
	if !enabled {
		return createNotificationDeliveryLog(app, notificationDeliveryLogInput{
			UserID:           trimmedUserID,
			SignalType:       billOwedNotificationSignalType,
			SourceCollection: "bills",
			SourceRecord:     billID,
			ActorUserID:      actorUserID,
			DeliveryKey:      deliveryKey,
			Status:           "skipped_preference_disabled",
		})
	}

	devices, err := listActiveNotificationDevices(app, trimmedUserID)
	if err != nil {
		return err
	}
	if len(devices) == 0 {
		return createNotificationDeliveryLog(app, notificationDeliveryLogInput{
			UserID:           trimmedUserID,
			SignalType:       billOwedNotificationSignalType,
			SourceCollection: "bills",
			SourceRecord:     billID,
			ActorUserID:      actorUserID,
			DeliveryKey:      deliveryKey,
			Status:           "skipped_no_active_device",
		})
	}

	payload := RemoteDeviceNotificationPayload{
		Title: "Bill split update",
		Body:  fmt.Sprintf("You have a balance due for %s.", billTitle),
		Data: map[string]any{
			"billId":           billID,
			"notificationType": billOwedNotificationSignalType,
			"route":            "Bills",
		},
	}

	var providerMessageID string
	for _, device := range devices {
		messageID, sendErr := activeNotificationPushSender.SendRemoteDeviceNotification(device.GetString("push_token"), payload)
		if sendErr != nil {
			return createNotificationDeliveryLog(app, notificationDeliveryLogInput{
				UserID:           trimmedUserID,
				SignalType:       billOwedNotificationSignalType,
				SourceCollection: "bills",
				SourceRecord:     billID,
				ActorUserID:      actorUserID,
				DeliveryKey:      deliveryKey,
				Status:           "provider_failed",
				DeviceCount:      len(devices),
				ErrorCode:        normalizeProviderErrorCode(sendErr),
			})
		}
		if providerMessageID == "" {
			providerMessageID = messageID
		}
	}

	return createNotificationDeliveryLog(app, notificationDeliveryLogInput{
		UserID:            trimmedUserID,
		SignalType:        billOwedNotificationSignalType,
		SourceCollection:  "bills",
		SourceRecord:      billID,
		ActorUserID:       actorUserID,
		DeliveryKey:       deliveryKey,
		Status:            "sent",
		DeviceCount:       len(devices),
		ProviderMessageID: providerMessageID,
	})
}

func deliverBillPaymentReminder(app core.App, input billPaymentReminderInput) (billPaymentReminderResult, error) {
	billID := strings.TrimSpace(input.BillID)
	billTitle := strings.TrimSpace(input.BillTitle)
	participantID := strings.TrimSpace(input.ParticipantID)
	actorUserID := strings.TrimSpace(input.ActorUserID)
	recipientID := strings.TrimSpace(input.RecipientID)
	if billTitle == "" {
		billTitle = "a bill"
	}

	deliveryKey := fmt.Sprintf("%s:%s:%s:%d", billPaymentReminderSignalType, participantID, recipientID, time.Now().UTC().UnixNano())
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

	payload := RemoteDeviceNotificationPayload{
		Title: "Bill payment reminder",
		Body:  fmt.Sprintf("You have a payment reminder for %s.", billTitle),
		Data: map[string]any{
			"billId":           billID,
			"notificationType": billPaymentReminderSignalType,
			"route":            "BillDetail",
		},
	}

	var providerMessageID string
	for _, device := range devices {
		messageID, sendErr := activeNotificationPushSender.SendRemoteDeviceNotification(device.GetString("push_token"), payload)
		if sendErr != nil {
			baseLog.Status = "provider_failed"
			baseLog.DeviceCount = len(devices)
			baseLog.ErrorCode = normalizeProviderErrorCode(sendErr)
			if err := createNotificationDeliveryLog(app, baseLog); err != nil {
				return billPaymentReminderResult{}, err
			}
			return billPaymentReminderResult{Status: "provider_failed"}, nil
		}
		if providerMessageID == "" {
			providerMessageID = messageID
		}
	}

	baseLog.Status = "sent"
	baseLog.DeviceCount = len(devices)
	baseLog.ProviderMessageID = providerMessageID
	if err := createNotificationDeliveryLog(app, baseLog); err != nil {
		return billPaymentReminderResult{}, err
	}
	return billPaymentReminderResult{Status: "sent"}, nil
}

type notificationDeliveryLogInput struct {
	UserID            string
	SignalType        string
	SourceCollection  string
	SourceRecord      string
	ActorUserID       string
	DeliveryKey       string
	Status            string
	DeviceCount       int
	ProviderMessageID string
	ErrorCode         string
}

func createNotificationDeliveryLog(app core.App, input notificationDeliveryLogInput) error {
	collection, err := app.FindCollectionByNameOrId("notification_delivery_logs")
	if err != nil {
		return err
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
	if strings.TrimSpace(input.ErrorCode) != "" {
		record.Set("error_code", input.ErrorCode)
	}
	return app.Save(record)
}

func isTastingInviteNotificationPreferenceEnabled(app core.App, userID string) (bool, error) {
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
	return record.GetBool("tasting_invites_enabled"), nil
}

func isBillOwedNotificationPreferenceEnabled(app core.App, userID string) (bool, error) {
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
	return record.GetBool("bill_owed_enabled"), nil
}

func isMonthlyFriendsActivityNotificationPreferenceEnabled(app core.App, userID string) (bool, error) {
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
	return record.GetBool("monthly_friends_activity_enabled"), nil
}

func hasRecentBillPaymentReminderDelivery(app core.App, participantID string, userID string, since time.Time) (bool, error) {
	records, err := app.FindRecordsByFilter(
		"notification_delivery_logs",
		"signal_type = {:signalType} && source_collection = 'bill_participants' && source_record = {:participantID} && user = {:user} && status = 'sent' && created >= {:since}",
		"-created",
		1,
		0,
		dbx.Params{
			"signalType":    billPaymentReminderSignalType,
			"participantID": strings.TrimSpace(participantID),
			"user":          strings.TrimSpace(userID),
			"since":         since.Format(time.RFC3339Nano),
		},
	)
	if err != nil {
		return false, err
	}
	return len(records) > 0, nil
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

func listActiveNotificationDevices(app core.App, userID string) ([]*core.Record, error) {
	return app.FindRecordsByFilter(
		"notification_devices",
		"user = {:user} && active = true",
		"updated",
		100,
		0,
		dbx.Params{"user": strings.TrimSpace(userID)},
	)
}

func normalizeNotificationDevicePlatform(platform string) string {
	switch strings.TrimSpace(strings.ToLower(platform)) {
	case "ios", "android", "web":
		return strings.TrimSpace(strings.ToLower(platform))
	default:
		return "unknown"
	}
}

func normalizeProviderErrorCode(err error) string {
	message := strings.TrimSpace(err.Error())
	if message == "" {
		return "provider_error"
	}
	if len(message) > 100 {
		return message[:100]
	}
	return message
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
	response, err := client.Post("https://exp.host/--/api/v2/push/send", "application/json", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	var responseBody struct {
		Data struct {
			ID      string `json:"id"`
			Status  string `json:"status"`
			Message string `json:"message"`
		} `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&responseBody); err != nil {
		return "", err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || responseBody.Data.Status == "error" {
		message := responseBody.Data.Message
		if message == "" {
			message = fmt.Sprintf("expo_push_status_%d", response.StatusCode)
		}
		return "", errors.New(message)
	}

	return responseBody.Data.ID, nil
}
