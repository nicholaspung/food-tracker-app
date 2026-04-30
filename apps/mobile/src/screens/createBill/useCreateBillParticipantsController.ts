import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  friendsQueryKeys,
  getBillById,
  hydrateFriendsSummaryFromPaginatedData,
  listFriendsPage,
  type FriendRecord,
} from '../../features';
import { billsQueryKeys } from '../../features/store/billsQuery';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { usePaginatedQueryState } from '../../hooks/useListQueryState';
import {
  mapBillParticipantToFriendRecord,
  mergeFriendCollections,
  normalizeFriendName,
  sanitizeParticipantName,
  type DraftCustomParticipant,
  type DraftParticipant,
} from './shared';

const FRIEND_SEARCH_DEBOUNCE_MS = 250;
const MIN_SERVER_FRIEND_SEARCH_LENGTH = 2;

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

interface ToggleFriendEvent {
  friend: FriendRecord;
  nextSelectedFriendIds: string[];
  wasSelected: boolean;
}

interface UseCreateBillParticipantsControllerParams {
  currentUserDraftId: string;
  currentUserId?: string;
  currentUserName: string;
  editBillId?: string;
  isEditMode: boolean;
  onToggleFriend?: (event: ToggleFriendEvent) => void;
}

export function useCreateBillParticipantsController({
  currentUserDraftId,
  currentUserId,
  currentUserName,
  editBillId,
  isEditMode,
  onToggleFriend,
}: UseCreateBillParticipantsControllerParams) {
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [customParticipants, setCustomParticipants] = useState<DraftCustomParticipant[]>([]);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [payerParticipantId, setPayerParticipantId] = useState('');
  const [isPayerDropdownOpen, setIsPayerDropdownOpen] = useState(false);
  const [cachedFriendRecordsById, setCachedFriendRecordsById] = useState<
    Record<string, FriendRecord>
  >({});
  const queryClient = useQueryClient();

  const normalizedFriendSearchQuery = friendSearchQuery.trim();
  const debouncedNormalizedFriendSearchQuery = useDebouncedValue(
    normalizedFriendSearchQuery,
    FRIEND_SEARCH_DEBOUNCE_MS,
  );
  const shouldQueryFriendsBySearch =
    normalizedFriendSearchQuery.length >= MIN_SERVER_FRIEND_SEARCH_LENGTH &&
    debouncedNormalizedFriendSearchQuery.length >=
      MIN_SERVER_FRIEND_SEARCH_LENGTH &&
    normalizedFriendSearchQuery === debouncedNormalizedFriendSearchQuery;
  const activeFriendSearchQuery = shouldQueryFriendsBySearch
    ? debouncedNormalizedFriendSearchQuery
    : '';

  const friendsQuery = useInfiniteQuery({
    queryKey: friendsQueryKeys.paginated(currentUserId, 'friends', activeFriendSearchQuery),
    queryFn: ({ pageParam, signal }) =>
      listFriendsPage({
        section: 'friends',
        page: pageParam,
        pageSize: 20,
        search: activeFriendSearchQuery || undefined,
        signal,
      }),
    initialPageParam: 1,
    enabled: Boolean(currentUserId),
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    refetchOnReconnect: 'always',
  });
  const friendsState = usePaginatedQueryState({
    data: friendsQuery.data,
    isError: friendsQuery.isError,
    isFetching: friendsQuery.isFetching,
    isLoading: friendsQuery.isLoading,
    isSuccess: friendsQuery.isSuccess,
  });

  const billQuery = useQuery({
    queryKey: billsQueryKeys.detail(editBillId ?? ''),
    queryFn: ({ signal }) => getBillById(editBillId as string, { signal }),
    enabled: isEditMode,
  });

  const selectableFriends = friendsState.items;
  const billParticipantFriends = useMemo(
    () =>
      (billQuery.data?.participants ?? [])
        .map((participant) =>
          mapBillParticipantToFriendRecord(participant, currentUserId),
        )
        .filter((friend): friend is FriendRecord => friend !== null),
    [billQuery.data?.participants, currentUserId],
  );
  const acceptedFriends = useMemo(
    () =>
      mergeFriendCollections(
        Object.values(cachedFriendRecordsById),
        billParticipantFriends,
        selectableFriends,
      ),
    [billParticipantFriends, cachedFriendRecordsById, selectableFriends],
  );
  const acceptedFriendRecordById = useMemo(
    () => new Map(acceptedFriends.map((friend) => [friend.id, friend])),
    [acceptedFriends],
  );

  const totalAcceptedFriends = friendsState.totalItems;
  const shouldShowFriendSearch =
    normalizedFriendSearchQuery.length > 0 || totalAcceptedFriends > 5;
  const visibleFriends = useMemo(() => {
    if (shouldQueryFriendsBySearch || normalizedFriendSearchQuery.length === 0) {
      return selectableFriends;
    }

    return selectableFriends.filter((friend) =>
      matchesFriendSearch(friend, normalizedFriendSearchQuery),
    );
  }, [
    normalizedFriendSearchQuery,
    selectableFriends,
    shouldQueryFriendsBySearch,
  ]);
  const hasBlockingFriendsError = friendsState.hasBlockingError;
  const hasFriendsRefreshError = friendsState.hasRefreshError;

  useEffect(() => {
    if (activeFriendSearchQuery) {
      return;
    }

    hydrateFriendsSummaryFromPaginatedData(queryClient, currentUserId, friendsQuery.data);
  }, [activeFriendSearchQuery, currentUserId, friendsQuery.data, queryClient]);

  const participants = useMemo<DraftParticipant[]>(() => {
    const mappedParticipants: DraftParticipant[] = [
      {
        id: currentUserDraftId,
        name: currentUserName,
        userId: currentUserId,
        isCurrentUser: true,
      },
    ];

    selectedFriendIds.forEach((friendId) => {
      const friend = acceptedFriendRecordById.get(friendId);
      if (!friend?.userId?.trim()) {
        return;
      }

      mappedParticipants.push({
        id: `user:${friend.id}`,
        name: normalizeFriendName(friend),
        userId: friend.userId,
        isCurrentUser: false,
      });
    });

    customParticipants.forEach((participant, index) => {
      mappedParticipants.push({
        id: participant.id,
        name: sanitizeParticipantName(participant.name, `Person ${index + 1}`),
        userId: participant.userId,
        isCurrentUser: false,
      });
    });

    return mappedParticipants;
  }, [
    acceptedFriendRecordById,
    customParticipants,
    currentUserDraftId,
    currentUserId,
    currentUserName,
    selectedFriendIds,
  ]);

  useEffect(() => {
    setCachedFriendRecordsById((currentRecords) => {
      const nextFriends = mergeFriendCollections(
        billParticipantFriends,
        selectableFriends,
      );
      if (nextFriends.length === 0) {
        return currentRecords;
      }

      const nextRecords = { ...currentRecords };
      let didChange = false;
      nextFriends.forEach((friend) => {
        const existingFriend = currentRecords[friend.id];
        if (
          existingFriend?.userId === friend.userId &&
          existingFriend?.name === friend.name &&
          existingFriend?.email === friend.email &&
          existingFriend?.status === friend.status &&
          existingFriend?.createdAt === friend.createdAt
        ) {
          return;
        }

        nextRecords[friend.id] = friend;
        didChange = true;
      });

      return didChange ? nextRecords : currentRecords;
    });
  }, [billParticipantFriends, selectableFriends]);

  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    setSelectedFriendIds([]);
    setCustomParticipants([]);
    setFriendSearchQuery('');
    setPayerParticipantId('');
    setIsPayerDropdownOpen(false);
  }, [editBillId, isEditMode]);

  useEffect(() => {
    if (participants.length === 0) {
      setPayerParticipantId('');
      return;
    }

    setPayerParticipantId((currentValue) =>
      participants.some((participant) => participant.id === currentValue)
        ? currentValue
        : participants[0].id,
    );
  }, [participants]);

  useEffect(() => {
    setIsPayerDropdownOpen(false);
  }, [participants]);

  const toggleFriend = useCallback(
    (friend: FriendRecord) => {
      setCachedFriendRecordsById((currentRecords) => {
        const existingFriend = currentRecords[friend.id];
        if (
          existingFriend?.userId === friend.userId &&
          existingFriend?.name === friend.name &&
          existingFriend?.email === friend.email &&
          existingFriend?.status === friend.status &&
          existingFriend?.createdAt === friend.createdAt
        ) {
          return currentRecords;
        }

        return {
          ...currentRecords,
          [friend.id]: friend,
        };
      });

      setSelectedFriendIds((currentIds) => {
        const wasSelected = currentIds.includes(friend.id);
        const nextSelectedFriendIds = wasSelected
          ? currentIds.filter((currentId) => currentId !== friend.id)
          : [...currentIds, friend.id];

        onToggleFriend?.({
          friend,
          nextSelectedFriendIds,
          wasSelected,
        });

        return nextSelectedFriendIds;
      });
    },
    [onToggleFriend],
  );

  return {
    acceptedFriends,
    billQuery,
    customParticipants,
    friendSearchQuery,
    friendsQuery,
    hasBlockingFriendsError,
    hasFriendsRefreshError,
    isPayerDropdownOpen,
    normalizedFriendSearchQuery,
    participants,
    payerParticipantId,
    selectedFriendIds,
    shouldShowFriendSearch,
    totalAcceptedFriends,
    toggleFriend,
    visibleFriends,
    setFriendSearchQuery,
    setIsPayerDropdownOpen,
    setPayerParticipantId,
    setCustomParticipants,
    setSelectedFriendIds,
  };
}
