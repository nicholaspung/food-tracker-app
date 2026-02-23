package handlers_test

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

func TestBillingSyncRequiresAuthentication(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterBillingHandlers(se, app)
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/billing/sync",
		"",
		`{"source":"purchase","purchases":[]}`,
	)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d body=%s", response.Code, response.Body.String())
	}
}

func TestBillingSyncElevatesSubscriberOnVerifiedPurchase(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterBillingHandlers(se, app)
	})

	user, token := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/billing/sync",
		token,
		`{
			"source":"purchase",
			"purchases":[
				{
					"platform":"ios",
					"productId":"foodtracker.subscription.monthly",
					"purchaseState":"purchased",
					"purchaseToken":"sample-purchase-token",
					"transactionId":"sample-transaction-id"
				}
			]
		}`,
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", response.Code, response.Body.String())
	}

	responseBody := parseJSONMap(t, response.Body.Bytes())
	if responseBody["isSubscriber"] != true {
		t.Fatalf("expected isSubscriber=true, got %v", responseBody["isSubscriber"])
	}

	verifiedPurchases, ok := responseBody["verifiedPurchases"].([]any)
	if !ok || len(verifiedPurchases) != 1 {
		t.Fatalf("expected exactly 1 verified purchase, got %v", responseBody["verifiedPurchases"])
	}

	updatedUser, err := server.app.FindRecordById("users", user.Id)
	if err != nil {
		t.Fatalf("failed to reload user: %v", err)
	}

	if !updatedUser.GetBool("isSubscriber") {
		t.Fatalf("expected user to be marked subscriber after billing sync")
	}
}

func TestBillingSyncIgnoresUnknownProductIDs(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterBillingHandlers(se, app)
	})

	user, token := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/billing/sync",
		token,
		`{
			"source":"purchase",
			"purchases":[
				{
					"platform":"ios",
					"productId":"unknown.product.id",
					"purchaseState":"purchased",
					"purchaseToken":"sample-purchase-token",
					"transactionId":"sample-transaction-id"
				}
			]
		}`,
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", response.Code, response.Body.String())
	}

	responseBody := parseJSONMap(t, response.Body.Bytes())
	if responseBody["isSubscriber"] != false {
		t.Fatalf("expected isSubscriber=false, got %v", responseBody["isSubscriber"])
	}

	verifiedPurchases, ok := responseBody["verifiedPurchases"].([]any)
	if !ok || len(verifiedPurchases) != 0 {
		t.Fatalf("expected no verified purchases, got %v", responseBody["verifiedPurchases"])
	}

	updatedUser, err := server.app.FindRecordById("users", user.Id)
	if err != nil {
		t.Fatalf("failed to reload user: %v", err)
	}

	if updatedUser.GetBool("isSubscriber") {
		t.Fatalf("expected user to remain non-subscriber when product is unknown")
	}
}
