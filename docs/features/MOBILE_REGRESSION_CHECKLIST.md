# Mobile Regression Checklist

This checklist is intended to help review the React Native app for screen regressions while gradually introducing automated coverage.

## How to use this

- Treat each checkbox as a user-visible contract.
- Mark `Manual` first if the flow is not automated yet.
- Add the test level you want beside each item when coverage exists: `Unit`, `Screen`, or `E2E`.
- Start with all `P0` items before broadening into `P1` and `P2`.

## Priority guide

- `P0`: Core auth, logging, feed, note, social, and account flows that are most likely to break user journeys.
- `P1`: Important secondary flows and edge cases that should be covered after the core path is stable.
- `P2`: Admin-only or lower-frequency flows.

## Auth

- [ ] `P0` Onboarding opens and allows navigation to sign up or log in.
- [ ] `P0` Sign up succeeds with valid name, email, invite code, and password.
- [ ] `P0` Sign up shows validation errors for missing required fields.
- [ ] `P0` Sign up rejects mismatched passwords.
- [ ] `P0` Sign up rejects invalid or used invite codes.
- [ ] `P0` Verify email succeeds with a valid token.
- [ ] `P1` Verify email can auto-sign the user in after successful verification.
- [ ] `P1` Verify email can be canceled back to onboarding.
- [ ] `P0` Log in succeeds with valid credentials.
- [ ] `P0` Log in routes unverified users to email verification.
- [ ] `P0` Forgot password requests a reset email.
- [ ] `P0` Reset password succeeds with valid token and matching passwords.
- [ ] `P0` Sign out returns the user to the signed-out experience.

## Home Feed

- [ ] `P0` Home feed loads with cached or fetched data.
- [ ] `P0` Home feed shows a non-blocking refresh error when cached data exists.
- [ ] `P0` Home feed switches between `mine` and `friends`.
- [ ] `P0` Home feed search filters visible entries.
- [ ] `P0` Home feed type filter changes visible entries.
- [ ] `P1` Month groups can expand and collapse.
- [ ] `P1` Day groups can expand and collapse.
- [ ] `P1` Visit photos open in the photo viewer.
- [ ] `P0` A visit can be opened for editing from Home.
- [ ] `P0` A visit can be deleted from Home.
- [ ] `P0` A quick track can be opened for editing from Home.
- [ ] `P0` A quick track can be deleted from Home.
- [ ] `P1` A single dish photo can be shared from Home.
- [ ] `P1` A multi-item visit can be sent to share customization.
- [ ] `P1` A pending friend suggestion can be accepted from Home.
- [ ] `P1` A pending friend suggestion can be dismissed from Home.

## Add Entry Hub

- [ ] `P0` Add screen opens and shows all primary entry options.
- [ ] `P0` Add screen navigates to create visit.
- [ ] `P0` Add screen navigates to quick track.
- [ ] `P0` Add screen navigates to note editor.
- [ ] `P0` Add screen navigates to photo processing.
- [ ] `P1` Add screen navigates to notes management.

## Visits

- [ ] `P0` Create visit requires a selected restaurant.
- [ ] `P0` Create visit requires at least one item.
- [ ] `P0` Create visit validates ratings and visit date.
- [ ] `P0` Create visit succeeds online.
- [ ] `P0` Create visit queues successfully offline.
- [ ] `P1` Create visit can attach item descriptions and notes.
- [ ] `P1` Create visit can attach item photos.
- [ ] `P1` Create visit respects visit visibility defaults and selection.
- [ ] `P1` Create visit supports preselected restaurant/menu item inputs from other flows.
- [ ] `P1` Create visit links back to a bookmarked list item when launched from `I went there`.
- [ ] `P1` Create visit enforces photo upload limits for free users.
- [ ] `P1` Create visit can submit a menu review request.
- [ ] `P1` Create visit can open add-restaurant flow.
- [ ] `P1` Create visit can open add-menu-item flow.
- [ ] `P1` Create visit can open edit-menu-item flow.
- [ ] `P0` Edit visit saves updated restaurant name, item ratings, and notes.
- [ ] `P0` Edit visit queues successfully offline.

## Quick Track

- [ ] `P0` Quick track requires item name and valid date.
- [ ] `P0` Quick track succeeds online.
- [ ] `P0` Quick track queues successfully offline.
- [ ] `P1` Quick track supports category, notes, location, and visibility.
- [ ] `P1` Quick track can attach a photo from camera.
- [ ] `P1` Quick track can attach a photo from photo library.
- [ ] `P1` Quick track can capture current location.
- [ ] `P1` Quick track can be created from a source note.
- [ ] `P1` Quick track enforces photo upload limits for free users.
- [ ] `P0` Edit quick track saves updated values.
- [ ] `P0` Edit quick track queues successfully offline.

## Photo Processing

- [ ] `P1` Photo processing accepts multiple photos from the user.
- [ ] `P1` Photo processing supports restaurant visit mode.
- [ ] `P1` Photo processing supports quick track mode.
- [ ] `P1` Photo processing creates visit entries online.
- [ ] `P1` Photo processing queues visit entries offline.
- [ ] `P1` Photo processing creates quick tracks online.
- [ ] `P1` Photo processing queues quick tracks offline.
- [ ] `P1` Photo processing can create menu items when needed.
- [ ] `P1` Photo processing enforces photo upload limits for free users.

## Notes

- [ ] `P0` Notes screen loads with cached or fetched data.
- [ ] `P1` Notes screen supports `unused`, `used`, and `all` filters.
- [ ] `P1` Note photos open in the photo viewer.
- [ ] `P0` Note editor requires content.
- [ ] `P0` Note creation succeeds online.
- [ ] `P0` Note creation queues successfully offline.
- [ ] `P0` Note editing succeeds online.
- [ ] `P0` Note editing queues successfully offline.
- [ ] `P1` Note editor can add photos from camera.
- [ ] `P1` Note editor can add photos from library.
- [ ] `P1` Note editor can remove pending and existing photos.
- [ ] `P1` Note editor can capture current location.
- [ ] `P0` Note deletion succeeds online.
- [ ] `P0` Note deletion queues successfully offline.
- [ ] `P1` A note can launch quick track creation.

## Friends

- [ ] `P0` Friends screen loads accepted, incoming, and sent friend states.
- [ ] `P1` A user can copy their friend code.
- [ ] `P1` A user can view their QR code invite payload.
- [ ] `P0` A user can send a friend request by typed code.
- [ ] `P0` Sending a friend request queues successfully offline.
- [ ] `P0` A user can accept an incoming friend request.
- [ ] `P0` Accepting a request queues successfully offline.
- [ ] `P0` A user can reject an incoming friend request.
- [ ] `P0` Rejecting a request queues successfully offline.
- [ ] `P0` A user can cancel a sent request.
- [ ] `P0` Canceling a request queues successfully offline.
- [ ] `P0` A user can remove an existing friend.
- [ ] `P0` Removing a friend queues successfully offline.
- [ ] `P1` QR scanner can request camera permission.
- [ ] `P1` QR scanner can detect a valid invite code.
- [ ] `P1` QR scanner handles invalid QR payloads.
- [ ] `P1` QR scanner can submit a friend request from a scanned code.

## Lists

- [ ] `P0` Lists screen loads `my`, `friends`, and `public` tabs.
- [ ] `P1` Lists screen search filters visible lists.
- [ ] `P1` Default saved list is created when needed.
- [ ] `P0` Create list succeeds online.
- [ ] `P0` Create list queues successfully offline.
- [ ] `P0` Edit list succeeds online.
- [ ] `P0` Edit list queues successfully offline.
- [ ] `P0` Delete list succeeds online.
- [ ] `P0` Delete list queues successfully offline.
- [ ] `P1` Default saved list cannot be deleted.
- [ ] `P0` Add restaurant to list succeeds online.
- [ ] `P0` Add restaurant to list queues successfully offline.
- [ ] `P1` Restaurants in a list can be reordered.
- [ ] `P1` Reordering queues successfully offline.
- [ ] `P1` Source ratings can be removed from a list item.
- [ ] `P1` User ratings can be removed from a list item.
- [ ] `P1` A bookmarked item can be saved into selected lists.
- [ ] `P1` Bookmark save queues successfully offline.
- [ ] `P1` A bookmarked item can be quick-saved into the default saved list.
- [ ] `P0` `I went there` launches visit creation with the right prefilled data.

## Bills And Tip Calculator

- [ ] `P0` Bills screen loads with filter tabs.
- [ ] `P1` Bills filter switches between `all`, `you owe`, `you're owed`, and `settled`.
- [ ] `P0` Create bill succeeds online.
- [ ] `P0` Create bill queues successfully offline.
- [ ] `P0` Edit bill succeeds online.
- [ ] `P0` Edit bill queues successfully offline.
- [ ] `P0` Bill detail can toggle bill status.
- [ ] `P0` Bill status toggle queues successfully offline.
- [ ] `P0` Bill detail can toggle participant paid status.
- [ ] `P0` Participant paid toggle queues successfully offline.
- [ ] `P0` Bill deletion succeeds online.
- [ ] `P0` Bill deletion queues successfully offline.
- [ ] `P1` Tip calculator updates correctly for supported split modes.

## Profile, Settings, About

- [ ] `P0` Profile screen loads core account data.
- [ ] `P0` Account name can be edited and saved.
- [ ] `P1` Invite codes can be fetched.
- [ ] `P1` Invite codes can be generated.
- [ ] `P1` Invite codes can be shared.
- [ ] `P0` Settings screen loads saved defaults.
- [ ] `P0` Default visit visibility can be changed and saved.
- [ ] `P0` Default restaurant visibility can be changed and saved.
- [ ] `P1` About screen opens legal pages.
- [ ] `P1` Account deletion succeeds and signs the user out.

## Feedback

- [ ] `P0` Feedback submission requires subject and message.
- [ ] `P0` Feedback submission succeeds online.
- [ ] `P0` Feedback submission queues successfully offline.
- [ ] `P1` Feedback history loads and opens thread detail.
- [ ] `P0` Feedback detail can send a message online.
- [ ] `P0` Feedback detail message send queues successfully offline.
- [ ] `P1` Admin feedback view can filter by status.
- [ ] `P1` Admin feedback view can filter by time range.
- [ ] `P1` Admin can update feedback status online.
- [ ] `P1` Admin feedback status update is blocked offline with clear messaging.

## Admin

- [ ] `P2` Admin features screen is blocked for non-admin users.
- [ ] `P2` Admin can elevate a user to subscriber.
- [ ] `P2` Admin elevation is blocked offline with clear messaging.
- [ ] `P2` Admin can toggle role preview modes.
- [ ] `P2` Admin menu review list loads pending requests.
- [ ] `P2` Admin can open a review detail.
- [ ] `P2` Admin can edit menu item name, description, and visibility from review detail.
- [ ] `P2` Admin can delete a menu item from review detail.
- [ ] `P2` Admin can approve or dismiss a review request with admin notes.

## Group Tastings

- [ ] `P2` Tasting sessions screen loads active and completed sessions.
- [ ] `P2` Admin can create a tasting session.
- [ ] `P2` Admin can join a tasting session by invite code.
- [ ] `P2` Tasting session detail loads current session state.
- [ ] `P2` Admin can regenerate tasting invite code.
- [ ] `P2` Admin can share tasting invite code.
- [ ] `P2` Admin can add tasting items.
- [ ] `P2` Admin can delete tasting items.
- [ ] `P2` Admin can submit tasting ratings and notes.
- [ ] `P2` Admin can advance session status.
- [ ] `P2` Admin can save completed tasting results to visit history.

## Cross-Cutting Checks

- [ ] `P0` All async screens show loading states.
- [ ] `P0` All async screens show empty states where applicable.
- [ ] `P0` All async screens show blocking and refresh-error states correctly.
- [ ] `P0` Offline-capable mutations queue instead of failing silently.
- [ ] `P0` Cached data remains visible on supported browse screens when refresh fails offline.
- [ ] `P0` Online-only actions are clearly disabled or messaged while offline.
- [ ] `P0` Query invalidation refreshes the relevant list/detail views after mutation.
- [ ] `P1` Bottom-tab navigation still routes correctly after feature changes.
- [ ] `P1` Deep-linked auth flows still land on the correct screen.
- [ ] `P1` Camera, photo-library, and location permission denial paths show actionable messaging.
- [ ] `P1` Free-tier usage limits show the correct warning or blocking state.
- [ ] `P1` Rating UI still uses the canonical rating labels and colors.

## Suggested Automation Order

- [ ] Phase 1: Auth smoke coverage.
- [ ] Phase 1: Create visit happy path and validation coverage.
- [ ] Phase 1: Quick track happy path and validation coverage.
- [ ] Phase 1: Notes create/edit/delete coverage.
- [ ] Phase 1: Friends request/accept coverage.
- [ ] Phase 1: Lists create/edit/save-to-list coverage.
- [ ] Phase 1: Bills create/detail toggle coverage.
- [ ] Phase 1: Feedback create/thread-message coverage.
- [ ] Phase 2: Offline queue coverage for all `P0` mutations.
- [ ] Phase 2: Permission-denied and free-tier limit coverage.
- [ ] Phase 2: Share flows and photo-processing flows.
- [ ] Phase 3: Admin and tasting-session coverage.
