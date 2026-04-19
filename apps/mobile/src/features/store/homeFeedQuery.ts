import type {
  InfiniteData,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query';

import {
  type HomeFeedCursor,
  type HomeFeedPageEntry,
  type HomeFeedPageResult,
  type HomeFeedScope,
  type HomeFeedSort,
  type HomeFeedTypeFilter,
} from './homeFeedPagination';

const HOME_FEED_SCOPES = ['all', 'mine', 'friends'] as const;
const HOME_FEED_SORTS = ['created', 'tracked'] as const;
const HOME_FEED_TYPE_FILTERS = ['all', 'visits', 'quick-track'] as const;
const HOME_FEED_LEGACY_DEFAULT_SORTS: Record<HomeFeedScope, HomeFeedSort> = {
  all: 'tracked',
  mine: 'created',
  friends: 'tracked',
};

export type HomeFeedInfiniteData = InfiniteData<HomeFeedPageResult, HomeFeedCursor | undefined>;
type HomeFeedVisitEntry = Extract<HomeFeedPageEntry, { source: 'visit' }>;

function buildLegacyPaginatedHomeFeedQueryKey(
  scope: HomeFeedScope,
  typeFilter: HomeFeedTypeFilter,
  searchQuery: string,
) {
  return ['feature', 'homeFeed', 'paginated', scope, typeFilter, searchQuery.trim()] as const;
}

function filterVisitOnlyEntries(items: readonly HomeFeedPageEntry[]): HomeFeedVisitEntry[] {
  return items.filter((item): item is HomeFeedVisitEntry => item.source === 'visit');
}

function buildVisitOnlyPlaceholderData(data: HomeFeedInfiniteData): HomeFeedInfiniteData {
  const visitItems = filterVisitOnlyEntries(data.pages.flatMap((page) => page.items));
  const visibleVisitItemIds = new Set(
    visitItems.flatMap((item) => item.visit.items.map((visitItem) => visitItem.id)),
  );
  const photoPreviews = data.pages
    .flatMap((page) => page.photoPreviews ?? [])
    .filter((photo) => {
      const foodItemId = photo.food_item?.trim();
      return typeof foodItemId === 'string' && foodItemId.length > 0 && visibleVisitItemIds.has(foodItemId);
    });
  const totalVisits = data.pages[0]?.totalVisits ?? visitItems.length;

  return {
    pageParams: [undefined as HomeFeedCursor | undefined],
    pages: [
      {
        cursor: undefined,
        hasNextPage: false,
        items: visitItems,
        photoPreviews,
        totalQuickTracks: 0,
        totalVisits,
      },
    ],
  };
}

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
  if (
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
  ) {
    return true;
  }

  return (
    Array.isArray(queryKey) &&
    queryKey.length === 6 &&
    queryKey[0] === homeFeedQueryKeys.root[0] &&
    queryKey[1] === homeFeedQueryKeys.root[1] &&
    queryKey[2] === 'paginated' &&
    typeof queryKey[3] === 'string' &&
    HOME_FEED_SCOPES.includes(queryKey[3] as HomeFeedScope) &&
    typeof queryKey[4] === 'string' &&
    HOME_FEED_TYPE_FILTERS.includes(queryKey[4] as HomeFeedTypeFilter) &&
    typeof queryKey[5] === 'string'
  );
}

export function getLegacyHomeFeedPlaceholderData(
  queryClient: QueryClient,
  scope: HomeFeedScope,
  typeFilter: HomeFeedTypeFilter,
  sort: HomeFeedSort,
  searchQuery: string,
): HomeFeedInfiniteData | undefined {
  const exactLegacyData = queryClient.getQueryData<HomeFeedInfiniteData>(
    buildLegacyPaginatedHomeFeedQueryKey(scope, typeFilter, searchQuery),
  );
  if (exactLegacyData) {
    return exactLegacyData;
  }

  if (typeFilter !== 'visits' || sort !== HOME_FEED_LEGACY_DEFAULT_SORTS[scope]) {
    return undefined;
  }

  const legacyAllData = queryClient.getQueryData<HomeFeedInfiniteData>(
    buildLegacyPaginatedHomeFeedQueryKey(scope, 'all', searchQuery),
  );
  if (!legacyAllData) {
    return undefined;
  }

  return buildVisitOnlyPlaceholderData(legacyAllData);
}

export async function invalidateHomeFeedQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: homeFeedQueryKeys.root });
}
