package lib

import (
	"testing"

	"github.com/posthog/posthog-go"
)

func TestUserAnalyticsKeyMatchesMobileFallbackShape(t *testing.T) {
	key := UserAnalyticsKey("raw-pocketbase-id")

	if key != "usr_cw7xmj" {
		t.Fatalf("expected stable analytics key usr_cw7xmj, got %q", key)
	}
}

func TestTrackActivationEmailVerified(t *testing.T) {
	previousEnabled := AnalyticsEnabled
	previousEnqueue := enqueuePostHogCapture
	t.Cleanup(func() {
		AnalyticsEnabled = previousEnabled
		enqueuePostHogCapture = previousEnqueue
	})

	var captured posthog.Capture
	AnalyticsEnabled = true
	enqueuePostHogCapture = func(capture posthog.Capture) error {
		captured = capture
		return nil
	}

	t.Setenv("APP_ENV", "test")

	TrackActivationEmailVerified("raw-pocketbase-id", "backend_email_verification")

	expectedUserKey := UserAnalyticsKey("raw-pocketbase-id")
	if captured.Event != "activation.email_verified" {
		t.Fatalf("expected activation.email_verified event, got %q", captured.Event)
	}
	if captured.DistinctId != expectedUserKey {
		t.Fatalf("expected distinct id %q, got %q", expectedUserKey, captured.DistinctId)
	}
	if captured.Properties["userKey"] != expectedUserKey {
		t.Fatalf("expected userKey property %q, got %v", expectedUserKey, captured.Properties["userKey"])
	}
	if captured.Properties["source"] != "backend_email_verification" {
		t.Fatalf("expected backend source, got %v", captured.Properties["source"])
	}
	if captured.Properties["environment"] != "test" {
		t.Fatalf("expected test environment, got %v", captured.Properties["environment"])
	}
}
