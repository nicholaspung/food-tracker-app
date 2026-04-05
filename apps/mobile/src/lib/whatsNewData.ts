export interface WhatsNewEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
  features: string[];
  improvements: string[];
  fixes: string[];
}

export const WHATS_NEW_ENTRIES: WhatsNewEntry[] = [
  {
    version: '1.0.23',
    date: '2026-04-04',
    title: 'Faster Feed, Smarter Refresh & Bug Fixes',
    summary:
      'The home feed now loads more intelligently — pages are fetched from whichever source has the newest content, keeping your feed smooth and accurate. Feedback threads refresh faster when you have unread messages and slow down automatically when things are quiet. Several reliability and performance improvements are included under the hood.',
    features: [],
    improvements: [
      'Home feed pagination is now smarter: the app fetches more visits or quick tracks based on which source has newer content, reducing unnecessary network requests.',
      'Feedback thread messages now refresh every 3 seconds when you have unread messages or recent activity, and every 30 seconds when the thread is quiet — saving battery and data.',
      'Friends, notes, and feedback counts are now loaded with a single efficient API call instead of fetching a full page of results just to get the count.',
      'Bookmark detection on a friend\'s list now correctly recognises items saved via any food item reference, including recommended and user-created items.',
      'Photo picking in notes and visits now uses a unified, more reliable code path that handles unusual filenames and image formats consistently.',
    ],
    fixes: [
      'Fixed a bug where bookmarks on a friend\'s list could appear unsaved if the item was added through a recommended or user-created food entry.',
    ],
  },
  {
    version: '1.0.22',
    date: '2026-04-04',
    title: 'Privacy Updates & Simplified Quick Track',
    summary:
      'Location fields have been removed from Quick Track and Notes to keep things simple — GPS is now only used when searching for nearby restaurants. The privacy policy has also been updated to be more transparent about how data is handled.',
    features: [],
    improvements: [
      'Location text and GPS capture have been removed from Quick Track forms and Notes. Add notes or a photo for extra context instead.',
      'Privacy policy updated (effective April 4, 2026) with clearer explanations of what data is used by restaurant search, photo processing, and analytics.',
      'Analytics are no longer linked to your signed-in account — usage events are tracked anonymously to understand app reliability and flows.',
    ],
    fixes: [],
  },
  {
    version: '1.0.21',
    date: '2026-04-04',
    title: 'Polish & Under-the-Hood Improvements',
    summary:
      'This release focuses on code quality and visual consistency. Typography has been tightened up across the app, and Quick Track cards on the home feed now fully support the "Under review" badge and report/more-actions menu.',
    features: [],
    improvements: [
      'Typography is now more consistent throughout the app — text sizes, weights, and line heights follow a unified design system.',
      'Quick Track entries on the home feed now correctly show an "Under review" badge when flagged for moderation.',
      'Quick Track entries on the home feed now show the "…" more-actions menu (matching the existing Visit card behaviour).',
    ],
    fixes: [],
  },
  {
    version: '1.0.20',
    date: '2026-04-04',
    title: 'Reliability & Stability Improvements',
    summary:
      'This release includes under-the-hood improvements to make the app more reliable. Login sessions now recover gracefully if the secure storage system is temporarily unavailable.',
    features: [],
    improvements: [
      'Login session storage is now more resilient — if the iOS Keychain is unavailable on startup, the app automatically falls back to a safe alternative so you stay logged in.',
    ],
    fixes: [],
  },
  {
    version: '1.0.19',
    date: '2026-04-04',
    title: 'Infinite Scroll, Stable Friend Codes & Secure Auth',
    summary:
      'The home feed, lists, notes, and friends screens now load more as you scroll — no more waiting for everything to load at once. Friend codes are now permanent 8-character codes that never change. Your login credentials are also now stored in the secure iOS Keychain.',
    features: [
      'Infinite scroll on the home feed — your visits and quick tracks load page by page as you scroll down, so the app stays fast even with a large history.',
      'Infinite scroll on the Lists, Notes, and Friends screens, as well as inside list detail views.',
      'Friend codes are now permanent 8-character codes (e.g. AB3X7KQZ) stored in your account. Your code will stay the same forever — share it once and friends can always use it.',
    ],
    improvements: [
      'Your login session is now stored in the iOS Keychain for better security, instead of plain AsyncStorage.',
      'Previously loaded data is now cached on-device so screens feel instant when you reopen the app.',
      'The "Add to List" screen now searches your visits as you type and loads them page by page.',
    ],
    fixes: [],
  },
  {
    version: '1.0.18',
    date: '2026-04-03',
    title: 'Report Content & Moderation Visibility',
    summary:
      "You can now report visits and quick tracks from friends that violate community guidelines. Content that's been flagged for review will show an \"Under review\" badge so you know it's being looked at.",
    features: [
      'Report a friend\'s visit or quick track directly from the home feed — tap the "…" button and choose a reason (spam, harassment, hateful content, sexual content, violence, privacy issue, or other). You can also add optional notes.',
      'Visits and quick tracks under moderation review now display an "Under review" badge on the home feed.',
    ],
    improvements: [
      'Quick Track location is now a simple text field — type a place name or address. GPS coordinate capture has been removed.',
    ],
    fixes: [],
  },
  {
    version: '1.0.17',
    date: '2026-04-02',
    title: 'App Store Submission Ready',
    summary:
      'No visible changes in this release — the app has been given its official bundle identifier and is now configured for App Store and Google Play submission.',
    features: [],
    improvements: [
      'App bundle identifier updated to the official com.yummyrecs.mobile across iOS and Android.',
    ],
    fixes: [],
  },
  {
    version: '1.0.16',
    date: '2026-04-02',
    title: 'Under-the-Hood Build Improvements',
    summary:
      'No visible changes this release — just internal build infrastructure improvements to keep the app reliable and easier to maintain.',
    features: [],
    improvements: [
      'Refactored the iOS build script into a dedicated file for easier maintenance.',
    ],
    fixes: [],
  },
  {
    version: '1.0.15',
    date: '2026-04-01',
    title: 'Richer Quick Track Review & Shared Form Experience',
    summary:
      'The Quick Track review step in the photo scanning flow now shows the same rich card you see on your home feed. GPS location capture is also now available when logging a quick track from a photo, and the form is consistent across all entry points.',
    features: [
      'GPS location capture is now available in the photo scanning Quick Track flow — tap "Use My Location" to auto-fill your coordinates, just like on the main Quick Track screen.',
    ],
    improvements: [
      'Quick Track review cards in the photo scan flow now display the same rich home feed card style, with photo thumbnail, category chip, rating, notes, and entry timestamp.',
      'Navigating between photos in the photo processing step now scrolls back to the top and dismisses the keyboard automatically.',
    ],
    fixes: [],
  },
  {
    version: '1.0.14',
    date: '2026-03-31',
    title: 'Richer Photo Scan Review & App Store Compliance',
    summary:
      'The review step in the photo scanning flow now shows the same rich visit card you see on your home feed — complete with photo thumbnails you can tap to view full-screen, per-item ratings, and timestamps from the original photo date.',
    features: [],
    improvements: [
      'Photo scan review cards now display photo thumbnails for each menu item, matching the home feed card style.',
      'Tap any photo thumbnail in the review step to open a full-screen photo viewer before submitting.',
      'Review cards now show the date and time derived from the photo\'s capture date rather than just the local date.',
    ],
    fixes: [],
  },
  {
    version: '1.0.13',
    date: '2026-03-30',
    title: 'Photo Processing Restaurant Search & Menu Item Picker',
    summary:
      'The photo scanning flow now lets you search for restaurants and pick existing menu items — the same experience you get when logging a visit manually. Auto-detected photo dates also show a clearer hint across all entry screens.',
    features: [
      'Restaurant search in the photo processing flow: search nearby or by name, use your current location, or pick from your saved restaurants — just like the visit wizard.',
      'Existing menu item picker in the photo processing flow: choose a menu item already on file instead of always typing a new one.',
      'Menu item descriptions are now visible when selecting items during visit creation.',
    ],
    improvements: [
      'Auto-detected date from photo metadata now shows a helper note ("Auto-set from photo date. You can still change it.") on Quick Track and photo processing screens.',
      'Removing a photo on the Quick Track screen now correctly clears the auto-detected date.',
      'Rating guide on the Edit Quick Track screen no longer remembers its expanded/collapsed state between sessions.',
    ],
    fixes: [],
  },
  {
    version: '1.0.12',
    date: '2026-03-29',
    title: 'Quick Track & Notes E2E Test Coverage',
    summary:
      'Behind-the-scenes testing improvements. No user-facing changes.',
    features: [],
    improvements: [
      'New add-quick-track-review Maestro E2E flow covers the quick track entry screen, rating guide toggle, and all rating selections end-to-end.',
      'New notes-review Maestro E2E flow covers the notes list, create/edit note screens, tab filters (Used / All), and delete confirmation.',
      'testID props added to the Quick Track screen and its rating selector buttons for reliable E2E targeting.',
      'testID added to the delete-note confirmation modal for reliable E2E targeting.',
      'Screenshot suite updated to include the two new flows in the full "all" run and interactive selector.',
    ],
    fixes: [],
  },
  {
    version: '1.0.11',
    date: '2026-03-29',
    title: 'Beta Feed, Richer Feed Cards & Menu Item UX',
    summary:
      'Admin users can now preview a new Beta feed on the Home screen — a combined, chronological view of your own and friends\' activity with rich card layouts, photo carousels, and inline actions. Menu item selection in the visit wizard also got a cleaner, more tappable layout.',
    features: [
      'Beta feed tab on the Home screen (admin only): a unified chronological view of your own and friends\' visits and quick tracks, sorted newest-first with infinite scroll pagination.',
      'Rich Beta feed cards: each visit card shows a swipeable photo carousel, per-item rating bands, and inline share / edit / delete actions. Quick track cards show the photo, category chip, notes, and rating at a glance.',
    ],
    improvements: [
      'Menu item rows in the visit creation wizard now separate the main tap area from the select and edit buttons, making it easier to tap the right target — especially on small screens.',
      'Edit button on menu items now meets the 44 pt minimum tap target and exposes a clear accessibility label for screen readers.',
      'Confirmation modals can now display custom content below the description, enabling richer delete confirmations in future flows.',
      'Admin dashboard gains a Record Counts page for monitoring collection sizes.',
      'New add-visit-review Maestro E2E flow added to cover the visit creation wizard end-to-end.',
      'testID props added to restaurant search results, menu item select/edit buttons, home feed mode tabs, and rating selector buttons for more reliable E2E tests.',
    ],
    fixes: [],
  },
  {
    version: '1.0.10',
    date: '2026-03-25',
    title: 'Monorepo Build & CI Reliability Improvements',
    summary:
      'Behind-the-scenes build tooling and CI improvements. No user-facing changes.',
    features: [],
    improvements: [
      'Metro bundler now resolves React and React Native to their actual installed locations rather than hardcoded paths, preventing duplicate-module errors in complex monorepo layouts.',
      'Root-level app.config.js and metro.config.js added so Expo and Metro tooling work correctly when invoked from the workspace root.',
      'Root package.json gains a main field pointing to the mobile entry point for consistent workspace resolution.',
      'CI workflow lint and typecheck steps now use workspace-root scripts (mobile:lint, mobile:typecheck) instead of relying on a per-step working-directory override, making the pipeline easier to extend.',
      'EAS update and build steps now explicitly cd into apps/mobile before running, ensuring EAS CLI picks up the correct project configuration regardless of where the workflow step starts.',
    ],
    fixes: [],
  },
  {
    version: '1.0.9',
    date: '2026-03-25',
    title: 'iOS Native Project & Build Configuration',
    summary:
      'Behind-the-scenes infrastructure update. No user-facing changes.',
    features: [],
    improvements: [
      'iOS native project (YummyRecs.xcodeproj) added to source control, enabling reproducible native builds without requiring a local prebuild step.',
      'Root-level Expo and TypeScript configuration files added for consistent tooling across the monorepo.',
    ],
    fixes: [],
  },
  {
    version: '1.0.8',
    date: '2026-03-24',
    title: 'Keyboard Handling Overhaul & E2E Test Coverage',
    summary:
      'Keyboard behaviour is now smoother and more consistent across the entire app. Form action buttons stay visible at all times, and on Android the screen pans up with the keyboard instead of resizing.',
    features: [],
    improvements: [
      'Switched to react-native-keyboard-controller throughout the app for more reliable, animation-friendly keyboard handling.',
      'Form action buttons (Save, Create, etc.) are now always visible — they no longer disappear when the keyboard opens.',
      'On Android the screen pans up when the keyboard appears instead of shrinking the layout, matching the behaviour already familiar to iOS users.',
      'Feedback chat scroll-to-latest now reacts to keyboard state changes via a reactive hook rather than one-time event listeners, so it works correctly across all keyboard interactions.',
      'Numeric inputs (bill amounts, tip fields, etc.) now suppress autofill and password managers, preventing unwanted suggestions on these fields.',
      'Tab bar no longer hides when the keyboard opens — keyboard-aware scrolling handles the overlap instead.',
      'testID props added to bill (name, total, item name/price, tax, fees, tip, final price, split amounts), add-restaurant note, create/edit list (name, description), lists search, and tip calculator segmented control for automated E2E tests.',
    ],
    fixes: [],
  },
  {
    version: '1.0.7',
    date: '2026-03-20',
    title: 'Smoother Keyboard Handling & E2E Flow Refactor',
    summary:
      'Typing in feedback and sign-up screens is now smoother — the bottom tab bar no longer jumps when the keyboard appears, and the feedback chat automatically scrolls to keep new messages visible.',
    features: [],
    improvements: [
      'Bottom tab bar stays in place when the keyboard opens — it fades out and becomes non-interactive instead of unmounting, so the rest of the screen no longer shifts up and down.',
      'On iOS the tab bar responds to keyboard appearance earlier (keyboardWillShow/Hide instead of keyboardDidShow/Hide), eliminating the brief layout jump when the keyboard animates in.',
      'Feedback chat automatically scrolls to the latest message when the keyboard opens, so the compose area stays in view.',
      'Feedback chat supports interactive keyboard dismissal — swipe down through the message list to dismiss the keyboard on iOS.',
      'testID props added to sign-up (name, email, invite code, password, confirm password), forgot-password (email), create-feedback (subject, message), and feedback-detail (message) inputs for automated E2E tests.',
      'E2E screenshot suite split into focused flows: sign-in-review, profile-review, and sign-out-review replace the single core-review flow, and lists-review now starts from the already-authenticated state.',
      'Screenshot suite script gains environment normalization and auto-loading of app-env defaults so runs against beta or production environments require fewer manual overrides.',
    ],
    fixes: [],
  },
  {
    version: '1.0.6',
    date: '2026-03-19',
    title: 'Accessibility & E2E Test Coverage Improvements',
    summary:
      'Behind-the-scenes accessibility and developer tooling improvements. No user-facing changes.',
    features: [],
    improvements: [
      'Segmented controls (e.g. Bills filter, Friends tabs) now correctly report their selected state to screen readers, and fall back to the visible label when no custom accessibility label is set.',
      'Modal action buttons (confirm and cancel) now expose accessibility labels and test identifiers, making confirmation dialogs more reliable for assistive technology and automated tests.',
      'New friends-review Maestro flow covers 6 screens end-to-end: Friends tab, Requests, Sent, My Code sub-tabs, Add Friend screen, and QR Scanner.',
      'E2E tap targets in the lists flow now use stable testID selectors instead of button text, reducing flakiness when label text changes.',
    ],
    fixes: [],
  },
  {
    version: '1.0.5',
    date: '2026-03-18',
    title: 'Add Friend Screen, Richer Quick Track Editing & Default List Visibility',
    summary:
      'Adding friends now has its own dedicated screen. Quick Track editing gets a full upgrade with category, date, location, and visibility fields. Settings gains a new Default List Visibility preference. Deleting visits and quick tracks now shows a confirmation dialog.',
    features: [
      'New Add Friend screen: enter a friend code or scan a QR code from a dedicated flow, accessible via an "Add Friend" button in the Friends header.',
      'Quick Track edit screen now includes category, date, GPS location capture, and visibility (private or friends) — all the fields available when creating a new quick track.',
      'Default List Visibility setting in Settings lets you choose whether new restaurant lists default to private or friends-visible.',
    ],
    improvements: [
      'Deleting a visit or quick track from the home feed now shows a confirmation dialog instead of a native alert, matching the style used elsewhere in the app.',
      'Removing a friend now shows a confirmation dialog before removing them from your list.',
      'QR Scanner screen shows your own friend code at the top so you can share it while scanning.',
      'Numeric inputs on iOS now show an inline "Done" button to dismiss the keyboard without switching to a different field.',
      '"Add Friend" tab removed from the Friends segmented control — use the new Add Friend button in the header instead.',
    ],
    fixes: [],
  },
  {
    version: '1.0.4',
    date: '2026-03-18',
    title: 'Safer List Item Deletion & Bills E2E Coverage',
    summary:
      'Removing an item from a restaurant list now asks for confirmation before deleting, so you can no longer accidentally remove a rating with a single tap.',
    features: [],
    improvements: [
      'Removing a bookmarked item or rating from a restaurant list now shows a confirmation dialog before deleting — tap "Delete Item" to confirm or "Keep Item" to cancel.',
      'Form cards on the Create and Edit Restaurant List screens now use the default card style for a cleaner look.',
      'Segmented control labels now wrap and center correctly when text is long.',
    ],
    fixes: [],
  },
  {
    version: '1.0.3',
    date: '2026-03-17',
    title: 'Improved Visit Editing & Menu Item Simplification',
    summary:
      'Editing a visit now uses the full step-by-step wizard — change the restaurant, items, ratings, date, and visibility all in one place. Menu item descriptions have been removed to keep things clean.',
    features: [],
    improvements: [
      'Edit Visit now opens the full Create Visit wizard pre-filled with your existing visit data, so you can update the restaurant, menu items, ratings, date, and visibility in one guided flow.',
      'Visit visibility (private or friends) can now be changed when editing an existing visit.',
      'Menu item descriptions have been removed — item cards in the visit creation flow are now cleaner and easier to scan.',
      'Menu item selection now matches by name as well as ID, so items added manually or via OCR are de-duplicated correctly.',
    ],
    fixes: [],
  },
  {
    version: '1.0.2',
    date: '2026-03-17',
    title: 'Expanded E2E Test Coverage & Screenshot Review Improvements',
    summary:
      'Behind-the-scenes developer tooling improvements. No user-facing changes.',
    features: [],
    improvements: [
      'New core-review Maestro flow covers 19 screens end-to-end: onboarding, sign-up, login, forgot password, home, profile (including account details, invite codes, edit name, delete account), settings, what\'s new, about, terms of service, privacy policy, feedback list, create feedback, and feedback detail.',
      'Screenshot review server now tracks expected screenshots from the flow file and flags regressions when expected screenshots are missing from a run.',
      'Run metadata (run.json) is written alongside each screenshot run so the review server knows which flow was used and what screenshots were expected.',
      'Screenshot review UI gains deletion support — runs can be removed directly from the review interface.',
      'Images in the run detail view are now ordered by the flow\'s expected capture sequence, with unexpected extras listed after.',
      'Each image card in the review UI now indicates whether the screenshot was expected, missing, or unexpected.',
      'testID props added to back buttons (AuthTopBar, ScreenHeader), OptionListInlineBody, StaticContentSectionsScreen, and additional interactive elements across About, FeedbackDetail, FeedbackScreen, ForgotPassword, Login, Onboarding, PrivacyPolicy, Profile, Settings, SignUp, and TermsOfService screens.',
      'mobile:screenshots npm script updated to use the new core-review flow; redundant mobile:screenshots:login script removed.',
    ],
    fixes: [],
  },
  {
    version: '1.0.1',
    date: '2026-03-16',
    title: 'Screenshot & E2E Test Infrastructure',
    summary:
      'Behind-the-scenes developer tooling improvements. No user-facing changes.',
    features: [],
    improvements: [
      'Screenshot review mode added — the app can now run with a pre-seeded auth session so UI screenshots can be captured without a live backend.',
      'New Maestro E2E flow for onboarding, login, and home screen screenshot capture, with a local review server for inspecting results.',
      'testID props added to all main screens, tab navigation buttons, login form inputs, and primary action buttons to support automated UI tests.',
      'New npm scripts: mobile:start:screenshot-review, mobile:ios:screenshot-review, mobile:screenshots, and mobile:screenshots:review.',
      'E2E artifacts and local env files added to .gitignore.',
    ],
    fixes: [],
  },
  {
    version: '1.0.0',
    date: '2026-03-16',
    title: 'Feedback Redesign & Lists Privacy Update',
    summary:
      'Submitting feedback now has its own dedicated screen with a cleaner form. Restaurant lists no longer support a public visibility option — lists can be private or shared with friends only. The About screen also shows OTA update status inline.',
    features: [
      'Feedback submission moved to a dedicated New Feedback screen, accessible via a "New" button on the Feedback list. The form includes subject and message fields with offline support.',
    ],
    improvements: [
      'Feedback thread detail screen now shows the thread title in the header instead of the generic "Feedback" label.',
      'Admin reply messages in feedback threads now show the sender\'s name or email as a badge instead of a plain "Admin" label.',
      'Message timestamps in feedback threads now display as relative time ("2 hours ago") instead of an absolute date.',
      'Restaurant lists can now only be private or shared with friends — the public visibility option has been removed.',
      'The "Public" tab on the Lists screen has been removed; only My Lists and Friends tabs remain.',
      'Settings no longer shows a public visibility option for default restaurant visibility.',
      'Version row on the About screen now shows OTA update availability inline — tap to expand and see build details or apply a pending update.',
      'OTA update check now runs automatically when you open the About screen, so you see update status without tapping a button first.',
      'About screen descriptions for Terms of Service and Privacy Policy updated to reflect current document content.',
    ],
    fixes: [],
  },
  {
    version: '0.9.9',
    date: '2026-03-16',
    title: 'Dev Tooling & Build Script Improvements',
    summary:
      'Behind-the-scenes developer tooling improvements. No user-facing changes.',
    features: [],
    improvements: [
      'Marketing site dev server replaced with a Node.js script using browser-sync and chokidar — source changes now trigger an automatic rebuild and browser reload without restarting the server.',
      'Dev script cleanup handler now runs only once and handles HUP signals, preventing double-cleanup on exit.',
      'Service log output correctly separates stdout and stderr so each stream is independently prefixed and routed.',
      'Process tree termination handles empty child arrays safely, fixing a potential crash on cleanup.',
    ],
    fixes: [],
  },
  {
    version: '0.9.8',
    date: '2026-03-13',
    title: 'Admin Moderation System & Audit Logging',
    summary:
      'Behind-the-scenes trust & safety and admin tooling improvements. No user-facing changes in the mobile or web app.',
    features: [],
    improvements: [
      'Admin dashboard now includes a full content moderation queue — admins can claim, review, hide, remove, escalate, or restore visits, quick tracks, photos, and lists.',
      'Admin feedback inbox now supports claim/release ownership so threads are handled by one admin at a time, with a 24-hour reply deadline that extends automatically when you send a new message.',
      'Admins can reply directly to feedback threads from the web dashboard.',
      'Audit log trail records all admin actions (create, update, delete, view) across every collection, with before/after snapshots and actor attribution.',
      'User detail page in the admin dashboard now shows tabbed views of a user\'s ratings, restaurants, menu items, visits, notes, photos, lists, and bills.',
      'New migrations add moderation fields to users and content collections, and create a dedicated moderation cases collection.',
    ],
    fixes: [],
  },
  {
    version: '0.9.7',
    date: '2026-03-13',
    title: 'Admin Tools Move to Web & Account Updates',
    summary:
      'Admin features have moved to a dedicated web dashboard. The app now shows a Beta membership badge, renames "Free Account" to "Standard Account", and tightens feedback privacy so you only see your own threads.',
    features: [],
    improvements: [
      'Admin tools (user management, menu review moderation, feedback inbox) have moved to a dedicated web admin app — the Admin Features section has been removed from the mobile app.',
      'Profile Membership section now shows a "Beta" badge if your account has beta access.',
      '"Free Account" label renamed to "Standard Account" for clarity.',
      'Feedback screen now only ever shows your own submitted threads — no cross-user visibility.',
      'Web version of the app now updates the browser tab title as you navigate between screens.',
    ],
    fixes: [],
  },
  {
    version: '0.9.6',
    date: '2026-03-12',
    title: 'Subscription & Billing Simplification',
    summary:
      'The in-app billing screen has been removed. Subscriber status is still recognized and unlocks higher usage limits — account upgrades are now handled outside the app.',
    features: [],
    improvements: [
      'Upgrade prompt cards on Visit, Quick Track, and Photo Processing screens now show a clear note that subscriber accounts have higher limits, without prompting you to navigate to a billing screen.',
      'Privacy Policy and Terms of Service updated to remove references to payment processing.',
    ],
    fixes: [],
  },
  {
    version: '0.9.5',
    date: '2026-03-12',
    title: 'Deployment Smoke Test Improvements',
    summary:
      'Behind-the-scenes deployment reliability improvements. No user-facing changes.',
    features: [],
    improvements: [
      'Deployment smoke tests now separately check whether a site is reachable and whether it is serving a valid HTML page, giving clearer error messages when something goes wrong.',
    ],
    fixes: [],
  },
  {
    version: '0.9.4',
    date: '2026-03-12',
    title: 'Marketing Site Build Cleanup',
    summary:
      'Behind-the-scenes infrastructure update. No user-facing changes.',
    features: [],
    improvements: [
      'Marketing site build output moved from the temporary dev-dist folder to a stable dist folder, making the production build artefacts consistent with the rest of the project.',
      'gitignore updated to track the marketing dist folder while ignoring dev and verify build directories.',
    ],
    fixes: [],
  },
  {
    version: '0.9.3',
    date: '2026-03-12',
    title: 'Marketing Site & Build Config Cleanup',
    summary:
      'Behind-the-scenes infrastructure update. No user-facing changes.',
    features: [],
    improvements: [
      'New marketing website added for Yummy Recs (landing page, privacy, terms, and contact pages).',
      'Admin build config simplified — explicit React alias pinning and optimizeDeps overrides removed now that they are no longer needed.',
    ],
    fixes: [],
  },
  {
    version: '0.9.2',
    date: '2026-03-12',
    title: 'Deployment Build Fix',
    summary:
      'Behind-the-scenes deployment fix. No user-facing changes.',
    features: [],
    improvements: [
      'Deploy script now uses explicit pnpm workspace filters when building the admin and web surfaces, making builds more reliable across different pnpm configurations.',
    ],
    fixes: [],
  },
  {
    version: '0.9.1',
    date: '2026-03-12',
    title: 'Deployment Reliability Improvements',
    summary:
      'Behind-the-scenes deployment improvements. No user-facing changes.',
    features: [],
    improvements: [
      'Deploy script sudo handling is now more resilient — passwordless and password-based sudo are tried automatically, with clearer error messages when neither is available.',
      'Pre-flight checks no longer require sudo access upfront, so deployments start faster on restricted servers.',
      'Secrets directory creation falls back to sudo automatically instead of failing with a manual fix instruction.',
      'VPS SSH helper script is now marked executable out of the box.',
    ],
    fixes: [],
  },
  {
    version: '0.9.0',
    date: '2026-03-12',
    title: 'Deployment Reliability & Mobile Entry Point Fix',
    summary:
      'Behind-the-scenes deployment and infrastructure improvements. No user-facing changes.',
    features: [],
    improvements: [
      'Deploy script now supports password-based sudo via a SUDO_PASSWORD secret, so CI deployments work on servers without passwordless sudo configured.',
      'Sudo calls throughout the deploy script use a unified run_sudo helper, making the script more consistent and easier to maintain.',
      'Sudoers rules now cover Caddyfile copy and secrets directory management, so no manual VPS setup is needed for these operations.',
      'Mobile app entry point updated to an explicit index.js so Expo resolves the root component more reliably.',
    ],
    fixes: [],
  },
  {
    version: '0.8.9',
    date: '2026-03-12',
    title: 'Deployment & CI Reliability Improvements',
    summary:
      'Behind-the-scenes deployment and CI reliability improvements. No user-facing changes.',
    features: [],
    improvements: [
      'Caddy config validation now uses the explicit caddyfile adapter flag, preventing silent parse failures on some server configurations.',
      'Caddy validation errors are now written to the deploy log and shown in the terminal, making misconfigured Caddyfiles easier to diagnose.',
      'Mobile CI workflow sets up pnpm before Node.js so the package manager cache is always available during dependency installation.',
    ],
    fixes: [],
  },
  {
    version: '0.8.8',
    date: '2026-03-12',
    title: 'Deployment Infrastructure Improvements',
    summary:
      'Behind-the-scenes deployment reliability improvements. No user-facing changes.',
    features: [],
    improvements: [
      'Deploy script now automatically syncs the Caddy web server config when environment domains are missing, instead of failing with a manual fix instruction.',
    ],
    fixes: [],
  },
  {
    version: '0.8.7',
    date: '2026-03-12',
    title: 'Offline Support on Web',
    summary:
      'Actions you take while offline on the web version of the app are now queued and synced automatically when your connection is restored, matching the offline behaviour already available on mobile.',
    features: [],
    improvements: [
      'Offline mutation queue now works in the browser using local storage, so visits, quick tracks, and other actions are saved and retried when you reconnect.',
    ],
    fixes: [],
  },
  {
    version: '0.8.6',
    date: '2026-03-11',
    title: 'Smarter Photo Date Detection',
    summary:
      "Photo date detection is now more accurate, catching a wider range of EXIF formats and falling back to your device's media library when needed.",
    features: [],
    improvements: [
      'Photo date extraction handles more EXIF timestamp formats, including timezone-aware values and numeric timestamps from older cameras.',
      'When EXIF data is missing, photo date falls back to your device media library for a more reliable auto-fill.',
      'New app.yummyrecs.com and beta.app.yummyrecs.com deep link domains supported.',
    ],
    fixes: [],
  },
  {
    version: '0.8.5',
    date: '2026-03-07',
    title: 'Code Quality & Component Refactoring',
    summary:
      'Behind-the-scenes improvements to keep the app consistent and maintainable. No user-facing changes.',
    features: [],
    improvements: [
      'Auth screens share a single AuthIntroCard component for the icon-and-heading layout.',
      'Pressable option cards across Add, Photo Processing, and Photo Source screens now use a shared IconActionCard.',
      'Titled card sections in Settings, Admin, and About screens use a shared SectionCard.',
      'Privacy Policy and Terms of Service screens simplified with a shared StaticContentSectionsScreen.',
      'Date formatting utilities centralised into one module instead of being duplicated across multiple screens.',
      'Typography scale expanded with display, section, card, eyebrow, and meta tokens for consistency.',
      'TabBrandHeader accepts a titleVariant prop so screens can pick the right scale without inline overrides.',
      'PhotoViewerModal colours sourced from the theme system via getPhotoViewerPalette.',
    ],
    fixes: [],
  },
  {
    version: '0.8.4',
    date: '2026-03-07',
    title: 'Photo Date Auto-Fill, Bill Final Price & About Screen',
    summary:
      'Attaching a photo to a visit or quick track item now automatically fills in the date from the photo\u2019s capture time. Bill splitting gets a new optional Final Price field so you can enter the exact receipt total and have the difference spread automatically. A new About screen shows the current app version and links to legal pages.',
    features: [
      'Photo date auto-fill: the visit or quick-track date is set automatically from the capture time when you attach a photo.',
      'Final Price field in custom bill splits: enter the actual receipt total and the difference from the calculated amount is spread across participants.',
      'New About screen: view the app version, application ID, and navigate to Terms of Service and Privacy Policy.',
    ],
    improvements: [
      'Profile screen shows the current app version next to the About row.',
      'Rating 4 label updated from \u2018Eat occasionally\u2019 to \u2018Would get again\u2019.',
      'Quick track location on the home feed now shows a location icon and formats GPS coordinates cleanly.',
      'Location permission blocked error now includes an Open Settings button.',
      'Form footer buttons hide when the keyboard is open to maximise typing space.',
      'Keyboard scroll re-adjusts when the keyboard frame changes, keeping the active input visible.',
    ],
    fixes: [],
  },
  {
    version: '0.8.3',
    date: '2026-03-07',
    title: 'Smarter Keyboard Handling & Quick Track Photo Viewer',
    summary:
      'Tapping anywhere outside a text field now dismisses the keyboard, and inputs automatically scroll into view when focused so the keyboard never covers what you\'re typing. The Quick Track photo preview is now larger and tappable to view full screen. Loading states across the app are also more consistent with spinner indicators.',
    features: [
      'Tap anywhere outside a text field to dismiss the keyboard across all screens.',
      'Inputs automatically scroll into view when focused — the keyboard no longer covers what you\'re typing.',
      'Quick Track photo preview is now larger and tappable to view full screen.',
    ],
    improvements: [
      'Remove photo button in Quick Track is now a compact icon overlay on the photo instead of a separate button.',
      'Restaurant and menu item lists show a spinner while loading instead of plain text.',
      'Restaurant search button shows a loading spinner while searching.',
      'Share screen shows a spinner while food photos are loading.',
      'Sync queue shows a spinner while loading pending writes.',
    ],
    fixes: [],
  },
  {
    version: '0.8.2',
    date: '2026-03-07',
    title: 'OTA Updates & Smarter Sign-In Errors',
    summary:
      'The app now supports over-the-air (OTA) updates — apply the latest version without reinstalling from the App Store. A new update card on the Home and Login screens shows your current build details and lets you pull the latest update with one tap. Sign-in errors also now include detailed diagnostics to pinpoint connection and credential issues faster.',
    features: [
      'OTA update card on Home screen: see your current build version, channel, runtime, and OTA identifier, and apply the latest update with one tap.',
      'Build status card on Login screen: verify which OTA is running before troubleshooting sign-in problems.',
    ],
    improvements: [
      'Sign-in errors now show detailed diagnostics — backend URL, HTTP status, and specific messages for invalid credentials, unreachable servers, and backend failures.',
      'CI/CD workflow automatically publishes OTA updates or triggers a full preview build when mobile code changes.',
      'Preview CI job now validates the Expo token before running, with a clear error if the GitHub environment secret is misconfigured.',
    ],
    fixes: [],
  },
  {
    version: '0.8.1',
    date: '2026-03-05',
    title: 'Build Configuration Updates',
    summary:
      'Behind-the-scenes build and infrastructure configuration updates. No user-facing changes.',
    features: [],
    improvements: [
      'EAS build environments updated to use dedicated subdomains for API, web, and admin services.',
      'Beta and production build configs now include web and admin URLs for consistent environment setup.',
    ],
    fixes: [],
  },
  {
    version: '0.8.0',
    date: '2026-02-25',
    title: 'Real Menu Scanning & Security Hardening',
    summary:
      'Menu scanning in Photo Processing now extracts actual item names from your photos using AI — no more placeholder names. Usage limits are tracked server-side for accuracy, and backend security improvements prevent unauthorized profile changes.',
    features: [
      'Menu scanning now reads real item names from your photo: upload a menu and the AI extracts the actual dishes listed.',
      'Usage limits are now recorded by the server during the scan action, so counts are always accurate.',
    ],
    improvements: [
      'Deploy script only triggers rollback after deploy mutations have been applied, avoiding unnecessary rollbacks on early failures.',
    ],
    fixes: [],
  },
  {
    version: '0.7.9',
    date: '2026-02-25',
    title: 'Deployment & Infrastructure Improvements',
    summary:
      'Behind-the-scenes deployment reliability improvements. No user-facing changes.',
    features: [],
    improvements: [
      'Deploy script validates the target domain in Caddy config before starting, preventing deploys to unconfigured environments.',
      'Health checks and smoke tests resolve the domain to localhost, so they work before external DNS propagates.',
    ],
    fixes: [],
  },
  {
    version: '0.7.8',
    date: '2026-02-22',
    title: 'Auto-Friend on Sign-Up & Smarter Photo Processing',
    summary:
      'New users are now automatically prompted to add the person who invited them as a friend. In Photo Processing, restaurants are ranked by proximity to where your photo was taken, and a new button lets you fill in the date straight from photo metadata.',
    features: [
      'Auto-friend suggestion: after signing up with an invite code, a prompt on your home screen lets you add your inviter as a friend with one tap.',
      'Invite via link: invite codes can be shared as deep links that open the app directly to sign-up with the code pre-filled.',
      'Proximity-ranked restaurants in Photo Processing: the restaurant list is sorted by distance from your photo\u2019s GPS location.',
      'Use Photo Date button: one tap fills in the visit or quick-track date from your photo\u2019s metadata.',
      'Location metadata hint: a notice confirms when GPS data from your photo is being used to rank restaurants.',
    ],
    improvements: [
      'First onboarding card now shows the Yummy Recs brand logo.',
      'Invite code sharing includes a deep link so recipients can tap to open sign-up directly.',
      'Locked invite codes are highlighted in amber on the Profile screen.',
      'Sign-up now checks that your password is at least 8 characters before submitting.',
      'Invite codes are now case-insensitive.',
    ],
    fixes: [
      'Fixed new users not receiving the default \u2018friends\u2019 visibility setting on sign-up.',
    ],
  },
  {
    version: '0.7.7',
    date: '2026-02-22',
    title: 'Usage Limits & Redesigned Auth Flow',
    summary:
      'Free and subscriber usage tiers are now surfaced more clearly throughout the app, and the entire sign-in, sign-up, and password reset experience has been redesigned with a cleaner layout and smarter step-by-step navigation.',
    features: [
      'Usage limit prompt cards appear when free users are close to or have reached their monthly photo or search limit.',
      'Profile shows your current account tier status.',
      'Redesigned onboarding carousel: swipe through feature highlight cards before signing up.',
      'Invite code field added to sign-up with clearer validation and error messages.',
      'After sign-up you are taken directly to the verification screen with your email pre-filled.',
      'Signing in with an unverified account now redirects automatically to the verification screen.',
    ],
    improvements: [
      'All auth screens use a consistent card layout with icons and back navigation.',
      'Forgot password flow navigates directly to reset password after sending the email.',
      'Login screen accepts a pre-filled email when navigating from other screens.',
    ],
    fixes: [],
  },
  {
    version: '0.7.6',
    date: '2026-02-21',
    title: 'Analytics & Code Quality Improvements',
    summary:
      'Behind-the-scenes improvements to help us understand how the app is used and catch issues faster. No user-facing changes.',
    features: [],
    improvements: [
      'Usage analytics added throughout the app to guide future improvements.',
      'App lifecycle and session events tracked for better reliability insights.',
      'Offline sync operations now monitored for queue health and failure rates.',
      'Consistent confirmation dialogs for destructive actions across the app.',
      'Offline alert messages unified across all screens.',
      'Typography and spacing made more consistent on the Home screen.',
    ],
    fixes: [],
  },
  {
    version: '0.7.5',
    date: '2026-02-21',
    title: 'Usage Limits for Free Users',
    summary:
      'Free users now have monthly limits on photo uploads, restaurant searches, and menu scans, with live estimates and clear warnings before you reach a limit. Subscribers and admins are unaffected.',
    features: [
      'Free users can upload up to 5 photos per month across visits, quick tracks, and photo processing.',
      'Free users have monthly caps on Google Places restaurant searches (text and GPS nearby).',
      'Free users have a monthly cap on AI menu photo scans.',
      'Live photo estimate shown on Visit, Quick Track, and Photo Processing screens.',
      'Search buttons show remaining searches when running low (e.g. "Search (3 left)").',
      'Clear error messages when a limit is reached, including your remaining allowance.',
    ],
    improvements: [
      'All limits are enforced server-side — they apply even if the app is bypassed.',
      'Admin role preview includes usage data for free and subscriber tiers.',
      'Usage cache loads immediately on launch so estimates are available offline.',
      'Usage counters refresh automatically after each search, scan, or photo submission.',
      'Offline notice shown when usage estimate may be stale.',
    ],
    fixes: [],
  },
  {
    version: '0.7.4',
    date: '2026-02-21',
    title: 'Full Offline Support & Smarter Error Recovery',
    summary:
      'All key actions now work offline — visits, quick tracks, notes, bills, lists, and friend requests are queued and sync automatically when you reconnect. Core screens also keep showing your saved data when a refresh fails.',
    features: [
      'Create and edit visits, quick tracks, and notes while offline.',
      'Create, edit, and manage bills offline.',
      'Create and update restaurant lists offline.',
      'Send friend requests via QR code or friend code without internet.',
      'Submit feedback messages offline.',
    ],
    improvements: [
      'Home, Notes, Lists, Bills, Friends, and Feedback screens now show cached data on refresh failure.',
      'Food item photos visible in list detail view with owner attribution in the photo viewer.',
      'Menu item editing shows an offline notice and is disabled until reconnected.',
      'Online-only actions are clearly labeled and disabled when offline.',
    ],
    fixes: [],
  },
  {
    version: '0.7.3',
    date: '2026-02-20',
    title: 'Richer Restaurant Lists & Admin Role Preview',
    summary:
      'Restaurant lists now group food items by restaurant with ratings, support custom ordering, and let you save dishes from friends\u2019 lists. Admins can preview the app as a regular or non-subscriber user.',
    features: [
      'Dedicated screens for creating and editing restaurant lists.',
      'Food items grouped by restaurant with ratings and visit dates.',
      'Reorder restaurants in your list with up/down controls.',
      'Save a dish from a friend\u2019s list to one or more of your own lists.',
      'Quick-save to your default Saved list with one tap.',
      'Admin role preview: toggle \u2018view as non-admin\u2019 or \u2018view as non-subscriber\u2019.',
    ],
    improvements: [
      'List item counts now show separate restaurant and menu item totals.',
      'Source user attribution shown for dishes bookmarked from friends\u2019 lists.',
      'Cuisine type displayed in list detail view.',
      'Rating pill provides consistent colored rating display across lists.',
      'GPS location button reused consistently across screens.',
    ],
    fixes: [],
  },
  {
    version: '0.7.2',
    date: '2026-02-18',
    title: 'Visit Creation Wizard & Photo Sharing Themes',
    summary:
      'A guided step-by-step flow for creating visits, GPS restaurant search, per-dish photos, and four new photo sharing themes.',
    features: [
      'Step-by-step visit wizard: Restaurant → Items → Rate & Save.',
      'Google Places search: Find restaurants by name, type, or location.',
      'GPS nearby search: Discover food places near you.',
      'Attach photos to individual dishes during the rating step.',
      'Four sharing themes: Modern, Rustic, Minimal, and Neon.',
      'Add or edit menu items directly from the visit creation flow.',
    ],
    improvements: [
      'Set visit date and visibility during the rating step.',
      'Rating legend shown while rating dishes.',
      'Selected menu items pinned to the top of the list.',
      'Restaurant list shows your visit count and friends who have been there.',
    ],
    fixes: [],
  },
  {
    version: '0.7.1',
    date: '2026-02-11',
    title: 'Tip Calculator and UI Improvements',
    summary:
      'Quickly calculate tips with presets or a custom amount, plus cleaner feedback pages for easier reading.',
    features: [
      'New Tip Calculator with preset percentages and custom tip input.',
      'Tip slider support for fine control over percentage.',
      'Live totals update as tip values change.',
    ],
    improvements: [
      'Feedback list is more compact and easier to scan.',
      'Feedback chat uses space more efficiently.',
      'Bill creation layout avoids overlap with bottom navigation.',
    ],
    fixes: [],
  },
  {
    version: '0.7.0',
    date: '2026-02-11',
    title: 'Group Tasting Sessions (Beta)',
    summary:
      'Admins can create collaborative tasting sessions with invite codes, shared item lists, and group results.',
    features: [
      'Create and join tasting sessions with invite codes.',
      'Collaborative item list and independent participant ratings.',
      'Leader-controlled session phases with revealed group results at completion.',
    ],
    improvements: [
      'Session details refresh frequently for near real-time updates.',
      'Invite code flow is streamlined for session sharing.',
      'Progress indicators make rating completion clearer.',
    ],
    fixes: [],
  },
  {
    version: '0.6.9',
    date: '2026-01-25',
    title: 'Bill Splitter Enhancements',
    summary:
      'Itemized bill splitting now supports advanced split options and improved management after creation.',
    features: [
      'Assign bill items directly to participants.',
      'Use percentage-based or exact-amount splits for each item.',
      'Edit itemized bills after creation.',
    ],
    improvements: [
      'Bill Splitter is now available to all users.',
      'Bills have dedicated navigation and clearer organization.',
      'Settled bills view includes all bills you joined.',
    ],
    fixes: [],
  },
];

export const LATEST_WHATS_NEW_VERSION = WHATS_NEW_ENTRIES[0]?.version ?? '0.0.0';
