import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  ErrorState,
  PendingQueuedWriteRow,
  Skeleton,
  StatusPill,
} from '../components/shared';
import {
  createTastingSession,
  joinTastingSession,
  listTastingSessions,
  type TastingSessionRecord,
  type TastingSessionStatus,
} from '../features';
import { tastingSessionsQueryKeys } from '../features/store/tastingSessionsQuery';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useQueuedFeatureWrites } from '../features/store/useQueuedFeatureWrites';
import { useSavedRestaurantSuggestions } from '../hooks/useRestaurantSelectionFlow';
import { usePullToRefreshState } from '../hooks/usePullToRefreshState';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Input, ListItem, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type TastingSessionsScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessions'>;

type SessionFilter = 'active' | 'completed';

const EMPTY_TASTING_SESSIONS: TastingSessionRecord[] = [];
const RESTAURANT_SUGGESTION_LIMIT = 3;
const TASTING_SESSION_LIST_QUEUE_OPERATIONS = [
  'tasting-session.create',
  'tasting-session.join',
] as const;

function formatRestaurantSuggestionLabel(name: string, userVisitCount?: number): string {
  const normalizedCount =
    typeof userVisitCount === 'number' && Number.isFinite(userVisitCount)
      ? Math.max(0, Math.floor(userVisitCount))
      : 0;
  if (normalizedCount <= 0) {
    return `Use ${name}`;
  }

  return `Use ${name} · ${normalizedCount} ${normalizedCount === 1 ? 'visit' : 'visits'}`;
}

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  rowAction: {
    flex: 1,
  },
}));

function formatTastingSessionStatusLabel(status: TastingSessionStatus): string {
  switch (status) {
    case 'adding_items':
      return 'Adding Items';
    case 'rating':
      return 'Rating';
    case 'completed':
      return 'Completed';
  }
}

function resolveTastingSessionStatusTone(status: TastingSessionStatus): 'info' | 'warning' | 'success' {
  switch (status) {
    case 'adding_items':
      return 'info';
    case 'rating':
      return 'warning';
    case 'completed':
      return 'success';
  }
}

export function TastingSessionsScreen({ navigation }: TastingSessionsScreenProps) {
  const styles = useStyles();
  const { isOnline } = useConnectivity();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();
  const { queuedWrites: pendingSessionWrites } = useQueuedFeatureWrites(
    TASTING_SESSION_LIST_QUEUE_OPERATIONS,
  );

  const sessionsQuery = useQuery({
    queryKey: tastingSessionsQueryKeys.root,
    queryFn: ({ signal }) => listTastingSessions({ signal }),
  });

  const [filter, setFilter] = useState<SessionFilter>('active');
  const [createName, setCreateName] = useState('');
  const [restaurantSearch, setRestaurantSearch] = useState('');
  const [selectedRestaurant, setSelectedRestaurant] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasActivatedRestaurantSuggestions, setHasActivatedRestaurantSuggestions] = useState(false);
  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(sessionsQuery.isRefetching);
  const {
    savedRestaurantRecords: filteredRestaurants,
    savedRestaurantsErrorMessage: restaurantSuggestionsErrorMessage,
    savedRestaurantsLoading: restaurantSuggestionsLoading,
  } = useSavedRestaurantSuggestions({
    enabled: hasActivatedRestaurantSuggestions,
    recentLimit: RESTAURANT_SUGGESTION_LIMIT,
    searchQuery: restaurantSearch,
  });

  const sessions = sessionsQuery.data ?? EMPTY_TASTING_SESSIONS;
  const hasBlockingSessionsError = sessionsQuery.isError && sessions.length === 0;
  const hasSessionsRefreshError = sessionsQuery.isError && sessions.length > 0;
  const handleRefresh = useCallback(async () => {
    await runPullRefresh(async () => {
      await sessionsQuery.refetch();
    });
  }, [runPullRefresh, sessionsQuery]);

  const filteredSessions = useMemo(() => {
    if (filter === 'completed') {
      return sessions.filter((session) => session.status === 'completed');
    }

    return sessions.filter(
      (session) => session.status === 'adding_items' || session.status === 'rating',
    );
  }, [filter, sessions]);

  const handleCreate = async () => {
    const name = createName.trim();
    const restaurantName = selectedRestaurant.trim();

    if (!name || !restaurantName || !user) {
      trackObservabilityEvent('TASTING_SESSION_CREATE_VALIDATION_FAILED', {
        hasName: Boolean(name),
        hasRestaurant: Boolean(restaurantName),
        hasUser: Boolean(user),
        source: 'TastingSessionsScreen',
      });
      setErrorMessage('Session name, restaurant, and signed-in user are required.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('TASTING_SESSION_CREATE_STARTED', {
      restaurantName,
      source: 'TastingSessionsScreen',
      userId: user.id,
    });

    try {
      const writeResult = await writeFeature({
        execute: () =>
          createTastingSession({
            name,
            restaurantName,
          }),
        offline: {
          strategy: 'outbox',
          payload: {
            name,
            restaurantName,
          },
        },
        operationName: 'tasting-session.create',
      });

      setCreateName('');
      setRestaurantSearch('');
      setSelectedRestaurant('');

      if (writeResult.status === 'queued') {
        showQueuedOfflineAlert({
          message: 'This tasting session will be created when your connection is restored.',
          title: 'Session queued',
        });
        trackObservabilityEvent('TASTING_SESSION_CREATE_QUEUED', {
          source: 'TastingSessionsScreen',
        });
        return;
      }

      await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.root });
      trackObservabilityEvent('TASTING_SESSION_CREATE_SUCCEEDED', {
        sessionId: writeResult.result.id,
        source: 'TastingSessionsScreen',
      });
      navigation.navigate('TastingSessionDetail', { sessionId: writeResult.result.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create session.';
      setErrorMessage(message);
      trackObservabilityEvent('TASTING_SESSION_CREATE_FAILED', {
        error: message,
        source: 'TastingSessionsScreen',
      });
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim() || !user) {
      trackObservabilityEvent('TASTING_SESSION_JOIN_VALIDATION_FAILED', {
        hasInviteCode: Boolean(joinCode.trim()),
        hasUser: Boolean(user),
        source: 'TastingSessionsScreen',
      });
      setErrorMessage('Join code is required.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('TASTING_SESSION_JOIN_STARTED', {
      inviteCodeLength: joinCode.trim().length,
      source: 'TastingSessionsScreen',
      userId: user.id,
    });

    try {
      const inviteCode = joinCode.trim().toUpperCase();
      const writeResult = await writeFeature({
        execute: () =>
          joinTastingSession({
            inviteCode,
          }),
        offline: {
          strategy: 'outbox',
          payload: {
            inviteCode,
          },
        },
        operationName: 'tasting-session.join',
      });

      setJoinCode('');

      if (writeResult.status === 'queued') {
        showQueuedOfflineAlert({
          message: 'This session join will replay when your connection is restored.',
          title: 'Join queued',
        });
        trackObservabilityEvent('TASTING_SESSION_JOIN_QUEUED', {
          source: 'TastingSessionsScreen',
        });
        return;
      }

      await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.root });
      trackObservabilityEvent('TASTING_SESSION_JOIN_SUCCEEDED', {
        sessionId: writeResult.result.id,
        source: 'TastingSessionsScreen',
      });
      navigation.navigate('TastingSessionDetail', { sessionId: writeResult.result.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not join session.';
      setErrorMessage(message);
      trackObservabilityEvent('TASTING_SESSION_JOIN_FAILED', {
        error: message,
        source: 'TastingSessionsScreen',
      });
    }
  };

  if (hasBlockingSessionsError) {
    return (
      <BackHeaderScreenScaffold
        bodyStyle={styles.body}
        onRefresh={handleRefresh}
        onBackPress={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
            return;
          }

          navigation.navigate('Profile');
        }}
        refreshing={isPullRefreshing}
        subtitle="Create or join a tasting session with your group."
        title="Group Tastings"
      >
        <ErrorState
          description="Could not load tasting sessions."
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
      bodyStyle={styles.body}
      onRefresh={handleRefresh}
      onBackPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigation.navigate('Profile');
      }}
      refreshing={isPullRefreshing}
      subtitle="Create or join a tasting session with your group."
      title="Group Tastings"
    >
      <View style={styles.body}>
        {!isOnline ? (
          <Text tone="warning">
            New tasting session actions will be queued and replayed when your connection returns.
            You can still open sessions already loaded on this device.
          </Text>
        ) : null}

        <View style={styles.row}>
          <Button
            label="Active"
            onPress={() => {
              trackObservabilityEvent('TASTING_SESSIONS_FILTER_CHANGED', {
                nextFilter: 'active',
                previousFilter: filter,
                source: 'TastingSessionsScreen',
              });
              setFilter('active');
            }}
            style={styles.rowAction}
            variant={filter === 'active' ? 'primary' : 'secondary'}
          />
          <Button
            label="Completed"
            onPress={() => {
              trackObservabilityEvent('TASTING_SESSIONS_FILTER_CHANGED', {
                nextFilter: 'completed',
                previousFilter: filter,
                source: 'TastingSessionsScreen',
              });
              setFilter('completed');
            }}
            style={styles.rowAction}
            variant={filter === 'completed' ? 'primary' : 'secondary'}
          />
        </View>

        <Card>
          <Text variant="label">Create Session</Text>
          <Input
            label="Session name"
            onChangeText={setCreateName}
            placeholder="Friday ramen tasting"
            value={createName}
          />
          <Input
            label="Restaurant search"
            onChangeText={(value) => {
              setHasActivatedRestaurantSuggestions(true);
              setRestaurantSearch(value);
            }}
            onFocus={() => {
              setHasActivatedRestaurantSuggestions(true);
            }}
            placeholder="Search restaurants"
            value={restaurantSearch}
          />
          <Input
            label="Selected restaurant"
            onChangeText={(value) => {
              setHasActivatedRestaurantSuggestions(true);
              setSelectedRestaurant(value);
            }}
            onFocus={() => {
              setHasActivatedRestaurantSuggestions(true);
            }}
            placeholder="Restaurant"
            value={selectedRestaurant}
          />

          {restaurantSuggestionsLoading ? (
            <Text tone="secondary" variant="bodySm">
              Loading restaurant suggestions...
            </Text>
          ) : null}

          {restaurantSuggestionsErrorMessage ? (
            <Text tone="danger" variant="bodySm">
              {restaurantSuggestionsErrorMessage}
            </Text>
          ) : null}

          {filteredRestaurants.slice(0, RESTAURANT_SUGGESTION_LIMIT).map((restaurant) => (
            <Button
              key={restaurant.id}
              label={formatRestaurantSuggestionLabel(restaurant.name, restaurant.userVisitCount)}
              onPress={() => {
                setSelectedRestaurant(restaurant.name);
              }}
              variant="secondary"
            />
          ))}

          <Button
            disabled={!createName.trim() || !selectedRestaurant.trim()}
            label="Create Session"
            onPress={() => {
              void handleCreate();
            }}
          />
        </Card>

        <Card>
          <Text variant="label">Join Session</Text>
          <Input
            autoCapitalize="characters"
            autoCorrect={false}
            label="6-character invite code"
            maxLength={6}
            onChangeText={setJoinCode}
            placeholder="ABC123"
            value={joinCode}
          />
          <Button
            disabled={joinCode.trim().length !== 6}
            label="Join"
            onPress={() => {
              void handleJoin();
            }}
            variant="secondary"
          />
        </Card>

        <PageErrorToast errorMessage={errorMessage} title="Session action failed" />
        <PageErrorToast
          actionLabel="Retry"
          errorMessage={
            hasSessionsRefreshError
              ? 'Could not refresh tasting sessions. Showing saved data.'
              : null
          }
          onAction={() => {
            void sessionsQuery.refetch();
          }}
          title="Sessions may be stale"
        />

        {sessionsQuery.isLoading ? (
          <>
            <Skeleton height={20} />
            <Skeleton height={20} />
          </>
        ) : null}

        {pendingSessionWrites.length > 0 ? (
          <>
            <Text variant="label">Pending session changes</Text>
            {pendingSessionWrites.map((write) => {
              if (write.operationName === 'tasting-session.create') {
                const payload = write.payload as { name: string; restaurantName: string };
                return (
                  <PendingQueuedWriteRow
                    key={write.id}
                    createdAt={write.createdAt}
                    description={`Create at ${payload.restaurantName}`}
                    idempotencyKey={write.idempotencyKey}
                    lastError={write.lastError}
                    status={write.status}
                    title={payload.name}
                  />
                );
              }

              const payload = write.payload as { inviteCode: string };
              return (
                <PendingQueuedWriteRow
                  key={write.id}
                  createdAt={write.createdAt}
                  description={`Join code ${payload.inviteCode}`}
                  idempotencyKey={write.idempotencyKey}
                  lastError={write.lastError}
                  status={write.status}
                  title="Join tasting session"
                />
              );
            })}
          </>
        ) : null}

        {!sessionsQuery.isLoading && filteredSessions.length === 0 ? (
          <EmptyState description="No sessions found for the current filter." title="No sessions" />
        ) : null}

        {!sessionsQuery.isLoading
          ? filteredSessions.map((session) => (
              <Card key={session.id} tone={session.status === 'completed' ? 'success' : 'info'}>
                <ListItem
                  description={`${session.restaurantName} | ${session.participants.length} participants`}
                  title={session.name}
                  trailing={
                    <StatusPill
                      label={formatTastingSessionStatusLabel(session.status)}
                      tone={resolveTastingSessionStatusTone(session.status)}
                    />
                  }
                />
                <Button
                  label="Open Session"
                  onPress={() => {
                    trackObservabilityEvent('TASTING_SESSION_OPENED', {
                      filter,
                      sessionId: session.id,
                      source: 'TastingSessionsScreen',
                      status: session.status,
                    });
                    navigation.navigate('TastingSessionDetail', { sessionId: session.id });
                  }}
                  variant="secondary"
                />
              </Card>
            ))
          : null}
      </View>
    </BackHeaderScreenScaffold>
  );
}
