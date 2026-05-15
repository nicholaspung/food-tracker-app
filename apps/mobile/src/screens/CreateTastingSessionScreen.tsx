import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { FeatureFormScreenScaffold, PageErrorToast } from '../components/shared';
import { createTastingSession, friendsQueryKeys, listFriendsPage, tastingSessionsQueryKeys } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { Button, Card, Input, ListItem, Text } from '../ui';
import { navigateToTastingSession } from './tastingSessions/shared';

type CreateTastingSessionScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateTastingSession'>;

const DURATION_OPTIONS = [15, 30, 60, 120] as const;

export function CreateTastingSessionScreen({ navigation }: CreateTastingSessionScreenProps) {
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState<number>(60);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const friendsQuery = useQuery({
    queryKey: friendsQueryKeys.paginated('me', 'friends'),
    queryFn: ({ signal }) => listFriendsPage({ pageSize: 50, section: 'friends', signal }),
  });
  const selectedFriendIdSet = useMemo(() => new Set(selectedFriendIds), [selectedFriendIds]);

  const toggleFriend = (friendId: string) => {
    setSelectedFriendIds((current) =>
      current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId],
    );
  };

  const handleCreate = async () => {
    if (!isOnline) {
      setErrorMessage('Connect to the internet to create a group tasting.');
      return;
    }
    if (!name.trim()) {
      setErrorMessage('Session name is required.');
      return;
    }
    try {
      setErrorMessage(null);
      const session = await createTastingSession({
        invitedUserIds: selectedFriendIds,
        joinDurationMinutes: duration,
        name,
      });
      await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.root });
      navigateToTastingSession(navigation, session);
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
      <Card>
        <Text variant="label">Invite friends</Text>
        {friendsQuery.data?.items.map((friend) => (
          <ListItem
            key={friend.userId}
            description={selectedFriendIdSet.has(friend.userId) ? 'Invited' : 'Tap to invite'}
            onPress={() => toggleFriend(friend.userId)}
            title={friend.name}
          />
        ))}
        {!friendsQuery.isLoading && friendsQuery.data?.items.length === 0 ? (
          <Text tone="secondary">No accepted friends found.</Text>
        ) : null}
      </Card>
    </FeatureFormScreenScaffold>
  );
}
