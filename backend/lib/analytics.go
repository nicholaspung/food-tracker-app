package lib

import (
	"log"
	"os"
	"time"

	"github.com/posthog/posthog-go"
)

var (
	// PostHogClient is the global PostHog client instance
	PostHogClient posthog.Client
	// AnalyticsEnabled indicates if analytics is enabled
	AnalyticsEnabled bool
)

const (
	posthogDistinctIDBackendLLM    = "backend:llm-generation"
	posthogDistinctIDBackendPlaces = "backend:places-api"
)

// InitAnalytics initializes the PostHog client
func InitAnalytics() error {
	apiKey := os.Getenv("POSTHOG_API_KEY")
	if apiKey == "" {
		log.Println("[Analytics] POSTHOG_API_KEY not set - analytics disabled")
		AnalyticsEnabled = false
		return nil
	}

	endpoint := os.Getenv("POSTHOG_HOST")
	if endpoint == "" {
		endpoint = "https://us.i.posthog.com" // Default to US instance
	}

	client, err := posthog.NewWithConfig(
		apiKey,
		posthog.Config{
			Endpoint: endpoint,
			// BatchSize determines how many events to batch before sending
			BatchSize: 10,
			// Interval determines how often to flush events
			Interval: 30 * time.Second,
		},
	)

	if err != nil {
		log.Printf("[Analytics] Failed to initialize PostHog: %v", err)
		AnalyticsEnabled = false
		return err
	}

	PostHogClient = client
	AnalyticsEnabled = true
	log.Println("[Analytics] PostHog initialized successfully")
	return nil
}

// CloseAnalytics closes the PostHog client and flushes remaining events
func CloseAnalytics() {
	if AnalyticsEnabled && PostHogClient != nil {
		log.Println("[Analytics] Closing PostHog client...")
		PostHogClient.Close()
	}
}

// LLMGenerationProperties contains properties for LLM generation events
type LLMGenerationProperties struct {
	Model          string  // e.g., "gemini-2.5-flash-lite"
	UseCase        string  // e.g., "menu_parsing", "restaurant_name_extraction", "ocr"
	PromptTokens   int     // Number of input tokens
	OutputTokens   int     // Number of output tokens
	TotalTokens    int     // Total tokens used
	DurationMs     int64   // Duration in milliseconds
	Success        bool    // Whether the generation succeeded
	ErrorType      string  // Error type if failed (empty if success)
	Language       string  // Detected or requested language (optional)
	ItemsExtracted int     // Number of items extracted (for menu parsing)
	CostEstimate   float64 // Estimated cost in USD (optional)
}

// TrackLLMGeneration tracks an LLM generation event
func TrackLLMGeneration(userID string, props LLMGenerationProperties) {
	if !AnalyticsEnabled {
		return
	}

	// Calculate cost estimate if not provided
	if props.CostEstimate == 0 {
		props.CostEstimate = estimateCost(props.Model, props.PromptTokens, props.OutputTokens)
	}

	// Build properties map
	properties := posthog.NewProperties().
		Set("model", props.Model).
		Set("use_case", props.UseCase).
		Set("prompt_tokens", props.PromptTokens).
		Set("output_tokens", props.OutputTokens).
		Set("total_tokens", props.TotalTokens).
		Set("duration_ms", props.DurationMs).
		Set("success", props.Success).
		Set("cost_estimate", props.CostEstimate)

	// Add optional properties
	if props.ErrorType != "" {
		properties.Set("error_type", props.ErrorType)
	}
	if props.Language != "" {
		properties.Set("language", props.Language)
	}
	if props.ItemsExtracted > 0 {
		properties.Set("items_extracted", props.ItemsExtracted)
	}

	// Track event
	err := PostHogClient.Enqueue(posthog.Capture{
		DistinctId: posthogDistinctIDBackendLLM,
		Event:      "LLM Generation",
		Properties: properties,
	})

	if err != nil {
		log.Printf("[Analytics] Failed to track LLM generation: %v", err)
	}
}

// estimateCost estimates the cost of an LLM generation based on model and tokens
func estimateCost(model string, promptTokens, outputTokens int) float64 {
	// Gemini pricing (as of 2025-01)
	// https://ai.google.dev/pricing
	switch model {
	case "gemini-2.5-flash-lite", "gemini-2.0-flash-lite":
		// Free tier (first 1M requests/day)
		// Paid tier: $0.025 per 1M input tokens, $0.10 per 1M output tokens
		inputCost := float64(promptTokens) * 0.025 / 1000000
		outputCost := float64(outputTokens) * 0.10 / 1000000
		return inputCost + outputCost
	case "gemini-1.5-flash":
		// $0.075 per 1M input tokens, $0.30 per 1M output tokens
		inputCost := float64(promptTokens) * 0.075 / 1000000
		outputCost := float64(outputTokens) * 0.30 / 1000000
		return inputCost + outputCost
	case "gemini-1.5-pro":
		// $1.25 per 1M input tokens, $5.00 per 1M output tokens
		inputCost := float64(promptTokens) * 1.25 / 1000000
		outputCost := float64(outputTokens) * 5.00 / 1000000
		return inputCost + outputCost
	default:
		// Unknown model
		return 0
	}
}

// Google Places API pricing estimates (as of 2025-01)
func estimatePlacesCost(apiType string) float64 {
	switch apiType {
	case "nearby", "search":
		// Nearby Search (New) and Text Search (New): $0.032 per request
		// Using basic fields (ID, name, address, location)
		return 0.032
	case "geocode":
		// Geocoding API: $0.005 per request
		return 0.005
	default:
		return 0
	}
}

// PlacesAPIProperties contains properties for Places API events
type PlacesAPIProperties struct {
	APIType      string // "nearby", "search", "geocode"
	DurationMs   int64  // Duration in milliseconds
	Success      bool   // Whether the call succeeded
	ErrorType    string // Error type if failed (empty if success)
	ResultCount  int    // Number of results returned
	CostEstimate float64 // Estimated cost in USD
	Query        string // Search query (for search endpoint)
	HasLocation  bool   // Whether location bias was used
}

// TrackPlacesAPICall tracks a Google Places API call
func TrackPlacesAPICall(userID string, props PlacesAPIProperties) {
	if !AnalyticsEnabled {
		return
	}

	// Calculate cost estimate if not provided
	if props.CostEstimate == 0 {
		props.CostEstimate = estimatePlacesCost(props.APIType)
	}

	// Build properties map
	properties := posthog.NewProperties().
		Set("model", "google-places-api").
		Set("use_case", props.APIType).
		Set("duration_ms", props.DurationMs).
		Set("success", props.Success).
		Set("result_count", props.ResultCount).
		Set("cost_estimate", props.CostEstimate)

	// Add optional properties
	if props.ErrorType != "" {
		properties.Set("error_type", props.ErrorType)
	}
	if props.HasLocation {
		properties.Set("has_location", props.HasLocation)
	}

	// Track event
	err := PostHogClient.Enqueue(posthog.Capture{
		DistinctId: posthogDistinctIDBackendPlaces,
		Event:      "LLM Generation",
		Properties: properties,
	})

	if err != nil {
		log.Printf("[Analytics] Failed to track Places API call: %v", err)
	}
}
