import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, Skeleton } from '../components/shared';
import { getVisitById, updateVisit, type VisitItem } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';

type EditVisitScreenProps = NativeStackScreenProps<RootStackParamList, 'EditVisit'>;

interface EditableVisitItem extends VisitItem {
  ratingText: string;
}

export function EditVisitScreen({ navigation, route }: EditVisitScreenProps) {
  const { visitId } = route.params;
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();

  const visitQuery = useQuery({
    queryKey: ['feature', 'visit', visitId],
    queryFn: () => getVisitById(visitId),
  });

  const [restaurantName, setRestaurantName] = useState('');
  const [items, setItems] = useState<EditableVisitItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!visitQuery.data) {
      return;
    }

    setRestaurantName(visitQuery.data.restaurantName);
    setItems(
      visitQuery.data.items.map((item) => ({
        ...item,
        ratingText: item.rating.toString(),
      })),
    );
  }, [visitQuery.data]);

  const updateItem = (itemId: string, updates: Partial<Pick<EditableVisitItem, 'ratingText' | 'notes'>>) => {
    setItems((currentItems) =>
      currentItems.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
    );
  };

  const styles = StyleSheet.create({
    container: {
      gap: theme.spacing.md,
    },
    itemCard: {
      gap: theme.spacing.sm,
    },
  });

  const handleSave = async () => {
    if (!restaurantName.trim()) {
      setErrorMessage('Restaurant name is required.');
      return;
    }

    const parsedItems: VisitItem[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      rating: Number(item.ratingText),
      notes: item.notes,
    }));

    if (parsedItems.some((item) => Number.isNaN(item.rating) || item.rating <= 0 || item.rating > 5)) {
      setErrorMessage('Ratings must be between 1 and 5.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await queueWrite('visit.update');
      await updateVisit(visitId, {
        restaurantName,
        items: parsedItems,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'visits'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visit', visitId] }),
      ]);
      navigation.navigate('Home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update visit.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (visitQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
      </Screen>
    );
  }

  if (visitQuery.isError) {
    return (
      <Screen>
        <ErrorState
          description="Could not load visit details."
          onRetry={() => {
            void visitQuery.refetch();
          }}
          title="Visit unavailable"
        />
      </Screen>
    );
  }

  if (!visitQuery.data) {
    return (
      <Screen>
        <EmptyState
          actionLabel="Back to Home"
          onAction={() => {
            navigation.navigate('Home');
          }}
          title="Visit not found"
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.container}>
        <Text variant="titleMd">Edit Visit</Text>
        <Input label="Restaurant" onChangeText={setRestaurantName} value={restaurantName} />

        {errorMessage ? <ErrorState description={errorMessage} title="Update failed" /> : null}

        {items.map((item) => (
          <Card key={item.id} style={styles.itemCard} tone="muted">
            <Text variant="label">{item.name}</Text>
            <Input
              keyboardType="decimal-pad"
              label="Rating"
              onChangeText={(value) => {
                updateItem(item.id, { ratingText: value });
              }}
              value={item.ratingText}
            />
            <Input
              label="Notes"
              onChangeText={(value) => {
                updateItem(item.id, { notes: value });
              }}
              value={item.notes ?? ''}
            />
          </Card>
        ))}

        <Button
          disabled={isSubmitting}
          label={isSubmitting ? 'Saving...' : 'Save Changes'}
          onPress={() => {
            void handleSave();
          }}
        />
      </View>
    </Screen>
  );
}
