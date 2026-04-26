package main

import (
	"fmt"
	"net/url"
	"os"
	"strings"

	"myapp/lib"
)

const defaultPostHogAPIHost = "https://us.i.posthog.com"

var requiredStartupEnvVars = []string{
	"GEMINI_API_KEY",
	"GOOGLE_PLACES_API_KEY",
}

func validateStartupConfiguration() (lib.RuntimeResources, error) {
	runtimeResources := lib.LoadRuntimeResourcesFromEnv()

	var problems []string
	for _, envVar := range requiredStartupEnvVars {
		if strings.TrimSpace(os.Getenv(envVar)) == "" {
			problems = append(problems, fmt.Sprintf("%s is required", envVar))
		}
	}

	for _, field := range []struct {
		name  string
		value string
	}{
		{name: "FOOD_TRACKER_ADMIN_URL", value: runtimeResources.AdminURL},
		{name: "FOOD_TRACKER_API_BASE_URL", value: runtimeResources.APIBaseURL},
		{name: "FOOD_TRACKER_APP_URL", value: runtimeResources.AppURL},
		{name: "FOOD_TRACKER_MARKETING_URL", value: runtimeResources.MarketingURL},
		{name: "FOOD_TRACKER_POCKETBASE_URL", value: runtimeResources.PocketBaseURL},
		{name: "FOOD_TRACKER_POSTHOG_HOST", value: runtimeResources.PostHogHost},
		{name: "POSTHOG_HOST", value: resolvedPostHogAPIHost()},
	} {
		if err := validateAbsoluteHTTPURL(field.value); err != nil {
			problems = append(problems, fmt.Sprintf("%s %v", field.name, err))
		}
	}

	if err := validateURLScheme(runtimeResources.MobileAppScheme); err != nil {
		problems = append(problems, fmt.Sprintf("FOOD_TRACKER_APP_SCHEME %v", err))
	}

	if len(problems) > 0 {
		return runtimeResources, fmt.Errorf("invalid startup configuration: %s", strings.Join(problems, "; "))
	}

	return runtimeResources, nil
}

func resolvedPostHogAPIHost() string {
	value := strings.TrimSpace(os.Getenv("POSTHOG_HOST"))
	if value == "" {
		return defaultPostHogAPIHost
	}

	return value
}

func validateAbsoluteHTTPURL(raw string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return fmt.Errorf("must be a valid URL")
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("must use http or https")
	}

	if parsed.Host == "" {
		return fmt.Errorf("must include a host")
	}

	return nil
}

func validateURLScheme(raw string) error {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fmt.Errorf("must not be empty")
	}

	for index, char := range value {
		isLowerAlpha := char >= 'a' && char <= 'z'
		isUpperAlpha := char >= 'A' && char <= 'Z'
		isDigit := char >= '0' && char <= '9'
		isAllowedSymbol := char == '+' || char == '-' || char == '.'

		if index == 0 {
			if !isLowerAlpha && !isUpperAlpha {
				return fmt.Errorf("must start with a letter")
			}
			continue
		}

		if !isLowerAlpha && !isUpperAlpha && !isDigit && !isAllowedSymbol {
			return fmt.Errorf("contains invalid character %q", char)
		}
	}

	return nil
}
