package lib

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

type loopsRoundTripFunc func(request *http.Request) (*http.Response, error)

func (roundTrip loopsRoundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return roundTrip(request)
}

func TestLoopsSendEventUsesIdempotencyKeyAndAcceptsDuplicateConflict(t *testing.T) {
	var receivedKey string
	client := LoopsClient{
		apiKey: "test-key",
		httpClient: &http.Client{Transport: loopsRoundTripFunc(func(request *http.Request) (*http.Response, error) {
			receivedKey = request.Header.Get("Idempotency-Key")
			return &http.Response{
				StatusCode: http.StatusConflict,
				Body:       io.NopCloser(strings.NewReader(`{"success":false,"message":"already used"}`)),
				Header:     make(http.Header),
			}, nil
		})},
	}

	err := client.SendEvent(LoopsEventInput{
		Email:          "person@example.com",
		EventName:      "waitlist_joined",
		IdempotencyKey: "durable-transition-key",
	})
	if err != nil {
		t.Fatalf("expected idempotency conflict to confirm prior delivery, got %v", err)
	}
	if receivedKey != "durable-transition-key" {
		t.Fatalf("expected idempotency header, got %q", receivedKey)
	}
}

func TestLoopsSendEventRejectsConflictWithoutIdempotencyKey(t *testing.T) {
	client := LoopsClient{
		apiKey: "test-key",
		httpClient: &http.Client{Transport: loopsRoundTripFunc(func(request *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusConflict,
				Body:       io.NopCloser(strings.NewReader(`{"success":false,"message":"conflict"}`)),
				Header:     make(http.Header),
			}, nil
		})},
	}

	if err := client.SendEvent(LoopsEventInput{Email: "person@example.com", EventName: "waitlist_joined"}); err == nil {
		t.Fatal("expected non-idempotent conflict to remain an error")
	}
}
