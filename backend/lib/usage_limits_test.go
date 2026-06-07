package lib

import (
	"errors"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

func TestResolveUserTier(t *testing.T) {
	usersCollection := core.NewBaseCollection("users")

	admin := core.NewRecord(usersCollection)
	admin.Set("isAdmin", true)
	admin.Set("isSubscriber", true)
	if got := ResolveUserTier(admin); got != UserTierAdmin {
		t.Fatalf("expected admin tier, got %q", got)
	}

	subscriber := core.NewRecord(usersCollection)
	subscriber.Set("isSubscriber", true)
	if got := ResolveUserTier(subscriber); got != UserTierSubscriber {
		t.Fatalf("expected subscriber tier, got %q", got)
	}

	freeUser := core.NewRecord(usersCollection)
	if got := ResolveUserTier(freeUser); got != UserTierFree {
		t.Fatalf("expected free tier, got %q", got)
	}
}

func TestResolveEffectiveLimits(t *testing.T) {
	adminLimits := ResolveEffectiveLimits(UserTierAdmin)
	if adminLimits.PhotoUploadsPerRecord != nil || adminLimits.PhotoUploadsMonthly != nil || adminLimits.PlacesQueriesMonthly != nil || adminLimits.MenuScansMonthly != nil || adminLimits.StorefrontReadsMonthly != nil {
		t.Fatalf("expected all admin limits to be unlimited")
	}

	subscriberLimits := ResolveEffectiveLimits(UserTierSubscriber)
	if subscriberLimits.PhotoUploadsPerRecord == nil || *subscriberLimits.PhotoUploadsPerRecord != 20 {
		t.Fatalf("expected subscriber per-record limit 20")
	}
	if subscriberLimits.MenuScansMonthly == nil || *subscriberLimits.MenuScansMonthly != 100 {
		t.Fatalf("expected subscriber menu scan limit 100")
	}
	if subscriberLimits.StorefrontReadsMonthly == nil || *subscriberLimits.StorefrontReadsMonthly != 100 {
		t.Fatalf("expected subscriber storefront read limit 100")
	}
	if subscriberLimits.PhotoUploadsMonthly != nil || subscriberLimits.PlacesQueriesMonthly != nil {
		t.Fatalf("expected subscriber monthly photo/places to be unlimited")
	}

	freeLimits := ResolveEffectiveLimits(UserTierFree)
	if freeLimits.PhotoUploadsPerRecord == nil || *freeLimits.PhotoUploadsPerRecord != 1 {
		t.Fatalf("expected free per-record photo limit 1")
	}
	if freeLimits.PhotoUploadsMonthly == nil || *freeLimits.PhotoUploadsMonthly != 100 {
		t.Fatalf("expected free monthly photo limit 100")
	}
	if freeLimits.PlacesQueriesMonthly == nil || *freeLimits.PlacesQueriesMonthly != 100 {
		t.Fatalf("expected free monthly places limit 100")
	}
	if freeLimits.MenuScansMonthly == nil || *freeLimits.MenuScansMonthly != 25 {
		t.Fatalf("expected free monthly menu scan limit 25")
	}
	if freeLimits.StorefrontReadsMonthly == nil || *freeLimits.StorefrontReadsMonthly != 25 {
		t.Fatalf("expected free monthly storefront read limit 25")
	}
}

func TestUTCMonthKey(t *testing.T) {
	location := time.FixedZone("UTC+02", 2*60*60)
	input := time.Date(2026, time.March, 1, 0, 30, 0, 0, location)

	// 2026-03-01 00:30 UTC+02 == 2026-02-28 22:30 UTC
	if got := UTCMonthKey(input); got != "2026-02" {
		t.Fatalf("expected UTC month key 2026-02, got %q", got)
	}
}

func TestParseUsageTier(t *testing.T) {
	if tier, ok := ParseUsageTier("admin"); !ok || tier != UserTierAdmin {
		t.Fatalf("expected admin tier parse to succeed")
	}
	if tier, ok := ParseUsageTier("subscriber"); !ok || tier != UserTierSubscriber {
		t.Fatalf("expected subscriber tier parse to succeed")
	}
	if tier, ok := ParseUsageTier("free"); !ok || tier != UserTierFree {
		t.Fatalf("expected free tier parse to succeed")
	}
	if _, ok := ParseUsageTier("invalid"); ok {
		t.Fatalf("expected invalid tier parse to fail")
	}
}

func TestAsLimitExceededError(t *testing.T) {
	target := &LimitExceededError{
		Metric:    UsageMetricMenuScans,
		Limit:     5,
		Used:      5,
		Remaining: 0,
		MonthKey:  "2026-02",
		UserTier:  UserTierFree,
		Message:   "Monthly menu scan limit reached.",
	}

	wrapped := errors.Join(target)
	parsed, ok := AsLimitExceededError(wrapped)
	if !ok {
		t.Fatalf("expected AsLimitExceededError to match wrapped error")
	}
	if parsed.Metric != UsageMetricMenuScans {
		t.Fatalf("expected metric menu_scans, got %q", parsed.Metric)
	}
}
