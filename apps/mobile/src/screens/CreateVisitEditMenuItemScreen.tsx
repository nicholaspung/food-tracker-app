import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import {
  FeatureFormScreenScaffold,
  type VisibilityOptionValue,
} from '../components/shared';
import { useMenuItemCatalogWrites } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { CreateVisitMenuItemEditorForm } from './createVisit/CreateVisitMenuItemEditorForm';

type CreateVisitEditMenuItemScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'CreateVisitEditMenuItem'
>;

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
      const updateResult = await menuItemCatalogWrites.updateMenuItem({
        menuItemId,
        restaurantId,
        name: trimmedName,
        visibility,
      });

      if (updateResult.status === 'blocked') {
        setErrorMessage('Editing menu items requires internet connection.');
        trackObservabilityEvent('CREATE_VISIT_EDIT_MENU_ITEM_SUBMIT_VALIDATION_FAILED', {
          source: 'CreateVisitEditMenuItemScreen',
          reason: 'offline',
        });
        return;
      }

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
      <CreateVisitMenuItemEditorForm
        description="Update the item name and visibility for this restaurant."
        errorMessage={errorMessage}
        errorTitle="Could not update menu item"
        isOnline={isOnline}
        menuItemName={menuItemName}
        offlineMessage="You are offline. Connect to edit this menu item."
        onMenuItemNameChange={setMenuItemName}
        onVisibilityChange={(nextVisibility) => {
          trackObservabilityEvent('CREATE_VISIT_EDIT_MENU_ITEM_VISIBILITY_CHANGED', {
            source: 'CreateVisitEditMenuItemScreen',
            previousVisibility: visibility,
            nextVisibility,
          });
          setVisibility(nextVisibility);
        }}
        visibility={visibility}
      />
    </FeatureFormScreenScaffold>
  );
}
