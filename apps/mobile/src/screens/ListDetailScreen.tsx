import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, Skeleton } from '../components/shared';
import {
  getRestaurantListById,
  listRestaurants,
  removeRestaurantFromList,
} from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Button, Card, ListItem, Screen, Text } from '../ui';

type ListDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'ListDetail'>;

export function ListDetailScreen({ navigation, route }: ListDetailScreenProps) {
  const { listId } = route.params;
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['feature', 'restaurantList', listId],
    queryFn: () => getRestaurantListById(listId),
  });

  const restaurantsQuery = useQuery({
    queryKey: ['feature', 'restaurants'],
    queryFn: listRestaurants,
  });

  const restaurantsById = useMemo(() => {
    const map = new Map<string, { name: string; city?: string }>();
    (restaurantsQuery.data ?? []).forEach((restaurant) => {
      map.set(restaurant.id, {
        name: restaurant.name,
        city: restaurant.city,
      });
    });
    return map;
  }, [restaurantsQuery.data]);

  const styles = StyleSheet.create({
    container: {
      gap: theme.spacing.md,
    },
  });

  const handleRemove = async (restaurantId: string) => {
    setErrorMessage(null);

    try {
      await queueWrite('list.restaurant.remove');
      await removeRestaurantFromList(listId, restaurantId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantList', listId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not remove restaurant.';
      setErrorMessage(message);
    }
  };

  if (listQuery.isLoading || restaurantsQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={20} />
        <Skeleton height={20} />
      </Screen>
    );
  }

  if (listQuery.isError || restaurantsQuery.isError) {
    return (
      <Screen>
        <ErrorState
          description="Could not load list detail."
          onRetry={() => {
            void listQuery.refetch();
            void restaurantsQuery.refetch();
          }}
          title="List detail unavailable"
        />
      </Screen>
    );
  }

  if (!listQuery.data) {
    return (
      <Screen>
        <EmptyState
          actionLabel="Back to Lists"
          onAction={() => {
            navigation.navigate('Lists');
          }}
          title="List not found"
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.container}>
        <Text variant="titleMd">{listQuery.data.name}</Text>
        {listQuery.data.description ? <Text tone="secondary">{listQuery.data.description}</Text> : null}

        <Button
          label="Add Restaurant"
          onPress={() => {
            navigation.navigate('AddRestaurantToList', { listId });
          }}
        />

        {errorMessage ? <ErrorState description={errorMessage} title="List update failed" /> : null}

        {listQuery.data.restaurantIds.length === 0 ? (
          <EmptyState description="Add a restaurant to this list." title="No restaurants yet" />
        ) : (
          listQuery.data.restaurantIds.map((restaurantId) => {
            const restaurant = restaurantsById.get(restaurantId);
            return (
              <Card key={restaurantId} tone="muted">
                <ListItem
                  description={restaurant?.city ?? 'City not set'}
                  title={restaurant?.name ?? 'Unknown restaurant'}
                  trailing={
                    <Button
                      label="Remove"
                      onPress={() => {
                        void handleRemove(restaurantId);
                      }}
                      variant="secondary"
                    />
                  }
                />
              </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}
