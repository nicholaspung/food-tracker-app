import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ConfirmDestructiveModal,
  EmptyState,
  ErrorState,
  FeatureDetailScreenScaffold,
  PendingQueuedWriteRow,
  Skeleton,
  StatusPill,
} from '../components/shared';
import {
  addTastingItem,
  deleteTastingItem,
  getTastingSessionById,
  regenerateTastingInviteCode,
  setTastingSessionStatus,
  submitTastingRating,
  type TastingSessionItem,
  type TastingSessionStatus,
} from '../features';
import {
  getCachedTastingSessionDetail,
  tastingSessionsQueryKeys,
} from '../features/store/tastingSessionsQuery';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useQueuedFeatureWrites } from '../features/store/useQueuedFeatureWrites';
import { usePullToRefreshState } from '../hooks/usePullToRefreshState';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Input, ListItem, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type TastingSessionDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionDetail'>;

interface PendingDeleteItemState {
  id: string;
  name: string;
}

const TASTING_SESSION_DETAIL_QUEUE_OPERATIONS = [
  'tasting-session.invite-code.regenerate',
  'tasting-session.item.add',
  'tasting-session.item.delete',
  'tasting-session.rating.submit',
  'tasting-session.status.update',
] as const;

function getAverageRating(item: TastingSessionItem): number {
  if (item.ratings.length === 0) {
    return 0;
  }

  const total = item.ratings.reduce((sum, rating) => sum + rating.rating, 0);
  return Number((total / item.ratings.length).toFixed(2));
}

function getControversyScore(item: TastingSessionItem): number {
  if (item.ratings.length < 2) {
    return 0;
  }

  const ratings = item.ratings.map((rating) => rating.rating);
  return Math.max(...ratings) - Math.min(...ratings);
}

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

const useStyles = createThemedStyles((theme) => ({
  container: {
    gap: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  rowAction: {
    flex: 1,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
}));

export function TastingSessionDetailScreen({ navigation, route }: TastingSessionDetailScreenProps) {
  const { sessionId } = route.params;
  const styles = useStyles();
  const { isOnline } = useConnectivity();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();
  const { queuedWrites: pendingSessionWrites } = useQueuedFeatureWrites(
    TASTING_SESSION_DETAIL_QUEUE_OPERATIONS,
  );

  const sessionQuery = useQuery({
    queryKey: tastingSessionsQueryKeys.detail(sessionId),
    queryFn: ({ signal }) => getTastingSessionById(sessionId, { signal }),
    initialData: () => getCachedTastingSessionDetail(queryClient, sessionId) ?? undefined,
  });

  const [newItemName, setNewItemName] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [ratingDrafts, setRatingDrafts] = useState<Record<string, string>>({});
  const [ratingNoteDrafts, setRatingNoteDrafts] = useState<Record<string, string>>({});
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<PendingDeleteItemState | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);
  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(sessionQuery.isRefetching);

  const currentParticipant = useMemo(() => {
    const session = sessionQuery.data;
    if (!session || !user) {
      return null;
    }

    return session.participants.find((participant) => participant.userId === user.id) ?? null;
  }, [sessionQuery.data, user]);

  const isLeader = Boolean(sessionQuery.data && user && sessionQuery.data.createdByUserId === user.id);
  const hasBlockingSessionError = sessionQuery.isError && !sessionQuery.data;
  const hasSessionRefreshError = sessionQuery.isError && Boolean(sessionQuery.data);
  const buildAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'TastingSessionDetailScreen',
      isLeader,
      participantCount: sessionQuery.data?.participants.length ?? 0,
      itemCount: sessionQuery.data?.items.length ?? 0,
      status: sessionQuery.data?.status ?? null,
      ...overrides,
    }),
    [isLeader, sessionQuery.data?.items.length, sessionQuery.data?.participants.length, sessionQuery.data?.status],
  );
  useEffect(() => {
    const session = sessionQuery.data;
    if (!session || !currentParticipant) {
      return;
    }

    setRatingDrafts((currentDraftValues) => {
      let hasChanged = false;
      const nextDraftValues = { ...currentDraftValues };

      session.items.forEach((item) => {
        const existingRating = item.ratings.find(
          (rating) => rating.participantId === currentParticipant.id,
        );
        if (!existingRating || currentDraftValues[item.id] !== undefined) {
          return;
        }

        nextDraftValues[item.id] = String(existingRating.rating);
        hasChanged = true;
      });

      return hasChanged ? nextDraftValues : currentDraftValues;
    });

    setRatingNoteDrafts((currentDraftValues) => {
      let hasChanged = false;
      const nextDraftValues = { ...currentDraftValues };

      session.items.forEach((item) => {
        const existingRating = item.ratings.find(
          (rating) => rating.participantId === currentParticipant.id,
        );
        if (!existingRating || currentDraftValues[item.id] !== undefined) {
          return;
        }

        nextDraftValues[item.id] = existingRating.note ?? '';
        hasChanged = true;
      });

      return hasChanged ? nextDraftValues : currentDraftValues;
    });
  }, [currentParticipant, sessionQuery.data]);

  const ratingProgress = useMemo(() => {
    const session = sessionQuery.data;
    if (!session || !currentParticipant) {
      return { rated: 0, total: 0 };
    }

    const rated = session.items.filter((item) =>
      item.ratings.some((rating) => rating.participantId === currentParticipant.id),
    ).length;

    return {
      rated,
      total: session.items.length,
    };
  }, [currentParticipant, sessionQuery.data]);

  const resultsSummary = useMemo(() => {
    const session = sessionQuery.data;
    if (!session) {
      return { controversial: [] as TastingSessionItem[], favorites: [] as TastingSessionItem[] };
    }

    const favorites = [...session.items]
      .sort((left, right) => getAverageRating(right) - getAverageRating(left))
      .slice(0, 3);

    const controversial = [...session.items]
      .sort((left, right) => getControversyScore(right) - getControversyScore(left))
      .slice(0, 3);

    return {
      controversial,
      favorites,
    };
  }, [sessionQuery.data]);
  const pendingWritesForSession = useMemo(
    () =>
      pendingSessionWrites.filter((write) => {
        if ('sessionId' in write.payload) {
          return write.payload.sessionId === sessionId;
        }

        return false;
      }),
    [pendingSessionWrites, sessionId],
  );

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('TastingSessions');
  };

  const refreshSession = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.root }),
      queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) }),
    ]);
  };
  const handleRefresh = async () => {
    await runPullRefresh(async () => {
      await sessionQuery.refetch();
    });
  };

  const handleCopyInviteCode = async () => {
    const session = sessionQuery.data;
    if (!session?.inviteCode) {
      return;
    }

    try {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(session.inviteCode);
      trackObservabilityEvent('TASTING_INVITE_CODE_COPIED', buildAnalyticsPayload());
      setCopyStatus('Invite code copied.');
    } catch (error) {
      setCopyStatus(error instanceof Error ? error.message : 'Could not copy invite code.');
    }
  };

  const handleShareInviteCode = async () => {
    const session = sessionQuery.data;
    if (!session?.inviteCode) {
      return;
    }

    trackObservabilityEvent('TASTING_INVITE_SHARE_STARTED', {
      source: 'TastingSessionDetailScreen',
    });

    try {
      const shareResult = await Share.share({
        message: `Join my tasting session with code: ${session.inviteCode}`,
      });

      trackObservabilityEvent('TASTING_INVITE_SHARE_COMPLETED', {
        action: shareResult.action,
        source: 'TastingSessionDetailScreen',
      });
      setCopyStatus('Invite ready to share.');
    } catch (error) {
      trackObservabilityEvent('TASTING_INVITE_SHARE_FAILED', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'unknown_error',
        source: 'TastingSessionDetailScreen',
      });
      setCopyStatus('Could not open the share sheet.');
    }
  };

  const handleRegenerateCode = async () => {
    setErrorMessage(null);
    trackObservabilityEvent('TASTING_INVITE_REGENERATE_STARTED', buildAnalyticsPayload());

    try {
      const writeResult = await writeFeature({
        execute: () => regenerateTastingInviteCode(sessionId),
        offline: {
          strategy: 'outbox',
          payload: { sessionId },
        },
        operationName: 'tasting-session.invite-code.regenerate',
      });
      if (writeResult.status === 'queued') {
        showQueuedOfflineAlert({
          message: 'The invite code will regenerate when your connection is restored.',
          title: 'Invite update queued',
        });
        return;
      }
      await refreshSession();
      trackObservabilityEvent('TASTING_INVITE_REGENERATE_SUCCEEDED', buildAnalyticsPayload());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not regenerate invite code.';
      trackObservabilityEvent('TASTING_INVITE_REGENERATE_FAILED', buildAnalyticsPayload({
        errorType: error instanceof Error ? error.name : 'unknown_error',
      }));
      setErrorMessage(message);
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim() || !currentParticipant) {
      setErrorMessage('Item name is required.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('TASTING_ITEM_ADD_STARTED', buildAnalyticsPayload());

    try {
      const input = {
        description: newItemDescription,
        name: newItemName,
      };
      const writeResult = await writeFeature({
        execute: () => addTastingItem(sessionId, input),
        offline: {
          strategy: 'outbox',
          payload: {
            sessionId,
            input,
          },
        },
        operationName: 'tasting-session.item.add',
      });
      setNewItemName('');
      setNewItemDescription('');
      if (writeResult.status === 'queued') {
        showQueuedOfflineAlert({
          message: 'This tasting item will be added when your connection is restored.',
          title: 'Item queued',
        });
        return;
      }
      await refreshSession();
      trackObservabilityEvent('TASTING_ITEM_ADD_SUCCEEDED', buildAnalyticsPayload());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add item.';
      trackObservabilityEvent('TASTING_ITEM_ADD_FAILED', buildAnalyticsPayload({
        errorType: error instanceof Error ? error.name : 'unknown_error',
      }));
      setErrorMessage(message);
    }
  };

  const handleConfirmDeleteItem = async () => {
    if (!pendingDeleteItem) {
      return;
    }

    setErrorMessage(null);
    setIsDeletingItem(true);
    trackObservabilityEvent('TASTING_ITEM_DELETE_STARTED', buildAnalyticsPayload());

    try {
      const writeResult = await writeFeature({
        execute: () => deleteTastingItem(sessionId, pendingDeleteItem.id),
        offline: {
          strategy: 'outbox',
          payload: {
            sessionId,
            itemId: pendingDeleteItem.id,
          },
        },
        operationName: 'tasting-session.item.delete',
      });
      setPendingDeleteItem(null);
      if (writeResult.status === 'queued') {
        showQueuedOfflineAlert({
          message: 'This tasting item will be deleted when your connection is restored.',
          title: 'Delete queued',
        });
        return;
      }
      await refreshSession();
      trackObservabilityEvent('TASTING_ITEM_DELETE_SUCCEEDED', buildAnalyticsPayload());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete item.';
      trackObservabilityEvent('TASTING_ITEM_DELETE_FAILED', buildAnalyticsPayload({
        errorType: error instanceof Error ? error.name : 'unknown_error',
      }));
      setErrorMessage(message);
    } finally {
      setIsDeletingItem(false);
    }
  };

  const handleSubmitRating = async (itemId: string) => {
    if (!currentParticipant) {
      setErrorMessage('You must be a participant to rate items.');
      return;
    }

    const ratingDraft = Number(ratingDrafts[itemId] ?? '0');
    if (Number.isNaN(ratingDraft) || ratingDraft <= 0 || ratingDraft > 5) {
      setErrorMessage('Rating must be between 1 and 5.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('TASTING_RATING_SUBMIT_STARTED', buildAnalyticsPayload());

    try {
      const input = {
        note: ratingNoteDrafts[itemId]?.trim() || undefined,
        rating: ratingDraft,
      };
      const writeResult = await writeFeature({
        execute: () => submitTastingRating(sessionId, itemId, input),
        offline: {
          strategy: 'outbox',
          payload: {
            sessionId,
            itemId,
            input,
          },
        },
        operationName: 'tasting-session.rating.submit',
      });
      if (writeResult.status === 'queued') {
        showQueuedOfflineAlert({
          message: 'This rating will be saved when your connection is restored.',
          title: 'Rating queued',
        });
        return;
      }
      await refreshSession();
      trackObservabilityEvent('TASTING_RATING_SUBMIT_SUCCEEDED', buildAnalyticsPayload());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save rating.';
      trackObservabilityEvent('TASTING_RATING_SUBMIT_FAILED', buildAnalyticsPayload({
        errorType: error instanceof Error ? error.name : 'unknown_error',
      }));
      setErrorMessage(message);
    }
  };

  const handleAdvanceStatus = async () => {
    const session = sessionQuery.data;
    if (!session) {
      return;
    }

    const nextStatus = session.status === 'adding_items' ? 'rating' : 'completed';

    setErrorMessage(null);
    trackObservabilityEvent('TASTING_STATUS_ADVANCE_STARTED', buildAnalyticsPayload({
      nextStatus,
    }));

    try {
      const writeResult = await writeFeature({
        execute: () => setTastingSessionStatus(sessionId, nextStatus),
        offline: {
          strategy: 'outbox',
          payload: {
            sessionId,
            status: nextStatus,
          },
        },
        operationName: 'tasting-session.status.update',
      });
      if (writeResult.status === 'queued') {
        showQueuedOfflineAlert({
          message: 'The session state will update when your connection is restored.',
          title: 'Session update queued',
        });
        return;
      }
      await refreshSession();
      trackObservabilityEvent('TASTING_STATUS_ADVANCE_SUCCEEDED', buildAnalyticsPayload({
        nextStatus,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update session state.';
      trackObservabilityEvent('TASTING_STATUS_ADVANCE_FAILED', buildAnalyticsPayload({
        errorType: error instanceof Error ? error.name : 'unknown_error',
        nextStatus,
      }));
      setErrorMessage(message);
    }
  };

  if (sessionQuery.isLoading) {
    return (
      <FeatureDetailScreenScaffold onBackPress={handleBackPress} title="Tasting Session">
        <Skeleton height={20} />
        <Skeleton height={20} />
      </FeatureDetailScreenScaffold>
    );
  }

  if (hasBlockingSessionError) {
    return (
      <FeatureDetailScreenScaffold onBackPress={handleBackPress} title="Tasting Session">
        <ErrorState
          analyticsProps={buildAnalyticsPayload()}
          analyticsSource="TastingSessionDetailScreen"
          description="Could not load the tasting session."
          onRetry={() => {
            void sessionQuery.refetch();
          }}
          title="Session unavailable"
        />
      </FeatureDetailScreenScaffold>
    );
  }

  if (!sessionQuery.data) {
    return (
      <FeatureDetailScreenScaffold onBackPress={handleBackPress} title="Tasting Session">
        <EmptyState
          actionLabel="Back to Sessions"
          analyticsProps={buildAnalyticsPayload()}
          analyticsSource="TastingSessionDetailScreen"
          onAction={() => {
            navigation.navigate('TastingSessions');
          }}
          title="Session not found"
        />
      </FeatureDetailScreenScaffold>
    );
  }

  const session = sessionQuery.data;
  const canManageInviteCode = isLeader && session.status === 'adding_items' && Boolean(session.inviteCode);
  const canAdvanceStatus = isLeader && (session.status === 'adding_items' || session.status === 'rating');
  const canAddItems = session.status === 'adding_items' && Boolean(currentParticipant);
  const canRateItems = session.status === 'rating' && Boolean(currentParticipant);

  return (
    <FeatureDetailScreenScaffold
      bodyStyle={styles.container}
      onRefresh={handleRefresh}
      onBackPress={handleBackPress}
      refreshing={isPullRefreshing}
      subtitle={session.restaurantName}
      title={session.name}
    >
      <PageErrorToast
        analyticsProps={buildAnalyticsPayload()}
        analyticsSource="TastingSessionDetailScreen"
        errorMessage={errorMessage}
        title="Session update failed"
      />
      <PageErrorToast
        actionLabel="Retry"
        analyticsProps={buildAnalyticsPayload()}
        analyticsSource="TastingSessionDetailScreen"
        errorMessage={
          hasSessionRefreshError ? 'Could not refresh the tasting session. Showing saved data.' : null
        }
        onAction={() => {
          void sessionQuery.refetch();
        }}
        title="Session may be stale"
      />

      {!isOnline ? (
        <Text tone="warning">
          Tasting session changes will be queued and replayed when your connection returns.
          Any details already loaded here remain visible while offline.
        </Text>
      ) : null}

      <Card>
        <View style={styles.statusRow}>
          <Text variant="label">Session</Text>
          <StatusPill
            label={formatTastingSessionStatusLabel(session.status)}
            tone={resolveTastingSessionStatusTone(session.status)}
          />
        </View>

        {canManageInviteCode ? (
          <>
            <Text variant="titleMd">Invite code: {session.inviteCode}</Text>
            {copyStatus ? <Text tone="muted">{copyStatus}</Text> : null}
            <View style={styles.row}>
              <Button
                label="Copy Code"
                onPress={() => {
                  void handleCopyInviteCode();
                }}
                style={styles.rowAction}
                variant="secondary"
              />
              <Button
                label="Share"
                onPress={() => {
                  void handleShareInviteCode();
                }}
                style={styles.rowAction}
                variant="secondary"
              />
            </View>

            <Button
              label="Regenerate Code"
              onPress={() => {
                void handleRegenerateCode();
              }}
              variant="secondary"
            />
          </>
        ) : isLeader ? (
          <Text tone="secondary">Invite codes close once the session moves out of adding items.</Text>
        ) : (
          <Text tone="secondary">Only the session leader can manage invite codes.</Text>
        )}

        <Text variant="label">Participants</Text>
        {session.participants.map((participant) => (
          <ListItem
            key={participant.id}
            description={participant.userId ?? 'participant'}
            title={participant.name}
            trailing={
              participant.userId === user?.id ? <Text tone="muted">You</Text> : <Text tone="muted">Joined</Text>
            }
          />
        ))}

        {canAdvanceStatus ? (
          <Button
            label={session.status === 'adding_items' ? 'Start Rating' : 'Complete Session'}
            onPress={() => {
              void handleAdvanceStatus();
            }}
          />
        ) : isLeader ? (
          <Text tone="secondary">
            {session.status === 'completed'
              ? 'This session is finished.'
              : 'Move the session forward when your group is ready.'}
          </Text>
        ) : (
          <Text tone="secondary">Only the leader can move the session forward.</Text>
        )}
      </Card>

      <Card>
        <Text variant="label">Item Management</Text>
        {session.status !== 'adding_items' ? (
          <Text tone="secondary">Items are locked once rating begins.</Text>
        ) : null}
        <Input
          editable={session.status === 'adding_items'}
          label="Item name"
          onChangeText={setNewItemName}
          placeholder="Add tasting item"
          value={newItemName}
        />
        <Input
          editable={session.status === 'adding_items'}
          label="Description"
          onChangeText={setNewItemDescription}
          placeholder="Optional notes"
          value={newItemDescription}
        />
        <Button
          disabled={!canAddItems || !newItemName.trim()}
          label="Add Item"
          onPress={() => {
            void handleAddItem();
          }}
          variant="secondary"
        />

        {session.items.length === 0 ? (
          <EmptyState
            analyticsProps={buildAnalyticsPayload()}
            analyticsSource="TastingSessionDetailScreen"
            description="Add at least one item to begin."
            title="No tasting items"
          />
        ) : (
          session.items.map((item) => {
            const yourRating = currentParticipant
              ? item.ratings.find((rating) => rating.participantId === currentParticipant.id)
              : undefined;
            const canDelete =
              session.status === 'adding_items' &&
              (isLeader || currentParticipant?.id === item.createdByParticipantId);

            return (
              <Card key={item.id} tone="muted">
                <ListItem
                  description={item.description ?? 'No description'}
                  title={item.name}
                  trailing={
                    session.status === 'completed' ? (
                      <Text tone="muted">Avg {getAverageRating(item).toFixed(1)}</Text>
                    ) : yourRating ? (
                      <Text tone="muted">Rated</Text>
                    ) : (
                      <Text tone="muted">Pending</Text>
                    )
                  }
                />
                {canDelete ? (
                  <Button
                    label="Delete Item"
                    onPress={() => {
                      setErrorMessage(null);
                      setPendingDeleteItem({
                        id: item.id,
                        name: item.name,
                      });
                    }}
                    variant="secondary"
                  />
                ) : null}
              </Card>
            );
          })
        )}
      </Card>

      <Card>
        <Text variant="label">Rating Flow</Text>
        <Text tone="secondary">
          Progress: {ratingProgress.rated}/{ratingProgress.total} items rated
        </Text>
        {session.status === 'adding_items' ? (
          <Text tone="secondary">The leader needs to start rating before scores can be submitted.</Text>
        ) : null}
        {session.status === 'completed' ? (
          <Text tone="secondary">Ratings are locked because the session is complete.</Text>
        ) : null}

        {session.items.length === 0 ? (
          <EmptyState
            analyticsProps={buildAnalyticsPayload()}
            analyticsSource="TastingSessionDetailScreen"
            description="Add items before collecting ratings."
            title="No items to rate"
          />
        ) : (
          session.items.map((item) => {
            const savedRating = currentParticipant
              ? item.ratings.find((rating) => rating.participantId === currentParticipant.id)
              : undefined;

            return (
              <Card key={`rating_${item.id}`} tone="muted">
                <Text variant="label">{item.name}</Text>
                {savedRating ? (
                  <Text tone="secondary">
                    Saved rating: {savedRating.rating}
                    {savedRating.note ? ` • ${savedRating.note}` : ''}
                  </Text>
                ) : null}
                <Input
                  editable={canRateItems}
                  keyboardType="decimal-pad"
                  label="Rating"
                  onChangeText={(value) => {
                    setRatingDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      [item.id]: value,
                    }));
                  }}
                  placeholder="1-5"
                  value={ratingDrafts[item.id] ?? ''}
                />
                <Input
                  editable={canRateItems}
                  label="Notes"
                  onChangeText={(value) => {
                    setRatingNoteDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      [item.id]: value,
                    }));
                  }}
                  placeholder="Optional tasting notes"
                  value={ratingNoteDrafts[item.id] ?? ''}
                />
                <Button
                  disabled={!canRateItems}
                  label="Save Rating"
                  onPress={() => {
                    void handleSubmitRating(item.id);
                  }}
                  variant="secondary"
                />
              </Card>
            );
          })
        )}
      </Card>

      {pendingWritesForSession.length > 0 ? (
        <Card>
          <Text variant="label">Pending session changes</Text>
          {pendingWritesForSession.map((write) => {
            let title = 'Pending session change';
            let description: string | undefined;

            switch (write.operationName) {
              case 'tasting-session.invite-code.regenerate':
                title = 'Regenerate invite code';
                break;
              case 'tasting-session.item.add': {
                const payload = write.payload as {
                  input: { description?: string; name: string };
                };
                title = `Add ${payload.input.name}`;
                description = payload.input.description;
                break;
              }
              case 'tasting-session.item.delete': {
                const payload = write.payload as { itemId: string };
                title = 'Delete tasting item';
                description = payload.itemId;
                break;
              }
              case 'tasting-session.rating.submit': {
                const payload = write.payload as { input: { rating: number } };
                title = 'Save rating';
                description = `Rating ${payload.input.rating}`;
                break;
              }
              case 'tasting-session.status.update': {
                const payload = write.payload as { status: TastingSessionStatus };
                title = 'Update session status';
                description = formatTastingSessionStatusLabel(payload.status);
                break;
              }
            }

            return (
              <PendingQueuedWriteRow
                key={write.id}
                description={description}
                lastError={write.lastError}
                status={write.status}
                title={title}
              />
            );
          })}
        </Card>
      ) : null}

      <Card>
        <Text variant="label">Results</Text>

        {session.status !== 'completed' ? (
          <Text tone="secondary">Group results appear after the leader completes the session.</Text>
        ) : (
          <>
            <Text tone="secondary">Favorites</Text>
            {resultsSummary.favorites.length === 0 ? (
              <Text tone="muted">No ratings yet.</Text>
            ) : (
              resultsSummary.favorites.map((item) => (
                <ListItem
                  key={`favorite_${item.id}`}
                  description={item.description}
                  title={item.name}
                  trailing={<Text tone="success">Avg {getAverageRating(item).toFixed(1)}</Text>}
                />
              ))
            )}

            <Text tone="secondary">Controversial Items</Text>
            {resultsSummary.controversial.length === 0 ? (
              <Text tone="muted">Need at least two ratings per item.</Text>
            ) : (
              resultsSummary.controversial.map((item) => (
                <ListItem
                  key={`controversial_${item.id}`}
                  description={item.description}
                  title={item.name}
                  trailing={<Text tone="warning">Spread {getControversyScore(item).toFixed(1)}</Text>}
                />
              ))
            )}
          </>
        )}
      </Card>

      <ConfirmDestructiveModal
        cancelLabel="Keep Item"
        confirmLabel="Delete Item"
        confirmLoadingLabel="Deleting..."
        description={
          pendingDeleteItem
            ? `Delete ${pendingDeleteItem.name} from this tasting session?`
            : 'Delete this item from the tasting session?'
        }
        loading={isDeletingItem}
        onCancel={() => {
          if (isDeletingItem) {
            return;
          }

          setPendingDeleteItem(null);
        }}
        onConfirm={() => {
          void handleConfirmDeleteItem();
        }}
        title="Delete Item?"
        visible={Boolean(pendingDeleteItem)}
      />
    </FeatureDetailScreenScaffold>
  );
}
