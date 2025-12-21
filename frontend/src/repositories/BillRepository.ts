import type PocketBase from 'pocketbase';
import type { RecordListOptions } from 'pocketbase';
import { BaseRepository } from './BaseRepository';
import type { Bill, BillParticipant, BillItem, BillReminder } from '../lib/pocketbase';
import { COLLECTIONS } from '../constants/collections';

/**
 * Repository for managing bill records
 */
export class BillRepository extends BaseRepository<Bill> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.BILLS);
  }

  /**
   * Get all bills created by a specific user
   */
  async getByCreator(userId: string, options?: RecordListOptions): Promise<Bill[]> {
    return await this.getFullList({
      filter: `creator_user = "${userId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get bills by status
   */
  async getByStatus(
    status: 'active' | 'settled' | 'cancelled',
    userId?: string,
    options?: RecordListOptions
  ): Promise<Bill[]> {
    const filters: string[] = [`status = "${status}"`];

    if (userId) {
      filters.push(`creator_user = "${userId}"`);
    }

    return await this.getFullList({
      filter: filters.join(' && '),
      sort: '-created',
      ...options,
    });
  }
}

/**
 * Repository for managing bill participant records
 */
export class BillParticipantRepository extends BaseRepository<BillParticipant> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.BILL_PARTICIPANTS);
  }

  /**
   * Get all participants for a specific bill
   */
  async getByBill(billId: string, options?: RecordListOptions): Promise<BillParticipant[]> {
    return await this.getFullList({
      filter: `bill = "${billId}"`,
      ...options,
    });
  }

  /**
   * Get participants by payment status
   */
  async getByPaymentStatus(
    billId: string,
    status: 'pending' | 'paid',
    options?: RecordListOptions
  ): Promise<BillParticipant[]> {
    return await this.getFullList({
      filter: `bill = "${billId}" && paid_status = "${status}"`,
      ...options,
    });
  }
}

/**
 * Repository for managing bill item records
 */
export class BillItemRepository extends BaseRepository<BillItem> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.BILL_ITEMS);
  }

  /**
   * Get all items for a specific bill
   */
  async getByBill(billId: string, options?: RecordListOptions): Promise<BillItem[]> {
    return await this.getFullList({
      filter: `bill = "${billId}"`,
      sort: '-created',
      ...options,
    });
  }
}

/**
 * Repository for managing bill reminder records
 */
export class BillReminderRepository extends BaseRepository<BillReminder> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.BILL_REMINDERS);
  }

  /**
   * Get all reminders for a specific bill
   */
  async getByBill(billId: string, options?: RecordListOptions): Promise<BillReminder[]> {
    return await this.getFullList({
      filter: `bill = "${billId}"`,
      sort: '-sent_at',
      ...options,
    });
  }

  /**
   * Get last reminder for a specific participant
   */
  async getLastForParticipant(billId: string, participantId: string): Promise<BillReminder | null> {
    const result = await this.getList(1, 1, {
      filter: `bill = "${billId}" && participant = "${participantId}"`,
      sort: '-sent_at',
    });

    return result.items.length > 0 ? result.items[0] : null;
  }
}
