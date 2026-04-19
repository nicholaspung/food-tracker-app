import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import {
  FeatureFormScreenScaffold,
  PageErrorToast,
  VisibilityOptionSelector,
  type VisibilityOptionValue,
} from '../components/shared';
import { createCollectionRecord, getAuthenticatedUserIdOrNull } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Card, Input, Text } from '../ui';

type CreateVisitAddMenuItemScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'CreateVisitAddMenuItem'
>;
const MENU_ITEM_VISIBILITY_OPTIONS: readonly VisibilityOptionValue[] = ['friends', 'private'];

interface MenuItemRecord {
  id: string;
  name: string;
}

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  formCard: {
    gap: theme.spacing.sm,
  },
  visibilitySection: {
    gap: theme.spacing.xs,
  },
}));

export function CreateVisitAddMenuItemScreen({
  navigation,
  route,
}: CreateVisitAddMenuItemScreenProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { isOnline } = useConnectivity();

  const { editVisitId, restaurantId, restaurantName } = route.params;

  const [menuItemName, setMenuItemName] = useState('');
  const [visibility, setVisibility] = useState<VisibilityOptionValue>('friends');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddMenuItem = async () => {
    if (!isOnline) {
      trackObservabilityEvent('CREATE_VISIT_ADD_MENU_ITEM_SUBMIT_VALIDATION_FAILED', {
        source: 'CreateVisitAddMenuItemScreen',
        reason: 'offline',
        restaurantId,
      });
      setErrorMessage('Adding menu items requires internet connection.');
      return;
    }

    const currentUserId = getAuthenticatedUserIdOrNull();
    if (!currentUserId) {
      trackObservabilityEvent('CREATE_VISIT_ADD_MENU_ITEM_SUBMIT_VALIDATION_FAILED', {
        source: 'CreateVisitAddMenuItemScreen',
        reason: 'missing_user',
        restaurantId,
      });
      setErrorMessage('Please sign in again to add items.');
      return;
    }

    const trimmedName = menuItemName.trim();
    if (!trimmedName) {
      trackObservabilityEvent('CREATE_VISIT_ADD_MENU_ITEM_SUBMIT_VALIDATION_FAILED', {
        source: 'CreateVisitAddMenuItemScreen',
        reason: 'missing_name',
        restaurantId,
        visibility,
      });
      setErrorMessage('Item name is required.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('CREATE_VISIT_ADD_MENU_ITEM_SUBMIT_STARTED', {
      source: 'CreateVisitAddMenuItemScreen',
      restaurantId,
      visibility,
      isOnline,
    });
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
      trackObservabilityEvent('CREATE_VISIT_ADD_MENU_ITEM_SUBMIT_SUCCEEDED', {
        source: 'CreateVisitAddMenuItemScreen',
        restaurantId,
        menuItemId: createdItem.id,
        visibility,
      });

      navigation.popTo('CreateVisit', {
        editVisitId,
        preselectedRestaurantId: restaurantId,
        preselectedRestaurantName: restaurantName,
        preselectedMenuItemId: createdItem.id,
        preselectedMenuItemName: createdItem.name,
        returnToStep: 1,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add menu item.';
      setErrorMessage(message);
      trackObservabilityEvent('CREATE_VISIT_ADD_MENU_ITEM_SUBMIT_FAILED', {
        source: 'CreateVisitAddMenuItemScreen',
        restaurantId,
        visibility,
        error: message,
      });
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
              onChange={(nextVisibility) => {
                const resolvedVisibility: VisibilityOptionValue =
                  nextVisibility === 'private' ? 'private' : 'friends';
                trackObservabilityEvent('CREATE_VISIT_ADD_MENU_ITEM_VISIBILITY_CHANGED', {
                  source: 'CreateVisitAddMenuItemScreen',
                  restaurantId,
                  previousVisibility: visibility,
                  nextVisibility: resolvedVisibility,
                });
                setVisibility(resolvedVisibility);
              }}
              options={MENU_ITEM_VISIBILITY_OPTIONS}
              value={visibility}
            />
          </View>
        </Card>
      </View>
    </FeatureFormScreenScaffold>
  );
}
