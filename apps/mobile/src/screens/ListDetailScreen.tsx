import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  EmptyState,
  ErrorState,
  FeatureDetailScreenScaffold,
  SegmentedControl,
  Skeleton,
  type SegmentedControlOption,
} from '../components/shared';
import {
  deleteRestaurantList,
  getRestaurantListById,
  listRestaurantListItems,
  removeRestaurantFromList,
  updateRestaurantList,
} from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, ListItem, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type ListDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'ListDetail'>;
type ListVisibility = 'private' | 'friends' | 'public';

const VISIBILITY_OPTIONS: readonly SegmentedControlOption<ListVisibility>[] = [
  { label: 'Private', value: 'private' },
  { label: 'Friends', value: 'friends' },
  { label: 'Public', value: 'public' },
];

export function ListDetailScreen({ navigation, route }: ListDetailScreenProps) {
  const { listId } = route.params;
  const theme = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEditingList, setIsEditingList] = useState(false);
  const [isSavingList, setIsSavingList] = useState(false);
  const [isDeletingList, setIsDeletingList] = useState(false);
  const [listNameDraft, setListNameDraft] = useState('');
  const [listDescriptionDraft, setListDescriptionDraft] = useState('');
  const [listVisibilityDraft, setListVisibilityDraft] = useState<ListVisibility>('private');

  const listQuery = useQuery({
    queryKey: ['feature', 'restaurantList', listId],
    queryFn: () => getRestaurantListById(listId),
  });

  const listItemsQuery = useQuery({
    queryKey: ['feature', 'restaurantListItems', listId],
    queryFn: () => listRestaurantListItems(listId),
    enabled: !!listQuery.data,
  });

  const list = listQuery.data;
  const isOwner = Boolean(list && user?.id && list.userId === user.id);
  const listItems = listItemsQuery.data ?? [];

  const styles = StyleSheet.create({
    container: {
      gap: theme.spacing.md,
    },
    subtitleText: {
      color: theme.colors.text.secondary,
      fontSize: 14,
      lineHeight: 20,
    },
    headerRightRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    headerActionButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: 'row',
      gap: theme.spacing.xxs,
      justifyContent: 'center',
      minHeight: 32,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 4,
    },
    headerActionLabel: {
      fontSize: 12,
      lineHeight: 16,
    },
    headerIconButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    editCard: {
      borderColor: theme.colors.border.info,
    },
    editActions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.xs,
    },
    editAction: {
      flex: 1,
    },
  });

  const subtitle = useMemo(() => {
    const itemCount = listItems.length;
    const itemLabel = `${itemCount} ${itemCount === 1 ? 'restaurant' : 'restaurants'}`;
    if (!list) {
      return itemLabel;
    }

    if (isOwner) {
      return itemLabel;
    }

    const ownerName = list.ownerName ?? 'Unknown user';
    return `${ownerName}'s list · ${itemLabel}`;
  }, [isOwner, list, listItems.length]);

  const handleBack = () => {
    navigation.navigate('Lists');
  };

  const startEditList = () => {
    if (!list || !isOwner) {
      return;
    }

    setErrorMessage(null);
    setListNameDraft(list.name);
    setListDescriptionDraft(list.description ?? '');
    setListVisibilityDraft(list.visibility);
    setIsEditingList(true);
  };

  const cancelEditList = () => {
    setIsEditingList(false);
    setListNameDraft('');
    setListDescriptionDraft('');
    setListVisibilityDraft('private');
  };

  const saveListEdits = async () => {
    if (!list || !isOwner) {
      return;
    }

    const trimmedName = listNameDraft.trim();
    if (!trimmedName) {
      setErrorMessage('List name is required.');
      return;
    }

    setErrorMessage(null);
    setIsSavingList(true);

    try {
      await queueWrite('list.update');
      await updateRestaurantList(list.id, {
        name: trimmedName,
        description: listDescriptionDraft,
        visibility: listVisibilityDraft,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantList', listId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] }),
      ]);
      setIsEditingList(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update list.';
      setErrorMessage(message);
    } finally {
      setIsSavingList(false);
    }
  };

  const deleteList = async () => {
    if (!list || !isOwner || list.isDefault) {
      return;
    }

    setErrorMessage(null);
    setIsDeletingList(true);

    try {
      await queueWrite('list.delete');
      await deleteRestaurantList(list.id);
      await queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] });
      queryClient.removeQueries({ queryKey: ['feature', 'restaurantList', list.id] });
      queryClient.removeQueries({ queryKey: ['feature', 'restaurantListItems', list.id] });
      navigation.navigate('Lists');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete list.';
      setErrorMessage(message);
    } finally {
      setIsDeletingList(false);
    }
  };

  const confirmDeleteList = () => {
    if (!list || !isOwner) {
      return;
    }

    if (list.isDefault) {
      setErrorMessage('The Saved list cannot be deleted.');
      return;
    }

    Alert.alert(
      'Delete list?',
      `Delete "${list.name}" and all of its saved restaurants?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteList();
          },
        },
      ],
    );
  };

  const handleRemove = async (listItemId: string) => {
    if (!isOwner) {
      return;
    }

    setErrorMessage(null);

    try {
      await queueWrite('list.restaurant.remove');
      await removeRestaurantFromList(listId, listItemId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantList', listId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantListItems', listId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not remove restaurant.';
      setErrorMessage(message);
    }
  };

  if (listQuery.isLoading || listItemsQuery.isLoading) {
    return (
      <FeatureDetailScreenScaffold onBackPress={handleBack} title="List">
        <Skeleton height={20} />
        <Skeleton height={20} />
      </FeatureDetailScreenScaffold>
    );
  }

  if (listQuery.isError || listItemsQuery.isError) {
    return (
      <FeatureDetailScreenScaffold onBackPress={handleBack} title="List">
        <ErrorState
          description="Could not load list detail."
          onRetry={() => {
            void listQuery.refetch();
            void listItemsQuery.refetch();
          }}
          title="List detail unavailable"
        />
      </FeatureDetailScreenScaffold>
    );
  }

  if (!list) {
    return (
      <FeatureDetailScreenScaffold onBackPress={handleBack} title="List">
        <EmptyState
          actionLabel="Back to Lists"
          onAction={handleBack}
          title="List not found"
        />
      </FeatureDetailScreenScaffold>
    );
  }

  return (
    <FeatureDetailScreenScaffold
      onBackPress={handleBack}
      rightAccessory={
        isOwner ? (
          <View style={styles.headerRightRow}>
            <Pressable
              accessibilityLabel="Add restaurant"
              accessibilityRole="button"
              onPress={() => {
                navigation.navigate('AddRestaurantToList', { listId });
              }}
              style={styles.headerActionButton}
            >
              <Ionicons color={theme.colors.text.primary} name="add-outline" size={14} />
              <Text style={styles.headerActionLabel} variant="label">
                Add Restaurant
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Edit list"
              accessibilityRole="button"
              onPress={startEditList}
              style={styles.headerIconButton}
            >
              <Ionicons color={theme.colors.text.primary} name="create-outline" size={16} />
            </Pressable>
            {!list.isDefault ? (
              <Pressable
                accessibilityLabel="Delete list"
                accessibilityRole="button"
                disabled={isDeletingList}
                onPress={confirmDeleteList}
                style={styles.headerIconButton}
              >
                <Ionicons color={theme.colors.text.danger} name="trash-outline" size={16} />
              </Pressable>
            ) : null}
          </View>
        ) : undefined
      }
      subtitle={subtitle}
      title={list.name}
    >
      <View style={styles.container}>
        <PageErrorToast errorMessage={errorMessage} title="List update failed" />

        {list.description ? <Text style={styles.subtitleText}>{list.description}</Text> : null}

        {isOwner && isEditingList ? (
          <Card style={styles.editCard} tone="muted">
            <Text variant="label">Edit List</Text>
            <Input
              autoCapitalize="words"
              label="List name"
              onChangeText={setListNameDraft}
              placeholder="List name"
              value={listNameDraft}
            />
            <Input
              label="Description"
              multiline
              onChangeText={setListDescriptionDraft}
              placeholder="Optional description"
              value={listDescriptionDraft}
            />
            <Text variant="label">Visibility</Text>
            <SegmentedControl
              fill
              onChange={setListVisibilityDraft}
              options={VISIBILITY_OPTIONS}
              value={listVisibilityDraft}
            />
            <View style={styles.editActions}>
              <Button
                label="Cancel"
                onPress={cancelEditList}
                style={styles.editAction}
                variant="secondary"
              />
              <Button
                disabled={!listNameDraft.trim() || isSavingList}
                label={isSavingList ? 'Saving...' : 'Save List'}
                onPress={() => {
                  void saveListEdits();
                }}
                style={styles.editAction}
              />
            </View>
          </Card>
        ) : null}

        {listItems.length === 0 ? (
          <EmptyState
            description={
              isOwner
                ? 'Use Add in the header to save your first restaurant.'
                : 'No restaurants have been added to this list yet.'
            }
            title="No restaurants yet"
          />
        ) : (
          listItems.map((listItem) => (
            <Card key={listItem.id} tone="muted">
              <ListItem
                description={listItem.restaurantCity ?? 'City not set'}
                title={listItem.restaurantName}
                trailing={
                  isOwner ? (
                    <Button
                      label="Remove"
                      onPress={() => {
                        void handleRemove(listItem.id);
                      }}
                      variant="secondary"
                    />
                  ) : undefined
                }
              />
            </Card>
          ))
        )}
      </View>
    </FeatureDetailScreenScaffold>
  );
}
