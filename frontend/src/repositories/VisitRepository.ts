import type PocketBase from 'pocketbase';
import type { RecordListOptions } from 'pocketbase';
import { BaseRepository } from './BaseRepository';
import type { Visit } from '../lib/pocketbase';
import { COLLECTIONS } from '../constants/collections';

// Note: VisitPhoto type will be added to pocketbase.ts if needed
export interface VisitPhoto {
  id: string;
  visit: string;
  food_item?: string;
  photo: string;
  user: string;
  created: string;
  updated: string;
}

/**
 * Repository for managing visit records
 */
export class VisitRepository extends BaseRepository<Visit> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.VISITS);
  }

  /**
   * Get all visits for a specific user
   */
  async getByUser(userId: string, options?: RecordListOptions): Promise<Visit[]> {
    return await this.getFullList({
      filter: `user = "${userId}"`,
      sort: '-visitDate',
      ...options,
    });
  }

  /**
   * Get all visits for a specific restaurant
   */
  async getByRestaurant(restaurantId: string, options?: RecordListOptions): Promise<Visit[]> {
    return await this.getFullList({
      filter: `restaurant = "${restaurantId}"`,
      sort: '-visitDate',
      ...options,
    });
  }

  /**
   * Get visits visible to friends (for activity feeds)
   */
  async getFriendsVisits(options?: RecordListOptions): Promise<Visit[]> {
    return await this.getFullList({
      filter: `visibility = "friends"`,
      sort: '-visitDate',
      ...options,
    });
  }
}

/**
 * Repository for managing visit photo records
 */
export class VisitPhotoRepository extends BaseRepository<VisitPhoto> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.VISIT_PHOTOS);
  }

  /**
   * Get all photos for a specific visit
   */
  async getByVisit(visitId: string, options?: RecordListOptions): Promise<VisitPhoto[]> {
    return await this.getFullList({
      filter: `visit = "${visitId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get all photos for a specific food item
   */
  async getByFoodItem(foodItemId: string, options?: RecordListOptions): Promise<VisitPhoto[]> {
    return await this.getFullList({
      filter: `food_item = "${foodItemId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get all photos uploaded by a user
   */
  async getByUser(userId: string, options?: RecordListOptions): Promise<VisitPhoto[]> {
    return await this.getFullList({
      filter: `user = "${userId}"`,
      sort: '-created',
      ...options,
    });
  }
}
