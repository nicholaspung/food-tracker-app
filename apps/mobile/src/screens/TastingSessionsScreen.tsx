import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '../ui/AppIcon';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  ErrorState,
  HeaderAccessoryButton,
  LoadingState,
  OptionList,
  OptionListInlineBody,
  OptionListRow,
  PageErrorToast,
  StatusPill,
} from '../components/shared';
import {
  listTastingSessions,
  tastingSessionsQueryKeys,
  type TastingSessionRecord,
  useTastingSessionWrites,
} from '../features';
import { usePullToRefreshState } from '../hooks/usePullToRefreshState';
import { formatStoredCalendarDateLabel } from '../lib/dateFormatting';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Text } from '../ui';
import {
  formatTastingSessionStatusLabel,
  getTastingInviteDisplayStatus,
  isTastingInviteWindowOpen,
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

function formatCompletedSessionListSubtitle(session: TastingSessionRecord): string {
  const sessionDate = formatStoredCalendarDateLabel(session.updatedAt || session.createdAt, {
    fallback: 'Unknown date',
    locale: 'en-US',
  });
  return `${sessionDate} - ${formatCompletedSessionSummary(session)}`;
}

function getSessionSortTime(session: TastingSessionRecord): number {
  const timestamp = Date.parse(session.updatedAt || session.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortSessionsNewestFirst(sessions: TastingSessionRecord[]): TastingSessionRecord[] {
  return [...sessions].sort((firstSession, secondSession) => {
    const timeDifference = getSessionSortTime(secondSession) - getSessionSortTime(firstSession);
    if (timeDifference !== 0) {
      return timeDifference;
    }
    return secondSession.id.localeCompare(firstSession.id);
  });
}

function isCurrentUserParticipant(session: TastingSessionRecord, userId: string | undefined): boolean {
  return Boolean(userId && session.participants.some((participant) => participant.userId === userId));
}

function hasCurrentUserRevokedInvite(session: TastingSessionRecord, userId: string | undefined): boolean {
  return Boolean(
    userId &&
      session.leaderUserId !== userId &&
      session.invites.some((invite) => invite.invitedUserId === userId && invite.status === 'revoked'),
  );
}

function isExpiredInviteOnlySession(session: TastingSessionRecord, userId: string | undefined): boolean {
  if (!userId || session.leaderUserId === userId || isCurrentUserParticipant(session, userId)) {
    return false;
  }

  return session.invites.some(
    (invite) =>
      invite.invitedUserId === userId &&
      getTastingInviteDisplayStatus(invite, session) === 'expired',
  );
}

function hasOpenPendingInvite(session: TastingSessionRecord, userId: string | undefined): boolean {
  return Boolean(
    userId &&
      isTastingInviteWindowOpen(session.joinExpiresAt) &&
      session.invites.some((invite) => invite.invitedUserId === userId && invite.status === 'pending'),
  );
}

function isVisibleActiveSession(session: TastingSessionRecord, userId: string | undefined): boolean {
  if (session.status === 'completed') {
    return false;
  }
  if (!userId) {
    return false;
  }
  if (hasCurrentUserRevokedInvite(session, userId)) {
    return false;
  }
  return session.leaderUserId === userId || isCurrentUserParticipant(session, userId) || hasOpenPendingInvite(session, userId);
}

function isVisibleCompletedSession(session: TastingSessionRecord, userId: string | undefined): boolean {
  if (session.status !== 'completed' || !userId) {
    return false;
  }
  if (hasCurrentUserRevokedInvite(session, userId)) {
    return false;
  }
  return session.leaderUserId === userId || isCurrentUserParticipant(session, userId);
}

export function TastingSessionsScreen({ navigation, route }: TastingSessionsScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { isOnline } = useConnectivity();
  const { user } = useAuth();
  const tastingSessionWrites = useTastingSessionWrites();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionsQuery = useQuery({
    queryKey: tastingSessionsQueryKeys.root,
    queryFn: ({ signal }) => listTastingSessions({ signal }),
    enabled: Boolean(user?.id && isOnline),
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    staleTime: 0,
  });
  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(sessionsQuery.isRefetching);
  const refetchSessions = sessionsQuery.refetch;
  const handleRefresh = useCallback(async () => {
    await runPullRefresh(async () => {
      await refetchSessions();
    });
  }, [refetchSessions, runPullRefresh]);

  const hasResolvedSessions = sessionsQuery.data !== undefined;
  const sessions = sessionsQuery.data ?? EMPTY_SESSIONS;
  const showOfflineUnavailable = !isOnline && !hasResolvedSessions && !sessionsQuery.isLoading;
  const showEmptySessions = !sessionsQuery.isLoading && sessions.length === 0 && !showOfflineUnavailable;
  useEffect(() => {
    if (!route.params?.errorMessage) {
      return;
    }

    setErrorMessage(route.params.errorMessage);
    navigation.setParams({ errorMessage: undefined });
  }, [navigation, route.params?.errorMessage]);

  useEffect(() => {
    if (!route.params?.refreshSignal) {
      return;
    }

    void refetchSessions();
    navigation.setParams({ refreshSignal: undefined });
  }, [navigation, refetchSessions, route.params?.refreshSignal]);

  const pendingInviteSessions = useMemo(
    () =>
      sessions.filter((session) =>
        session.invites.some((invite) => invite.invitedUserId === user?.id && invite.status === 'pending'),
      ),
    [sessions, user?.id],
  );
  const activePendingInviteSession = useMemo(
    () => pendingInviteSessions.find((session) => isTastingInviteWindowOpen(session.joinExpiresAt)),
    [pendingInviteSessions],
  );
  const expiredPendingInviteSession = useMemo(
    () => pendingInviteSessions.find((session) => isExpiredInviteOnlySession(session, user?.id)),
    [pendingInviteSessions, user?.id],
  );
  const hasExpiredPendingInvite = Boolean(expiredPendingInviteSession);
  const activeSessions = useMemo(
    () => sortSessionsNewestFirst(sessions.filter((session) => isVisibleActiveSession(session, user?.id))),
    [sessions, user?.id],
  );
  const completedSessions = useMemo(
    () => sortSessionsNewestFirst(sessions.filter((session) => isVisibleCompletedSession(session, user?.id))),
    [sessions, user?.id],
  );
  const joinBannerDescription = activePendingInviteSession
    ? `${activePendingInviteSession.name}. ${isOnline ? 'Tap to join.' : 'Connect to the internet to join.'}`
    : hasExpiredPendingInvite
      ? 'An invite expired. Enter a new code or wait for the leader to reopen the window.'
    : 'Enter an invite code to join a shared tasting session.';

  const handleAcceptInvite = async (session: TastingSessionRecord) => {
    try {
      setErrorMessage(null);
      const acceptResult = await tastingSessionWrites.acceptInvite({
        isOnline,
        sessionId: session.id,
      });
      if (acceptResult.status === 'blocked') {
        setErrorMessage(acceptResult.message);
        return;
      }
      navigateToTastingSession(navigation, acceptResult.result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not join session.');
    }
  };

  const handleDismissInvite = async (session: TastingSessionRecord) => {
    try {
      setErrorMessage(null);
      const dismissResult = await tastingSessionWrites.dismissInvite({
        isOnline,
        sessionId: session.id,
      });
      if (dismissResult.status === 'blocked') {
        setErrorMessage(dismissResult.message);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not dismiss invite.');
    }
  };

  if (sessionsQuery.isError && sessions.length === 0) {
    return (
      <BackHeaderScreenScaffold
        headerScrollMode="fixed"
        onBackPress={() => navigation.navigate('Misc')}
        onRefresh={handleRefresh}
        refreshing={isPullRefreshing}
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
      onRefresh={handleRefresh}
      refreshing={isPullRefreshing}
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

      {expiredPendingInviteSession && !activePendingInviteSession ? (
        <View style={styles.joinBanner}>
          <View style={styles.joinBannerIcon}>
            <Ionicons color={theme.colors.text.brand} name="time-outline" size={20} />
          </View>
          <View style={styles.joinBannerContent}>
            <Text variant="titleSm">Invite expired</Text>
            <Text tone="secondary">{joinBannerDescription}</Text>
          </View>
          <Button
            disabled={!isOnline}
            label="Dismiss"
            onPress={() => void handleDismissInvite(expiredPendingInviteSession)}
            variant="secondary"
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(activePendingInviteSession && !isOnline) }}
          disabled={Boolean(activePendingInviteSession && !isOnline)}
          onPress={() => {
            if (activePendingInviteSession) {
              void handleAcceptInvite(activePendingInviteSession);
              return;
            }
            navigation.navigate('JoinTastingSession');
          }}
          style={({ pressed }) => [
            styles.joinBanner,
            activePendingInviteSession ? styles.joinBannerInvite : null,
            activePendingInviteSession && !isOnline ? styles.joinBannerDisabled : null,
            pressed && !activePendingInviteSession ? styles.joinBannerPressed : null,
            pressed && activePendingInviteSession ? styles.joinBannerInvitePressed : null,
          ]}
        >
          <View style={[styles.joinBannerIcon, activePendingInviteSession ? styles.joinBannerInviteIcon : null]}>
            <Ionicons
              color={activePendingInviteSession ? theme.colors.text.info : theme.colors.text.brand}
              name={activePendingInviteSession ? 'mail-unread-outline' : 'ticket-outline'}
              size={20}
            />
          </View>
          <View style={styles.joinBannerContent}>
            <Text variant="titleSm">
              {activePendingInviteSession ? "You've been invited" : 'Joining a group tasting?'}
            </Text>
            <Text tone="secondary">{joinBannerDescription}</Text>
          </View>
          <View style={styles.joinBannerAction}>
            <Text tone={activePendingInviteSession ? 'info' : 'brand'} variant="label">
              {activePendingInviteSession ? 'Join' : 'Code'}
            </Text>
            <Ionicons
              color={activePendingInviteSession ? theme.colors.text.info : theme.colors.text.brand}
              name="chevron-forward"
              size={16}
            />
          </View>
        </Pressable>
      )}

      <PageErrorToast errorMessage={errorMessage} title="Tasting action failed" />
      <PageErrorToast
        actionLabel="Retry"
        errorMessage={sessionsQuery.isError && sessions.length > 0 ? 'Could not refresh sessions. Showing saved data.' : null}
        onAction={() => {
          void sessionsQuery.refetch();
        }}
        title="Sessions may be stale"
      />

      {showOfflineUnavailable ? (
        <EmptyState
          description="Connect to load group tastings, or open this screen after sessions have been saved locally."
          title="No saved sessions available offline"
        />
      ) : null}

      {sessionsQuery.isLoading && sessions.length === 0 ? <LoadingState label="Loading group tastings..." /> : null}

      {showEmptySessions ? (
        <EmptyState description="No sessions yet." title="No group tastings" />
      ) : null}

      {activeSessions.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMd">Active</Text>
            <Text tone="muted" variant="label">{formatCount(activeSessions.length, 'session', 'sessions')}</Text>
          </View>
          <OptionList>
            {activeSessions.map((session) => {
              const pendingInvite = session.invites.find(
                (invite) => invite.invitedUserId === user?.id && invite.status === 'pending',
              );
              const pendingInviteDisplayStatus = pendingInvite
                ? getTastingInviteDisplayStatus(pendingInvite, session)
                : null;
              const isLast = session.id === activeSessions[activeSessions.length - 1]?.id;
              return (
                <View key={session.id}>
                  <OptionListRow
                    isLast={isLast && !pendingInvite}
                    onPress={() => navigateToTastingSession(navigation, session)}
                    rightAccessory={
                      <StatusPill
                        label={formatTastingSessionStatusLabel(session.status)}
                        tone={resolveTastingSessionStatusTone(session.status)}
                      />
                    }
                    subtitle={`${session.joinedCount}/${session.maxParticipants} joined`}
                    title={session.name}
                  />
                  {pendingInvite ? (
                    <OptionListInlineBody withBottomDivider={!isLast}>
                      <View style={styles.actions}>
                        {pendingInviteDisplayStatus === 'expired' ? (
                          <StatusPill label="Expired" tone="muted" />
                        ) : (
                          <Button
                            disabled={!isOnline}
                            label="Join Invite"
                            onPress={() => void handleAcceptInvite(session)}
                            style={styles.action}
                          />
                        )}
                        <Button
                          disabled={!isOnline}
                          label="Dismiss"
                          onPress={() => void handleDismissInvite(session)}
                          style={styles.action}
                          variant="secondary"
                        />
                      </View>
                    </OptionListInlineBody>
                  ) : null}
                </View>
              );
            })}
          </OptionList>
        </View>
      ) : null}

      {completedSessions.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMd">Completed</Text>
            <Text tone="muted" variant="label">{formatCount(completedSessions.length, 'session', 'sessions')}</Text>
          </View>
          <OptionList>
            {completedSessions.map((session, index) => (
              <OptionListRow
                isLast={index === completedSessions.length - 1}
                key={session.id}
                onPress={() => navigation.navigate('TastingSessionResults', { sessionId: session.id })}
                rightAccessory={
                  <StatusPill
                    label={formatTastingSessionStatusLabel(session.status)}
                    tone={resolveTastingSessionStatusTone(session.status)}
                  />
                }
                subtitle={formatCompletedSessionListSubtitle(session)}
                title={session.name}
              />
            ))}
          </OptionList>
        </View>
      ) : null}
    </BackHeaderScreenScaffold>
  );
}
