/**
 * Centralized TanStack Query key factory
 * All query keys used across the application
 */

// Restaurant query keys
export const restaurantKeys = {
  all: ["restaurants"] as const,
  detail: (id: string) => ["restaurant", id] as const,
};

// Visit query keys
export const visitKeys = {
  all: ["allVisits"] as const,
  byUser: (userId: string) => ["userVisits", userId] as const,
  friendVisits: (userId: string, friendshipCount: number) =>
    ["friendVisits", userId, friendshipCount] as const,
};

// Food item query keys
export const foodItemKeys = {
  all: ["allFoodItems"] as const,
  byVisit: (visitId: string) => ["foodItems", visitId] as const,
  detail: (id: string) => ["foodItem", id] as const,
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

// Photo query keys
export const photoKeys = {
  all: ["allVisitPhotos"] as const,
};

// Friendship query keys
export const friendshipKeys = {
  all: ["friendships"] as const,
  pendingCount: ["pendingFriendRequestsCount"] as const,
};
