import { QueryClient } from '@tanstack/react-query';

import {
  billsQueryKeys,
  getCachedBillDetail,
  getCachedBillListSummary,
  isBillDetailQueryKey,
  isBillsListQueryKey,
} from '../features/store/billsQuery';
import {
  isRestaurantMenuItemsQueryKey,
  menuItemsQueryKeys,
  restaurantOrderedItemsQueryKeys,
} from '../features/store/menuItemsQuery';
import {
  getCachedTastingSessionDetail,
  isTastingSessionDetailQueryKey,
  isTastingSessionsListQueryKey,
  tastingSessionsQueryKeys,
} from '../features/store/tastingSessionsQuery';
import { restaurantsQueryKeys } from '../features/store/restaurantsQuery';

describe('mobile feature query keys', () => {
  it('defines stable bills query keys and cache lookup helpers', () => {
    const queryClient = new QueryClient();
    const billDetail = {
      id: 'bill_1',
      title: 'Dinner',
      createdByUserId: 'user_1',
      currency: 'USD',
      subtotal: 10,
      tax: 1,
      tip: 2,
      fees: 0,
      total: 13,
      items: [],
      participants: [],
      splitMode: 'equal',
      extrasSplitMode: 'equal',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as const;

    queryClient.setQueryData(billsQueryKeys.root, [
      {
        id: 'bill_1',
        title: 'Dinner',
        status: 'active',
        participantCount: 2,
        pendingOtherParticipantCount: 1,
        youOwe: 0,
        youAreOwed: 6.5,
        isCreator: true,
        createdAt: billDetail.createdAt,
        updatedAt: billDetail.updatedAt,
      },
    ]);
    queryClient.setQueryData(billsQueryKeys.detail('bill_1'), billDetail);

    expect(billsQueryKeys.root).toEqual(['feature', 'bills']);
    expect(billsQueryKeys.detail('bill_1')).toEqual(['feature', 'bill', 'bill_1']);
    expect(isBillsListQueryKey(billsQueryKeys.root)).toBe(true);
    expect(isBillDetailQueryKey(billsQueryKeys.detail('bill_1'))).toBe(true);
    expect(getCachedBillListSummary(queryClient, 'bill_1')?.title).toBe('Dinner');
    expect(getCachedBillDetail(queryClient, 'bill_1')?.id).toBe('bill_1');
  });

  it('defines stable menu item and tasting session query keys', () => {
    const queryClient = new QueryClient();
    const tastingSession = {
      id: 'session_1',
      name: 'Coffee',
      restaurantName: 'Cafe',
      createdByUserId: 'user_1',
      inviteCode: 'ABC123',
      status: 'adding_items',
      participants: [],
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as const;

    queryClient.setQueryData(tastingSessionsQueryKeys.root, [tastingSession]);

    expect(menuItemsQueryKeys.restaurant('restaurant_1')).toEqual([
      'feature',
      'menuItems',
      'restaurant_1',
    ]);
    expect(restaurantOrderedItemsQueryKeys.restaurant(' restaurant_1 ')).toEqual([
      'feature',
      'restaurantOrderedItems',
      'restaurant_1',
    ]);
    expect(isRestaurantMenuItemsQueryKey(menuItemsQueryKeys.restaurant('restaurant_1'))).toBe(true);
    expect(isTastingSessionsListQueryKey(tastingSessionsQueryKeys.root)).toBe(true);
    expect(isTastingSessionDetailQueryKey(tastingSessionsQueryKeys.detail('session_1'))).toBe(true);
    expect(getCachedTastingSessionDetail(queryClient, 'session_1')?.name).toBe('Coffee');
  });

  it('defines stable all locations history query keys', () => {
    expect(restaurantsQueryKeys.allLocationsHistoryRoot).toEqual([
      'feature',
      'restaurants',
      'allLocationsHistory',
    ]);
    expect(restaurantsQueryKeys.allLocationsHistory(' restaurant-1 ')).toEqual([
      'feature',
      'restaurants',
      'allLocationsHistory',
      'restaurant-1',
    ]);
  });
});
