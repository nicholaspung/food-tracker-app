import { pb } from '@/lib/pocketbase';
import { toPocketBaseDateTime } from '@/lib/formatters';
import type { FeedbackThread, MenuReviewRequest, PhotoUpload } from '@/lib/types';

async function countRecords(collectionName: string, filter?: string) {
  const result = await pb.collection(collectionName).getList(1, 1, {
    filter,
  });

  return result.totalItems;
}

export interface DashboardSnapshot {
  pendingMenuReviews: number;
  activeFeedbackThreads: number;
  recentPhotoUploads: number;
  totalUsers: number;
  recentMenuReviews: MenuReviewRequest[];
  recentFeedback: FeedbackThread[];
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const lastSevenDays = toPocketBaseDateTime(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  const [
    pendingMenuReviews,
    activeFeedbackThreads,
    recentPhotoUploads,
    totalUsers,
    menuReviewResponse,
    feedbackResponse,
  ] = await Promise.all([
    countRecords('menu_review_requests', 'status = "pending"'),
    countRecords('feedback', '(status = "open" || status = "in_progress")'),
    countRecords('visit_photos', `created >= "${lastSevenDays}"`),
    countRecords('users'),
    pb.collection('menu_review_requests').getList<MenuReviewRequest>(1, 5, {
      expand: 'restaurant,requestedBy',
      sort: '-created',
    }),
    pb.collection('feedback').getList<FeedbackThread>(1, 5, {
      expand: 'user',
      sort: '-updated',
    }),
  ]);

  return {
    pendingMenuReviews,
    activeFeedbackThreads,
    recentPhotoUploads,
    totalUsers,
    recentMenuReviews: menuReviewResponse.items,
    recentFeedback: feedbackResponse.items,
  };
}
