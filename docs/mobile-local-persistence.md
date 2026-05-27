# Mobile Local Persistence

This document records the current mobile local-persistence surfaces and the production policy for how they may store user-associated data.

## Surfaces

| Surface | Storage | Contents | Current privacy treatment |
| --- | --- | --- | --- |
| Auth state | `expo-secure-store` through `SecureStoreAuthStore`; falls back to `AsyncStorage` when SecureStore is unavailable | PocketBase auth token and model snapshot | Native devices use SecureStore where available and migrate legacy AsyncStorage values into SecureStore. The fallback should be treated as plaintext. |
| React Query persistence | `AsyncStorage` key `food_tracker_mobile_query_cache_v5` with environment prefixing | Allowlisted browse queries for Home feed, visits, food products, bills, notes, note photos, friends, restaurant lists, profile, and feedback summary/list data | `queryPersistence` sanitizes persisted notes by removing coordinates and sanitizes feedback browse records by removing `userEmail` and `assignedAdminId`. Offline browse UX intentionally retains user-authored browse fields such as note title/content/location text, profile details, bill fields, friend browse rows, and feedback title/description/status. |
| Offline mutation queue | Native SQLite database `food_tracker_offline_queue.db`; web `localStorage` key `food_tracker_mobile_web_offline_queue_v1` | Replayable mutation rows: method, URL, serialized body, headers, idempotency key, retry state, and errors | Queue bodies are intentionally persisted so offline writes can replay. Current queued payload domains include visits, food products, notes, lists/list items, bills, feedback messages, friend actions, settings/onboarding, and tasting-session actions. Treat queue bodies as plaintext until the policy decision changes storage behavior. |
| Usage snapshots | `AsyncStorage` keys `usage.monthly.snapshot.v1:{userId}:{scope}` | Monthly usage-limit snapshot and `cachedAt` timestamp | Cached for offline/stale account-limit display. Contains usage counters/limits rather than authored content, but the key includes user id and should be treated as user-associated local data. |
| Pending auth redirects | `AsyncStorage` key `pending_auth_redirect_v1` | Shared-list redirect route, share token, and creation timestamp | Retained up to 30 days so auth can continue into a shared-list route. Share token is plaintext local data. |
| Pending friend suggestions | `AsyncStorage` key `pending_friend_suggestion_v1` | Inviter id/display name, invited user id, creation timestamp, and expiry timestamp | Used to complete signup-inviter handoff after signup or app restart. Does not persist the invited user's email and expires after 24 hours. |
| Analytics first-use markers | `AsyncStorage` keys `analytics.product.firstFoodLogged.{identity}` | Boolean marker that a first-food analytics event was already sent for an anonymous or product user key | Prevents duplicate analytics events. Does not store authored content, but the key embeds the analytics identity. |

## Current Privacy Gaps For Policy Follow-Up

- React Query persistence and the offline queue are plaintext on the current platform stores.
- Offline queue replayability requires full mutation bodies, including user-authored visit, note, bill, list, feedback, and friend-action payloads.
- Pending friend suggestions are plaintext AsyncStorage records, but they no longer store the invited user's email and are TTL-bounded.
- Some intentionally retained browse data is personal or user-authored, including note text/location text, profile details, friend browse rows, bill details, and feedback descriptions.

## Production Policy

The app prioritizes cold offline browsing and replayable offline writes for the core mobile experience. Local storage must therefore be minimized and bounded, but not removed in ways that break cached browse screens or outbox replay.

### Surface Rules

| Surface | Policy | Native behavior | Web behavior |
| --- | --- | --- | --- |
| Auth state | Store tokens only in secure platform storage when available. Do not duplicate auth tokens into query cache, offline queue payloads, diagnostics, or analytics. | Required to use `expo-secure-store`; the current AsyncStorage fallback is only a compatibility fallback when the native module is unavailable. Expo documents SecureStore as encrypted local key-value storage, backed by Android Keystore on Android and iOS keychain services on iOS. | No equivalent secure local store is assumed for web. Web auth persistence must be treated as plaintext and should not be expanded without a separate web-auth decision. |
| React Query persistence | Keep the current allowlisted browse-cache model. Persist only queries needed for cold offline browse, sanitize fields that are not required for browse UX, and keep the restore max age at 24 hours unless a future issue explicitly changes the offline contract. Do not persist secrets, raw auth records, precise note coordinates, feedback admin assignees, or feedback user emails. | Plaintext `AsyncStorage` is accepted for this release because the stored data is browse cache, not secrets, and the cache is sanitized, allowlisted, environment-scoped, and time-bounded. | Same policy, but treat browser storage as plaintext and user-clearable. Do not add web-only sensitive projections. |
| Offline mutation queue | Persist the full replay payload required to execute queued user-authored writes. Queue entries must remain idempotent, retry-safe, and diagnosable without exposing raw bodies through support summaries. Add retention cleanup so failed or abandoned queue rows do not persist indefinitely. | Plaintext SQLite is accepted for this release because outbox replay requires full mutation bodies. Expo SQLite supports SQLCipher with a native app build, but this app has not enabled it; adopting it would be a separate migration because it changes native configuration, database opening, key handling, and existing queue migration. | The web queue uses `localStorage` and is plaintext. Web queue payloads should follow the same replay/minimization rules, and web should not be treated as a secure persistence target. |
| Usage snapshots | Continue storing usage counters and limits for offline/stale account-limit display. Keep user id in the key only as needed to avoid cross-account leakage. Add age-based invalidation if the snapshot ever expands beyond counters/limits. | Plaintext AsyncStorage accepted. | Plaintext browser storage accepted. |
| Pending auth redirects | Keep the 30 day TTL and clear after consumption or invalid parse. Do not store more than route, share token, and creation timestamp. | Plaintext AsyncStorage accepted because the value is short lived and required for auth-to-share handoff. | Plaintext browser storage accepted with the same TTL. |
| Pending friend suggestions | Keep the payload email-free and TTL-bounded. Store only inviter id/display name, invited user id, creation timestamp, and expiry timestamp. Clear records after accept/dismiss, invalid parse/shape, account mismatch, or expiry. | Plaintext AsyncStorage accepted for this 24-hour signup handoff. | Plaintext browser storage accepted with the same 24-hour TTL. |
| Analytics first-use markers | Keep marker values non-content. Avoid embedding raw email addresses or authored content in keys. | Plaintext AsyncStorage accepted. | Plaintext browser storage accepted. |

### Rules For New Persistence

- Default to no local persistence for new data unless it supports cold offline browse, replayable offline writes, auth/session continuity, or a small non-content product marker.
- New persisted query keys must be allowlisted in `queryPersistence` and reviewed for projection minimization.
- New user-authored create/update/delete flows in the offline-supported domains must queue replayable payloads through the existing outbox primitives; marker-only queue entries are not enough.
- New support diagnostics may include operation ids, methods, redacted URLs, status, timestamps, retry state, and sanitized error shape. They must not expose serialized queue bodies or auth tokens.
- Any future encryption work must define key storage, migration, failure recovery, and web fallback behavior before changing production storage.

### Rationale

Encrypting the current query cache in SecureStore is not a good fit: SecureStore is intended for key-value secrets and Expo notes large values can be rejected by underlying platform limits. The query cache is larger structured browse data, so the safer current control is allowlisting, sanitization, environment-scoped keys, and 24 hour restore retention.

Encrypting the native queue is possible only as a native SQLite/SQLCipher migration, not as a small JavaScript-only change. Because queued writes must keep replayable bodies, the production policy accepts plaintext queue storage for now while requiring idempotency, sanitization of diagnostics, and follow-up retention cleanup.

The policy deliberately treats web storage as plaintext. Web offline support can preserve behavior, but it must not be used as a reason to persist more sensitive data than native.

## Policy Follow-Ups

- `.scratch/mobile-production-readiness-audit/issues/08-add-mobile-offline-queue-retention-cleanup.md`

## References

- Expo SecureStore: https://docs.expo.dev/versions/latest/sdk/securestore/
- Expo SQLite SQLCipher support: https://docs.expo.dev/versions/latest/sdk/sqlite/#sqlcipher
