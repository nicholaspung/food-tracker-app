import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import type { RestaurantListRecord } from '../models';
import type { PaginatedResult } from './featureStore';

type RestaurantListScope = 'my' | 'friends';
type RestaurantListInfiniteData = InfiniteData<PaginatedResult<RestaurantListRecord>, unknown>;

interface RestaurantListContentInvalidationOptions {
  includeCandidateRestaurants?: boolean;
}

export const restaurantListQueryKeys = {
  root: ['feature', 'restaurantLists'] as const,
  scope: (scope: RestaurantListScope) => ['feature', 'restaurantLists', scope] as const,
  paginated: (scope: RestaurantListScope, searchQuery: string) =>
    ['feature', 'restaurantLists', scope, 'paginated', searchQuery] as const,
  paginatedInfinite: (scope: RestaurantListScope, searchQuery: string) =>
    ['feature', 'restaurantLists', scope, 'paginatedInfinite', searchQuery] as const,
  defaultList: ['feature', 'restaurantLists', 'my', 'default'] as const,
  listRoot: ['feature', 'restaurantList'] as const,
  list: (listId: string) => ['feature', 'restaurantList', listId] as const,
  detailRoot: ['feature', 'restaurantListDetail'] as const,
  detail: (listId: string) => ['feature', 'restaurantListDetail', listId] as const,
  sharedRoot: ['feature', 'sharedRestaurantList'] as const,
  shared: (shareToken: string) => ['feature', 'sharedRestaurantList', shareToken] as const,
  itemsRoot: ['feature', 'restaurantListItems'] as const,
  items: (listId: string) => ['feature', 'restaurantListItems', listId] as const,
  itemLinksRoot: ['feature', 'restaurantListItemLinks'] as const,
  itemLinks: (listId: string) => ['feature', 'restaurantListItemLinks', listId] as const,
  candidateRestaurantsRoot: ['feature', 'restaurantListCandidateRestaurants'] as const,
  candidateRestaurantsByList: (listId: string) =>
    ['feature', 'restaurantListCandidateRestaurants', listId] as const,
  candidateRestaurants: (listId: string, searchQuery: string) =>
    ['feature', 'restaurantListCandidateRestaurants', listId, searchQuery] as const,
  candidateFoodItemPhotosRoot: ['feature', 'restaurantListCandidateFoodItemPhotos'] as const,
  candidateFoodItemPhotos: (foodItemId: string) =>
    ['feature', 'restaurantListCandidateFoodItemPhotos', foodItemId] as const,
  candidateFoodItemPhotosBatch: (foodItemIds: string[]) =>
    [
      'feature',
      'restaurantListCandidateFoodItemPhotos',
      'batch',
      normalizeRestaurantListFoodItemIdsForQueryKey(foodItemIds),
    ] as const,
};

export function normalizeRestaurantListFoodItemIdsForQueryKey(foodItemIds: string[]): string {
  return Array.from(
    new Set(
      foodItemIds
        .map((foodItemId) => foodItemId.trim())
        .filter((foodItemId) => foodItemId.length > 0),
    ),
  )
    .sort()
    .join('|');
}

function normalizeSearchQuery(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function matchesRestaurantListSearch(list: RestaurantListRecord, searchQuery: string): boolean {
  const normalizedSearch = normalizeSearchQuery(searchQuery);
  if (!normalizedSearch) {
    return true;
  }

  return (
    list.name.toLowerCase().includes(normalizedSearch) ||
    list.description?.toLowerCase().includes(normalizedSearch) === true
  );
}

function createRestaurantListCollectionData(list: RestaurantListRecord): RestaurantListInfiniteData {
  return {
    pageParams: [1],
    pages: [
      {
        items: [list],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
      },
    ],
  };
}

function isRestaurantListInfiniteData(
  value: unknown,
): value is RestaurantListInfiniteData {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { pages?: unknown }).pages) &&
    Array.isArray((value as { pageParams?: unknown }).pageParams)
  );
}

function resolveNextTotalPages(totalItems: number, pageSize: number, currentTotalPages: number): number {
  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    return currentTotalPages;
  }

  if (totalItems === 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function upsertRestaurantListInCollectionData(
  currentData: unknown,
  list: RestaurantListRecord,
  searchQuery: string,
): RestaurantListInfiniteData | undefined {
  const shouldIncludeList = matchesRestaurantListSearch(list, searchQuery);

  if (!isRestaurantListInfiniteData(currentData)) {
    return shouldIncludeList ? createRestaurantListCollectionData(list) : undefined;
  }

  if (currentData.pages.length === 0) {
    return shouldIncludeList ? createRestaurantListCollectionData(list) : currentData;
  }

  const hasExistingList = currentData.pages.some((page) => page.items.some((item) => item.id === list.id));
  if (!shouldIncludeList && !hasExistingList) {
    return currentData;
  }

  const totalDelta = shouldIncludeList ? (hasExistingList ? 0 : 1) : -1;

  return {
    ...currentData,
    pages: currentData.pages.map((page, pageIndex) => {
      const itemsWithoutList = page.items.filter((item) => item.id !== list.id);
      const nextItems =
        pageIndex === 0 && shouldIncludeList
          ? [list, ...itemsWithoutList]
          : itemsWithoutList;
      const nextTotalItems = Math.max(page.totalItems + totalDelta, 0);

      return {
        ...page,
        items: nextItems,
        totalItems: nextTotalItems,
        totalPages: resolveNextTotalPages(nextTotalItems, page.pageSize, page.totalPages),
      };
    }),
  };
}

function resolveRestaurantListSearchQuery(queryKey: QueryKey): string | null {
  if (
    !Array.isArray(queryKey) ||
    queryKey.length !== 5 ||
    queryKey[0] !== restaurantListQueryKeys.root[0] ||
    queryKey[1] !== restaurantListQueryKeys.root[1] ||
    typeof queryKey[2] !== 'string' ||
    (queryKey[3] !== 'paginated' && queryKey[3] !== 'paginatedInfinite') ||
    typeof queryKey[4] !== 'string'
  ) {
    return null;
  }

  return queryKey[4];
}

async function invalidateQueryKeys(queryClient: QueryClient, queryKeys: readonly QueryKey[]): Promise<void> {
  await Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

function removeQueryKeys(queryClient: QueryClient, queryKeys: readonly QueryKey[]): void {
  for (const queryKey of queryKeys) {
    queryClient.removeQueries({ queryKey });
  }
}

function getRestaurantListCollectionInvalidationKeys(scope?: RestaurantListScope): QueryKey[] {
  return [scope ? restaurantListQueryKeys.scope(scope) : restaurantListQueryKeys.root];
}

function getRestaurantListMetadataInvalidationKeys(listId: string): QueryKey[] {
  return [
    restaurantListQueryKeys.list(listId),
    restaurantListQueryKeys.detail(listId),
    restaurantListQueryKeys.root,
  ];
}

export function getRestaurantListContentInvalidationKeys(
  listId: string,
  options: RestaurantListContentInvalidationOptions = {},
): QueryKey[] {
  const queryKeys: QueryKey[] = [
    restaurantListQueryKeys.list(listId),
    restaurantListQueryKeys.items(listId),
    restaurantListQueryKeys.detail(listId),
    restaurantListQueryKeys.itemLinks(listId),
    restaurantListQueryKeys.root,
  ];

  if (options.includeCandidateRestaurants) {
    queryKeys.splice(4, 0, restaurantListQueryKeys.candidateRestaurantsByList(listId));
  }

  return queryKeys;
}

function getRestaurantListSaveTargetInvalidationKeys(listId: string): QueryKey[] {
  return [restaurantListQueryKeys.detail(listId), restaurantListQueryKeys.scope('my')];
}

export function getRestaurantListRemovalKeys(listId: string): QueryKey[] {
  return [
    restaurantListQueryKeys.list(listId),
    restaurantListQueryKeys.items(listId),
    restaurantListQueryKeys.detail(listId),
    restaurantListQueryKeys.itemLinks(listId),
    restaurantListQueryKeys.candidateRestaurantsByList(listId),
  ];
}

export async function invalidateRestaurantListCollectionQueries(
  queryClient: QueryClient,
  scope?: RestaurantListScope,
): Promise<void> {
  await invalidateQueryKeys(queryClient, getRestaurantListCollectionInvalidationKeys(scope));
}

export async function invalidateRestaurantListMetadataQueries(
  queryClient: QueryClient,
  listId: string,
): Promise<void> {
  await invalidateQueryKeys(queryClient, getRestaurantListMetadataInvalidationKeys(listId));
}

export async function invalidateRestaurantListContentQueries(
  queryClient: QueryClient,
  listId: string,
  options?: RestaurantListContentInvalidationOptions,
): Promise<void> {
  await invalidateQueryKeys(queryClient, getRestaurantListContentInvalidationKeys(listId, options));
}

export async function invalidateRestaurantListSaveTargetQueries(
  queryClient: QueryClient,
  listId: string,
): Promise<void> {
  await invalidateQueryKeys(queryClient, getRestaurantListSaveTargetInvalidationKeys(listId));
}

export function upsertRestaurantListInCollectionCaches(
  queryClient: QueryClient,
  list: RestaurantListRecord,
  scope: RestaurantListScope = 'my',
): void {
  const scopedQueryData = queryClient.getQueriesData<RestaurantListInfiniteData>({
    queryKey: restaurantListQueryKeys.scope(scope),
  });

  for (const [queryKey, currentData] of scopedQueryData) {
    const searchQuery = resolveRestaurantListSearchQuery(queryKey);
    if (searchQuery === null) {
      continue;
    }

    queryClient.setQueryData(
      queryKey,
      upsertRestaurantListInCollectionData(currentData, list, searchQuery),
    );
  }

  for (const baseQueryKey of [
    restaurantListQueryKeys.paginated(scope, ''),
    restaurantListQueryKeys.paginatedInfinite(scope, ''),
  ]) {
    const baseQueryData = queryClient.getQueryData<unknown>(baseQueryKey);
    if (!isRestaurantListInfiniteData(baseQueryData)) {
      queryClient.setQueryData(baseQueryKey, createRestaurantListCollectionData(list));
    }
  }
}

export function removeRestaurantListQueries(queryClient: QueryClient, listId: string): void {
  removeQueryKeys(queryClient, getRestaurantListRemovalKeys(listId));
}
