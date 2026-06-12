import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import {
  friendsQueryKeys,
  hydrateFriendsSummaryFromPaginatedData,
  listFriendsPage,
  type FriendRecord,
} from '../features';
import {
  mergeFriendCollections,
  normalizeFriendName,
} from '../features/bills/billDraft';
import { useDebouncedValue } from './useDebouncedValue';
import { usePaginatedQueryState } from './useListQueryState';

const FRIEND_SEARCH_DEBOUNCE_MS = 250;
const MIN_SERVER_FRIEND_SEARCH_LENGTH = 2;
const EMPTY_ADDITIONAL_FRIENDS: readonly FriendRecord[] = [];

function matchesFriendSearch(friend: FriendRecord, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return (
    normalizeFriendName(friend).toLowerCase().includes(normalizedQuery) ||
    friend.email.toLowerCase().includes(normalizedQuery)
  );
}

function hasSameFriendRecord(left: FriendRecord | undefined, right: FriendRecord): boolean {
  return (
    left?.userId === right.userId &&
    left?.name === right.name &&
    left?.email === right.email &&
    left?.status === right.status &&
    left?.createdAt === right.createdAt
  );
}

interface UseAcceptedFriendPickerStateParams {
  additionalFriends?: readonly FriendRecord[];
  currentUserId?: string | null;
  listStateEnabled?: boolean;
}

export function useAcceptedFriendPickerState({
  additionalFriends = EMPTY_ADDITIONAL_FRIENDS,
  currentUserId,
  listStateEnabled = true,
}: UseAcceptedFriendPickerStateParams) {
  const queryClient = useQueryClient();
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [cachedFriendRecordsById, setCachedFriendRecordsById] = useState<Record<string, FriendRecord>>({});

  const normalizedFriendSearchQuery = friendSearchQuery.trim();
  const debouncedNormalizedFriendSearchQuery = useDebouncedValue(
    normalizedFriendSearchQuery,
    FRIEND_SEARCH_DEBOUNCE_MS,
  );
  const shouldQueryFriendsBySearch =
    normalizedFriendSearchQuery.length >= MIN_SERVER_FRIEND_SEARCH_LENGTH &&
    debouncedNormalizedFriendSearchQuery.length >= MIN_SERVER_FRIEND_SEARCH_LENGTH &&
    normalizedFriendSearchQuery === debouncedNormalizedFriendSearchQuery;
  const activeFriendSearchQuery = shouldQueryFriendsBySearch ? debouncedNormalizedFriendSearchQuery : '';

  const friendsQuery = useInfiniteQuery({
    queryKey: friendsQueryKeys.paginated(currentUserId, 'friends', activeFriendSearchQuery),
    queryFn: ({ pageParam, signal }) =>
      listFriendsPage({
        page: pageParam,
        pageSize: 20,
        search: activeFriendSearchQuery || undefined,
        section: 'friends',
        signal,
      }),
    enabled: Boolean(currentUserId),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    refetchOnReconnect: 'always',
  });
  const friendsState = usePaginatedQueryState({
    data: friendsQuery.data,
    enabled: listStateEnabled,
    isError: friendsQuery.isError,
    isFetching: friendsQuery.isFetching,
    isLoading: friendsQuery.isLoading,
    isSuccess: friendsQuery.isSuccess,
  });

  const selectableFriends = friendsState.items;
  const acceptedFriends = useMemo(
    () => mergeFriendCollections(Object.values(cachedFriendRecordsById), Array.from(additionalFriends), selectableFriends),
    [additionalFriends, cachedFriendRecordsById, selectableFriends],
  );
  const acceptedFriendById = useMemo(
    () => new Map(acceptedFriends.map((friend) => [friend.id, friend])),
    [acceptedFriends],
  );
  const totalAcceptedFriends = friendsState.totalItems;
  const shouldShowFriendSearch = normalizedFriendSearchQuery.length > 0 || totalAcceptedFriends > 5;
  const visibleFriends = useMemo(() => {
    if (shouldQueryFriendsBySearch || normalizedFriendSearchQuery.length === 0) {
      return selectableFriends;
    }

    return selectableFriends.filter((friend) => matchesFriendSearch(friend, normalizedFriendSearchQuery));
  }, [normalizedFriendSearchQuery, selectableFriends, shouldQueryFriendsBySearch]);

  useEffect(() => {
    if (activeFriendSearchQuery) {
      return;
    }

    hydrateFriendsSummaryFromPaginatedData(queryClient, currentUserId, friendsQuery.data);
  }, [activeFriendSearchQuery, currentUserId, friendsQuery.data, queryClient]);

  const cacheFriendRecords = useCallback((friends: readonly FriendRecord[]) => {
    setCachedFriendRecordsById((currentRecords) => {
      if (friends.length === 0) {
        return currentRecords;
      }

      const nextRecords = { ...currentRecords };
      let didChange = false;
      friends.forEach((friend) => {
        if (hasSameFriendRecord(currentRecords[friend.id], friend)) {
          return;
        }

        nextRecords[friend.id] = friend;
        didChange = true;
      });

      return didChange ? nextRecords : currentRecords;
    });
  }, []);

  const cacheFriendRecord = useCallback((friend: FriendRecord) => {
    cacheFriendRecords([friend]);
  }, [cacheFriendRecords]);

  useEffect(() => {
    cacheFriendRecords(mergeFriendCollections(Array.from(additionalFriends), selectableFriends));
  }, [additionalFriends, cacheFriendRecords, selectableFriends]);

  return {
    acceptedFriendById,
    acceptedFriends,
    cacheFriendRecord,
    friendSearchQuery,
    friendsQuery,
    hasBlockingFriendsError: friendsState.hasBlockingError,
    hasFriendsRefreshError: friendsState.hasRefreshError,
    normalizedFriendSearchQuery,
    selectableFriends,
    setFriendSearchQuery,
    shouldShowFriendSearch,
    totalAcceptedFriends,
    visibleFriends,
  };
}
