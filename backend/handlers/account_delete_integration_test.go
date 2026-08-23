package handlers_test

import (
	"net/http"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/lib"
)

func createCollectionRecordWithKnownFields(
	t *testing.T,
	app core.App,
	collectionName string,
	data map[string]any,
) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		t.Fatalf("failed to resolve %s collection: %v", collectionName, err)
	}

	record := core.NewRecord(collection)
	for key, value := range data {
		if collection.Fields.GetByName(key) == nil {
			continue
		}
		record.Set(key, value)
	}

	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create %s record: %v", collectionName, err)
	}

	return record
}

func TestDeleteAccountRequiresAuthentication(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/account/delete",
		"",
		`{"currentPassword":"password123"}`,
	)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", response.Code, response.Body.String())
	}
}

func TestDeleteAccountRejectsIncorrectPassword(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	user, token := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/account/delete",
		token,
		`{"currentPassword":"wrong-password"}`,
	)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}
	if !strings.Contains(strings.ToLower(response.Body.String()), "current password is incorrect") {
		t.Fatalf("expected incorrect-password message, got %s", response.Body.String())
	}

	if _, err := server.app.FindRecordById("users", user.Id); err != nil {
		t.Fatalf("expected user to remain after rejected delete, got error: %v", err)
	}
}

func TestDeleteAccountReauthenticationLimitPersistsAcrossBearerAndAddressChanges(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})
	server.app.Settings().TrustedProxy.Headers = []string{"X-Forwarded-For"}

	user, token := createAuthUser(t, server.app, false, false)
	for attempt := 1; attempt <= 5; attempt++ {
		response := performJSONRequestWithHeaders(
			t,
			server.mux,
			http.MethodPost,
			"/api/account/delete",
			token,
			`{"currentPassword":"wrong-password"}`,
			map[string]string{"X-Forwarded-For": "198.51.100." + strconv.Itoa(attempt)},
		)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected attempt %d to reach password validation, got %d: %s", attempt, response.Code, response.Body.String())
		}
	}

	user.RefreshTokenKey()
	if err := server.app.Save(user); err != nil {
		t.Fatalf("failed to rotate bearer token: %v", err)
	}
	refreshedToken, err := user.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create refreshed bearer token: %v", err)
	}

	limitedResponse := performJSONRequestWithHeaders(
		t,
		server.mux,
		http.MethodPost,
		"/api/account/delete",
		refreshedToken,
		`{"currentPassword":"password123"}`,
		map[string]string{"X-Forwarded-For": "203.0.113.50"},
	)
	if limitedResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected refreshed bearer to remain rate limited, got %d: %s", limitedResponse.Code, limitedResponse.Body.String())
	}
	if retryAfter := limitedResponse.Header().Get("Retry-After"); retryAfter == "" {
		t.Fatal("expected account-bound rate limit to set Retry-After")
	}
	if _, err := server.app.FindRecordById("users", user.Id); err != nil {
		t.Fatalf("expected rate-limited user to remain, got error: %v", err)
	}
}

func TestDeleteAccountReauthenticationLimitsAreIsolatedAndExpire(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	limitedUser, limitedToken := createAuthUser(t, server.app, false, false)
	otherUser, otherToken := createAuthUser(t, server.app, false, false)
	for attempt := 1; attempt <= 5; attempt++ {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			"/api/account/delete",
			limitedToken,
			`{"currentPassword":"wrong-password"}`,
		)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected attempt %d to reach password validation, got %d: %s", attempt, response.Code, response.Body.String())
		}
	}

	otherResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/account/delete",
		otherToken,
		`{"currentPassword":"password123"}`,
	)
	if otherResponse.Code != http.StatusOK {
		t.Fatalf("expected separate user to delete below the limit, got %d: %s", otherResponse.Code, otherResponse.Body.String())
	}
	if _, err := server.app.FindRecordById("users", otherUser.Id); err == nil {
		t.Fatal("expected separate user to be deleted")
	}

	rateLimitRecord, err := server.app.FindFirstRecordByFilter(
		"rate_limits",
		"ip_address = {:key}",
		map[string]any{"key": "account-delete:" + limitedUser.Id},
	)
	if err != nil {
		t.Fatalf("failed to load account deletion rate limit: %v", err)
	}
	rateLimitRecord.Set("locked_until", time.Now().Add(-time.Second).Unix())
	if err := server.app.Save(rateLimitRecord); err != nil {
		t.Fatalf("failed to expire account deletion rate limit: %v", err)
	}

	afterExpiryResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/account/delete",
		limitedToken,
		`{"currentPassword":"password123"}`,
	)
	if afterExpiryResponse.Code != http.StatusOK {
		t.Fatalf("expected deletion after rate limit expiry, got %d: %s", afterExpiryResponse.Code, afterExpiryResponse.Body.String())
	}
}

func TestDeleteAccountReauthenticationLimitIsAtomic(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, token := createAuthUser(t, server.app, false, false)
	const requestCount = 8
	responses := make(chan int, requestCount)
	start := make(chan struct{})
	var requests sync.WaitGroup
	for range requestCount {
		requests.Add(1)
		go func() {
			defer requests.Done()
			<-start
			response := performJSONRequest(
				t,
				server.mux,
				http.MethodPost,
				"/api/account/delete",
				token,
				`{"currentPassword":"wrong-password"}`,
			)
			responses <- response.Code
		}()
	}
	close(start)
	requests.Wait()
	close(responses)

	badRequestCount := 0
	rateLimitedCount := 0
	for responseCode := range responses {
		switch responseCode {
		case http.StatusBadRequest:
			badRequestCount++
		case http.StatusTooManyRequests:
			rateLimitedCount++
		default:
			t.Fatalf("unexpected response status %d", responseCode)
		}
	}
	if badRequestCount != 5 || rateLimitedCount != requestCount-5 {
		t.Fatalf("expected 5 password validations and %d rate limits, got %d and %d", requestCount-5, badRequestCount, rateLimitedCount)
	}
}

func TestDeleteAccountRouteRateLimitBlocksBeforePasswordVerification(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	user, token := createAuthUser(t, server.app, false, false)
	server.app.Settings().RateLimits.Enabled = true
	server.app.Settings().RateLimits.Rules = []core.RateLimitRule{
		{Label: "POST /api/account/delete", Audience: "@auth", Duration: 60, MaxRequests: 1},
	}

	firstResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/account/delete",
		token,
		`{"currentPassword":"wrong-password"}`,
	)
	if firstResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected first request to reach password validation, got %d: %s", firstResponse.Code, firstResponse.Body.String())
	}

	limitedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/account/delete",
		token,
		`{"currentPassword":"password123"}`,
	)
	if limitedResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected route rate limit to return 429, got %d: %s", limitedResponse.Code, limitedResponse.Body.String())
	}
	if retryAfter := limitedResponse.Header().Get("Retry-After"); retryAfter == "" {
		t.Fatal("expected route rate limit to set Retry-After")
	}
	if _, err := server.app.FindRecordById("users", user.Id); err != nil {
		t.Fatalf("expected route-limited user to remain, got error: %v", err)
	}
}

func TestDeleteAccountDeletesUserAndCleansSharedReferences(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	targetUser, token := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)

	sharedRestaurant := createCollectionRecordWithKnownFields(t, server.app, "restaurants", map[string]any{
		"name":        "Shared Place",
		"location":    "San Francisco, CA",
		"cuisineType": "Italian",
		"user":        otherUser.Id,
		"createdBy":   targetUser.Id,
		"visibility":  "friends",
	})

	sharedMenuItem := createCollectionRecordWithKnownFields(t, server.app, "menu_items", map[string]any{
		"name":        "Truffle Pasta",
		"restaurant":  sharedRestaurant.Id,
		"createdBy":   targetUser.Id,
		"description": "Fresh pasta",
		"visibility":  "friends",
	})

	createdInviteCode := createCollectionRecordWithKnownFields(t, server.app, "invite_codes", map[string]any{
		"code":      "TARGET1",
		"createdBy": targetUser.Id,
	})
	usedInviteCode := createCollectionRecordWithKnownFields(t, server.app, "invite_codes", map[string]any{
		"code":   "TARGET2",
		"used":   true,
		"usedBy": targetUser.Id,
	})

	otherUsersList := createCollectionRecordWithKnownFields(t, server.app, "restaurant_lists", map[string]any{
		"name":        "Shared Saves",
		"description": "Friend recommendations",
		"user":        otherUser.Id,
		"visibility":  "friends",
	})
	targetListItem := createCollectionRecordWithKnownFields(t, server.app, "list_items", map[string]any{
		"list":       otherUsersList.Id,
		"restaurant": sharedRestaurant.Id,
		"addedBy":    targetUser.Id,
		"sourceUser": targetUser.Id,
		"position":   1,
		"note":       "From target user",
	})

	otherUsersBill := createCollectionRecordWithKnownFields(t, server.app, "bills", map[string]any{
		"bill_name":         "Team Dinner",
		"creator_user":      otherUser.Id,
		"total_amount":      120,
		"tax":               10,
		"tip":               20,
		"fees":              0,
		"split_mode":        "itemized",
		"extras_split_mode": "equal",
		"status":            "active",
	})
	targetParticipant := createCollectionRecordWithKnownFields(t, server.app, "bill_participants", map[string]any{
		"bill":        otherUsersBill.Id,
		"user":        targetUser.Id,
		"amount_owed": 60,
		"paid_status": "pending",
	})
	tastingSession := createCollectionRecordWithKnownFields(t, server.app, "tasting_sessions", map[string]any{
		"name":       "Flight Night",
		"restaurant": sharedRestaurant.Id,
		"leader":     otherUser.Id,
		"status":     "adding_items",
		"locked":     false,
	})
	usedSessionInvite := createCollectionRecordWithKnownFields(t, server.app, "tasting_session_invites", map[string]any{
		"session":    tastingSession.Id,
		"code":       "FLIGHT",
		"created_by": otherUser.Id,
		"expires_at": "2099-01-01 00:00:00.000Z",
		"used_by":    targetUser.Id,
	})

	menuReviewRequest := createCollectionRecordWithKnownFields(t, server.app, "menu_review_requests", map[string]any{
		"restaurant":  sharedRestaurant.Id,
		"requestedBy": targetUser.Id,
		"reason":      "Please review",
		"status":      "pending",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/account/delete",
		token,
		`{"currentPassword":"password123"}`,
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	if _, err := server.app.FindRecordById("users", targetUser.Id); err == nil {
		t.Fatal("expected deleted user lookup to fail")
	}
	if _, err := server.app.FindRecordById("invite_codes", createdInviteCode.Id); err == nil {
		t.Fatal("expected invite code owned by deleted user to be removed")
	}
	if _, err := server.app.FindRecordById("list_items", targetListItem.Id); err == nil {
		t.Fatal("expected list item owned by deleted user to be removed")
	}
	if _, err := server.app.FindRecordById("menu_review_requests", menuReviewRequest.Id); err == nil {
		t.Fatal("expected menu review request to be removed")
	}

	reloadedInviteCode, err := server.app.FindRecordById("invite_codes", usedInviteCode.Id)
	if err != nil {
		t.Fatalf("expected used invite code to remain, got error: %v", err)
	}
	if got := strings.TrimSpace(reloadedInviteCode.GetString("usedBy")); got != "" {
		t.Fatalf("expected invite code usedBy to be cleared, got %q", got)
	}

	reloadedRestaurant, err := server.app.FindRecordById("restaurants", sharedRestaurant.Id)
	if err != nil {
		t.Fatalf("expected restaurant to remain, got error: %v", err)
	}
	if got := strings.TrimSpace(reloadedRestaurant.GetString("createdBy")); got != "" {
		t.Fatalf("expected restaurant createdBy to be cleared, got %q", got)
	}

	reloadedMenuItem, err := server.app.FindRecordById("menu_items", sharedMenuItem.Id)
	if err != nil {
		t.Fatalf("expected menu item to remain, got error: %v", err)
	}
	if got := strings.TrimSpace(reloadedMenuItem.GetString("createdBy")); got != "" {
		t.Fatalf("expected menu item createdBy to be cleared, got %q", got)
	}

	reloadedParticipant, err := server.app.FindRecordById("bill_participants", targetParticipant.Id)
	if err != nil {
		t.Fatalf("expected bill participant to remain, got error: %v", err)
	}
	if got := strings.TrimSpace(reloadedParticipant.GetString("user")); got != "" {
		t.Fatalf("expected bill participant user to be cleared, got %q", got)
	}
	if got := strings.TrimSpace(reloadedParticipant.GetString("participant_name")); got == "" {
		t.Fatal("expected bill participant name to be preserved")
	}

	reloadedSessionInvite, err := server.app.FindRecordById("tasting_session_invites", usedSessionInvite.Id)
	if err != nil {
		t.Fatalf("expected tasting session invite to remain, got error: %v", err)
	}
	if got := strings.TrimSpace(reloadedSessionInvite.GetString("used_by")); got != "" {
		t.Fatalf("expected tasting session invite used_by to be cleared, got %q", got)
	}

	auditLogs, err := server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         core.ModelEventTypeDelete,
			"collection":     "users",
			"targetRecordId": targetUser.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load audit logs: %v", err)
	}
	if len(auditLogs) != 1 {
		t.Fatalf("expected 1 account-deletion audit log, got %d", len(auditLogs))
	}

	metadataMap := parseAuditMetadata(t, auditLogs[0].Get("metadataJson"))
	if metadataMap["source"] != "account_delete" {
		t.Fatalf("expected audit source account_delete, got %#v", metadataMap["source"])
	}

	cleanupDeleted, ok := metadataMap["cleanupDeleted"].(map[string]any)
	if !ok {
		t.Fatalf("expected cleanupDeleted metadata map, got %#v", metadataMap["cleanupDeleted"])
	}
	if cleanupDeleted["list_items"] == nil {
		t.Fatalf("expected cleanupDeleted to include list_items, got %#v", cleanupDeleted)
	}

	cleanupUpdated, ok := metadataMap["cleanupUpdated"].(map[string]any)
	if !ok {
		t.Fatalf("expected cleanupUpdated metadata map, got %#v", metadataMap["cleanupUpdated"])
	}
	for _, key := range []string{"bill_participants", "invite_codes", "restaurants", "menu_items"} {
		if cleanupUpdated[key] == nil {
			t.Fatalf("expected cleanupUpdated to include %s, got %#v", key, cleanupUpdated)
		}
	}
}

func TestDeleteAccountRemovesRemoteDeviceNotificationRecords(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	targetUser, token := createAuthUser(t, server.app, false, false)
	notificationRecords := createAccountDeletionRemoteDeviceNotificationRecords(t, server.app, targetUser.Id)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/account/delete",
		token,
		`{"currentPassword":"password123"}`,
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	assertAccountDeletionRemovedRemoteDeviceNotificationRecords(t, server.app, notificationRecords)
}

type accountDeletionRemoteDeviceNotificationRecords struct {
	notificationDevice      *core.Record
	notificationPreference  *core.Record
	notificationDeliveryLog *core.Record
}

func createAccountDeletionRemoteDeviceNotificationRecords(
	t *testing.T,
	app core.App,
	userID string,
) accountDeletionRemoteDeviceNotificationRecords {
	t.Helper()

	notificationDevice := createNotificationDeviceRecord(
		t,
		app,
		userID,
		"account-delete-device",
		"ExponentPushToken[account-delete]",
		true,
	)
	notificationPreference := createNotificationPreferenceRecord(t, app, userID, false)
	notificationDeliveryLog := createCollectionRecord(t, app, "notification_delivery_logs", map[string]any{
		"user":                  userID,
		"signal_type":           tastingInviteNotificationSignalTypeForTests(),
		"source_collection":     "tasting_sessions",
		"source_record":         "account-delete-source",
		"delivery_key":          "account-delete:" + userID,
		"status":                "sent",
		"device_count":          1,
		"notification_device":   notificationDevice.Id,
		"provider_message_id":   "receipt_account_delete",
		"receipt_status":        "pending",
		"receipt_next_check_at": "2099-01-01 00:00:00.000Z",
	})

	return accountDeletionRemoteDeviceNotificationRecords{
		notificationDevice:      notificationDevice,
		notificationPreference:  notificationPreference,
		notificationDeliveryLog: notificationDeliveryLog,
	}
}

func assertAccountDeletionRemovedRemoteDeviceNotificationRecords(
	t *testing.T,
	app core.App,
	records accountDeletionRemoteDeviceNotificationRecords,
) {
	t.Helper()

	assertAccountDeletionRemovedRecord(t, app, "Notification Device", "notification_devices", records.notificationDevice.Id)
	assertAccountDeletionRemovedRecord(t, app, "Notification Preference", "notification_preferences", records.notificationPreference.Id)
	assertAccountDeletionRemovedRecord(t, app, "Notification Delivery Log", "notification_delivery_logs", records.notificationDeliveryLog.Id)
}

func assertAccountDeletionRemovedRecord(
	t *testing.T,
	app core.App,
	domainName string,
	collectionName string,
	recordID string,
) {
	t.Helper()

	if _, err := app.FindRecordById(collectionName, recordID); err == nil {
		t.Fatalf("expected account deletion to remove %s record %s", domainName, recordID)
	}
}
