import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import {
  FeatureFormScreenScaffold,
  PageErrorToast,
  VisibilityOptionSelector,
  type VisibilityOptionValue,
} from '../components/shared';
import { createCollectionRecord, getAuthenticatedUserIdOrNull } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Card, Input, Text } from '../ui';

type CreateVisitAddMenuItemScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'CreateVisitAddMenuItem'
>;

interface MenuItemRecord {
  id: string;
  name: string;
}

export function CreateVisitAddMenuItemScreen({
  navigation,
  route,
}: CreateVisitAddMenuItemScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { isOnline } = useConnectivity();

  const { restaurantId, restaurantName } = route.params;

  const [menuItemName, setMenuItemName] = useState('');
  const [visibility, setVisibility] = useState<VisibilityOptionValue>('friends');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
    },
    formCard: {
      gap: theme.spacing.sm,
    },
    visibilitySection: {
      gap: theme.spacing.xs,
    },
  });

  const handleAddMenuItem = async () => {
    if (!isOnline) {
      setErrorMessage('Adding menu items requires internet connection.');
      return;
    }

    const currentUserId = getAuthenticatedUserIdOrNull();
    if (!currentUserId) {
      setErrorMessage('Please sign in again to add items.');
      return;
    }

    const trimmedName = menuItemName.trim();
    if (!trimmedName) {
      setErrorMessage('Item name is required.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const createdItem = await createCollectionRecord<MenuItemRecord>('menu_items', {
        restaurant: restaurantId,
        name: trimmedName,
        createdBy: currentUserId,
        visibility,
        isFromOCR: false,
      });

      queryClient.setQueryData<MenuItemRecord[]>(
        ['feature', 'menuItems', restaurantId],
        (currentItems) => {
          const nextItems = currentItems ?? [];
          if (nextItems.some((item) => item.id === createdItem.id)) {
            return nextItems;
          }

          return [createdItem, ...nextItems];
        },
      );
      await queryClient.invalidateQueries({
        queryKey: ['feature', 'menuItems', restaurantId],
      });

      navigation.navigate('CreateVisit', {
        preselectedRestaurantId: restaurantId,
        preselectedRestaurantName: restaurantName,
        preselectedMenuItemId: createdItem.id,
        preselectedMenuItemName: createdItem.name,
        returnToStep: 1,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add menu item.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FeatureFormScreenScaffold
      keyboardAware
      onBackPress={() => {
        navigation.goBack();
      }}
      primaryAction={{
        label: 'Add Item',
        disabled: !menuItemName.trim() || isSubmitting || !isOnline,
        loading: isSubmitting,
        onPress: () => {
          void handleAddMenuItem();
        },
      }}
      secondaryAction={{
        label: 'Cancel',
        onPress: () => {
          navigation.goBack();
        },
      }}
      title="Add Menu Item"
      subtitle={`Add an item for ${restaurantName}.`}
    >
      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Could not add menu item" />

        {!isOnline ? (
          <Card tone="muted">
            <Text tone="warning">You are offline. Connect to add a new menu item.</Text>
          </Card>
        ) : null}

        <Card style={styles.formCard}>
          <Input
            autoCapitalize="words"
            label="Item Name"
            onChangeText={setMenuItemName}
            placeholder="Menu item name"
            value={menuItemName}
          />

          <View style={styles.visibilitySection}>
            <Text variant="label">Visibility</Text>
            <VisibilityOptionSelector
              onChange={setVisibility}
              value={visibility}
            />
          </View>
        </Card>
      </View>
    </FeatureFormScreenScaffold>
  );
}
