import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SectionList, View } from 'react-native';
import { Ionicons } from '../ui/AppIcon';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  ErrorState,
  FeatureListFooter,
  HeaderAccessoryButton,
  LoadingState,
  OptionList,
  OptionListInlineBody,
  OptionListRow,
  PageErrorToast,
  StatusPill,
} from '../components/shared';
import {
  listTastingSessionSummariesPage,
  tastingSessionsQueryKeys,
  type TastingSessionListSummary,
  useTastingSessionWrites,
} from '../features';
import { usePullToRefreshState } from '../hooks/usePullToRefreshState';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Text } from '../ui';
import {
  formatCompletedTastingSessionSubtitle,
  formatTastingSessionCount,
  formatTastingSessionStatusLabel,
  getTastingInviteDisplayStatus,
  isTastingInviteWindowOpen,
  navigateToTastingSession,
  resolveTastingSessionStatusTone,
} from './tastingSessions/shared';

type TastingSessionsScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessions'>;

const EMPTY_SESSIONS: TastingSessionListSummary[] = [];
const TASTING_SESSION_LIST_PAGE_SIZE = 20;

type TastingSessionListSection = {
  key: 'active' | 'completed';
  title: string;
  data: TastingSessionListSummary[];
};

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
  screenBody: {
    flex: 1,
    paddingBottom: 0,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  sectionHeader: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.app,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.xs,
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

function getSessionSortTime(session: TastingSessionListSummary): number {
  const timestamp = Date.parse(session.updatedAt || session.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortSessionsNewestFirst(sessions: TastingSessionListSummary[]): TastingSessionListSummary[] {
  return [...sessions].sort((firstSession, secondSession) => {
    const timeDifference = getSessionSortTime(secondSession) - getSessionSortTime(firstSession);
    if (timeDifference !== 0) {
      return timeDifference;
    }
    return secondSession.id.localeCompare(firstSession.id);
  });
}

function isCurrentUserParticipant(session: TastingSessionListSummary, userId: string | undefined): boolean {
  return Boolean(userId && session.viewerParticipant);
}

function hasCurrentUserRevokedInvite(session: TastingSessionListSummary, userId: string | undefined): boolean {
  return Boolean(
    userId &&
      session.leaderUserId !== userId &&
      session.viewerInvite?.invitedUserId === userId &&
      session.viewerInvite.status === 'revoked',
  );
}

function isExpiredInviteOnlySession(session: TastingSessionListSummary, userId: string | undefined): boolean {
  if (!userId || session.leaderUserId === userId || isCurrentUserParticipant(session, userId)) {
    return false;
  }

  return (
    session.viewerInvite?.invitedUserId === userId &&
    getTastingInviteDisplayStatus(session.viewerInvite, session) === 'expired'
  );
}

function hasOpenPendingInvite(session: TastingSessionListSummary, userId: string | undefined): boolean {
  return Boolean(
    userId &&
      isTastingInviteWindowOpen(session.joinExpiresAt) &&
      session.viewerInvite?.invitedUserId === userId &&
      session.viewerInvite.status === 'pending',
  );
}

function isVisibleActiveSession(session: TastingSessionListSummary, userId: string | undefined): boolean {
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

function isVisibleCompletedSession(session: TastingSessionListSummary, userId: string | undefined): boolean {
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
  const activeSessionsQuery = useInfiniteQuery({
    queryKey: tastingSessionsQueryKeys.summaries('active'),
    queryFn: ({ pageParam, signal }) =>
      listTastingSessionSummariesPage({
        filter: 'active',
        page: pageParam,
        pageSize: TASTING_SESSION_LIST_PAGE_SIZE,
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    enabled: Boolean(user?.id && isOnline),
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    staleTime: 0,
  });
  const completedSessionsQuery = useInfiniteQuery({
    queryKey: tastingSessionsQueryKeys.summaries('completed'),
    queryFn: ({ pageParam, signal }) =>
      listTastingSessionSummariesPage({
        filter: 'completed',
        page: pageParam,
        pageSize: TASTING_SESSION_LIST_PAGE_SIZE,
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    enabled: Boolean(user?.id && isOnline),
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    staleTime: 0,
  });
  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(
    activeSessionsQuery.isRefetching || completedSessionsQuery.isRefetching,
  );
  const refetchSessions = useCallback(async () => {
    await Promise.all([activeSessionsQuery.refetch(), completedSessionsQuery.refetch()]);
  }, [activeSessionsQuery, completedSessionsQuery]);
  const handleRefresh = useCallback(async () => {
    await runPullRefresh(async () => {
      await refetchSessions();
    });
  }, [refetchSessions, runPullRefresh]);

  const activeLoadedSessions = useMemo(
    () => activeSessionsQuery.data?.pages.flatMap((page) => page.items) ?? EMPTY_SESSIONS,
    [activeSessionsQuery.data],
  );
  const completedLoadedSessions = useMemo(
    () => completedSessionsQuery.data?.pages.flatMap((page) => page.items) ?? EMPTY_SESSIONS,
    [completedSessionsQuery.data],
  );
  const hasResolvedSessions =
    activeSessionsQuery.data !== undefined || completedSessionsQuery.data !== undefined;
  const isLoadingSessions = activeSessionsQuery.isLoading || completedSessionsQuery.isLoading;
  const hasAnyQueryError = activeSessionsQuery.isError || completedSessionsQuery.isError;
  const sessions = useMemo(
    () => [...activeLoadedSessions, ...completedLoadedSessions],
    [activeLoadedSessions, completedLoadedSessions],
  );
  const showOfflineUnavailable = !isOnline && !hasResolvedSessions && !isLoadingSessions;
  const showEmptySessions = !isLoadingSessions && sessions.length === 0 && !showOfflineUnavailable && !hasAnyQueryError;
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
      sessions.filter((session) => {
        const viewerInvite = session.viewerInvite;
        return Boolean(viewerInvite && viewerInvite.invitedUserId === user?.id && viewerInvite.status === 'pending');
      }),
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
    () => sortSessionsNewestFirst(activeLoadedSessions.filter((session) => isVisibleActiveSession(session, user?.id))),
    [activeLoadedSessions, user?.id],
  );
  const completedSessions = useMemo(
    () =>
      sortSessionsNewestFirst(
        completedLoadedSessions.filter((session) => isVisibleCompletedSession(session, user?.id)),
      ),
    [completedLoadedSessions, user?.id],
  );
  const listSections = useMemo<TastingSessionListSection[]>(() => {
    const sections: TastingSessionListSection[] = [];
    if (activeSessions.length > 0) {
      sections.push({ key: 'active', title: 'Active', data: activeSessions });
    }
    if (completedSessions.length > 0) {
      sections.push({ key: 'completed', title: 'Completed', data: completedSessions });
    }
    return sections;
  }, [activeSessions, completedSessions]);
  const canLoadMoreSessions = Boolean(activeSessionsQuery.hasNextPage || completedSessionsQuery.hasNextPage);
  const isFetchingNextSessionsPage = Boolean(
    activeSessionsQuery.isFetchingNextPage || completedSessionsQuery.isFetchingNextPage,
  );
  const handleLoadMore = useCallback(async () => {
    if (activeSessionsQuery.hasNextPage) {
      await activeSessionsQuery.fetchNextPage();
      return;
    }
    if (completedSessionsQuery.hasNextPage) {
      await completedSessionsQuery.fetchNextPage();
    }
  }, [activeSessionsQuery, completedSessionsQuery]);
  const joinBannerDescription = activePendingInviteSession
    ? `${activePendingInviteSession.name}. ${isOnline ? 'Tap to join.' : 'Connect to the internet to join.'}`
    : hasExpiredPendingInvite
      ? 'An invite expired. Enter a new code or wait for the leader to reopen the window.'
    : 'Enter an invite code to join a shared tasting session.';

  const handleAcceptInvite = useCallback(async (session: TastingSessionListSummary) => {
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
  }, [isOnline, navigation, tastingSessionWrites]);

  const handleDismissInvite = useCallback(async (session: TastingSessionListSummary) => {
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
  }, [isOnline, tastingSessionWrites]);

  const renderSessionItem = useCallback(
    ({ item: session, section }: { item: TastingSessionListSummary; section: TastingSessionListSection }) => {
      const isLast = session.id === section.data[section.data.length - 1]?.id;
      const viewerInvite = session.viewerInvite;
      const pendingInvite =
        section.key === 'active' &&
        viewerInvite &&
        viewerInvite.invitedUserId === user?.id &&
        viewerInvite.status === 'pending'
          ? viewerInvite
          : null;
      const pendingInviteDisplayStatus = pendingInvite
        ? getTastingInviteDisplayStatus(pendingInvite, session)
        : null;

      return (
        <OptionList>
          <OptionListRow
            isLast={!pendingInvite}
            onPress={() => {
              if (section.key === 'completed') {
                navigation.navigate('TastingSessionResults', { sessionId: session.id });
                return;
              }
              navigateToTastingSession(navigation, session);
            }}
            rightAccessory={
              <StatusPill
                label={formatTastingSessionStatusLabel(session.status)}
                tone={resolveTastingSessionStatusTone(session.status)}
              />
            }
            subtitle={
              section.key === 'completed'
                ? formatCompletedTastingSessionSubtitle(session)
                : `${session.joinedCount}/${session.maxParticipants} joined`
            }
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
        </OptionList>
      );
    },
    [handleAcceptInvite, handleDismissInvite, isOnline, navigation, styles.action, styles.actions, user?.id],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: TastingSessionListSection }) => (
      <View style={styles.sectionHeader}>
        <Text variant="titleMd">{section.title}</Text>
        <Text tone="muted" variant="label">
          {formatTastingSessionCount(section.data.length, 'session', 'sessions')}
        </Text>
      </View>
    ),
    [styles.sectionHeader],
  );

  const listFooter = canLoadMoreSessions ? (
    <FeatureListFooter
      isFetchingNextPage={isFetchingNextSessionsPage}
      label="Load more sessions"
      onLoadMore={handleLoadMore}
      testID="tasting-sessions-load-more-button"
    />
  ) : null;

  const listHeader = (
    <>
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
        errorMessage={hasAnyQueryError && sessions.length > 0 ? 'Could not refresh sessions. Showing saved data.' : null}
        onAction={() => {
          void refetchSessions();
        }}
        title="Sessions may be stale"
      />

      {showOfflineUnavailable ? (
        <EmptyState
          description="Connect to load group tastings, or open this screen after sessions have been saved locally."
          title="No saved sessions available offline"
        />
      ) : null}

      {isLoadingSessions && sessions.length === 0 ? <LoadingState label="Loading group tastings..." /> : null}

      {showEmptySessions ? (
        <EmptyState description="No sessions yet." title="No group tastings" />
      ) : null}
    </>
  );

  if (hasAnyQueryError && sessions.length === 0) {
    return (
      <BackHeaderScreenScaffold
        bodyStyle={styles.screenBody}
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
            void refetchSessions();
          }}
          title="Sessions unavailable"
        />
      </BackHeaderScreenScaffold>
    );
  }

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.screenBody}
      onBackPress={() => navigation.navigate('Misc')}
      refreshing={isPullRefreshing}
      rightAccessory={
        <HeaderAccessoryButton
          label="Create"
          onPress={() => navigation.navigate('CreateTastingSession')}
          testID="create-tasting-session-header-button"
        />
      }
      scroll={false}
      screenBackgroundTone="surface"
      subtitle="Create, join, and run group tastings."
      title="Group Tastings"
    >
      <SectionList
        contentContainerStyle={styles.listContent}
        initialNumToRender={10}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={listFooter}
        ListHeaderComponent={listHeader}
        maxToRenderPerBatch={10}
        onRefresh={handleRefresh}
        refreshing={isPullRefreshing}
        removeClippedSubviews
        renderItem={renderSessionItem}
        renderSectionHeader={renderSectionHeader}
        sections={isLoadingSessions && sessions.length === 0 ? [] : listSections}
        style={styles.list}
        windowSize={7}
      />
    </BackHeaderScreenScaffold>
  );
}
