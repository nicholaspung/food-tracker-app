package handlers_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/lib"
)

type recordingNotificationPushSender struct {
	calls      []recordedNotificationPush
	err        error
	errAtCall  int
	messageID  string
	messageIDs []string
}

type recordedNotificationPush struct {
	token   string
	payload handlers.RemoteDeviceNotificationPayload
}

func (sender *recordingNotificationPushSender) SendRemoteDeviceNotification(token string, payload handlers.RemoteDeviceNotificationPayload) (string, error) {
	sender.calls = append(sender.calls, recordedNotificationPush{token: token, payload: payload})
	if sender.err != nil && (sender.errAtCall == 0 || sender.errAtCall == len(sender.calls)) {
		return "", sender.err
	}
	if len(sender.messageIDs) >= len(sender.calls) {
		return sender.messageIDs[len(sender.calls)-1], nil
	}
	if sender.messageID != "" {
		return sender.messageID, nil
	}
	return "message_1", nil
}

type recordingNotificationReceiptChecker struct {
	ids      []string
	receipts map[string]handlers.RemoteDeviceNotificationReceipt
	err      error
}

func (checker *recordingNotificationReceiptChecker) CheckRemoteDeviceNotificationReceipts(receiptIDs []string) (map[string]handlers.RemoteDeviceNotificationReceipt, error) {
	checker.ids = append(checker.ids, receiptIDs...)
	if checker.err != nil {
		return nil, checker.err
	}
	return checker.receipts, nil
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

func TestNotificationDeviceRegistrationDeactivatesMatchingDevicesForOtherUsers(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	previousUser, _ := createAuthUser(t, server.app, false, false)
	currentUser, token := createAuthUser(t, server.app, false, false)
	sameDevice := createNotificationDeviceRecord(t, server.app, previousUser.Id, "shared-device", "ExponentPushToken[old-device]", true)
	sameToken := createNotificationDeviceRecord(t, server.app, previousUser.Id, "other-device", "ExponentPushToken[shared]", true)
	unrelated := createNotificationDeviceRecord(t, server.app, previousUser.Id, "unrelated-device", "ExponentPushToken[unrelated]", true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/notification-devices",
		token,
		`{"deviceId":"shared-device","platform":"android","pushToken":"ExponentPushToken[shared]"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected notification device registration to succeed, got %d: %s", response.Code, response.Body.String())
	}

	reloadedSameDevice, err := server.app.FindRecordById("notification_devices", sameDevice.Id)
	if err != nil {
		t.Fatalf("failed to reload same-device record: %v", err)
	}
	reloadedSameToken, err := server.app.FindRecordById("notification_devices", sameToken.Id)
	if err != nil {
		t.Fatalf("failed to reload same-token record: %v", err)
	}
	reloadedUnrelated, err := server.app.FindRecordById("notification_devices", unrelated.Id)
	if err != nil {
		t.Fatalf("failed to reload unrelated record: %v", err)
	}
	if reloadedSameDevice.GetBool("active") || reloadedSameToken.GetBool("active") {
		t.Fatalf("expected matching devices for previous user to be deactivated")
	}
	if !reloadedUnrelated.GetBool("active") {
		t.Fatalf("expected unrelated previous user device to remain active")
	}

	currentDevices, err := server.app.FindRecordsByFilter(
		"notification_devices",
		"user = {:user}",
		"",
		10,
		0,
		map[string]any{"user": currentUser.Id},
	)
	if err != nil {
		t.Fatalf("failed to load current user devices: %v", err)
	}
	if len(currentDevices) != 1 ||
		!currentDevices[0].GetBool("active") ||
		currentDevices[0].GetString("device_id") != "shared-device" ||
		currentDevices[0].GetString("push_token") != "ExponentPushToken[shared]" ||
		currentDevices[0].GetString("platform") != "android" {
		t.Fatalf("expected current user's matching device to be active and updated, got %#v", currentDevices)
	}
}

func TestNotificationDeviceRegistrationDeactivatesDuplicateTokenForSameUser(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	currentUser, token := createAuthUser(t, server.app, false, false)
	duplicateToken := createNotificationDeviceRecord(t, server.app, currentUser.Id, "old-device", "ExponentPushToken[shared]", true)
	unrelatedToken := createNotificationDeviceRecord(t, server.app, currentUser.Id, "unrelated-device", "ExponentPushToken[unrelated]", true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/notification-devices",
		token,
		`{"deviceId":"current-device","platform":"ios","pushToken":"ExponentPushToken[shared]"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected notification device registration to succeed, got %d: %s", response.Code, response.Body.String())
	}

	assertNotificationDeviceActiveState(t, server.app, duplicateToken.Id, false)
	assertNotificationDeviceActiveState(t, server.app, unrelatedToken.Id, true)
	currentRecord, err := server.app.FindFirstRecordByFilter(
		"notification_devices",
		"user = {:user} && device_id = {:deviceID}",
		map[string]any{"deviceID": "current-device", "user": currentUser.Id},
	)
	if err != nil {
		t.Fatalf("expected current device record to exist: %v", err)
	}
	if !currentRecord.GetBool("active") || currentRecord.GetString("push_token") != "ExponentPushToken[shared]" {
		t.Fatalf("expected current device to remain active with shared token, got %#v", currentRecord)
	}
}

func TestNotificationDeviceEndpointsRequireAuthentication(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})

	registerResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/notification-devices",
		"",
		`{"deviceId":"device-1","platform":"ios","pushToken":"ExponentPushToken[first]"}`,
	)
	if registerResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expected registration to require auth, got %d: %s", registerResponse.Code, registerResponse.Body.String())
	}

	deleteResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodDelete,
		"/api/notification-devices/device-1",
		"",
		"",
	)
	if deleteResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expected deactivation to require auth, got %d: %s", deleteResponse.Code, deleteResponse.Body.String())
	}
}

func TestNotificationPreferencesApiDefaultsAndSavesForAuthenticatedUser(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	user, token := createAuthUser(t, server.app, false, false)

	defaultResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/notification-preferences",
		token,
		"",
	)
	if defaultResponse.Code != http.StatusOK {
		t.Fatalf("expected notification preferences defaults to load, got %d: %s", defaultResponse.Code, defaultResponse.Body.String())
	}
	defaultPayload := parseJSONResponse[map[string]any](t, defaultResponse.Body.Bytes())
	if defaultPayload["tastingInvitesEnabled"] != true ||
		defaultPayload["billOwedEnabled"] != true ||
		defaultPayload["monthlyFriendsActivityEnabled"] != true {
		t.Fatalf("unexpected default notification preferences payload: %#v", defaultPayload)
	}

	saveResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPut,
		"/api/notification-preferences",
		token,
		`{"tastingInvitesEnabled":false,"billOwedEnabled":true,"monthlyFriendsActivityEnabled":false}`,
	)
	if saveResponse.Code != http.StatusOK {
		t.Fatalf("expected notification preferences save to succeed, got %d: %s", saveResponse.Code, saveResponse.Body.String())
	}
	savePayload := parseJSONResponse[map[string]any](t, saveResponse.Body.Bytes())
	if savePayload["tastingInvitesEnabled"] != false ||
		savePayload["billOwedEnabled"] != true ||
		savePayload["monthlyFriendsActivityEnabled"] != false {
		t.Fatalf("unexpected saved notification preferences payload: %#v", savePayload)
	}

	records, err := server.app.FindRecordsByFilter(
		"notification_preferences",
		"user = {:user}",
		"",
		10,
		0,
		map[string]any{"user": user.Id},
	)
	if err != nil {
		t.Fatalf("failed to load saved notification preferences: %v", err)
	}
	if len(records) != 1 ||
		records[0].GetBool("tasting_invites_enabled") ||
		!records[0].GetBool("bill_owed_enabled") ||
		records[0].GetBool("monthly_friends_activity_enabled") {
		t.Fatalf("unexpected saved notification preferences record: %#v", records)
	}
}

func TestTastingInviteNotificationDeliveryCreateAndResend(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	leader, leaderToken := createAuthUser(t, server.app, false, false)
	invitee, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, leader.Id, invitee.Id, "accepted")
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
	assertNotificationPayloadOmitsSensitiveText(t, sender.calls[0].payload, "Dumpling Flight")
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
	deliveryLog := assertNotificationDeliveryLog(t, server.app, invitee.Id, "sent", 1)
	setCollectionRecordCreatedAt(t, server.app, "notification_delivery_logs", deliveryLog.Id, "2020-01-01 00:00:00.000Z")

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
	createFriendshipRecord(t, server.app, leader.Id, preferenceDisabled.Id, "accepted")
	createFriendshipRecord(t, server.app, inactiveDevice.Id, leader.Id, "accepted")
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
		`{"name":"No Send Flight","joinDurationMinutes":60,"invitedUserIds":["`+preferenceDisabled.Id+`","`+inactiveDevice.Id+`"]}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected create session to succeed, got %d: %s", createResponse.Code, createResponse.Body.String())
	}
	if len(sender.calls) != 0 {
		t.Fatalf("expected suppressions to skip provider sends, got %#v", sender.calls)
	}

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
	leader, leaderToken := createAuthUser(t, server.app, false, false)
	invitee, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, leader.Id, invitee.Id, "accepted")
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

func TestNotificationProviderInvalidTokenDeactivatesDeviceAndSuppressesFutureSends(t *testing.T) {
	sender := &recordingNotificationPushSender{err: errors.New("DeviceNotRegistered")}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	leader, leaderToken := createAuthUser(t, server.app, false, false)
	invitee, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, leader.Id, invitee.Id, "accepted")
	device := createNotificationDeviceRecord(t, server.app, invitee.Id, "device-1", "ExponentPushToken[invitee]", true)

	firstResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Invalid Token Flight","joinDurationMinutes":60,"invitedUserIds":["`+invitee.Id+`"]}`,
	)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected provider failure to be logged without blocking the invite write, got %d: %s", firstResponse.Code, firstResponse.Body.String())
	}
	if len(sender.calls) != 1 {
		t.Fatalf("expected first invite to attempt provider send, got %#v", sender.calls)
	}
	reloadedDevice, err := server.app.FindRecordById("notification_devices", device.Id)
	if err != nil {
		t.Fatalf("failed to reload notification device: %v", err)
	}
	if reloadedDevice.GetBool("active") {
		t.Fatalf("expected invalid provider token to deactivate notification device")
	}
	logRecord := assertNotificationDeliveryLog(t, server.app, invitee.Id, "provider_failed", 1)
	if strings.Contains(logRecord.GetString("error_code"), "ExponentPushToken") {
		t.Fatalf("expected provider error log to omit push token, got %q", logRecord.GetString("error_code"))
	}
	setCollectionRecordCreatedAt(t, server.app, "notification_delivery_logs", logRecord.Id, "2020-01-01 00:00:00.000Z")

	sender.err = nil
	secondResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Skipped Device Flight","joinDurationMinutes":60,"invitedUserIds":["`+invitee.Id+`"]}`,
	)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected inactive-device invite to succeed, got %d: %s", secondResponse.Code, secondResponse.Body.String())
	}
	if len(sender.calls) != 1 {
		t.Fatalf("expected inactive device to suppress future provider sends, got %#v", sender.calls)
	}
	assertNotificationDeliveryLog(t, server.app, invitee.Id, "skipped_no_active_device", 0)
}

func TestAcceptedNotificationSendPersistsPendingReceiptMetadata(t *testing.T) {
	sender := &recordingNotificationPushSender{messageID: "receipt_accepted_1"}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	leader, leaderToken := createAuthUser(t, server.app, false, false)
	invitee, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, leader.Id, invitee.Id, "accepted")
	device := createNotificationDeviceRecord(t, server.app, invitee.Id, "device-1", "ExponentPushToken[invitee]", true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Receipt Flight","joinDurationMinutes":60,"invitedUserIds":["`+invitee.Id+`"]}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected send to succeed, got %d: %s", response.Code, response.Body.String())
	}

	logRecord := assertNotificationDeliveryLog(t, server.app, invitee.Id, "sent", 1)
	if logRecord.GetString("provider_message_id") != "receipt_accepted_1" {
		t.Fatalf("expected receipt id to be stored, got %q", logRecord.GetString("provider_message_id"))
	}
	if logRecord.GetString("notification_device") != device.Id {
		t.Fatalf("expected related notification device id, got %q", logRecord.GetString("notification_device"))
	}
	if logRecord.GetString("receipt_status") != "pending" || logRecord.GetDateTime("receipt_next_check_at").IsZero() {
		t.Fatalf("expected pending receipt metadata, got status=%q next=%v", logRecord.GetString("receipt_status"), logRecord.GetDateTime("receipt_next_check_at"))
	}
	for _, fieldName := range []string{"provider_message_id", "receipt_status", "receipt_error_code", "error_code"} {
		fieldValue := logRecord.GetString(fieldName)
		if strings.Contains(fieldValue, "ExponentPushToken") || strings.Contains(fieldValue, "Receipt Flight") {
			t.Fatalf("expected receipt metadata field %s to omit push token and body text, got %q", fieldName, fieldValue)
		}
	}
}

func TestAcceptedNotificationSendCreatesPerDeviceReceiptRecord(t *testing.T) {
	sender := &recordingNotificationPushSender{messageID: "receipt_single_1"}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	leader, leaderToken := createAuthUser(t, server.app, false, false)
	invitee, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, leader.Id, invitee.Id, "accepted")
	device := createNotificationDeviceRecord(t, server.app, invitee.Id, "device-1", "ExponentPushToken[invitee]", true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Receipt Flight","joinDurationMinutes":60,"invitedUserIds":["`+invitee.Id+`"]}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected send to succeed, got %d: %s", response.Code, response.Body.String())
	}

	logRecord := assertNotificationDeliveryLog(t, server.app, invitee.Id, "sent", 1)
	receipts := assertNotificationDeliveryReceiptRecords(t, server.app, logRecord.Id, 1)
	receipt := receipts[0]
	if receipt.GetString("notification_device") != device.Id || receipt.GetString("provider_message_id") != "receipt_single_1" {
		t.Fatalf("expected receipt linked to device and provider id, got device=%q provider=%q", receipt.GetString("notification_device"), receipt.GetString("provider_message_id"))
	}
	if receipt.GetString("receipt_status") != "pending" || receipt.GetDateTime("receipt_next_check_at").IsZero() {
		t.Fatalf("expected pending receipt metadata, got status=%q next=%v", receipt.GetString("receipt_status"), receipt.GetDateTime("receipt_next_check_at"))
	}
	for _, fieldName := range []string{"provider_message_id", "receipt_status", "receipt_error_code"} {
		fieldValue := receipt.GetString(fieldName)
		if strings.Contains(fieldValue, "ExponentPushToken") || strings.Contains(fieldValue, "Receipt Flight") {
			t.Fatalf("expected receipt metadata field %s to omit push token and body text, got %q", fieldName, fieldValue)
		}
	}
}

func TestAcceptedNotificationSendCreatesReceiptRecordPerSuccessfulDevice(t *testing.T) {
	sender := &recordingNotificationPushSender{messageIDs: []string{"receipt_device_1", "receipt_device_2"}}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	leader, leaderToken := createAuthUser(t, server.app, false, false)
	invitee, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, leader.Id, invitee.Id, "accepted")
	firstDevice := createNotificationDeviceRecord(t, server.app, invitee.Id, "device-1", "ExponentPushToken[one]", true)
	secondDevice := createNotificationDeviceRecord(t, server.app, invitee.Id, "device-2", "ExponentPushToken[two]", true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Multi Device Receipt Flight","joinDurationMinutes":60,"invitedUserIds":["`+invitee.Id+`"]}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected send to succeed, got %d: %s", response.Code, response.Body.String())
	}
	if len(sender.calls) != 2 {
		t.Fatalf("expected provider send per active device, got %d", len(sender.calls))
	}

	logRecord := assertNotificationDeliveryLog(t, server.app, invitee.Id, "sent", 2)
	if logRecord.GetString("provider_message_id") != "receipt_device_1" || logRecord.GetString("notification_device") != firstDevice.Id {
		t.Fatalf("expected parent log to keep first provider/device summary, got provider=%q device=%q", logRecord.GetString("provider_message_id"), logRecord.GetString("notification_device"))
	}
	receipts := assertNotificationDeliveryReceiptRecords(t, server.app, logRecord.Id, 2)
	receiptsByProviderID := map[string]*core.Record{}
	for _, receipt := range receipts {
		receiptsByProviderID[receipt.GetString("provider_message_id")] = receipt
	}
	if receiptsByProviderID["receipt_device_1"].GetString("notification_device") != firstDevice.Id {
		t.Fatalf("expected first receipt to link first device")
	}
	if receiptsByProviderID["receipt_device_2"].GetString("notification_device") != secondDevice.Id {
		t.Fatalf("expected second receipt to link second device")
	}
}

func TestPartialProviderSendFailurePreservesAcceptedPerDeviceReceipts(t *testing.T) {
	sender := &recordingNotificationPushSender{
		err:        errors.New("DeviceNotRegistered"),
		errAtCall:  2,
		messageIDs: []string{"receipt_device_1"},
	}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	leader, leaderToken := createAuthUser(t, server.app, false, false)
	invitee, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, leader.Id, invitee.Id, "accepted")
	firstDevice := createNotificationDeviceRecord(t, server.app, invitee.Id, "device-1", "ExponentPushToken[one]", true)
	secondDevice := createNotificationDeviceRecord(t, server.app, invitee.Id, "device-2", "ExponentPushToken[two]", true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Partial Receipt Flight","joinDurationMinutes":60,"invitedUserIds":["`+invitee.Id+`"]}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected partial provider failure to keep request successful, got %d: %s", response.Code, response.Body.String())
	}
	if len(sender.calls) != 2 {
		t.Fatalf("expected provider send to stop on second device failure, got %d calls", len(sender.calls))
	}

	logRecord := assertNotificationDeliveryLog(t, server.app, invitee.Id, "provider_failed", 2)
	if logRecord.GetString("error_code") != "DeviceNotRegistered" {
		t.Fatalf("expected parent log to store provider failure summary, got %q", logRecord.GetString("error_code"))
	}
	if logRecord.GetString("provider_message_id") != "receipt_device_1" || logRecord.GetString("notification_device") != firstDevice.Id {
		t.Fatalf("expected parent log to retain first accepted provider/device summary, got provider=%q device=%q", logRecord.GetString("provider_message_id"), logRecord.GetString("notification_device"))
	}

	receipts := assertNotificationDeliveryReceiptRecords(t, server.app, logRecord.Id, 1)
	receipt := receipts[0]
	if receipt.GetString("notification_device") != firstDevice.Id || receipt.GetString("provider_message_id") != "receipt_device_1" {
		t.Fatalf("expected accepted receipt to be preserved for first device, got device=%q provider=%q", receipt.GetString("notification_device"), receipt.GetString("provider_message_id"))
	}
	if receipt.GetString("receipt_status") != "pending" || receipt.GetDateTime("receipt_next_check_at").IsZero() {
		t.Fatalf("expected accepted receipt to remain pending, got status=%q next=%v", receipt.GetString("receipt_status"), receipt.GetDateTime("receipt_next_check_at"))
	}
	for _, fieldName := range []string{"provider_message_id", "receipt_status", "receipt_error_code"} {
		fieldValue := receipt.GetString(fieldName)
		if strings.Contains(fieldValue, "ExponentPushToken") || strings.Contains(fieldValue, "Partial Receipt Flight") {
			t.Fatalf("expected receipt metadata field %s to omit push token and notification text, got %q", fieldName, fieldValue)
		}
	}

	assertNotificationDeviceActiveState(t, server.app, firstDevice.Id, true)
	assertNotificationDeviceActiveState(t, server.app, secondDevice.Id, false)
}

func TestNotificationDeliveryReceiptsAreBackendOnly(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	user, token := createAuthUser(t, server.app, false, false)
	_, adminToken := createAuthUser(t, server.app, true, false)
	device := createNotificationDeviceRecord(t, server.app, user.Id, "device-1", "ExponentPushToken[user]", true)
	logRecord := createNotificationDeliveryLogRecord(t, server.app, user.Id, "delivery-key", "sent")
	createNotificationDeliveryReceiptRecord(t, server.app, logRecord.Id, device.Id, "receipt_private_1", "2026-05-30 11:45:00.000Z")

	adminResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/notification_delivery_receipts/records",
		adminToken,
		"",
	)
	if adminResponse.Code != http.StatusOK || !strings.Contains(adminResponse.Body.String(), "receipt_private_1") {
		t.Fatalf("expected admins to read operational receipt metadata, got %d: %s", adminResponse.Code, adminResponse.Body.String())
	}

	userResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/notification_delivery_receipts/records",
		token,
		"",
	)
	if userResponse.Code != http.StatusOK {
		t.Fatalf("expected regular user receipt list request to be handled without exposing records, got %d: %s", userResponse.Code, userResponse.Body.String())
	}
	if strings.Contains(userResponse.Body.String(), "receipt_private_1") || strings.Contains(userResponse.Body.String(), "ExponentPushToken") {
		t.Fatalf("expected regular user response to omit receipt metadata, got %s", userResponse.Body.String())
	}
}

func TestNotificationReceiptCheckMarksSuccessfulReceipt(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	user, _ := createAuthUser(t, server.app, false, false)
	device := createNotificationDeviceRecord(t, server.app, user.Id, "device-1", "ExponentPushToken[user]", true)
	logRecord := createPendingNotificationReceiptLogRecord(t, server.app, user.Id, device.Id, "receipt_ok_1", "2026-05-30 11:45:00.000Z")
	checker := &recordingNotificationReceiptChecker{receipts: map[string]handlers.RemoteDeviceNotificationReceipt{
		"receipt_ok_1": {Status: "ok"},
	}}
	restore := handlers.SetNotificationPushReceiptCheckerForTests(checker)
	defer restore()

	checked, err := handlers.CheckPendingExpoPushReceipts(server.app, time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("expected receipt check to succeed: %v", err)
	}
	if checked != 1 || len(checker.ids) != 1 || checker.ids[0] != "receipt_ok_1" {
		t.Fatalf("expected one receipt check, checked=%d ids=%#v", checked, checker.ids)
	}
	reloadedLog, err := server.app.FindRecordById("notification_delivery_logs", logRecord.Id)
	if err != nil {
		t.Fatalf("failed to reload delivery log: %v", err)
	}
	if reloadedLog.GetString("status") != "sent" || reloadedLog.GetString("receipt_status") != "ok" || reloadedLog.GetDateTime("receipt_checked_at").IsZero() {
		t.Fatalf("expected successful receipt to stay sent and checked, got status=%q receipt=%q", reloadedLog.GetString("status"), reloadedLog.GetString("receipt_status"))
	}
}

func TestNotificationReceiptDeviceNotRegisteredDeactivatesDevice(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	user, _ := createAuthUser(t, server.app, false, false)
	device := createNotificationDeviceRecord(t, server.app, user.Id, "device-1", "ExponentPushToken[user]", true)
	logRecord := createPendingNotificationReceiptLogRecord(t, server.app, user.Id, device.Id, "receipt_unregistered_1", "2026-05-30 11:45:00.000Z")
	checker := &recordingNotificationReceiptChecker{receipts: map[string]handlers.RemoteDeviceNotificationReceipt{
		"receipt_unregistered_1": {Status: "error", ErrorCode: "DeviceNotRegistered"},
	}}
	restore := handlers.SetNotificationPushReceiptCheckerForTests(checker)
	defer restore()

	if _, err := handlers.CheckPendingExpoPushReceipts(server.app, time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)); err != nil {
		t.Fatalf("expected receipt check to succeed: %v", err)
	}
	reloadedDevice, err := server.app.FindRecordById("notification_devices", device.Id)
	if err != nil {
		t.Fatalf("failed to reload notification device: %v", err)
	}
	if reloadedDevice.GetBool("active") {
		t.Fatalf("expected DeviceNotRegistered receipt to deactivate notification device")
	}
	reloadedLog, err := server.app.FindRecordById("notification_delivery_logs", logRecord.Id)
	if err != nil {
		t.Fatalf("failed to reload delivery log: %v", err)
	}
	if reloadedLog.GetString("status") != "provider_failed" || reloadedLog.GetString("receipt_error_code") != "DeviceNotRegistered" {
		t.Fatalf("expected provider failure receipt metadata, got status=%q error=%q", reloadedLog.GetString("status"), reloadedLog.GetString("receipt_error_code"))
	}
}

func TestNotificationReceiptCheckProcessesPerDeviceReceiptsAndDeactivatesOnlyFailedDevice(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	user, _ := createAuthUser(t, server.app, false, false)
	firstDevice := createNotificationDeviceRecord(t, server.app, user.Id, "device-1", "ExponentPushToken[first]", true)
	secondDevice := createNotificationDeviceRecord(t, server.app, user.Id, "device-2", "ExponentPushToken[second]", true)
	logRecord := createPendingNotificationReceiptLogRecord(t, server.app, user.Id, firstDevice.Id, "receipt_device_1", "2026-05-30 11:45:00.000Z")
	firstReceipt := createNotificationDeliveryReceiptRecord(t, server.app, logRecord.Id, firstDevice.Id, "receipt_device_1", "2026-05-30 11:45:00.000Z")
	secondReceipt := createNotificationDeliveryReceiptRecord(t, server.app, logRecord.Id, secondDevice.Id, "receipt_device_2", "2026-05-30 11:45:00.000Z")
	checker := &recordingNotificationReceiptChecker{receipts: map[string]handlers.RemoteDeviceNotificationReceipt{
		"receipt_device_1": {Status: "ok"},
		"receipt_device_2": {Status: "error", ErrorCode: "DeviceNotRegistered"},
	}}
	restore := handlers.SetNotificationPushReceiptCheckerForTests(checker)
	defer restore()

	checked, err := handlers.CheckPendingExpoPushReceipts(server.app, time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("expected receipt check to succeed: %v", err)
	}
	if checked != 2 {
		t.Fatalf("expected two per-device receipt checks, got %d", checked)
	}
	if len(checker.ids) != 2 || checker.ids[0] != "receipt_device_1" || checker.ids[1] != "receipt_device_2" {
		t.Fatalf("expected per-device receipt ids to be checked, got %#v", checker.ids)
	}

	assertNotificationDeviceActiveState(t, server.app, firstDevice.Id, true)
	assertNotificationDeviceActiveState(t, server.app, secondDevice.Id, false)

	reloadedFirstReceipt, err := server.app.FindRecordById("notification_delivery_receipts", firstReceipt.Id)
	if err != nil {
		t.Fatalf("failed to reload first delivery receipt: %v", err)
	}
	if reloadedFirstReceipt.GetString("receipt_status") != "ok" || reloadedFirstReceipt.GetString("receipt_error_code") != "" || reloadedFirstReceipt.GetDateTime("receipt_checked_at").IsZero() {
		t.Fatalf("expected first receipt to be marked ok, got status=%q error=%q checked=%v", reloadedFirstReceipt.GetString("receipt_status"), reloadedFirstReceipt.GetString("receipt_error_code"), reloadedFirstReceipt.GetDateTime("receipt_checked_at"))
	}

	reloadedSecondReceipt, err := server.app.FindRecordById("notification_delivery_receipts", secondReceipt.Id)
	if err != nil {
		t.Fatalf("failed to reload second delivery receipt: %v", err)
	}
	if reloadedSecondReceipt.GetString("receipt_status") != "error" || reloadedSecondReceipt.GetString("receipt_error_code") != "DeviceNotRegistered" || reloadedSecondReceipt.GetDateTime("receipt_checked_at").IsZero() {
		t.Fatalf("expected second receipt to hold DeviceNotRegistered error, got status=%q error=%q checked=%v", reloadedSecondReceipt.GetString("receipt_status"), reloadedSecondReceipt.GetString("receipt_error_code"), reloadedSecondReceipt.GetDateTime("receipt_checked_at"))
	}

	reloadedLog, err := server.app.FindRecordById("notification_delivery_logs", logRecord.Id)
	if err != nil {
		t.Fatalf("failed to reload delivery log: %v", err)
	}
	if reloadedLog.GetString("status") != "sent" || reloadedLog.GetString("receipt_error_code") != "DeviceNotRegistered" {
		t.Fatalf("expected parent log to preserve sent status with receipt failure summary, got status=%q error=%q", reloadedLog.GetString("status"), reloadedLog.GetString("receipt_error_code"))
	}
}

func TestNotificationReceiptNonDeviceErrorIsRecordedWithoutDeactivatingDevice(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	user, _ := createAuthUser(t, server.app, false, false)
	device := createNotificationDeviceRecord(t, server.app, user.Id, "device-1", "ExponentPushToken[user]", true)
	logRecord := createPendingNotificationReceiptLogRecord(t, server.app, user.Id, device.Id, "receipt_bad_credentials_1", "2026-05-30 11:45:00.000Z")
	checker := &recordingNotificationReceiptChecker{receipts: map[string]handlers.RemoteDeviceNotificationReceipt{
		"receipt_bad_credentials_1": {Status: "error", ErrorCode: "InvalidCredentials"},
	}}
	restore := handlers.SetNotificationPushReceiptCheckerForTests(checker)
	defer restore()

	if _, err := handlers.CheckPendingExpoPushReceipts(server.app, time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)); err != nil {
		t.Fatalf("expected receipt check to succeed: %v", err)
	}
	reloadedDevice, err := server.app.FindRecordById("notification_devices", device.Id)
	if err != nil {
		t.Fatalf("failed to reload notification device: %v", err)
	}
	if !reloadedDevice.GetBool("active") {
		t.Fatalf("expected non-device receipt error to keep notification device active")
	}
	reloadedLog, err := server.app.FindRecordById("notification_delivery_logs", logRecord.Id)
	if err != nil {
		t.Fatalf("failed to reload delivery log: %v", err)
	}
	if reloadedLog.GetString("status") != "provider_failed" || reloadedLog.GetString("receipt_error_code") != "InvalidCredentials" {
		t.Fatalf("expected bounded provider failure metadata, got status=%q error=%q", reloadedLog.GetString("status"), reloadedLog.GetString("receipt_error_code"))
	}
}

func TestNotificationReceiptCheckToleratesMissingReceipts(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	user, _ := createAuthUser(t, server.app, false, false)
	device := createNotificationDeviceRecord(t, server.app, user.Id, "device-1", "ExponentPushToken[user]", true)
	logRecord := createPendingNotificationReceiptLogRecord(t, server.app, user.Id, device.Id, "receipt_missing_1", "2026-05-30 11:45:00.000Z")
	checker := &recordingNotificationReceiptChecker{receipts: map[string]handlers.RemoteDeviceNotificationReceipt{}}
	restore := handlers.SetNotificationPushReceiptCheckerForTests(checker)
	defer restore()

	checked, err := handlers.CheckPendingExpoPushReceipts(server.app, time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("expected missing receipt to be tolerated: %v", err)
	}
	if checked != 1 {
		t.Fatalf("expected one missing receipt to be processed, got %d", checked)
	}
	reloadedLog, err := server.app.FindRecordById("notification_delivery_logs", logRecord.Id)
	if err != nil {
		t.Fatalf("failed to reload delivery log: %v", err)
	}
	if reloadedLog.GetString("status") != "sent" || reloadedLog.GetString("receipt_status") != "missing" || reloadedLog.GetString("receipt_error_code") != "receipt_missing" {
		t.Fatalf("expected missing receipt metadata without provider failure, got status=%q receipt=%q error=%q", reloadedLog.GetString("status"), reloadedLog.GetString("receipt_status"), reloadedLog.GetString("receipt_error_code"))
	}
}

func TestNotificationDeliveryLogRetentionCleanup(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	user, _ := createAuthUser(t, server.app, false, false)
	now := time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)

	oldSent := createNotificationDeliveryLogRecord(t, server.app, user.Id, "old-sent", "sent")
	setCollectionRecordCreatedAt(t, server.app, "notification_delivery_logs", oldSent.Id, "2026-04-20 12:00:00.000Z")
	recentSent := createNotificationDeliveryLogRecord(t, server.app, user.Id, "recent-sent", "sent")
	setCollectionRecordCreatedAt(t, server.app, "notification_delivery_logs", recentSent.Id, "2026-05-05 12:00:00.000Z")
	oldFailed := createNotificationDeliveryLogRecord(t, server.app, user.Id, "old-failed", "provider_failed")
	setCollectionRecordCreatedAt(t, server.app, "notification_delivery_logs", oldFailed.Id, "2026-05-01 12:00:00.000Z")
	recentFailed := createNotificationDeliveryLogRecord(t, server.app, user.Id, "recent-failed", "provider_failed")
	setCollectionRecordCreatedAt(t, server.app, "notification_delivery_logs", recentFailed.Id, "2026-05-20 12:00:00.000Z")
	oldSkipped := createNotificationDeliveryLogRecord(t, server.app, user.Id, "old-skipped", "skipped_no_active_device")
	setCollectionRecordCreatedAt(t, server.app, "notification_delivery_logs", oldSkipped.Id, "2026-05-01 12:00:00.000Z")

	removed, err := handlers.CleanupNotificationDeliveryLogs(server.app, now)
	if err != nil {
		t.Fatalf("expected notification delivery log cleanup to succeed: %v", err)
	}
	if removed != 3 {
		t.Fatalf("expected cleanup to remove old sent and old failed/skipped logs, got %d", removed)
	}

	assertNotificationDeliveryLogIDMissing(t, server.app, oldSent.Id)
	assertNotificationDeliveryLogIDMissing(t, server.app, oldFailed.Id)
	assertNotificationDeliveryLogIDMissing(t, server.app, oldSkipped.Id)
	assertNotificationDeliveryLogIDExists(t, server.app, recentSent.Id)
	assertNotificationDeliveryLogIDExists(t, server.app, recentFailed.Id)
}

func TestStaleNotificationDeviceCleanup(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	user, _ := createAuthUser(t, server.app, false, false)
	now := time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)

	staleSeen := createNotificationDeviceRecord(t, server.app, user.Id, "stale-seen-device", "ExponentPushToken[stale-seen]", true)
	setCollectionRecordFieldValue(t, server.app, "notification_devices", staleSeen.Id, "last_seen_at", "2026-02-20 12:00:00.000Z")
	setCollectionRecordFieldValue(t, server.app, "notification_devices", staleSeen.Id, "last_registered_at", "2026-02-20 12:00:00.000Z")

	freshSeen := createNotificationDeviceRecord(t, server.app, user.Id, "fresh-seen-device", "ExponentPushToken[fresh-seen]", true)
	setCollectionRecordFieldValue(t, server.app, "notification_devices", freshSeen.Id, "last_seen_at", "2026-05-15 12:00:00.000Z")
	setCollectionRecordFieldValue(t, server.app, "notification_devices", freshSeen.Id, "last_registered_at", "2026-01-15 12:00:00.000Z")

	inactiveStale := createNotificationDeviceRecord(t, server.app, user.Id, "inactive-stale-device", "ExponentPushToken[inactive-stale]", false)
	setCollectionRecordFieldValue(t, server.app, "notification_devices", inactiveStale.Id, "last_seen_at", "2026-02-20 12:00:00.000Z")
	setCollectionRecordFieldValue(t, server.app, "notification_devices", inactiveStale.Id, "last_registered_at", "2026-02-20 12:00:00.000Z")

	missingTimestamps := createNotificationDeviceRecord(t, server.app, user.Id, "missing-timestamps-device", "ExponentPushToken[missing-timestamps]", true)

	deactivated, err := handlers.CleanupStaleNotificationDevices(server.app, now)
	if err != nil {
		t.Fatalf("expected stale notification device cleanup to succeed: %v", err)
	}
	if deactivated != 2 {
		t.Fatalf("expected cleanup to deactivate stale and missing-timestamp devices, got %d", deactivated)
	}

	assertNotificationDeviceActiveState(t, server.app, staleSeen.Id, false)
	assertNotificationDeviceActiveState(t, server.app, freshSeen.Id, true)
	assertNotificationDeviceActiveState(t, server.app, inactiveStale.Id, false)
	assertNotificationDeviceActiveState(t, server.app, missingTimestamps.Id, false)
}

func TestNotificationDeliveryLogsAreNotReadableByNormalMobileUsers(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	user, token := createAuthUser(t, server.app, false, false)
	createNotificationDeliveryLogRecord(t, server.app, user.Id, "private-log", "sent")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/notification_delivery_logs/records",
		token,
		"",
	)
	if response.Code == http.StatusOK {
		payload := parseJSONResponse[map[string]any](t, response.Body.Bytes())
		items, ok := payload["items"].([]any)
		if !ok || len(items) != 0 {
			t.Fatalf("expected normal authenticated user to receive no delivery log records, got %s", response.Body.String())
		}
	}
	if strings.Contains(response.Body.String(), "private-log") || strings.Contains(response.Body.String(), "notification_delivery_logs") {
		t.Fatalf("expected delivery log response to omit operational details, got %s", response.Body.String())
	}
}

func TestBillOwedNotificationDeliveryOnCreate(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	actor, actorToken := createAuthUser(t, server.app, false, false)
	appParticipant, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, actor.Id, appParticipant.Id, "accepted")
	createNotificationDeviceRecord(t, server.app, actor.Id, "actor-device", "ExponentPushToken[actor]", true)
	createNotificationDeviceRecord(t, server.app, appParticipant.Id, "participant-device", "ExponentPushToken[participant]", true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/bills",
		actorToken,
		`{
			"title":"Dinner Split",
			"totalAmount":40,
			"tax":0,
			"tip":0,
			"fees":0,
			"extrasSplitMode":"equal",
			"participants":[
				{"id":"actor","name":"Actor","userId":"`+actor.Id+`","amountOwed":20,"paidStatus":"pending"},
				{"id":"friend","name":"Friend","userId":"`+appParticipant.Id+`","amountOwed":15,"paidStatus":"pending"},
				{"id":"custom","name":"Cash Friend","amountOwed":5,"paidStatus":"pending"}
			],
			"items":[{"id":"item-1","itemName":"Noodles","price":40,"assignedToParticipantIds":["actor","friend","custom"],"splitMode":"simple"}]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected bill create to succeed, got %d: %s", response.Code, response.Body.String())
	}
	createdBill := parseJSONResponse[billResponsePayload](t, response.Body.Bytes())

	if len(sender.calls) != 1 {
		t.Fatalf("expected one bill owed notification, got %#v", sender.calls)
	}
	call := sender.calls[0]
	if call.token != "ExponentPushToken[participant]" {
		t.Fatalf("expected app participant token, got %q", call.token)
	}
	if call.payload.Data["notificationType"] != "bill_owed" ||
		call.payload.Data["route"] != "Bills" ||
		call.payload.Data["billId"] != createdBill.ID {
		t.Fatalf("unexpected bill notification payload: %#v", call.payload)
	}
	assertNotificationPayloadOmitsSensitiveText(t, call.payload, "Dinner Split", "15", "$", "Friend", "Noodles")
	assertNotificationDeliveryLogWithSignal(t, server.app, appParticipant.Id, "bill_owed", "sent", 1)
}

func TestBillOwedNotificationRejectedForNonFriendEnrollment(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	actor, actorToken := createAuthUser(t, server.app, false, false)
	nonFriend, _ := createAuthUser(t, server.app, false, false)
	createNotificationDeviceRecord(t, server.app, nonFriend.Id, "target-device", "ExponentPushToken[target]", true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/bills",
		actorToken,
		`{
			"title":"Rejected Notification Bill",
			"totalAmount":20,
			"participants":[
				{"id":"actor","name":"Actor","userId":"`+actor.Id+`","amountOwed":10,"paidStatus":"paid"},
				{"id":"target","name":"Target","userId":"`+nonFriend.Id+`","amountOwed":10,"paidStatus":"pending"}
			]
		}`,
	)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected non-friend enrollment 403, got %d: %s", response.Code, response.Body.String())
	}
	if len(sender.calls) != 0 {
		t.Fatalf("expected rejected enrollment to send no push, got %#v", sender.calls)
	}
	if count := countRecordsByFilter(t, server.app, "notification_delivery_logs", "user = {:userId}", map[string]any{"userId": nonFriend.Id}); count != 0 {
		t.Fatalf("expected rejected enrollment to create no delivery log, got %d", count)
	}
}

func TestBillOwedNotificationDeliveryOnEditDedupesAndSendsNewOwes(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	actor, actorToken := createAuthUser(t, server.app, false, false)
	existingOwer, _ := createAuthUser(t, server.app, false, false)
	newOwer, _ := createAuthUser(t, server.app, false, false)
	changedOwer, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, actor.Id, newOwer.Id, "accepted")
	createNotificationDeviceRecord(t, server.app, existingOwer.Id, "existing-device", "ExponentPushToken[existing]", true)
	createNotificationDeviceRecord(t, server.app, newOwer.Id, "new-device", "ExponentPushToken[new]", true)
	createNotificationDeviceRecord(t, server.app, changedOwer.Id, "changed-device", "ExponentPushToken[changed]", true)

	bill := seedBillRecord(t, server.app, actor.Id, "Edit Dinner")
	actorParticipant := seedBillParticipantRecord(t, server.app, bill.Id, actor.Id, "Actor", 20, "paid")
	existingParticipant := seedBillParticipantRecord(t, server.app, bill.Id, existingOwer.Id, "Existing", 12, "pending")
	changedParticipant := seedBillParticipantRecord(t, server.app, bill.Id, changedOwer.Id, "Changed", 9, "paid")
	customParticipant := seedBillParticipantRecord(t, server.app, bill.Id, "", "Custom", 7, "pending")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPut,
		"/api/bills/"+bill.Id,
		actorToken,
		`{
			"totalAmount":63,
			"participants":[
				{"id":"`+actorParticipant.Id+`","name":"Actor","userId":"`+actor.Id+`","amountOwed":20,"paidStatus":"paid"},
				{"id":"`+existingParticipant.Id+`","name":"Existing","userId":"`+existingOwer.Id+`","amountOwed":14,"paidStatus":"pending"},
				{"id":"`+changedParticipant.Id+`","name":"Changed","userId":"`+changedOwer.Id+`","amountOwed":9,"paidStatus":"pending"},
				{"id":"new","name":"New","userId":"`+newOwer.Id+`","amountOwed":11,"paidStatus":"pending"},
				{"id":"`+customParticipant.Id+`","name":"Custom","amountOwed":7,"paidStatus":"pending"}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected bill edit to succeed, got %d: %s", response.Code, response.Body.String())
	}

	if len(sender.calls) != 2 {
		t.Fatalf("expected notifications for new and changed owing participants only, got %#v", sender.calls)
	}
	sentTokens := map[string]struct{}{}
	for _, call := range sender.calls {
		sentTokens[call.token] = struct{}{}
	}
	if _, ok := sentTokens["ExponentPushToken[new]"]; !ok {
		t.Fatalf("expected new owing participant notification, got %#v", sender.calls)
	}
	if _, ok := sentTokens["ExponentPushToken[changed]"]; !ok {
		t.Fatalf("expected changed owing participant notification, got %#v", sender.calls)
	}
	if _, ok := sentTokens["ExponentPushToken[existing]"]; ok {
		t.Fatalf("expected existing owing participant to be deduped, got %#v", sender.calls)
	}
}

func TestBillOwedNotificationPreferenceSuppression(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	actor, actorToken := createAuthUser(t, server.app, false, false)
	participant, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, actor.Id, participant.Id, "accepted")
	createNotificationDeviceRecord(t, server.app, participant.Id, "participant-device", "ExponentPushToken[participant]", true)
	createBillNotificationPreferenceRecord(t, server.app, participant.Id, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/bills",
		actorToken,
		`{
			"title":"Muted Dinner",
			"totalAmount":20,
			"participants":[
				{"id":"actor","name":"Actor","userId":"`+actor.Id+`","amountOwed":10,"paidStatus":"paid"},
				{"id":"friend","name":"Friend","userId":"`+participant.Id+`","amountOwed":10,"paidStatus":"pending"}
			]
		}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected bill create to succeed, got %d: %s", response.Code, response.Body.String())
	}
	if len(sender.calls) != 0 {
		t.Fatalf("expected disabled bill preference to suppress provider sends, got %#v", sender.calls)
	}
	assertNotificationDeliveryLogWithSignal(t, server.app, participant.Id, "bill_owed", "skipped_preference_disabled", 0)
}

func TestBillPaymentReminderDeliveryAndWeeklyRateLimit(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	creator, creatorToken := createAuthUser(t, server.app, false, false)
	participant, _ := createAuthUser(t, server.app, false, false)
	createNotificationDeviceRecord(t, server.app, participant.Id, "participant-device", "ExponentPushToken[participant]", true)
	bill := seedBillRecord(t, server.app, creator.Id, "Reminder Dinner")
	participantRecord := seedBillParticipantRecord(t, server.app, bill.Id, participant.Id, "Friend", 18, "pending")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/bills/"+bill.Id+"/participants/"+participantRecord.Id+"/payment-reminder",
		creatorToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected payment reminder to succeed, got %d: %s", response.Code, response.Body.String())
	}
	var sentPayload struct {
		Status                     string  `json:"status"`
		PaymentReminderAvailable   bool    `json:"paymentReminderAvailable"`
		PaymentReminderAvailableAt *string `json:"paymentReminderAvailableAt"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &sentPayload); err != nil {
		t.Fatalf("failed to decode payment reminder response: %v", err)
	}
	if sentPayload.Status != "sent" || sentPayload.PaymentReminderAvailable || sentPayload.PaymentReminderAvailableAt == nil {
		t.Fatalf("expected authoritative sent cooldown, got %#v", sentPayload)
	}
	if len(sender.calls) != 1 {
		t.Fatalf("expected one payment reminder push, got %#v", sender.calls)
	}
	call := sender.calls[0]
	if call.token != "ExponentPushToken[participant]" {
		t.Fatalf("expected participant token, got %q", call.token)
	}
	if call.payload.Data["notificationType"] != "bill_payment_reminder" ||
		call.payload.Data["route"] != "BillDetail" ||
		call.payload.Data["billId"] != bill.Id {
		t.Fatalf("unexpected payment reminder payload: %#v", call.payload)
	}
	assertNotificationPayloadOmitsSensitiveText(t, call.payload, "Reminder Dinner", "18", "$", "Friend")

	logRecord := assertNotificationDeliveryLogWithSignal(t, server.app, participant.Id, "bill_payment_reminder", "sent", 1)
	if logRecord.GetString("source_collection") != "bill_participants" || logRecord.GetString("source_record") != participantRecord.Id {
		t.Fatalf("expected participant-scoped reminder log, got source %q/%q", logRecord.GetString("source_collection"), logRecord.GetString("source_record"))
	}
	for _, fieldName := range []string{"signal_type", "source_collection", "source_record", "delivery_key", "status", "provider_message_id", "error_code"} {
		fieldValue := logRecord.GetString(fieldName)
		if strings.Contains(fieldValue, "ExponentPushToken") || strings.Contains(fieldValue, call.payload.Body) {
			t.Fatalf("expected delivery log field %s to omit push token and body text, got %q", fieldName, fieldValue)
		}
	}

	rateLimitedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/bills/"+bill.Id+"/participants/"+participantRecord.Id+"/payment-reminder",
		creatorToken,
		"",
	)
	if rateLimitedResponse.Code != http.StatusOK {
		t.Fatalf("expected weekly rate limit response, got %d: %s", rateLimitedResponse.Code, rateLimitedResponse.Body.String())
	}
	var rateLimitedPayload struct {
		Status                     string  `json:"status"`
		PaymentReminderAvailable   bool    `json:"paymentReminderAvailable"`
		PaymentReminderAvailableAt *string `json:"paymentReminderAvailableAt"`
	}
	if err := json.Unmarshal(rateLimitedResponse.Body.Bytes(), &rateLimitedPayload); err != nil {
		t.Fatalf("failed to decode rate-limited reminder response: %v", err)
	}
	if rateLimitedPayload.Status != "skipped_rate_limited" || rateLimitedPayload.PaymentReminderAvailable || rateLimitedPayload.PaymentReminderAvailableAt == nil {
		t.Fatalf("expected authoritative weekly cooldown, got %#v", rateLimitedPayload)
	}
	if len(sender.calls) != 1 {
		t.Fatalf("expected rate limit to avoid another provider send, got %#v", sender.calls)
	}
	assertNotificationDeliveryLogWithSignal(t, server.app, participant.Id, "bill_payment_reminder", "skipped_rate_limited", 0)
}

func TestBillPaymentReminderDeduplicatesActiveDevicesWithSamePushToken(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	creator, creatorToken := createAuthUser(t, server.app, false, false)
	participant, _ := createAuthUser(t, server.app, false, false)
	firstDevice := createNotificationDeviceRecord(t, server.app, participant.Id, "participant-device-1", "ExponentPushToken[participant]", true)
	secondDevice := createNotificationDeviceRecord(t, server.app, participant.Id, "participant-device-2", "ExponentPushToken[participant]", true)
	bill := seedBillRecord(t, server.app, creator.Id, "Duplicate Device Reminder")
	participantRecord := seedBillParticipantRecord(t, server.app, bill.Id, participant.Id, "Friend", 18, "pending")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/bills/"+bill.Id+"/participants/"+participantRecord.Id+"/payment-reminder",
		creatorToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected payment reminder to succeed, got %d: %s", response.Code, response.Body.String())
	}
	if len(sender.calls) != 1 {
		t.Fatalf("expected one provider send for duplicate push token, got %#v", sender.calls)
	}
	if sender.calls[0].token != "ExponentPushToken[participant]" {
		t.Fatalf("expected participant token, got %q", sender.calls[0].token)
	}
	assertNotificationDeliveryLogWithSignal(t, server.app, participant.Id, "bill_payment_reminder", "sent", 1)

	reloadedFirstDevice, err := server.app.FindRecordById("notification_devices", firstDevice.Id)
	if err != nil {
		t.Fatalf("failed to reload first device: %v", err)
	}
	reloadedSecondDevice, err := server.app.FindRecordById("notification_devices", secondDevice.Id)
	if err != nil {
		t.Fatalf("failed to reload second device: %v", err)
	}
	activeCount := 0
	for _, device := range []*core.Record{reloadedFirstDevice, reloadedSecondDevice} {
		if device.GetBool("active") {
			activeCount++
		}
	}
	if activeCount != 1 {
		t.Fatalf("expected exactly one duplicate-token device to remain active, got %d", activeCount)
	}
}

func TestBillPaymentReminderReservationPreventsDuplicateProviderSend(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	creator, creatorToken := createAuthUser(t, server.app, false, false)
	participant, _ := createAuthUser(t, server.app, false, false)
	createNotificationDeviceRecord(t, server.app, participant.Id, "participant-device", "ExponentPushToken[participant]", true)
	bill := seedBillRecord(t, server.app, creator.Id, "Reserved Reminder")
	participantRecord := seedBillParticipantRecord(t, server.app, bill.Id, participant.Id, "Friend", 18, "pending")
	createCollectionRecord(t, server.app, "notification_delivery_logs", map[string]any{
		"user":              participant.Id,
		"signal_type":       "bill_payment_reminder",
		"source_collection": "bill_participants",
		"source_record":     participantRecord.Id,
		"actor":             creator.Id,
		"delivery_key":      "bill_payment_reminder:" + participantRecord.Id + ":" + participant.Id,
		"status":            "provider_failed",
		"device_count":      0,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/bills/"+bill.Id+"/participants/"+participantRecord.Id+"/payment-reminder",
		creatorToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected reserved reminder to be rate limited, got %d: %s", response.Code, response.Body.String())
	}
	if len(sender.calls) != 0 {
		t.Fatalf("expected reservation to avoid provider send, got %#v", sender.calls)
	}
}

func TestBillPaymentReminderCooldownSurvivesPerDeviceReceiptFailure(t *testing.T) {
	sender := &recordingNotificationPushSender{messageIDs: []string{"receipt_reminder_1", "receipt_reminder_2"}}
	restoreSender := handlers.SetNotificationPushSenderForTests(sender)
	defer restoreSender()

	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	creator, creatorToken := createAuthUser(t, server.app, false, false)
	participant, _ := createAuthUser(t, server.app, false, false)
	createNotificationDeviceRecord(t, server.app, participant.Id, "participant-device-1", "ExponentPushToken[participant-one]", true)
	createNotificationDeviceRecord(t, server.app, participant.Id, "participant-device-2", "ExponentPushToken[participant-two]", true)
	bill := seedBillRecord(t, server.app, creator.Id, "Reminder Dinner")
	participantRecord := seedBillParticipantRecord(t, server.app, bill.Id, participant.Id, "Friend", 18, "pending")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/bills/"+bill.Id+"/participants/"+participantRecord.Id+"/payment-reminder",
		creatorToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected payment reminder to succeed, got %d: %s", response.Code, response.Body.String())
	}
	if len(sender.calls) != 2 {
		t.Fatalf("expected two payment reminder pushes, got %#v", sender.calls)
	}

	logRecord := assertNotificationDeliveryLogWithSignal(t, server.app, participant.Id, "bill_payment_reminder", "sent", 2)
	receipts := assertNotificationDeliveryReceiptRecords(t, server.app, logRecord.Id, 2)
	receiptsByProviderID := map[string]*core.Record{}
	for _, receipt := range receipts {
		receiptsByProviderID[receipt.GetString("provider_message_id")] = receipt
	}

	checker := &recordingNotificationReceiptChecker{receipts: map[string]handlers.RemoteDeviceNotificationReceipt{
		"receipt_reminder_1": {Status: "ok"},
		"receipt_reminder_2": {Status: "error", ErrorCode: "DeviceNotRegistered"},
	}}
	restoreChecker := handlers.SetNotificationPushReceiptCheckerForTests(checker)
	defer restoreChecker()

	checked, err := handlers.CheckPendingExpoPushReceipts(server.app, time.Now().UTC().Add(20*time.Minute))
	if err != nil {
		t.Fatalf("expected receipt check to succeed: %v", err)
	}
	if checked != 2 {
		t.Fatalf("expected two per-device receipt checks, got %d", checked)
	}

	failedReceipt := receiptsByProviderID["receipt_reminder_2"]
	assertNotificationDeviceActiveState(t, server.app, failedReceipt.GetString("notification_device"), false)
	for _, receipt := range receipts {
		if receipt.Id == failedReceipt.Id {
			continue
		}
		assertNotificationDeviceActiveState(t, server.app, receipt.GetString("notification_device"), true)
	}

	reloadedFailedReceipt, err := server.app.FindRecordById("notification_delivery_receipts", failedReceipt.Id)
	if err != nil {
		t.Fatalf("failed to reload failed delivery receipt: %v", err)
	}
	if reloadedFailedReceipt.GetString("receipt_status") != "error" || reloadedFailedReceipt.GetString("receipt_error_code") != "DeviceNotRegistered" {
		t.Fatalf("expected failed receipt metadata, got status=%q error=%q", reloadedFailedReceipt.GetString("receipt_status"), reloadedFailedReceipt.GetString("receipt_error_code"))
	}

	reloadedLog, err := server.app.FindRecordById("notification_delivery_logs", logRecord.Id)
	if err != nil {
		t.Fatalf("failed to reload delivery log: %v", err)
	}
	if reloadedLog.GetString("status") != "sent" || reloadedLog.GetString("receipt_error_code") != "DeviceNotRegistered" {
		t.Fatalf("expected parent reminder log to stay sent with receipt error summary, got status=%q error=%q", reloadedLog.GetString("status"), reloadedLog.GetString("receipt_error_code"))
	}

	rateLimitedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/bills/"+bill.Id+"/participants/"+participantRecord.Id+"/payment-reminder",
		creatorToken,
		"",
	)
	if rateLimitedResponse.Code != http.StatusOK {
		t.Fatalf("expected reminder to remain rate limited after receipt failure, got %d: %s", rateLimitedResponse.Code, rateLimitedResponse.Body.String())
	}
	if len(sender.calls) != 2 {
		t.Fatalf("expected rate limit to avoid another provider send, got %#v", sender.calls)
	}
	assertNotificationDeliveryLogWithSignal(t, server.app, participant.Id, "bill_payment_reminder", "skipped_rate_limited", 0)
}

func TestBillPaymentReminderAuthorizationAndIneligibleParticipants(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	creator, creatorToken := createAuthUser(t, server.app, false, false)
	otherUser, otherToken := createAuthUser(t, server.app, false, false)
	bill := seedBillRecord(t, server.app, creator.Id, "Reminder Dinner")
	pendingParticipant := seedBillParticipantRecord(t, server.app, bill.Id, otherUser.Id, "Friend", 18, "pending")
	paidParticipant := seedBillParticipantRecord(t, server.app, bill.Id, otherUser.Id, "Paid Friend", 12, "paid")
	customParticipant := seedBillParticipantRecord(t, server.app, bill.Id, "", "Cash Friend", 8, "pending")

	unauthorizedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/bills/"+bill.Id+"/participants/"+pendingParticipant.Id+"/payment-reminder",
		otherToken,
		"",
	)
	if unauthorizedResponse.Code != http.StatusForbidden {
		t.Fatalf("expected non-creator reminder to be forbidden, got %d: %s", unauthorizedResponse.Code, unauthorizedResponse.Body.String())
	}

	for _, participantID := range []string{paidParticipant.Id, customParticipant.Id} {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			"/api/bills/"+bill.Id+"/participants/"+participantID+"/payment-reminder",
			creatorToken,
			"",
		)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected ineligible participant to be rejected, got %d: %s", response.Code, response.Body.String())
		}
	}
	if len(sender.calls) != 0 {
		t.Fatalf("expected no provider sends for ineligible reminders, got %#v", sender.calls)
	}
}

func TestBillPaymentReminderPreferenceSuppression(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	creator, creatorToken := createAuthUser(t, server.app, false, false)
	participant, _ := createAuthUser(t, server.app, false, false)
	createNotificationDeviceRecord(t, server.app, participant.Id, "participant-device", "ExponentPushToken[participant]", true)
	createBillNotificationPreferenceRecord(t, server.app, participant.Id, false)
	bill := seedBillRecord(t, server.app, creator.Id, "Muted Reminder")
	participantRecord := seedBillParticipantRecord(t, server.app, bill.Id, participant.Id, "Friend", 18, "pending")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/bills/"+bill.Id+"/participants/"+participantRecord.Id+"/payment-reminder",
		creatorToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected preference-suppressed reminder request to succeed, got %d: %s", response.Code, response.Body.String())
	}
	if len(sender.calls) != 0 {
		t.Fatalf("expected disabled bill preference to suppress provider sends, got %#v", sender.calls)
	}
	assertNotificationDeliveryLogWithSignal(t, server.app, participant.Id, "bill_payment_reminder", "skipped_preference_disabled", 0)
}

func TestBillPaymentReminderRequiresActiveDevice(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, handlers.RegisterFeatureWriteHandlers)
	creator, creatorToken := createAuthUser(t, server.app, false, false)
	participant, _ := createAuthUser(t, server.app, false, false)
	createNotificationDeviceRecord(t, server.app, participant.Id, "participant-device", "ExponentPushToken[inactive]", false)
	bill := seedBillRecord(t, server.app, creator.Id, "Inactive Device Reminder")
	participantRecord := seedBillParticipantRecord(t, server.app, bill.Id, participant.Id, "Friend", 18, "pending")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/bills/"+bill.Id+"/participants/"+participantRecord.Id+"/payment-reminder",
		creatorToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected no-device reminder request to succeed, got %d: %s", response.Code, response.Body.String())
	}
	if len(sender.calls) != 0 {
		t.Fatalf("expected inactive devices to suppress provider sends, got %#v", sender.calls)
	}
	assertNotificationDeliveryLogWithSignal(t, server.app, participant.Id, "bill_payment_reminder", "skipped_no_active_device", 0)
}

func TestMonthlyFriendsActivityNotificationsSelectPreviousMonthFriendVisibleVisits(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	viewer, _ := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)
	privateFriend, _ := createAuthUser(t, server.app, false, false)
	pendingFriend, _ := createAuthUser(t, server.app, false, false)
	nonFriend, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, viewer.Id, friend.Id, "accepted")
	createFriendshipRecord(t, server.app, viewer.Id, privateFriend.Id, "accepted")
	createFriendshipRecord(t, server.app, viewer.Id, pendingFriend.Id, "pending")
	createNotificationDeviceRecord(t, server.app, viewer.Id, "viewer-device", "ExponentPushToken[viewer]", true)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Monthly Cafe",
		"location":   "Portland",
		"visibility": "friends",
	})
	createVisitRecordWithDate(t, server.app, friend.Id, restaurant.Id, "friends", "2026-04-15 12:00:00.000Z")
	createVisitRecordWithDate(t, server.app, friend.Id, restaurant.Id, "friends", "2026-03-31 23:59:59.000Z")
	createVisitRecordWithDate(t, server.app, friend.Id, restaurant.Id, "friends", "2026-05-01 00:00:00.000Z")
	createVisitRecordWithDate(t, server.app, privateFriend.Id, restaurant.Id, "private", "2026-04-10 12:00:00.000Z")
	createVisitRecordWithDate(t, server.app, pendingFriend.Id, restaurant.Id, "friends", "2026-04-11 12:00:00.000Z")
	createVisitRecordWithDate(t, server.app, nonFriend.Id, restaurant.Id, "friends", "2026-04-12 12:00:00.000Z")
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":       friend.Id,
		"restaurant": restaurant.Id,
		"name":       "Standalone snack",
		"rating":     4,
		"visibility": "friends",
		"itemType":   "food-product",
	})

	result, err := handlers.DeliverMonthlyFriendsActivityNotifications(server.app, time.Date(2026, 5, 2, 16, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("expected monthly friends activity delivery to succeed: %v", err)
	}
	if result.Eligible != 1 || result.Sent != 1 || result.Skipped != 0 {
		t.Fatalf("unexpected monthly delivery result: %#v", result)
	}
	if len(sender.calls) != 1 {
		t.Fatalf("expected one monthly friends activity notification, got %#v", sender.calls)
	}
	call := sender.calls[0]
	if call.token != "ExponentPushToken[viewer]" {
		t.Fatalf("expected viewer token, got %q", call.token)
	}
	if call.payload.Data["notificationType"] != "monthly_friends_activity" ||
		call.payload.Data["route"] != "Home" ||
		call.payload.Data["feedMode"] != "friends" ||
		call.payload.Data["period"] != "2026-04" {
		t.Fatalf("unexpected monthly friends activity payload: %#v", call.payload)
	}
	assertNotificationPayloadOmitsSensitiveText(t, call.payload, "Monthly Cafe", "Standalone snack", "1", "2")

	logRecord := assertNotificationDeliveryLogWithSignal(t, server.app, viewer.Id, "monthly_friends_activity", "sent", 1)
	if logRecord.GetString("source_collection") != "visits" || logRecord.GetString("source_record") != "2026-04" {
		t.Fatalf("expected month-scoped visits delivery log, got source %q/%q", logRecord.GetString("source_collection"), logRecord.GetString("source_record"))
	}
	for _, fieldName := range []string{"signal_type", "source_collection", "source_record", "delivery_key", "status", "provider_message_id", "error_code"} {
		fieldValue := logRecord.GetString(fieldName)
		if strings.Contains(fieldValue, "ExponentPushToken") || strings.Contains(fieldValue, call.payload.Body) {
			t.Fatalf("expected delivery log field %s to omit push token and body text, got %q", fieldName, fieldValue)
		}
	}
}

func TestMonthlyFriendsActivityNotificationsDedupePreferenceAndDeviceSuppression(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	sentViewer, _ := createAuthUser(t, server.app, false, false)
	disabledViewer, _ := createAuthUser(t, server.app, false, false)
	inactiveViewer, _ := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)
	for _, viewer := range []*core.Record{sentViewer, disabledViewer, inactiveViewer} {
		createFriendshipRecord(t, server.app, viewer.Id, friend.Id, "accepted")
	}
	createNotificationDeviceRecord(t, server.app, sentViewer.Id, "sent-device", "ExponentPushToken[sent]", true)
	createNotificationDeviceRecord(t, server.app, disabledViewer.Id, "disabled-device", "ExponentPushToken[disabled]", true)
	createNotificationDeviceRecord(t, server.app, inactiveViewer.Id, "inactive-device", "ExponentPushToken[inactive]", false)
	createMonthlyFriendsActivityNotificationPreferenceRecord(t, server.app, disabledViewer.Id, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Digest Diner",
		"location":   "Seattle",
		"visibility": "friends",
	})
	createVisitRecordWithDate(t, server.app, friend.Id, restaurant.Id, "friends", "2026-04-08 12:00:00.000Z")

	firstResult, err := handlers.DeliverMonthlyFriendsActivityNotifications(server.app, time.Date(2026, 5, 3, 16, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("expected first monthly friends activity delivery to succeed: %v", err)
	}
	if firstResult.Eligible != 3 || firstResult.Sent != 1 || firstResult.Skipped != 2 {
		t.Fatalf("unexpected first monthly delivery result: %#v", firstResult)
	}
	if len(sender.calls) != 1 {
		t.Fatalf("expected one provider send after suppression, got %#v", sender.calls)
	}
	assertNotificationDeliveryLogWithSignal(t, server.app, sentViewer.Id, "monthly_friends_activity", "sent", 1)
	assertNotificationDeliveryLogWithSignal(t, server.app, disabledViewer.Id, "monthly_friends_activity", "skipped_preference_disabled", 0)
	assertNotificationDeliveryLogWithSignal(t, server.app, inactiveViewer.Id, "monthly_friends_activity", "skipped_no_active_device", 0)

	secondResult, err := handlers.DeliverMonthlyFriendsActivityNotifications(server.app, time.Date(2026, 5, 4, 16, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("expected duplicate monthly friends activity delivery to succeed: %v", err)
	}
	if secondResult.Eligible != 3 || secondResult.Sent != 0 || secondResult.Skipped != 0 {
		t.Fatalf("expected duplicate run to be fully deduped, got %#v", secondResult)
	}
	if len(sender.calls) != 1 {
		t.Fatalf("expected dedupe to avoid another provider send, got %#v", sender.calls)
	}
}

func TestAdminMonthlyFriendsActivityTestEndpointTargetsUserAndCanForceSend(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	_, adminToken := createAuthUser(t, server.app, true, false)
	viewer, _ := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, viewer.Id, friend.Id, "accepted")
	createNotificationDeviceRecord(t, server.app, viewer.Id, "viewer-device", "ExponentPushToken[viewer]", true)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Preview Push Cafe",
		"location":   "San Francisco",
		"visibility": "friends",
	})
	createVisitRecordWithDate(t, server.app, friend.Id, restaurant.Id, "friends", "2026-04-18 12:00:00.000Z")

	firstResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/notifications/monthly-friends-activity/test",
		adminToken,
		`{"userId":"`+viewer.Id+`","month":"2026-04","force":true}`,
	)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected admin monthly notification test to succeed, got %d: %s", firstResponse.Code, firstResponse.Body.String())
	}
	if len(sender.calls) != 1 {
		t.Fatalf("expected forced test send, got %#v", sender.calls)
	}
	if sender.calls[0].payload.Data["route"] != "Home" || sender.calls[0].payload.Data["feedMode"] != "friends" {
		t.Fatalf("unexpected forced monthly test payload: %#v", sender.calls[0].payload)
	}

	secondResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/notifications/monthly-friends-activity/test",
		adminToken,
		`{"userId":"`+viewer.Id+`","month":"2026-04","force":true}`,
	)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected second forced admin monthly notification test to succeed, got %d: %s", secondResponse.Code, secondResponse.Body.String())
	}
	if len(sender.calls) != 2 {
		t.Fatalf("expected forced test send to bypass monthly dedupe, got %#v", sender.calls)
	}

	auditLogs, err := server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         core.ModelEventTypeCreate,
			"collection":     "notification_delivery_logs",
			"targetRecordId": viewer.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load monthly notification test audit logs: %v", err)
	}
	if len(auditLogs) != 2 {
		t.Fatalf("expected 2 monthly notification test audit logs, got %d", len(auditLogs))
	}
	metadataMap := parseAuditMetadata(t, auditLogs[0].Get("metadataJson"))
	if metadataMap["source"] != "admin_monthly_friends_activity_notification_test" ||
		metadataMap["status"] != "sent" ||
		metadataMap["force"] != true {
		t.Fatalf("unexpected monthly notification test audit metadata: %#v", metadataMap)
	}
}

func TestAdminMonthlyFriendsActivityTestEndpointReturnsDiagnosticsWhenNoMatch(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	_, adminToken := createAuthUser(t, server.app, true, false)
	viewer, _ := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, viewer.Id, friend.Id, "accepted")
	createNotificationDeviceRecord(t, server.app, viewer.Id, "viewer-device", "ExponentPushToken[viewer]", true)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Diagnostic Cafe",
		"location":   "San Francisco",
		"visibility": "friends",
	})
	createVisitRecordWithDate(t, server.app, friend.Id, restaurant.Id, "private", "2026-04-18 12:00:00.000Z")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/notifications/monthly-friends-activity/test",
		adminToken,
		`{"userId":"`+viewer.Id+`","month":"2026-04","force":true}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected diagnostic response to succeed, got %d: %s", response.Code, response.Body.String())
	}
	payload := parseJSONResponse[map[string]any](t, response.Body.Bytes())
	if payload["status"] != "skipped_no_matching_activity" {
		t.Fatalf("expected no-match status, got %#v", payload)
	}
	diagnostics, ok := payload["diagnostics"].(map[string]any)
	if !ok {
		t.Fatalf("expected diagnostics payload, got %#v", payload)
	}
	if diagnostics["acceptedFriendCount"] != float64(1) ||
		diagnostics["privateAcceptedFriendCountInMonth"] != float64(1) ||
		diagnostics["friendVisibleVisitDateCountInMonth"] != float64(0) {
		t.Fatalf("unexpected diagnostics payload: %#v", diagnostics)
	}
	if len(sender.calls) != 0 {
		t.Fatalf("expected no provider send for no-match diagnostic response, got %#v", sender.calls)
	}

	auditLogs, err := server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         core.ModelEventTypeCreate,
			"collection":     "notification_delivery_logs",
			"targetRecordId": viewer.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load monthly notification diagnostic audit logs: %v", err)
	}
	if len(auditLogs) != 1 {
		t.Fatalf("expected 1 monthly notification diagnostic audit log, got %d", len(auditLogs))
	}
	metadataMap := parseAuditMetadata(t, auditLogs[0].Get("metadataJson"))
	if metadataMap["source"] != "admin_monthly_friends_activity_notification_test" ||
		metadataMap["status"] != "skipped_no_matching_activity" {
		t.Fatalf("unexpected monthly notification diagnostic audit metadata: %#v", metadataMap)
	}
}

func TestAdminBillOwedNotificationTestEndpointSendsToAddedUsersWithoutBill(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	_, adminToken := createAuthUser(t, server.app, true, false)
	firstRecipient, _ := createAuthUser(t, server.app, false, false)
	secondRecipient, _ := createAuthUser(t, server.app, false, false)
	createNotificationDeviceRecord(t, server.app, firstRecipient.Id, "first-device", "ExponentPushToken[first]", true)
	createNotificationDeviceRecord(t, server.app, secondRecipient.Id, "second-device", "ExponentPushToken[second]", true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/notifications/bill-owed/test",
		adminToken,
		`{"userIds":["`+firstRecipient.Id+`","`+secondRecipient.Id+`"]}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected admin bill notification test to succeed, got %d: %s", response.Code, response.Body.String())
	}
	payload := parseJSONResponse[map[string]any](t, response.Body.Bytes())
	billID, ok := payload["billId"].(string)
	if !ok || !strings.HasPrefix(billID, "admin-test-bill-") {
		t.Fatalf("expected synthetic bill id, got %#v", payload)
	}
	if len(sender.calls) != 2 {
		t.Fatalf("expected test notification for each added user, got %#v", sender.calls)
	}
	for _, call := range sender.calls {
		if call.payload.Data["notificationType"] != "bill_owed" ||
			call.payload.Data["route"] != "Bills" ||
			call.payload.Data["billId"] != billID {
			t.Fatalf("unexpected bill notification payload: %#v", call.payload)
		}
	}
	assertNotificationDeliveryLogWithSignal(t, server.app, firstRecipient.Id, "bill_owed", "sent", 1)
	assertNotificationDeliveryLogWithSignal(t, server.app, secondRecipient.Id, "bill_owed", "sent", 1)

	bills, err := server.app.FindRecordsByFilter("bills", "", "", 1, 0)
	if err != nil {
		t.Fatalf("failed to inspect bills: %v", err)
	}
	if len(bills) != 0 {
		t.Fatalf("expected admin notification test not to create a bill, got %d bill record(s)", len(bills))
	}
}

func TestAdminTastingInviteNotificationTestEndpointSendsWithoutSession(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterNotificationHandlers(se, app)
	})
	_, adminToken := createAuthUser(t, server.app, true, false)
	invitee, _ := createAuthUser(t, server.app, false, false)
	createNotificationDeviceRecord(t, server.app, invitee.Id, "invitee-device", "ExponentPushToken[invitee]", true)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/notifications/tasting-invite/test",
		adminToken,
		`{"userId":"`+invitee.Id+`"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected admin tasting invite notification test to succeed, got %d: %s", response.Code, response.Body.String())
	}
	payload := parseJSONResponse[map[string]any](t, response.Body.Bytes())
	sessionID, ok := payload["sessionId"].(string)
	if !ok || !strings.HasPrefix(sessionID, "admin-test-session-") {
		t.Fatalf("expected synthetic session id, got %#v", payload)
	}
	if payload["status"] != "sent" || payload["userId"] != invitee.Id {
		t.Fatalf("unexpected tasting invite test response: %#v", payload)
	}
	if len(sender.calls) != 1 {
		t.Fatalf("expected one tasting invite test notification, got %#v", sender.calls)
	}
	if sender.calls[0].token != "ExponentPushToken[invitee]" ||
		sender.calls[0].payload.Data["notificationType"] != "tasting_invite" ||
		sender.calls[0].payload.Data["route"] != "TastingSessions" ||
		sender.calls[0].payload.Data["sessionId"] != sessionID {
		t.Fatalf("unexpected tasting invite payload: %#v", sender.calls[0])
	}
	assertNotificationDeliveryLogWithSignal(t, server.app, invitee.Id, "tasting_invite", "sent", 1)

	sessions, err := server.app.FindRecordsByFilter("tasting_sessions", "", "", 1, 0)
	if err != nil {
		t.Fatalf("failed to inspect tasting sessions: %v", err)
	}
	if len(sessions) != 0 {
		t.Fatalf("expected admin notification test not to create a tasting session, got %d session record(s)", len(sessions))
	}
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

func createNotificationDeliveryLogRecord(t *testing.T, app core.App, userID string, deliveryKey string, status string) *core.Record {
	t.Helper()
	return createCollectionRecord(t, app, "notification_delivery_logs", map[string]any{
		"user":              userID,
		"signal_type":       tastingInviteNotificationSignalTypeForTests(),
		"source_collection": "tasting_sessions",
		"source_record":     "source-1",
		"delivery_key":      deliveryKey,
		"status":            status,
		"device_count":      1,
	})
}

func createPendingNotificationReceiptLogRecord(t *testing.T, app core.App, userID string, deviceID string, receiptID string, nextCheckAt string) *core.Record {
	t.Helper()
	return createCollectionRecord(t, app, "notification_delivery_logs", map[string]any{
		"user":                  userID,
		"signal_type":           tastingInviteNotificationSignalTypeForTests(),
		"source_collection":     "tasting_sessions",
		"source_record":         "source-1",
		"delivery_key":          "receipt:" + receiptID,
		"status":                "sent",
		"device_count":          1,
		"notification_device":   deviceID,
		"provider_message_id":   receiptID,
		"receipt_status":        "pending",
		"receipt_next_check_at": nextCheckAt,
	})
}

func createNotificationDeliveryReceiptRecord(t *testing.T, app core.App, logID string, deviceID string, receiptID string, nextCheckAt string) *core.Record {
	t.Helper()
	return createCollectionRecord(t, app, "notification_delivery_receipts", map[string]any{
		"notification_delivery_log": logID,
		"notification_device":       deviceID,
		"provider_message_id":       receiptID,
		"receipt_status":            "pending",
		"receipt_next_check_at":     nextCheckAt,
	})
}

func tastingInviteNotificationSignalTypeForTests() string {
	return "tasting_invite"
}

func createNotificationPreferenceRecord(t *testing.T, app core.App, userID string, tastingInvitesEnabled bool) *core.Record {
	t.Helper()
	return createCollectionRecord(t, app, "notification_preferences", map[string]any{
		"user":                             userID,
		"bill_owed_enabled":                true,
		"monthly_friends_activity_enabled": true,
		"tasting_invites_enabled":          tastingInvitesEnabled,
	})
}

func createBillNotificationPreferenceRecord(t *testing.T, app core.App, userID string, billOwedEnabled bool) *core.Record {
	t.Helper()
	return createCollectionRecord(t, app, "notification_preferences", map[string]any{
		"user":                             userID,
		"bill_owed_enabled":                billOwedEnabled,
		"monthly_friends_activity_enabled": true,
		"tasting_invites_enabled":          true,
	})
}

func createMonthlyFriendsActivityNotificationPreferenceRecord(t *testing.T, app core.App, userID string, enabled bool) *core.Record {
	t.Helper()
	return createCollectionRecord(t, app, "notification_preferences", map[string]any{
		"user":                             userID,
		"bill_owed_enabled":                true,
		"monthly_friends_activity_enabled": enabled,
		"tasting_invites_enabled":          true,
	})
}

func createVisitRecordWithDate(t *testing.T, app core.App, userID string, restaurantID string, visibility string, visitDate string) *core.Record {
	t.Helper()
	return createCollectionRecord(t, app, "visits", map[string]any{
		"user":       userID,
		"restaurant": restaurantID,
		"visitDate":  visitDate,
		"visibility": visibility,
	})
}

func assertNotificationDeliveryLogIDExists(t *testing.T, app core.App, recordID string) {
	t.Helper()
	if _, err := app.FindRecordById("notification_delivery_logs", recordID); err != nil {
		t.Fatalf("expected notification delivery log %s to exist: %v", recordID, err)
	}
}

func assertNotificationDeliveryLogIDMissing(t *testing.T, app core.App, recordID string) {
	t.Helper()
	if _, err := app.FindRecordById("notification_delivery_logs", recordID); err == nil {
		t.Fatalf("expected notification delivery log %s to be removed", recordID)
	}
}

func assertNotificationDeviceActiveState(t *testing.T, app core.App, recordID string, expectedActive bool) {
	t.Helper()
	record, err := app.FindRecordById("notification_devices", recordID)
	if err != nil {
		t.Fatalf("failed to load notification device %s: %v", recordID, err)
	}
	if record.GetBool("active") != expectedActive {
		t.Fatalf("expected notification device %s active=%v, got %v", recordID, expectedActive, record.GetBool("active"))
	}
}

func assertNotificationDeliveryLog(t *testing.T, app core.App, userID string, status string, deviceCount int) *core.Record {
	t.Helper()
	return assertNotificationDeliveryLogWithSignal(t, app, userID, "tasting_invite", status, deviceCount)
}

func assertNotificationDeliveryLogWithSignal(t *testing.T, app core.App, userID string, signalType string, status string, deviceCount int) *core.Record {
	t.Helper()
	records, err := app.FindRecordsByFilter(
		"notification_delivery_logs",
		"user = {:user} && signal_type = {:signalType} && status = {:status}",
		"",
		10,
		0,
		map[string]any{"user": userID, "signalType": signalType, "status": status},
	)
	if err != nil {
		t.Fatalf("failed to load delivery log: %v", err)
	}
	if len(records) == 0 {
		t.Fatalf("expected delivery log status %q for user %s", status, userID)
	}
	record := records[0]
	if record.GetString("signal_type") != signalType {
		t.Fatalf("expected signal type %q, got %q", signalType, record.GetString("signal_type"))
	}
	if strings.TrimSpace(record.GetString("source_collection")) == "" || strings.TrimSpace(record.GetString("source_record")) == "" {
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

func assertNotificationDeliveryReceiptRecords(t *testing.T, app core.App, logID string, expectedCount int) []*core.Record {
	t.Helper()
	records, err := app.FindRecordsByFilter(
		"notification_delivery_receipts",
		"notification_delivery_log = {:logID}",
		"provider_message_id",
		10,
		0,
		map[string]any{"logID": logID},
	)
	if err != nil {
		t.Fatalf("failed to load delivery receipt records: %v", err)
	}
	if len(records) != expectedCount {
		t.Fatalf("expected %d delivery receipt records, got %d", expectedCount, len(records))
	}
	return records
}

func assertNotificationPayloadOmitsSensitiveText(t *testing.T, payload handlers.RemoteDeviceNotificationPayload, sensitiveValues ...string) {
	t.Helper()
	visibleCopy := payload.Title + " " + payload.Body
	for _, sensitiveValue := range sensitiveValues {
		if strings.TrimSpace(sensitiveValue) == "" {
			continue
		}
		if strings.Contains(visibleCopy, sensitiveValue) {
			t.Fatalf("expected notification visible copy to omit %q, got title=%q body=%q", sensitiveValue, payload.Title, payload.Body)
		}
	}
}
