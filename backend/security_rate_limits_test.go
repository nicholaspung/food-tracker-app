package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

func TestConfigureSecurityRateLimitRulesAddsExpectedRules(t *testing.T) {
	app := newSignupSecurityTestApp(t)

	configureSecurityRateLimitRules(app)

	if !app.Settings().RateLimits.Enabled {
		t.Fatalf("expected route rate limits to be enabled")
	}

	expected := map[string]struct {
		audience    string
		duration    int64
		maxRequests int
	}{
		loginRouteLabel:          {audience: guestAudience},
		signupRouteLabel:         {audience: guestAudience},
		publicInviteLookupLabel:  {audience: guestAudience},
		friendCodeLookupLabel:    {audience: authAudience},
		postHogStaticRouteLabel:  {audience: allAudience},
		postHogRoutePrefixLabel:  {audience: allAudience},
		convertHeicRouteLabel:    {audience: authAudience},
		findRestaurantRouteLabel: {audience: authAudience},
		parseMenuRouteLabel:      {audience: authAudience},
		parseReceiptRouteLabel:   {audience: authAudience, duration: 60, maxRequests: 5},
		accountDeleteRouteLabel:  {audience: authAudience, duration: 15 * 60, maxRequests: 10},
		menuReviewRouteLabel:     {audience: authAudience},
		menuItemsFromScanLabel:   {audience: authAudience},
		placesRoutesPrefixLabel:  {audience: authAudience},
		tastingSessionJoinLabel:  {audience: authAudience},
	}

	for label, expectedRule := range expected {
		found := false
		for _, rule := range app.Settings().RateLimits.Rules {
			if rule.Label == label && rule.Audience == expectedRule.audience {
				if expectedRule.duration != 0 && rule.Duration != expectedRule.duration {
					t.Fatalf("expected rate limit rule %s duration=%d, got %d", label, expectedRule.duration, rule.Duration)
				}
				if expectedRule.maxRequests != 0 && rule.MaxRequests != expectedRule.maxRequests {
					t.Fatalf("expected rate limit rule %s maxRequests=%d, got %d", label, expectedRule.maxRequests, rule.MaxRequests)
				}
				found = true
				break
			}
		}

		if !found {
			t.Fatalf("expected to find rate limit rule %s (%s)", label, expectedRule.audience)
		}
	}
}

func TestHostedRouteRateLimitsUseForwardedClientIdentity(t *testing.T) {
	t.Setenv(trustProxyHeadersEnvKey, "true")

	app := newSignupSecurityTestApp(t)
	configureTrustedProxyHeaders(app)
	if err := validateHostedTrustedProxyConfiguration(app, lib.RuntimeEnvironmentProduction); err != nil {
		t.Fatalf("expected hosted trusted proxy configuration to pass, got %v", err)
	}
	configureSecurityRateLimitRules(app)

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("failed to create route-isolation router: %v", err)
	}
	router.GET("/api/invite-codes/inviter/", func(e *core.RequestEvent) error {
		return e.String(http.StatusOK, "ok")
	})

	mux, err := router.BuildMux()
	if err != nil {
		t.Fatalf("failed to build route-isolation mux: %v", err)
	}

	request := func(clientIP string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/api/invite-codes/inviter/", nil)
		req.Header.Set("X-Forwarded-For", clientIP)
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, req)
		return recorder
	}

	for attempt := 1; attempt <= 12; attempt++ {
		if response := request("198.51.100.10"); response.Code != http.StatusOK {
			t.Fatalf("expected client A attempt %d to pass, got %d: %s", attempt, response.Code, response.Body.String())
		}
	}
	if response := request("198.51.100.10"); response.Code != http.StatusTooManyRequests {
		t.Fatalf("expected client A to exhaust its route budget, got %d: %s", response.Code, response.Body.String())
	}
	if response := request("198.51.100.11"); response.Code != http.StatusOK {
		t.Fatalf("expected client B to retain an isolated route budget, got %d: %s", response.Code, response.Body.String())
	}
}

func TestValidateHostedTrustedProxyConfigurationRejectsUnsafeEffectiveSettings(t *testing.T) {
	app := newSignupSecurityTestApp(t)

	t.Setenv(trustProxyHeadersEnvKey, "false")
	if err := validateHostedTrustedProxyConfiguration(app, lib.RuntimeEnvironmentBeta); err == nil {
		t.Fatal("expected Beta to reject a disabled trusted proxy setting")
	}

	t.Setenv(trustProxyHeadersEnvKey, "true")
	app.Settings().TrustedProxy.Headers = []string{"X-Forwarded-For"}
	if err := validateHostedTrustedProxyConfiguration(app, lib.RuntimeEnvironmentProduction); err == nil {
		t.Fatal("expected Production to reject an incomplete effective trusted proxy configuration")
	}

	t.Setenv(trustProxyHeadersEnvKey, "false")
	if err := validateHostedTrustedProxyConfiguration(app, lib.RuntimeEnvironmentLocal); err != nil {
		t.Fatalf("expected local direct-peer development to remain supported, got %v", err)
	}
}

func TestHostedTrustedProxyConfigurationIsRestoredAfterSettingsReload(t *testing.T) {
	t.Setenv(trustProxyHeadersEnvKey, "true")

	app := newSignupSecurityTestApp(t)
	if err := registerHostedTrustedProxyEnforcement(app, lib.RuntimeEnvironmentProduction); err != nil {
		t.Fatalf("failed to register hosted trusted proxy enforcement: %v", err)
	}

	unsafeSettings, err := app.Settings().Clone()
	if err != nil {
		t.Fatalf("failed to clone app settings: %v", err)
	}
	unsafeSettings.TrustedProxy.Headers = nil
	unsafeSettings.TrustedProxy.UseLeftmostIP = true
	if err := app.Save(unsafeSettings); err != nil {
		t.Fatalf("failed to exercise settings reload: %v", err)
	}

	if err := validateHostedTrustedProxyConfiguration(app, lib.RuntimeEnvironmentProduction); err != nil {
		t.Fatalf("expected hosted trusted proxy settings to be restored after reload, got %v", err)
	}
}

func TestHostedSettingsUpdatePersistsCanonicalTrustedProxyConfiguration(t *testing.T) {
	t.Setenv(trustProxyHeadersEnvKey, "true")

	app := newSignupSecurityTestApp(t)
	if err := registerHostedTrustedProxyEnforcement(app, lib.RuntimeEnvironmentProduction); err != nil {
		t.Fatalf("failed to register hosted trusted proxy enforcement: %v", err)
	}

	superusers, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		t.Fatalf("failed to find superusers collection: %v", err)
	}
	superuser := core.NewRecord(superusers)
	superuser.Set("email", "proxy-settings@example.com")
	superuser.SetPassword("password123")
	if err := app.Save(superuser); err != nil {
		t.Fatalf("failed to create settings test superuser: %v", err)
	}
	token, err := superuser.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create settings test auth token: %v", err)
	}

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("failed to create settings router: %v", err)
	}
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatalf("failed to build settings mux: %v", err)
	}
	req := httptest.NewRequest(
		http.MethodPatch,
		"/api/settings",
		strings.NewReader(`{"trustedProxy":{"headers":[],"useLeftmostIP":true}}`),
	)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", token)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected settings update to succeed with the hosted invariant restored, got %d: %s", recorder.Code, recorder.Body.String())
	}

	app.OnSettingsReload().Unbind(hostedTrustedProxyReloadHookID)
	app.Settings().TrustedProxy.Headers = nil
	app.Settings().TrustedProxy.UseLeftmostIP = true
	if err := app.ReloadSettings(); err != nil {
		t.Fatalf("failed to reload persisted settings: %v", err)
	}
	if err := validateHostedTrustedProxyConfiguration(app, lib.RuntimeEnvironmentProduction); err != nil {
		t.Fatalf("expected settings update to persist the canonical hosted proxy boundary, got %v", err)
	}
}

func TestHostedDeploymentPreservesProxyAndLoopbackInvariants(t *testing.T) {
	deployScript, err := os.ReadFile("../scripts/deploy.sh")
	if err != nil {
		t.Fatalf("failed to read deploy script: %v", err)
	}
	if count := strings.Count(string(deployScript), "TRUST_PROXY_HEADERS=true"); count != 1 {
		t.Fatalf("expected one shared hosted TRUST_PROXY_HEADERS setting, got %d", count)
	}

	caddyfile, err := os.ReadFile("../Caddyfile")
	if err != nil {
		t.Fatalf("failed to read Caddyfile: %v", err)
	}
	caddyConfig := string(caddyfile)
	for _, environment := range []string{"prod", "beta"} {
		startMarker := "(" + environment + "_proxy_headers) {"
		start := strings.Index(caddyConfig, startMarker)
		if start < 0 {
			t.Fatalf("missing %s Caddy proxy header block", environment)
		}
		blockRemainder := caddyConfig[start:]
		end := strings.Index(blockRemainder, "\n}")
		if end < 0 {
			t.Fatalf("unterminated %s Caddy proxy header block", environment)
		}
		block := blockRemainder[:end]
		for _, replacement := range []string{
			"header_up X-Real-IP {remote_host}",
			"header_up X-Forwarded-For {remote_host}",
		} {
			if !strings.Contains(block, replacement) {
				t.Fatalf("%s Caddy proxy block must replace client identity with %q", environment, replacement)
			}
		}
		if strings.Contains(block, "header_up +X-") {
			t.Fatalf("%s Caddy proxy block must replace, not append, client identity headers", environment)
		}
	}

	for _, compose := range []struct {
		path string
		bind string
	}{
		{path: "../docker-compose.yml", bind: `"127.0.0.1:8090:8090"`},
		{path: "../docker-compose.beta.yml", bind: `"127.0.0.1:8091:8091"`},
	} {
		contents, err := os.ReadFile(compose.path)
		if err != nil {
			t.Fatalf("failed to read %s: %v", compose.path, err)
		}
		if !strings.Contains(string(contents), compose.bind) {
			t.Fatalf("%s must preserve loopback-only backend bind %s", compose.path, compose.bind)
		}
	}
}
