package lib

import (
	"os"
	"strings"
)

type RuntimeEnvironment string

const (
	RuntimeEnvironmentLocal      RuntimeEnvironment = "local"
	RuntimeEnvironmentBeta       RuntimeEnvironment = "beta"
	RuntimeEnvironmentProduction RuntimeEnvironment = "production"
)

type RuntimeResources struct {
	AdminURL      string
	APIBaseURL    string
	AppURL        string
	Environment   RuntimeEnvironment
	MarketingURL  string
	PocketBaseURL string
	PostHogHost   string
}

func normalizeRuntimeEnvironment(value string) RuntimeEnvironment {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "local", "dev", "development":
		return RuntimeEnvironmentLocal
	case "beta", "preview":
		return RuntimeEnvironmentBeta
	case "prod", "production":
		return RuntimeEnvironmentProduction
	default:
		return RuntimeEnvironmentLocal
	}
}

func LoadRuntimeResourcesFromEnv() RuntimeResources {
	environment := normalizeRuntimeEnvironment(os.Getenv("FOOD_TRACKER_ENV"))

	defaults := runtimeDefaultsForEnvironment(environment)

	return RuntimeResources{
		AdminURL:      readRuntimeValue("FOOD_TRACKER_ADMIN_URL", defaults.AdminURL),
		APIBaseURL:    readRuntimeValue("FOOD_TRACKER_API_BASE_URL", defaults.APIBaseURL),
		AppURL:        readRuntimeValue("FOOD_TRACKER_APP_URL", defaults.AppURL),
		Environment:   environment,
		MarketingURL:  readRuntimeValue("FOOD_TRACKER_MARKETING_URL", defaults.MarketingURL),
		PocketBaseURL: readRuntimeValue("FOOD_TRACKER_POCKETBASE_URL", defaults.PocketBaseURL),
		PostHogHost:   readRuntimeValue("FOOD_TRACKER_POSTHOG_HOST", defaults.PostHogHost),
	}
}

func runtimeDefaultsForEnvironment(environment RuntimeEnvironment) RuntimeResources {
	switch environment {
	case RuntimeEnvironmentBeta:
		return RuntimeResources{
			AdminURL:      "https://beta.admin.yummyrecs.com",
			APIBaseURL:    "https://beta.app.yummyrecs.com",
			AppURL:        "https://beta.app.yummyrecs.com",
			Environment:   RuntimeEnvironmentBeta,
			MarketingURL:  "https://beta.yummyrecs.com",
			PocketBaseURL: "https://beta.app.yummyrecs.com",
			PostHogHost:   "https://beta.app.yummyrecs.com/api/visit-insights",
		}
	case RuntimeEnvironmentProduction:
		return RuntimeResources{
			AdminURL:      "https://admin.yummyrecs.com",
			APIBaseURL:    "https://app.yummyrecs.com",
			AppURL:        "https://app.yummyrecs.com",
			Environment:   RuntimeEnvironmentProduction,
			MarketingURL:  "https://yummyrecs.com",
			PocketBaseURL: "https://app.yummyrecs.com",
			PostHogHost:   "https://app.yummyrecs.com/api/visit-insights",
		}
	default:
		return RuntimeResources{
			AdminURL:      "http://localhost:5173",
			APIBaseURL:    "http://127.0.0.1:8090",
			AppURL:        "http://localhost:8081",
			Environment:   RuntimeEnvironmentLocal,
			MarketingURL:  "http://localhost:4173",
			PocketBaseURL: "http://127.0.0.1:8090",
			PostHogHost:   "http://127.0.0.1:8090/api/visit-insights",
		}
	}
}

func readRuntimeValue(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	return value
}
