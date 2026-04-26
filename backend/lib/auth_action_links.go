package lib

import (
	"fmt"
	"net/url"
	"strings"
)

type AuthActionLinks struct {
	WebURL       string
	AppURL       string
	MarketingURL string
}

type AuthActionKind string

const (
	AuthActionPasswordReset AuthActionKind = "password_reset"
	AuthActionVerifyEmail   AuthActionKind = "verify_email"
)

func BuildAuthActionLinks(resources RuntimeResources, action AuthActionKind, token string) (AuthActionLinks, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return AuthActionLinks{}, fmt.Errorf("token is required")
	}

	var path string
	switch action {
	case AuthActionPasswordReset:
		path = "/reset-password"
	case AuthActionVerifyEmail:
		path = "/verify-email"
	default:
		return AuthActionLinks{}, fmt.Errorf("unsupported auth action %q", action)
	}

	webURL, err := buildHTTPAuthActionURL(resources.AppURL, path, token)
	if err != nil {
		return AuthActionLinks{}, err
	}

	appURL, err := buildSchemeAuthActionURL(resources.MobileAppScheme, path, token)
	if err != nil {
		return AuthActionLinks{}, err
	}

	return AuthActionLinks{
		WebURL:       webURL,
		AppURL:       appURL,
		MarketingURL: strings.TrimRight(resources.MarketingURL, "/"),
	}, nil
}

func buildHTTPAuthActionURL(baseURL string, path string, token string) (string, error) {
	parsed, err := url.Parse(strings.TrimRight(strings.TrimSpace(baseURL), "/"))
	if err != nil {
		return "", fmt.Errorf("invalid app URL: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("app URL must use http or https")
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("app URL must include a host")
	}

	parsed.Path = strings.TrimRight(parsed.Path, "/") + path
	values := parsed.Query()
	values.Set("token", token)
	parsed.RawQuery = values.Encode()

	return parsed.String(), nil
}

func buildSchemeAuthActionURL(scheme string, path string, token string) (string, error) {
	scheme = strings.TrimSpace(scheme)
	if scheme == "" {
		return "", fmt.Errorf("app scheme is required")
	}

	values := url.Values{}
	values.Set("token", token)

	return fmt.Sprintf("%s://%s?%s", scheme, strings.TrimPrefix(path, "/"), values.Encode()), nil
}
