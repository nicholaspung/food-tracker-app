package handlers

import (
	"strings"
	"testing"
)

func TestBuildSignupURLIncludesWaitlistApprovedMode(t *testing.T) {
	signupURL := buildSignupURL(" https://app.yummyrecs.com/ ", " USER@example.COM ")

	if signupURL != "https://app.yummyrecs.com/signup?email=user%40example.com&mode=waitlist_approved" {
		t.Fatalf("unexpected signup URL: %s", signupURL)
	}
}

func TestBuildSignupURLFallsBackToMarketingURL(t *testing.T) {
	signupURL := buildSignupURL("", "user@example.com")

	if !strings.HasPrefix(signupURL, "https://yummyrecs.com/signup?") {
		t.Fatalf("expected fallback marketing signup URL, got %s", signupURL)
	}
	if !strings.Contains(signupURL, "mode=waitlist_approved") {
		t.Fatalf("expected waitlist approved mode in signup URL, got %s", signupURL)
	}
}
