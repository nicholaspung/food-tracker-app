package handlers_test

import (
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

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

func TestNotificationProviderInvalidTokenDeactivatesDeviceAndSuppressesFutureSends(t *testing.T) {
	sender := &recordingNotificationPushSender{err: errors.New("DeviceNotRegistered")}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	_, leaderToken := createAuthUser(t, server.app, false, false)
	invitee, _ := createAuthUser(t, server.app, false, false)
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
	if strings.Contains(call.payload.Body, "15") || strings.Contains(call.payload.Body, "$") {
		t.Fatalf("expected bill notification copy to omit amount, got %q", call.payload.Body)
	}
	assertNotificationDeliveryLogWithSignal(t, server.app, appParticipant.Id, "bill_owed", "sent", 1)
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
	if strings.Contains(call.payload.Body, "18") || strings.Contains(call.payload.Body, "$") {
		t.Fatalf("expected reminder copy to omit amount, got %q", call.payload.Body)
	}

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
	if rateLimitedResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected weekly rate limit response, got %d: %s", rateLimitedResponse.Code, rateLimitedResponse.Body.String())
	}
	if len(sender.calls) != 1 {
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
