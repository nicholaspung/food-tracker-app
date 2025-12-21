import type PocketBase from 'pocketbase';
import type { RecordListOptions } from 'pocketbase';
import { BaseRepository } from './BaseRepository';
import type { Restaurant } from '../lib/pocketbase';
import { COLLECTIONS } from '../constants/collections';

/**
 * Repository for managing restaurant records
 */
export class RestaurantRepository extends BaseRepository<Restaurant> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.RESTAURANTS);
  }

  /**
   * Get all restaurants created by a specific user
   */
  async getByUser(userId: string, options?: RecordListOptions): Promise<Restaurant[]> {
    return await this.getFullList({
      filter: `createdBy = "${userId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get restaurants by visibility level
   */
  async getByVisibility(
    visibility: 'private' | 'friends' | 'public',
    options?: RecordListOptions
  ): Promise<Restaurant[]> {
    return await this.getFullList({
      filter: `visibility = "${visibility}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get restaurant by Google Place ID
   */
  async getByPlaceId(placeId: string): Promise<Restaurant | null> {
    try {
      return await this.getFirstListItem(`placeId = "${placeId}"`);
    } catch (error) {
      // Return null if not found instead of throwing
      return null;
    }
  }

  /**
   * Search restaurants by name
   */
  async searchByName(query: string, options?: RecordListOptions): Promise<Restaurant[]> {
    return await this.getFullList({
      filter: `name ~ "${query}"`,
      sort: 'name',
      ...options,
    });
  }
}
