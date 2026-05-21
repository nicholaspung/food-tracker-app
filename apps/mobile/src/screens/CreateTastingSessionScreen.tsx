import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { FeatureFormScreenScaffold, PageErrorToast } from '../components/shared';
import {
  friendsQueryKeys,
  hydrateFriendsSummaryFromPaginatedData,
  listFriendsPage,
  type FriendRecord,
  useTastingSessionWrites,
} from '../features';
import {
  mergeFriendCollections,
  normalizeFriendName,
} from '../features/bills/billDraft';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePaginatedQueryState } from '../hooks/useListQueryState';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { Button, Card, Input, Text } from '../ui';
import { BillParticipantPickerSection } from './createBill/BillParticipantPickerSection';
import { navigateToTastingSession } from './tastingSessions/shared';

type CreateTastingSessionScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateTastingSession'>;

const DURATION_OPTIONS = [15, 30, 60, 120] as const;
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

export function CreateTastingSessionScreen({ navigation }: CreateTastingSessionScreenProps) {
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const tastingSessionWrites = useTastingSessionWrites();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState<number>(60);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [cachedFriendRecordsById, setCachedFriendRecordsById] = useState<Record<string, FriendRecord>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    queryKey: friendsQueryKeys.paginated(userId, 'friends', activeFriendSearchQuery),
    queryFn: ({ pageParam, signal }) =>
      listFriendsPage({
        page: pageParam,
        pageSize: 20,
        search: activeFriendSearchQuery || undefined,
        section: 'friends',
        signal,
      }),
    enabled: Boolean(userId),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    refetchOnReconnect: 'always',
  });
  const friendsState = usePaginatedQueryState({
    data: friendsQuery.data,
    enabled: Boolean(userId),
    isError: friendsQuery.isError,
    isFetching: friendsQuery.isFetching,
    isLoading: friendsQuery.isLoading,
    isSuccess: friendsQuery.isSuccess,
  });
  const selectableFriends = friendsState.items;
  const acceptedFriends = useMemo(
    () => mergeFriendCollections(Object.values(cachedFriendRecordsById), selectableFriends),
    [cachedFriendRecordsById, selectableFriends],
  );
  const acceptedFriendById = useMemo(
    () => new Map(acceptedFriends.map((friend) => [friend.id, friend])),
    [acceptedFriends],
  );
  const selectedFriends = useMemo(
    () =>
      selectedFriendIds
        .map((friendId) => acceptedFriendById.get(friendId))
        .filter((friend): friend is FriendRecord => Boolean(friend)),
    [acceptedFriendById, selectedFriendIds],
  );
  const totalAcceptedFriends = friendsState.totalItems;
  const shouldShowFriendSearch = normalizedFriendSearchQuery.length > 0 || totalAcceptedFriends > 5;
  const visibleFriends = useMemo(() => {
    if (shouldQueryFriendsBySearch || normalizedFriendSearchQuery.length === 0) {
      return selectableFriends;
    }

    return selectableFriends.filter((friend) => matchesFriendSearch(friend, normalizedFriendSearchQuery));
  }, [normalizedFriendSearchQuery, selectableFriends, shouldQueryFriendsBySearch]);
  const hasBlockingFriendsError = friendsState.hasBlockingError;

  useEffect(() => {
    if (activeFriendSearchQuery) {
      return;
    }

    hydrateFriendsSummaryFromPaginatedData(queryClient, userId, friendsQuery.data);
  }, [activeFriendSearchQuery, friendsQuery.data, queryClient, userId]);

  useEffect(() => {
    setCachedFriendRecordsById((currentRecords) => {
      if (selectableFriends.length === 0) {
        return currentRecords;
      }

      const nextRecords = { ...currentRecords };
      let didChange = false;
      selectableFriends.forEach((friend) => {
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
  }, [selectableFriends]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setErrorMessage('Session name is required.');
      return;
    }
    try {
      setErrorMessage(null);
      const invitedUserIds = selectedFriendIds
        .map((friendId) => acceptedFriendById.get(friendId)?.userId)
        .filter((userId): userId is string => Boolean(userId?.trim()));
      const createResult = await tastingSessionWrites.createSession({
        invitedUserIds,
        isOnline,
        joinDurationMinutes: duration,
        name,
      });
      if (createResult.status === 'blocked') {
        setErrorMessage(createResult.message);
        return;
      }
      navigateToTastingSession(navigation, createResult.result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create group tasting.');
    }
  };

  return (
    <FeatureFormScreenScaffold
      onBackPress={() => navigation.goBack()}
      primaryAction={{
        disabled: !name.trim() || !isOnline,
        label: 'Create Lobby',
        onPress: () => {
          void handleCreate();
        },
      }}
      subtitle="Open a lobby and invite friends."
      title="Create Tasting"
    >
      {!isOnline ? <Text tone="warning">Creating a group tasting requires a connection.</Text> : null}
      <PageErrorToast errorMessage={errorMessage} title="Create failed" />
      <Card>
        <Input label="Session name" onChangeText={setName} placeholder="Friday ramen tasting" value={name} />
        <Text variant="label">Join window</Text>
        {DURATION_OPTIONS.map((option) => (
          <Button
            key={option}
            label={option === 60 ? '1 hour' : option === 120 ? '2 hours' : `${option} minutes`}
            onPress={() => setDuration(option)}
            variant={duration === option ? 'primary' : 'secondary'}
          />
        ))}
      </Card>
      <BillParticipantPickerSection
        allowCustomParticipants={false}
        confirmLabel="Confirm Invites"
        customParticipants={[]}
        emptyFriendsText="No accepted friends found."
        emptySelectionLabel="Choose friends to invite"
        friendSearchQuery={friendSearchQuery}
        hasBlockingFriendsError={hasBlockingFriendsError}
        hint="Choose friends to invite when the lobby opens."
        isFetchingNextPage={friendsQuery.isFetchingNextPage}
        isLoading={friendsQuery.isLoading}
        mode="friendInvites"
        normalizedFriendSearchQuery={normalizedFriendSearchQuery}
        pickerAccessibilityLabel="Select tasting invitees"
        pickerDescription="Choose friends to invite, then confirm your selection."
        pickerModalTestID="tasting-friends-picker-modal"
        pickerTitle="Invite Friends"
        pickerTriggerTestID="tasting-friends-picker-trigger"
        selectedCountLabel={(count) => `${count} friend${count === 1 ? '' : 's'} invited`}
        selectedFriendIds={selectedFriendIds}
        selectedFriends={selectedFriends}
        shouldShowFriendSearch={shouldShowFriendSearch}
        title="Invite friends"
        totalAcceptedFriends={totalAcceptedFriends}
        visibleFriends={visibleFriends}
        onChangeFriendSearchQuery={setFriendSearchQuery}
        onConfirmSelection={({ friendIds }) => {
          setSelectedFriendIds(friendIds);
        }}
        onLoadMore={() => {
          void friendsQuery.fetchNextPage();
        }}
        onRetry={() => {
          void friendsQuery.refetch();
        }}
        showLoadMore={visibleFriends.length > 0 && Boolean(friendsQuery.hasNextPage)}
      />
    </FeatureFormScreenScaffold>
  );
}
