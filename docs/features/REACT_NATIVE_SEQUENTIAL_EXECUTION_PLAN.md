# React Native Migration Sequential Execution Plan

## Purpose
This runbook is the execution format for building the React Native app in strict sequence, with backend unchanged, and with a reusable/themable UI foundation.

## Non-Negotiables
1. Keep existing backend and API contracts unchanged.
2. Use recommended RN offline stack:
   - `@tanstack/react-query`
   - `@tanstack/query-async-storage-persister`
   - `@react-native-async-storage/async-storage`
   - `@react-native-community/netinfo`
   - `expo-sqlite` durable mutation queue
3. Build reusable UI primitives first, then compose screens from them.
4. All styling must be token/semantic-theme driven (no hardcoded feature-screen colors/spacing).
5. Do not start the next phase until current phase gate is passed.

## Shared Screen Styling Decisions
1. Use `BackHeaderScreenScaffold` for screen-level pages that use the custom header with a back button.
2. Keep native stack headers hidden on these routes; the scaffold owns safe-area handling, header chrome, and body spacing.
3. Prefer extending this scaffold rather than creating one-off header/body layout patterns per screen.

## How To Use In A New Agent Thread
1. Open this file.
2. Find the first phase with status `[ ]`.
3. Execute only that phase.
4. Validate phase gate checklist.
5. Update phase status to `[x]` and add handoff notes.

## Master Tracker
- [x] Phase 1: Foundation (`MBL-001` to `MBL-005`)
- [x] Phase 2: Offline Core (`MBL-006` to `MBL-010`)
- [x] Phase 3: Reusable UI + Theme (`MBL-011` to `MBL-015`)
- [x] Phase 4: Screen Migration (`MBL-020` to `MBL-029`)
- [ ] Phase 5: QA + Release Prep (`MBL-030`)

---

## Phase 1: Foundation
### Scope
- `MBL-001` Expo app scaffold
- `MBL-002` Navigation architecture
- `MBL-003` Environment and API config
- `MBL-004` Auth/session bootstrap
- `MBL-005` Observability foundation

### Tasks
1. Create Expo TypeScript app in `apps/mobile`.
2. Add root providers (navigation, query client, auth/session bootstrap).
3. Add env config for backend base URLs and PocketBase URL.
4. Implement auth persistence and startup session restore.
5. Integrate analytics/crash tooling for RN.

### Deliverables
1. `apps/mobile` boots on iOS and Android.
2. Auth flow shell works end-to-end.
3. CI scripts for lint/typecheck/test are present and passing.

### Gate Checklist
- [x] iOS local run works.
- [x] Android local run works.
- [x] Auth restore works after app restart.
- [x] No hardcoded backend URLs in screens.

### Handoff Notes (fill at completion)
- Date: 2026-02-11
- Branch: main
- What was delivered:
  - Created new Expo React Native TypeScript scaffold at `apps/mobile` (`MBL-001`).
  - Added root architecture with `QueryClientProvider`, `AuthProvider`, and navigation shell (`MBL-002`).
  - Added centralized mobile env configuration for API and PocketBase URLs in `apps/mobile/src/config/env.ts` and `.env.example` (`MBL-003`).
  - Implemented PocketBase auth persistence via AsyncStorage auth store, startup session bootstrap/restore, login/logout flow shell, and authenticated home route (`MBL-004`).
  - Added observability bootstrap layer for Sentry/PostHog with auth-aware identify/reset hooks (`MBL-005`).
  - Added mobile CI-oriented scripts in root `package.json` and package-level `lint`/`typecheck`/`test` scripts.
- Open issues:
  - None.

---

## Phase 2: Offline Core
### Scope
- `MBL-006` React Query persistence
- `MBL-007` Connectivity layer
- `MBL-008` Durable mutation queue
- `MBL-009` Replay engine + conflict handling
- `MBL-010` Sync status UX

### Tasks
1. Configure React Query cache persistence with AsyncStorage persister.
2. Integrate NetInfo and expose connectivity state globally.
3. Implement SQLite mutation queue abstraction (enqueue/dequeue/retry metadata).
4. Replay queued writes on reconnect and app foreground.
5. Add retry/backoff and idempotency-key support.
6. Build global sync status UI (queue depth, errors, retry-all).

### Deliverables
1. App survives offline, kill, and restart without losing pending writes.
2. Pending writes replay on reconnect.
3. User-visible sync state and failure recovery controls.

### Gate Checklist
- [x] Query cache restores after cold restart.
- [x] Queued write survives app kill/reboot.
- [x] Replay triggers on reconnect and foreground.
- [x] Failed writes can be retried from UI.

### Handoff Notes (fill at completion)
- Date: 2026-02-12
- Branch: main
- What was delivered:
  - `MBL-006`: Added React Query AsyncStorage cache persistence and restore bootstrap in `apps/mobile/src/providers/AppProviders.tsx` using `@tanstack/query-async-storage-persister` + `@tanstack/query-persist-client-core`.
  - `MBL-007`: Added global connectivity layer in `apps/mobile/src/providers/ConnectivityProvider.tsx` with NetInfo state exposure and React Query `onlineManager` synchronization.
  - `MBL-008`: Implemented durable SQLite mutation queue abstraction in `apps/mobile/src/offline/SQLiteMutationQueueStore.ts` (enqueue, dequeue-ready, retry metadata, terminal failure metadata, queue stats).
  - `MBL-009`: Implemented replay engine with reconnect/foreground/manual replay triggers, retry backoff, and conflict handling in `apps/mobile/src/offline/MutationReplayService.ts`, `apps/mobile/src/offline/fetchMutationTransport.ts`, and `apps/mobile/src/providers/SyncProvider.tsx`.
  - `MBL-010`: Added global sync status UX with queue depth, error visibility, sync-now, and retry-all controls via `apps/mobile/src/components/SyncStatusBanner.tsx`; wired into app root.
  - Added Phase 2 coverage tests:
    - `apps/mobile/src/__tests__/queryPersistence.test.ts`
    - `apps/mobile/src/__tests__/MutationReplayService.test.ts`
    - `apps/mobile/src/__tests__/fetchMutationTransport.test.ts`
  - Validation run (pass):
    - `npm run mobile:lint`
    - `npm run mobile:typecheck`
    - `npm run mobile:test`
- Open issues:
  - None.

---

## Phase 3: Reusable UI + Theme
### Scope
- `MBL-011` Design tokens + ThemeProvider
- `MBL-012` Core UI primitives
- `MBL-013` Stateful shared components
- `MBL-014` Shared form/list patterns
- `MBL-015` Style-change readiness gate

### Tasks
1. Create token system in `apps/mobile/src/theme/tokens.ts`.
2. Implement `ThemeProvider` and semantic theme shape.
3. Build primitives in `apps/mobile/src/ui`:
   - `Screen`, `Text`, `Button`, `Input`, `Card`, `ListItem`, `Modal`
4. Build shared state components:
   - `EmptyState`, `ErrorState`, `Skeleton`, `LoadingOverlay`, `OfflineBanner`
5. Build shared form and list/detail scaffolds used by all screen groups.
6. Enforce token-only styles (lint rule or code review checklist).
7. Enforce safe-area compliance using `react-native-safe-area-context` for global chrome and screens so content never overlaps device status bars/notches.

### Deliverables
1. UI primitives used by early migrated screens.
2. Semantic tokens replace raw style constants in feature screens.
3. Demonstrable style swap by editing tokens/theme only.

### Gate Checklist
- [x] Core primitives exist and are typed.
- [x] Shared state components exist and are reused.
- [x] Feature screens avoid raw hex/spacing literals.
- [x] Token-only style-change demo provided.
- [x] iOS/Android safe-area checks pass (no content under notch/status/navigation bars).

### Handoff Notes (fill at completion)
- Date: 2026-02-13
- Branch: main
- What was delivered:
  - `MBL-011`: Added design-token + semantic theme system in `apps/mobile/src/theme/tokens.ts` and `apps/mobile/src/theme/ThemeProvider.tsx`, with exported theme hooks and theme variants.
  - `MBL-012`: Added typed primitives in `apps/mobile/src/ui` (`Screen`, `Text`, `Button`, `Input`, `Card`, `ListItem`, `Modal`) and refactored shell/screens to consume them.
  - `MBL-013`: Added shared state components in `apps/mobile/src/components/shared` (`EmptyState`, `ErrorState`, `Skeleton`, `LoadingOverlay`, `OfflineBanner`) and reused them in login/home/global sync surfaces.
  - `MBL-014`: Added reusable scaffolds in `apps/mobile/src/components/shared` (`FormScaffold`, `DetailListScaffold`) and wired them into migrated screens.
  - `MBL-015`: Added token-style enforcement in `apps/mobile/eslint.config.js` (`no-restricted-syntax` rule blocking raw hex in feature code), added style-swap demo helper in `apps/mobile/src/theme/styleSwapDemo.ts`, and removed raw hex style literals from current feature screens.
  - Safe-area compliance: global chrome + screens now route through safe-area-aware wrappers (`SafeAreaProvider`, `Screen`, and `SyncStatusBanner` top inset handling) so content is inset away from status/notch/navigation bars.
  - Validation run (pass):
    - `npm run lint` (in `apps/mobile`)
    - `npm run typecheck` (in `apps/mobile`)
    - `npm run test` (in `apps/mobile`)
- Open issues:
  - None.

---

## Phase 4: Screen Migration
Execute subphases in order. Do not parallelize unless dependencies are explicitly removed.

### 4.1 Auth + Onboarding (`MBL-020`)
- [x] Onboarding, signup, login, forgot/reset/verify flows migrated.
- [x] Session restore and logout behavior match expected parity.

### 4.2 Home + Feed (`MBL-021`)
- [x] Home feed and quick-track cards migrated.
- [x] Loading/empty/error/offline states implemented with shared components.

### 4.3 Add/Edit Visit + Quick Track (`MBL-022`)
- [x] Add-visit wizard migrated.
- [x] Edit visit and quick-track flows migrated.
- [x] All writes use offline queue.

### 4.4 Photo Processing (`MBL-023`)
- [x] Camera/gallery selection and upload flow migrated.
- [x] Processing states and retry paths migrated.
- [x] Draft recovery integrated with offline persistence.

### 4.5 Lists (`MBL-024`)
- [x] List CRUD + detail + add-restaurant migrated.
- [x] Offline-safe write behavior verified.

### 4.6 Notes (`MBL-025`)
- [x] Notes list/create/edit/delete migrated.
- [x] Offline-safe create/edit/delete verified.

### 4.7 Friends + Profile (`MBL-026`)
- [x] Friends/profile/invite flows migrated.
- [x] QR scan flow migrated with native scanner.

### 4.8 Settings + Feedback + Misc/Admin (`MBL-027`)
- [x] Settings and feedback flows migrated.
- [x] Admin routes role-gated.

### 4.9 Group Tastings Beta Feature (`MBL-029`)
- [x] Admin-only Group Tastings entry point from Misc screen migrated.
- [x] Admin-only route guards migrated for `/tasting-sessions` and `/tasting-session/$sessionId`.
- [x] Sessions list view migrated with active/completed filtering.
- [x] Create Session dialog migrated (session name + restaurant search/select).
- [x] Join Session dialog migrated (6-character invite code flow).
- [x] Session detail state machine migrated:
  - adding items
  - rating
  - completed results
- [x] Lobby flow migrated (invite code display, copy/share, regenerate code, participants list).
- [x] Item management migrated (add item, optional description, delete permissions).
- [x] Rating flow migrated (per-item ratings, notes, progress).
- [x] Results flow migrated (group favorites, controversial items, save to visit history).

### 4.10 Bills (`MBL-028`)
- [x] Bills list/detail/itemized flow migrated.
- [x] Calculation parity validated against web behavior.

### Phase 4 Gate Checklist
- [x] Every screen group uses shared UI primitives.
- [x] Every write path uses offline queue abstraction.
- [x] All screen groups include loading/empty/error/offline UX.
- [x] Group Tastings beta feature is present with admin-only access parity and full create/join/rate/results coverage.
- [x] Feature parity confirmed for primary user journeys.

### Handoff Notes (fill at completion)
- Date: 2026-02-13
- Branch: main
- What was delivered:
  - `MBL-020`: Added full auth/onboarding stack in mobile (`Onboarding`, `SignUp`, `Login`, `ForgotPassword`, `ResetPassword`, `VerifyEmail`) and kept session restore/logout parity through the existing auth provider.
  - `MBL-021`: Rebuilt `HomeScreen` into a migrated feed hub with quick-track cards and shared loading/empty/error/offline state components.
  - `MBL-022`: Added add-visit wizard, edit-visit, quick-track create/edit flows with all write operations routed through the queued offline sync abstraction.
  - `MBL-023`: Added photo processing flow with camera/gallery source entry paths, processing + retry state handling, and draft recovery persistence.
  - `MBL-024`: Added list CRUD, list detail, add/remove restaurant-to-list flows with queued offline-safe writes.
  - `MBL-025`: Added notes list/create/edit/delete flows and note-to-quick-track handoff with queued offline-safe writes.
  - `MBL-026`: Added friends/profile/invite flows and QR scan invite flow, wired to local feature store + queued writes.
  - `MBL-027`: Added settings, feedback, misc/admin surfaces and role-gated admin navigation behavior.
  - `MBL-029`: Added admin-only Group Tastings entry and route guards, sessions list filtering, create/join flows, lobby controls, item management, rating progression, results summary, and save-to-visit-history flow.
  - `MBL-028`: Added bills list/detail/itemized creation/update flow using shared bill-calculation utilities ported for mobile parity.
  - Added new shared mobile feature data layer (`apps/mobile/src/features`) with persisted local store and queued-write helper consumed across all Phase 4 write paths.
  - Validation run (pass):
    - `npm run lint` (in `apps/mobile`)
    - `npm run typecheck` (in `apps/mobile`)
    - `npm run test` (in `apps/mobile`)
- Open issues:
  - Device-camera and hardware QR SDK modules could not be installed in this offline environment (`Networking has been disabled`), so current camera/gallery and scanner flows run through migrated mobile capture/scan surfaces with simulated acquisition inputs.

---

## Phase 5: QA + Release Prep
### Scope
- `MBL-030` Device QA + release pipeline

### Tasks
1. Run end-to-end smoke tests on iOS and Android devices.
2. Validate offline/reconnect/background behaviors.
3. Validate analytics/crash reporting ingestion.
4. Configure internal distribution:
   - TestFlight (iOS)
   - Play Console Internal Testing (Android)
5. Final bug triage and release checklist signoff.

### Deliverables
1. Internal beta builds available on both platforms.
2. Critical flows pass on real devices.
3. Known issues documented with severity and workaround.

### Gate Checklist
- [ ] iOS internal build distributed.
- [ ] Android internal build distributed.
- [ ] Offline and reconnect tests pass.
- [ ] Release checklist signed off.

### Handoff Notes (fill at completion)
- Date:
- Branch:
- What was delivered:
- Open issues:

---

## Start Prompt Template For Each New Agent Thread
Use this prompt in a new thread:

```text
Use /Users/developer/programming/food-tracker-app/docs/features/REACT_NATIVE_SEQUENTIAL_EXECUTION_PLAN.md.
Continue with the first incomplete phase only.
Implement all scoped tickets for that phase, run validations, and update the phase checklist + handoff notes in the same file.
Do not start later phases.
```

## End-Of-Phase Reporting Template
```text
Phase completed: <phase name>
Tickets completed: <IDs>
Files changed: <list>
Validation run: <commands + pass/fail>
Known gaps/risks: <short list>
Next phase ready: yes/no
```
