import type PocketBase from 'pocketbase';
import type { RecordListOptions } from 'pocketbase';
import { BaseRepository } from './BaseRepository';
import type { MenuItem, MenuImage } from '../lib/pocketbase';
import { COLLECTIONS } from '../constants/collections';

/**
 * Repository for managing menu item records
 */
export class MenuItemRepository extends BaseRepository<MenuItem> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.MENU_ITEMS);
  }

  /**
   * Get all menu items for a specific restaurant
   */
  async getByRestaurant(restaurantId: string, options?: RecordListOptions): Promise<MenuItem[]> {
    return await this.getFullList({
      filter: `restaurant = "${restaurantId}"`,
      sort: 'name',
      ...options,
    });
  }

  /**
   * Get menu items created by a specific user
   */
  async getByUser(userId: string, options?: RecordListOptions): Promise<MenuItem[]> {
    return await this.getFullList({
      filter: `createdBy = "${userId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get menu items by visibility level
   */
  async getByVisibility(
    visibility: 'private' | 'friends' | 'public',
    restaurantId?: string,
    options?: RecordListOptions
  ): Promise<MenuItem[]> {
    const filters: string[] = [`visibility = "${visibility}"`];

    if (restaurantId) {
      filters.push(`restaurant = "${restaurantId}"`);
    }

    return await this.getFullList({
      filter: filters.join(' && '),
      sort: 'name',
      ...options,
    });
  }

  /**
   * Get OCR-generated menu items
   */
  async getOCRItems(restaurantId?: string, options?: RecordListOptions): Promise<MenuItem[]> {
    const filters: string[] = ['isFromOCR = true'];

    if (restaurantId) {
      filters.push(`restaurant = "${restaurantId}"`);
    }

    return await this.getFullList({
      filter: filters.join(' && '),
      sort: '-created',
      ...options,
    });
  }

  /**
   * Search menu items by name
   */
  async searchByName(query: string, restaurantId?: string, options?: RecordListOptions): Promise<MenuItem[]> {
    const filters: string[] = [`name ~ "${query}"`];

    if (restaurantId) {
      filters.push(`restaurant = "${restaurantId}"`);
    }

    return await this.getFullList({
      filter: filters.join(' && '),
      sort: 'name',
      ...options,
    });
  }
}

/**
 * Repository for managing menu image records
 */
export class MenuImageRepository extends BaseRepository<MenuImage> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.MENU_IMAGES);
  }

  /**
   * Get all menu images for a specific restaurant
   */
  async getByRestaurant(restaurantId: string, options?: RecordListOptions): Promise<MenuImage[]> {
    return await this.getFullList({
      filter: `restaurant = "${restaurantId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get menu images uploaded by a specific user
   */
  async getByUser(userId: string, options?: RecordListOptions): Promise<MenuImage[]> {
    return await this.getFullList({
      filter: `uploadedBy = "${userId}"`,
      sort: '-created',
      ...options,
    });
  }
}
