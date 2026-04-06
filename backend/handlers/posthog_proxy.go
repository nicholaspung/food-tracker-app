package handlers

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const postHogProxyPrefix = "/api/visit-insights"

const maxPostHogProxyBodyBytes int64 = 512 << 10

// RegisterPostHogProxyHandlers registers the PostHog reverse proxy endpoints
// This allows the frontend to send analytics events through our backend,
// bypassing ad blockers and improving privacy
//
// Note: Uses /api/visit-insights path to blend in with the app's visit tracking
// feature and avoid detection by ad blockers (they look for /analytics, /tracking, etc.)
//
// Following PostHog best practices:
// - Routes static assets to us-assets.i.posthog.com
// - Routes API calls to us.i.posthog.com
// - Handles both with and without trailing slashes
func RegisterPostHogProxyHandlers(e *core.ServeEvent) error {
	// Get PostHog hosts from environment
	posthogHost := os.Getenv("POSTHOG_HOST")
	if posthogHost == "" {
		posthogHost = "https://us.i.posthog.com"
	}
	posthogHost = strings.TrimSuffix(posthogHost, "/")

	// Determine assets host based on main host
	posthogAssetsHost := strings.Replace(posthogHost, "i.posthog.com", "assets.i.posthog.com", 1)

	// Static assets proxy (for PostHog JavaScript SDK and other static files)
	// GET /api/visit-insights/static/* -> us-assets.i.posthog.com/static/*
	e.Router.GET(postHogProxyPrefix+"/static/*", func(re *core.RequestEvent) error {
		path := strings.TrimPrefix(re.Request.URL.Path, postHogProxyPrefix)
		return proxyPostHogRequestGET(re, posthogAssetsHost+path)
	})

	// Proxy API endpoints through with their original path so newer SDK routes
	// such as /flags and /array/<token>/config do not 404 in local dev.
	registerPostHogMethodProxy(e, http.MethodGet, posthogHost)
	registerPostHogMethodProxy(e, http.MethodPost, posthogHost)

	log.Printf("[PostHog Proxy] Registered visit-insights proxy endpoints")
	log.Printf("[PostHog Proxy] - API: %s", posthogHost)
	log.Printf("[PostHog Proxy] - Assets: %s", posthogAssetsHost)
	return nil
}

func registerPostHogMethodProxy(e *core.ServeEvent, method string, posthogHost string) {
	handler := func(re *core.RequestEvent) error {
		path := strings.TrimPrefix(re.Request.URL.Path, postHogProxyPrefix)
		if path == "" {
			path = "/"
		}

		targetURL, err := resolvePostHogTargetURL(method, path, posthogHost)
		if err != nil {
			return apis.NewNotFoundError("analytics route not found", err)
		}

		if method == http.MethodGet {
			return proxyPostHogRequestGET(re, targetURL)
		}

		return proxyPostHogRequest(re, targetURL)
	}

	e.Router.Route(method, postHogProxyPrefix, handler)
	e.Router.Route(method, postHogProxyPrefix+"/{path...}", handler)
}

// proxyPostHogRequest proxies the request to PostHog and returns the response
func proxyPostHogRequest(re *core.RequestEvent, targetURL string) error {
	if re.Request.URL.RawQuery != "" {
		targetURL += "?" + re.Request.URL.RawQuery
	}

	body, err := readPostHogProxyBody(re.Request.Body, maxPostHogProxyBodyBytes)
	if err != nil {
		statusCode := http.StatusBadRequest
		if isRequestBodyTooLarge(err) {
			statusCode = http.StatusRequestEntityTooLarge
		}
		return re.JSON(statusCode, map[string]string{
			"error": err.Error(),
		})
	}
	defer re.Request.Body.Close()

	// Create proxy request
	ctx, cancel := requestContextWithTimeout(re, postHogProxyTimeout)
	defer cancel()

	proxyReq, err := http.NewRequestWithContext(ctx, "POST", targetURL, bytes.NewReader(body))
	if err != nil {
		log.Printf("[PostHog Proxy] Failed to create request: %v", err)
		return re.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create proxy request",
		})
	}

	forwardPostHogRequestHeaders(re, proxyReq)

	// Make request to PostHog
	resp, err := postHogHTTPClient.Do(proxyReq)
	if err != nil {
		log.Printf("[PostHog Proxy] Failed to proxy request: %v", err)
		return re.JSON(http.StatusBadGateway, map[string]string{
			"error": "Failed to reach analytics service",
		})
	}
	defer resp.Body.Close()

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[PostHog Proxy] Failed to read response: %v", err)
		return re.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to read analytics response",
		})
	}

	// Forward response headers
	for key, values := range resp.Header {
		for _, value := range values {
			re.Response.Header().Add(key, value)
		}
	}

	// Return response with same status code
	re.Response.WriteHeader(resp.StatusCode)
	re.Response.Write(respBody)

	return nil
}

// proxyPostHogRequestGET proxies GET requests to PostHog (for feature flags)
func proxyPostHogRequestGET(re *core.RequestEvent, targetURL string) error {
	// Append query parameters
	if re.Request.URL.RawQuery != "" {
		targetURL += "?" + re.Request.URL.RawQuery
	}

	// Create proxy request
	ctx, cancel := requestContextWithTimeout(re, postHogProxyTimeout)
	defer cancel()

	proxyReq, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
	if err != nil {
		log.Printf("[PostHog Proxy] Failed to create GET request: %v", err)
		return re.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create proxy request",
		})
	}

	forwardPostHogRequestHeaders(re, proxyReq)

	// Make request to PostHog
	resp, err := postHogHTTPClient.Do(proxyReq)
	if err != nil {
		log.Printf("[PostHog Proxy] Failed to proxy GET request: %v", err)
		return re.JSON(http.StatusBadGateway, map[string]string{
			"error": "Failed to reach analytics service",
		})
	}
	defer resp.Body.Close()

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[PostHog Proxy] Failed to read GET response: %v", err)
		return re.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to read analytics response",
		})
	}

	// Forward response headers
	for key, values := range resp.Header {
		for _, value := range values {
			re.Response.Header().Add(key, value)
		}
	}

	// Return response with same status code
	re.Response.WriteHeader(resp.StatusCode)
	re.Response.Write(respBody)

	return nil
}

func forwardPostHogRequestHeaders(re *core.RequestEvent, proxyReq *http.Request) {
	if contentType := re.Request.Header.Get("Content-Type"); contentType != "" {
		proxyReq.Header.Set("Content-Type", contentType)
	}

	if accept := re.Request.Header.Get("Accept"); accept != "" {
		proxyReq.Header.Set("Accept", accept)
	}

	if ua := re.Request.Header.Get("User-Agent"); ua != "" {
		proxyReq.Header.Set("User-Agent", ua)
	}

	if realIP := strings.TrimSpace(re.RealIP()); realIP != "" {
		proxyReq.Header.Set("X-Forwarded-For", realIP)
		proxyReq.Header.Set("X-Real-IP", realIP)
	}

	if referer := re.Request.Header.Get("Referer"); referer != "" {
		proxyReq.Header.Set("Referer", referer)
	}
}

func resolvePostHogTargetURL(method string, requestPath string, posthogHost string) (string, error) {
	cleanPath, err := sanitizePostHogRequestPath(requestPath)
	if err != nil {
		return "", err
	}

	if !isAllowedPostHogRoute(method, cleanPath) {
		return "", fmt.Errorf("route %s %s is not allowlisted", method, cleanPath)
	}

	return posthogHost + cleanPath, nil
}

func sanitizePostHogRequestPath(requestPath string) (string, error) {
	trimmed := strings.TrimSpace(requestPath)
	if trimmed == "" || trimmed == "/" {
		return "/", nil
	}

	if !strings.HasPrefix(trimmed, "/") {
		trimmed = "/" + trimmed
	}

	hadTrailingSlash := strings.HasSuffix(trimmed, "/")
	cleaned := path.Clean(trimmed)
	if cleaned == "." {
		cleaned = "/"
	}

	if !strings.HasPrefix(cleaned, "/") {
		return "", fmt.Errorf("invalid analytics path")
	}

	if hadTrailingSlash && cleaned != "/" {
		cleaned += "/"
	}

	return cleaned, nil
}

func isAllowedPostHogRoute(method string, requestPath string) bool {
	switch method {
	case http.MethodGet:
		return requestPath == "/flags" ||
			requestPath == "/flags/" ||
			isAllowedPostHogArrayConfigPath(requestPath)
	case http.MethodPost:
		return requestPath == "/flags" ||
			requestPath == "/flags/" ||
			hasAllowedPostHogPrefix(requestPath, "/batch") ||
			hasAllowedPostHogPrefix(requestPath, "/capture") ||
			hasAllowedPostHogPrefix(requestPath, "/decide") ||
			hasAllowedPostHogPrefix(requestPath, "/e") ||
			hasAllowedPostHogPrefix(requestPath, "/engage") ||
			hasAllowedPostHogPrefix(requestPath, "/i/v0/e") ||
			hasAllowedPostHogPrefix(requestPath, "/s")
	default:
		return false
	}
}

func isAllowedPostHogArrayConfigPath(requestPath string) bool {
	if !strings.HasPrefix(requestPath, "/array/") {
		return false
	}

	segments := strings.Split(strings.Trim(requestPath, "/"), "/")
	return len(segments) == 3 && segments[0] == "array" && segments[1] != "" && segments[2] == "config"
}

func hasAllowedPostHogPrefix(requestPath string, prefix string) bool {
	return requestPath == prefix || strings.HasPrefix(requestPath, prefix+"/")
}
