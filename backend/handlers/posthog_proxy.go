package handlers

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const postHogProxyPrefix = "/api/visit-insights"

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

		targetURL := posthogHost + path
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

	// Read request body
	body, err := io.ReadAll(re.Request.Body)
	if err != nil {
		return re.JSON(http.StatusBadRequest, map[string]string{
			"error": "Failed to read request body",
		})
	}
	defer re.Request.Body.Close()

	// Create proxy request
	proxyReq, err := http.NewRequest("POST", targetURL, bytes.NewReader(body))
	if err != nil {
		log.Printf("[PostHog Proxy] Failed to create request: %v", err)
		return re.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create proxy request",
		})
	}

	forwardPostHogRequestHeaders(re, proxyReq)

	// Make request to PostHog
	client := &http.Client{}
	resp, err := client.Do(proxyReq)
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
	proxyReq, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		log.Printf("[PostHog Proxy] Failed to create GET request: %v", err)
		return re.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create proxy request",
		})
	}

	forwardPostHogRequestHeaders(re, proxyReq)

	// Make request to PostHog
	client := &http.Client{}
	resp, err := client.Do(proxyReq)
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

	if xff := re.Request.Header.Get("X-Forwarded-For"); xff != "" {
		proxyReq.Header.Set("X-Forwarded-For", xff)
	} else if realIP := re.Request.Header.Get("X-Real-IP"); realIP != "" {
		proxyReq.Header.Set("X-Forwarded-For", realIP)
	}

	if referer := re.Request.Header.Get("Referer"); referer != "" {
		proxyReq.Header.Set("Referer", referer)
	}

	if auth := re.Request.Header.Get("Authorization"); auth != "" {
		proxyReq.Header.Set("Authorization", auth)
	}
}
