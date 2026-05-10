package lib

import "testing"

func TestBuildAuthActionLinksUsesBetaResources(t *testing.T) {
	links, err := BuildAuthActionLinks(
		runtimeDefaultsForEnvironment(RuntimeEnvironmentBeta),
		AuthActionPasswordReset,
		"header.payload.signature",
	)
	if err != nil {
		t.Fatalf("expected beta password reset links to build, got %v", err)
	}

	if links.WebURL != "https://beta.app.yummyrecs.com/reset-password?token=header.payload.signature" {
		t.Fatalf("unexpected beta web URL: %s", links.WebURL)
	}
	if links.AppURL != "yummyrecs-preview://reset-password?token=header.payload.signature" {
		t.Fatalf("unexpected beta app URL: %s", links.AppURL)
	}
	if links.MarketingURL != "https://beta.yummyrecs.com" {
		t.Fatalf("unexpected beta marketing URL: %s", links.MarketingURL)
	}
}

func TestBuildAuthActionLinksUsesProductionResources(t *testing.T) {
	links, err := BuildAuthActionLinks(
		runtimeDefaultsForEnvironment(RuntimeEnvironmentProduction),
		AuthActionVerifyEmail,
		"header.payload.signature",
	)
	if err != nil {
		t.Fatalf("expected production verification links to build, got %v", err)
	}

	if links.WebURL != "https://app.yummyrecs.com/verify-email?token=header.payload.signature" {
		t.Fatalf("unexpected production web URL: %s", links.WebURL)
	}
	if links.AppURL != "yummyrecs://verify-email?token=header.payload.signature" {
		t.Fatalf("unexpected production app URL: %s", links.AppURL)
	}
	if links.MarketingURL != "https://yummyrecs.com" {
		t.Fatalf("unexpected production marketing URL: %s", links.MarketingURL)
	}
}

func TestBuildAuthActionLinksUsesActionSpecificPaths(t *testing.T) {
	resources := runtimeDefaultsForEnvironment(RuntimeEnvironmentProduction)

	resetLinks, err := BuildAuthActionLinks(resources, AuthActionPasswordReset, "header.payload.signature")
	if err != nil {
		t.Fatalf("expected password reset links to build, got %v", err)
	}

	verifyLinks, err := BuildAuthActionLinks(resources, AuthActionVerifyEmail, "header.payload.signature")
	if err != nil {
		t.Fatalf("expected verification links to build, got %v", err)
	}

	if resetLinks.WebURL != "https://app.yummyrecs.com/reset-password?token=header.payload.signature" {
		t.Fatalf("unexpected reset web URL: %s", resetLinks.WebURL)
	}
	if verifyLinks.WebURL != "https://app.yummyrecs.com/verify-email?token=header.payload.signature" {
		t.Fatalf("unexpected verify web URL: %s", verifyLinks.WebURL)
	}
}
