package handlers_test

import (
	"net/http"
	"strings"
	"testing"

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
