import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import type { FriendsCountSummary } from './featureStore';
import type { FriendsPageResult, ListFriendsPageInput } from './friendsStore';

export type FriendsSection = NonNullable<ListFriendsPageInput['section']>;

export type FriendsPaginatedQueryKey =
  | readonly ['feature', 'friends', 'paginated', FriendsSection]
  | readonly ['feature', 'friends', 'paginated', FriendsSection, string];

const FRIENDS_SECTIONS = ['friends', 'requests', 'sent'] as const;

interface CachedFriendsSummary {
  summary: FriendsCountSummary;
  updatedAt: number;
}

export const friendsQueryKeys = {
  root: ['feature', 'friends'] as const,
  summary: ['feature', 'friends', 'summary'] as const,
  paginated: (section: FriendsSection, search?: string): FriendsPaginatedQueryKey => {
    const normalizedSearch = search?.trim() ?? '';
    if (!normalizedSearch) {
      return ['feature', 'friends', 'paginated', section];
    }

    return ['feature', 'friends', 'paginated', section, normalizedSearch];
  },
};

export function isPaginatedFriendsQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    (queryKey.length === 4 || queryKey.length === 5) &&
    queryKey[0] === friendsQueryKeys.root[0] &&
    queryKey[1] === friendsQueryKeys.root[1] &&
    queryKey[2] === 'paginated' &&
    typeof queryKey[3] === 'string' &&
    FRIENDS_SECTIONS.includes(queryKey[3] as FriendsSection) &&
    (queryKey.length === 4 || typeof queryKey[4] === 'string')
  );
}

export function isFriendsSummaryQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === friendsQueryKeys.summary.length &&
    friendsQueryKeys.summary.every((segment, index) => queryKey[index] === segment)
  );
}

function isInfiniteFriendsPageData(
  data: InfiniteData<FriendsPageResult, unknown> | FriendsPageResult,
): data is InfiniteData<FriendsPageResult, unknown> {
  return 'pages' in data && Array.isArray(data.pages);
}

export function selectFriendsSummary(
  data: InfiniteData<FriendsPageResult, unknown> | FriendsPageResult | undefined,
): FriendsCountSummary | undefined {
  if (!data) {
    return undefined;
  }

  if (isInfiniteFriendsPageData(data)) {
    return data.pages.find((page) => page.summary)?.summary;
  }

  return data.summary;
}

function areFriendsSummariesEqual(
  left: FriendsCountSummary | undefined,
  right: FriendsCountSummary | undefined,
): boolean {
  return (
    left?.friendsCount === right?.friendsCount &&
    left?.requestsCount === right?.requestsCount &&
    left?.sentCount === right?.sentCount
  );
}

function getCachedFriendsSummaryCandidate(
  summary: FriendsCountSummary | undefined,
  updatedAt: number | undefined,
): CachedFriendsSummary | undefined {
  if (!summary) {
    return undefined;
  }

  return {
    summary,
    updatedAt: updatedAt ?? 0,
  };
}

export function getCachedFriendsSummary(queryClient: QueryClient): CachedFriendsSummary | undefined {
  const cachedSummaryQuery = getCachedFriendsSummaryCandidate(
    queryClient.getQueryData<FriendsCountSummary>(friendsQueryKeys.summary),
    queryClient.getQueryState(friendsQueryKeys.summary)?.dataUpdatedAt,
  );

  return FRIENDS_SECTIONS.reduce<CachedFriendsSummary | undefined>((latestSummary, section) => {
    const paginatedQueryKey = friendsQueryKeys.paginated(section);
    const paginatedSummary = getCachedFriendsSummaryCandidate(
      selectFriendsSummary(
        queryClient.getQueryData<InfiniteData<FriendsPageResult, unknown>>(paginatedQueryKey),
      ),
      queryClient.getQueryState(paginatedQueryKey)?.dataUpdatedAt,
    );

    if (!paginatedSummary) {
      return latestSummary;
    }

    if (!latestSummary || paginatedSummary.updatedAt > latestSummary.updatedAt) {
      return paginatedSummary;
    }

    return latestSummary;
  }, cachedSummaryQuery);
}

export function hydrateFriendsSummaryFromPaginatedData(
  queryClient: QueryClient,
  data: InfiniteData<FriendsPageResult, unknown> | FriendsPageResult | undefined,
): void {
  const nextSummary = selectFriendsSummary(data);
  if (!nextSummary) {
    return;
  }

  const currentSummary = queryClient.getQueryData<FriendsCountSummary>(friendsQueryKeys.summary);
  if (areFriendsSummariesEqual(currentSummary, nextSummary)) {
    return;
  }

  queryClient.setQueryData<FriendsCountSummary>(friendsQueryKeys.summary, nextSummary);
}
