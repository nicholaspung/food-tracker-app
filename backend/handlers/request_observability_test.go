package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	_ "myapp/migrations"
	"myapp/testutil"
)

func TestSafeRequestID(t *testing.T) {
	if got := safeRequestID(" mobile-menu-scan-abc_123 "); got != "mobile-menu-scan-abc_123" {
		t.Fatalf("expected safe request id to be trimmed and preserved, got %q", got)
	}

	for _, value := range []string{"short", "contains space", "contains/slash"} {
		if got := safeRequestID(value); got != "" {
			t.Fatalf("expected unsafe request id %q to be rejected, got %q", value, got)
		}
	}
}

func TestResolveRequestIDPrefersSafeHeader(t *testing.T) {
	app := testutil.NewTestApp(t)
	request := httptest.NewRequest(http.MethodPost, "/api/parse-menu", nil)
	request.Header.Set(requestIDHeaderName, "mobile-menu-scan-test")
	event := &core.RequestEvent{
		App: app,
	}
	event.Request = request
	event.Response = httptest.NewRecorder()

	if got := resolveRequestID(event); got != "mobile-menu-scan-test" {
		t.Fatalf("expected request id from header, got %q", got)
	}
}

func TestResolveRequestIDGeneratesFallback(t *testing.T) {
	app := testutil.NewTestApp(t)
	request := httptest.NewRequest(http.MethodPost, "/api/parse-menu", nil)
	request.Header.Set(requestIDHeaderName, "bad id")
	event := &core.RequestEvent{
		App: app,
	}
	event.Request = request
	event.Response = httptest.NewRecorder()

	got := resolveRequestID(event)
	if safeRequestID(got) == "" {
		t.Fatalf("expected generated safe request id, got %q", got)
	}
}
