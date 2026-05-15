import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BackHeaderScreenScaffold, EmptyState, ErrorState, PageErrorToast, StatusPill } from '../components/shared';
import {
  acceptTastingInvite,
  dismissTastingInvite,
  listTastingSessions,
  tastingSessionsQueryKeys,
  type TastingSessionRecord,
} from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, ListItem, Text } from '../ui';
import {
  formatTastingSessionStatusLabel,
  navigateToTastingSession,
  resolveTastingSessionStatusTone,
} from './tastingSessions/shared';

type TastingSessionsScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessions'>;
type SessionFilter = 'active' | 'completed' | 'invited';

const EMPTY_SESSIONS: TastingSessionRecord[] = [];

const useStyles = createThemedStyles((theme) => ({
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  action: {
    flex: 1,
  },
}));

export function TastingSessionsScreen({ navigation }: TastingSessionsScreenProps) {
  const styles = useStyles();
  const { isOnline } = useConnectivity();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<SessionFilter>('active');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionsQuery = useQuery({
    queryKey: tastingSessionsQueryKeys.root,
    queryFn: ({ signal }) => listTastingSessions({ signal }),
  });

  const sessions = sessionsQuery.data ?? EMPTY_SESSIONS;
  const filteredSessions = useMemo(() => {
    if (filter === 'completed') {
      return sessions.filter((session) => session.status === 'completed');
    }
    if (filter === 'invited') {
      return sessions.filter((session) =>
        session.invites.some((invite) => invite.invitedUserId === user?.id && invite.status === 'pending'),
      );
    }
    return sessions.filter((session) => session.status !== 'completed');
  }, [filter, sessions, user?.id]);

  const handleAcceptInvite = async (session: TastingSessionRecord) => {
    if (!isOnline) {
      setErrorMessage('Connect to the internet to join a tasting session.');
      return;
    }
    try {
      setErrorMessage(null);
      const nextSession = await acceptTastingInvite(session.id);
      await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.root });
      navigateToTastingSession(navigation, nextSession);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not join session.');
    }
  };

  const handleDismissInvite = async (session: TastingSessionRecord) => {
    if (!isOnline) {
      setErrorMessage('Connect to the internet to dismiss this invite.');
      return;
    }
    try {
      setErrorMessage(null);
      await dismissTastingInvite(session.id);
      await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.root });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not dismiss invite.');
    }
  };

  if (sessionsQuery.isError && sessions.length === 0) {
    return (
      <BackHeaderScreenScaffold
        onBackPress={() => navigation.navigate('Misc')}
        subtitle="Create, join, and run group tastings."
        title="Group Tastings"
      >
        <ErrorState
          description="Could not load group tastings."
          onRetry={() => {
            void sessionsQuery.refetch();
          }}
          title="Sessions unavailable"
        />
      </BackHeaderScreenScaffold>
    );
  }

  return (
    <BackHeaderScreenScaffold
      onBackPress={() => navigation.navigate('Misc')}
      subtitle="Create, join, and run group tastings."
      title="Group Tastings"
    >
      {!isOnline ? <Text tone="warning">Offline mode shows saved sessions. Actions require a connection.</Text> : null}

      <View style={styles.actions}>
        <Button label="Create" onPress={() => navigation.navigate('CreateTastingSession')} style={styles.action} />
        <Button
          label="Join"
          onPress={() => navigation.navigate('JoinTastingSession')}
          style={styles.action}
          variant="secondary"
        />
      </View>

      <View style={styles.actions}>
        <Button label="Active" onPress={() => setFilter('active')} style={styles.action} variant={filter === 'active' ? 'primary' : 'secondary'} />
        <Button label="Invited" onPress={() => setFilter('invited')} style={styles.action} variant={filter === 'invited' ? 'primary' : 'secondary'} />
        <Button label="Done" onPress={() => setFilter('completed')} style={styles.action} variant={filter === 'completed' ? 'primary' : 'secondary'} />
      </View>

      <PageErrorToast errorMessage={errorMessage} title="Tasting action failed" />
      <PageErrorToast
        actionLabel="Retry"
        errorMessage={sessionsQuery.isError && sessions.length > 0 ? 'Could not refresh sessions. Showing saved data.' : null}
        onAction={() => {
          void sessionsQuery.refetch();
        }}
        title="Sessions may be stale"
      />

      {!sessionsQuery.isLoading && filteredSessions.length === 0 ? (
        <EmptyState description="No sessions match this filter." title="No group tastings" />
      ) : null}

      {filteredSessions.map((session) => {
        const pendingInvite = session.invites.find((invite) => invite.invitedUserId === user?.id && invite.status === 'pending');
        return (
          <Card key={session.id}>
            <ListItem
              description={`${session.joinedCount}/${session.maxParticipants} joined`}
              title={session.name}
              trailing={
                <StatusPill
                  label={formatTastingSessionStatusLabel(session.status)}
                  tone={resolveTastingSessionStatusTone(session.status)}
                />
              }
            />
            {pendingInvite ? (
              <View style={styles.actions}>
                <Button disabled={!isOnline} label="Join Invite" onPress={() => void handleAcceptInvite(session)} style={styles.action} />
                <Button disabled={!isOnline} label="Dismiss" onPress={() => void handleDismissInvite(session)} style={styles.action} variant="secondary" />
              </View>
            ) : (
              <Button label="Open Session" onPress={() => navigateToTastingSession(navigation, session)} variant="secondary" />
            )}
          </Card>
        );
      })}
    </BackHeaderScreenScaffold>
  );
}
