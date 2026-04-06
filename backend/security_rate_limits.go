package main

import "github.com/pocketbase/pocketbase/core"

const (
	loginRouteLabel          = "POST /api/collections/users/auth-with-password"
	signupRouteLabel         = "POST /api/collections/users/records"
	publicInviteLookupLabel  = "GET /api/invite-codes/inviter/"
	friendCodeLookupLabel    = "GET /api/users/by-friend-code/"
	convertHeicRouteLabel    = "POST /api/convert-heic"
	findRestaurantRouteLabel = "POST /api/find-restaurant-name"
	parseMenuRouteLabel      = "POST /api/parse-menu"
	placesRoutesPrefixLabel  = "POST /api/places/"
	postHogStaticRouteLabel  = "GET /api/visit-insights/static/"
	postHogRoutePrefixLabel  = "/api/visit-insights/"
	tastingSessionJoinLabel  = "POST /api/tasting-sessions/join"
	allAudience              = core.RateLimitRuleAudienceAll
	guestAudience            = core.RateLimitRuleAudienceGuest
	authAudience             = core.RateLimitRuleAudienceAuth
)

func configureSecurityRateLimitRules(app core.App) {
	settings := app.Settings()
	settings.RateLimits.Enabled = true

	requiredRules := []core.RateLimitRule{
		{Label: loginRouteLabel, Audience: guestAudience, Duration: 15 * 60, MaxRequests: 10},
		{Label: signupRouteLabel, Audience: guestAudience, Duration: 15 * 60, MaxRequests: 10},
		{Label: publicInviteLookupLabel, Audience: guestAudience, Duration: 60, MaxRequests: 12},
		{Label: friendCodeLookupLabel, Audience: authAudience, Duration: 60, MaxRequests: 20},
		{Label: postHogStaticRouteLabel, Audience: allAudience, Duration: 60, MaxRequests: 120},
		{Label: postHogRoutePrefixLabel, Audience: allAudience, Duration: 60, MaxRequests: 60},
		{Label: convertHeicRouteLabel, Audience: authAudience, Duration: 10 * 60, MaxRequests: 20},
		{Label: findRestaurantRouteLabel, Audience: authAudience, Duration: 10 * 60, MaxRequests: 10},
		{Label: parseMenuRouteLabel, Audience: authAudience, Duration: 10 * 60, MaxRequests: 10},
		{Label: placesRoutesPrefixLabel, Audience: authAudience, Duration: 60, MaxRequests: 30},
		{Label: tastingSessionJoinLabel, Audience: authAudience, Duration: 10 * 60, MaxRequests: 12},
	}

	for _, rule := range requiredRules {
		if hasRateLimitRule(settings.RateLimits.Rules, rule) {
			continue
		}

		settings.RateLimits.Rules = append(settings.RateLimits.Rules, rule)
	}
}

func hasRateLimitRule(existing []core.RateLimitRule, candidate core.RateLimitRule) bool {
	for _, rule := range existing {
		if rule.Label == candidate.Label && rule.Audience == candidate.Audience {
			return true
		}
	}

	return false
}
