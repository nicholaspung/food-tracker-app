import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { View } from 'react-native';

import {
  FeatureFormScreenScaffold,
  PageErrorToast,
  VisibilityOptionSelector,
  type VisibilityOptionValue,
} from '../components/shared';
import { useMenuItemCatalogWrites } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Card, Input, Text } from '../ui';

type CreateVisitEditMenuItemScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'CreateVisitEditMenuItem'
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

function normalizeMenuItemVisibility(value?: string): VisibilityOptionValue {
  if (value === 'private') {
    return value;
  }

  return 'friends';
}

export function CreateVisitEditMenuItemScreen({
  navigation,
  route,
}: CreateVisitEditMenuItemScreenProps) {
  const styles = useStyles();
  const menuItemCatalogWrites = useMenuItemCatalogWrites();
  const { isOnline } = useConnectivity();

  const {
    menuItemId,
    restaurantId,
    initialName,
    initialVisibility,
  } = route.params;

  const [menuItemName, setMenuItemName] = useState(initialName);
  const [visibility, setVisibility] = useState<VisibilityOptionValue>(
    normalizeMenuItemVisibility(initialVisibility),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSaveMenuItem = async () => {
    if (!isOnline) {
      trackObservabilityEvent('CREATE_VISIT_EDIT_MENU_ITEM_SUBMIT_VALIDATION_FAILED', {
        source: 'CreateVisitEditMenuItemScreen',
        reason: 'offline',
      });
      setErrorMessage('Editing menu items requires internet connection.');
      return;
    }

    const trimmedName = menuItemName.trim();
    if (!trimmedName) {
      trackObservabilityEvent('CREATE_VISIT_EDIT_MENU_ITEM_SUBMIT_VALIDATION_FAILED', {
        source: 'CreateVisitEditMenuItemScreen',
        reason: 'missing_name',
        visibility,
      });
      setErrorMessage('Menu item name is required.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('CREATE_VISIT_EDIT_MENU_ITEM_SUBMIT_STARTED', {
      source: 'CreateVisitEditMenuItemScreen',
      visibility,
      isOnline,
    });
    setIsSubmitting(true);

    try {
      await menuItemCatalogWrites.updateMenuItem({
        menuItemId,
        restaurantId,
        name: trimmedName,
        visibility,
      });

      trackObservabilityEvent('CREATE_VISIT_EDIT_MENU_ITEM_SUBMIT_SUCCEEDED', {
        source: 'CreateVisitEditMenuItemScreen',
        visibility,
      });
      navigation.goBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update menu item.';
      setErrorMessage(message);
      trackObservabilityEvent('CREATE_VISIT_EDIT_MENU_ITEM_SUBMIT_FAILED', {
        source: 'CreateVisitEditMenuItemScreen',
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
        label: 'Save',
        disabled: !menuItemName.trim() || isSubmitting || !isOnline,
        loading: isSubmitting,
        onPress: () => {
          void handleSaveMenuItem();
        },
      }}
      secondaryAction={{
        label: 'Cancel',
        onPress: () => {
          navigation.goBack();
        },
      }}
      title="Edit Menu Item"
    >
      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Could not update menu item" />

        {!isOnline ? (
          <Card tone="muted">
            <Text tone="warning">You are offline. Connect to edit this menu item.</Text>
          </Card>
        ) : null}

        <Card style={styles.formCard}>
          <Text tone="secondary">Update the item name and visibility for this restaurant.</Text>

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
                trackObservabilityEvent('CREATE_VISIT_EDIT_MENU_ITEM_VISIBILITY_CHANGED', {
                  source: 'CreateVisitEditMenuItemScreen',
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
