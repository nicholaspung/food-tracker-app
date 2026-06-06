import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  FeatureFormScreenScaffold,
  PageErrorToast,
  RestaurantListEditorFormFields,
} from '../components/shared';
import {
  resolveDefaultListVisibilityFromAuth,
  type RestaurantListRecord,
} from '../features';
import { useRestaurantListWrites } from '../features/store/useRestaurantListWrites';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';

type CreateRestaurantListScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateRestaurantList'>;
type ListVisibility = RestaurantListRecord['visibility'];

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
}));

function resolveDefaultListVisibility(): ListVisibility {
  return resolveDefaultListVisibilityFromAuth();
}

function buildOptimisticRestaurantList(
  user: { id?: string; name?: string } | null,
  input: {
    name: string;
    description: string;
    visibility: ListVisibility;
  },
): RestaurantListRecord {
  const timestamp = new Date().toISOString();
  const trimmedDescription = input.description.trim();

  return {
    id: `offline-list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name,
    description: trimmedDescription || undefined,
    visibility: input.visibility,
    userId: user?.id ?? 'local-user',
    ownerName: user?.name?.trim() || undefined,
    isDefault: false,
    restaurantCount: 0,
    menuItemCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function CreateRestaurantListScreen({ navigation }: CreateRestaurantListScreenProps) {
  const styles = useStyles();
  const listWrites = useRestaurantListWrites();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ListVisibility>(resolveDefaultListVisibility());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

      const createResult = await listWrites.createRestaurantList({
        input: listInput,
        optimisticQueuedList: buildOptimisticRestaurantList(user, {
          name: trimmedName,
          description,
          visibility,
        }),
      });

      if (createResult.status === 'queued') {
        trackObservabilityEvent('CREATE_RESTAURANT_LIST_SUBMIT_SUCCEEDED', {
          source: 'CreateRestaurantListScreen',
          queued: true,
          visibility,
        });
        navigation.navigate('Lists');
        return;
      }

      const createdList = createResult.result;

      trackObservabilityEvent('CREATE_RESTAURANT_LIST_SUBMIT_SUCCEEDED', {
        source: 'CreateRestaurantListScreen',
        hasCreatedList: createdList.id.trim().length > 0,
        queued: false,
        visibility,
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

        <RestaurantListEditorFormFields
          description={description}
          descriptionTestID="create-list-description-input"
          name={name}
          namePlaceholder="Best pizza spots"
          nameTestID="create-list-name-input"
          onDescriptionChange={setDescription}
          onNameChange={setName}
          onVisibilityChange={(nextVisibility) => {
            trackObservabilityEvent('CREATE_RESTAURANT_LIST_VISIBILITY_CHANGED', {
              source: 'CreateRestaurantListScreen',
              previousVisibility: visibility,
              nextVisibility,
            });
            setVisibility(nextVisibility);
          }}
          visibility={visibility}
        />
      </View>
    </FeatureFormScreenScaffold>
  );
}
