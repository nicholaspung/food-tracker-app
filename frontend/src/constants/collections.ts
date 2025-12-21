/**
 * PocketBase collection name constants
 *
 * Centralized collection names to prevent typos and enable safe refactoring.
 * Always use these constants instead of hardcoded strings when accessing collections.
 *
 * @example
 * ```typescript
 * // Good
 * pb.collection(COLLECTIONS.VISITS).create(data)
 *
 * // Bad
 * pb.collection(COLLECTIONS.VISITS).create(data)
 * ```
 */
export const COLLECTIONS = {
  // User management
  USERS: 'users',
  FRIENDSHIPS: 'friendships',

  // Restaurant & menu data
  RESTAURANTS: 'restaurants',
  MENU_ITEMS: 'menu_items',
  MENU_IMAGES: 'menu_images',

  // Visits & food tracking
  VISITS: 'visits',
  FOOD_ITEMS: 'food_items',
  VISIT_PHOTOS: 'visit_photos',

  // Lists
  RESTAURANT_LISTS: 'restaurant_lists',
  LIST_ITEMS: 'list_items',

  // Bill splitting
  BILLS: 'bills',
  BILL_PARTICIPANTS: 'bill_participants',
  BILL_ITEMS: 'bill_items',
  BILL_REMINDERS: 'bill_reminders',
  BILL_INVITES: 'bill_invites',

  // User feedback
  FEEDBACK: 'feedback',
  FEEDBACK_MESSAGES: 'feedback_messages',
} as const;

/**
 * Type-safe collection names
 */
export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];
