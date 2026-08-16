import { QueryClient } from '@tanstack/react-query';

import {
  getRestaurantListContentInvalidationKeys,
  getRestaurantListRemovalKeys,
  invalidateRestaurantListContentQueries,
  normalizeRestaurantListFoodItemIdsForQueryKey,
  removeRestaurantListQueries,
  restaurantListQueryKeys,
  upsertRestaurantListInCollectionCaches,
} from '../features/store/restaurantListQuery';
import type { RestaurantListRecord } from '../features/models';

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
      },
    },
  });
}

function buildList(overrides: Partial<RestaurantListRecord> = {}): RestaurantListRecord {
  return {
    id: 'list_1',
    name: 'Saved Spots',
    visibility: 'friends',
    userId: 'user-1',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildListPage(items: RestaurantListRecord[]) {
  return {
    pageParams: [1],
    pages: [
      {
        items,
        page: 1,
        pageSize: 20,
        totalItems: items.length,
        totalPages: items.length === 0 ? 0 : 1,
        hasNextPage: false,
      },
    ],
  };
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
    expect(restaurantListQueryKeys.paginatedInfinite('my', 'pizza')).toEqual([
      'feature',
      'restaurantLists',
      'my',
      'paginatedInfinite',
      'pizza',
    ]);
    expect(restaurantListQueryKeys.candidateRestaurantPages('list_1', 'ramen')).toEqual([
      'feature',
      'restaurantListCandidateRestaurants',
      'list_1',
      'ramen',
      'pages',
    ]);
    expect(
      restaurantListQueryKeys.candidateRestaurantFoodItemPages('list_1', 'restaurant_1'),
    ).toEqual([
      'feature',
      'restaurantListCandidateFoodItems',
      'list_1',
      'restaurant_1',
      'pages',
    ]);
  });

  it('normalizes batched candidate food item photo keys deterministically', () => {
    expect(normalizeRestaurantListFoodItemIdsForQueryKey([' item_b ', 'item_a', 'item_b', ''])).toBe(
      'item_a|item_b',
    );
    expect(restaurantListQueryKeys.candidateFoodItemPhotosBatch(['item_b', 'item_a'])).toEqual([
      'feature',
      'restaurantListCandidateFoodItemPhotos',
      'batch',
      'item_a|item_b',
    ]);
  });

  it('includes concrete bookmark lookup targets in bounded hydration keys', () => {
    expect(restaurantListQueryKeys.bookmarkStateChunk('list_1', [
      {
        bookmarkKey: 'restaurant-item:restaurant_1:noodles',
        restaurantId: 'restaurant_1',
        foodItemId: 'food_2',
      },
      {
        bookmarkKey: 'restaurant-item:restaurant_1:noodles',
        restaurantId: 'restaurant_1',
        foodItemId: 'food_1',
      },
    ])).toEqual([
      'feature',
      'restaurantListBookmarkState',
      'list_1',
      'restaurant-item:restaurant_1:noodles',
      'restaurant-item:restaurant_1:noodles:restaurant_1:food_1:|restaurant-item:restaurant_1:noodles:restaurant_1:food_2:',
    ]);
  });

  it('builds content invalidation keys with optional candidate queries', () => {
    expect(getRestaurantListContentInvalidationKeys('list_1')).toEqual([
      restaurantListQueryKeys.list('list_1'),
      restaurantListQueryKeys.items('list_1'),
      restaurantListQueryKeys.detail('list_1'),
      restaurantListQueryKeys.itemLinks('list_1'),
      restaurantListQueryKeys.candidateRestaurantFoodItemsByList('list_1'),
      restaurantListQueryKeys.root,
    ]);

    expect(getRestaurantListContentInvalidationKeys('list_1', { includeCandidateRestaurants: true })).toEqual([
      restaurantListQueryKeys.list('list_1'),
      restaurantListQueryKeys.items('list_1'),
      restaurantListQueryKeys.detail('list_1'),
      restaurantListQueryKeys.itemLinks('list_1'),
      restaurantListQueryKeys.candidateRestaurantFoodItemsByList('list_1'),
      restaurantListQueryKeys.candidateRestaurantsByList('list_1'),
      restaurantListQueryKeys.root,
    ]);
  });

  it('invalidates list-scoped detail caches and collection queries together', async () => {
    const queryClient = createQueryClient();
    const listId = 'list_1';
    const listPageKey = restaurantListQueryKeys.paginated('my', '');
    const candidateKey = restaurantListQueryKeys.candidateRestaurants(listId, 'pizza');
    const candidateFoodItemsKey = restaurantListQueryKeys.candidateRestaurantFoodItemPages(
      listId,
      'restaurant_1',
    );

    queryClient.setQueryData(restaurantListQueryKeys.list(listId), { id: listId });
    queryClient.setQueryData(restaurantListQueryKeys.items(listId), [{ id: 'item_1' }]);
    queryClient.setQueryData(restaurantListQueryKeys.detail(listId), { list: { id: listId }, items: [] });
    queryClient.setQueryData(restaurantListQueryKeys.itemLinks(listId), [{ id: 'link_1' }]);
    queryClient.setQueryData(candidateKey, [{ id: 'restaurant_1' }]);
    queryClient.setQueryData(candidateFoodItemsKey, { pages: [], pageParams: [] });
    queryClient.setQueryData(listPageKey, { pages: [], pageParams: [] });

    await invalidateRestaurantListContentQueries(queryClient, listId, { includeCandidateRestaurants: true });

    expect(queryClient.getQueryState(restaurantListQueryKeys.list(listId))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(restaurantListQueryKeys.items(listId))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(restaurantListQueryKeys.detail(listId))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(restaurantListQueryKeys.itemLinks(listId))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(candidateKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(candidateFoodItemsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(listPageKey)?.isInvalidated).toBe(true);
  });

  it('removes list-scoped caches without clearing list collections', () => {
    const queryClient = createQueryClient();
    const listId = 'list_1';
    const candidateKey = restaurantListQueryKeys.candidateRestaurants(listId, 'pizza');
    const candidateFoodItemsKey = restaurantListQueryKeys.candidateRestaurantFoodItemPages(
      listId,
      'restaurant_1',
    );
    const listPageKey = restaurantListQueryKeys.paginated('my', '');

    for (const queryKey of getRestaurantListRemovalKeys(listId)) {
      queryClient.setQueryData(queryKey, { queryKey });
    }
    queryClient.setQueryData(candidateKey, { id: 'candidate_1' });
    queryClient.setQueryData(candidateFoodItemsKey, { pages: [], pageParams: [] });
    queryClient.setQueryData(listPageKey, { pages: [], pageParams: [] });

    removeRestaurantListQueries(queryClient, listId);

    expect(queryClient.getQueryData(restaurantListQueryKeys.list(listId))).toBeUndefined();
    expect(queryClient.getQueryData(restaurantListQueryKeys.items(listId))).toBeUndefined();
    expect(queryClient.getQueryData(restaurantListQueryKeys.detail(listId))).toBeUndefined();
    expect(queryClient.getQueryData(restaurantListQueryKeys.itemLinks(listId))).toBeUndefined();
    expect(queryClient.getQueryData(candidateKey)).toBeUndefined();
    expect(queryClient.getQueryData(candidateFoodItemsKey)).toBeUndefined();
    expect(queryClient.getQueryData(listPageKey)).toEqual({ pages: [], pageParams: [] });
  });

  it('adds a queued list into cached collection queries and seeds the base my-lists query', () => {
    const queryClient = createQueryClient();
    const pizzaSearchKey = restaurantListQueryKeys.paginated('my', 'pizza');
    const sushiSearchKey = restaurantListQueryKeys.paginated('my', 'sushi');
    const existingPizzaList = buildList({ id: 'list_existing', name: 'Pizza Night' });
    const existingSushiList = buildList({ id: 'list_other', name: 'Sushi Trail' });
    const queuedList = buildList({ id: 'offline_list_1', name: 'Pizza Crawl' });

    queryClient.setQueryData(pizzaSearchKey, buildListPage([existingPizzaList]));
    queryClient.setQueryData(sushiSearchKey, buildListPage([existingSushiList]));

    upsertRestaurantListInCollectionCaches(queryClient, queuedList, 'my');

    expect(
      queryClient.getQueryData<{ pages: { items: RestaurantListRecord[] }[] }>(
        restaurantListQueryKeys.paginated('my', ''),
      )?.pages[0]?.items.map((item) => item.id),
    ).toEqual(['offline_list_1']);
    expect(
      queryClient.getQueryData<{ pages: { items: RestaurantListRecord[]; totalItems?: number }[] }>(
        pizzaSearchKey,
      )?.pages[0],
    ).toEqual(
      expect.objectContaining({
        totalItems: 2,
        items: [queuedList, existingPizzaList],
      }),
    );
    expect(
      queryClient.getQueryData<{ pages: { items: RestaurantListRecord[] }[] }>(
        sushiSearchKey,
      )?.pages[0]?.items.map((item) => item.id),
    ).toEqual(['list_other']);
  });

  it('replaces incompatible persisted list collection cache data when adding a list', () => {
    const queryClient = createQueryClient();
    const queuedList = buildList({ id: 'offline_list_1', name: 'Pizza Crawl' });
    const badPersistedKey = restaurantListQueryKeys.paginated('my', '');

    queryClient.setQueryData(badPersistedKey, {
      items: [],
      page: 1,
      pageSize: 100,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
    });

    expect(() => {
      upsertRestaurantListInCollectionCaches(queryClient, queuedList, 'my');
    }).not.toThrow();
    expect(
      queryClient.getQueryData<{ pages: { items: RestaurantListRecord[] }[] }>(
        badPersistedKey,
      )?.pages[0]?.items.map((item) => item.id),
    ).toEqual(['offline_list_1']);
  });
});
