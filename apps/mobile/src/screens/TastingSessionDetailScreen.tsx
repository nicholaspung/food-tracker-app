import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, FeatureDetailScreenScaffold, Skeleton } from '../components/shared';
import {
  addTastingItem,
  deleteTastingItem,
  getTastingSessionById,
  regenerateTastingInviteCode,
  saveTastingResultsToVisitHistory,
  setTastingSessionStatus,
  submitTastingRating,
  type TastingSessionItem,
} from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Input, ListItem, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type TastingSessionDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionDetail'>;

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
}));

export function TastingSessionDetailScreen({ navigation, route }: TastingSessionDetailScreenProps) {
  const { sessionId } = route.params;
  const styles = useStyles();
  const { user } = useAuth();
  const queueWrite = useQueuedWrite();
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ['feature', 'tastingSession', sessionId],
    queryFn: () => getTastingSessionById(sessionId),
  });

  const [newItemName, setNewItemName] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [ratingDrafts, setRatingDrafts] = useState<Record<string, string>>({});
  const [ratingNoteDrafts, setRatingNoteDrafts] = useState<Record<string, string>>({});
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentParticipant = useMemo(() => {
    const session = sessionQuery.data;
    if (!session || !user) {
      return null;
    }

    return (
      session.participants.find((participant) => participant.userId === user.id) ??
      session.participants[0] ??
      null
    );
  }, [sessionQuery.data, user]);

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
      return { favorites: [] as TastingSessionItem[], controversial: [] as TastingSessionItem[] };
    }

    const favorites = [...session.items]
      .sort((left, right) => getAverageRating(right) - getAverageRating(left))
      .slice(0, 3);

    const controversial = [...session.items]
      .sort((left, right) => getControversyScore(right) - getControversyScore(left))
      .slice(0, 3);

    return {
      favorites,
      controversial,
    };
  }, [sessionQuery.data]);

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('TastingSessions');
  };

  const refreshSession = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['feature', 'tastingSessions'] }),
      queryClient.invalidateQueries({ queryKey: ['feature', 'tastingSession', sessionId] }),
    ]);
  };

  const handleRegenerateCode = async () => {
    setErrorMessage(null);

    try {
      await queueWrite('tasting-session.invite.regenerate');
      await regenerateTastingInviteCode(sessionId);
      await refreshSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not regenerate invite code.';
      setErrorMessage(message);
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim() || !currentParticipant) {
      setErrorMessage('Item name is required.');
      return;
    }

    setErrorMessage(null);

    try {
      await queueWrite('tasting-session.item.add');
      await addTastingItem(sessionId, {
        name: newItemName,
        description: newItemDescription,
        createdByParticipantId: currentParticipant.id,
      });
      setNewItemName('');
      setNewItemDescription('');
      await refreshSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add item.';
      setErrorMessage(message);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!currentParticipant) {
      return;
    }

    setErrorMessage(null);

    try {
      await queueWrite('tasting-session.item.delete');
      await deleteTastingItem(sessionId, itemId, currentParticipant.id);
      await refreshSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete item.';
      setErrorMessage(message);
    }
  };

  const handleSubmitRating = async (itemId: string) => {
    if (!currentParticipant) {
      return;
    }

    const ratingDraft = Number(ratingDrafts[itemId] ?? '0');
    if (Number.isNaN(ratingDraft) || ratingDraft <= 0 || ratingDraft > 5) {
      setErrorMessage('Rating must be between 1 and 5.');
      return;
    }

    setErrorMessage(null);

    try {
      await queueWrite('tasting-session.rating.submit');
      await submitTastingRating(sessionId, itemId, {
        participantId: currentParticipant.id,
        rating: ratingDraft,
        note: ratingNoteDrafts[itemId]?.trim() || undefined,
      });
      await refreshSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save rating.';
      setErrorMessage(message);
    }
  };

  const handleAdvanceStatus = async () => {
    const session = sessionQuery.data;
    if (!session) {
      return;
    }

    const nextStatus = session.status === 'lobby' ? 'rating' : 'completed';

    setErrorMessage(null);

    try {
      await queueWrite('tasting-session.status.advance');
      await setTastingSessionStatus(sessionId, nextStatus);
      await refreshSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update session state.';
      setErrorMessage(message);
    }
  };

  const handleSaveResultsToVisitHistory = async () => {
    setErrorMessage(null);

    try {
      await queueWrite('tasting-session.results.save-visit');
      await saveTastingResultsToVisitHistory(sessionId);
      await Promise.all([
        refreshSession(),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visits'] }),
      ]);
      navigation.navigate('Home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save results to visit history.';
      setErrorMessage(message);
    }
  };

  const shareInviteCode = async () => {
    const session = sessionQuery.data;
    if (!session) {
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
    } catch (error) {
      trackObservabilityEvent('TASTING_INVITE_SHARE_FAILED', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'unknown_error',
        source: 'TastingSessionDetailScreen',
      });
      setCopyStatus('Share sheet was canceled.');
    }
  };

  if (sessionQuery.isLoading) {
    return (
      <FeatureDetailScreenScaffold
        onBackPress={handleBackPress}
        title="Tasting Session"
      >
        <Skeleton height={20} />
        <Skeleton height={20} />
      </FeatureDetailScreenScaffold>
    );
  }

  if (sessionQuery.isError) {
    return (
      <FeatureDetailScreenScaffold
        onBackPress={handleBackPress}
        title="Tasting Session"
      >
        <ErrorState
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
      <FeatureDetailScreenScaffold
        onBackPress={handleBackPress}
        title="Tasting Session"
      >
        <EmptyState
          actionLabel="Back to Sessions"
          onAction={() => {
            navigation.navigate('TastingSessions');
          }}
          title="Session not found"
        />
      </FeatureDetailScreenScaffold>
    );
  }

  const session = sessionQuery.data;

  return (
    <FeatureDetailScreenScaffold
      bodyStyle={styles.container}
      onBackPress={handleBackPress}
      subtitle={session.restaurantName}
      title={session.name}
    >
      <PageErrorToast errorMessage={errorMessage} title="Session update failed" />

      <Card>
        <Text variant="label">Lobby</Text>
        <Text tone="secondary">Status: {session.status}</Text>
        <Text variant="titleMd">Invite code: {session.inviteCode}</Text>
        {copyStatus ? <Text tone="muted">{copyStatus}</Text> : null}

        <View style={styles.row}>
          <Button
            label="Copy Code"
            onPress={() => {
              setCopyStatus('Invite code copied to clipboard-ready state.');
            }}
            style={styles.rowAction}
            variant="secondary"
          />
          <Button
            label="Share"
            onPress={() => {
              void shareInviteCode();
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

        <Text variant="label">Participants</Text>
        {session.participants.map((participant) => (
          <ListItem
            key={participant.id}
            description={participant.userId ?? 'guest'}
            title={participant.name}
            trailing={<Text tone="muted">Joined</Text>}
          />
        ))}

        <Button
          label={session.status === 'lobby' ? 'Start Rating' : 'Complete Session'}
          onPress={() => {
            void handleAdvanceStatus();
          }}
        />
      </Card>

      <Card>
        <Text variant="label">Item Management</Text>
        <Input label="Item name" onChangeText={setNewItemName} placeholder="Add tasting item" value={newItemName} />
        <Input
          label="Description"
          onChangeText={setNewItemDescription}
          placeholder="Optional notes"
          value={newItemDescription}
        />
        <Button
          disabled={!newItemName.trim()}
          label="Add Item"
          onPress={() => {
            void handleAddItem();
          }}
          variant="secondary"
        />

        {session.items.length === 0 ? (
          <EmptyState description="Add at least one item to begin." title="No tasting items" />
        ) : (
          session.items.map((item) => {
            const canDelete = currentParticipant?.id === item.createdByParticipantId;
            const avgRating = getAverageRating(item);
            return (
              <Card key={item.id} tone="muted">
                <ListItem
                  description={item.description ?? 'No description'}
                  title={item.name}
                  trailing={<Text tone="muted">Avg {avgRating.toFixed(1)}</Text>}
                />
                {canDelete ? (
                  <Button
                    label="Delete Item"
                    onPress={() => {
                      void handleDeleteItem(item.id);
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

        {session.items.map((item) => (
          <Card key={`rating_${item.id}`} tone="muted">
            <Text variant="label">{item.name}</Text>
            <Input
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
              label="Save Rating"
              onPress={() => {
                void handleSubmitRating(item.id);
              }}
              variant="secondary"
            />
          </Card>
        ))}
      </Card>

      <Card>
        <Text variant="label">Results</Text>

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

        <Button
          disabled={session.status !== 'completed'}
          label="Save to Visit History"
          onPress={() => {
            void handleSaveResultsToVisitHistory();
          }}
        />
      </Card>
    </FeatureDetailScreenScaffold>
  );
}
