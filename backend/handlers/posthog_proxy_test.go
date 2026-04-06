package handlers_test

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (fn roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestPostHogProxyForwardsFlagsAndConfigRoutes(t *testing.T) {
	var seenFlagsPath string
	var seenFlagsQuery string
	var seenFlagsBody string
	var seenFlagsAuthorization string
	var seenFlagsForwardedFor string
	var seenConfigPath string
	var seenUnexpectedPath string

	previousTransport := http.DefaultTransport
	http.DefaultTransport = roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		body := []byte{}
		if r.Body != nil {
			var err error
			body, err = io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("failed to read upstream request body: %v", err)
			}
		}

		switch r.URL.Path {
		case "/flags/":
			seenFlagsPath = r.URL.Path
			seenFlagsQuery = r.URL.RawQuery
			seenFlagsBody = string(body)
			seenFlagsAuthorization = r.Header.Get("Authorization")
			seenFlagsForwardedFor = r.Header.Get("X-Forwarded-For")
			return &http.Response{
				StatusCode: http.StatusOK,
				Header: http.Header{
					"Content-Type": []string{"application/json"},
				},
				Body: io.NopCloser(bytes.NewBufferString(`{"flags":{"demo":true}}`)),
			}, nil
		case "/array/phc_test/config":
			seenConfigPath = r.URL.Path
			return &http.Response{
				StatusCode: http.StatusOK,
				Header: http.Header{
					"Content-Type": []string{"application/json"},
				},
				Body: io.NopCloser(bytes.NewBufferString(`{"supportedCompression":["gzip"]}`)),
			}, nil
		default:
			seenUnexpectedPath = r.URL.Path
			return &http.Response{
				StatusCode: http.StatusNotFound,
				Header: http.Header{
					"Content-Type": []string{"application/json"},
				},
				Body: io.NopCloser(bytes.NewBufferString(`{"error":"not found"}`)),
			}, nil
		}
	})
	t.Cleanup(func() {
		http.DefaultTransport = previousTransport
	})

	previousHost := os.Getenv("POSTHOG_HOST")
	if err := os.Setenv("POSTHOG_HOST", "https://analytics.example.test"); err != nil {
		t.Fatalf("failed to set POSTHOG_HOST: %v", err)
	}
	t.Cleanup(func() {
		if previousHost == "" {
			_ = os.Unsetenv("POSTHOG_HOST")
			return
		}
		_ = os.Setenv("POSTHOG_HOST", previousHost)
	})

	server := newPreparedServer(t, func(se *core.ServeEvent, _ core.App) {
		if err := handlers.RegisterPostHogProxyHandlers(se); err != nil {
			t.Fatalf("failed to register posthog handlers: %v", err)
		}
	})

	flagsRequest := httptest.NewRequest(
		http.MethodPost,
		"/api/visit-insights/flags/?v=2",
		bytes.NewBufferString(`{"token":"phc_test","distinct_id":"user_123"}`),
	)
	flagsRequest.Header.Set("Content-Type", "application/json")
	flagsRequest.Header.Set("Authorization", "Bearer upstream-should-not-see-this")
	flagsRequest.Header.Set("X-Forwarded-For", "198.51.100.9")
	flagsRequest.RemoteAddr = "203.0.113.25:43123"

	flagsResponse := httptest.NewRecorder()
	server.mux.ServeHTTP(flagsResponse, flagsRequest)
	if flagsResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for flags proxy, got %d with body %s", flagsResponse.Code, flagsResponse.Body.String())
	}

	configRequest := httptest.NewRequest(
		http.MethodGet,
		"/api/visit-insights/array/phc_test/config",
		nil,
	)
	configResponse := httptest.NewRecorder()
	server.mux.ServeHTTP(configResponse, configRequest)

	if seenFlagsPath != "/flags/" {
		t.Fatalf("expected flags path to be proxied with trailing slash, got %q", seenFlagsPath)
	}

	if seenFlagsQuery != "v=2" {
		t.Fatalf("expected flags query to be preserved, got %q", seenFlagsQuery)
	}

	if seenFlagsBody != `{"token":"phc_test","distinct_id":"user_123"}` {
		t.Fatalf("expected flags body to be preserved, got %q", seenFlagsBody)
	}

	if seenFlagsAuthorization != "" {
		t.Fatalf("expected authorization header to be stripped, got %q", seenFlagsAuthorization)
	}

	if seenFlagsForwardedFor != "203.0.113.25" {
		t.Fatalf("expected forwarded IP to come from the server request context, got %q", seenFlagsForwardedFor)
	}

	if seenConfigPath != "/array/phc_test/config" {
		t.Fatalf(
			"expected config path to be preserved, got %q (status=%d body=%s unexpected=%q)",
			seenConfigPath,
			configResponse.Code,
			configResponse.Body.String(),
			seenUnexpectedPath,
		)
	}

	if seenUnexpectedPath != "" {
		t.Fatalf("expected no unexpected upstream path, got %q", seenUnexpectedPath)
	}

	if configResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for config proxy, got %d with body %s", configResponse.Code, configResponse.Body.String())
	}
}

func TestPostHogProxyRejectsNonAllowlistedRoutes(t *testing.T) {
	previousTransport := http.DefaultTransport
	upstreamCalls := 0
	http.DefaultTransport = roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		upstreamCalls++
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(bytes.NewBufferString(`{"ok":true}`)),
		}, nil
	})
	t.Cleanup(func() {
		http.DefaultTransport = previousTransport
	})

	server := newPreparedServer(t, func(se *core.ServeEvent, _ core.App) {
		if err := handlers.RegisterPostHogProxyHandlers(se); err != nil {
			t.Fatalf("failed to register posthog handlers: %v", err)
		}
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visit-insights/projects/",
		"",
		`{"token":"phc_test"}`,
	)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected non-allowlisted route to return 404, got %d: %s", response.Code, response.Body.String())
	}

	if upstreamCalls != 0 {
		t.Fatalf("expected blocked route to avoid upstream proxying, got %d upstream calls", upstreamCalls)
	}
}

func TestPostHogProxyRejectsOversizedBodies(t *testing.T) {
	previousTransport := http.DefaultTransport
	upstreamCalls := 0
	http.DefaultTransport = roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		upstreamCalls++
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(bytes.NewBufferString(`{"ok":true}`)),
		}, nil
	})
	t.Cleanup(func() {
		http.DefaultTransport = previousTransport
	})

	server := newPreparedServer(t, func(se *core.ServeEvent, _ core.App) {
		if err := handlers.RegisterPostHogProxyHandlers(se); err != nil {
			t.Fatalf("failed to register posthog handlers: %v", err)
		}
	})

	oversizedBody := bytes.Repeat([]byte("a"), 513<<10)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/visit-insights/e/",
		bytes.NewReader(oversizedBody),
	)
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	server.mux.ServeHTTP(response, request)

	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected oversized body to return 413, got %d: %s", response.Code, response.Body.String())
	}

	if upstreamCalls != 0 {
		t.Fatalf("expected oversized body to be rejected before proxying, got %d upstream calls", upstreamCalls)
	}
}

func TestPostHogProxyRouteRateLimitBlocksBurstRequests(t *testing.T) {
	previousTransport := http.DefaultTransport
	http.DefaultTransport = roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(bytes.NewBufferString(`{"status":1}`)),
		}, nil
	})
	t.Cleanup(func() {
		http.DefaultTransport = previousTransport
	})

	server := newPreparedServer(t, func(se *core.ServeEvent, _ core.App) {
		if err := handlers.RegisterPostHogProxyHandlers(se); err != nil {
			t.Fatalf("failed to register posthog handlers: %v", err)
		}
	})

	server.app.Settings().RateLimits.Enabled = true
	server.app.Settings().RateLimits.Rules = []core.RateLimitRule{
		{Label: "POST /api/visit-insights/", Duration: 60, MaxRequests: 2},
	}

	for i := 0; i < 2; i++ {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPost,
			"/api/visit-insights/e/",
			"",
			`{"event":"test"}`,
		)
		if response.Code != http.StatusOK {
			t.Fatalf("expected initial proxy request %d to succeed, got %d: %s", i+1, response.Code, response.Body.String())
		}
	}

	limitedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visit-insights/e/",
		"",
		`{"event":"test"}`,
	)
	if limitedResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after proxy burst, got %d: %s", limitedResponse.Code, limitedResponse.Body.String())
	}
}
