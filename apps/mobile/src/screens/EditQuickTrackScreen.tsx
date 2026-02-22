import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, FeatureFormScreenScaffold, Skeleton } from '../components/shared';
import { getQuickTrackById, updateQuickTrack } from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { Input } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type EditQuickTrackScreenProps = NativeStackScreenProps<RootStackParamList, 'EditQuickTrack'>;

export function EditQuickTrackScreen({ navigation, route }: EditQuickTrackScreenProps) {
  const { quickTrackId } = route.params;
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();

  const quickTrackQuery = useQuery({
    queryKey: ['feature', 'quickTrack', quickTrackId],
    queryFn: () => getQuickTrackById(quickTrackId),
  });

  const [restaurantName, setRestaurantName] = useState('');
  const [itemName, setItemName] = useState('');
  const [rating, setRating] = useState('4');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!quickTrackQuery.data) {
      return;
    }

    setRestaurantName(quickTrackQuery.data.restaurantName);
    setItemName(quickTrackQuery.data.itemName);
    setRating(quickTrackQuery.data.rating.toString());
    setNotes(quickTrackQuery.data.notes ?? '');
  }, [quickTrackQuery.data]);

  const handleSave = async () => {
    if (!restaurantName.trim() || !itemName.trim()) {
      trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_VALIDATION_FAILED', {
        source: 'EditQuickTrackScreen',
        quickTrackId,
        reason: 'missing_restaurant_or_item',
      });
      setErrorMessage('Restaurant and item are required.');
      return;
    }

    const parsedRating = Number(rating);
    if (Number.isNaN(parsedRating) || parsedRating <= 0 || parsedRating > 5) {
      trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_VALIDATION_FAILED', {
        source: 'EditQuickTrackScreen',
        quickTrackId,
        reason: 'invalid_rating',
      });
      setErrorMessage('Rating must be between 1 and 5.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_STARTED', {
      source: 'EditQuickTrackScreen',
      quickTrackId,
      isOnline,
      hasNotes: notes.trim().length > 0,
    });
    setIsSubmitting(true);

    try {
      const quickTrackUpdateInput = {
        restaurantName,
        itemName,
        rating: parsedRating,
        notes: notes.trim() || undefined,
      };

      if (!isOnline) {
        await queueFeatureOutbox('quick-track.update', {
          quickTrackId,
          updates: quickTrackUpdateInput,
        });

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'quickTrack', quickTrackId] }),
        ]);
        trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_SUCCEEDED', {
          source: 'EditQuickTrackScreen',
          quickTrackId,
          queued: true,
        });
        showQueuedOfflineAlert('Quick track update');
        navigation.navigate('Home');
        return;
      }

      await queueWrite('quick-track.update');
      await updateQuickTrack(quickTrackId, quickTrackUpdateInput);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'quickTrack', quickTrackId] }),
      ]);
      trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_SUCCEEDED', {
        source: 'EditQuickTrackScreen',
        quickTrackId,
        queued: false,
      });
      navigation.navigate('Home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update quick track.';
      setErrorMessage(message);
      trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_FAILED', {
        source: 'EditQuickTrackScreen',
        quickTrackId,
        error: message,
      });
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

  if (quickTrackQuery.isLoading) {
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
        title="Edit Quick Track"
      >
        <Skeleton height={20} />
        <Skeleton height={20} />
      </FeatureFormScreenScaffold>
    );
  }

  if (quickTrackQuery.isError) {
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
        title="Edit Quick Track"
      >
        <ErrorState
          description="Could not load quick-track item."
          onRetry={() => {
            void quickTrackQuery.refetch();
          }}
          title="Quick track unavailable"
        />
      </FeatureFormScreenScaffold>
    );
  }

  if (!quickTrackQuery.data) {
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
        title="Edit Quick Track"
      >
        <EmptyState
          actionLabel="Back to Home"
          onAction={() => {
            navigation.navigate('Home');
          }}
          title="Quick-track item not found"
        />
      </FeatureFormScreenScaffold>
    );
  }

  return (
    <FeatureFormScreenScaffold
      keyboardAware
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
      title="Edit Quick Track"
    >
      <Input label="Restaurant" onChangeText={setRestaurantName} value={restaurantName} />
      <Input label="Item" onChangeText={setItemName} value={itemName} />
      <Input keyboardType="decimal-pad" label="Rating (1-5)" onChangeText={setRating} value={rating} />
      <Input label="Notes" onChangeText={setNotes} value={notes} />

      <PageErrorToast errorMessage={errorMessage} title="Could not save" />
    </FeatureFormScreenScaffold>
  );
}
