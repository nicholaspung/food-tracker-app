package main

import "testing"

func TestConfigureSecurityRateLimitRulesAddsExpectedRules(t *testing.T) {
	app := newSignupSecurityTestApp(t)

	configureSecurityRateLimitRules(app)

	if !app.Settings().RateLimits.Enabled {
		t.Fatalf("expected route rate limits to be enabled")
	}

	expected := map[string]string{
		loginRouteLabel:          guestAudience,
		signupRouteLabel:         guestAudience,
		publicInviteLookupLabel:  guestAudience,
		friendCodeLookupLabel:    authAudience,
		postHogStaticRouteLabel:  allAudience,
		postHogRoutePrefixLabel:  allAudience,
		convertHeicRouteLabel:    authAudience,
		findRestaurantRouteLabel: authAudience,
		parseMenuRouteLabel:      authAudience,
		placesRoutesPrefixLabel:  authAudience,
		tastingSessionJoinLabel:  authAudience,
	}

	for label, audience := range expected {
		found := false
		for _, rule := range app.Settings().RateLimits.Rules {
			if rule.Label == label && rule.Audience == audience {
				found = true
				break
			}
		}

		if !found {
			t.Fatalf("expected to find rate limit rule %s (%s)", label, audience)
		}
	}
}
