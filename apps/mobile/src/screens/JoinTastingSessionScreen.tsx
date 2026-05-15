import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { FeatureFormScreenScaffold, PageErrorToast } from '../components/shared';
import { joinTastingSession, tastingSessionsQueryKeys } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { Card, Input, Text } from '../ui';
import { navigateToTastingSession } from './tastingSessions/shared';

type JoinTastingSessionScreenProps = NativeStackScreenProps<RootStackParamList, 'JoinTastingSession'>;

export function JoinTastingSessionScreen({ navigation }: JoinTastingSessionScreenProps) {
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const [inviteCode, setInviteCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!isOnline) {
      setErrorMessage('Connect to the internet to join a group tasting.');
      return;
    }
    try {
      setErrorMessage(null);
      const session = await joinTastingSession({ inviteCode });
      await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.root });
      navigateToTastingSession(navigation, session);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not join tasting session.');
    }
  };

  return (
    <FeatureFormScreenScaffold
      onBackPress={() => navigation.goBack()}
      primaryAction={{
        disabled: inviteCode.trim().length !== 6 || !isOnline,
        label: 'Join Session',
        onPress: () => {
          void handleJoin();
        },
      }}
      subtitle="Enter the temporary code from the leader."
      title="Join Tasting"
    >
      {!isOnline ? <Text tone="warning">Joining requires a connection.</Text> : null}
      <PageErrorToast errorMessage={errorMessage} title="Join failed" />
      <Card>
        <Input
          autoCapitalize="characters"
          autoCorrect={false}
          label="6-character invite code"
          maxLength={6}
          onChangeText={(value) => setInviteCode(value.toUpperCase())}
          placeholder="ABC123"
          value={inviteCode}
        />
      </Card>
    </FeatureFormScreenScaffold>
  );
}
