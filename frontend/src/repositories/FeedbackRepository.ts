import type PocketBase from 'pocketbase';
import type { RecordListOptions } from 'pocketbase';
import { BaseRepository } from './BaseRepository';
import type { Feedback, FeedbackMessage } from '../lib/pocketbase';
import { COLLECTIONS } from '../constants/collections';

/**
 * Repository for managing feedback records
 */
export class FeedbackRepository extends BaseRepository<Feedback> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.FEEDBACK);
  }

  /**
   * Get all feedback created by a specific user
   */
  async getByUser(userId: string, options?: RecordListOptions): Promise<Feedback[]> {
    return await this.getFullList({
      filter: `user = "${userId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get feedback by status
   */
  async getByStatus(
    status: 'open' | 'in_progress' | 'resolved' | 'closed',
    userId?: string,
    options?: RecordListOptions
  ): Promise<Feedback[]> {
    const filters: string[] = [`status = "${status}"`];

    if (userId) {
      filters.push(`user = "${userId}"`);
    }

    return await this.getFullList({
      filter: filters.join(' && '),
      sort: '-last_message_at',
      ...options,
    });
  }

  /**
   * Get feedback with unread messages for user
   */
  async getUnreadForUser(userId: string, options?: RecordListOptions): Promise<Feedback[]> {
    return await this.getFullList({
      filter: `user = "${userId}" && user_unread_count > 0`,
      sort: '-last_message_at',
      ...options,
    });
  }

  /**
   * Get feedback with unread messages for admin
   */
  async getUnreadForAdmin(options?: RecordListOptions): Promise<Feedback[]> {
    return await this.getFullList({
      filter: 'admin_unread_count > 0',
      sort: '-last_message_at',
      ...options,
    });
  }
}

/**
 * Repository for managing feedback message records
 */
export class FeedbackMessageRepository extends BaseRepository<FeedbackMessage> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.FEEDBACK_MESSAGES);
  }

  /**
   * Get all messages for a specific feedback thread
   */
  async getByFeedback(feedbackId: string, options?: RecordListOptions): Promise<FeedbackMessage[]> {
    return await this.getFullList({
      filter: `feedback = "${feedbackId}"`,
      sort: 'created',
      ...options,
    });
  }

  /**
   * Get messages sent by a specific user
   */
  async getByUser(userId: string, options?: RecordListOptions): Promise<FeedbackMessage[]> {
    return await this.getFullList({
      filter: `user = "${userId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get admin messages
   */
  async getAdminMessages(options?: RecordListOptions): Promise<FeedbackMessage[]> {
    return await this.getFullList({
      filter: 'is_admin_message = true',
      sort: '-created',
      ...options,
    });
  }
}
