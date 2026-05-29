package handlers_test

import (
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

type recordingNotificationPushSender struct {
	calls []recordedNotificationPush
	err   error
}

type recordedNotificationPush struct {
	token   string
	payload handlers.RemoteDeviceNotificationPayload
}

func (sender *recordingNotificationPushSender) SendRemoteDeviceNotification(token string, payload handlers.RemoteDeviceNotificationPayload) (string, error) {
	sender.calls = append(sender.calls, recordedNotificationPush{token: token, payload: payload})
	if sender.err != nil {
		return "", sender.err
	}
	return "message_1", nil
}

func TestNotificationDeviceRegistrationUpsertsAndLogoutCleanupDeactivates(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	user, token := createAuthUser(t, server.app, false, false)

	registerResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/notification-devices",
		token,
		`{"deviceId":"device-1","platform":"ios","pushToken":"ExponentPushToken[first]"}`,
	)
	if registerResponse.Code != http.StatusOK {
		t.Fatalf("expected notification device registration to succeed, got %d: %s", registerResponse.Code, registerResponse.Body.String())
	}

	updateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/notification-devices",
		token,
		`{"deviceId":"device-1","platform":"ios","pushToken":"ExponentPushToken[second]"}`,
	)
	if updateResponse.Code != http.StatusOK {
		t.Fatalf("expected notification device update to succeed, got %d: %s", updateResponse.Code, updateResponse.Body.String())
	}

	devices, err := server.app.FindRecordsByFilter(
		"notification_devices",
		"user = {:user}",
		"",
		10,
		0,
		map[string]any{"user": user.Id},
	)
	if err != nil {
		t.Fatalf("failed to load notification devices: %v", err)
	}
	if len(devices) != 1 || devices[0].GetString("push_token") != "ExponentPushToken[second]" || !devices[0].GetBool("active") {
		t.Fatalf("expected one active updated device, got %#v", devices)
	}

	deleteResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodDelete,
		"/api/notification-devices/device-1",
		token,
		"",
	)
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("expected notification device deactivation to succeed, got %d: %s", deleteResponse.Code, deleteResponse.Body.String())
	}

	reloaded, err := server.app.FindRecordById("notification_devices", devices[0].Id)
	if err != nil {
		t.Fatalf("failed to reload notification device: %v", err)
	}
	if reloaded.GetBool("active") {
		t.Fatalf("expected logout cleanup to deactivate device")
	}
}

func TestTastingInviteNotificationDeliveryCreateAndResend(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	_, leaderToken := createAuthUser(t, server.app, false, false)
	invitee, _ := createAuthUser(t, server.app, false, false)
	createNotificationDeviceRecord(t, server.app, invitee.Id, "device-1", "ExponentPushToken[invitee]", true)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Dumpling Flight","joinDurationMinutes":60,"invitedUserIds":["`+invitee.Id+`"]}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	createdSession := parseJSONResponse[tastingSessionResponse](t, createResponse.Body.Bytes())
	if len(sender.calls) != 1 {
		t.Fatalf("expected create to send one notification, got %#v", sender.calls)
	}
	if sender.calls[0].token != "ExponentPushToken[invitee]" || sender.calls[0].payload.Data["route"] != "TastingSessions" {
		t.Fatalf("expected tasting invite notification payload, got %#v", sender.calls[0])
	}
	assertNotificationDeliveryLog(t, server.app, invitee.Id, "sent", 1)

	inviteID := createdSession.Invites[0].ID
	inviteRecord, err := server.app.FindRecordById("tasting_session_invites", inviteID)
	if err != nil {
		t.Fatalf("failed to load invite: %v", err)
	}
	inviteRecord.Set("status", "dismissed")
	if err := server.app.Save(inviteRecord); err != nil {
		t.Fatalf("failed to mark invite dismissed: %v", err)
	}

	resendResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/invites/"+inviteID+"/resend",
		leaderToken,
		"",
	)
	if resendResponse.Code != http.StatusOK {
		t.Fatalf("expected resend to succeed, got %d: %s", resendResponse.Code, resendResponse.Body.String())
	}
	if len(sender.calls) != 2 {
		t.Fatalf("expected resend to send another notification, got %#v", sender.calls)
	}
}

func TestTastingInviteNotificationDeliverySuppressionsAndMinimalLog(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	leader, leaderToken := createAuthUser(t, server.app, false, false)
	preferenceDisabled, _ := createAuthUser(t, server.app, false, false)
	inactiveDevice, _ := createAuthUser(t, server.app, false, false)
	createNotificationDeviceRecord(t, server.app, leader.Id, "leader-device", "ExponentPushToken[leader]", true)
	createNotificationDeviceRecord(t, server.app, preferenceDisabled.Id, "disabled-device", "ExponentPushToken[disabled]", true)
	createNotificationPreferenceRecord(t, server.app, preferenceDisabled.Id, false)
	createNotificationDeviceRecord(t, server.app, inactiveDevice.Id, "inactive-device", "ExponentPushToken[inactive]", false)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"No Send Flight","joinDurationMinutes":60,"invitedUserIds":["`+leader.Id+`","`+preferenceDisabled.Id+`","`+inactiveDevice.Id+`"]}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	if len(sender.calls) != 0 {
		t.Fatalf("expected suppressions to skip provider sends, got %#v", sender.calls)
	}

	assertNotificationDeliveryLog(t, server.app, leader.Id, "skipped_actor", 0)
	assertNotificationDeliveryLog(t, server.app, preferenceDisabled.Id, "skipped_preference_disabled", 0)
	logRecord := assertNotificationDeliveryLog(t, server.app, inactiveDevice.Id, "skipped_no_active_device", 0)
	for _, fieldName := range []string{"signal_type", "source_collection", "source_record", "delivery_key", "status", "provider_message_id", "error_code"} {
		fieldValue := logRecord.GetString(fieldName)
		if strings.Contains(fieldValue, "ExponentPushToken") || strings.Contains(fieldValue, "No Send Flight") {
			t.Fatalf("expected delivery log field %s to omit push token and body text, got %q", fieldName, fieldValue)
		}
	}
}

func TestTastingInviteNotificationProviderFailureIsLogged(t *testing.T) {
	sender := &recordingNotificationPushSender{err: errors.New("expo_failure")}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	_, leaderToken := createAuthUser(t, server.app, false, false)
	invitee, _ := createAuthUser(t, server.app, false, false)
	createNotificationDeviceRecord(t, server.app, invitee.Id, "device-1", "ExponentPushToken[invitee]", true)

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Failure Flight","joinDurationMinutes":60,"invitedUserIds":["`+invitee.Id+`"]}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected provider failure to be logged without blocking the invite write, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	assertNotificationDeliveryLog(t, server.app, invitee.Id, "provider_failed", 1)
}

func createNotificationDeviceRecord(t *testing.T, app core.App, userID string, deviceID string, token string, active bool) *core.Record {
	t.Helper()
	return createCollectionRecord(t, app, "notification_devices", map[string]any{
		"user":       userID,
		"device_id":  deviceID,
		"push_token": token,
		"platform":   "ios",
		"active":     active,
	})
}

func createNotificationPreferenceRecord(t *testing.T, app core.App, userID string, tastingInvitesEnabled bool) *core.Record {
	t.Helper()
	return createCollectionRecord(t, app, "notification_preferences", map[string]any{
		"user":                    userID,
		"tasting_invites_enabled": tastingInvitesEnabled,
	})
}

func assertNotificationDeliveryLog(t *testing.T, app core.App, userID string, status string, deviceCount int) *core.Record {
	t.Helper()
	records, err := app.FindRecordsByFilter(
		"notification_delivery_logs",
		"user = {:user} && status = {:status}",
		"",
		10,
		0,
		map[string]any{"user": userID, "status": status},
	)
	if err != nil {
		t.Fatalf("failed to load delivery log: %v", err)
	}
	if len(records) == 0 {
		t.Fatalf("expected delivery log status %q for user %s", status, userID)
	}
	record := records[0]
	if record.GetString("signal_type") != "tasting_invite" {
		t.Fatalf("expected tasting invite signal type, got %q", record.GetString("signal_type"))
	}
	if record.GetString("source_collection") != "tasting_sessions" || strings.TrimSpace(record.GetString("source_record")) == "" {
		t.Fatalf("expected source metadata, got %#v", record)
	}
	if int(record.GetFloat("device_count")) != deviceCount {
		t.Fatalf("expected device_count %d, got %v", deviceCount, record.GetFloat("device_count"))
	}
	if strings.TrimSpace(record.GetString("delivery_key")) == "" {
		t.Fatalf("expected delivery key")
	}
	return record
}
