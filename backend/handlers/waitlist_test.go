package handlers

import (
	"strings"
	"testing"
)

func TestBuildSignupURLIncludesWaitlistApprovedMode(t *testing.T) {
	signupURL := buildSignupURL(" https://app.yummyrecs.com/ ", " USER@example.COM ", "signed.token")

	if signupURL != "https://app.yummyrecs.com/signup?email=user%40example.com&mode=waitlist_approved&waitlistApprovalToken=signed.token" {
		t.Fatalf("unexpected signup URL: %s", signupURL)
	}
}

func TestBuildSignupURLFallsBackToAppURL(t *testing.T) {
	signupURL := buildSignupURL("", "user@example.com", "signed.token")

	if !strings.HasPrefix(signupURL, "https://app.yummyrecs.com/signup?") {
		t.Fatalf("expected fallback app signup URL, got %s", signupURL)
	}
	if !strings.Contains(signupURL, "mode=waitlist_approved") {
		t.Fatalf("expected waitlist approved mode in signup URL, got %s", signupURL)
	}
	if !strings.Contains(signupURL, "waitlistApprovalToken=signed.token") {
		t.Fatalf("expected waitlist approval token in signup URL, got %s", signupURL)
	}
}

func TestBuildSignupAppURLUsesMobileScheme(t *testing.T) {
	signupAppURL := buildSignupAppURL("yummyrecs-preview", " USER@example.COM ", "signed.token")

	if signupAppURL != "yummyrecs-preview://signup?email=user%40example.com&mode=waitlist_approved&waitlistApprovalToken=signed.token" {
		t.Fatalf("unexpected signup app URL: %s", signupAppURL)
	}
}

func TestBuildSignupAppURLFallsBackToProductionScheme(t *testing.T) {
	signupAppURL := buildSignupAppURL("", "user@example.com", "signed.token")

	if signupAppURL != "yummyrecs://signup?email=user%40example.com&mode=waitlist_approved&waitlistApprovalToken=signed.token" {
		t.Fatalf("unexpected fallback signup app URL: %s", signupAppURL)
	}
}

func TestBuildAppOpenURLUsesMobileScheme(t *testing.T) {
	appOpenURL := buildAppOpenURL("yummyrecs-preview")

	if appOpenURL != "yummyrecs-preview://" {
		t.Fatalf("unexpected app open URL: %s", appOpenURL)
	}
}

func TestBuildAppOpenURLFallsBackToProductionScheme(t *testing.T) {
	appOpenURL := buildAppOpenURL("")

	if appOpenURL != "yummyrecs://" {
		t.Fatalf("unexpected fallback app open URL: %s", appOpenURL)
	}
}

func TestBuildWaitlistApprovalEmailHTMLUsesBrandedTemplate(t *testing.T) {
	signupURL := "https://app.yummyrecs.com/signup?email=user%40example.com&mode=waitlist_approved&waitlistApprovalToken=signed.token"
	signupAppURL := "yummyrecs://signup?email=user%40example.com&mode=waitlist_approved&waitlistApprovalToken=signed.token"
	html := buildWaitlistApprovalEmailHTML("user@example.com", signupURL, signupAppURL, "https://yummyrecs.com")

	for _, expected := range []string{
		"Yummy Recs",
		"You&#39;re approved!",
		"Create your account",
		"https://app.yummyrecs.com/signup?email=user%40example.com&amp;mode=waitlist_approved&amp;waitlistApprovalToken=signed.token",
		"yummyrecs://signup?email=user%40example.com&amp;mode=waitlist_approved&amp;waitlistApprovalToken=signed.token",
		"user@example.com",
		"Already have the app?",
		"Open Yummy Recs",
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected waitlist approval email HTML to contain %q, got %s", expected, html)
		}
	}
	if strings.Contains(html, ">yummyrecs://signup?email=user%40example.com&amp;mode=waitlist_approved&amp;waitlistApprovalToken=signed.token</a>") {
		t.Fatalf("expected waitlist approval app URL not to render as visible link text, got %s", html)
	}
}

func TestBuildWaitlistJoinedEmailHTMLUsesBrandedTemplate(t *testing.T) {
	appStoreURL := `https://apps.apple.com/us/app/yummy-recs/id6761597807?ct="waitlist"`
	html := buildWaitlistJoinedEmailHTML(`user+waitlist@example.com`, appStoreURL, "yummyrecs://", "https://yummyrecs.com")

	for _, expected := range []string{
		"Yummy Recs",
		"You&#39;re on the waitlist",
		"Download on the App Store",
		"https://apps.apple.com/us/app/yummy-recs/id6761597807?ct=&#34;waitlist&#34;",
		"yummyrecs://",
		"user+waitlist@example.com",
		"If you did not join the Yummy Recs waitlist, you can ignore this email.",
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected waitlist joined email HTML to contain %q, got %s", expected, html)
		}
	}
}

func TestBuildWaitlistJoinedEmailTextIncludesAppStoreURL(t *testing.T) {
	appStoreURL := "https://apps.apple.com/us/app/yummy-recs/id6761597807"
	text := buildWaitlistJoinedEmailText("user@example.com", appStoreURL)

	for _, expected := range []string{
		"You're on the Yummy Recs waitlist.",
		"We'll email you when your account is ready.",
		"Download Yummy Recs for iPhone",
		appStoreURL,
	} {
		if !strings.Contains(text, expected) {
			t.Fatalf("expected waitlist joined email text to contain %q, got %s", expected, text)
		}
	}
}
