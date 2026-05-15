import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmptyState, FeatureDetailScreenScaffold, RatingPill } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Card, ListItem, Text } from '../ui';
import { useTastingSessionDetail } from './tastingSessions/useTastingSessionDetail';

type TastingSessionResultsScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionResults'>;

function averageRating(ratings: { rating: number }[]): number {
  if (ratings.length === 0) {
    return 0;
  }
  return ratings.reduce((sum, rating) => sum + rating.rating, 0) / ratings.length;
}

export function TastingSessionResultsScreen({ navigation, route }: TastingSessionResultsScreenProps) {
  const { sessionId } = route.params;
  const sessionQuery = useTastingSessionDetail(sessionId, false);
  const session = sessionQuery.data;
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  if (!session) {
    return (
      <FeatureDetailScreenScaffold onBackPress={() => navigation.navigate('TastingSessions')} title="Results">
        <EmptyState title="Loading results" />
      </FeatureDetailScreenScaffold>
    );
  }

  const participantById = new Map(session.participants.map((participant) => [participant.id, participant]));

  return (
    <FeatureDetailScreenScaffold
      onBackPress={() => navigation.navigate('TastingSessions')}
      subtitle={session.status === 'completed' ? 'Group ratings and notes' : 'Results appear after completion.'}
      title={session.name}
    >
      {session.status !== 'completed' ? (
        <EmptyState description="The leader has not completed this tasting yet." title="Results locked" />
      ) : null}

      {session.status === 'completed'
        ? session.restaurants
            .filter((restaurant) => restaurant.status === 'approved')
            .map((restaurant) => (
              <Card key={restaurant.id}>
                <Text variant="label">{restaurant.restaurantName}</Text>
                {restaurant.items
                  .filter((item) => item.status === 'approved')
                  .map((item) => {
                    const average = averageRating(item.ratings);
                    const expanded = expandedItems[item.id] ?? false;
                    return (
                      <Card key={item.id} tone="muted">
                        <ListItem
                          description={`${item.ratings.length} ratings`}
                          onPress={() => setExpandedItems((current) => ({ ...current, [item.id]: !expanded }))}
                          title={item.name}
                          trailing={average > 0 ? <RatingPill rating={Math.round(average)} /> : <Text tone="muted">No ratings</Text>}
                        />
                        {expanded
                          ? item.ratings.map((rating) => (
                              <ListItem
                                key={rating.id}
                                description={rating.note || 'No notes'}
                                title={participantById.get(rating.participantId)?.name ?? 'Participant'}
                                trailing={<RatingPill rating={rating.rating} />}
                                tone="muted"
                              />
                            ))
                          : null}
                      </Card>
                    );
                  })}
              </Card>
            ))
        : null}
    </FeatureDetailScreenScaffold>
  );
}
