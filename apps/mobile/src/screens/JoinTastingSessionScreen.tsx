import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { FeatureFormScreenScaffold, PageErrorToast } from '../components/shared';
import { useTastingSessionLifecycleWrites } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { Card, Input, Text } from '../ui';
import { navigateToTastingSession } from './tastingSessions/shared';

type JoinTastingSessionScreenProps = NativeStackScreenProps<RootStackParamList, 'JoinTastingSession'>;

export function JoinTastingSessionScreen({ navigation }: JoinTastingSessionScreenProps) {
  const { isOnline } = useConnectivity();
  const tastingSessionWrites = useTastingSessionLifecycleWrites();
  const [inviteCode, setInviteCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const normalizedInviteCode = inviteCode.trim().toUpperCase();

  const handleJoin = async () => {
    try {
      setErrorMessage(null);
      const joinResult = await tastingSessionWrites.joinSession({ inviteCode: normalizedInviteCode });
      if (joinResult.status === 'blocked') {
        setErrorMessage(joinResult.message);
        return;
      }
      if (joinResult.status === 'queued') {
        return;
      }
      navigateToTastingSession(navigation, joinResult.result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not join tasting session.');
    }
  };

  return (
    <FeatureFormScreenScaffold
      onBackPress={() => navigation.goBack()}
      primaryAction={{
        disabled: normalizedInviteCode.length !== 6 || !isOnline,
        label: 'Join Session',
        onPress: () => {
          void handleJoin();
        },
      }}
      subtitle="Enter the 6-character code from the leader. After joining, you’ll wait in the lobby until the leader starts planning."
      title="Join Tasting"
    >
      {!isOnline ? <Text tone="warning">Joining requires a connection.</Text> : null}
      <PageErrorToast errorMessage={errorMessage} title="Join failed" />
      <Card>
        <Text tone="secondary">Use the temporary invite code before the join window closes.</Text>
        <Input
          autoCapitalize="characters"
          autoCorrect={false}
          label="6-character invite code"
          maxLength={6}
          onChangeText={(value) => setInviteCode(value.trim().toUpperCase())}
          placeholder="ABC123"
          value={normalizedInviteCode}
        />
      </Card>
    </FeatureFormScreenScaffold>
  );
}
