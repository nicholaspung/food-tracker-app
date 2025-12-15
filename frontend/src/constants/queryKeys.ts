/**
 * Centralized TanStack Query key factory
 * All query keys used across the application
 *
 * Guidelines:
 * - Use these constants instead of hardcoded strings
 * - Keys follow a hierarchical structure: [entity, ...identifiers, ...filters]
 * - Use `as const` to ensure type safety
 */

// Restaurant query keys
export const restaurantKeys = {
  all: ["restaurants"] as const,
  detail: (id: string) => ["restaurant", id] as const,
  nearby: (latitude: number, longitude: number) => ["restaurants", "nearby", latitude, longitude] as const,
};

// Visit query keys
export const visitKeys = {
  all: ["allVisits"] as const,
  lists: () => ["visits"] as const,
  byUser: (userId: string) => ["userVisits", userId] as const,
  friendVisits: (userId: string, friendshipCount: number) =>
    ["friendVisits", userId, friendshipCount] as const,
  detail: (id: string) => ["visit", id] as const,
};

// Food item query keys
export const foodItemKeys = {
  all: ["allFoodItems"] as const,
  byVisit: (visitId: string) => ["foodItems", visitId] as const,
  detail: (id: string) => ["foodItem", id] as const,
};

// Menu item query keys
export const menuItemKeys = {
  all: ["menu_items", "all"] as const,
  byRestaurant: (restaurantId: string) => ["menu_items", restaurantId] as const,
  detail: (id: string) => ["menu_item", id] as const,
  filtered: (filter?: string) => ["menu_items", "all", filter] as const,
};

// Quick track query keys
export const quickTrackKeys = {
  all: ["quickTrackItems"] as const,
};

// Feedback query keys
export const feedbackKeys = {
  all: ["feedback"] as const,
  detail: (id: string) => ["feedback", id] as const,
  messages: (id: string) => ["feedback_messages", id] as const,
  unreadCount: ["feedbackUnreadCount"] as const,
};

// Visit photo query keys
export const visitPhotoKeys = {
  all: ["allVisitPhotos"] as const,
  byVisit: (visitId: string) => ["visit_photos", visitId] as const,
  byUser: (userId: string, filter?: string) => ["visit_photos", "all", userId, filter] as const,
  detail: (id: string) => ["visit_photo", id] as const,
};

// Friendship query keys
export const friendshipKeys = {
  all: ["friendships"] as const,
  byUser: (userId: string, status?: string) => ["friendships", userId, status] as const,
  detail: (id: string) => ["friendship", id] as const,
  pendingCount: ["pendingFriendRequestsCount"] as const,
};

// Restaurant list query keys
export const restaurantListKeys = {
  all: (userId: string, visibility?: string) => ["restaurant_lists", userId, visibility] as const,
  detail: (id: string) => ["restaurant_list", id] as const,
  items: (listId: string) => ["list_items", listId] as const,
};

// Bill query keys
export const billKeys = {
  all: (userId: string) => ["bills", userId] as const,
  detail: (id: string) => ["bill", id] as const,
  items: (billId: string) => ["bill_items", billId] as const,
  participants: (billId: string) => ["bill_participants", billId] as const,
};

// User query keys
export const userKeys = {
  current: ["currentUser"] as const,
  detail: (id: string) => ["user", id] as const,
  byFriendCode: (code: string) => ["user", "friendCode", code] as const,
};
