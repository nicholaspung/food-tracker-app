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
		"bill_owed_enabled":       true,
		"tasting_invites_enabled": tastingInvitesEnabled,
	})
}

func createBillNotificationPreferenceRecord(t *testing.T, app core.App, userID string, billOwedEnabled bool) *core.Record {
	t.Helper()
	return createCollectionRecord(t, app, "notification_preferences", map[string]any{
		"user":                    userID,
		"bill_owed_enabled":       billOwedEnabled,
		"tasting_invites_enabled": true,
	})
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
