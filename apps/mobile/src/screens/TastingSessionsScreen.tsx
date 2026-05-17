import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  ErrorState,
  HeaderAccessoryButton,
  LoadingState,
  PageErrorToast,
  StatusPill,
} from '../components/shared';
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
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, ListItem, Text } from '../ui';
import {
  formatTastingSessionStatusLabel,
  navigateToTastingSession,
  resolveTastingSessionStatusTone,
} from './tastingSessions/shared';

type TastingSessionsScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessions'>;

const EMPTY_SESSIONS: TastingSessionRecord[] = [];

const useStyles = createThemedStyles((theme) => ({
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  action: {
    flex: 1,
  },
  section: {
    gap: theme.spacing.sm,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sessionCards: {
    gap: theme.spacing.sm,
  },
  joinBanner: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  joinBannerInvite: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.status.infoBorder,
  },
  joinBannerDisabled: {
    opacity: 0.65,
  },
  joinBannerPressed: {
    backgroundColor: theme.colors.background.muted,
  },
  joinBannerInvitePressed: {
    backgroundColor: theme.colors.status.infoBg,
  },
  joinBannerIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderRadius: theme.radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  joinBannerInviteIcon: {
    backgroundColor: theme.colors.background.surface,
  },
  joinBannerContent: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  joinBannerAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xxs,
  },
}));

function getApprovedRestaurantCount(session: TastingSessionRecord): number {
  return session.restaurants.filter((restaurant) => restaurant.status === 'approved').length;
}

function getApprovedItemCount(session: TastingSessionRecord): number {
  return session.restaurants
    .filter((restaurant) => restaurant.status === 'approved')
    .reduce((count, restaurant) => count + (restaurant.items ?? []).filter((item) => item.status === 'approved').length, 0);
}

function formatCount(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatCompletedSessionSummary(session: TastingSessionRecord): string {
  return [
    formatCount(getApprovedRestaurantCount(session), 'restaurant', 'restaurants'),
    formatCount(getApprovedItemCount(session), 'item', 'items'),
    formatCount(session.participants.length, 'taster', 'tasters'),
  ].join(', ');
}

export function TastingSessionsScreen({ navigation }: TastingSessionsScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { isOnline } = useConnectivity();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionsQuery = useQuery({
    queryKey: tastingSessionsQueryKeys.root,
    queryFn: ({ signal }) => listTastingSessions({ signal }),
  });

  const sessions = sessionsQuery.data ?? EMPTY_SESSIONS;
  const pendingInviteSession = useMemo(
    () =>
      sessions.find((session) =>
        session.invites.some((invite) => invite.invitedUserId === user?.id && invite.status === 'pending'),
      ),
    [sessions, user?.id],
  );
  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status !== 'completed'),
    [sessions],
  );
  const completedSessions = useMemo(
    () => sessions.filter((session) => session.status === 'completed'),
    [sessions],
  );
  const joinBannerDescription = pendingInviteSession
    ? `${pendingInviteSession.name}. ${isOnline ? 'Tap to join.' : 'Connect to the internet to join.'}`
    : 'Enter an invite code to join a shared tasting session.';

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
        headerScrollMode="fixed"
        onBackPress={() => navigation.navigate('Misc')}
        rightAccessory={
          <HeaderAccessoryButton
            label="Create"
            onPress={() => navigation.navigate('CreateTastingSession')}
            testID="create-tasting-session-header-button"
          />
        }
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
      headerScrollMode="fixed"
      onBackPress={() => navigation.navigate('Misc')}
      onRefresh={() => {
        void sessionsQuery.refetch();
      }}
      refreshing={sessionsQuery.isRefetching}
      rightAccessory={
        <HeaderAccessoryButton
          label="Create"
          onPress={() => navigation.navigate('CreateTastingSession')}
          testID="create-tasting-session-header-button"
        />
      }
      subtitle="Create, join, and run group tastings."
      title="Group Tastings"
    >
      {!isOnline ? <Text tone="warning">Offline mode shows saved sessions. Actions require a connection.</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(pendingInviteSession && !isOnline) }}
        disabled={Boolean(pendingInviteSession && !isOnline)}
        onPress={() => {
          if (pendingInviteSession) {
            void handleAcceptInvite(pendingInviteSession);
            return;
          }
          navigation.navigate('JoinTastingSession');
        }}
        style={({ pressed }) => [
          styles.joinBanner,
          pendingInviteSession ? styles.joinBannerInvite : null,
          pendingInviteSession && !isOnline ? styles.joinBannerDisabled : null,
          pressed && !pendingInviteSession ? styles.joinBannerPressed : null,
          pressed && pendingInviteSession ? styles.joinBannerInvitePressed : null,
        ]}
      >
        <View style={[styles.joinBannerIcon, pendingInviteSession ? styles.joinBannerInviteIcon : null]}>
          <Ionicons
            color={pendingInviteSession ? theme.colors.text.info : theme.colors.text.brand}
            name={pendingInviteSession ? 'mail-unread-outline' : 'ticket-outline'}
            size={20}
          />
        </View>
        <View style={styles.joinBannerContent}>
          <Text variant="titleSm">
            {pendingInviteSession ? "You've been invited" : 'Joining a group tasting?'}
          </Text>
          <Text tone="secondary">{joinBannerDescription}</Text>
        </View>
        <View style={styles.joinBannerAction}>
          <Text tone={pendingInviteSession ? 'info' : 'brand'} variant="label">
            {pendingInviteSession ? 'Join' : 'Code'}
          </Text>
          <Ionicons
            color={pendingInviteSession ? theme.colors.text.info : theme.colors.text.brand}
            name="chevron-forward"
            size={16}
          />
        </View>
      </Pressable>

      <PageErrorToast errorMessage={errorMessage} title="Tasting action failed" />
      <PageErrorToast
        actionLabel="Retry"
        errorMessage={sessionsQuery.isError && sessions.length > 0 ? 'Could not refresh sessions. Showing saved data.' : null}
        onAction={() => {
          void sessionsQuery.refetch();
        }}
        title="Sessions may be stale"
      />

      {sessionsQuery.isLoading && sessions.length === 0 ? <LoadingState label="Loading group tastings..." /> : null}

      {!sessionsQuery.isLoading && sessions.length === 0 ? (
        <EmptyState description="No sessions yet." title="No group tastings" />
      ) : null}

      {activeSessions.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMd">Active</Text>
            <Text tone="muted" variant="label">{formatCount(activeSessions.length, 'session', 'sessions')}</Text>
          </View>
          <View style={styles.sessionCards}>
            {activeSessions.map((session) => {
              const pendingInvite = session.invites.find(
                (invite) => invite.invitedUserId === user?.id && invite.status === 'pending',
              );
              return (
                <Card key={session.id}>
                  <ListItem
                    description={`${session.joinedCount}/${session.maxParticipants} joined`}
                    onPress={() => navigateToTastingSession(navigation, session)}
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
                      <Button
                        disabled={!isOnline}
                        label="Join Invite"
                        onPress={() => void handleAcceptInvite(session)}
                        style={styles.action}
                      />
                      <Button
                        disabled={!isOnline}
                        label="Dismiss"
                        onPress={() => void handleDismissInvite(session)}
                        style={styles.action}
                        variant="secondary"
                      />
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        </View>
      ) : null}

      {completedSessions.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMd">Completed</Text>
            <Text tone="muted" variant="label">{formatCount(completedSessions.length, 'session', 'sessions')}</Text>
          </View>
          <View style={styles.sessionCards}>
            {completedSessions.map((session) => (
              <Card key={session.id}>
                <ListItem
                  description={formatCompletedSessionSummary(session)}
                  onPress={() => navigation.navigate('TastingSessionResults', { sessionId: session.id })}
                  title={session.name}
                  trailing={
                    <StatusPill
                      label={formatTastingSessionStatusLabel(session.status)}
                      tone={resolveTastingSessionStatusTone(session.status)}
                    />
                  }
                />
              </Card>
            ))}
          </View>
        </View>
      ) : null}
    </BackHeaderScreenScaffold>
  );
}
