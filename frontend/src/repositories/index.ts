/**
 * Repository Layer for PocketBase Collections
 *
 * This module provides a centralized, type-safe interface for accessing PocketBase collections.
 * Instead of using pb.collection() directly throughout the codebase, use these repositories.
 *
 * Benefits:
 * - Centralized data access logic
 * - Type-safe queries with TypeScript
 * - Consistent error handling
 * - Easier testing and mocking
 * - Common query patterns encapsulated in methods
 *
 * @example
 * ```typescript
 * import { repositories } from '@/repositories';
 *
 * // Get all visits for a user
 * const visits = await repositories.visits.getByUser(userId);
 *
 * // Get a single restaurant
 * const restaurant = await repositories.restaurants.getOne(restaurantId);
 *
 * // Create a new food item
 * const foodItem = await repositories.foodItems.create(data);
 * ```
 */

import { pb } from '../lib/pocketbase';
import { VisitRepository, VisitPhotoRepository } from './VisitRepository';
import { RestaurantRepository } from './RestaurantRepository';
import { FoodItemRepository } from './FoodItemRepository';
import { BillRepository, BillParticipantRepository, BillItemRepository, BillReminderRepository } from './BillRepository';
import { MenuItemRepository, MenuImageRepository } from './MenuRepository';
import { FriendshipRepository } from './FriendshipRepository';
import { FeedbackRepository, FeedbackMessageRepository } from './FeedbackRepository';
import { RestaurantListRepository, ListItemRepository } from './ListRepository';
import { UserRepository } from './UserRepository';
import { InviteCodeRepository } from './InviteCodeRepository';
import { NoteRepository, NotePhotoRepository } from './NoteRepository';

/**
 * Singleton repositories for all PocketBase collections.
 * Use these throughout the application instead of direct pb.collection() calls.
 */
export const repositories = {
  // Restaurant & visit tracking
  restaurants: new RestaurantRepository(pb),
  visits: new VisitRepository(pb),
  visitPhotos: new VisitPhotoRepository(pb),
  foodItems: new FoodItemRepository(pb),

  // Menu management
  menuItems: new MenuItemRepository(pb),
  menuImages: new MenuImageRepository(pb),

  // Social features
  friendships: new FriendshipRepository(pb),

  // Bill splitting
  bills: new BillRepository(pb),
  billParticipants: new BillParticipantRepository(pb),
  billItems: new BillItemRepository(pb),
  billReminders: new BillReminderRepository(pb),

  // Lists
  restaurantLists: new RestaurantListRepository(pb),
  listItems: new ListItemRepository(pb),

  // Feedback
  feedback: new FeedbackRepository(pb),
  feedbackMessages: new FeedbackMessageRepository(pb),

  // Users
  users: new UserRepository(pb),
  inviteCodes: new InviteCodeRepository(pb),

  // Notes
  notes: new NoteRepository(pb),
  notePhotos: new NotePhotoRepository(pb),
} as const;

// Export individual repository classes for advanced use cases
export { BaseRepository } from './BaseRepository';
export { VisitRepository, VisitPhotoRepository, type VisitPhoto } from './VisitRepository';
export { RestaurantRepository } from './RestaurantRepository';
export { FoodItemRepository } from './FoodItemRepository';
export { BillRepository, BillParticipantRepository, BillItemRepository, BillReminderRepository } from './BillRepository';
export { MenuItemRepository, MenuImageRepository } from './MenuRepository';
export { FriendshipRepository } from './FriendshipRepository';
export { FeedbackRepository, FeedbackMessageRepository } from './FeedbackRepository';
export { RestaurantListRepository, ListItemRepository } from './ListRepository';
export { UserRepository } from './UserRepository';
export { InviteCodeRepository } from './InviteCodeRepository';
export { NoteRepository, NotePhotoRepository } from './NoteRepository';
