package main

import "testing"

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
