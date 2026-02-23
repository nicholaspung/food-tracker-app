package handlers

import (
	"log"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	defaultBillingMonthlyProductID = "yummyrecs.subscription.monthly"
	defaultBillingYearlyProductID  = "yummyrecs.subscription.yearly"
)

type billingSyncRequest struct {
	Source    string                    `json:"source"`
	Purchases []billingSyncPurchaseItem `json:"purchases"`
}

type billingSyncPurchaseItem struct {
	Platform      string `json:"platform"`
	ProductID     string `json:"productId"`
	PurchaseState string `json:"purchaseState"`
	PurchaseToken string `json:"purchaseToken"`
	TransactionID string `json:"transactionId"`
}

type billingVerifiedPurchase struct {
	Platform      string  `json:"platform"`
	ProductID     string  `json:"productId"`
	PurchaseToken *string `json:"purchaseToken"`
	TransactionID *string `json:"transactionId"`
}

// RegisterBillingHandlers registers billing/subscription API endpoints.
func RegisterBillingHandlers(se *core.ServeEvent, app core.App) {
	se.Router.POST("/api/billing/sync", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		var requestData billingSyncRequest
		if err := e.BindBody(&requestData); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		source := strings.ToLower(strings.TrimSpace(requestData.Source))
		if source != "purchase" && source != "restore" {
			return apis.NewBadRequestError(`source must be "purchase" or "restore"`, nil)
		}

		allowedProductIDs := loadAllowedSubscriptionProductIDs()
		verifiedPurchases := make([]billingVerifiedPurchase, 0, len(requestData.Purchases))
		ignoredCount := 0

		for _, purchase := range requestData.Purchases {
			normalizedProductID := strings.TrimSpace(purchase.ProductID)
			if normalizedProductID == "" {
				ignoredCount++
				continue
			}

			normalizedPlatform := strings.ToLower(strings.TrimSpace(purchase.Platform))
			if normalizedPlatform != "ios" && normalizedPlatform != "android" {
				ignoredCount++
				continue
			}

			if _, exists := allowedProductIDs[normalizedProductID]; !exists {
				ignoredCount++
				continue
			}

			normalizedPurchaseState := strings.ToLower(strings.TrimSpace(purchase.PurchaseState))
			if source == "purchase" && normalizedPurchaseState == "pending" {
				ignoredCount++
				continue
			}

			normalizedPurchaseToken := strings.TrimSpace(purchase.PurchaseToken)
			normalizedTransactionID := strings.TrimSpace(purchase.TransactionID)
			if normalizedPurchaseToken == "" && normalizedTransactionID == "" {
				ignoredCount++
				continue
			}

			var purchaseTokenPtr *string
			if normalizedPurchaseToken != "" {
				value := normalizedPurchaseToken
				purchaseTokenPtr = &value
			}

			var transactionIDPtr *string
			if normalizedTransactionID != "" {
				value := normalizedTransactionID
				transactionIDPtr = &value
			}

			verifiedPurchases = append(verifiedPurchases, billingVerifiedPurchase{
				Platform:      normalizedPlatform,
				ProductID:     normalizedProductID,
				PurchaseToken: purchaseTokenPtr,
				TransactionID: transactionIDPtr,
			})
		}

		wasSubscriber := e.Auth.GetBool("isSubscriber")
		isSubscriber := wasSubscriber
		if len(verifiedPurchases) > 0 {
			isSubscriber = true
		}

		if isSubscriber != wasSubscriber {
			e.Auth.Set("isSubscriber", isSubscriber)
			if err := app.Save(e.Auth); err != nil {
				log.Printf("Failed to update subscriber state for user %s: %v", e.Auth.Id, err)
				return apis.NewApiError(500, "failed to sync subscription state", err)
			}
		}

		message := "No eligible subscription purchases were found."
		if len(verifiedPurchases) > 0 {
			message = "Subscription purchases verified."
		}

		return e.JSON(200, map[string]any{
			"isSubscriber":      isSubscriber,
			"ignoredCount":      ignoredCount,
			"message":           message,
			"verifiedPurchases": verifiedPurchases,
		})
	})
}

func loadAllowedSubscriptionProductIDs() map[string]struct{} {
	ids := map[string]struct{}{}
	add := func(value string) {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return
		}
		ids[trimmed] = struct{}{}
	}

	add(os.Getenv("BILLING_MONTHLY_PRODUCT_ID"))
	add(os.Getenv("BILLING_YEARLY_PRODUCT_ID"))

	rawList := strings.TrimSpace(os.Getenv("BILLING_SUBSCRIPTION_PRODUCT_IDS"))
	if rawList != "" {
		for _, token := range strings.Split(rawList, ",") {
			add(token)
		}
	}

	if len(ids) == 0 {
		add(defaultBillingMonthlyProductID)
		add(defaultBillingYearlyProductID)
	}

	return ids
}
