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

func TestBuildSignupURLFallsBackToAppURL(t *testing.T) {
	signupURL := buildSignupURL("", "user@example.com")

	if !strings.HasPrefix(signupURL, "https://app.yummyrecs.com/signup?") {
		t.Fatalf("expected fallback app signup URL, got %s", signupURL)
	}
	if !strings.Contains(signupURL, "mode=waitlist_approved") {
		t.Fatalf("expected waitlist approved mode in signup URL, got %s", signupURL)
	}
}

func TestBuildWaitlistApprovalEmailHTMLUsesBrandedTemplate(t *testing.T) {
	signupURL := "https://app.yummyrecs.com/signup?email=user%40example.com&mode=waitlist_approved"
	html := buildWaitlistApprovalEmailHTML("user@example.com", signupURL, "https://yummyrecs.com")

	for _, expected := range []string{
		"Yummy Recs",
		"You&#39;re approved!",
		"Create your account",
		"https://app.yummyrecs.com/signup?email=user%40example.com&amp;mode=waitlist_approved",
		"user@example.com",
		"Open this in Yummy Recs.",
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected waitlist approval email HTML to contain %q, got %s", expected, html)
		}
	}
}
