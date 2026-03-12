package handlers_test

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/lib"
)

func TestBillingCheckoutSessionRequiresAuthentication(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterBillingHandlers(se, app)
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/billing/checkout-session",
		"",
		`{"planId":"monthly","returnUrl":"https://app.yummyrecs.com/billing"}`,
	)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", response.Code)
	}
}

func TestBillingCheckoutSessionCreatesStripeRedirect(t *testing.T) {
	restoreHTTPClient := lib.SetStripeHTTPClientForTesting(&http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.URL.Path != "/v1/checkout/sessions" {
				t.Fatalf("unexpected Stripe path %s", r.URL.Path)
			}

			if auth := r.Header.Get("Authorization"); auth != "Bearer sk_test_123" {
				t.Fatalf("unexpected authorization header %q", auth)
			}

			payload, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("failed to read Stripe request body: %v", err)
			}

			values, err := url.ParseQuery(string(payload))
			if err != nil {
				t.Fatalf("failed to parse Stripe form body: %v", err)
			}

			if got := values.Get("line_items[0][price]"); got != "price_monthly_123" {
				t.Fatalf("expected monthly price id, got %q", got)
			}

			if got := values.Get("subscription_data[metadata][source]"); got != "web_billing" {
				t.Fatalf("expected source metadata, got %q", got)
			}

			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(`{"id":"cs_test_123","url":"https://checkout.stripe.com/c/pay/cs_test_123"}`)),
				Header:     make(http.Header),
			}, nil
		}),
	})
	defer restoreHTTPClient()

	t.Setenv("STRIPE_SECRET_KEY", "sk_test_123")
	t.Setenv("STRIPE_API_BASE_URL", "https://stripe.test")
	t.Setenv("STRIPE_PRICE_MONTHLY", "price_monthly_123")
	t.Setenv("STRIPE_PRICE_YEARLY", "price_yearly_123")

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterBillingHandlers(se, app)
	})
	_, token := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/billing/checkout-session",
		token,
		`{"planId":"monthly","returnUrl":"https://app.yummyrecs.com/billing"}`,
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	responseBody := parseJSONMap(t, response.Body.Bytes())
	if responseBody["url"] != "https://checkout.stripe.com/c/pay/cs_test_123" {
		t.Fatalf("unexpected redirect URL %v", responseBody["url"])
	}
}

func TestBillingPortalSessionRequiresCustomerID(t *testing.T) {
	t.Setenv("STRIPE_SECRET_KEY", "sk_test_123")
	t.Setenv("STRIPE_API_BASE_URL", "https://stripe.example.com")

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterBillingHandlers(se, app)
	})
	_, token := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/billing/portal-session",
		token,
		`{"returnUrl":"https://app.yummyrecs.com/billing"}`,
	)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.Code)
	}
}

func TestStripeWebhookUpdatesSubscriberState(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", "whsec_test_123")

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterBillingHandlers(se, app)
	})
	user, _ := createAuthUser(t, server.app, false, false)
	user.Set("stripeCustomerId", "cus_existing")
	if err := server.app.Save(user); err != nil {
		t.Fatalf("failed to save user setup: %v", err)
	}

	payload := []byte(fmt.Sprintf(`{
		"type":"customer.subscription.updated",
		"data":{
			"object":{
				"id":"sub_123",
				"customer":"cus_existing",
				"status":"active",
				"current_period_end":%d,
				"metadata":{"pocketbase_user_id":"%s"}
			}
		}
	}`, time.Now().Add(30*24*time.Hour).Unix(), user.Id))

	signature := buildStripeSignatureHeader(payload, "whsec_test_123", time.Now())
	request := httptest.NewRequest(http.MethodPost, "/api/webhooks/stripe", strings.NewReader(string(payload)))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Stripe-Signature", signature)
	recorder := httptest.NewRecorder()

	server.mux.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}

	updatedUser, err := server.app.FindRecordById("users", user.Id)
	if err != nil {
		t.Fatalf("failed to reload user: %v", err)
	}

	if !updatedUser.GetBool("isSubscriber") {
		t.Fatalf("expected user to be marked as subscriber")
	}

	if updatedUser.GetString("subscriptionProvider") != "stripe" {
		t.Fatalf("expected subscriptionProvider=stripe, got %q", updatedUser.GetString("subscriptionProvider"))
	}

	if updatedUser.GetString("subscriptionId") != "sub_123" {
		t.Fatalf("expected subscriptionId=sub_123, got %q", updatedUser.GetString("subscriptionId"))
	}
}

func TestStripeWebhookRejectsInvalidSignature(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", "whsec_test_123")

	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterBillingHandlers(se, app)
	})

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/webhooks/stripe",
		strings.NewReader(`{"type":"customer.subscription.updated","data":{"object":{}}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Stripe-Signature", "t=1,v1=bad")
	recorder := httptest.NewRecorder()

	server.mux.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
}

func buildStripeSignatureHeader(payload []byte, secret string, now time.Time) string {
	timestamp := now.Unix()
	signedPayload := fmt.Sprintf("%d.%s", timestamp, string(payload))
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(signedPayload))
	signature := hex.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("t=%d,v1=%s", timestamp, signature)
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}
