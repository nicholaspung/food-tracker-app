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
