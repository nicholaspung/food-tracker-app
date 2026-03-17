import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import {
  FeatureFormScreenScaffold,
  PageErrorToast,
  VisibilityOptionSelector,
  type VisibilityOptionValue,
} from '../components/shared';
import { createRestaurantList, type RestaurantListRecord } from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Card, Input, Text } from '../ui';

type CreateRestaurantListScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateRestaurantList'>;
type ListVisibility = RestaurantListRecord['visibility'];
const LIST_VISIBILITY_OPTIONS: readonly VisibilityOptionValue[] = ['private', 'friends'];

export function CreateRestaurantListScreen({ navigation }: CreateRestaurantListScreenProps) {
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

    navigation.navigate('Lists');
  };

  const handleCreateList = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      trackObservabilityEvent('CREATE_RESTAURANT_LIST_SUBMIT_VALIDATION_FAILED', {
        source: 'CreateRestaurantListScreen',
        reason: 'missing_name',
        visibility,
      });
      setErrorMessage('List name is required.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('CREATE_RESTAURANT_LIST_SUBMIT_STARTED', {
      source: 'CreateRestaurantListScreen',
      visibility,
      isOnline,
      hasDescription: description.trim().length > 0,
    });
    setIsSubmitting(true);

    try {
      const listInput = {
        name: trimmedName,
        description,
        visibility,
      };

      if (!isOnline) {
        await queueFeatureOutbox('list.create', listInput);
        await queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] });
        trackObservabilityEvent('CREATE_RESTAURANT_LIST_SUBMIT_SUCCEEDED', {
          source: 'CreateRestaurantListScreen',
          queued: true,
          visibility,
        });
        showQueuedOfflineAlert('List');
        navigation.navigate('Lists');
        return;
      }

      await queueWrite('list.create');
      const createdList = await createRestaurantList(listInput);

      await queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] });
      trackObservabilityEvent('CREATE_RESTAURANT_LIST_SUBMIT_SUCCEEDED', {
        source: 'CreateRestaurantListScreen',
        queued: false,
        visibility,
        listId: createdList.id,
      });
      navigation.replace('ListDetail', { listId: createdList.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create list.';
      setErrorMessage(message);
      trackObservabilityEvent('CREATE_RESTAURANT_LIST_SUBMIT_FAILED', {
        source: 'CreateRestaurantListScreen',
        visibility,
        isOnline,
        error: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FeatureFormScreenScaffold
      keyboardAware
      onBackPress={handleBack}
      primaryAction={{
        label: 'Create List',
        disabled: !canSubmit,
        loading: isSubmitting,
        onPress: () => {
          void handleCreateList();
        },
      }}
      secondaryAction={{
        label: 'Cancel',
        onPress: handleBack,
      }}
      subtitle="Set your list name, description, and whether it stays private or is shared with friends."
      testID="create-restaurant-list-screen"
      title="Create New List"
    >
      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Could not create list" />

        <Card style={styles.formCard} tone="muted">
          <Input
            autoCapitalize="words"
            label="List name"
            onChangeText={setName}
            placeholder="Best pizza spots"
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
              trackObservabilityEvent('CREATE_RESTAURANT_LIST_VISIBILITY_CHANGED', {
                source: 'CreateRestaurantListScreen',
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
