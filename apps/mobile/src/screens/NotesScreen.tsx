import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, Skeleton } from '../components/shared';
import { deleteNote, listNotes } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Button, Card, ListItem, Screen, Text } from '../ui';

type NotesScreenProps = NativeStackScreenProps<RootStackParamList, 'Notes'>;

export function NotesScreen({ navigation }: NotesScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const notesQuery = useQuery({
    queryKey: ['feature', 'notes'],
    queryFn: listNotes,
  });

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

  const handleDelete = async (noteId: string) => {
    setErrorMessage(null);

    try {
      await queueWrite('note.delete');
      await deleteNote(noteId);
      await queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete note.';
      setErrorMessage(message);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.container}>
        <Text variant="titleMd">Notes</Text>
        <Button
          label="Create Note"
          onPress={() => {
            navigation.navigate('NoteEditor');
          }}
        />

        {errorMessage ? <ErrorState description={errorMessage} title="Notes update failed" /> : null}

        {notesQuery.isLoading ? (
          <View>
            <Skeleton height={20} />
            <Skeleton height={20} />
          </View>
        ) : null}

        {notesQuery.isError ? (
          <ErrorState
            description="Could not load notes."
            onRetry={() => {
              void notesQuery.refetch();
            }}
            title="Notes unavailable"
          />
        ) : null}

        {!notesQuery.isLoading && !notesQuery.isError && (notesQuery.data?.length ?? 0) === 0 ? (
          <EmptyState description="Capture dish notes and then quick-track from them." title="No notes yet" />
        ) : null}

        {!notesQuery.isLoading && !notesQuery.isError
          ? (notesQuery.data ?? []).map((note) => (
              <Card key={note.id} tone="muted">
                <ListItem
                  description={note.content}
                  title={note.title}
                  trailing={<Text tone="muted">{note.rating ? `${note.rating}/5` : 'No rating'}</Text>}
                />
                <View style={styles.row}>
                  <Button
                    label="Edit"
                    onPress={() => {
                      navigation.navigate('NoteEditor', { noteId: note.id });
                    }}
                    style={styles.rowAction}
                    variant="secondary"
                  />
                  <Button
                    label="Quick Track"
                    onPress={() => {
                      navigation.navigate('QuickTrack', { sourceNoteId: note.id });
                    }}
                    style={styles.rowAction}
                    variant="secondary"
                  />
                  <Button
                    label="Delete"
                    onPress={() => {
                      void handleDelete(note.id);
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
