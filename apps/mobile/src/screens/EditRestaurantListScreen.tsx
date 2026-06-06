import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import {
  EmptyState,
  ErrorState,
  FeatureFormScreenScaffold,
  PageErrorToast,
  RestaurantListEditorFormFields,
  Skeleton,
} from '../components/shared';
import {
  getRestaurantListById,
  restaurantListQueryKeys,
  type RestaurantListRecord,
} from '../features';
import { useRestaurantListWrites } from '../features/store/useRestaurantListWrites';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';

type EditRestaurantListScreenProps = NativeStackScreenProps<RootStackParamList, 'EditRestaurantList'>;
type ListVisibility = RestaurantListRecord['visibility'];

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
}));

export function EditRestaurantListScreen({ navigation, route }: EditRestaurantListScreenProps) {
  const { listId } = route.params;
  const styles = useStyles();
  const listWrites = useRestaurantListWrites();
  const { isOnline } = useConnectivity();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ListVisibility>('private');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: restaurantListQueryKeys.list(listId),
    queryFn: ({ signal }) => getRestaurantListById(listId, { signal }),
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

  const canSubmit = useMemo(() => name.trim().length > 0 && !isSubmitting, [isSubmitting, name]);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('ListDetail', { listId });
  };

  const handleSaveList = async () => {
    if (listQuery.data?.isDefault) {
      setErrorMessage('The Want to Try list cannot be edited.');
      return;
    }

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

      const updateResult = await listWrites.updateRestaurantList({
        currentList: listQuery.data,
        listId,
        updates: listUpdateInput,
      });

      if (updateResult.status === 'queued') {
        trackObservabilityEvent('EDIT_RESTAURANT_LIST_SUBMIT_SUCCEEDED', {
          source: 'EditRestaurantListScreen',
          listId,
          queued: true,
          visibility,
        });
        handleBack();
        return;
      }

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

  if (listQuery.data.isDefault) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={handleBack}
        primaryAction={{
          label: 'Save List',
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: 'Back to List',
          onPress: handleBack,
        }}
        subtitle="The Want to Try list is autogenerated for bookmarked items and can only be added to."
        title="Edit List"
      >
        <EmptyState
          actionLabel="Back to List"
          onAction={handleBack}
          title="This list can't be edited"
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

        <RestaurantListEditorFormFields
          description={description}
          descriptionTestID="edit-list-description-input"
          name={name}
          namePlaceholder="List name"
          nameTestID="edit-list-name-input"
          onDescriptionChange={setDescription}
          onNameChange={setName}
          onVisibilityChange={(nextVisibility) => {
            trackObservabilityEvent('EDIT_RESTAURANT_LIST_VISIBILITY_CHANGED', {
              source: 'EditRestaurantListScreen',
              listId,
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
