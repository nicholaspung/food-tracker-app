# Mobile Local Persistence

This document records the current mobile local-persistence surfaces and the production policy for how they may store user-associated data.

## Surfaces

| Surface | Storage | Contents | Current privacy treatment |
| --- | --- | --- | --- |
| Auth state | `expo-secure-store` through `SecureStoreAuthStore`; falls back to `AsyncStorage` when SecureStore is unavailable | PocketBase auth token and model snapshot | Native devices use SecureStore where available and migrate legacy AsyncStorage values into SecureStore. The fallback should be treated as plaintext. |
| React Query persistence | `AsyncStorage` key `food_tracker_mobile_query_cache_v5` with environment prefixing | Allowlisted browse queries for Home feed, visits, food products, bills, notes, note photos, friends, restaurant lists, profile, and feedback summary/list data | `queryPersistence` sanitizes persisted notes by removing coordinates and sanitizes feedback browse records by removing `userEmail` and `assignedAdminId`. Offline browse UX intentionally retains user-authored browse fields such as note title/content/location text, profile details, bill fields, friend browse rows, and feedback title/description/status. |
| Offline mutation queue | Native SQLite database `food_tracker_offline_queue.db`; web `localStorage` key `food_tracker_mobile_web_offline_queue_v1` | Replayable mutation rows: method, URL, serialized body, headers, idempotency key, retry state, and errors | Queue bodies are intentionally persisted so offline writes can replay. Current queued payload domains include **Visit Writes**, **Food Product Writes**, **Note Writes**, **Restaurant List Writes**, **Bill Writes**, **Feedback Writes**, **Friend Writes**, **Settings Preferences**, **Onboarding Progress**, and the supported **Tasting Session Writes** subset. Treat queue bodies as plaintext until the policy decision changes storage behavior. |
| Usage snapshots | `AsyncStorage` keys `usage.monthly.snapshot.v1:{userId}:{scope}` | Monthly usage-limit snapshot and `cachedAt` timestamp | Cached for offline/stale account-limit display. Contains usage counters/limits rather than authored content, but the key includes user id and should be treated as user-associated local data. |
| Storefront Scan History | `AsyncStorage` key `food_tracker_storefront_scan_history_v1:{identityKey}` with environment prefixing | Up to 100 saved storefront extraction entries per identity key. Each entry stores an id, extraction result, scan timestamp, and camera/gallery source. Results may include extracted restaurant-name options with confidence/reason, visible text fallback, language, or non-restaurant reason. | Supports user-visible saved scan results in **Food Discovery**. Treat as user-associated local data because it can contain extracted storefront text and restaurant-name options. Users can delete saved result options from the Food Discovery scan UI; deleting the last option removes that entry. |
| Pending auth redirects | `AsyncStorage` key `pending_auth_redirect_v1` | Shared-list redirect route, share token, and creation timestamp | Retained up to 30 days so auth can continue into a shared-list route. Share token is plaintext local data. |
| Friend Invite Handoff | `AsyncStorage` key `pending_friend_suggestion_v1` (legacy storage name) | Inviter id/display name, invited user id, creation timestamp, and expiry timestamp | Used to complete signup-inviter handoff after signup or app restart. This is not a friend recommendation surface. Does not persist the invited user's email and expires after 24 hours. |
| Analytics first-use markers | `AsyncStorage` keys `analytics.product.firstFoodLogged.{identity}` | Boolean marker that a first-food analytics event was already sent for an anonymous or product user key | Prevents duplicate analytics events. Does not store authored content, but the key embeds the analytics identity. |

## Current Privacy Gaps For Policy Follow-Up

- React Query persistence and the offline queue are plaintext on the current platform stores.
- Offline queue replayability requires full mutation bodies, including user-authored visit, note, bill, list, feedback, and friend-action payloads.
- Friend Invite Handoff records are plaintext AsyncStorage records under the legacy `pending_friend_suggestion_v1` key, but they no longer store the invited user's email and are TTL-bounded.
- Some intentionally retained browse data is personal or user-authored, including note text/location text, profile details, friend browse rows, bill details, and feedback descriptions.

## Production Policy

The app prioritizes cold offline browsing and replayable offline writes for the core mobile experience. Local storage must therefore be minimized and bounded, but not removed in ways that break cached browse screens or outbox replay.

### Surface Rules

| Surface | Policy | Native behavior | Web behavior |
| --- | --- | --- | --- |
| Auth state | Store tokens only in secure platform storage when available. Do not duplicate auth tokens into query cache, offline queue payloads, diagnostics, or analytics. | Required to use `expo-secure-store`; the current AsyncStorage fallback is only a compatibility fallback when the native module is unavailable. Expo documents SecureStore as encrypted local key-value storage, backed by Android Keystore on Android and iOS keychain services on iOS. | No equivalent secure local store is assumed for web. Web auth persistence must be treated as plaintext and should not be expanded without a separate web-auth decision. |
| React Query persistence | Keep the current allowlisted browse-cache model. Persist only queries needed for cold offline browse, sanitize fields that are not required for browse UX, and keep the restore max age at 24 hours unless a future issue explicitly changes the offline contract. Do not persist secrets, raw auth records, precise note coordinates, feedback admin assignees, or feedback user emails. | Plaintext `AsyncStorage` is accepted for this release because the stored data is browse cache, not secrets, and the cache is sanitized, allowlisted, environment-scoped, and time-bounded. | Same policy, but treat browser storage as plaintext and user-clearable. Do not add web-only sensitive projections. |
| Offline mutation queue | Persist the full replay payload required to execute queued user-authored writes. Queue entries must remain idempotent, retry-safe, and diagnosable without exposing raw bodies through support summaries. Retention cleanup is implemented for terminal failed rows older than 30 days; pending, retrying, and in-flight rows are retained so replay is not interrupted. | Plaintext SQLite is accepted for this release because outbox replay requires full mutation bodies. Expo SQLite supports SQLCipher with a native app build, but this app has not enabled it; adopting it would be a separate migration because it changes native configuration, database opening, key handling, and existing queue migration. Native cleanup runs through `MutationReplayService` and `SQLiteMutationQueueStore.cleanupRetainedMutations`. | The web queue uses `localStorage` and is plaintext. Web queue payloads should follow the same replay/minimization rules, and web should not be treated as a secure persistence target. Web cleanup applies the same terminal-failed-row rule through `SQLiteMutationQueueStore.web.cleanupRetainedMutations`. |
| Usage snapshots | Continue storing usage counters and limits for offline/stale account-limit display. Keep user id in the key only as needed to avoid cross-account leakage. Add age-based invalidation if the snapshot ever expands beyond counters/limits. | Plaintext AsyncStorage accepted. | Plaintext browser storage accepted. |
| Storefront Scan History | Keep saved storefront scan results bounded to 100 entries per identity key and scoped by environment. Keep user deletion available from the Food Discovery scan UI. Do not treat this history as a backend restaurant record or menu scan source image. | Plaintext AsyncStorage is accepted for this release because the surface is bounded, user-visible, environment-scoped, and deletable from the scan results UI. Do not migrate it in the marker-only SQLite localStorage migration; any future move should preserve identity scoping, max-entry trimming, invalid-JSON fallback, and delete behavior. | No separate web persistence policy exists beyond the current `localPersistence` storage owner. Treat browser storage as plaintext if this surface is enabled on web. |
| Pending auth redirects | Keep the 30 day TTL and clear after consumption or invalid parse. Do not store more than route, share token, and creation timestamp. | Plaintext AsyncStorage accepted because the value is short lived and required for auth-to-share handoff. | Plaintext browser storage accepted with the same TTL. |
| Friend Invite Handoff | Keep the payload email-free and TTL-bounded. Store only inviter id/display name, invited user id, creation timestamp, and expiry timestamp. Clear records after accept/dismiss, invalid parse/shape, account mismatch, or expiry. Existing code may still refer to pending friend suggestions because `pending_friend_suggestion_v1` is the legacy storage/API name. | Plaintext AsyncStorage accepted for this 24-hour signup handoff. | Plaintext browser storage accepted with the same 24-hour TTL. |
| Analytics first-use markers | Keep marker values non-content. Avoid embedding raw email addresses or authored content in keys. | Plaintext AsyncStorage accepted. | Plaintext browser storage accepted. |

### Rules For New Persistence

- Default to no local persistence for new data unless it supports cold offline browse, replayable offline writes, auth/session continuity, or a small non-content product marker.
- New persisted query keys must be allowlisted in `queryPersistence` and reviewed for projection minimization.
- New user-authored create/update/delete flows in the offline-supported domains must queue replayable payloads through the existing outbox primitives; marker-only queue entries are not enough.
- Current queued **Tasting Session Writes** cover creating sessions, joining sessions, and session status updates into planning, tasting, and completed. Queued completion replays the **Tasting Session Lifecycle** status transition only; it does not replay a participant's rating payload. **Tasting Plan Writes** and **Tasting Rating Submission Writes** remain online-only unless a future dedicated outbox registration adds replay support for the touched action.
- New support diagnostics may include operation ids, methods, redacted URLs, status, timestamps, retry state, and sanitized error shape. They must not expose serialized queue bodies or auth tokens.
- Any future encryption work must define key storage, migration, failure recovery, and web fallback behavior before changing production storage.

### Rationale

Encrypting the current query cache in SecureStore is not a good fit: SecureStore is intended for key-value secrets and Expo notes large values can be rejected by underlying platform limits. The query cache is larger structured browse data, so the safer current control is allowlisting, sanitization, environment-scoped keys, and 24 hour restore retention.

Encrypting the native queue is possible only as a native SQLite/SQLCipher migration, not as a small JavaScript-only change. Because queued writes must keep replayable bodies, the production policy accepts plaintext queue storage for now while requiring idempotency, sanitization of diagnostics, and the implemented terminal-failure retention cleanup.

The policy deliberately treats web storage as plaintext. Web offline support can preserve behavior, but it must not be used as a reason to persist more sensitive data than native.

## Policy Follow-Ups

- No open offline queue retention cleanup follow-up is currently tracked. The implemented policy is covered by `apps/mobile/src/__tests__/SQLiteMutationQueueStoreRetention.test.ts`; create a new local issue if product or security requirements change the 30-day failed-row retention window or expand cleanup beyond terminal failed rows.

## Expo SQLite LocalStorage Decision

Decision: adopt `expo-sqlite/localStorage/install` only for small non-sensitive marker storage, and keep auth, query cache, and offline queue storage on their current engines until separate migrations explicitly address their restore, replay, and privacy contracts.

Expo documents `expo-sqlite/kv-store` as a SQLite-backed drop-in replacement for AsyncStorage and `expo-sqlite/localStorage/install` as a native `globalThis.localStorage` implementation that is a no-op on web. This app already has an app-owned `localPersistence` interface, so future migrations should change the category engine behind that interface instead of spreading direct global `localStorage` calls through feature code.

### Storage Classification

| Category | Current owner | Classification | SQLite localStorage decision |
| --- | --- | --- | --- |
| PocketBase auth state | `SecureStoreAuthStore` | Secure auth | Explicitly excluded. Native auth remains in SecureStore; the existing AsyncStorage fallback is only a compatibility fallback when SecureStore is unavailable. |
| Remembered login email and auth rate limiter | `localPersistence.authFallback` | Secure/auth-adjacent fallback | Do not move in the marker migration. These are tied to auth UX and logout/security behavior, so they need a separate auth-storage decision if revisited. |
| React Query persistence | `localPersistence.queryCache` | Query cache | Do not move in the marker migration. Cache restore gates app startup through `AppProviders`, uses active and legacy environment-scoped keys, and has explicit sanitization/retention behavior. |
| Offline mutation queue | `localPersistence.offlineQueue` | Offline mutation queue | Do not move. Native already uses a dedicated SQLite database with replayable payload rows; web uses `localStorage` only for the web queue. Any move must preserve replay payload persistence, retry state, and retention cleanup. |
| Theme, rating guide, food-product-rated marker, role preview | `localPersistence.uiPreferences` | UI/preferences marker | Approved for follow-up migration to SQLite-backed localStorage because values are small, non-content markers/preferences. |
| Usage snapshots | `localPersistence.usageSnapshots` | Usage snapshot | Do not include in the first migration. Values are non-content counters, but keys are user-scoped and must be handled with cache invalidation and cross-account leakage checks. |
| Storefront Scan History | `localPersistence.storefrontScanHistory` | User-visible Food Discovery history | Do not include in the marker migration. It stores extracted storefront text/restaurant-name options under an identity-scoped key and needs an explicit migration decision for privacy review, delete semantics, max-entry trimming, and invalid-data fallback. |
| Pending auth redirect and Friend Invite Handoff | `localPersistence.authHandoffs` | Handoff record | Do not include in the first migration. These records are TTL-bounded but include share/inviter handoff data and must preserve expiry, consume-on-use, and account-mismatch cleanup. The Friend Invite Handoff currently uses the legacy `pending_friend_suggestion_v1` storage key. |
| Notification device id | `localPersistence.notifications` | Notification device id | Approved for follow-up migration only if logout/account-deletion cleanup is tested. It is a device-registration identifier, not authored content, but stale values can affect server-side notification deactivation. |
| Anonymous id and first-food logged marker | `localPersistence.analytics` | Analytics marker | Approved for follow-up migration because values are non-content product analytics markers. Keys must not embed raw emails or authored content. |

### Migration Risks

- Cache invalidation: React Query cache keys have active and legacy versions and are restored before splash gating completes. Moving this cache with a global localStorage install would need an explicit dual-read or deliberate cache-drop plan, plus cold offline browse verification.
- Logout behavior: sign-out and account deletion must continue clearing auth fallback state, query cache, usage snapshots, notification device id, pending handoffs, and queued mutations according to their current ownership rules. Marker migration follow-up tests must cover notification device cleanup.
- Cross-account leakage: usage snapshots and persisted browse/cache data are user-associated. Any future migration must keep environment and user scoping intact, clear stale records on mismatch, and avoid reading one account's records into another account's UI.
- Storefront scan history: saved scan results are identity-keyed and user-visible, with a 100-entry cap and option-level deletion behavior. Any migration must preserve environment prefixing, identity scoping, sorting/trimming, invalid JSON fallback to an empty history, and deletion of an entry when its last extracted option is removed.
- Offline replay: queued writes contain the actual replay payload. Moving the queue out of the dedicated SQLite store is out of scope unless replay payload persistence, retry/backoff state, idempotency keys, and retention cleanup are redesigned together.
- Manual key migration: `expo-sqlite/localStorage/install` does not automatically migrate AsyncStorage keys. Each approved category needs either dual-read/backfill/remove behavior or an intentional stale-marker reset.

## References

- Expo SecureStore: https://docs.expo.dev/versions/latest/sdk/securestore/
- Expo SQLite SQLCipher support: https://docs.expo.dev/versions/latest/sdk/sqlite/#sqlcipher
- Expo SQLite key-value and localStorage APIs: https://docs.expo.dev/versions/latest/sdk/sqlite/#key-value-storage
