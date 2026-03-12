import { pb } from '@/lib/pocketbase';
import type { FeedbackThread } from '@/lib/types';

export type FeedbackStatusFilter = 'active' | 'resolved' | 'closed' | 'all';

export async function listFeedbackThreads(statusFilter: FeedbackStatusFilter) {
  const filter =
    statusFilter === 'active'
      ? '(status = "open" || status = "in_progress")'
      : statusFilter === 'all'
        ? undefined
        : `status = "${statusFilter}"`;

  const response = await pb.collection('feedback').getList<FeedbackThread>(1, 50, {
    expand: 'user',
    filter,
    sort: '-last_message_at,-updated',
  });

  return response.items;
}
