import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  EmptyState,
  ErrorState,
  FeatureFormScreenScaffold,
  PageErrorToast,
  VisibilityOptionSelector,
  type VisibilityOptionValue,
  Skeleton,
} from '../components/shared';
import { getRestaurantListById, updateRestaurantList, type RestaurantListRecord } from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Card, Input, Text } from '../ui';

type EditRestaurantListScreenProps = NativeStackScreenProps<RootStackParamList, 'EditRestaurantList'>;
type ListVisibility = RestaurantListRecord['visibility'];
const LIST_VISIBILITY_OPTIONS: readonly VisibilityOptionValue[] = ['private', 'friends'];

export function EditRestaurantListScreen({ navigation, route }: EditRestaurantListScreenProps) {
  const { listId } = route.params;
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ListVisibility>('private');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['feature', 'restaurantList', listId],
    queryFn: () => getRestaurantListById(listId),
  });

  useEffect(() => {
    const list = listQuery.data;
    if (!list) {
      return;
    }

    setName(list.name);
    setDescription(list.description ?? '');
    setVisibility(list.visibility);
  }, [listQuery.data]);

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
    },
    formCard: {
      borderColor: theme.colors.border.info,
      gap: theme.spacing.sm,
    },
    descriptionInput: {
      minHeight: 110,
      textAlignVertical: 'top',
    },
  });

  const canSubmit = useMemo(() => name.trim().length > 0 && !isSubmitting, [isSubmitting, name]);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('ListDetail', { listId });
  };

  const handleSaveList = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      trackObservabilityEvent('EDIT_RESTAURANT_LIST_SUBMIT_VALIDATION_FAILED', {
        source: 'EditRestaurantListScreen',
        reason: 'missing_name',
        listId,
        visibility,
      });
      setErrorMessage('List name is required.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('EDIT_RESTAURANT_LIST_SUBMIT_STARTED', {
      source: 'EditRestaurantListScreen',
      listId,
      visibility,
      isOnline,
      hasDescription: description.trim().length > 0,
    });
    setIsSubmitting(true);

    try {
      const listUpdateInput = {
        name: trimmedName,
        description,
        visibility,
      };

      if (!isOnline) {
        await queueFeatureOutbox('list.update', {
          listId,
          updates: listUpdateInput,
        });

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantList', listId] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] }),
        ]);
        trackObservabilityEvent('EDIT_RESTAURANT_LIST_SUBMIT_SUCCEEDED', {
          source: 'EditRestaurantListScreen',
          listId,
          queued: true,
          visibility,
        });
        showQueuedOfflineAlert('List update');
        handleBack();
        return;
      }

      await queueWrite('list.update');
      await updateRestaurantList(listId, listUpdateInput);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantList', listId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] }),
      ]);
      trackObservabilityEvent('EDIT_RESTAURANT_LIST_SUBMIT_SUCCEEDED', {
        source: 'EditRestaurantListScreen',
        listId,
        queued: false,
        visibility,
      });
      handleBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update list.';
      setErrorMessage(message);
      trackObservabilityEvent('EDIT_RESTAURANT_LIST_SUBMIT_FAILED', {
        source: 'EditRestaurantListScreen',
        listId,
        visibility,
        isOnline,
        error: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (listQuery.isLoading) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={handleBack}
        primaryAction={{
          label: 'Save List',
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: handleBack,
        }}
        title="Edit List"
      >
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
      </FeatureFormScreenScaffold>
    );
  }

  if (listQuery.isError) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={handleBack}
        primaryAction={{
          label: 'Save List',
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: handleBack,
        }}
        title="Edit List"
      >
        <ErrorState
          description="Could not load list details."
          onRetry={() => {
            void listQuery.refetch();
          }}
          title="List unavailable"
        />
      </FeatureFormScreenScaffold>
    );
  }

  if (!listQuery.data) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={handleBack}
        primaryAction={{
          label: 'Save List',
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: handleBack,
        }}
        title="Edit List"
      >
        <EmptyState
          actionLabel="Back to List"
          onAction={handleBack}
          title="List not found"
        />
      </FeatureFormScreenScaffold>
    );
  }

  return (
    <FeatureFormScreenScaffold
      keyboardAware
      onBackPress={handleBack}
      primaryAction={{
        label: 'Save List',
        disabled: !canSubmit,
        loading: isSubmitting,
        onPress: () => {
          void handleSaveList();
        },
      }}
      secondaryAction={{
        label: 'Cancel',
        onPress: handleBack,
      }}
      subtitle="Update your list name, description, and whether it stays private or is shared with friends."
      testID="edit-restaurant-list-screen"
      title="Edit List"
    >
      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Could not save list" />

        <Card style={styles.formCard} tone="muted">
          <Input
            autoCapitalize="words"
            label="List name"
            onChangeText={setName}
            placeholder="List name"
            value={name}
          />
          <Input
            label="Description"
            inputStyle={styles.descriptionInput}
            multiline
            onChangeText={setDescription}
            placeholder="Optional description"
            value={description}
          />
          <Text variant="label">Visibility</Text>
          <VisibilityOptionSelector
            onChange={(nextVisibility) => {
              const resolvedVisibility: ListVisibility = nextVisibility === 'friends' ? 'friends' : 'private';
              trackObservabilityEvent('EDIT_RESTAURANT_LIST_VISIBILITY_CHANGED', {
                source: 'EditRestaurantListScreen',
                listId,
                previousVisibility: visibility,
                nextVisibility: resolvedVisibility,
              });
              setVisibility(resolvedVisibility);
            }}
            options={LIST_VISIBILITY_OPTIONS}
            value={visibility as VisibilityOptionValue}
          />
        </Card>
      </View>
    </FeatureFormScreenScaffold>
  );
}
