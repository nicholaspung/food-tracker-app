import type {
  QueryKey,
  InfiniteData,
  QueryClient,
} from '@tanstack/react-query';

import {
  type HomeFeedCursor,
  type HomeFeedPageResult,
  type HomeFeedScope,
  type HomeFeedSort,
  type HomeFeedTypeFilter,
} from './homeFeedPagination';
import { homeFeedMapQueryKeys } from './homeFeedMapQuery';

const HOME_FEED_SCOPES = ['all', 'mine', 'friends'] as const;
const HOME_FEED_SORTS = ['created', 'tracked'] as const;
const HOME_FEED_TYPE_FILTERS = ['all', 'visits', 'food-products'] as const;

export type HomeFeedInfiniteData = InfiniteData<HomeFeedPageResult, HomeFeedCursor | undefined>;

export const homeFeedQueryKeys = {
  root: ['feature', 'homeFeed'] as const,
  paginated: (
    userId: string | null | undefined,
    scope: HomeFeedScope,
    typeFilter: HomeFeedTypeFilter,
    sort: HomeFeedSort,
    searchQuery: string,
  ) =>
    [
      'feature',
      'homeFeed',
      'user',
      userId ?? 'anonymous',
      'paginated',
      scope,
      typeFilter,
      sort,
      searchQuery.trim(),
    ] as const,
};

export function isPaginatedHomeFeedQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === 9 &&
    queryKey[0] === homeFeedQueryKeys.root[0] &&
    queryKey[1] === homeFeedQueryKeys.root[1] &&
    queryKey[2] === 'user' &&
    typeof queryKey[3] === 'string' &&
    queryKey[4] === 'paginated' &&
    typeof queryKey[5] === 'string' &&
    HOME_FEED_SCOPES.includes(queryKey[5] as HomeFeedScope) &&
    typeof queryKey[6] === 'string' &&
    HOME_FEED_TYPE_FILTERS.includes(queryKey[6] as HomeFeedTypeFilter) &&
    typeof queryKey[7] === 'string' &&
    HOME_FEED_SORTS.includes(queryKey[7] as HomeFeedSort) &&
    typeof queryKey[8] === 'string'
  );
}

export function getHomeFeedScopeFromQueryKey(queryKey: QueryKey): HomeFeedScope | null {
  if (!isPaginatedHomeFeedQueryKey(queryKey)) {
    return null;
  }

  return queryKey[5] as HomeFeedScope;
}

export async function invalidateHomeFeedQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: homeFeedQueryKeys.root }),
    queryClient.invalidateQueries({ queryKey: homeFeedMapQueryKeys.root }),
  ]);
}
