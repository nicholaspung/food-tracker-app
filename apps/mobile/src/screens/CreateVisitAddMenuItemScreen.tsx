import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { View } from 'react-native';

import {
  FeatureFormScreenScaffold,
  PageErrorToast,
  VisibilityOptionSelector,
  type VisibilityOptionValue,
} from '../components/shared';
import {
  getAuthenticatedUserIdOrNull,
  useMenuItemCatalogWrites,
} from '../features';
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
  const menuItemCatalogWrites = useMenuItemCatalogWrites();
  const { isOnline } = useConnectivity();

  const {
    editVisitId,
    restaurantId,
    restaurantName,
    returnTo,
    sourceNoteId,
    tastingRestaurantSuggestionId,
    tastingSessionId,
  } = route.params;

  const [menuItemName, setMenuItemName] = useState('');
  const [visibility, setVisibility] = useState<VisibilityOptionValue>('friends');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddMenuItem = async () => {
    if (!isOnline) {
      trackObservabilityEvent('CREATE_VISIT_ADD_MENU_ITEM_SUBMIT_VALIDATION_FAILED', {
        source: 'CreateVisitAddMenuItemScreen',
        reason: 'offline',
      });
      setErrorMessage('Adding menu items requires internet connection.');
      return;
    }

    const currentUserId = getAuthenticatedUserIdOrNull();
    if (!currentUserId) {
      trackObservabilityEvent('CREATE_VISIT_ADD_MENU_ITEM_SUBMIT_VALIDATION_FAILED', {
        source: 'CreateVisitAddMenuItemScreen',
        reason: 'missing_user',
      });
      setErrorMessage('Please sign in again to add items.');
      return;
    }

    const trimmedName = menuItemName.trim();
    if (!trimmedName) {
      trackObservabilityEvent('CREATE_VISIT_ADD_MENU_ITEM_SUBMIT_VALIDATION_FAILED', {
        source: 'CreateVisitAddMenuItemScreen',
        reason: 'missing_name',
        visibility,
      });
      setErrorMessage('Item name is required.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('CREATE_VISIT_ADD_MENU_ITEM_SUBMIT_STARTED', {
      source: 'CreateVisitAddMenuItemScreen',
      visibility,
      isOnline,
    });
    setIsSubmitting(true);

    try {
      const baseCreateInput = {
        restaurantId,
        name: trimmedName,
        createdBy: currentUserId,
        visibility,
        isFromOCR: false,
      };
      const shouldAddToTastingPlan =
        returnTo === 'TastingSessionPlanning' &&
        Boolean(tastingSessionId) &&
        Boolean(tastingRestaurantSuggestionId);
      const createResult = shouldAddToTastingPlan
        ? await menuItemCatalogWrites.createMenuItemAndAddToTastingPlan({
            ...baseCreateInput,
            tastingRestaurantSuggestionId: tastingRestaurantSuggestionId!,
            tastingSessionId: tastingSessionId!,
          })
        : await menuItemCatalogWrites.createMenuItem(baseCreateInput);

      if (createResult.status === 'blocked') {
        setErrorMessage('Adding menu items requires internet connection.');
        trackObservabilityEvent('CREATE_VISIT_ADD_MENU_ITEM_SUBMIT_VALIDATION_FAILED', {
          source: 'CreateVisitAddMenuItemScreen',
          reason: 'offline',
        });
        return;
      }

      const createdItem = createResult.result;
      trackObservabilityEvent('CREATE_VISIT_ADD_MENU_ITEM_SUBMIT_SUCCEEDED', {
        source: 'CreateVisitAddMenuItemScreen',
        visibility,
      });

      if (shouldAddToTastingPlan && tastingSessionId) {
        navigation.popTo('TastingSessionPlanning', { sessionId: tastingSessionId });
        return;
      }

      navigation.popTo('CreateVisit', {
        editVisitId,
        preselectedRestaurantId: restaurantId,
        preselectedRestaurantName: restaurantName,
        preselectedMenuItemId: createdItem.id,
        preselectedMenuItemName: createdItem.name,
        returnToStep: 1,
        sourceNoteId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add menu item.';
      setErrorMessage(message);
      trackObservabilityEvent('CREATE_VISIT_ADD_MENU_ITEM_SUBMIT_FAILED', {
        source: 'CreateVisitAddMenuItemScreen',
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
