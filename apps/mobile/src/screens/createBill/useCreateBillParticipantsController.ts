import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import {
  getBillById,
  listFriendsPage,
  type FriendRecord,
} from '../../features';
import { usePaginatedQueryState } from '../../hooks/useListQueryState';
import {
  mapBillParticipantToFriendRecord,
  mergeFriendCollections,
  normalizeFriendName,
  type DraftParticipant,
} from './shared';

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
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [payerParticipantId, setPayerParticipantId] = useState('');
  const [isPayerDropdownOpen, setIsPayerDropdownOpen] = useState(false);
  const [cachedFriendRecordsById, setCachedFriendRecordsById] = useState<
    Record<string, FriendRecord>
  >({});

  const normalizedFriendSearchQuery = friendSearchQuery.trim();

  const friendsQuery = useInfiniteQuery({
    queryKey: [
      'feature',
      'friends',
      'paginated',
      'friends',
      'bill-picker',
      normalizedFriendSearchQuery,
    ],
    queryFn: ({ pageParam }) =>
      listFriendsPage({
        section: 'friends',
        page: pageParam,
        pageSize: 20,
        search: normalizedFriendSearchQuery || undefined,
      }),
    initialPageParam: 1,
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
    queryKey: ['feature', 'bill', editBillId],
    queryFn: () => getBillById(editBillId as string),
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
  const visibleFriends = selectableFriends;
  const hasBlockingFriendsError = friendsState.hasBlockingError;
  const hasFriendsRefreshError = friendsState.hasRefreshError;

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

    return mappedParticipants;
  }, [
    acceptedFriendRecordById,
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
    setSelectedFriendIds,
  };
}
