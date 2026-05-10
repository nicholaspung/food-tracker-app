# Loops Email Integration

Yummy Recs can use Loops for waitlist contacts, marketing segmentation, and lifecycle events. Waitlist approval emails are currently sent through PocketBase SMTP. The app backend remains the source of truth for signup access.

## Backend Environment

Set these values on the API server:

- `LOOPS_API_KEY`
- `LOOPS_WAITLIST_MAILING_LIST_ID`
When `LOOPS_API_KEY` is absent, backend waitlist and signup state still work, but Loops sync and sends are skipped.

## Loops Contact Properties

Create these custom contact properties in Loops:

- `waitlistStatus`
- `signupSource`
- `appEnvironment`
- `waitlistJoinedAt`
- `approvedAt`
- `accountCreatedAt`

## Mailing Lists

Create this Loops mailing list and copy its ID into the matching env var:

- Waitlist: `LOOPS_WAITLIST_MAILING_LIST_ID`

The backend adds waitlist signups to the Waitlist list when configured.

## Events

Create these Loops events:

- `waitlist_joined`
- `waitlist_approved`
- `waitlist_rejected`
- `account_created`

Future lifecycle events can include:

- `first_visit_created`
- `first_note_created`
- `inactive_7_days`
- `feedback_submitted`

## Waitlist Approval Email

Waitlist approval emails are sent through PocketBase SMTP using the sender configured in PocketBase Mail settings. The approval email sends the user to the app web signup page with `mode=waitlist_approved` so the mobile app opens account creation without an invite code field. Beta emails use `https://beta.app.yummyrecs.com/signup`; production emails use `https://app.yummyrecs.com/signup`. When Universal Links/App Links association files are deployed, the same HTTPS link can open the installed mobile app and falls back to web when the app is unavailable. The backend will allow account creation only for the approved email.

## Local Testing

- Leave `LOOPS_API_KEY` unset to test waitlist and signup logic without external sends.
- Use `@example.com` or `@test.com` addresses when testing Loops transactional sends against a real Loops API key.
- Approve waitlist records from the admin app at `/waitlist`.

## Data Flow

1. Mobile calls `POST /api/waitlist`.
2. Backend upserts `waitlist_entries` and syncs the contact to Loops.
3. Admin approves the entry from `/waitlist`.
4. Backend marks the entry `approved` and sends a PocketBase SMTP approval email.
5. Mobile signup without an invite code succeeds only if the email has an approved waitlist entry.
6. Backend marks the waitlist entry `signed_up`, updates the Loops contact with the user ID, and emits `account_created`.
