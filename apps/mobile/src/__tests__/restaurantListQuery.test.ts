import { QueryClient } from '@tanstack/react-query';

import {
  getRestaurantListContentInvalidationKeys,
  getRestaurantListRemovalKeys,
  invalidateRestaurantListContentQueries,
  removeRestaurantListQueries,
  restaurantListQueryKeys,
} from '../features/store/restaurantListQuery';

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
      },
    },
  });
}

describe('restaurantListQuery', () => {
  it('uses canonical list detail and paginated list keys', () => {
    expect(restaurantListQueryKeys.detail('list_1')).toEqual(['feature', 'restaurantListDetail', 'list_1']);
    expect(restaurantListQueryKeys.paginated('my', 'pizza')).toEqual([
      'feature',
      'restaurantLists',
      'my',
      'paginated',
      'pizza',
    ]);
  });

  it('builds content invalidation keys with optional candidate queries', () => {
    expect(getRestaurantListContentInvalidationKeys('list_1')).toEqual([
      restaurantListQueryKeys.list('list_1'),
      restaurantListQueryKeys.items('list_1'),
      restaurantListQueryKeys.detail('list_1'),
      restaurantListQueryKeys.itemLinks('list_1'),
      restaurantListQueryKeys.root,
    ]);

    expect(getRestaurantListContentInvalidationKeys('list_1', { includeCandidateRestaurants: true })).toEqual([
      restaurantListQueryKeys.list('list_1'),
      restaurantListQueryKeys.items('list_1'),
      restaurantListQueryKeys.detail('list_1'),
      restaurantListQueryKeys.itemLinks('list_1'),
      restaurantListQueryKeys.candidateRestaurantsByList('list_1'),
      restaurantListQueryKeys.root,
    ]);
  });

  it('invalidates list-scoped detail caches and collection queries together', async () => {
    const queryClient = createQueryClient();
    const listId = 'list_1';
    const listPageKey = restaurantListQueryKeys.paginated('my', '');
    const candidateKey = restaurantListQueryKeys.candidateRestaurants(listId, 'pizza');

    queryClient.setQueryData(restaurantListQueryKeys.list(listId), { id: listId });
    queryClient.setQueryData(restaurantListQueryKeys.items(listId), [{ id: 'item_1' }]);
    queryClient.setQueryData(restaurantListQueryKeys.detail(listId), { list: { id: listId }, items: [] });
    queryClient.setQueryData(restaurantListQueryKeys.itemLinks(listId), [{ id: 'link_1' }]);
    queryClient.setQueryData(candidateKey, [{ id: 'restaurant_1' }]);
    queryClient.setQueryData(listPageKey, { pages: [], pageParams: [] });

    await invalidateRestaurantListContentQueries(queryClient, listId, { includeCandidateRestaurants: true });

    expect(queryClient.getQueryState(restaurantListQueryKeys.list(listId))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(restaurantListQueryKeys.items(listId))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(restaurantListQueryKeys.detail(listId))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(restaurantListQueryKeys.itemLinks(listId))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(candidateKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(listPageKey)?.isInvalidated).toBe(true);
  });

  it('removes list-scoped caches without clearing list collections', () => {
    const queryClient = createQueryClient();
    const listId = 'list_1';
    const candidateKey = restaurantListQueryKeys.candidateRestaurants(listId, 'pizza');
    const listPageKey = restaurantListQueryKeys.paginated('my', '');

    for (const queryKey of getRestaurantListRemovalKeys(listId)) {
      queryClient.setQueryData(queryKey, { queryKey });
    }
    queryClient.setQueryData(candidateKey, { id: 'candidate_1' });
    queryClient.setQueryData(listPageKey, { pages: [], pageParams: [] });

    removeRestaurantListQueries(queryClient, listId);

    expect(queryClient.getQueryData(restaurantListQueryKeys.list(listId))).toBeUndefined();
    expect(queryClient.getQueryData(restaurantListQueryKeys.items(listId))).toBeUndefined();
    expect(queryClient.getQueryData(restaurantListQueryKeys.detail(listId))).toBeUndefined();
    expect(queryClient.getQueryData(restaurantListQueryKeys.itemLinks(listId))).toBeUndefined();
    expect(queryClient.getQueryData(candidateKey)).toBeUndefined();
    expect(queryClient.getQueryData(listPageKey)).toEqual({ pages: [], pageParams: [] });
  });
});
