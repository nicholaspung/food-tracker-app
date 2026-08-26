import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { FeatureFormScreenScaffold, PageErrorToast } from '../components/shared';
import {
  usePendingTastingSessionLifecycleWrites,
  useTastingSessionLifecycleWrites,
} from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { Card, Input, Text } from '../ui';
import { navigateToTastingSession } from './tastingSessions/shared';

type JoinTastingSessionScreenProps = NativeStackScreenProps<RootStackParamList, 'JoinTastingSession'>;

export function JoinTastingSessionScreen({ navigation }: JoinTastingSessionScreenProps) {
  const { isOnline } = useConnectivity();
  const tastingSessionWrites = useTastingSessionLifecycleWrites();
  const pendingTastingSessionWrites = usePendingTastingSessionLifecycleWrites();
  const [inviteCode, setInviteCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [didQueueJoin, setDidQueueJoin] = useState(false);
  const normalizedInviteCode = inviteCode.trim().toUpperCase();
  const joinQueueState = pendingTastingSessionWrites.getJoinState({
    inviteCode: normalizedInviteCode,
  });
  const isJoinPending = didQueueJoin || joinQueueState.status === 'pending';

  useEffect(() => {
    if (didQueueJoin && joinQueueState.status !== 'idle') {
      setDidQueueJoin(false);
    }
  }, [didQueueJoin, joinQueueState.status]);

  const handleJoin = async () => {
    if (isJoinPending || isSubmitting) {
      return;
    }
    try {
      setErrorMessage(null);
      setIsSubmitting(true);
      const joinResult = await tastingSessionWrites.joinSession({ inviteCode: normalizedInviteCode });
      if (joinResult.status === 'blocked') {
        setErrorMessage(joinResult.message);
        return;
      }
      if (joinResult.status === 'queued') {
        setDidQueueJoin(true);
        await pendingTastingSessionWrites.refreshPendingWrites();
        return;
      }
      navigateToTastingSession(navigation, joinResult.result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not join tasting session.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FeatureFormScreenScaffold
      onBackPress={() => navigation.goBack()}
      primaryAction={{
        disabled: normalizedInviteCode.length !== 6 || isJoinPending || isSubmitting,
        label: isJoinPending ? 'Join Queued' : 'Join Session',
        loading: isSubmitting,
        onPress: () => {
          void handleJoin();
        },
      }}
      subtitle="Enter the 6-character code from the leader. After joining, you’ll wait in the lobby until the leader starts planning."
      title="Join Tasting"
    >
      {isJoinPending ? (
        <Text tone="success">Join request queued. It will run when you reconnect.</Text>
      ) : joinQueueState.status === 'failed' ? (
        <Text tone="danger">
          Queued join failed to sync: {joinQueueState.message} Retry it from the sync banner.
        </Text>
      ) : !isOnline ? (
        <Text tone="secondary">You can join with an invite code offline. It will sync when you reconnect.</Text>
      ) : null}
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
