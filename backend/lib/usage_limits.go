package lib

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type UserTier string

const (
	UserTierAdmin      UserTier = "admin"
	UserTierSubscriber UserTier = "subscriber"
	UserTierFree       UserTier = "free"
)

type UsageMetric string

const (
	UsageMetricPhotoUploads    UsageMetric = "photo_uploads"
	UsageMetricPlacesQueries   UsageMetric = "places_queries"
	UsageMetricMenuScans       UsageMetric = "menu_scans"
	UsageMetricHEICConversions UsageMetric = "heic_conversions"
)

type UsageLimits struct {
	PhotoUploadsPerRecord  *int `json:"photoUploadsPerRecord"`
	PhotoUploadsMonthly    *int `json:"photoUploadsMonthly"`
	PlacesQueriesMonthly   *int `json:"placesQueriesMonthly"`
	MenuScansMonthly       *int `json:"menuScansMonthly"`
	HEICConversionsMonthly *int `json:"heicConversionsMonthly"`
}

type UsageCounters struct {
	PhotoUploads    int `json:"photoUploads"`
	PlacesQueries   int `json:"placesQueries"`
	MenuScans       int `json:"menuScans"`
	HEICConversions int `json:"heicConversions"`
}

type UsageRemaining struct {
	PhotoUploadsMonthly    *int `json:"photoUploadsMonthly"`
	PlacesQueriesMonthly   *int `json:"placesQueriesMonthly"`
	MenuScansMonthly       *int `json:"menuScansMonthly"`
	HEICConversionsMonthly *int `json:"heicConversionsMonthly"`
}

type MonthlyUsageSnapshot struct {
	MonthKey  string         `json:"monthKey"`
	UserTier  UserTier       `json:"userTier"`
	Limits    UsageLimits    `json:"limits"`
	Usage     UsageCounters  `json:"usage"`
	Remaining UsageRemaining `json:"remaining"`
}

type ConsumeResult struct {
	Metric    UsageMetric
	Used      int
	Limit     *int
	Remaining *int
	MonthKey  string
	UserTier  UserTier
}

type LimitExceededError struct {
	Metric    UsageMetric
	Limit     int
	Used      int
	Remaining int
	MonthKey  string
	UserTier  UserTier
	Message   string
}

func (e *LimitExceededError) Error() string {
	return e.Message
}

func (e *LimitExceededError) Payload() map[string]any {
	return map[string]any{
		"success":   false,
		"code":      "LIMIT_EXCEEDED",
		"message":   e.Message,
		"metric":    string(e.Metric),
		"limit":     e.Limit,
		"used":      e.Used,
		"remaining": e.Remaining,
		"monthKey":  e.MonthKey,
		"userTier":  e.UserTier,
	}
}

func AsLimitExceededError(err error) (*LimitExceededError, bool) {
	var limitErr *LimitExceededError
	if errors.As(err, &limitErr) {
		return limitErr, true
	}

	return nil, false
}

func ResolveUserTier(user *core.Record) UserTier {
	if user == nil {
		return UserTierFree
	}

	if user.GetBool("isAdmin") {
		return UserTierAdmin
	}

	if user.GetBool("isSubscriber") {
		return UserTierSubscriber
	}

	return UserTierFree
}

func ResolveEffectiveLimits(userTier UserTier) UsageLimits {
	switch userTier {
	case UserTierAdmin:
		return UsageLimits{
			PhotoUploadsPerRecord:  nil,
			PhotoUploadsMonthly:    nil,
			PlacesQueriesMonthly:   nil,
			MenuScansMonthly:       nil,
			HEICConversionsMonthly: nil,
		}
	case UserTierSubscriber:
		return UsageLimits{
			PhotoUploadsPerRecord:  intPointer(20),
			PhotoUploadsMonthly:    nil,
			PlacesQueriesMonthly:   nil,
			MenuScansMonthly:       intPointer(100),
			HEICConversionsMonthly: intPointer(1000),
		}
	default:
		return UsageLimits{
			PhotoUploadsPerRecord:  intPointer(1),
			PhotoUploadsMonthly:    intPointer(5),
			PlacesQueriesMonthly:   intPointer(100),
			MenuScansMonthly:       intPointer(5),
			HEICConversionsMonthly: intPointer(100),
		}
	}
}

func ParseUsageTier(value string) (UserTier, bool) {
	switch UserTier(strings.TrimSpace(value)) {
	case UserTierAdmin:
		return UserTierAdmin, true
	case UserTierSubscriber:
		return UserTierSubscriber, true
	case UserTierFree:
		return UserTierFree, true
	default:
		return "", false
	}
}

func UTCMonthKey(t time.Time) string {
	return t.UTC().Format("2006-01")
}

func CurrentUTCMonthKey() string {
	return UTCMonthKey(time.Now())
}

func GetMonthlyUsageSnapshot(app core.App, user *core.Record) (*MonthlyUsageSnapshot, error) {
	return GetMonthlyUsageSnapshotForTier(app, user, nil)
}

func GetMonthlyUsageSnapshotForTier(
	app core.App,
	user *core.Record,
	displayTierOverride *UserTier,
) (*MonthlyUsageSnapshot, error) {
	if user == nil || user.Id == "" {
		return nil, errors.New("missing authenticated user")
	}

	monthKey := CurrentUTCMonthKey()
	userTier := ResolveUserTier(user)
	displayTier := userTier
	if displayTierOverride != nil {
		displayTier = *displayTierOverride
	}
	limits := ResolveEffectiveLimits(displayTier)
	usage := UsageCounters{}

	usageRecord, err := findUsageRecord(app, user.Id, monthKey)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("failed to load monthly usage: %w", err)
	}

	if usageRecord != nil {
		usage = usageFromRecord(usageRecord)
	}

	snapshot := &MonthlyUsageSnapshot{
		MonthKey: monthKey,
		UserTier: displayTier,
		Limits:   limits,
		Usage:    usage,
		Remaining: UsageRemaining{
			PhotoUploadsMonthly:    remainingFromLimit(limits.PhotoUploadsMonthly, usage.PhotoUploads),
			PlacesQueriesMonthly:   remainingFromLimit(limits.PlacesQueriesMonthly, usage.PlacesQueries),
			MenuScansMonthly:       remainingFromLimit(limits.MenuScansMonthly, usage.MenuScans),
			HEICConversionsMonthly: remainingFromLimit(limits.HEICConversionsMonthly, usage.HEICConversions),
		},
	}

	return snapshot, nil
}

func ConsumeUsage(app core.App, user *core.Record, metric UsageMetric, amount int) (*ConsumeResult, error) {
	return adjustUsage(app, user, metric, amount, false)
}

func ReserveUsage(app core.App, user *core.Record, metric UsageMetric, amount int) (*ConsumeResult, error) {
	return adjustUsage(app, user, metric, amount, true)
}

func ReleaseUsage(app core.App, user *core.Record, metric UsageMetric, amount int) error {
	if user == nil || user.Id == "" || amount <= 0 {
		return nil
	}

	fieldName, err := metricFieldName(metric)
	if err != nil {
		return err
	}

	monthKey := CurrentUTCMonthKey()
	userTier := ResolveUserTier(user)

	return app.RunInTransaction(func(txApp core.App) error {
		usageRecord, err := findUsageRecord(txApp, user.Id, monthKey)
		if errors.Is(err, sql.ErrNoRows) || usageRecord == nil {
			return nil
		}
		if err != nil {
			return err
		}

		nextUsed := usageRecord.GetInt(fieldName) - amount
		if nextUsed < 0 {
			nextUsed = 0
		}

		usageRecord.Set(fieldName, nextUsed)
		if err := txApp.Save(usageRecord); err != nil {
			return err
		}

		log.Printf(
			"usage release metric=%s userId=%s tier=%s monthKey=%s used=%d amount=%d",
			metric,
			user.Id,
			userTier,
			monthKey,
			nextUsed,
			amount,
		)

		return nil
	})
}

func adjustUsage(
	app core.App,
	user *core.Record,
	metric UsageMetric,
	amount int,
	isReservation bool,
) (*ConsumeResult, error) {
	if user == nil || user.Id == "" {
		return nil, errors.New("missing authenticated user")
	}

	if amount <= 0 {
		return nil, errors.New("amount must be greater than zero")
	}

	fieldName, err := metricFieldName(metric)
	if err != nil {
		return nil, err
	}

	monthKey := CurrentUTCMonthKey()
	userTier := ResolveUserTier(user)
	limits := ResolveEffectiveLimits(userTier)
	metricLimit := monthlyLimitForMetric(limits, metric)

	result := &ConsumeResult{
		Metric:   metric,
		MonthKey: monthKey,
		UserTier: userTier,
		Limit:    copyIntPointer(metricLimit),
	}

	err = app.RunInTransaction(func(txApp core.App) error {
		usageRecord, err := getOrCreateUsageRecord(txApp, user.Id, monthKey)
		if err != nil {
			return err
		}

		currentUsed := usageRecord.GetInt(fieldName)
		nextUsed := currentUsed + amount

		if metricLimit != nil && nextUsed > *metricLimit {
			remaining := *metricLimit - currentUsed
			if remaining < 0 {
				remaining = 0
			}

			action := "consume"
			if isReservation {
				action = "reserve"
			}
			log.Printf(
				"usage blocked action=%s metric=%s userId=%s tier=%s monthKey=%s used=%d limit=%d requested=%d",
				action,
				metric,
				user.Id,
				userTier,
				monthKey,
				currentUsed,
				*metricLimit,
				amount,
			)

			return &LimitExceededError{
				Metric:    metric,
				Limit:     *metricLimit,
				Used:      currentUsed,
				Remaining: remaining,
				MonthKey:  monthKey,
				UserTier:  userTier,
				Message:   buildLimitExceededMessage(metric),
			}
		}

		usageRecord.Set(fieldName, nextUsed)
		if err := txApp.Save(usageRecord); err != nil {
			return err
		}

		result.Used = nextUsed
		result.Remaining = remainingFromLimit(metricLimit, nextUsed)

		action := "consume"
		if isReservation {
			action = "reserve"
		}
		log.Printf(
			"usage %s metric=%s userId=%s tier=%s monthKey=%s used=%d limit=%s amount=%d",
			action,
			metric,
			user.Id,
			userTier,
			monthKey,
			nextUsed,
			formatLimit(metricLimit),
			amount,
		)

		return nil
	})
	if err != nil {
		return nil, err
	}

	return result, nil
}

func buildLimitExceededMessage(metric UsageMetric) string {
	switch metric {
	case UsageMetricMenuScans:
		return "Monthly menu scan limit reached."
	case UsageMetricPlacesQueries:
		return "Monthly food place search limit reached."
	case UsageMetricPhotoUploads:
		return "Monthly photo upload limit reached."
	case UsageMetricHEICConversions:
		return "Monthly HEIC conversion limit reached."
	default:
		return "Usage limit exceeded."
	}
}

func metricFieldName(metric UsageMetric) (string, error) {
	switch metric {
	case UsageMetricPhotoUploads:
		return "photo_uploads", nil
	case UsageMetricPlacesQueries:
		return "places_queries", nil
	case UsageMetricMenuScans:
		return "menu_scans", nil
	case UsageMetricHEICConversions:
		return "heic_conversions", nil
	default:
		return "", fmt.Errorf("unsupported usage metric %q", metric)
	}
}

func monthlyLimitForMetric(limits UsageLimits, metric UsageMetric) *int {
	switch metric {
	case UsageMetricPhotoUploads:
		return limits.PhotoUploadsMonthly
	case UsageMetricPlacesQueries:
		return limits.PlacesQueriesMonthly
	case UsageMetricMenuScans:
		return limits.MenuScansMonthly
	case UsageMetricHEICConversions:
		return limits.HEICConversionsMonthly
	default:
		return nil
	}
}

func usageFromRecord(record *core.Record) UsageCounters {
	if record == nil {
		return UsageCounters{}
	}

	return UsageCounters{
		PhotoUploads:    record.GetInt("photo_uploads"),
		PlacesQueries:   record.GetInt("places_queries"),
		MenuScans:       record.GetInt("menu_scans"),
		HEICConversions: record.GetInt("heic_conversions"),
	}
}

func findUsageRecord(app core.App, userID string, monthKey string) (*core.Record, error) {
	return app.FindFirstRecordByFilter(
		"user_monthly_usage",
		"user = {:user} && month_key = {:monthKey}",
		dbx.Params{
			"user":     userID,
			"monthKey": monthKey,
		},
	)
}

func getOrCreateUsageRecord(app core.App, userID string, monthKey string) (*core.Record, error) {
	record, err := findUsageRecord(app, userID, monthKey)
	if err == nil && record != nil {
		return record, nil
	}

	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	collection, err := app.FindCollectionByNameOrId("user_monthly_usage")
	if err != nil {
		return nil, err
	}

	record = core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("month_key", monthKey)
	record.Set("photo_uploads", 0)
	record.Set("places_queries", 0)
	record.Set("menu_scans", 0)
	record.Set("heic_conversions", 0)

	if err := app.Save(record); err != nil {
		if isUniqueConstraintError(err) {
			return findUsageRecord(app, userID, monthKey)
		}
		return nil, err
	}

	return record, nil
}

func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}

	value := strings.ToLower(err.Error())
	return strings.Contains(value, "unique constraint")
}

func remainingFromLimit(limit *int, used int) *int {
	if limit == nil {
		return nil
	}

	remaining := *limit - used
	if remaining < 0 {
		remaining = 0
	}

	return intPointer(remaining)
}

func intPointer(value int) *int {
	return &value
}

func copyIntPointer(value *int) *int {
	if value == nil {
		return nil
	}

	return intPointer(*value)
}

func formatLimit(value *int) string {
	if value == nil {
		return "unlimited"
	}

	return fmt.Sprintf("%d", *value)
}
