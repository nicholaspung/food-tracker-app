import { pb } from '@/lib/pocketbase';
import { escapeFilterValue, toPocketBaseDateTime } from '@/lib/formatters';
import type { MenuItemRecord, MenuReviewRequest } from '@/lib/types';

export type MenuReviewStatusFilter = 'pending' | 'reviewed' | 'dismissed' | 'all';
export type MenuReviewTimeFilter = 'all_time' | 'last_7_days' | 'last_30_days' | 'last_90_days';

function resolveUpdatedCutoff(filter: MenuReviewTimeFilter) {
  if (filter === 'all_time') {
    return undefined;
  }

  const days = filter === 'last_7_days' ? 7 : filter === 'last_30_days' ? 30 : 90;
  return toPocketBaseDateTime(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

export async function listMenuReviewRequests(
  statusFilter: MenuReviewStatusFilter,
  timeFilter: MenuReviewTimeFilter,
) {
  const filters: string[] = [];

  if (statusFilter !== 'all') {
    filters.push(`status = "${statusFilter}"`);
  }

  if (statusFilter !== 'pending') {
    const cutoff = resolveUpdatedCutoff(timeFilter);

    if (cutoff) {
      filters.push(`updated >= "${cutoff}"`);
    }
  }

  const response = await pb.collection('menu_review_requests').getList<MenuReviewRequest>(1, 50, {
    expand: 'restaurant,requestedBy',
    filter: filters.length > 0 ? filters.join(' && ') : undefined,
    sort: '-updated,-created',
  });

  return response.items;
}

export async function getMenuReviewRequest(requestId: string) {
  return pb.collection('menu_review_requests').getOne<MenuReviewRequest>(requestId, {
    expand: 'restaurant,requestedBy',
  });
}

export async function listRestaurantMenuItems(restaurantId: string) {
  const response = await pb.collection('menu_items').getList<MenuItemRecord>(1, 100, {
    filter: `restaurant = "${escapeFilterValue(restaurantId)}"`,
    sort: 'name',
  });

  return response.items;
}

export async function updateMenuReviewRequest(
  requestId: string,
  payload: {
    adminNotes: string;
    status: 'pending' | 'reviewed' | 'dismissed';
  },
) {
  return pb.collection('menu_review_requests').update<MenuReviewRequest>(requestId, payload);
}

export async function updateMenuItem(
  itemId: string,
  payload: {
    name: string;
    description: string;
    visibility: 'private' | 'friends' | 'public';
  },
) {
  return pb.collection('menu_items').update<MenuItemRecord>(itemId, payload);
}
