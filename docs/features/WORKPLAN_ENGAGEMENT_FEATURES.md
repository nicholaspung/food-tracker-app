# Engagement Features Workplan

Status: Reconciliation needed - not ready for implementation.

This workplan preserves the useful product direction from the previous engagement plan while removing stale implementation details that conflict with the current domain model. Before any AFK implementation work starts, each slice below should be turned into a focused PRD or issue set that cites `CONTEXT.md`, ADR-0003, and ADR-0008.

## Current Product Direction

Food Tracker should create more reasons to open the app beyond logging a restaurant visit:

- Personal insights that summarize a user's own visits, ratings, cuisines, spending, and trends.
- Recommendation loops based on durable **Recommendation Usage**, not lightweight likes.
- Discovery surfaces that help users find restaurants and menu items from trusted sources.
- **Notification Signals** that point users to existing destination screens without creating a notification inbox.

## Canonical Domain Decisions

Use these decisions when drafting implementation tickets:

- **Recommendation Usage** is the durable attribution layer for saved, unsaved, tried, and rated-after-try actions.
- **Saved Recommendation** records that a user saved a recommendation to **Want to Try** or another **Restaurant List**.
- **Tried Recommendation** records that a user created a Visit from a saved or shared recommendation.
- **Rated After Try** records that the acting user added their own rating after following a **Recommendation Source**.
- **Recommendation Usage Proof** is passive in-app proof shown to accepted friends, owners, or creators where appropriate.
- **Creator Guide Unlock** is a monetization event, not **Recommendation Usage**, even if creator reporting later combines unlock and usage metrics.
- First-version **Recommendation Usage Proof** should not generate **Remote Device Notifications** or notification inbox items.
- First-version notifications use **Notification Signals** surfaced as **Device Notifications**, **In-App Indicators**, or both.
- Food Tracker does not keep a user-facing notification inbox, read state, notification history, or generic notification records in the first version.
- **Remote Device Notifications** are reserved for tasting invites, Bill owed-money events, **Bill Payment Reminders**, and monthly friends activity.
- User-scheduled visit reminders are one-time **Local Device Notifications** from the Add tab quick reminder action.

## Implementation Slices

### 1. Personal Insights

Goal: give users a useful periodic view of their own Food Tracker history without inventing new social attribution concepts.

Candidate read models:

- Visit count, unique restaurant count, and unique cuisine count by week, month, year, and all time.
- Rating distribution using canonical rating labels and colors.
- Top-rated restaurants and menu items from the user's own Visit Items.
- Spending summaries where Bill data is available.
- Year-end or period summaries generated from the same read models.

Implementation notes:

- Keep stats read models separate from **Recommendation Usage**.
- Do not describe top-rated items as favorites unless the product introduces a separate favorite concept.
- Preserve privacy and visibility rules when summaries include friend-visible data.

### 2. Recommendation Usage

Goal: model recommendation attribution with durable usage events rather than generic social reactions.

First implementation candidates:

- Record a **Saved Recommendation** when a user saves a friend or creator recommendation to **Want to Try** or another **Restaurant List**.
- Preserve the original **Recommendation Source** when a saved item is later moved, removed, or tried.
- Record a **Tried Recommendation** when a user creates a Visit from a saved or shared recommendation.
- Record **Rated After Try** when the acting user rates their own Visit Item after following a recommendation.
- Show **Recommendation Usage Proof** as passive in-app proof, such as current saved counts or tried-after-save summaries.

Explicitly avoid for this version:

- A `likes` schema as the social proof model.
- Treating views as durable usage before a creator monetization need proves that requirement.
- Using generic engagement or conversion terminology where **Recommendation Usage** or **Creator Guide Unlock** is meant.
- Sending **Remote Device Notifications** for saved, tried, or rated-after-try proof without a new ADR.

### 3. Discovery Surfaces

Goal: help users browse recommendations and trends while keeping attribution semantics precise.

Candidate surfaces:

- Friend-informed **Want to Try** browsing.
- Restaurant and menu item discovery from accepted friends' friend-visible Visits.
- Aggregated trend or recommendation modules that respect visibility.
- Creator Guide discovery if **Creator Guide Unlock** and creator reporting are defined in a separate monetization plan.

Implementation notes:

- Discovery views may emit product analytics events, but those events are not **Recommendation Usage** by default.
- If discovery creates a saved item or Visit, record the appropriate **Recommendation Usage** action with the original **Recommendation Source**.
- Creator monetization reporting should distinguish **Creator Guide Unlock** from downstream **Recommendation Usage**.

### 4. Notification Signals

Goal: draw attention to actionable domain state without building an inbox.

Allowed first-version signal types:

- **In-App Indicators** derived from unresolved domain state, such as friend requests, pending tasting invites, shareable tasting invite windows, and active Bills where the signed-in user owes money.
- **Remote Device Notifications** for tasting invites, Bill owed-money events, weekly-limited **Bill Payment Reminders**, and monthly friends activity.
- **Local Device Notifications** for user-scheduled visit reminders.

Explicitly avoid for this version:

- A user-facing `notifications` collection.
- Notification read/unread state.
- Notification badge counts derived from read history.
- Mark-all-read endpoints or inbox screens.
- Storing notification body text or push tokens in a user-visible notification history.

Any future inbox, read-state, or notification-history behavior requires a new ADR because ADR-0003 rejects it for the first version.

## Suggested Execution Order

1. Refresh domain-backed personal insights read models.
2. Add **Recommendation Usage** persistence for saved, tried, and rated-after-try actions.
3. Add small **Recommendation Usage Proof** surfaces that do not notify users.
4. Expand discovery surfaces using the same saved and tried attribution paths.
5. Add or adjust **Notification Signals** only for the ADR-approved device notification and in-app indicator categories.
6. Revisit creator monetization separately with **Creator Guide Unlock** as its own event model.

## Success Metrics

Use precise metrics that match the domain model:

- Weekly active users viewing personal insights.
- Saved recommendations created from friend or creator sources.
- Tried recommendations created from saved or shared recommendations.
- Rated-after-try events following a recommendation source.
- Recommendation Usage Proof impressions and interaction rates.
- Monthly friends activity notification open rate.
- Bill owed-money and Bill Payment Reminder notification open rates.
- Visit reminder completion rate for local reminder flows.

Avoid reporting likes, notification inbox reads, generic conversion, or creator unlocks as **Recommendation Usage** unless a future ADR changes the model.

## References

- `CONTEXT.md`
- `docs/adr/0003-notifications-use-domain-signals-without-inbox.md`
- `docs/adr/0008-recommendation-usage-is-durable-attribution.md`
