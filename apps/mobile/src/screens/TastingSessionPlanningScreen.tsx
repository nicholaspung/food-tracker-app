import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmptyState, FeatureDetailScreenScaffold, PageErrorToast, StatusPill } from '../components/shared';
import {
  setTastingMenuItemSuggestionStatus,
  setTastingRestaurantSuggestionStatus,
  startTastingSession,
  suggestTastingMenuItem,
  suggestTastingRestaurant,
  tastingSessionsQueryKeys,
  type TastingSuggestionStatus,
} from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Input, ListItem, Text } from '../ui';
import { getApprovedItemCount, hasPendingSuggestions } from './tastingSessions/shared';
import { useTastingSessionDetail } from './tastingSessions/useTastingSessionDetail';

type TastingSessionPlanningScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionPlanning'>;

const useStyles = createThemedStyles((theme) => ({
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  action: {
    flex: 1,
  },
}));

function statusTone(status: TastingSuggestionStatus): 'info' | 'success' | 'danger' {
  return status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : 'info';
}

export function TastingSessionPlanningScreen({ navigation, route }: TastingSessionPlanningScreenProps) {
  const styles = useStyles();
  const { sessionId } = route.params;
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const sessionQuery = useTastingSessionDetail(sessionId, true);
  const session = sessionQuery.data;
  const [restaurantName, setRestaurantName] = useState('');
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isLeader = Boolean(session && user?.id === session.leaderUserId);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) });
  };

  const runAction = async (action: () => Promise<unknown>) => {
    if (!isOnline) {
      setErrorMessage('Planning actions require a connection.');
      return;
    }
    try {
      setErrorMessage(null);
      await action();
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Planning action failed.');
    }
  };

  if (!session) {
    return (
      <FeatureDetailScreenScaffold onBackPress={() => navigation.navigate('TastingSessions')} title="Planning">
        <EmptyState title="Loading planning" />
      </FeatureDetailScreenScaffold>
    );
  }

  const approvedItems = getApprovedItemCount(session);
  const canStart = isLeader && !hasPendingSuggestions(session) && approvedItems > 0;

  return (
    <FeatureDetailScreenScaffold onBackPress={() => navigation.navigate('TastingSessions')} subtitle="Suggest and finalize the plan." title={session.name}>
      {!isOnline ? <Text tone="warning">Planning actions require a connection.</Text> : null}
      <PageErrorToast errorMessage={errorMessage} title="Planning failed" />

      <Card>
        <Text variant="label">Readiness</Text>
        <Text tone={hasPendingSuggestions(session) ? 'warning' : 'success'}>
          {hasPendingSuggestions(session) ? 'Resolve all pending suggestions.' : 'All suggestions resolved.'}
        </Text>
        <Text tone={approvedItems > 0 ? 'success' : 'warning'}>{approvedItems} approved items</Text>
        {isLeader ? (
          <Button
            disabled={!canStart || !isOnline}
            label="Start Tasting"
            onPress={() =>
              void runAction(async () => {
                const nextSession = await startTastingSession(sessionId);
                navigation.replace('TastingSessionTasting', { sessionId: nextSession.id });
              })
            }
          />
        ) : (
          <Text tone="secondary">The leader starts tasting when the plan is finalized.</Text>
        )}
      </Card>

      <Card>
        <Text variant="label">Suggest restaurant</Text>
        <Input label="Restaurant name" onChangeText={setRestaurantName} placeholder="Restaurant" value={restaurantName} />
        <Button
          disabled={!restaurantName.trim() || !isOnline}
          label="Suggest Restaurant"
          onPress={() =>
            void runAction(async () => {
              await suggestTastingRestaurant(sessionId, { restaurantName });
              setRestaurantName('');
            })
          }
          variant="secondary"
        />
      </Card>

      {session.restaurants.length === 0 ? <EmptyState description="Suggest restaurants to build the tasting plan." title="No suggestions" /> : null}

      {session.restaurants.map((restaurant) => (
        <Card key={restaurant.id}>
          <ListItem
            description={`${restaurant.items.length} suggested items`}
            title={restaurant.restaurantName}
            trailing={<StatusPill label={restaurant.status} tone={statusTone(restaurant.status)} />}
          />
          {isLeader && restaurant.status === 'pending' ? (
            <View style={styles.row}>
              <Button
                disabled={!isOnline}
                label="Approve"
                onPress={() => void runAction(() => setTastingRestaurantSuggestionStatus(sessionId, restaurant.id, 'approved'))}
                style={styles.action}
              />
              <Button
                disabled={!isOnline}
                label="Reject"
                onPress={() => void runAction(() => setTastingRestaurantSuggestionStatus(sessionId, restaurant.id, 'rejected'))}
                style={styles.action}
                variant="secondary"
              />
            </View>
          ) : null}
          {restaurant.status !== 'rejected' ? (
            <>
              <Input
                label="Suggest menu item"
                onChangeText={(value) => setItemDrafts((current) => ({ ...current, [restaurant.id]: value }))}
                placeholder="Menu item"
                value={itemDrafts[restaurant.id] ?? ''}
              />
              <Button
                disabled={!itemDrafts[restaurant.id]?.trim() || !isOnline}
                label="Suggest Item"
                onPress={() =>
                  void runAction(async () => {
                    await suggestTastingMenuItem(sessionId, restaurant.id, { name: itemDrafts[restaurant.id] ?? '' });
                    setItemDrafts((current) => ({ ...current, [restaurant.id]: '' }));
                  })
                }
                variant="secondary"
              />
            </>
          ) : null}
          {restaurant.items.map((item) => (
            <ListItem
              key={item.id}
              description={item.status}
              title={item.name}
              trailing={
                isLeader && item.status === 'pending' ? (
                  <View style={styles.row}>
                    <Button
                      disabled={!isOnline}
                      label="Approve"
                      onPress={() => void runAction(() => setTastingMenuItemSuggestionStatus(sessionId, item.id, 'approved'))}
                      variant="secondary"
                    />
                    <Button
                      disabled={!isOnline}
                      label="Reject"
                      onPress={() => void runAction(() => setTastingMenuItemSuggestionStatus(sessionId, item.id, 'rejected'))}
                      variant="secondary"
                    />
                  </View>
                ) : null
              }
            />
          ))}
        </Card>
      ))}
    </FeatureDetailScreenScaffold>
  );
}
