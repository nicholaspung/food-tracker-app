import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { ErrorState } from '../components/shared';
import { createQuickTrack } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Button, Input, Screen, Text } from '../ui';

type QuickTrackScreenProps = NativeStackScreenProps<RootStackParamList, 'QuickTrack'>;

export function QuickTrackScreen({ navigation, route }: QuickTrackScreenProps) {
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const sourceNoteId = route.params?.sourceNoteId;

  const [restaurantName, setRestaurantName] = useState('');
  const [itemName, setItemName] = useState('');
  const [rating, setRating] = useState('4');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!restaurantName.trim() || !itemName.trim()) {
      setErrorMessage('Restaurant and item are required.');
      return;
    }

    const parsedRating = Number(rating);
    if (Number.isNaN(parsedRating) || parsedRating <= 0 || parsedRating > 5) {
      setErrorMessage('Rating must be between 1 and 5.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await queueWrite('quick-track.create');
      await createQuickTrack({
        restaurantName,
        itemName,
        rating: parsedRating,
        notes: notes.trim() || undefined,
        sourceNoteId,
      });

      await queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] });
      navigation.navigate('Home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save quick track.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen scroll keyboardAware>
      <Text variant="titleMd">Quick Track</Text>
      {sourceNoteId ? <Text tone="secondary">Linked note: {sourceNoteId}</Text> : null}

      <Input label="Restaurant" onChangeText={setRestaurantName} placeholder="Restaurant" value={restaurantName} />
      <Input label="Item" onChangeText={setItemName} placeholder="Dish name" value={itemName} />
      <Input
        keyboardType="decimal-pad"
        label="Rating (1-5)"
        onChangeText={setRating}
        placeholder="4"
        value={rating}
      />
      <Input label="Notes" onChangeText={setNotes} placeholder="Optional notes" value={notes} />

      {errorMessage ? <ErrorState description={errorMessage} title="Quick track failed" /> : null}

      <Button
        disabled={isSubmitting}
        label={isSubmitting ? 'Saving...' : 'Save Quick Track'}
        onPress={() => {
          void handleCreate();
        }}
      />
    </Screen>
  );
}
