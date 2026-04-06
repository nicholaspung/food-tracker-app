package main

import (
	"strings"
	"testing"
)

func TestValidateStartupConfigurationRejectsMissingRequiredEnvVars(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "")
	t.Setenv("GOOGLE_PLACES_API_KEY", "")

	_, err := validateStartupConfiguration()
	if err == nil {
		t.Fatalf("expected missing required env vars to fail validation")
	}

	if !strings.Contains(err.Error(), "GEMINI_API_KEY is required") {
		t.Fatalf("expected GEMINI_API_KEY validation failure, got %v", err)
	}
	if !strings.Contains(err.Error(), "GOOGLE_PLACES_API_KEY is required") {
		t.Fatalf("expected GOOGLE_PLACES_API_KEY validation failure, got %v", err)
	}
}

func TestValidateStartupConfigurationRejectsInvalidConfiguredURLs(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "test-gemini")
	t.Setenv("GOOGLE_PLACES_API_KEY", "test-places")
	t.Setenv("POSTHOG_HOST", "not-a-url")
	t.Setenv("FOOD_TRACKER_APP_URL", "ftp://bad.example.com")

	_, err := validateStartupConfiguration()
	if err == nil {
		t.Fatalf("expected invalid URL configuration to fail validation")
	}

	if !strings.Contains(err.Error(), "POSTHOG_HOST") {
		t.Fatalf("expected POSTHOG_HOST validation failure, got %v", err)
	}
	if !strings.Contains(err.Error(), "FOOD_TRACKER_APP_URL") {
		t.Fatalf("expected FOOD_TRACKER_APP_URL validation failure, got %v", err)
	}
}

func TestValidateStartupConfigurationAcceptsCurrentRequiredConfig(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "test-gemini")
	t.Setenv("GOOGLE_PLACES_API_KEY", "test-places")
	t.Setenv("POSTHOG_HOST", "https://analytics.example.com")
	t.Setenv("FOOD_TRACKER_APP_URL", "https://app.example.com")
	t.Setenv("FOOD_TRACKER_API_BASE_URL", "https://api.example.com")
	t.Setenv("FOOD_TRACKER_ADMIN_URL", "https://admin.example.com")
	t.Setenv("FOOD_TRACKER_MARKETING_URL", "https://www.example.com")
	t.Setenv("FOOD_TRACKER_POCKETBASE_URL", "https://pb.example.com")
	t.Setenv("FOOD_TRACKER_POSTHOG_HOST", "https://app.example.com/api/visit-insights")

	if _, err := validateStartupConfiguration(); err != nil {
		t.Fatalf("expected valid configuration to pass, got %v", err)
	}
}
