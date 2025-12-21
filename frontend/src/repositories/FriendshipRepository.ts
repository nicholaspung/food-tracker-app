import type PocketBase from 'pocketbase';
import type { RecordListOptions } from 'pocketbase';
import { BaseRepository } from './BaseRepository';
import type { Friendship } from '../lib/pocketbase';
import { COLLECTIONS } from '../constants/collections';

/**
 * Repository for managing friendship records
 */
export class FriendshipRepository extends BaseRepository<Friendship> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.FRIENDSHIPS);
  }

  /**
   * Get all friendships for a specific user (sent or received)
   */
  async getByUser(userId: string, options?: RecordListOptions): Promise<Friendship[]> {
    return await this.getFullList({
      filter: `user = "${userId}" || friend = "${userId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get friendships by status
   */
  async getByStatus(
    userId: string,
    status: 'pending' | 'accepted' | 'blocked',
    options?: RecordListOptions
  ): Promise<Friendship[]> {
    return await this.getFullList({
      filter: `(user = "${userId}" || friend = "${userId}") && status = "${status}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get accepted friends for a user
   */
  async getAcceptedFriends(userId: string, options?: RecordListOptions): Promise<Friendship[]> {
    return await this.getByStatus(userId, 'accepted', options);
  }

  /**
   * Get pending friend requests sent by a user
   */
  async getPendingSent(userId: string, options?: RecordListOptions): Promise<Friendship[]> {
    return await this.getFullList({
      filter: `user = "${userId}" && status = "pending"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get pending friend requests received by a user
   */
  async getPendingReceived(userId: string, options?: RecordListOptions): Promise<Friendship[]> {
    return await this.getFullList({
      filter: `friend = "${userId}" && status = "pending"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Check if friendship exists between two users
   */
  async existsBetweenUsers(userId1: string, userId2: string): Promise<boolean> {
    try {
      await this.getFirstListItem(
        `(user = "${userId1}" && friend = "${userId2}") || (user = "${userId2}" && friend = "${userId1}")`
      );
      return true;
    } catch {
      return false;
    }
  }
}
