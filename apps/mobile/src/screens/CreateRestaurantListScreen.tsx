import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
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
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Card, Input, Text } from '../ui';

type CreateRestaurantListScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateRestaurantList'>;
type ListVisibility = RestaurantListRecord['visibility'];

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
      setErrorMessage('List name is required.');
      return;
    }

    setErrorMessage(null);
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
        Alert.alert('Saved Offline', 'List queued and will sync when you reconnect.');
        navigation.navigate('Lists');
        return;
      }

      await queueWrite('list.create');
      const createdList = await createRestaurantList(listInput);

      await queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] });
      navigation.replace('ListDetail', { listId: createdList.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create list.';
      setErrorMessage(message);
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
      subtitle="Set your list name, description, and who can see it."
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
            onChange={setVisibility}
            value={visibility as VisibilityOptionValue}
          />
        </Card>
      </View>
    </FeatureFormScreenScaffold>
  );
}
