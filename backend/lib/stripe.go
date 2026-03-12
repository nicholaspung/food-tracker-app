package lib

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const defaultStripeAPIBaseURL = "https://api.stripe.com"

var stripeHTTPClientFactory = func() *http.Client {
	return &http.Client{Timeout: 15 * time.Second}
}

type StripeClient struct {
	apiBaseURL string
	secretKey  string
	httpClient *http.Client
}

type StripeCheckoutSessionParams struct {
	CancelURL       string
	CustomerEmail   string
	CustomerID      string
	Metadata        map[string]string
	PriceID         string
	SuccessURL      string
	SubscriptionRef map[string]string
}

type StripePortalSessionParams struct {
	CustomerID string
	ReturnURL  string
}

type StripeSessionResponse struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

type StripeWebhookEvent struct {
	Type string `json:"type"`
	Data struct {
		Object json.RawMessage `json:"object"`
	} `json:"data"`
}

func NewStripeClientFromEnv() (*StripeClient, error) {
	secretKey := strings.TrimSpace(os.Getenv("STRIPE_SECRET_KEY"))
	if secretKey == "" {
		return nil, fmt.Errorf("STRIPE_SECRET_KEY is not configured")
	}

	apiBaseURL := strings.TrimSpace(os.Getenv("STRIPE_API_BASE_URL"))
	if apiBaseURL == "" {
		apiBaseURL = defaultStripeAPIBaseURL
	}

	return &StripeClient{
		apiBaseURL: strings.TrimRight(apiBaseURL, "/"),
		secretKey:  secretKey,
		httpClient: stripeHTTPClientFactory(),
	}, nil
}

func SetStripeHTTPClientForTesting(client *http.Client) func() {
	previousFactory := stripeHTTPClientFactory
	stripeHTTPClientFactory = func() *http.Client {
		return client
	}

	return func() {
		stripeHTTPClientFactory = previousFactory
	}
}

func (c *StripeClient) CreateCheckoutSession(
	ctx context.Context,
	params StripeCheckoutSessionParams,
) (*StripeSessionResponse, error) {
	form := url.Values{}
	form.Set("mode", "subscription")
	form.Set("success_url", params.SuccessURL)
	form.Set("cancel_url", params.CancelURL)
	form.Set("line_items[0][price]", params.PriceID)
	form.Set("line_items[0][quantity]", "1")

	if params.CustomerID != "" {
		form.Set("customer", params.CustomerID)
	} else {
		form.Set("customer_email", params.CustomerEmail)
	}

	for key, value := range params.Metadata {
		form.Set(fmt.Sprintf("metadata[%s]", key), value)
	}

	for key, value := range params.SubscriptionRef {
		form.Set(fmt.Sprintf("subscription_data[metadata][%s]", key), value)
	}

	return c.postForm(ctx, "/v1/checkout/sessions", form)
}

func (c *StripeClient) CreatePortalSession(
	ctx context.Context,
	params StripePortalSessionParams,
) (*StripeSessionResponse, error) {
	form := url.Values{}
	form.Set("customer", params.CustomerID)
	form.Set("return_url", params.ReturnURL)

	return c.postForm(ctx, "/v1/billing_portal/sessions", form)
}

func (c *StripeClient) postForm(
	ctx context.Context,
	path string,
	form url.Values,
) (*StripeSessionResponse, error) {
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.apiBaseURL+path,
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return nil, err
	}

	request.Header.Set("Authorization", "Bearer "+c.secretKey)
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, err
	}

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("stripe request failed (%d): %s", response.StatusCode, strings.TrimSpace(string(body)))
	}

	var result StripeSessionResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	if strings.TrimSpace(result.URL) == "" {
		return nil, fmt.Errorf("stripe response did not include a redirect URL")
	}

	return &result, nil
}

func VerifyStripeWebhookSignature(
	payload []byte,
	signatureHeader string,
	webhookSecret string,
	now time.Time,
) error {
	if strings.TrimSpace(webhookSecret) == "" {
		return fmt.Errorf("STRIPE_WEBHOOK_SECRET is not configured")
	}

	timestamp, signatures, err := parseStripeSignatureHeader(signatureHeader)
	if err != nil {
		return err
	}

	if delta := now.Unix() - timestamp; delta > 300 || delta < -300 {
		return fmt.Errorf("stripe signature timestamp outside tolerance")
	}

	signedPayload := fmt.Sprintf("%d.%s", timestamp, string(payload))
	mac := hmac.New(sha256.New, []byte(webhookSecret))
	_, _ = mac.Write([]byte(signedPayload))
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	for _, signature := range signatures {
		if hmac.Equal([]byte(signature), []byte(expectedSignature)) {
			return nil
		}
	}

	return fmt.Errorf("stripe signature mismatch")
}

func parseStripeSignatureHeader(signatureHeader string) (int64, []string, error) {
	parts := strings.Split(signatureHeader, ",")
	var timestamp int64
	signatures := make([]string, 0, len(parts))

	for _, part := range parts {
		token := strings.TrimSpace(part)
		if token == "" {
			continue
		}

		key, value, found := strings.Cut(token, "=")
		if !found {
			continue
		}

		switch key {
		case "t":
			parsedTimestamp, err := strconv.ParseInt(value, 10, 64)
			if err != nil {
				return 0, nil, fmt.Errorf("invalid stripe signature timestamp")
			}
			timestamp = parsedTimestamp
		case "v1":
			signatures = append(signatures, value)
		}
	}

	if timestamp == 0 || len(signatures) == 0 {
		return 0, nil, fmt.Errorf("invalid stripe signature header")
	}

	return timestamp, signatures, nil
}
