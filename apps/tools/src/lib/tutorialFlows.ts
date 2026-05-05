export interface TutorialFlowDefinition {
  slug: string;
  title: string;
  section: string;
  navigationHint: string;
  mobileAssetFilename?: string;
  mobileAssetKey?: string;
}

export const TUTORIAL_FLOWS = [
  {
    slug: 'welcome',
    title: 'Welcome to Yummy Recs',
    section: 'Getting Started',
    navigationHint: 'Profile -> Tutorials -> Welcome to Yummy Recs',
  },
  {
    slug: 'month-privacy',
    title: 'Shared with Breathing Room',
    section: 'Getting Started',
    navigationHint: 'Profile -> Tutorials -> Shared with Breathing Room',
  },
  {
    slug: 'tutorials',
    title: 'Watch Feature Tutorials',
    section: 'Getting Started',
    navigationHint: 'Profile -> Tutorials -> Watch Feature Tutorials',
  },
  {
    slug: 'friends',
    title: 'Add Friends Intentionally',
    section: 'Getting Started',
    navigationHint: 'Profile -> Tutorials -> Add Friends Intentionally',
  },
  {
    slug: 'more-tools',
    title: 'More Than Tracking',
    section: 'Getting Started',
    navigationHint: 'Profile -> Tutorials -> More Than Tracking',
  },
  {
    slug: 'lists-intro',
    title: 'Use Lists for Ideas',
    section: 'Getting Started',
    navigationHint: 'Profile -> Tutorials -> Use Lists for Ideas',
  },
  {
    slug: 'bills-tips',
    title: 'Split Bills and Calculate Tips',
    section: 'Getting Started',
    navigationHint: 'Profile -> Tutorials -> Split Bills and Calculate Tips',
  },
  {
    slug: 'settings',
    title: 'Personalize Your Experience',
    section: 'Getting Started',
    navigationHint: 'Profile -> Tutorials -> Personalize Your Experience',
  },
  {
    slug: 'support-invites',
    title: 'Invite Friends and Get Help',
    section: 'Getting Started',
    navigationHint: 'Profile -> Tutorials -> Invite Friends and Get Help',
  },
  {
    slug: 'track-restaurant-visit',
    title: 'Track Restaurant Visit',
    section: 'Add Tutorials',
    navigationHint: 'Profile -> Tutorials -> Track Restaurant Visit',
    mobileAssetFilename: 'track-restaurant-visit.gif',
    mobileAssetKey: 'trackRestaurantVisit',
  },
  {
    slug: 'track-food-product',
    title: 'Track Food Product',
    section: 'Add Tutorials',
    navigationHint: 'Profile -> Tutorials -> Track Food Product',
    mobileAssetFilename: 'track-food-product.gif',
    mobileAssetKey: 'trackFoodProduct',
  },
  {
    slug: 'log-note',
    title: 'Log a Note',
    section: 'Add Tutorials',
    navigationHint: 'Profile -> Tutorials -> Log a Note',
    mobileAssetFilename: 'log-note.gif',
    mobileAssetKey: 'logNote',
  },
  {
    slug: 'process-saved-photos',
    title: 'Process Saved Photos',
    section: 'Add Tutorials',
    navigationHint: 'Profile -> Tutorials -> Process Saved Photos',
    mobileAssetFilename: 'process-saved-photos.gif',
    mobileAssetKey: 'processSavedPhotos',
  },
  {
    slug: 'manage-notes',
    title: 'Manage Notes',
    section: 'Add Tutorials',
    navigationHint: 'Profile -> Tutorials -> Manage Notes',
    mobileAssetFilename: 'manage-notes.gif',
    mobileAssetKey: 'manageNotes',
  },
  {
    slug: 'lists',
    title: 'Restaurant Lists',
    section: 'More Tutorials',
    navigationHint: 'Profile -> Tutorials -> Restaurant Lists',
    mobileAssetFilename: 'lists.gif',
    mobileAssetKey: 'lists',
  },
  {
    slug: 'split-bill',
    title: 'Split a Bill',
    section: 'More Tutorials',
    navigationHint: 'Profile -> Tutorials -> Split a Bill',
    mobileAssetFilename: 'split-bill.gif',
    mobileAssetKey: 'splitBill',
  },
  {
    slug: 'tip-calculator',
    title: 'Tip Calculator',
    section: 'More Tutorials',
    navigationHint: 'Profile -> Tutorials -> Tip Calculator',
    mobileAssetFilename: 'tip-calculator.gif',
    mobileAssetKey: 'tipCalculator',
  },
] as const satisfies TutorialFlowDefinition[];

export function findTutorialFlow(slug: string) {
  return TUTORIAL_FLOWS.find((flow) => flow.slug === slug) || null;
}
