import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, Skeleton } from '../components/shared';
import { createNote, getNoteById, updateNote } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Button, Input, Screen, Text } from '../ui';

type NoteEditorScreenProps = NativeStackScreenProps<RootStackParamList, 'NoteEditor'>;

export function NoteEditorScreen({ navigation, route }: NoteEditorScreenProps) {
  const noteId = route.params?.noteId;
  const queueWrite = useQueuedWrite();
  const queryClient = useQueryClient();

  const noteQuery = useQuery({
    queryKey: ['feature', 'note', noteId],
    queryFn: () => (noteId ? getNoteById(noteId) : Promise.resolve(null)),
    enabled: Boolean(noteId),
  });

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [rating, setRating] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!noteQuery.data) {
      return;
    }

    setTitle(noteQuery.data.title);
    setContent(noteQuery.data.content);
    setRating(noteQuery.data.rating ? noteQuery.data.rating.toString() : '');
  }, [noteQuery.data]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      setErrorMessage('Title and content are required.');
      return;
    }

    const parsedRating = rating.trim() ? Number(rating) : undefined;
    if (parsedRating !== undefined && (Number.isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5)) {
      setErrorMessage('Rating must be empty or between 1 and 5.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (noteId) {
        await queueWrite('note.update');
        await updateNote(noteId, {
          title,
          content,
          rating: parsedRating,
        });
      } else {
        await queueWrite('note.create');
        await createNote({
          title,
          content,
          rating: parsedRating,
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'note', noteId] }),
      ]);
      navigation.navigate('Notes');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save note.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (noteId && noteQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={20} />
        <Skeleton height={20} />
      </Screen>
    );
  }

  if (noteId && noteQuery.isError) {
    return (
      <Screen>
        <ErrorState
          description="Could not load note."
          onRetry={() => {
            void noteQuery.refetch();
          }}
          title="Note unavailable"
        />
      </Screen>
    );
  }

  if (noteId && !noteQuery.data) {
    return (
      <Screen>
        <EmptyState
          actionLabel="Back to Notes"
          onAction={() => {
            navigation.navigate('Notes');
          }}
          title="Note not found"
        />
      </Screen>
    );
  }

  return (
    <Screen scroll keyboardAware>
      <Text variant="titleMd">{noteId ? 'Edit Note' : 'Create Note'}</Text>
      <Input label="Title" onChangeText={setTitle} placeholder="Note title" value={title} />
      <Input label="Content" multiline onChangeText={setContent} placeholder="What did you try?" value={content} />
      <Input
        keyboardType="decimal-pad"
        label="Rating (optional)"
        onChangeText={setRating}
        placeholder="1-5"
        value={rating}
      />

      {errorMessage ? <ErrorState description={errorMessage} title="Could not save note" /> : null}

      <Button
        disabled={isSubmitting}
        label={isSubmitting ? 'Saving...' : 'Save'}
        onPress={() => {
          void handleSave();
        }}
      />
    </Screen>
  );
}
