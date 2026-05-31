package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExpoNotificationPushSenderIncludesAuthorizationHeaderWhenTokenConfigured(t *testing.T) {
	t.Setenv(expoPushAccessTokenEnvKey, "server-only-token")

	var capturedAuthorization string
	var capturedContentType string
	var capturedPayload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuthorization = r.Header.Get("Authorization")
		capturedContentType = r.Header.Get("Content-Type")
		if err := json.NewDecoder(r.Body).Decode(&capturedPayload); err != nil {
			t.Fatalf("failed to decode push request body: %v", err)
		}
		_, _ = w.Write([]byte(`{"data":{"id":"message_1","status":"ok"}}`))
	}))
	defer server.Close()

	sender := expoNotificationPushSender{client: server.Client(), endpoint: server.URL}
	messageID, err := sender.SendRemoteDeviceNotification("ExponentPushToken[test]", RemoteDeviceNotificationPayload{
		Title: "New tasting invite",
		Body:  "Open Food Tracker to respond.",
		Data:  map[string]any{"route": "TastingSessions"},
	})
	if err != nil {
		t.Fatalf("expected send to succeed, got %v", err)
	}

	if messageID != "message_1" {
		t.Fatalf("expected provider message id, got %q", messageID)
	}
	if capturedAuthorization != "Bearer server-only-token" {
		t.Fatalf("expected Authorization bearer token, got %q", capturedAuthorization)
	}
	if capturedContentType != "application/json" {
		t.Fatalf("expected JSON content type, got %q", capturedContentType)
	}
	if capturedPayload["to"] != "ExponentPushToken[test]" || capturedPayload["title"] != "New tasting invite" {
		t.Fatalf("unexpected push request payload: %#v", capturedPayload)
	}
}

func TestExpoNotificationPushSenderOmitsAuthorizationHeaderWhenTokenUnconfigured(t *testing.T) {
	t.Setenv(expoPushAccessTokenEnvKey, "")

	var capturedAuthorization string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuthorization = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{"data":{"id":"message_1","status":"ok"}}`))
	}))
	defer server.Close()

	sender := expoNotificationPushSender{client: server.Client(), endpoint: server.URL}
	if _, err := sender.SendRemoteDeviceNotification("ExponentPushToken[test]", RemoteDeviceNotificationPayload{}); err != nil {
		t.Fatalf("expected send to succeed, got %v", err)
	}

	if capturedAuthorization != "" {
		t.Fatalf("expected Authorization header to be omitted, got %q", capturedAuthorization)
	}
}

func TestExpoNotificationPushSenderSurfacesProviderFailureWithoutSensitiveLogText(t *testing.T) {
	t.Setenv(expoPushAccessTokenEnvKey, "server-only-token")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"data":{"status":"error","message":"UNAUTHORIZED"}}`))
	}))
	defer server.Close()

	sender := expoNotificationPushSender{client: server.Client(), endpoint: server.URL}
	_, err := sender.SendRemoteDeviceNotification("ExponentPushToken[test]", RemoteDeviceNotificationPayload{})
	if err == nil {
		t.Fatalf("expected unauthorized provider response to fail")
	}

	errorCode := normalizeProviderErrorCode(errors.New("UNAUTHORIZED server-only-token ExponentPushToken[test] New tasting invite"), RemoteDeviceNotificationPayload{
		Title: "New tasting invite",
		Body:  "Open Food Tracker to respond.",
	})
	for _, sensitiveValue := range []string{"server-only-token", "ExponentPushToken[test]", "New tasting invite"} {
		if strings.Contains(errorCode, sensitiveValue) {
			t.Fatalf("expected error code to omit %q, got %q", sensitiveValue, errorCode)
		}
	}
	if !strings.Contains(errorCode, "UNAUTHORIZED") {
		t.Fatalf("expected provider failure code to retain useful metadata, got %q", errorCode)
	}
}

func TestExpoNotificationPushSenderChecksReceipts(t *testing.T) {
	t.Setenv(expoPushAccessTokenEnvKey, "server-only-token")

	var capturedAuthorization string
	var capturedPayload map[string][]string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuthorization = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&capturedPayload); err != nil {
			t.Fatalf("failed to decode receipt request body: %v", err)
		}
		_, _ = w.Write([]byte(`{"data":{"receipt_ok":{"status":"ok"},"receipt_failed":{"status":"error","details":{"error":"DeviceNotRegistered"}}}}`))
	}))
	defer server.Close()

	sender := expoNotificationPushSender{client: server.Client(), receiptsEndpoint: server.URL}
	receipts, err := sender.CheckRemoteDeviceNotificationReceipts([]string{"receipt_ok", "receipt_failed"})
	if err != nil {
		t.Fatalf("expected receipt check to succeed, got %v", err)
	}

	if capturedAuthorization != "Bearer server-only-token" {
		t.Fatalf("expected Authorization bearer token, got %q", capturedAuthorization)
	}
	if len(capturedPayload["ids"]) != 2 || capturedPayload["ids"][0] != "receipt_ok" || capturedPayload["ids"][1] != "receipt_failed" {
		t.Fatalf("unexpected receipt request payload: %#v", capturedPayload)
	}
	if receipts["receipt_ok"].Status != "ok" || receipts["receipt_failed"].ErrorCode != "DeviceNotRegistered" {
		t.Fatalf("unexpected parsed receipts: %#v", receipts)
	}
}

func TestExpoNotificationPushSenderSurfacesReceiptRequestFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"errors":[{"code":"TOO_MANY_REQUESTS"}]}`))
	}))
	defer server.Close()

	sender := expoNotificationPushSender{client: server.Client(), receiptsEndpoint: server.URL}
	_, err := sender.CheckRemoteDeviceNotificationReceipts([]string{"receipt_1"})
	if err == nil || !strings.Contains(err.Error(), "TOO_MANY_REQUESTS") {
		t.Fatalf("expected receipt request failure code, got %v", err)
	}
}
