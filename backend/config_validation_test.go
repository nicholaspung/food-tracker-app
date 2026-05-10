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
	t.Setenv("FOOD_TRACKER_POSTHOG_HOST", "https://app.example.com/api/analytics")

	if _, err := validateStartupConfiguration(); err != nil {
		t.Fatalf("expected valid configuration to pass, got %v", err)
	}
}

func TestValidateStartupConfigurationRejectsNonLocalEnvironmentLocalURLs(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "test-gemini")
	t.Setenv("GOOGLE_PLACES_API_KEY", "test-places")
	t.Setenv("FOOD_TRACKER_ENV", "beta")
	t.Setenv("FOOD_TRACKER_APP_URL", "http://localhost:8081")

	_, err := validateStartupConfiguration()
	if err == nil {
		t.Fatalf("expected beta configuration with local app URL to fail validation")
	}

	if !strings.Contains(err.Error(), "FOOD_TRACKER_APP_URL must not resolve to a local URL in beta") {
		t.Fatalf("expected local app URL validation failure, got %v", err)
	}
}

func TestValidateStartupConfigurationRejectsNonLocalEnvironmentLoopbackURLs(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "test-gemini")
	t.Setenv("GOOGLE_PLACES_API_KEY", "test-places")
	t.Setenv("FOOD_TRACKER_ENV", "production")
	t.Setenv("FOOD_TRACKER_API_BASE_URL", "http://127.0.0.1:8090")

	_, err := validateStartupConfiguration()
	if err == nil {
		t.Fatalf("expected production configuration with loopback API URL to fail validation")
	}

	if !strings.Contains(err.Error(), "FOOD_TRACKER_API_BASE_URL must not resolve to a local URL in production") {
		t.Fatalf("expected loopback API URL validation failure, got %v", err)
	}
}

func TestValidateStartupConfigurationAcceptsProductionURLs(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "test-gemini")
	t.Setenv("GOOGLE_PLACES_API_KEY", "test-places")
	t.Setenv("FOOD_TRACKER_ENV", "production")
	t.Setenv("FOOD_TRACKER_APP_URL", "https://app.yummyrecs.com")
	t.Setenv("FOOD_TRACKER_API_BASE_URL", "https://app.yummyrecs.com")
	t.Setenv("FOOD_TRACKER_ADMIN_URL", "https://admin.yummyrecs.com")
	t.Setenv("FOOD_TRACKER_MARKETING_URL", "https://yummyrecs.com")
	t.Setenv("FOOD_TRACKER_POCKETBASE_URL", "https://app.yummyrecs.com")
	t.Setenv("FOOD_TRACKER_POSTHOG_HOST", "https://app.yummyrecs.com/api/analytics")
	t.Setenv("FOOD_TRACKER_APP_SCHEME", "yummyrecs")

	if _, err := validateStartupConfiguration(); err != nil {
		t.Fatalf("expected production defaults to pass, got %v", err)
	}
}

func TestValidateStartupConfigurationAcceptsLocalDefaults(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "test-gemini")
	t.Setenv("GOOGLE_PLACES_API_KEY", "test-places")
	t.Setenv("FOOD_TRACKER_ENV", "local")
	t.Setenv("FOOD_TRACKER_APP_URL", "http://localhost:8081")
	t.Setenv("FOOD_TRACKER_API_BASE_URL", "http://127.0.0.1:8090")
	t.Setenv("FOOD_TRACKER_ADMIN_URL", "http://localhost:5173")
	t.Setenv("FOOD_TRACKER_MARKETING_URL", "http://localhost:4173")
	t.Setenv("FOOD_TRACKER_POCKETBASE_URL", "http://127.0.0.1:8090")
	t.Setenv("FOOD_TRACKER_POSTHOG_HOST", "http://127.0.0.1:8090/api/analytics")
	t.Setenv("FOOD_TRACKER_APP_SCHEME", "yummyrecs")

	if _, err := validateStartupConfiguration(); err != nil {
		t.Fatalf("expected local defaults to pass, got %v", err)
	}
}
