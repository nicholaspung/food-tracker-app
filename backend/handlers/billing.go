package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

type billingCheckoutSessionRequest struct {
	PlanID    string `json:"planId"`
	ReturnURL string `json:"returnUrl"`
}

type billingPortalSessionRequest struct {
	ReturnURL string `json:"returnUrl"`
}

type stripeCheckoutSession struct {
	Customer string            `json:"customer"`
	Metadata map[string]string `json:"metadata"`
}

type stripeSubscription struct {
	ID               string            `json:"id"`
	CurrentPeriodEnd int64             `json:"current_period_end"`
	Customer         string            `json:"customer"`
	Metadata         map[string]string `json:"metadata"`
	Status           string            `json:"status"`
}

// RegisterBillingHandlers registers billing/subscription API endpoints.
func RegisterBillingHandlers(se *core.ServeEvent, app core.App) {
	se.Router.POST("/api/billing/checkout-session", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		var requestData billingCheckoutSessionRequest
		if err := e.BindBody(&requestData); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		returnURL, err := normalizeBillingReturnURL(requestData.ReturnURL)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		priceID, err := resolveStripePriceID(requestData.PlanID)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		stripeClient, err := lib.NewStripeClientFromEnv()
		if err != nil {
			return apis.NewApiError(500, err.Error(), err)
		}

		session, err := stripeClient.CreateCheckoutSession(e.Request.Context(), lib.StripeCheckoutSessionParams{
			CancelURL:     appendBillingQueryParam(returnURL, "billing", "canceled"),
			CustomerEmail: strings.TrimSpace(e.Auth.GetString("email")),
			CustomerID:    strings.TrimSpace(e.Auth.GetString("stripeCustomerId")),
			Metadata: map[string]string{
				"pocketbase_user_id": e.Auth.Id,
				"source":             "web_billing",
			},
			PriceID:    priceID,
			SuccessURL: appendBillingQueryParam(returnURL, "billing", "success"),
			SubscriptionRef: map[string]string{
				"pocketbase_user_id": e.Auth.Id,
				"source":             "web_billing",
			},
		})
		if err != nil {
			log.Printf("Failed to create Stripe checkout session for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to create checkout session", err)
		}

		return e.JSON(200, map[string]any{
			"url": session.URL,
		})
	})

	se.Router.POST("/api/billing/portal-session", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		var requestData billingPortalSessionRequest
		if err := e.BindBody(&requestData); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		returnURL, err := normalizeBillingReturnURL(requestData.ReturnURL)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		customerID := strings.TrimSpace(e.Auth.GetString("stripeCustomerId"))
		if customerID == "" {
			return apis.NewBadRequestError("no Stripe customer is linked to this account yet", nil)
		}

		stripeClient, err := lib.NewStripeClientFromEnv()
		if err != nil {
			return apis.NewApiError(500, err.Error(), err)
		}

		session, err := stripeClient.CreatePortalSession(e.Request.Context(), lib.StripePortalSessionParams{
			CustomerID: customerID,
			ReturnURL:  returnURL,
		})
		if err != nil {
			log.Printf("Failed to create Stripe portal session for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to create billing portal session", err)
		}

		return e.JSON(200, map[string]any{
			"url": session.URL,
		})
	})

	se.Router.POST("/api/webhooks/stripe", func(e *core.RequestEvent) error {
		payload, err := io.ReadAll(e.Request.Body)
		if err != nil {
			return apis.NewBadRequestError("failed to read webhook payload", err)
		}

		signatureHeader := e.Request.Header.Get("Stripe-Signature")
		if err := lib.VerifyStripeWebhookSignature(
			payload,
			signatureHeader,
			os.Getenv("STRIPE_WEBHOOK_SECRET"),
			time.Now(),
		); err != nil {
			return apis.NewForbiddenError("invalid stripe signature", err)
		}

		var event lib.StripeWebhookEvent
		if err := json.Unmarshal(payload, &event); err != nil {
			return apis.NewBadRequestError("invalid stripe event payload", err)
		}

		switch event.Type {
		case "checkout.session.completed":
			if err := handleStripeCheckoutCompleted(app, event.Data.Object); err != nil {
				log.Printf("Failed to handle Stripe checkout.session.completed: %v", err)
				return apis.NewApiError(500, "failed to process stripe checkout webhook", err)
			}
		case "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted":
			if err := handleStripeSubscriptionEvent(app, event.Data.Object); err != nil {
				log.Printf("Failed to handle Stripe subscription webhook %s: %v", event.Type, err)
				return apis.NewApiError(500, "failed to process stripe subscription webhook", err)
			}
		default:
			return e.JSON(200, map[string]any{
				"received": true,
				"ignored":  true,
			})
		}

		return e.JSON(200, map[string]any{
			"received": true,
		})
	})
}

func handleStripeCheckoutCompleted(app core.App, object json.RawMessage) error {
	var session stripeCheckoutSession
	if err := json.Unmarshal(object, &session); err != nil {
		return err
	}

	userID := strings.TrimSpace(session.Metadata["pocketbase_user_id"])
	if userID == "" {
		return nil
	}

	user, err := app.FindRecordById("users", userID)
	if err != nil {
		return err
	}

	if customerID := strings.TrimSpace(session.Customer); customerID != "" {
		user.Set("stripeCustomerId", customerID)
	}
	user.Set("subscriptionProvider", "stripe")

	return app.Save(user)
}

func handleStripeSubscriptionEvent(app core.App, object json.RawMessage) error {
	var subscription stripeSubscription
	if err := json.Unmarshal(object, &subscription); err != nil {
		return err
	}

	user, err := findStripeSubscriptionUser(app, subscription)
	if err != nil {
		return err
	}
	if user == nil {
		return nil
	}

	status := strings.TrimSpace(subscription.Status)
	currentPeriodEnd := stripeUnixTimeToDatePointer(subscription.CurrentPeriodEnd)
	isSubscriber := isStripeSubscriptionActive(status, currentPeriodEnd)

	user.Set("isSubscriber", isSubscriber)
	user.Set("subscriptionProvider", "stripe")
	user.Set("subscriptionStatus", status)

	if customerID := strings.TrimSpace(subscription.Customer); customerID != "" {
		user.Set("stripeCustomerId", customerID)
	}

	if subscriptionID := strings.TrimSpace(subscription.ID); subscriptionID != "" {
		user.Set("subscriptionId", subscriptionID)
	}

	if currentPeriodEnd == nil {
		user.Set("subscriptionCurrentPeriodEnd", nil)
	} else {
		user.Set("subscriptionCurrentPeriodEnd", *currentPeriodEnd)
	}

	return app.Save(user)
}

func findStripeSubscriptionUser(app core.App, subscription stripeSubscription) (*core.Record, error) {
	if userID := strings.TrimSpace(subscription.Metadata["pocketbase_user_id"]); userID != "" {
		record, err := app.FindRecordById("users", userID)
		if err == nil {
			return record, nil
		}
	}

	if subscriptionID := strings.TrimSpace(subscription.ID); subscriptionID != "" {
		record, err := app.FindFirstRecordByFilter(
			"users",
			"subscriptionId = {:subscriptionId}",
			dbx.Params{"subscriptionId": subscriptionID},
		)
		if err == nil {
			return record, nil
		}
	}

	if customerID := strings.TrimSpace(subscription.Customer); customerID != "" {
		record, err := app.FindFirstRecordByFilter(
			"users",
			"stripeCustomerId = {:customerId}",
			dbx.Params{"customerId": customerID},
		)
		if err == nil {
			return record, nil
		}
	}

	return nil, nil
}

func normalizeBillingReturnURL(rawValue string) (string, error) {
	trimmed := strings.TrimSpace(rawValue)
	if trimmed == "" {
		return "", fmt.Errorf("returnUrl is required")
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || !parsed.IsAbs() {
		return "", fmt.Errorf("returnUrl must be an absolute URL")
	}

	if parsed.Scheme != "https" && parsed.Scheme != "http" {
		return "", fmt.Errorf("returnUrl must use http or https")
	}

	return parsed.String(), nil
}

func appendBillingQueryParam(rawURL string, key string, value string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}

	query := parsed.Query()
	query.Set(key, value)
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func resolveStripePriceID(planID string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(planID)) {
	case "monthly":
		value := strings.TrimSpace(os.Getenv("STRIPE_PRICE_MONTHLY"))
		if value == "" {
			return "", fmt.Errorf("STRIPE_PRICE_MONTHLY is not configured")
		}
		return value, nil
	case "yearly":
		value := strings.TrimSpace(os.Getenv("STRIPE_PRICE_YEARLY"))
		if value == "" {
			return "", fmt.Errorf("STRIPE_PRICE_YEARLY is not configured")
		}
		return value, nil
	default:
		return "", fmt.Errorf("planId must be \"monthly\" or \"yearly\"")
	}
}

func stripeUnixTimeToDatePointer(unixSeconds int64) *time.Time {
	if unixSeconds <= 0 {
		return nil
	}

	value := time.Unix(unixSeconds, 0).UTC()
	return &value
}

func isStripeSubscriptionActive(status string, currentPeriodEnd *time.Time) bool {
	switch status {
	case "trialing", "active", "past_due":
		return true
	case "canceled":
		return currentPeriodEnd != nil && currentPeriodEnd.After(time.Now())
	default:
		return false
	}
}
