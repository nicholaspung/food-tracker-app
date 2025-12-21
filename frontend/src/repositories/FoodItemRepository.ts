import type PocketBase from 'pocketbase';
import type { RecordListOptions } from 'pocketbase';
import { BaseRepository } from './BaseRepository';
import type { FoodItem } from '../lib/pocketbase';
import { COLLECTIONS } from '../constants/collections';

/**
 * Repository for managing food item records
 */
export class FoodItemRepository extends BaseRepository<FoodItem> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.FOOD_ITEMS);
  }

  /**
   * Get all food items for a specific visit
   */
  async getByVisit(visitId: string, options?: RecordListOptions): Promise<FoodItem[]> {
    return await this.getFullList({
      filter: `visit = "${visitId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get all food items created by a specific user
   */
  async getByUser(userId: string, options?: RecordListOptions): Promise<FoodItem[]> {
    return await this.getFullList({
      filter: `user = "${userId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get quick track items (items without a visit)
   */
  async getQuickTrackItems(userId: string, options?: RecordListOptions): Promise<FoodItem[]> {
    return await this.getFullList({
      filter: `user = "${userId}" && isQuickTrack = true`,
      sort: '-itemDate',
      ...options,
    });
  }

  /**
   * Get food items by rating range
   */
  async getByRatingRange(
    minRating: number,
    maxRating: number,
    userId?: string,
    options?: RecordListOptions
  ): Promise<FoodItem[]> {
    const filters: string[] = [`rating >= ${minRating}`, `rating <= ${maxRating}`];

    if (userId) {
      filters.push(`user = "${userId}"`);
    }

    return await this.getFullList({
      filter: filters.join(' && '),
      sort: '-rating',
      ...options,
    });
  }

  /**
   * Search food items by name
   */
  async searchByName(query: string, userId?: string, options?: RecordListOptions): Promise<FoodItem[]> {
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
