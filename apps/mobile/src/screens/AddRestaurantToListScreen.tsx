import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { FeatureFormScreenScaffold } from '../components/shared';
import { addRestaurantToList } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Input } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type AddRestaurantToListScreenProps = NativeStackScreenProps<RootStackParamList, 'AddRestaurantToList'>;

export function AddRestaurantToListScreen({ navigation, route }: AddRestaurantToListScreenProps) {
  const { listId } = route.params;
  const queueWrite = useQueuedWrite();
  const queryClient = useQueryClient();

  const [restaurantName, setRestaurantName] = useState('');
  const [city, setCity] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    if (!restaurantName.trim()) {
      setErrorMessage('Restaurant name is required.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await queueWrite('list.restaurant.add');
      await addRestaurantToList(listId, restaurantName, city || undefined);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantList', listId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurants'] }),
      ]);
      navigation.navigate('ListDetail', { listId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add restaurant.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FeatureFormScreenScaffold
      onBackPress={() => {
        navigation.navigate('ListDetail', { listId });
      }}
      primaryAction={{
        disabled: !restaurantName.trim() || isSubmitting,
        label: isSubmitting ? 'Saving...' : 'Save',
        onPress: () => {
          void handleSave();
        },
      }}
      secondaryAction={{
        disabled: isSubmitting,
        label: 'Cancel',
        onPress: () => {
          navigation.navigate('ListDetail', { listId });
        },
        variant: 'secondary',
      }}
      subtitle="Add a restaurant to this list."
      title="Add Restaurant"
    >
      <Input
        label="Restaurant name"
        onChangeText={setRestaurantName}
        placeholder="Restaurant"
        value={restaurantName}
      />
      <Input label="City" onChangeText={setCity} placeholder="Optional city" value={city} />

      <PageErrorToast errorMessage={errorMessage} title="Could not add restaurant" />
    </FeatureFormScreenScaffold>
  );
}
