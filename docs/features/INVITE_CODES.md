# Account Invite Codes

An **Account Invite Code** is a server-owned, one-time credential for creating a Yummy Recs account. Successful account creation generates five new Account Invite Codes for the new user. Account creation can instead use a valid **Waitlist Approval Link**; the two paths are separate.

## Canonical language

- **Account Invite Code**: authorizes one successful account creation and is consumed when that account is created.
- **Waitlist Approval Link**: a separate account-access path containing an approved email and one-time **Waitlist Approval Token**. An approved email without the token is insufficient.
- **Tasting Session invite code**: joins an authenticated user to a Tasting Session. It does not grant account access.
- **Friend Code**: identifies an existing authenticated user for a friend request. It does not grant account access.
- **Friend Invite Handoff**: the 24-hour local handoff that lets a newly created account act on its inviter relationship. The implementation still uses `pendingFriendSuggestion` names for compatibility; new product and domain language must not call this a friend suggestion.

Use “invite code” without a qualifier only in nearby UI copy where the account-access context is already unambiguous.

## Access boundary

The `invite_codes` PocketBase collection is admin-only. Its `ListRule`, `ViewRule`, `CreateRule`, `UpdateRule`, and `DeleteRule` are all `nil` in the current production migration. Mobile and other clients must not read or write the collection through `/api/collections/invite_codes/records`.

The supported server-owned interfaces are:

| Interface | Access | Behavior |
| --- | --- | --- |
| `GET /api/invite-codes/inviter/{code}` | Guest/public, rate-limited | Returns only whether an owning inviter exists and, when present, that inviter's id and display name. This best-effort lookup supports the Friend Invite Handoff; it is not authoritative validation that the code remains available. |
| `GET /api/invite-codes` | Authenticated | Lists only unused Account Invite Codes whose `createdBy` matches the authenticated user, including their current sharing-lock state. |
| `POST /api/invite-codes/lock` | Authenticated owner | Verifies the code exists, is unused, and belongs to the caller, then records `locked_until` seven days in the future. Re-sharing extends the window. |
| `POST /api/invite-codes/generate` | Authenticated initial user only | Generates five additional Account Invite Codes. Ordinary users receive their five codes as part of successful account creation and cannot call this endpoint. |

The seven-day sharing lock is a recent-sharing marker, not a redemption lock. A shared code remains redeemable and can be shared again. The Profile screen renders the marker as **Copied recently**; otherwise it renders **Available**.

## Account creation lifecycle

The active account-access enforcement is attached to PocketBase user creation in `backend/main.go` and `backend/signup_security.go`:

1. The request supplies either a non-empty `inviteCode` or the approved email and `waitlistApprovalToken` from a Waitlist Approval Link.
2. For an Account Invite Code, the backend resolves the code case-insensitively and atomically changes `used` from false to true. A concurrent or repeated attempt cannot reserve the same code.
3. For a Waitlist Approval Link, the backend validates and reserves the one-time token instead. It does not reserve an Account Invite Code.
4. If user creation fails, the backend releases whichever reservation it made.
5. After user creation succeeds, an Account Invite Code reservation remains consumed and its `usedBy` relation is finalized with the new user id. A Waitlist Entry is marked signed up on the token-backed path.
6. The backend generates five Account Invite Codes owned by the new user. Codes generated from a `TEST` parent retain the `TEST` prefix.

Failed Account Invite Code and Waitlist Approval Token validations share server-side account-access throttling by client IP. The fifth failed attempt starts a 15-minute lockout; repeated failures increase the lockout exponentially up to 24 hours. PocketBase route limits also bound signup requests and public inviter lookups. Successful validation clears the failed-attempt counter.

## Mobile flows

### Sign Up screen

`apps/mobile/src/screens/SignUpScreen.tsx` presents distinct account-access modes:

- **Have invite code** requires an Account Invite Code and submits it as `inviteCode`.
- A Waitlist Approval Link opens the token-backed mode with the approved email and `waitlistApprovalToken`; the Account Invite Code field is hidden.
- Joining the waitlist is not account creation and does not accept either credential.

Before an Account Invite Code signup, mobile makes a best-effort call to the inviter endpoint. When that lookup returns an inviter and the server creates the user, mobile stores the inviter id, optional display name, and invited user id as a Friend Invite Handoff. It does not persist the invited email. The handoff expires after 24 hours, is bound to the newly created account, and is cleared after acceptance, dismissal, invalid data, account mismatch, or expiry. Failure to look up the inviter does not bypass server validation and does not block otherwise valid account creation.

### Profile screen

`apps/mobile/src/screens/ProfileScreen.tsx` loads unused owned Account Invite Codes through `GET /api/invite-codes`. Selecting **Share Invite** opens the platform share sheet with the app signup deep link, iOS App Store link, and plain-text code. Only a completed share calls the lock endpoint; canceling the share does not change the code.

The Profile screen intentionally does not show consumed codes. Unused codes show **Available** or **Copied recently** based on their seven-day sharing marker. Only the initial user sees **Generate 5 More**.

## Storage

The `invite_codes` collection contains:

- `code`: required unique code, matched case-insensitively by the current lookup index.
- `used`: reservation and consumption state.
- `usedBy`: the account created with the code.
- `createdBy`: the account that owns and can share the code; empty only for a controlled bootstrap code.
- `locked_until`: optional recent-sharing timestamp used by Profile status.

Collection access stays admin-only even though `createdBy` records ownership. Ownership checks belong in the custom endpoints, and reservation belongs in the user-creation hook.

## Controlled bootstrap and verification

Creating a bootstrap Account Invite Code is an administrative operation, not a client API pattern. An administrator may create one `invite_codes` record in the PocketBase Admin UI with a unique code, `used` false, and no `createdBy`. The account that successfully redeems such a code is marked as the initial user and may use the generate endpoint. Do not add a client-readable collection rule or a public seed migration to bootstrap production.

The older migrations that temporarily allowed raw public or owner reads document historical states only. Migration `1760367121_make_invite_codes_admin_only.go` is the current access boundary; rolling it back is not a supported production procedure.

Relevant automated coverage includes:

- `backend/signup_security_test.go` for reservation, release/finalization behavior, waitlist-token account access, duplicate codes, and signup throttling.
- `backend/handlers/invite_code_security_integration_test.go` for inviter lookup disclosure and rate limiting.
- `apps/mobile/src/__tests__/SignUpScreen.test.tsx` for separate Account Invite Code and Waitlist Approval Link modes plus Friend Invite Handoff creation.
- `apps/mobile/src/__tests__/TabRootContentSections.test.tsx` for platform sharing and the post-share lock call.
