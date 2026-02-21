import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, FeatureFormScreenScaffold, Skeleton } from '../components/shared';
import { getVisitById, updateVisit, type VisitItem } from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Card, Input, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type EditVisitScreenProps = NativeStackScreenProps<RootStackParamList, 'EditVisit'>;

interface EditableVisitItem extends VisitItem {
  ratingText: string;
}

export function EditVisitScreen({ navigation, route }: EditVisitScreenProps) {
  const { visitId } = route.params;
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();

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
      const visitUpdateInput = {
        restaurantName,
        items: parsedItems,
      };

      if (!isOnline) {
        await queueFeatureOutbox('visit.update', {
          visitId,
          updates: visitUpdateInput,
        });

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['feature', 'visits'] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'visit', visitId] }),
        ]);
        Alert.alert('Saved Offline', 'Visit update queued and will sync when you reconnect.');
        navigation.navigate('Home');
        return;
      }

      await queueWrite('visit.update');
      await updateVisit(visitId, visitUpdateInput);

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

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Home');
  };

  if (visitQuery.isLoading) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={handleBackPress}
        primaryAction={{
          label: 'Save Changes',
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: handleBackPress,
        }}
        title="Edit Visit"
      >
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
      </FeatureFormScreenScaffold>
    );
  }

  if (visitQuery.isError) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={handleBackPress}
        primaryAction={{
          label: 'Save Changes',
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: handleBackPress,
        }}
        title="Edit Visit"
      >
        <ErrorState
          description="Could not load visit details."
          onRetry={() => {
            void visitQuery.refetch();
          }}
          title="Visit unavailable"
        />
      </FeatureFormScreenScaffold>
    );
  }

  if (!visitQuery.data) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={handleBackPress}
        primaryAction={{
          label: 'Save Changes',
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: handleBackPress,
        }}
        title="Edit Visit"
      >
        <EmptyState
          actionLabel="Back to Home"
          onAction={() => {
            navigation.navigate('Home');
          }}
          title="Visit not found"
        />
      </FeatureFormScreenScaffold>
    );
  }

  return (
    <FeatureFormScreenScaffold
      onBackPress={handleBackPress}
      primaryAction={{
        label: 'Save Changes',
        disabled: isSubmitting,
        loading: isSubmitting,
        onPress: () => {
          void handleSave();
        },
      }}
      secondaryAction={{
        label: 'Cancel',
        onPress: handleBackPress,
      }}
      title="Edit Visit"
    >
      <View style={styles.container}>
        <Input label="Restaurant" onChangeText={setRestaurantName} value={restaurantName} />

        <PageErrorToast errorMessage={errorMessage} title="Update failed" />

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
      </View>
    </FeatureFormScreenScaffold>
  );
}
