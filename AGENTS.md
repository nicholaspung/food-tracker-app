# AGENTS.md

## Scope

- These instructions apply to mobile React Native work in `/Users/developer/programming/food-tracker-app/apps/mobile`.
- Prefer existing patterns and shared abstractions before creating new ones.

## Thread Workflow (Every Task)

- Identify the screen/feature type first, then pick the matching scaffold before implementing behavior.
- Follow existing data flow: React Query for reads, feature-layer functions for domain logic, and queued writes for offline-safe user mutations.
- Use theme tokens and shared UI primitives/components; avoid ad-hoc styling or one-off UI patterns.
- Add or preserve loading, empty, and error states for all async screens.
- Before finishing, run a quick consistency pass with the checklist at the bottom of this file.

## App Composition and Providers

- Keep app shell/provider order aligned with `/Users/developer/programming/food-tracker-app/apps/mobile/App.tsx` and `/Users/developer/programming/food-tracker-app/apps/mobile/src/providers/AppProviders.tsx`.
- Keep React Query persistence initialization in `AppProviders`; do not bypass the splash gating before query cache restore completes.
- Keep sync wiring inside `SyncProvider`; replay triggers currently run on startup, reconnect, foreground, and enqueue.

## Navigation and Route Conventions

- Define new routes in `RootStackParamList` in `/Users/developer/programming/food-tracker-app/apps/mobile/src/navigation/RootNavigator.tsx`.
- Keep route names and params strongly typed; avoid untyped navigation payloads.
- Prefer custom scaffold headers (`ScreenHeader` via scaffolds) for authenticated screens.
- Auth/onboarding flows may continue to use native stack titles where already established.

## Screen Scaffold Selection

- Use `/Users/developer/programming/food-tracker-app/apps/mobile/src/components/shared/TabRootScreenScaffold.tsx` for top-level tab roots.
- Use `/Users/developer/programming/food-tracker-app/apps/mobile/src/components/shared/BackHeaderScreenScaffold.tsx` for back-button pages with custom headers.
- Use `/Users/developer/programming/food-tracker-app/apps/mobile/src/components/shared/FeatureFormScreenScaffold.tsx` for create/edit forms with sticky primary actions.
- Use `/Users/developer/programming/food-tracker-app/apps/mobile/src/components/shared/FeatureDetailScreenScaffold.tsx` for detail pages with compact headers.
- Use `/Users/developer/programming/food-tracker-app/apps/mobile/src/components/shared/FormScaffold.tsx` for auth-style forms.
- When touching legacy screens that do not follow these scaffolds yet, avoid large refactors unless the task explicitly requests it.

## UI and Styling Conventions

- Use primitives from `/Users/developer/programming/food-tracker-app/apps/mobile/src/ui` and shared components from `/Users/developer/programming/food-tracker-app/apps/mobile/src/components/shared`.
- Keep styling theme-driven via `useTheme()` and token values from `/Users/developer/programming/food-tracker-app/apps/mobile/src/theme`.
- Do not add raw hex color literals in feature code; ESLint enforces token usage outside `/Users/developer/programming/food-tracker-app/apps/mobile/src/theme/tokens.ts`.
- Keep visibility/status semantics on dedicated components (for example `VisibilityOptionSelector`, `StatusPill`, `VisibilityBadge`) instead of ad-hoc badges.

## Data, Query, and Mutation Patterns

- Use React Query for async reads and keep mobile query keys namespaced with `['feature', ...]`.
- Keep query keys stable and serializable; include IDs/filter params in the key when the payload changes.
- After successful mutations, invalidate only the relevant `['feature', ...]` keys needed to refresh affected views.
- Prefer domain operations from `/Users/developer/programming/food-tracker-app/apps/mobile/src/features/store/featureStore.ts` for shared business logic.
- Do not add new direct `pb.collection(...)` calls in `/Users/developer/programming/food-tracker-app/apps/mobile/src/screens`.
- For new screen behavior, route data access through feature-layer APIs (`src/features/store`) or a dedicated non-screen data module.
- Existing legacy direct PocketBase calls may remain when out of scope, but any touched flow should move toward feature-layer wrappers instead of adding more screen-level calls.

## New Screen Template

- Step 1. Add/confirm typed route params in `/Users/developer/programming/food-tracker-app/apps/mobile/src/navigation/RootNavigator.tsx` (`RootStackParamList`).
- Step 2. Pick the correct scaffold (`TabRootScreenScaffold`, `BackHeaderScreenScaffold`, `FeatureFormScreenScaffold`, `FeatureDetailScreenScaffold`, or `FormScaffold`).
- Step 3. Add reads with React Query using stable `['feature', ...]` keys.
- Step 4. Add writes via feature-layer functions; for offline-sensitive writes, call `useQueuedWrite()` before/alongside the mutation flow.
- Step 5. Wire async UI states: loading (`Skeleton`/`LoadingOverlay`), empty (`EmptyState`), and error (`ErrorState`/`PageErrorToast`).
- Step 6. Keep styles theme-token based with `useTheme()` and shared UI primitives/components.
- Step 7. Apply domain-specific standards: rating UI uses `RatingPill` or `getRatingColor`/`getRatingLabel`, and status/visibility semantics use `StatusPill`, `VisibilityBadge`, and `VisibilityOptionSelector`.
- Step 8. Finish with checks: `npm run mobile:lint` and `npm run mobile:typecheck`.

## Offline Write Pattern

- Required queue coverage for user-authored create/update/delete flows: visits, quick tracks, notes, lists/list items, bills, feedback messages, and friend actions.
- For new or touched offline-capable flows, queue the actual replayable mutation payload (method/url/headers/body) through `SyncProvider`/offline queue primitives; do not rely on marker-only queue entries as the primary offline behavior.
- If a touched flow still cannot be moved to true outbox replay in the same task, preserve existing behavior but document the gap in the task summary and avoid introducing new non-queued writes in those domains.
- Keep queued writes idempotent and retry-safe; sync replay uses retry/backoff from `/Users/developer/programming/food-tracker-app/apps/mobile/src/offline`.
- Preserve `SyncStatusBanner` behavior and avoid bypassing `SyncProvider` for offline-aware flows.

## Offline UX Contract

- Cold offline open must show previously cached data for core browse surfaces: Home feed, Notes, Lists, Bills, Friends, Feedback inbox, and Profile summaries.
- On those browse screens, treat query failure as blocking only when no cached data exists; if cached data exists, keep rendering it and show a non-blocking refresh error.
- Keep React Query persistence wired through `/Users/developer/programming/food-tracker-app/apps/mobile/src/providers/AppProviders.tsx`; do not bypass restore gating.
- Clearly label and disable online-only actions when offline. Online-only categories include auth/account security, admin moderation, and menu-item management flows.

## Async Screen State Pattern

- For data-driven screens, handle loading with `Skeleton` or `LoadingOverlay` where appropriate.
- Provide an empty-state path with `EmptyState` when no records exist.
- Surface request failures with `ErrorState` and/or `PageErrorToast` depending on page context.
- Clear stale error text before retrying submissions.

## Mobile Rating Color Standard

- Canonical rating palette lives in `/Users/developer/programming/food-tracker-app/apps/mobile/src/lib/ratingConstants.ts` via `getRatingColor`.
- Canonical rating labels live in `/Users/developer/programming/food-tracker-app/apps/mobile/src/lib/ratingConstants.ts` via `getRatingLabel`.
- Use `/Users/developer/programming/food-tracker-app/apps/mobile/src/components/shared/RatingPill.tsx` for rating badges/chips in UI.
- Do not use `StatusPill` tones (`warning`, `success`, etc.) to represent rating values.
- Visual reference for expected rating colors: `/Users/developer/programming/food-tracker-app/apps/mobile/src/components/shared/RatingSelector.tsx` and `/Users/developer/programming/food-tracker-app/apps/mobile/src/screens/HomeScreen.tsx`.

## When Editing Rating UI

- Keep rating colors driven by `getRatingColor(theme, rating)` instead of ad-hoc theme status colors.
- Keep rating text driven by `getRatingLabel(rating)` when labels are displayed.
- Before finishing, run a quick check that rating badges are not using `StatusPill` with warning/success for rating semantics.

## Pre-Completion Checklist

- Scaffold choice matches screen type, or legacy deviation is intentional and documented in the PR/summary.
- No new raw color literals were introduced outside theme tokens.
- Query keys follow `['feature', ...]` and invalidation targets are present after mutations.
- No new direct `pb.collection(...)` calls were introduced in `apps/mobile/src/screens`.
- Offline-sensitive writes use outbox queueing patterns (or existing queue fallback with documented gap) for user-authored mutation domains.
- Core browse screens preserve cached-data rendering on offline/refetch failure (blocking errors only when no cached data exists).
- Online-only flows show explicit offline messaging and disabled controls.
- Loading, empty, and error states are covered on async screens.
- Rating UI still uses `getRatingColor`, `getRatingLabel`, and `RatingPill` conventions.
- Run relevant checks for touched mobile code: `npm run mobile:lint` and `npm run mobile:typecheck`.
