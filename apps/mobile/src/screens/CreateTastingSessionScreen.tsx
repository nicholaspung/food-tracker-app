import { useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { FeatureFormScreenScaffold, PageErrorToast } from '../components/shared';
import {
  type FriendRecord,
  useTastingSessionLifecycleWrites,
} from '../features';
import { useAcceptedFriendPickerState } from '../hooks/useAcceptedFriendPickerState';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { Card, Input, Text } from '../ui';
import { BillParticipantPickerSection } from './createBill/BillParticipantPickerSection';
import { navigateToTastingSession } from './tastingSessions/shared';
import { TastingJoinWindowDurationSelector } from './tastingSessions/TastingJoinWindowDurationSelector';

type CreateTastingSessionScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateTastingSession'>;

export function CreateTastingSessionScreen({ navigation }: CreateTastingSessionScreenProps) {
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const userId = user?.id ?? null;
  const tastingSessionWrites = useTastingSessionLifecycleWrites();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState<number>(60);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const friendPicker = useAcceptedFriendPickerState({
    currentUserId: userId,
    listStateEnabled: Boolean(userId),
  });
  const selectedFriends = useMemo(
    () =>
      selectedFriendIds
        .map((friendId) => friendPicker.acceptedFriendById.get(friendId))
        .filter((friend): friend is FriendRecord => Boolean(friend)),
    [friendPicker.acceptedFriendById, selectedFriendIds],
  );

  const handleCreate = async () => {
    if (!name.trim()) {
      setErrorMessage('Session name is required.');
      return;
    }
    try {
      setErrorMessage(null);
      const invitedUserIds = selectedFriendIds
        .map((friendId) => friendPicker.acceptedFriendById.get(friendId)?.userId)
        .filter((userId): userId is string => Boolean(userId?.trim()));
      const createResult = await tastingSessionWrites.createSession({
        invitedUserIds,
        joinDurationMinutes: duration,
        name,
      });
      if (createResult.status === 'blocked') {
        setErrorMessage(createResult.message);
        return;
      }
      if (createResult.status === 'queued') {
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
      subtitle="Name the session, choose how long friends can join, and invite friends. You’ll open a lobby next."
      title="Create Tasting"
    >
      {!isOnline ? <Text tone="warning">Creating a group tasting requires a connection.</Text> : null}
      <PageErrorToast errorMessage={errorMessage} title="Create failed" />
      <Card>
        <Input label="Session name" onChangeText={setName} placeholder="Friday ramen tasting" value={name} />
        <Text variant="label">Join window</Text>
        <Text tone="secondary">Friends can join the lobby until this window closes.</Text>
        <TastingJoinWindowDurationSelector onChange={setDuration} value={duration} />
      </Card>
      <BillParticipantPickerSection
        allowCustomParticipants={false}
        confirmLabel="Confirm Invites"
        customParticipants={[]}
        emptyFriendsText="No accepted friends found."
        emptySelectionLabel="Choose friends to invite"
        friendSearchQuery={friendPicker.friendSearchQuery}
        hasBlockingFriendsError={friendPicker.hasBlockingFriendsError}
        hint="Choose friends to invite when the lobby opens."
        isFetchingNextPage={friendPicker.friendsQuery.isFetchingNextPage}
        isLoading={friendPicker.friendsQuery.isLoading}
        mode="friendInvites"
        normalizedFriendSearchQuery={friendPicker.normalizedFriendSearchQuery}
        pickerAccessibilityLabel="Select tasting invitees"
        pickerDescription="Choose friends to invite, then confirm your selection."
        pickerModalTestID="tasting-friends-picker-modal"
        pickerTitle="Invite Friends"
        pickerTriggerTestID="tasting-friends-picker-trigger"
        selectedCountLabel={(count) => `${count} friend${count === 1 ? '' : 's'} invited`}
        selectedFriendIds={selectedFriendIds}
        selectedFriends={selectedFriends}
        title="Invite friends"
        totalAcceptedFriends={friendPicker.totalAcceptedFriends}
        visibleFriends={friendPicker.visibleFriends}
        onChangeFriendSearchQuery={friendPicker.setFriendSearchQuery}
        onConfirmSelection={({ friendIds }) => {
          setSelectedFriendIds(friendIds);
        }}
        onLoadMore={() => {
          void friendPicker.friendsQuery.fetchNextPage();
        }}
        onRetry={() => {
          void friendPicker.friendsQuery.refetch();
        }}
        showLoadMore={friendPicker.visibleFriends.length > 0 && Boolean(friendPicker.friendsQuery.hasNextPage)}
      />
    </FeatureFormScreenScaffold>
  );
}
