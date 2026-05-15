import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ConfirmDestructiveModal, EmptyState, FeatureFormScreenScaffold, PageErrorToast } from '../components/shared';
import { RatingSelector } from '../components/shared/RatingSelector';
import {
  completeTastingSession,
  submitTastingRatings,
  tastingSessionsQueryKeys,
  type TastingMenuItemRecord,
} from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Input, ListItem, Text } from '../ui';
import { useTastingSessionDetail } from './tastingSessions/useTastingSessionDetail';

type TastingSessionTastingScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionTasting'>;

const useStyles = createThemedStyles((theme) => ({
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  action: {
    flex: 1,
  },
}));

interface RatingDraft {
  included: boolean;
  rating: number;
  note: string;
}

export function TastingSessionTastingScreen({ navigation, route }: TastingSessionTastingScreenProps) {
  const styles = useStyles();
  const { sessionId } = route.params;
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const sessionQuery = useTastingSessionDetail(sessionId, true);
  const session = sessionQuery.data;
  const [drafts, setDrafts] = useState<Record<string, RatingDraft>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const isLeader = Boolean(session && user?.id === session.leaderUserId);
  const currentParticipant = session?.participants.find((participant) => participant.userId === user?.id);

  const approvedRestaurants = useMemo(
    () => session?.restaurants.filter((restaurant) => restaurant.status === 'approved') ?? [],
    [session?.restaurants],
  );
  const approvedItems = approvedRestaurants.flatMap((restaurant) =>
    restaurant.items.filter((item) => item.status === 'approved'),
  );

  const resolveDraft = (item: TastingMenuItemRecord): RatingDraft => {
    const savedRating = currentParticipant
      ? item.ratings.find((rating) => rating.participantId === currentParticipant.id)
      : undefined;
    return (
      drafts[item.id] ?? {
        included: true,
        note: savedRating?.note ?? '',
        rating: savedRating?.rating ?? 3,
      }
    );
  };

  const handleSubmit = async () => {
    if (!isOnline) {
      setErrorMessage('Connect to the internet to submit ratings.');
      return;
    }
    try {
      setErrorMessage(null);
      const restaurants = approvedRestaurants
        .map((restaurant) => ({
          restaurantSuggestionId: restaurant.id,
          items: restaurant.items
            .filter((item) => item.status === 'approved')
            .map((item) => ({ item, draft: resolveDraft(item) }))
            .filter(({ draft }) => draft.included)
            .map(({ item, draft }) => ({
              itemId: item.id,
              note: draft.note.trim() || undefined,
              rating: draft.rating,
            })),
        }))
        .filter((restaurant) => restaurant.items.length > 0);
      await submitTastingRatings(sessionId, { restaurants });
      await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not submit ratings.');
    }
  };

  const handleComplete = async () => {
    if (!isOnline) {
      setErrorMessage('Connect to the internet to complete this tasting.');
      return;
    }
    try {
      const nextSession = await completeTastingSession(sessionId);
      await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) });
      navigation.replace('TastingSessionResults', { sessionId: nextSession.id });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not complete session.');
    }
  };

  if (!session) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={() => navigation.navigate('TastingSessions')}
        primaryAction={{ disabled: true, label: 'Submit Ratings', onPress: () => undefined }}
        title="Tasting"
      >
        <EmptyState title="Loading tasting" />
      </FeatureFormScreenScaffold>
    );
  }

  return (
    <FeatureFormScreenScaffold
      onBackPress={() => navigation.navigate('TastingSessions')}
      primaryAction={{
        disabled: approvedItems.length === 0 || !isOnline,
        label: 'Submit Ratings',
        onPress: () => {
          void handleSubmit();
        },
      }}
      secondaryAction={
        isLeader
          ? {
              disabled: !isOnline,
              label: 'Complete',
              onPress: () => setShowCompleteConfirm(true),
            }
          : undefined
      }
      subtitle="Rate the items you tried."
      title={session.name}
    >
      {!isOnline ? <Text tone="warning">Rating actions require a connection.</Text> : null}
      <PageErrorToast errorMessage={errorMessage} title="Tasting action failed" />
      {approvedRestaurants.map((restaurant) => (
        <Card key={restaurant.id}>
          <Text variant="label">{restaurant.restaurantName}</Text>
          {restaurant.items.filter((item) => item.status === 'approved').map((item) => {
            const draft = resolveDraft(item);
            return (
              <Card key={item.id} tone="muted">
                <ListItem
                  description={draft.included ? 'Included in your rating submission' : 'Removed from your rating list'}
                  title={item.name}
                />
                {draft.included ? (
                  <>
                    <RatingSelector
                      onChange={(rating) =>
                        setDrafts((current) => ({ ...current, [item.id]: { ...draft, rating } }))
                      }
                      value={draft.rating}
                    />
                    <Input
                      label="Notes"
                      onChangeText={(note) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, note } }))}
                      placeholder="Optional notes"
                      value={draft.note}
                    />
                  </>
                ) : null}
                <View style={styles.row}>
                  <Button
                    label={draft.included ? 'Remove From My List' : 'Add Back'}
                    onPress={() =>
                      setDrafts((current) => ({ ...current, [item.id]: { ...draft, included: !draft.included } }))
                    }
                    style={styles.action}
                    variant="secondary"
                  />
                </View>
              </Card>
            );
          })}
        </Card>
      ))}

      <ConfirmDestructiveModal
        cancelLabel="Keep Tasting"
        confirmLabel="Complete Session"
        description="Complete this tasting and reveal submitted ratings? Participants who have not submitted will be omitted from results."
        onCancel={() => setShowCompleteConfirm(false)}
        onConfirm={() => {
          setShowCompleteConfirm(false);
          void handleComplete();
        }}
        title="Complete Tasting?"
        visible={showCompleteConfirm}
      />
    </FeatureFormScreenScaffold>
  );
}
