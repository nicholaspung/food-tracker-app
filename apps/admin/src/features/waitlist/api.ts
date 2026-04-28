import { pb } from '@/lib/pocketbase';
import type { WaitlistEntry, WaitlistStatus } from '@/lib/types';

interface WaitlistResponse {
  items: WaitlistEntry[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

function toErrorMessage(error: unknown, fallbackMessage: string) {
  if (typeof error === 'object' && error !== null) {
    const responseData = (error as { response?: { message?: string } }).response;
    if (typeof responseData?.message === 'string' && responseData.message.trim()) {
      return responseData.message;
    }

    const message = (error as { message?: string }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallbackMessage;
}

export async function listWaitlistEntries(input: {
  status: WaitlistStatus | 'all';
  search: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    return await pb.send<WaitlistResponse>('/api/admin/waitlist', {
      query: {
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 50,
        search: input.search.trim() || undefined,
        status: input.status === 'all' ? undefined : input.status,
      },
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not load waitlist entries.'));
  }
}

export async function approveWaitlistEntry(entryId: string) {
  try {
    return await pb.send<WaitlistEntry>(`/api/admin/waitlist/${encodeURIComponent(entryId)}/approve`, {
      method: 'POST',
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not approve waitlist entry.'));
  }
}

export async function rejectWaitlistEntry(entryId: string) {
  try {
    return await pb.send<WaitlistEntry>(`/api/admin/waitlist/${encodeURIComponent(entryId)}/reject`, {
      method: 'POST',
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not reject waitlist entry.'));
  }
}
