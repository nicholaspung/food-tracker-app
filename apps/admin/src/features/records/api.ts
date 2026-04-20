import type { AdminUser } from '@/features/auth/types';
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

function toErrorMessage(error: unknown, fallbackMessage: string) {
  if (typeof error === 'object' && error !== null) {
    const responseData = (error as { response?: { message?: string } }).response;
    if (typeof responseData?.message === 'string' && responseData.message.trim()) {
      return responseData.message;
    }

    if (typeof (error as { message?: string }).message === 'string' && (error as { message?: string }).message?.trim()) {
      return (error as { message: string }).message;
    }
  }

  return fallbackMessage;
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
