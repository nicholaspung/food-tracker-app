import type { AdminUser } from '@/features/auth/types';
import { toErrorMessage } from '@/lib/formatters';
import { pb } from '@/lib/pocketbase';

export type AdminRecordType =
  | 'bill'
  | 'feedback-thread'
  | 'list'
  | 'note'
  | 'photo-upload'
  | 'food-product'
  | 'visit';

export interface AdminRecordTypeCountRow {
  latestRecordAt?: string;
  recordCount: number;
  user: AdminUser | null;
  userId: string;
}

export interface AdminRecordTypeCountsSummary {
  description: string;
  label: string;
  recordType: AdminRecordType;
  rows: AdminRecordTypeCountRow[];
  totalRecords: number;
  usersWithRecords: number;
}

export async function getAdminRecordTypeCounts(
  recordType: AdminRecordType,
): Promise<AdminRecordTypeCountsSummary> {
  try {
    return await pb.send<AdminRecordTypeCountsSummary>('/api/admin/record-counts', {
      query: {
        recordType,
      },
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not load record counts.'));
  }
}
