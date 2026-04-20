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

const HOME_FEED_SCOPES = ['all', 'mine', 'friends'] as const;
const HOME_FEED_SORTS = ['created', 'tracked'] as const;
const HOME_FEED_TYPE_FILTERS = ['all', 'visits', 'food-products'] as const;

export type HomeFeedInfiniteData = InfiniteData<HomeFeedPageResult, HomeFeedCursor | undefined>;

export const homeFeedQueryKeys = {
  root: ['feature', 'homeFeed'] as const,
  paginated: (
    scope: HomeFeedScope,
    typeFilter: HomeFeedTypeFilter,
    sort: HomeFeedSort,
    searchQuery: string,
  ) => ['feature', 'homeFeed', 'paginated', scope, typeFilter, sort, searchQuery.trim()] as const,
};

export function isPaginatedHomeFeedQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === 7 &&
    queryKey[0] === homeFeedQueryKeys.root[0] &&
    queryKey[1] === homeFeedQueryKeys.root[1] &&
    queryKey[2] === 'paginated' &&
    typeof queryKey[3] === 'string' &&
    HOME_FEED_SCOPES.includes(queryKey[3] as HomeFeedScope) &&
    typeof queryKey[4] === 'string' &&
    HOME_FEED_TYPE_FILTERS.includes(queryKey[4] as HomeFeedTypeFilter) &&
    typeof queryKey[5] === 'string' &&
    HOME_FEED_SORTS.includes(queryKey[5] as HomeFeedSort) &&
    typeof queryKey[6] === 'string'
  );
}

export async function invalidateHomeFeedQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: homeFeedQueryKeys.root });
}
