import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, Skeleton } from '../components/shared';
import {
  createRestaurantList,
  deleteRestaurantList,
  listRestaurantLists,
  updateRestaurantList,
} from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Button, Card, Input, ListItem, Screen, Text } from '../ui';

type ListsScreenProps = NativeStackScreenProps<RootStackParamList, 'Lists'>;

export function ListsScreen({ navigation }: ListsScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();

  const listsQuery = useQuery({
    queryKey: ['feature', 'restaurantLists'],
    queryFn: listRestaurantLists,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const styles = StyleSheet.create({
    container: {
      gap: theme.spacing.md,
    },
    row: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    rowAction: {
      flex: 1,
    },
  });

  const submitLabel = useMemo(() => (editingListId ? 'Save List' : 'Create List'), [editingListId]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setEditingListId(null);
  };

  const saveList = async () => {
    if (!name.trim()) {
      setErrorMessage('List name is required.');
      return;
    }

    setErrorMessage(null);

    try {
      if (editingListId) {
        await queueWrite('list.update');
        await updateRestaurantList(editingListId, {
          name,
          description,
        });
      } else {
        await queueWrite('list.create');
        await createRestaurantList({
          name,
          description,
        });
      }

      resetForm();
      await queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save list.';
      setErrorMessage(message);
    }
  };

  const startEdit = (listId: string, listName: string, listDescription?: string) => {
    setEditingListId(listId);
    setName(listName);
    setDescription(listDescription ?? '');
  };

  const removeList = async (listId: string) => {
    setErrorMessage(null);

    try {
      await queueWrite('list.delete');
      await deleteRestaurantList(listId);
      await queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] });
      if (editingListId === listId) {
        resetForm();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete list.';
      setErrorMessage(message);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.container}>
        <Text variant="titleMd">Lists</Text>

        <Card>
          <Text variant="label">List CRUD</Text>
          <Input label="List name" onChangeText={setName} placeholder="Favorites" value={name} />
          <Input
            label="Description"
            onChangeText={setDescription}
            placeholder="Optional description"
            value={description}
          />

          {errorMessage ? <ErrorState description={errorMessage} title="List operation failed" /> : null}

          <View style={styles.row}>
            <Button
              disabled={!name.trim()}
              label={submitLabel}
              onPress={() => {
                void saveList();
              }}
              style={styles.rowAction}
            />
            {editingListId ? (
              <Button
                label="Cancel"
                onPress={resetForm}
                style={styles.rowAction}
                variant="secondary"
              />
            ) : null}
          </View>
        </Card>

        {listsQuery.isLoading ? (
          <View>
            <Skeleton height={20} />
            <Skeleton height={20} />
          </View>
        ) : null}

        {listsQuery.isError ? (
          <ErrorState
            description="Could not load lists."
            onRetry={() => {
              void listsQuery.refetch();
            }}
            title="Lists unavailable"
          />
        ) : null}

        {!listsQuery.isLoading && !listsQuery.isError && (listsQuery.data?.length ?? 0) === 0 ? (
          <EmptyState description="Create a list to organize restaurants." title="No lists yet" />
        ) : null}

        {!listsQuery.isLoading && !listsQuery.isError
          ? (listsQuery.data ?? []).map((list) => (
              <Card key={list.id} tone="muted">
                <ListItem
                  description={`${list.restaurantIds.length} saved restaurant${list.restaurantIds.length === 1 ? '' : 's'}`}
                  title={list.name}
                  trailing={<Text tone="muted">Updated {new Date(list.updatedAt).toLocaleDateString()}</Text>}
                />
                <View style={styles.row}>
                  <Button
                    label="Open"
                    onPress={() => {
                      navigation.navigate('ListDetail', { listId: list.id });
                    }}
                    style={styles.rowAction}
                    variant="secondary"
                  />
                  <Button
                    label="Edit"
                    onPress={() => {
                      startEdit(list.id, list.name, list.description);
                    }}
                    style={styles.rowAction}
                    variant="secondary"
                  />
                  <Button
                    label="Delete"
                    onPress={() => {
                      void removeList(list.id);
                    }}
                    style={styles.rowAction}
                    variant="secondary"
                  />
                </View>
              </Card>
            ))
          : null}
      </View>
    </Screen>
  );
}
