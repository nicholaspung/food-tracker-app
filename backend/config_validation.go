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
		name          string
		value         string
		disallowLocal bool
	}{
		{name: "FOOD_TRACKER_ADMIN_URL", value: runtimeResources.AdminURL, disallowLocal: true},
		{name: "FOOD_TRACKER_API_BASE_URL", value: runtimeResources.APIBaseURL, disallowLocal: true},
		{name: "FOOD_TRACKER_APP_URL", value: runtimeResources.AppURL, disallowLocal: true},
		{name: "FOOD_TRACKER_IOS_APP_STORE_URL", value: runtimeResources.IOSAppStoreURL, disallowLocal: true},
		{name: "FOOD_TRACKER_MARKETING_URL", value: runtimeResources.MarketingURL, disallowLocal: true},
		{name: "FOOD_TRACKER_POCKETBASE_URL", value: runtimeResources.PocketBaseURL, disallowLocal: true},
		{name: "FOOD_TRACKER_POSTHOG_HOST", value: runtimeResources.PostHogHost, disallowLocal: true},
		{name: "POSTHOG_HOST", value: resolvedPostHogAPIHost()},
	} {
		if err := validateAbsoluteHTTPURL(field.value); err != nil {
			problems = append(problems, fmt.Sprintf("%s %v", field.name, err))
		}
		if field.disallowLocal && runtimeResources.Environment != lib.RuntimeEnvironmentLocal && isLocalDevelopmentURL(field.value) {
			problems = append(problems, fmt.Sprintf("%s must not resolve to a local URL in %s", field.name, runtimeResources.Environment))
		}
	}

	if err := validateURLScheme(runtimeResources.MobileAppScheme); err != nil {
		problems = append(problems, fmt.Sprintf("FOOD_TRACKER_APP_SCHEME %v", err))
	}

	if runtimeResources.Environment != lib.RuntimeEnvironmentLocal {
		if !trustedProxyHeadersEnabled() {
			problems = append(problems, fmt.Sprintf("%s must be enabled in %s", trustProxyHeadersEnvKey, runtimeResources.Environment))
		}
		problems = append(problems, validateNonLocalMailpitConfiguration(runtimeResources.Environment)...)
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

func validateNonLocalMailpitConfiguration(environment lib.RuntimeEnvironment) []string {
	var problems []string

	for _, envVar := range []string{
		"FOOD_TRACKER_MAILPIT_SMTP_HOST",
		"FOOD_TRACKER_MAILPIT_SMTP_PORT",
		"FOOD_TRACKER_MAILPIT_UI_HOST",
		"FOOD_TRACKER_MAILPIT_UI_PORT",
	} {
		if strings.TrimSpace(os.Getenv(envVar)) != "" {
			problems = append(problems, fmt.Sprintf("%s is local-development only and must not be set in %s", envVar, environment))
		}
	}

	if smtpHost := strings.TrimSpace(os.Getenv("SMTP_HOST")); smtpHost != "" && isLocalHost(smtpHost) {
		problems = append(problems, fmt.Sprintf("SMTP_HOST must not use local Mailpit host %q in %s", smtpHost, environment))
	}

	return problems
}

func isLocalDevelopmentURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return false
	}

	return isLocalHost(parsed.Hostname())
}

func isLocalHost(host string) bool {
	switch strings.ToLower(strings.TrimSpace(host)) {
	case "localhost", "127.0.0.1", "::1":
		return true
	default:
		return false
	}
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
