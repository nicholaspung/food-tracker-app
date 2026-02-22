# Mobile PostHog Retention Dashboard

This document defines the high-value PostHog dashboard setup for mobile growth, retention, and adoption.

Source of truth (machine-readable):
- `apps/mobile/src/observability/retentionDashboardSchema.ts`

## 1. Scope

Use this dashboard to answer:
- Is acquisition trending up?
- Are new users activating (first meaningful action)?
- Are users coming back weekly/monthly?
- Which features are adopted most?
- Which friction points are blocking retention?

## 2. Global Filters

Apply these filters to every chart unless the chart explicitly needs broader data:
- `platform in [ios, android]`

Optional segment filters for drill-down:
- `userTier`
- `actualUserTier`
- `isOnline`
- `appEnvironment`

## 3. PostHog Actions To Create

Create these reusable Actions in PostHog first.

### A_CORE_CONTENT_CREATED

Any core user-authored content event:
- `Visit Creation Completed`
- `Photo Processing Completed`
- `FEATURE_MUTATION_SUCCEEDED` where `action = quick_track.create`
- `FEATURE_MUTATION_SUCCEEDED` where `action = note.create`
- `FEATURE_MUTATION_SUCCEEDED` where `action = restaurant_list.create`
- `FEATURE_MUTATION_SUCCEEDED` where `action = bill.create`

### A_ACTIVE_USAGE

Engaged app usage signal:
- `SCREEN_VIEW`
- `TAB_PRESSED`
- `Visit Creation Completed`
- `Photo Processing Completed`
- `FEATURE_MUTATION_SUCCEEDED` where `action in [quick_track.create, note.create, restaurant_list.create, bill.create, friend.invite]`

### A_RETENTION_FRICTION

Retention-risk events:
- `USAGE_LIMIT_REACHED`
- `ERROR_TOAST_SHOWN`
- `AUTH_SESSION_RESTORE_FAILED`

## 4. Dashboard Sections

Use the cards defined in `MOBILE_RETENTION_DASHBOARD_SCHEMA`.

### Acquisition Overview

- `daily-signups`: trend of `AUTH_SIGNUP_SUBMIT_SUCCEEDED` (unique users, daily)
- `daily-logins`: trend of `LOGIN_SUCCESS` (unique users, daily)
- `session-starts`: trend of `SESSION_STARTED` (unique users, daily), breakdown by `userTier`

### Activation Funnel

- `signup-to-first-content` (7-day conversion funnel)
1. `AUTH_SIGNUP_SUBMIT_SUCCEEDED`
2. `SCREEN_VIEW` where `screenName = AddVisit`
3. `A_CORE_CONTENT_CREATED`

### Retention Health

- `weekly-retention-active-usage`: retention chart using `A_ACTIVE_USAGE` as both start + return event
- `wau`: weekly active users from `SCREEN_VIEW`
- `mau`: monthly active users from `SCREEN_VIEW`
- `stickiness`: formula = `WAU / MAU`

### Feature Adoption

- `core-creation-mix`: weekly total event trends for visit/quick-track/photo/note/list/bill creation
- `screen-adoption`: weekly unique users of `SCREEN_VIEW`, breakdown by `screenName`

### Friction and Risk

- `usage-limit-pressure`: weekly unique users with `USAGE_LIMIT_REACHED`, breakdown by `metric`
- `error-toast-reach`: weekly unique users with `ERROR_TOAST_SHOWN`, breakdown by `toastSource`
- `auth-restore-failures`: weekly total `AUTH_SESSION_RESTORE_FAILED`
- `offline-enqueue-pressure`: weekly total `MUTATION_ENQUEUED`, breakdown by queued mutation type/action

## 5. KPI Targets (Starting Point)

Use these as starter thresholds; tune after 2-4 weeks of data.
- Signup to first content conversion (7d): > 35%
- Week-1 retention (`A_ACTIVE_USAGE`): > 30%
- WAU/MAU stickiness: > 0.30
- Usage-limit reached users / WAU: < 10%
- Error-toast users / WAU: < 15%

## 6. Operational Notes

- Use `A_CORE_CONTENT_CREATED` and `A_ACTIVE_USAGE` Actions in funnels/retention to avoid brittle OR logic in chart setup.
- Prefer unique users for adoption/retention views and total events for operational load/friction volume.
- Keep dashboard date ranges consistent when comparing cards (for example, last 12 weeks).
- When conversion drops, inspect `USAGE_LIMIT_REACHED` and `ERROR_TOAST_SHOWN` by `userTier` and `source` first.

## 7. PostHog UI Click Path (Step-by-Step)

Use these steps in PostHog Cloud (as of February 22, 2026). Labels can vary slightly by workspace version.

### 7.1 Create the Dashboard

1. Open PostHog.
2. Go to `Dashboards`.
3. Click `New dashboard`.
4. Name it `Mobile Growth & Retention`.
5. Save.

### 7.2 Create Actions (Required First)

Open: `Data management` -> `Actions` -> `New action`.

#### Action: `A_CORE_CONTENT_CREATED`

1. Set name to `A_CORE_CONTENT_CREATED`.
2. Add matchers:
   - Event `Visit Creation Completed`
   - Event `Photo Processing Completed`
   - Event `FEATURE_MUTATION_SUCCEEDED` with property filter `action = quick_track.create`
   - Event `FEATURE_MUTATION_SUCCEEDED` with property filter `action = note.create`
   - Event `FEATURE_MUTATION_SUCCEEDED` with property filter `action = restaurant_list.create`
   - Event `FEATURE_MUTATION_SUCCEEDED` with property filter `action = bill.create`
3. Save action.

#### Action: `A_ACTIVE_USAGE`

1. Set name to `A_ACTIVE_USAGE`.
2. Add matchers:
   - Event `SCREEN_VIEW`
   - Event `TAB_PRESSED`
   - Event `Visit Creation Completed`
   - Event `Photo Processing Completed`
   - Event `FEATURE_MUTATION_SUCCEEDED` with property filter `action in [quick_track.create, note.create, restaurant_list.create, bill.create, friend.invite]`
3. Save action.

#### Action: `A_RETENTION_FRICTION`

1. Set name to `A_RETENTION_FRICTION`.
2. Add matchers:
   - Event `USAGE_LIMIT_REACHED`
   - Event `ERROR_TOAST_SHOWN`
   - Event `AUTH_SESSION_RESTORE_FAILED`
3. Save action.

### 7.3 Global Filter Pattern (Apply to Every Insight)

1. In each insight, open filters.
2. Add event property filter: `platform in [ios, android]`.
3. Save insight.

### 7.4 Build Section 1: Acquisition Overview

Open: `Product analytics` -> `Insights` -> `New insight` -> `Trends`.

#### Card: `daily-signups`

1. Event: `AUTH_SIGNUP_SUBMIT_SUCCEEDED`.
2. Measurement: `Unique users`.
3. Interval: `Daily`.
4. Apply global filter pattern.
5. Save to dashboard as `Daily Signups`.

#### Card: `daily-logins`

1. Event: `LOGIN_SUCCESS`.
2. Measurement: `Unique users`.
3. Interval: `Daily`.
4. Apply global filter pattern.
5. Save to dashboard as `Daily Successful Logins`.

#### Card: `session-starts`

1. Event: `SESSION_STARTED`.
2. Measurement: `Unique users`.
3. Interval: `Daily`.
4. Breakdown: `userTier`.
5. Apply global filter pattern.
6. Save to dashboard as `Daily Session Starts`.

### 7.5 Build Section 2: Activation Funnel

Open: `Product analytics` -> `Insights` -> `New insight` -> `Funnels`.

#### Card: `signup-to-first-content`

1. Step 1 event: `AUTH_SIGNUP_SUBMIT_SUCCEEDED`.
2. Step 2 event: `SCREEN_VIEW` with property filter `screenName = AddVisit`.
3. Step 3 action: `A_CORE_CONTENT_CREATED`.
4. Conversion window: `7 days`.
5. Measurement: `Unique users`.
6. Interval: `Weekly`.
7. Apply global filter pattern.
8. Save to dashboard as `Signup to First Content (7d Conversion)`.

### 7.6 Build Section 3: Retention Health

#### Card: `weekly-retention-active-usage`

1. Open `Product analytics` -> `Insights` -> `New insight` -> `Retention`.
2. Start event/action: `A_ACTIVE_USAGE`.
3. Returning event/action: `A_ACTIVE_USAGE`.
4. Period: `Week`.
5. Apply global filter pattern.
6. Save to dashboard as `Weekly Retention (Active Usage)`.

#### Card: `wau`

1. New `Trends` insight.
2. Event: `SCREEN_VIEW`.
3. Measurement: `Unique users`.
4. Interval: `Weekly`.
5. Apply global filter pattern.
6. Save to dashboard as `Weekly Active Users (WAU)`.

#### Card: `mau`

1. New `Trends` insight.
2. Event: `SCREEN_VIEW`.
3. Measurement: `Unique users`.
4. Interval: `Monthly`.
5. Apply global filter pattern.
6. Save to dashboard as `Monthly Active Users (MAU)`.

#### Card: `stickiness`

1. Open `Product analytics` -> `Insights` -> `New insight` -> `Formula`.
2. Add series `A`: WAU insight.
3. Add series `B`: MAU insight.
4. Formula: `A / B`.
5. Save to dashboard as `WAU/MAU Stickiness`.

### 7.7 Build Section 4: Feature Adoption

#### Card: `core-creation-mix`

1. New `Trends` insight.
2. Add series:
   - `Visit Creation Completed`
   - `Photo Processing Completed`
   - `FEATURE_MUTATION_SUCCEEDED` filtered by `action = quick_track.create`
   - `FEATURE_MUTATION_SUCCEEDED` filtered by `action = note.create`
   - `FEATURE_MUTATION_SUCCEEDED` filtered by `action = restaurant_list.create`
   - `FEATURE_MUTATION_SUCCEEDED` filtered by `action = bill.create`
3. Measurement: `Total events`.
4. Interval: `Weekly`.
5. Apply global filter pattern.
6. Save to dashboard as `Core Creation Mix`.

#### Card: `screen-adoption`

1. New `Trends` insight.
2. Event: `SCREEN_VIEW`.
3. Measurement: `Unique users`.
4. Interval: `Weekly`.
5. Breakdown: `screenName`.
6. Apply global filter pattern.
7. Save to dashboard as `Screen Adoption (Unique Users)`.

### 7.8 Build Section 5: Friction and Risk

#### Card: `usage-limit-pressure`

1. New `Trends` insight.
2. Event: `USAGE_LIMIT_REACHED`.
3. Measurement: `Unique users`.
4. Interval: `Weekly`.
5. Breakdown: `metric`.
6. Apply global filter pattern.
7. Save to dashboard as `Usage Limit Pressure`.

#### Card: `error-toast-reach`

1. New `Trends` insight.
2. Event: `ERROR_TOAST_SHOWN`.
3. Measurement: `Unique users`.
4. Interval: `Weekly`.
5. Breakdown: `toastSource`.
6. Apply global filter pattern.
7. Save to dashboard as `Error Toast Reach`.

#### Card: `auth-restore-failures`

1. New `Trends` insight.
2. Event: `AUTH_SESSION_RESTORE_FAILED`.
3. Measurement: `Total events`.
4. Interval: `Weekly`.
5. Apply global filter pattern.
6. Save to dashboard as `Auth Restore Failures`.

#### Card: `offline-enqueue-pressure`

1. New `Trends` insight.
2. Event: `MUTATION_ENQUEUED`.
3. Measurement: `Total events`.
4. Interval: `Weekly`.
5. Optional breakdown: queued mutation action/type field used in your events.
6. Apply global filter pattern.
7. Save to dashboard as `Offline Queue Pressure`.

### 7.9 Final Layout and Save

1. Open the `Mobile Growth & Retention` dashboard.
2. Group cards by section headers:
   - Acquisition Overview
   - Activation Funnel
   - Retention Health
   - Feature Adoption
   - Friction and Risk
3. Pin date range to `Last 12 weeks` for operating reviews.
4. Save dashboard layout.
