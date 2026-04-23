import type { InfiniteData, Query, QueryClient, QueryKey } from '@tanstack/react-query';

import type { FriendRecord } from '../models';
import type { FriendsCountSummary, RestaurantListDetailRecord } from './featureStore';
import type { FriendsPageResult, ListFriendsPageInput } from './friendsStore';
import { isPaginatedHomeFeedQueryKey } from './homeFeedQuery';
import { restaurantListQueryKeys } from './restaurantListQuery';

export type FriendsSection = NonNullable<ListFriendsPageInput['section']>;

export type FriendsPaginatedQueryKey =
  | readonly ['feature', 'friends', 'paginated', FriendsSection]
  | readonly ['feature', 'friends', 'paginated', FriendsSection, string];

const FRIENDS_SECTIONS = ['friends', 'requests', 'sent'] as const;

interface CachedFriendsSummary {
  summary: FriendsCountSummary;
  updatedAt: number;
}

type FriendsInfiniteData = InfiniteData<FriendsPageResult, unknown>;

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

function parseTimestamp(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortFriendsByCreatedAtDesc(friends: readonly FriendRecord[]): FriendRecord[] {
  return [...friends].sort((left, right) => parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt));
}

function normalizeFriendSearchQuery(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function matchesFriendSearchQuery(friend: FriendRecord, searchQuery: string): boolean {
  const normalizedSearch = normalizeFriendSearchQuery(searchQuery);
  if (!normalizedSearch) {
    return true;
  }

  return (
    friend.name.toLowerCase().includes(normalizedSearch) ||
    friend.email.toLowerCase().includes(normalizedSearch)
  );
}

function createFriendsInfiniteData(
  items: FriendRecord[],
  summary?: FriendsCountSummary,
): FriendsInfiniteData {
  return {
    pageParams: [1],
    pages: [
      {
        items: sortFriendsByCreatedAtDesc(items),
        page: 1,
        pageSize: 20,
        totalItems: items.length,
        totalPages: items.length === 0 ? 0 : 1,
        hasNextPage: false,
        summary,
      },
    ],
  };
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

function patchFriendsDataAfterRemoval(
  currentData: FriendsInfiniteData | undefined,
  friendId: string,
  shouldAdjustCount: boolean,
): FriendsInfiniteData | undefined {
  if (!currentData) {
    return currentData;
  }

  const hasExistingFriend = currentData.pages.some((page) => page.items.some((item) => item.id === friendId));
  if (!hasExistingFriend && !shouldAdjustCount) {
    return currentData;
  }

  return {
    ...currentData,
    pages: currentData.pages.map((page) => {
      const nextTotalItems = shouldAdjustCount ? Math.max(page.totalItems - 1, 0) : page.totalItems;

      return {
        ...page,
        items: page.items.filter((item) => item.id !== friendId),
        totalItems: nextTotalItems,
        totalPages: resolveNextTotalPages(nextTotalItems, page.pageSize, page.totalPages),
      };
    }),
  };
}

function patchFriendsDataAfterUpsert(
  currentData: FriendsInfiniteData | undefined,
  friend: FriendRecord,
  shouldIncludeFriend: boolean,
): FriendsInfiniteData | undefined {
  if (!currentData || currentData.pages.length === 0) {
    return shouldIncludeFriend ? createFriendsInfiniteData([friend]) : currentData;
  }

  const hasExistingFriend = currentData.pages.some((page) => page.items.some((item) => item.id === friend.id));
  if (!shouldIncludeFriend && !hasExistingFriend) {
    return currentData;
  }

  const totalDelta = shouldIncludeFriend ? (hasExistingFriend ? 0 : 1) : -1;

  return {
    ...currentData,
    pages: currentData.pages.map((page, pageIndex) => {
      const itemsWithoutFriend = page.items.filter((item) => item.id !== friend.id);
      const nextItems =
        pageIndex === 0 && shouldIncludeFriend
          ? sortFriendsByCreatedAtDesc([friend, ...itemsWithoutFriend])
          : itemsWithoutFriend;
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

function resolveFriendsSearchQuery(queryKey: QueryKey): string {
  return Array.isArray(queryKey) && queryKey.length === 5 && typeof queryKey[4] === 'string'
    ? queryKey[4]
    : '';
}

function applySummaryToPaginatedFriendsQueries(
  queryClient: QueryClient,
  summary: FriendsCountSummary,
): void {
  const paginatedFriendQueries = queryClient.getQueriesData<FriendsInfiniteData>({
    queryKey: friendsQueryKeys.root,
  });

  for (const [queryKey, currentData] of paginatedFriendQueries) {
    if (!isPaginatedFriendsQueryKey(queryKey) || !currentData || currentData.pages.length === 0) {
      continue;
    }

    queryClient.setQueryData(queryKey, {
      ...currentData,
      pages: currentData.pages.map((page, pageIndex) =>
        pageIndex === 0
          ? {
              ...page,
              summary,
            }
          : page,
      ),
    });
  }
}

function adjustFriendsSummary(
  summary: FriendsCountSummary,
  delta: Partial<Record<'friendsCount' | 'requestsCount' | 'sentCount', number>>,
): FriendsCountSummary {
  return {
    friendsCount: Math.max(summary.friendsCount + (delta.friendsCount ?? 0), 0),
    requestsCount: Math.max(summary.requestsCount + (delta.requestsCount ?? 0), 0),
    sentCount: Math.max(summary.sentCount + (delta.sentCount ?? 0), 0),
  };
}

function getMutableFriendsSummary(queryClient: QueryClient): FriendsCountSummary {
  return (
    getCachedFriendsSummary(queryClient)?.summary ??
    queryClient.getQueryData<FriendsCountSummary>(friendsQueryKeys.summary) ?? {
      friendsCount: 0,
      requestsCount: 0,
      sentCount: 0,
    }
  );
}

function getFriendsSectionForStatus(status: FriendRecord['status']): FriendsSection {
  if (status === 'pending_received') {
    return 'requests';
  }

  if (status === 'pending_sent') {
    return 'sent';
  }

  return 'friends';
}

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

export function acceptCachedFriendRequest(
  queryClient: QueryClient,
  friend: FriendRecord,
  acceptedFriend?: FriendRecord,
): void {
  const nextFriend: FriendRecord = {
    ...friend,
    ...acceptedFriend,
    status: 'friend',
  };
  const nextSummary = adjustFriendsSummary(getMutableFriendsSummary(queryClient), {
    friendsCount: 1,
    requestsCount: -1,
  });

  const requestQueries = queryClient.getQueriesData<FriendsInfiniteData>({
    queryKey: friendsQueryKeys.paginated('requests'),
  });
  for (const [queryKey, currentData] of requestQueries) {
    if (!isPaginatedFriendsQueryKey(queryKey)) {
      continue;
    }

    const shouldAdjustCount = matchesFriendSearchQuery(friend, resolveFriendsSearchQuery(queryKey));
    queryClient.setQueryData(queryKey, patchFriendsDataAfterRemoval(currentData, friend.id, shouldAdjustCount));
  }

  const friendsQueries = queryClient.getQueriesData<FriendsInfiniteData>({
    queryKey: friendsQueryKeys.paginated('friends'),
  });
  for (const [queryKey, currentData] of friendsQueries) {
    if (!isPaginatedFriendsQueryKey(queryKey)) {
      continue;
    }

    const shouldIncludeFriend = matchesFriendSearchQuery(nextFriend, resolveFriendsSearchQuery(queryKey));
    queryClient.setQueryData(queryKey, patchFriendsDataAfterUpsert(currentData, nextFriend, shouldIncludeFriend));
  }

  const baseFriendsQueryKey = friendsQueryKeys.paginated('friends');
  if (queryClient.getQueryData(baseFriendsQueryKey) === undefined) {
    queryClient.setQueryData(baseFriendsQueryKey, createFriendsInfiniteData([nextFriend], nextSummary));
  }

  queryClient.setQueryData<FriendsCountSummary>(friendsQueryKeys.summary, nextSummary);
  applySummaryToPaginatedFriendsQueries(queryClient, nextSummary);
}

export function removeCachedFriend(queryClient: QueryClient, friend: FriendRecord): void {
  const currentSection = getFriendsSectionForStatus(friend.status);
  const nextSummary = adjustFriendsSummary(
    getMutableFriendsSummary(queryClient),
    friend.status === 'pending_received'
      ? { requestsCount: -1 }
      : friend.status === 'pending_sent'
        ? { sentCount: -1 }
        : { friendsCount: -1 },
  );
  const paginatedFriendQueries = queryClient.getQueriesData<FriendsInfiniteData>({
    queryKey: friendsQueryKeys.root,
  });

  for (const [queryKey, currentData] of paginatedFriendQueries) {
    if (!isPaginatedFriendsQueryKey(queryKey)) {
      continue;
    }

    const shouldAdjustCount =
      queryKey[3] === currentSection &&
      matchesFriendSearchQuery(friend, resolveFriendsSearchQuery(queryKey));
    queryClient.setQueryData(queryKey, patchFriendsDataAfterRemoval(currentData, friend.id, shouldAdjustCount));
  }

  queryClient.setQueryData<FriendsCountSummary>(friendsQueryKeys.summary, nextSummary);
  applySummaryToPaginatedFriendsQueries(queryClient, nextSummary);
}

function isFriendsHomeFeedQuery(query: Query): boolean {
  return isPaginatedHomeFeedQueryKey(query.queryKey) && query.queryKey[3] === 'friends';
}

function isRestaurantListDetailQueryForRemovedFriend(query: Query, removedUserId: string): boolean {
  if (
    !Array.isArray(query.queryKey) ||
    query.queryKey.length !== restaurantListQueryKeys.detailRoot.length + 1 ||
    restaurantListQueryKeys.detailRoot.some((segment, index) => query.queryKey[index] !== segment)
  ) {
    return false;
  }

  const detail = query.state.data as RestaurantListDetailRecord | undefined;
  if (!detail) {
    return false;
  }

  if (detail.list?.userId === removedUserId) {
    return true;
  }

  return detail.items.some(
    (item) =>
      item.sourceUserId === removedUserId ||
      item.bookmarkedItems.some((bookmark) => bookmark.sourceUserId === removedUserId),
  );
}

interface EvictFriendshipDependentQueriesOptions {
  removedUserId?: string;
  preserveFriendsQueries?: boolean;
}

export async function evictFriendshipDependentQueries(
  queryClient: QueryClient,
  options: EvictFriendshipDependentQueriesOptions = {},
): Promise<void> {
  const removedUserId = options.removedUserId;
  const preserveFriendsQueries = options.preserveFriendsQueries === true;
  const detailQueryFilters = removedUserId
    ? {
        predicate: (query: Query) => isRestaurantListDetailQueryForRemovedFriend(query, removedUserId),
      }
    : { queryKey: restaurantListQueryKeys.detailRoot };

  const cancelPromises = [
    queryClient.cancelQueries({ predicate: isFriendsHomeFeedQuery }),
    queryClient.cancelQueries({ queryKey: restaurantListQueryKeys.scope('friends') }),
    queryClient.cancelQueries(detailQueryFilters),
  ];
  const resetPromises = [
    queryClient.resetQueries({ predicate: isFriendsHomeFeedQuery }),
    queryClient.resetQueries({ queryKey: restaurantListQueryKeys.scope('friends') }),
    queryClient.resetQueries(detailQueryFilters),
  ];

  if (!preserveFriendsQueries) {
    cancelPromises.unshift(queryClient.cancelQueries({ queryKey: friendsQueryKeys.root }));
    resetPromises.unshift(queryClient.resetQueries({ queryKey: friendsQueryKeys.root }));
  }

  await Promise.all(cancelPromises);
  await Promise.all(resetPromises);
}
