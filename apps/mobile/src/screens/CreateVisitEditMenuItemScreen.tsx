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
import { pb } from '../lib/pocketbase';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Card, Input, Text } from '../ui';

type CreateVisitEditMenuItemScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'CreateVisitEditMenuItem'
>;

interface MenuItemRecord {
  id: string;
  name: string;
  visibility?: VisibilityOptionValue;
}

function normalizeMenuItemVisibility(value?: string): VisibilityOptionValue {
  if (value === 'private' || value === 'public') {
    return value;
  }

  return 'friends';
}

export function CreateVisitEditMenuItemScreen({
  navigation,
  route,
}: CreateVisitEditMenuItemScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();

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

  const handleSaveMenuItem = async () => {
    const trimmedName = menuItemName.trim();
    if (!trimmedName) {
      setErrorMessage('Menu item name is required.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await pb.collection('menu_items').update(menuItemId, {
        name: trimmedName,
        visibility,
      });

      queryClient.setQueryData<MenuItemRecord[]>(
        ['feature', 'menuItems', restaurantId],
        (currentItems) =>
          currentItems?.map((item) =>
            item.id === menuItemId ? { ...item, name: trimmedName, visibility } : item,
          ) ?? currentItems,
      );
      await queryClient.invalidateQueries({
        queryKey: ['feature', 'menuItems', restaurantId],
      });

      navigation.goBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update menu item.';
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
        label: 'Save',
        disabled: !menuItemName.trim() || isSubmitting,
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

        <Card style={styles.formCard}>
          <Text tone="secondary">Update item details and visibility for this restaurant.</Text>

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
