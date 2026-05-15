import { useState } from 'react';
import { Share, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  ConfirmDestructiveModal,
  EmptyState,
  ErrorState,
  FeatureDetailScreenScaffold,
  PageErrorToast,
  StatusPill,
} from '../components/shared';
import {
  kickTastingParticipant,
  lockTastingSessionMembership,
  tastingSessionsQueryKeys,
  type TastingParticipantRecord,
} from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, ListItem, Text } from '../ui';
import { formatCountdown } from './tastingSessions/shared';
import { useTastingSessionDetail } from './tastingSessions/useTastingSessionDetail';

type TastingSessionLobbyScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionLobby'>;

const useStyles = createThemedStyles((theme) => ({
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  action: {
    flex: 1,
  },
}));

export function TastingSessionLobbyScreen({ navigation, route }: TastingSessionLobbyScreenProps) {
  const styles = useStyles();
  const { sessionId } = route.params;
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const sessionQuery = useTastingSessionDetail(sessionId, true);
  const [pendingKick, setPendingKick] = useState<TastingParticipantRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const session = sessionQuery.data;
  const isLeader = Boolean(session && user?.id === session.leaderUserId);

  const handleShare = async () => {
    if (!session?.inviteCode) {
      return;
    }
    await Share.share({ message: `Join my group tasting with code: ${session.inviteCode}` });
  };

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.root }),
      queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) }),
    ]);
  };

  const handleLock = async () => {
    if (!isOnline) {
      setErrorMessage('Connect to the internet to lock the group.');
      return;
    }
    try {
      const nextSession = await lockTastingSessionMembership(sessionId);
      await refresh();
      navigation.replace('TastingSessionPlanning', { sessionId: nextSession.id });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not lock group.');
    }
  };

  const handleConfirmKick = async () => {
    if (!pendingKick) {
      return;
    }
    try {
      await kickTastingParticipant(sessionId, pendingKick.id);
      setPendingKick(null);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not remove participant.');
    }
  };

  if (sessionQuery.isError && !session) {
    return (
      <FeatureDetailScreenScaffold onBackPress={() => navigation.navigate('TastingSessions')} title="Tasting Lobby">
        <ErrorState description="Could not load this tasting session." title="Session unavailable" />
      </FeatureDetailScreenScaffold>
    );
  }

  if (!session) {
    return (
      <FeatureDetailScreenScaffold onBackPress={() => navigation.navigate('TastingSessions')} title="Tasting Lobby">
        <EmptyState title="Loading lobby" />
      </FeatureDetailScreenScaffold>
    );
  }

  return (
    <FeatureDetailScreenScaffold
      onBackPress={() => navigation.navigate('TastingSessions')}
      subtitle={formatCountdown(session.joinExpiresAt)}
      title={session.name}
    >
      {!isOnline ? <Text tone="warning">Lobby actions require a connection.</Text> : null}
      <PageErrorToast errorMessage={errorMessage} title="Lobby action failed" />
      <Card>
        <View style={styles.row}>
          <Text variant="label">Lobby</Text>
          <StatusPill label={`${session.joinedCount}/${session.maxParticipants} joined`} tone="info" />
        </View>
        {isLeader && session.inviteCode ? <Text variant="titleMd">Code: {session.inviteCode}</Text> : null}
        {isLeader ? (
          <View style={styles.row}>
            <Button disabled={!session.inviteCode} label="Share" onPress={() => void handleShare()} style={styles.action} variant="secondary" />
            <Button disabled={!isOnline} label="Start Planning" onPress={() => void handleLock()} style={styles.action} />
          </View>
        ) : (
          <Text tone="secondary">Waiting for the leader to lock the group.</Text>
        )}
      </Card>

      <Card>
        <Text variant="label">Participants</Text>
        {session.participants.map((participant) => (
          <ListItem
            key={participant.id}
            description={participant.role === 'leader' ? 'Leader' : 'Joined'}
            title={participant.name}
            trailing={
              isLeader && participant.role !== 'leader' ? (
                <Button disabled={!isOnline} label="Remove" onPress={() => setPendingKick(participant)} variant="secondary" />
              ) : null
            }
          />
        ))}
      </Card>

      {isLeader && session.invites.length > 0 ? (
        <Card>
          <Text variant="label">Invites</Text>
          {session.invites.map((invite) => (
            <ListItem key={invite.id} description={invite.status} title={invite.invitedUserName} />
          ))}
        </Card>
      ) : null}

      <ConfirmDestructiveModal
        cancelLabel="Keep Participant"
        confirmLabel="Remove Participant"
        description={
          pendingKick
            ? `Remove ${pendingKick.name} from this tasting session? They will not be able to rejoin with the current code.`
            : 'Remove this participant from the tasting session?'
        }
        onCancel={() => setPendingKick(null)}
        onConfirm={() => {
          void handleConfirmKick();
        }}
        title="Remove Participant?"
        visible={Boolean(pendingKick)}
      />
    </FeatureDetailScreenScaffold>
  );
}
