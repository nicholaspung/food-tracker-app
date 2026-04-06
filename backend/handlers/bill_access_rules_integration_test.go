package handlers_test

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func requireListItemCount(t *testing.T, responseCode int, body []byte, expected int) {
	t.Helper()

	if responseCode != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", responseCode, string(body))
	}

	payload := parseJSONMap(t, body)
	items, ok := payload["items"].([]any)
	if !ok {
		t.Fatalf("expected items array, got %#v", payload["items"])
	}

	if len(items) != expected {
		t.Fatalf("expected %d items, got %d: %s", expected, len(items), string(body))
	}
}

func TestBillCollectionListRulesRestrictUnassociatedUsers(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, _ core.App) {})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	participant, participantToken := createAuthUser(t, server.app, false, false)
	_, strangerToken := createAuthUser(t, server.app, false, false)

	bill := createCollectionRecord(t, server.app, "bills", map[string]any{
		"bill_name":         "Team Dinner",
		"creator_user":      owner.Id,
		"total_amount":      120,
		"tax":               10,
		"tip":               20,
		"fees":              0,
		"split_mode":        "itemized",
		"extras_split_mode": "proportional",
		"status":            "active",
	})

	ownerParticipant := createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             bill.Id,
		"user":             owner.Id,
		"participant_name": owner.GetString("name"),
		"amount_owed":      60,
		"paid_status":      "pending",
	})
	participantRecord := createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             bill.Id,
		"user":             participant.Id,
		"participant_name": participant.GetString("name"),
		"amount_owed":      60,
		"paid_status":      "pending",
	})

	createCollectionRecord(t, server.app, "bill_items", map[string]any{
		"bill":        bill.Id,
		"item_name":   "Shared Appetizers",
		"price":       120,
		"assigned_to": []string{ownerParticipant.Id, participantRecord.Id},
	})

	createCollectionRecord(t, server.app, "bill_invites", map[string]any{
		"bill":       bill.Id,
		"code":       "BILL42",
		"created_by": owner.Id,
		"expires_at": "2099-01-01 00:00:00.000Z",
	})

	ownerBills := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/bills/records",
		ownerToken,
		"",
	)
	requireListItemCount(t, ownerBills.Code, ownerBills.Body.Bytes(), 1)

	participantBills := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/bills/records",
		participantToken,
		"",
	)
	requireListItemCount(t, participantBills.Code, participantBills.Body.Bytes(), 1)

	strangerBills := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/bills/records",
		strangerToken,
		"",
	)
	requireListItemCount(t, strangerBills.Code, strangerBills.Body.Bytes(), 0)
}

func TestBillInviteCollectionRejectsDuplicateCodes(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, _ core.App) {})

	owner, _ := createAuthUser(t, server.app, false, false)
	bill := createCollectionRecord(t, server.app, "bills", map[string]any{
		"bill_name":         "Duplicate Invite Bill",
		"creator_user":      owner.Id,
		"total_amount":      40,
		"tax":               0,
		"tip":               0,
		"fees":              0,
		"split_mode":        "even",
		"extras_split_mode": "equal",
		"status":            "active",
	})

	createCollectionRecord(t, server.app, "bill_invites", map[string]any{
		"bill":       bill.Id,
		"code":       "BILL42",
		"created_by": owner.Id,
		"expires_at": "2099-01-01 00:00:00.000Z",
	})

	collection, err := server.app.FindCollectionByNameOrId("bill_invites")
	if err != nil {
		t.Fatalf("failed to resolve bill_invites collection: %v", err)
	}

	duplicate := core.NewRecord(collection)
	duplicate.Set("bill", bill.Id)
	duplicate.Set("code", "BILL42")
	duplicate.Set("created_by", owner.Id)
	duplicate.Set("expires_at", "2099-01-02 00:00:00.000Z")

	if err := server.app.Save(duplicate); err == nil {
		t.Fatalf("expected duplicate bill invite code to be rejected")
	}
}

func TestBillParticipantAndItemListRulesFollowBillMembership(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, _ core.App) {})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	participant, participantToken := createAuthUser(t, server.app, false, false)
	_, strangerToken := createAuthUser(t, server.app, false, false)

	bill := createCollectionRecord(t, server.app, "bills", map[string]any{
		"bill_name":         "Late Night Meal",
		"creator_user":      owner.Id,
		"total_amount":      75,
		"tax":               5,
		"tip":               10,
		"fees":              0,
		"split_mode":        "itemized",
		"extras_split_mode": "equal",
		"status":            "active",
	})

	ownerParticipant := createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             bill.Id,
		"user":             owner.Id,
		"participant_name": owner.GetString("name"),
		"amount_owed":      37.5,
		"paid_status":      "pending",
	})
	participantRecord := createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             bill.Id,
		"user":             participant.Id,
		"participant_name": participant.GetString("name"),
		"amount_owed":      37.5,
		"paid_status":      "pending",
	})

	createCollectionRecord(t, server.app, "bill_items", map[string]any{
		"bill":        bill.Id,
		"item_name":   "Entrees",
		"price":       75,
		"assigned_to": []string{ownerParticipant.Id, participantRecord.Id},
	})

	ownerParticipants := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/bill_participants/records",
		ownerToken,
		"",
	)
	requireListItemCount(t, ownerParticipants.Code, ownerParticipants.Body.Bytes(), 2)

	participantParticipants := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/bill_participants/records",
		participantToken,
		"",
	)
	requireListItemCount(t, participantParticipants.Code, participantParticipants.Body.Bytes(), 2)

	strangerParticipants := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/bill_participants/records",
		strangerToken,
		"",
	)
	requireListItemCount(t, strangerParticipants.Code, strangerParticipants.Body.Bytes(), 0)

	participantItems := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/bill_items/records",
		participantToken,
		"",
	)
	requireListItemCount(t, participantItems.Code, participantItems.Body.Bytes(), 1)

	strangerItems := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/bill_items/records",
		strangerToken,
		"",
	)
	requireListItemCount(t, strangerItems.Code, strangerItems.Body.Bytes(), 0)
}

func TestBillInviteListRuleRequiresBillCreator(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, _ core.App) {})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	participant, participantToken := createAuthUser(t, server.app, false, false)
	_, strangerToken := createAuthUser(t, server.app, false, false)

	bill := createCollectionRecord(t, server.app, "bills", map[string]any{
		"bill_name":         "Bill Invites",
		"creator_user":      owner.Id,
		"total_amount":      30,
		"tax":               0,
		"tip":               0,
		"fees":              0,
		"split_mode":        "even",
		"extras_split_mode": "equal",
		"status":            "active",
	})

	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             bill.Id,
		"user":             participant.Id,
		"participant_name": participant.GetString("name"),
		"amount_owed":      30,
		"paid_status":      "pending",
	})

	createCollectionRecord(t, server.app, "bill_invites", map[string]any{
		"bill":       bill.Id,
		"code":       "JOIN42",
		"created_by": owner.Id,
		"expires_at": "2099-01-01 00:00:00.000Z",
	})

	ownerInvites := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/bill_invites/records",
		ownerToken,
		"",
	)
	requireListItemCount(t, ownerInvites.Code, ownerInvites.Body.Bytes(), 1)

	participantInvites := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/bill_invites/records",
		participantToken,
		"",
	)
	requireListItemCount(t, participantInvites.Code, participantInvites.Body.Bytes(), 0)

	strangerInvites := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/bill_invites/records",
		strangerToken,
		"",
	)
	requireListItemCount(t, strangerInvites.Code, strangerInvites.Body.Bytes(), 0)
}
