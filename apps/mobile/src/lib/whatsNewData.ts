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
    title: 'Subscription Management & Redesigned Auth Flow',
    summary:
      'A new Billing screen lets you view your plan, compare free vs. subscriber features, and manage your subscription. The entire sign-in, sign-up, and password reset experience has been redesigned with a cleaner layout and smarter step-by-step navigation.',
    features: [
      'New Billing screen: view your plan, compare free vs. subscriber features, and manage your subscription.',
      'In-app purchase support for monthly and yearly subscriptions.',
      'Billing shortcut on Profile with your current plan status shown as a badge.',
      'Redesigned onboarding carousel: swipe through feature highlight cards before signing up.',
      'Invite code field added to sign-up with clearer validation and error messages.',
      'After sign-up you are taken directly to the verification screen with your email pre-filled.',
      'Signing in with an unverified account now redirects automatically to the verification screen.',
      'Upgrade prompt cards appear when free users are close to or have reached their monthly photo or search limit.',
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
