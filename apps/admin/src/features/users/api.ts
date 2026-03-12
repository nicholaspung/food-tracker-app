import { pb } from '@/lib/pocketbase';
import { escapeFilterValue } from '@/lib/formatters';
import type { AdminUser } from '@/features/auth/types';
import type { FeedbackThread, FoodItemSummary, NoteSummary, PhotoUpload, VisitSummary } from '@/lib/types';

export async function searchUsers(searchTerm: string) {
  const trimmed = searchTerm.trim();
  const filter =
    trimmed.length > 0
      ? `id ~ "${escapeFilterValue(trimmed)}" || email ~ "${escapeFilterValue(trimmed)}" || name ~ "${escapeFilterValue(trimmed)}"`
      : undefined;

  const response = await pb.collection('users').getList<AdminUser>(1, 25, {
    filter,
    sort: '-created',
  });

  return response.items;
}

export interface UserModerationProfile {
  user: AdminUser;
  recentVisits: VisitSummary[];
  recentFoodItems: FoodItemSummary[];
  recentNotes: NoteSummary[];
  recentFeedback: FeedbackThread[];
  recentPhotos: PhotoUpload[];
}

export async function getUserModerationProfile(userId: string): Promise<UserModerationProfile> {
  const escapedUserId = escapeFilterValue(userId);

  const [user, visits, foodItems, notes, feedback, photos] = await Promise.all([
    pb.collection('users').getOne<AdminUser>(userId),
    pb.collection('visits').getList<VisitSummary>(1, 10, {
      filter: `user = "${escapedUserId}"`,
      expand: 'restaurant',
      sort: '-visitDate,-created',
    }),
    pb.collection('food_items').getList<FoodItemSummary>(1, 10, {
      filter: `user = "${escapedUserId}"`,
      expand: 'visit',
      sort: '-created',
    }),
    pb.collection('notes').getList<NoteSummary>(1, 10, {
      filter: `user = "${escapedUserId}"`,
      expand: 'restaurant',
      sort: '-created',
    }),
    pb.collection('feedback').getList<FeedbackThread>(1, 10, {
      filter: `user = "${escapedUserId}"`,
      sort: '-updated',
    }),
    pb.collection('visit_photos').getList<PhotoUpload>(1, 10, {
      filter: `user = "${escapedUserId}"`,
      expand: 'foodItem',
      sort: '-created',
    }),
  ]);

  return {
    user,
    recentVisits: visits.items,
    recentFoodItems: foodItems.items,
    recentNotes: notes.items,
    recentFeedback: feedback.items,
    recentPhotos: photos.items,
  };
}
