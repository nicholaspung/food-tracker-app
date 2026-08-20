package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

type blockingTastingInviteSender struct {
	started chan struct{}
	release chan struct{}
	once    sync.Once
}

func (sender *blockingTastingInviteSender) SendRemoteDeviceNotification(
	_ string,
	_ handlers.RemoteDeviceNotificationPayload,
) (string, error) {
	sender.once.Do(func() { close(sender.started) })
	<-sender.release
	return "message_1", nil
}

func TestTastingInviteCreationRejectsUnauthorizedRecipientsAtomically(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	leader, leaderToken := createAuthUser(t, server.app, false, false)
	acceptedFriend, _ := createAuthUser(t, server.app, false, false)
	nonFriend, _ := createAuthUser(t, server.app, false, false)
	pendingFriend, _ := createAuthUser(t, server.app, false, false)
	blockedFriend, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, acceptedFriend.Id, leader.Id, "accepted")
	createFriendshipRecord(t, server.app, leader.Id, pendingFriend.Id, "pending")
	createFriendshipRecord(t, server.app, blockedFriend.Id, leader.Id, "blocked")
	createNotificationDeviceRecord(t, server.app, nonFriend.Id, "target-device", "ExponentPushToken[target]", true)

	testCases := []struct {
		name       string
		recipients []string
	}{
		{name: "self", recipients: []string{leader.Id}},
		{name: "pending friend", recipients: []string{pendingFriend.Id}},
		{name: "blocked friend", recipients: []string{blockedFriend.Id}},
		{name: "mixed accepted friend and nonfriend", recipients: []string{acceptedFriend.Id, nonFriend.Id}},
	}
	for _, testCase := range testCases {
		body, err := json.Marshal(map[string]any{
			"name":                testCase.name,
			"joinDurationMinutes": 60,
			"invitedUserIds":      testCase.recipients,
		})
		if err != nil {
			t.Fatalf("failed to encode create body: %v", err)
		}
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			"/api/tasting-sessions",
			leaderToken,
			string(body),
		)
		if response.Code != http.StatusForbidden {
			t.Fatalf("expected %s invite to return 403, got %d: %s", testCase.name, response.Code, response.Body.String())
		}
	}

	if count := countRecordsByFilter(t, server.app, "tasting_sessions", "leader = {:leader}", map[string]any{"leader": leader.Id}); count != 0 {
		t.Fatalf("expected unauthorized invite attempts to create no sessions, got %d", count)
	}
	if count := countRecordsByFilter(t, server.app, "tasting_session_invites", "", nil); count != 0 {
		t.Fatalf("expected unauthorized invite attempts to create no invites, got %d", count)
	}
	if count := countRecordsByFilter(t, server.app, "notification_delivery_logs", "signal_type = 'tasting_invite'", nil); count != 0 {
		t.Fatalf("expected unauthorized invite attempts to create no delivery logs, got %d", count)
	}
	if len(sender.calls) != 0 {
		t.Fatalf("expected unauthorized invite attempts to make no provider calls, got %#v", sender.calls)
	}
}

func TestTastingInviteCreationNormalizesAcceptedFriendsBeforeApplyingCap(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	leader, leaderToken := createAuthUser(t, server.app, false, false)

	rawInvitees := make([]string, 0, 22)
	for index := 0; index < 11; index++ {
		invitee, _ := createAuthUser(t, server.app, false, false)
		if index%2 == 0 {
			createFriendshipRecord(t, server.app, leader.Id, invitee.Id, "accepted")
		} else {
			createFriendshipRecord(t, server.app, invitee.Id, leader.Id, "accepted")
		}
		rawInvitees = append(rawInvitees, " "+invitee.Id+" ", invitee.Id)
	}

	body, err := json.Marshal(map[string]any{
		"name":                "Normalized Invitees",
		"joinDurationMinutes": 60,
		"invitedUserIds":      rawInvitees,
	})
	if err != nil {
		t.Fatalf("failed to encode normalized invite body: %v", err)
	}
	response := performJSONRequest(t, server.mux, http.MethodPost, "/api/tasting-sessions", leaderToken, string(body))
	if response.Code != http.StatusOK {
		t.Fatalf("expected 11 unique accepted friends to succeed, got %d: %s", response.Code, response.Body.String())
	}
	createdSession := parseJSONResponse[tastingSessionResponse](t, response.Body.Bytes())
	if len(createdSession.Invites) != 11 {
		t.Fatalf("expected duplicate invitees to normalize to 11 invites, got %d", len(createdSession.Invites))
	}

	overLimitInvitees := make([]string, 0, 12)
	for index := 0; index < 12; index++ {
		invitee, _ := createAuthUser(t, server.app, false, false)
		createFriendshipRecord(t, server.app, leader.Id, invitee.Id, "accepted")
		overLimitInvitees = append(overLimitInvitees, invitee.Id)
	}
	overLimitBody, err := json.Marshal(map[string]any{
		"name":                "Too Many Invitees",
		"joinDurationMinutes": 60,
		"invitedUserIds":      overLimitInvitees,
	})
	if err != nil {
		t.Fatalf("failed to encode over-limit invite body: %v", err)
	}
	overLimitResponse := performJSONRequest(t, server.mux, http.MethodPost, "/api/tasting-sessions", leaderToken, string(overLimitBody))
	if overLimitResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 12 unique invitees to return 400, got %d: %s", overLimitResponse.Code, overLimitResponse.Body.String())
	}
	if count := countRecordsByFilter(t, server.app, "tasting_sessions", "leader = {:leader}", map[string]any{"leader": leader.Id}); count != 1 {
		t.Fatalf("expected over-limit request to create no additional session, got %d", count)
	}
}

func TestTastingInviteCooldownIsSharedAcrossSessionsAndResend(t *testing.T) {
	sender := &recordingNotificationPushSender{}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	leader, leaderToken := createAuthUser(t, server.app, false, false)
	invitee, inviteeToken := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, leader.Id, invitee.Id, "accepted")
	createNotificationDeviceRecord(t, server.app, invitee.Id, "invitee-device", "ExponentPushToken[invitee]", true)

	firstResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"First Flight","joinDurationMinutes":60,"invitedUserIds":["`+invitee.Id+`"]}`,
	)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first invite to succeed, got %d: %s", firstResponse.Code, firstResponse.Body.String())
	}
	createdSession := parseJSONResponse[tastingSessionResponse](t, firstResponse.Body.Bytes())
	deliveryLog := assertNotificationDeliveryLog(t, server.app, invitee.Id, "sent", 1)
	if deliveryLog.GetString("actor") != leader.Id {
		t.Fatalf("expected invite log actor %q, got %q", leader.Id, deliveryLog.GetString("actor"))
	}

	secondResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Second Flight","joinDurationMinutes":60,"invitedUserIds":["`+invitee.Id+`"]}`,
	)
	if secondResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected cross-session invite cooldown to return 429, got %d: %s", secondResponse.Code, secondResponse.Body.String())
	}

	dismissResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/dismiss-invite",
		inviteeToken,
		`{}`,
	)
	if dismissResponse.Code != http.StatusOK {
		t.Fatalf("expected invite dismissal to succeed, got %d: %s", dismissResponse.Code, dismissResponse.Body.String())
	}
	resendResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/"+createdSession.ID+"/invites/"+createdSession.Invites[0].ID+"/resend",
		leaderToken,
		`{}`,
	)
	if resendResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected create-to-resend cooldown to return 429, got %d: %s", resendResponse.Code, resendResponse.Body.String())
	}

	inviteRecord, err := server.app.FindRecordById("tasting_session_invites", createdSession.Invites[0].ID)
	if err != nil {
		t.Fatalf("failed to reload cooled-down invite: %v", err)
	}
	if inviteRecord.GetString("status") != "dismissed" {
		t.Fatalf("expected cooldown rejection to preserve dismissed status, got %q", inviteRecord.GetString("status"))
	}
	if count := countRecordsByFilter(t, server.app, "tasting_sessions", "leader = {:leader}", map[string]any{"leader": leader.Id}); count != 1 {
		t.Fatalf("expected cooldown rejection to create no second session, got %d", count)
	}
	if count := countRecordsByFilter(t, server.app, "notification_delivery_logs", "signal_type = 'tasting_invite'", nil); count != 1 {
		t.Fatalf("expected cooldown rejections to create no delivery logs, got %d", count)
	}
	if len(sender.calls) != 1 {
		t.Fatalf("expected cooldown rejections to make no additional provider calls, got %#v", sender.calls)
	}
}

func TestTastingRouteBudgetsAreIsolatedPerActor(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	leader, leaderToken := createAuthUser(t, server.app, false, false)
	otherLeader, otherLeaderToken := createAuthUser(t, server.app, false, false)

	for attempt := 0; attempt < 5; attempt++ {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			"/api/tasting-sessions",
			leaderToken,
			fmt.Sprintf(`{"name":"Budget Flight %d","joinDurationMinutes":60}`, attempt),
		)
		if response.Code != http.StatusOK {
			t.Fatalf("expected creation attempt %d to succeed, got %d: %s", attempt+1, response.Code, response.Body.String())
		}
	}
	limitedCreate := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		leaderToken,
		`{"name":"Blocked Flight","joinDurationMinutes":60}`,
	)
	if limitedCreate.Code != http.StatusTooManyRequests {
		t.Fatalf("expected sixth creation request to return 429, got %d: %s", limitedCreate.Code, limitedCreate.Body.String())
	}
	otherActorCreate := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions",
		otherLeaderToken,
		`{"name":"Other Actor Flight","joinDurationMinutes":60}`,
	)
	if otherActorCreate.Code != http.StatusOK {
		t.Fatalf("expected another actor on the same test client to retain their budget, got %d: %s", otherActorCreate.Code, otherActorCreate.Body.String())
	}

	for attempt := 0; attempt < 10; attempt++ {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			fmt.Sprintf("/api/tasting-sessions/missing-session/invites/missing-invite-%d/resend", attempt),
			leaderToken,
			`{}`,
		)
		if response.Code == http.StatusTooManyRequests {
			t.Fatalf("expected resend attempt %d to remain within budget", attempt+1)
		}
	}
	limitedResend := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/tasting-sessions/missing-session/invites/limited-invite/resend",
		leaderToken,
		`{}`,
	)
	if limitedResend.Code != http.StatusTooManyRequests {
		t.Fatalf("expected eleventh resend request to return 429, got %d: %s", limitedResend.Code, limitedResend.Body.String())
	}

	if count := countRecordsByFilter(t, server.app, "tasting_sessions", "leader = {:leader}", map[string]any{"leader": leader.Id}); count != 5 {
		t.Fatalf("expected creation budget to stop at five sessions, got %d", count)
	}
	if count := countRecordsByFilter(t, server.app, "tasting_sessions", "leader = {:leader}", map[string]any{"leader": otherLeader.Id}); count != 1 {
		t.Fatalf("expected the other actor to create one session, got %d", count)
	}
}

func TestTastingInviteDeliveryDoesNotHoldTheInviteTransactionLock(t *testing.T) {
	sender := &blockingTastingInviteSender{started: make(chan struct{}), release: make(chan struct{})}
	restore := handlers.SetNotificationPushSenderForTests(sender)
	defer restore()

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterTastingSessionHandlers(se, app)
	})
	firstLeader, firstLeaderToken := createAuthUser(t, server.app, false, false)
	firstInvitee, _ := createAuthUser(t, server.app, false, false)
	secondLeader, secondLeaderToken := createAuthUser(t, server.app, false, false)
	secondInvitee, _ := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, firstLeader.Id, firstInvitee.Id, "accepted")
	createFriendshipRecord(t, server.app, secondLeader.Id, secondInvitee.Id, "accepted")
	createNotificationDeviceRecord(t, server.app, firstInvitee.Id, "blocking-device", "ExponentPushToken[blocking]", true)

	firstResponse := make(chan int, 1)
	go func() {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			"/api/tasting-sessions",
			firstLeaderToken,
			`{"name":"Blocking Delivery","joinDurationMinutes":60,"invitedUserIds":["`+firstInvitee.Id+`"]}`,
		)
		firstResponse <- response.Code
	}()

	select {
	case <-sender.started:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for the first provider call")
	}

	secondResponse := make(chan int, 1)
	go func() {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			"/api/tasting-sessions",
			secondLeaderToken,
			`{"name":"Independent Delivery","joinDurationMinutes":60,"invitedUserIds":["`+secondInvitee.Id+`"]}`,
		)
		secondResponse <- response.Code
	}()

	select {
	case status := <-secondResponse:
		if status != http.StatusOK {
			close(sender.release)
			t.Fatalf("expected independent invite to complete during provider wait, got %d", status)
		}
	case <-time.After(5 * time.Second):
		close(sender.release)
		t.Fatal("independent invite remained blocked by provider delivery")
	}

	close(sender.release)
	if status := <-firstResponse; status != http.StatusOK {
		t.Fatalf("expected first invite to finish after provider release, got %d", status)
	}
}
