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

Waitlist approval emails are sent through PocketBase SMTP using the sender configured in PocketBase Mail settings. The approval email contains the user's **Waitlist Approval Link**, which sends the user to the app web signup page with the approved email and a one-time **Waitlist Approval Token**. Beta links use `https://beta.app.yummyrecs.com/signup`; production links use `https://app.yummyrecs.com/signup`. When Universal Links/App Links association files are deployed, the same HTTPS link can open the installed mobile app and falls back to web when the app is unavailable.

The backend allows waitlist-backed account creation only when the request includes both the approved email and a valid unused **Waitlist Approval Token**. An approved email address alone is insufficient. The technical route parameters `mode=waitlist_approved` and `waitlistApprovalToken` are implementation aliases for this token-backed **Waitlist Approval Link** flow; they are not canonical product terms.

## Waitlist Join Email

Waitlist join confirmation emails are sent through PocketBase SMTP using the sender configured in PocketBase Mail settings. The confirmation email sends once when an email first joins the waitlist, or when a rejected email rejoins and returns to `pending`. The message confirms that the user is on the waitlist and links to the iOS App Store URL configured by `FOOD_TRACKER_IOS_APP_STORE_URL`.

The backend records `joinedEmailSentAt` after a successful send and `lastJoinedEmailError` after a failed send. Repeated waitlist submissions do not send duplicate confirmations after `joinedEmailSentAt` is set; if a previous send failed and the sent timestamp is still empty, a later submission can retry the confirmation email.

## Local Testing

- Leave `LOOPS_API_KEY` unset to test waitlist and signup logic without external sends.
- Use `@example.com` or `@test.com` addresses when testing Loops transactional sends against a real Loops API key.
- Approve waitlist records from the admin app at `/waitlist`.

## Data Flow

1. Mobile calls `POST /api/waitlist`.
2. Backend upserts `waitlist_entries`.
3. Backend sends the waitlist confirmation email once per first join/rejoin.
4. Backend syncs the contact and `waitlist_joined` event to Loops.
5. Admin approves the entry from `/waitlist`.
6. Backend marks the entry `approved` and sends a PocketBase SMTP approval email with a **Waitlist Approval Link**.
7. Mobile signup without an invite code succeeds only if the request includes the approved email and a valid unused **Waitlist Approval Token** from that link.
8. Backend marks the waitlist entry `signed_up`, updates the Loops contact with the user ID, and emits `account_created`.
