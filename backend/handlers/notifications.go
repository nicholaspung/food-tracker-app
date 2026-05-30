package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
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
)

type notificationDeviceRegistrationRequest struct {
	DeviceID  string `json:"deviceId"`
	Platform  string `json:"platform"`
	PushToken string `json:"pushToken"`
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
