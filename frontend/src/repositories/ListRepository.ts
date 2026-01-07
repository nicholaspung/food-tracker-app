import type PocketBase from 'pocketbase';
import type { RecordListOptions } from 'pocketbase';
import { BaseRepository } from './BaseRepository';
import type { RestaurantList, ListItem } from '../lib/pocketbase';
import { COLLECTIONS } from '../constants/collections';

/**
 * Repository for managing restaurant list records
 */
export class RestaurantListRepository extends BaseRepository<RestaurantList> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.RESTAURANT_LISTS);
  }

  /**
   * Get all lists created by a specific user
   */
  async getByUser(userId: string, options?: RecordListOptions): Promise<RestaurantList[]> {
    return await this.getFullList({
      filter: `user = "${userId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get lists by visibility level
   */
  async getByVisibility(
    visibility: 'private' | 'friends' | 'public',
    userId?: string,
    options?: RecordListOptions
  ): Promise<RestaurantList[]> {
    const filters: string[] = [`visibility = "${visibility}"`];

    if (userId) {
      filters.push(`user = "${userId}"`);
    }

    return await this.getFullList({
      filter: filters.join(' && '),
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get collaborative lists
   */
  async getCollaborative(options?: RecordListOptions): Promise<RestaurantList[]> {
    return await this.getFullList({
      filter: 'isCollaborative = true',
      sort: '-created',
      ...options,
    });
  }

  /**
   * Search lists by name
   */
  async searchByName(query: string, userId?: string, options?: RecordListOptions): Promise<RestaurantList[]> {
    const filters: string[] = [`name ~ "${query}"`];

    if (userId) {
      filters.push(`user = "${userId}"`);
    }

    return await this.getFullList({
      filter: filters.join(' && '),
      sort: 'name',
      ...options,
    });
  }

  /**
   * Get public lists from all users (excluding current user's lists)
   */
  async getPublicLists(currentUserId: string, options?: RecordListOptions): Promise<RestaurantList[]> {
    return await this.getFullList({
      filter: `visibility = "public" && user != "${currentUserId}"`,
      sort: '-created',
      expand: 'user',
      ...options,
    });
  }

  /**
   * Get lists from friends (visibility = 'friends' or 'public')
   */
  async getFriendsLists(friendIds: string[], options?: RecordListOptions): Promise<RestaurantList[]> {
    if (friendIds.length === 0) return [];

    const userFilter = friendIds.map(id => `user = "${id}"`).join(' || ');
    const filter = `(${userFilter}) && (visibility = "friends" || visibility = "public")`;

    return await this.getFullList({
      filter,
      sort: '-created',
      expand: 'user',
      ...options,
    });
  }

  /**
   * Get the user's default "Saved" list (isDefault = true)
   */
  async getDefaultList(userId: string): Promise<RestaurantList | null> {
    const lists = await this.getFullList({
      filter: `user = "${userId}" && isDefault = true`,
    });
    return lists.length > 0 ? lists[0] : null;
  }

  /**
   * Create the default "Saved" list for a user.
   * This is idempotent - if a default list already exists, it returns that instead.
   */
  async createDefaultList(userId: string): Promise<RestaurantList> {
    // Always check first to prevent duplicates
    const existingList = await this.getDefaultList(userId);
    if (existingList) {
      return existingList;
    }

    return await this.create({
      name: 'Saved',
      description: 'Items saved from other lists',
      visibility: 'private',
      user: userId,
      isDefault: true,
    });
  }

  /**
   * Get or create the default "Saved" list for a user
   * @deprecated Use createDefaultList instead - it's now idempotent
   */
  async getOrCreateDefaultList(userId: string): Promise<RestaurantList> {
    return await this.createDefaultList(userId);
  }
}

/**
 * Repository for managing list item records
 */
export class ListItemRepository extends BaseRepository<ListItem> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.LIST_ITEMS);
  }

  /**
   * Get all items in a specific list
   */
  async getByList(listId: string, options?: RecordListOptions): Promise<ListItem[]> {
    return await this.getFullList({
      filter: `list = "${listId}"`,
      sort: 'position',
      ...options,
    });
  }

  /**
   * Get items added by a specific user
   */
  async getByUser(userId: string, options?: RecordListOptions): Promise<ListItem[]> {
    return await this.getFullList({
      filter: `addedBy = "${userId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get items for a specific restaurant across all lists
   */
  async getByRestaurant(restaurantId: string, options?: RecordListOptions): Promise<ListItem[]> {
    return await this.getFullList({
      filter: `restaurant = "${restaurantId}"`,
      sort: '-created',
      ...options,
    });
  }
}
