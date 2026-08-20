package lib

import (
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"myapp/testutil"
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

func TestRecordReceiptScanDispatchEnforcesRollingAccountWindow(t *testing.T) {
	app := testutil.NewTestApp(t)
	createReceiptScanAttemptsTestCollection(t, app)
	user := createUsageLimitTestUser(t, app)
	now := time.Date(2026, time.August, 19, 12, 0, 0, 0, time.UTC)

	for i := 0; i < receiptScanBurstMaxAttempts; i++ {
		if err := recordReceiptScanDispatchAt(app, user, now); err != nil {
			t.Fatalf("attempt %d should be allowed: %v", i+1, err)
		}
	}

	err := recordReceiptScanDispatchAt(app, user, now.Add(59*time.Second))
	limitErr, ok := AsReceiptScanRateLimitError(err)
	if !ok {
		t.Fatalf("expected sixth attempt to be rate limited, got %v", err)
	}
	if limitErr.Limit != receiptScanBurstMaxAttempts || limitErr.RetryAfterSeconds != 1 {
		t.Fatalf("unexpected rate limit payload: %#v", limitErr)
	}

	if err := recordReceiptScanDispatchAt(app, user, now.Add(receiptScanBurstWindow)); err != nil {
		t.Fatalf("expected attempt at the rolling-window boundary to be allowed: %v", err)
	}

	otherUser := createUsageLimitTestUser(t, app)
	if err := recordReceiptScanDispatchAt(app, otherUser, now); err != nil {
		t.Fatalf("expected another account to have an independent budget: %v", err)
	}
}

func TestRecordReceiptScanDispatchConcurrentAttemptsCannotExceedBudget(t *testing.T) {
	app := testutil.NewTestApp(t)
	createReceiptScanAttemptsTestCollection(t, app)
	user := createUsageLimitTestUser(t, app)
	now := time.Date(2026, time.August, 19, 12, 0, 0, 0, time.UTC)

	const attempts = 12
	results := make(chan error, attempts)
	var waitGroup sync.WaitGroup
	for i := 0; i < attempts; i++ {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			results <- recordReceiptScanDispatchAt(app, user, now)
		}()
	}
	waitGroup.Wait()
	close(results)

	allowed := 0
	limited := 0
	for err := range results {
		if err == nil {
			allowed++
			continue
		}
		if _, ok := AsReceiptScanRateLimitError(err); ok {
			limited++
			continue
		}
		t.Fatalf("unexpected concurrent rate-limit error: %v", err)
	}
	if allowed != receiptScanBurstMaxAttempts || limited != attempts-receiptScanBurstMaxAttempts {
		t.Fatalf("expected %d allowed and %d limited attempts, got %d and %d", receiptScanBurstMaxAttempts, attempts-receiptScanBurstMaxAttempts, allowed, limited)
	}
}

func createUsageLimitTestUser(t *testing.T, app core.App) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to find users collection: %v", err)
	}
	user := core.NewRecord(collection)
	user.Set("email", fmt.Sprintf("usage_%d@example.com", time.Now().UnixNano()))
	user.Set("name", "Usage Test User")
	user.Set("defaultRestaurantVisibility", "friends")
	user.Set("defaultVisitVisibility", "friends")
	user.SetPassword("password123")
	user.SetVerified(true)
	if err := app.Save(user); err != nil {
		t.Fatalf("failed to create user: %v", err)
	}
	return user
}

func createReceiptScanAttemptsTestCollection(t *testing.T, app core.App) {
	t.Helper()
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to find users collection: %v", err)
	}
	collection := core.NewBaseCollection("receipt_scan_attempts")
	collection.Fields.Add(&core.RelationField{
		Name:          "user",
		CollectionId:  users.Id,
		MaxSelect:     1,
		Required:      true,
		CascadeDelete: true,
	})
	collection.Fields.Add(&core.DateField{Name: "attempted_at", Required: true})
	if err := app.Save(collection); err != nil {
		t.Fatalf("failed to create Receipt Scan attempts collection: %v", err)
	}
}
