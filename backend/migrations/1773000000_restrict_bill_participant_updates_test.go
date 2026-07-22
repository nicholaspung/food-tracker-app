package migrations

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/testutil"
)

func TestBillParticipantUpdateRuleRejectsDirectFinancialAndRelationshipChanges(t *testing.T) {
	app := testutil.NewTestApp(t)

	creator, creatorToken := createBillParticipantRuleTestUser(t, app)
	participant, _ := createBillParticipantRuleTestUser(t, app)
	otherUser, _ := createBillParticipantRuleTestUser(t, app)
	bill := createBillParticipantRuleTestRecord(t, app, "bills", map[string]any{
		"bill_name":         "Authorization test",
		"creator_user":      creator.Id,
		"total_amount":      42,
		"tax":               0,
		"tip":               0,
		"fees":              0,
		"split_mode":        "even",
		"extras_split_mode": "equal",
		"status":            "active",
	})
	otherBill := createBillParticipantRuleTestRecord(t, app, "bills", map[string]any{
		"bill_name":         "Other bill",
		"creator_user":      otherUser.Id,
		"total_amount":      10,
		"tax":               0,
		"tip":               0,
		"fees":              0,
		"split_mode":        "even",
		"extras_split_mode": "equal",
		"status":            "active",
	})
	participantRecord := createBillParticipantRuleTestRecord(t, app, "bill_participants", map[string]any{
		"bill":                    bill.Id,
		"user":                    participant.Id,
		"participant_name":        participant.GetString("name"),
		"amount_owed":             42,
		"custom_tip_contribution": 5,
		"paid_status":             "pending",
	})

	mux := createBillParticipantRuleTestRouter(t, app)
	maliciousPayloads := []string{
		`{"amount_owed":0}`,
		`{"custom_tip_contribution":0}`,
		fmt.Sprintf(`{"bill":"%s"}`, otherBill.Id),
		fmt.Sprintf(`{"user":"%s"}`, otherUser.Id),
		`{"paid_status":"paid"}`,
	}
	for _, payload := range maliciousPayloads {
		maliciousResponse := performBillParticipantRuleTestRequest(
			t,
			mux,
			creatorToken,
			participantRecord.Id,
			payload,
		)
		if maliciousResponse.Code != http.StatusForbidden {
			t.Fatalf("expected direct update to return 403, got %d for %s: %s", maliciousResponse.Code, payload, maliciousResponse.Body.String())
		}

		reloadedParticipant, err := app.FindRecordById("bill_participants", participantRecord.Id)
		if err != nil {
			t.Fatalf("failed to reload bill participant: %v", err)
		}
		if reloadedParticipant.GetString("bill") != bill.Id ||
			reloadedParticipant.GetString("user") != participant.Id ||
			reloadedParticipant.GetFloat("amount_owed") != 42 ||
			reloadedParticipant.GetString("paid_status") != "pending" ||
			reloadedParticipant.GetFloat("custom_tip_contribution") != 5 {
			t.Fatalf("participant financial or relationship fields changed after rejected update %s", payload)
		}
	}
}

func createBillParticipantRuleTestRouter(t *testing.T, app core.App) http.Handler {
	t.Helper()

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("failed to create PocketBase router: %v", err)
	}

	mux, err := router.BuildMux()
	if err != nil {
		t.Fatalf("failed to build PocketBase router: %v", err)
	}

	return mux
}

func createBillParticipantRuleTestUser(t *testing.T, app core.App) (*core.Record, string) {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("email", fmt.Sprintf("bill-rule-%d@example.com", time.Now().UnixNano()))
	record.Set("name", "Bill Rule Test User")
	record.Set("defaultRestaurantVisibility", "friends")
	record.Set("defaultVisitVisibility", "friends")
	record.SetVerified(true)
	record.SetPassword("password123")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to save test user: %v", err)
	}

	token, err := record.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create auth token: %v", err)
	}

	return record, token
}

func createBillParticipantRuleTestRecord(
	t *testing.T,
	app core.App,
	collectionName string,
	values map[string]any,
) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		t.Fatalf("failed to resolve %s collection: %v", collectionName, err)
	}

	record := core.NewRecord(collection)
	for field, value := range values {
		record.Set(field, value)
	}
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to save %s record: %v", collectionName, err)
	}

	return record
}

func performBillParticipantRuleTestRequest(
	t *testing.T,
	mux http.Handler,
	authToken string,
	participantID string,
	body string,
) *httptest.ResponseRecorder {
	t.Helper()

	request := httptest.NewRequest(
		http.MethodPatch,
		"/api/collections/bill_participants/records/"+participantID,
		bytes.NewBufferString(body),
	)
	request.Header.Set("Authorization", "Bearer "+authToken)
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}
