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
