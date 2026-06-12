import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  getBillById,
  type FriendRecord,
} from '../../features';
import {
  mapBillParticipantToFriendRecord,
  normalizeFriendName,
  sanitizeParticipantName,
  type DraftCustomParticipant,
  type DraftParticipant,
} from '../../features/bills/billDraft';
import { billsQueryKeys } from '../../features/store/billsQuery';
import { useAcceptedFriendPickerState } from '../../hooks/useAcceptedFriendPickerState';

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
  const [payerParticipantId, setPayerParticipantId] = useState('');
  const [isPayerDropdownOpen, setIsPayerDropdownOpen] = useState(false);

  const billQuery = useQuery({
    queryKey: billsQueryKeys.detail(editBillId ?? ''),
    queryFn: ({ signal }) => getBillById(editBillId as string, { signal }),
    enabled: isEditMode,
  });

  const billParticipantFriends = useMemo(
    () =>
      (billQuery.data?.participants ?? [])
        .map((participant) =>
          mapBillParticipantToFriendRecord(participant, currentUserId),
        )
        .filter((friend): friend is FriendRecord => friend !== null),
    [billQuery.data?.participants, currentUserId],
  );
  const friendPicker = useAcceptedFriendPickerState({
    additionalFriends: billParticipantFriends,
    currentUserId,
  });
  const {
    acceptedFriendById: acceptedFriendRecordById,
    cacheFriendRecord,
    setFriendSearchQuery,
  } = friendPicker;

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
    if (!isEditMode) {
      return;
    }

    setSelectedFriendIds([]);
    setCustomParticipants([]);
    setFriendSearchQuery('');
    setPayerParticipantId('');
    setIsPayerDropdownOpen(false);
  }, [editBillId, isEditMode, setFriendSearchQuery]);

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
      cacheFriendRecord(friend);

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
    [cacheFriendRecord, onToggleFriend],
  );

  return {
    acceptedFriends: friendPicker.acceptedFriends,
    billQuery,
    customParticipants,
    friendSearchQuery: friendPicker.friendSearchQuery,
    friendsQuery: friendPicker.friendsQuery,
    hasBlockingFriendsError: friendPicker.hasBlockingFriendsError,
    hasFriendsRefreshError: friendPicker.hasFriendsRefreshError,
    isPayerDropdownOpen,
    normalizedFriendSearchQuery: friendPicker.normalizedFriendSearchQuery,
    participants,
    payerParticipantId,
    selectedFriendIds,
    shouldShowFriendSearch: friendPicker.shouldShowFriendSearch,
    totalAcceptedFriends: friendPicker.totalAcceptedFriends,
    toggleFriend,
    visibleFriends: friendPicker.visibleFriends,
    setFriendSearchQuery,
    setIsPayerDropdownOpen,
    setPayerParticipantId,
    setCustomParticipants,
    setSelectedFriendIds,
  };
}
