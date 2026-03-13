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

	flagsResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/visit-insights/flags/?v=2",
		"",
		`{"token":"phc_test","distinct_id":"user_123"}`,
	)
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
