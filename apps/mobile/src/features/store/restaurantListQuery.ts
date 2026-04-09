import type { QueryClient, QueryKey } from '@tanstack/react-query';

type RestaurantListScope = 'my' | 'friends';

interface RestaurantListContentInvalidationOptions {
  includeCandidateRestaurants?: boolean;
}

export const restaurantListQueryKeys = {
  root: ['feature', 'restaurantLists'] as const,
  scope: (scope: RestaurantListScope) => ['feature', 'restaurantLists', scope] as const,
  paginated: (scope: RestaurantListScope, searchQuery: string) =>
    ['feature', 'restaurantLists', scope, 'paginated', searchQuery] as const,
  listRoot: ['feature', 'restaurantList'] as const,
  list: (listId: string) => ['feature', 'restaurantList', listId] as const,
  detailRoot: ['feature', 'restaurantListDetail'] as const,
  detail: (listId: string) => ['feature', 'restaurantListDetail', listId] as const,
  itemsRoot: ['feature', 'restaurantListItems'] as const,
  items: (listId: string) => ['feature', 'restaurantListItems', listId] as const,
  itemLinksRoot: ['feature', 'restaurantListItemLinks'] as const,
  itemLinks: (listId: string) => ['feature', 'restaurantListItemLinks', listId] as const,
  candidateRestaurantsRoot: ['feature', 'restaurantListCandidateRestaurants'] as const,
  candidateRestaurantsByList: (listId: string) =>
    ['feature', 'restaurantListCandidateRestaurants', listId] as const,
  candidateRestaurants: (listId: string, searchQuery: string) =>
    ['feature', 'restaurantListCandidateRestaurants', listId, searchQuery] as const,
};

async function invalidateQueryKeys(queryClient: QueryClient, queryKeys: readonly QueryKey[]): Promise<void> {
  await Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

function removeQueryKeys(queryClient: QueryClient, queryKeys: readonly QueryKey[]): void {
  for (const queryKey of queryKeys) {
    queryClient.removeQueries({ queryKey });
  }
}

export function getRestaurantListCollectionInvalidationKeys(scope?: RestaurantListScope): QueryKey[] {
  return [scope ? restaurantListQueryKeys.scope(scope) : restaurantListQueryKeys.root];
}

export function getRestaurantListMetadataInvalidationKeys(listId: string): QueryKey[] {
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

export function getRestaurantListSaveTargetInvalidationKeys(listId: string): QueryKey[] {
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

export function removeRestaurantListQueries(queryClient: QueryClient, listId: string): void {
  removeQueryKeys(queryClient, getRestaurantListRemovalKeys(listId));
}
