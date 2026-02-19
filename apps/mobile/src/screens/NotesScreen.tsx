import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  EmptyState,
  ErrorState,
  FeatureDetailScreenScaffold,
  PhotoViewerModal,
  SegmentedControl,
  Skeleton,
  StatusPill,
  type SegmentedControlOption,
} from '../components/shared';
import { deleteNote, listNotes, type NoteRecord } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { pb } from '../lib/pocketbase';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Card, Modal, Text } from '../ui';

type NotesScreenProps = NativeStackScreenProps<RootStackParamList, 'Notes'>;
type NotesFilter = 'unused' | 'used' | 'all';

interface NotePhotoRecord {
  id: string;
  note: string;
  photo: string;
  created: string;
}

function buildNotePreview(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 140) {
    return normalized;
  }

  return `${normalized.slice(0, 137).trimEnd()}...`;
}

function buildNoteLocation(note: NoteRecord): string | null {
  if (note.restaurantName?.trim()) {
    return note.restaurantName.trim();
  }

  if (note.locationText?.trim()) {
    return note.locationText.trim();
  }

  return null;
}

function formatTimeAgo(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  const elapsedMs = Date.now() - date.getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / (1000 * 60)));
  if (elapsedMinutes < 1) {
    return 'just now';
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) {
    return `${elapsedDays}d ago`;
  }

  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) {
    return `${elapsedMonths}mo ago`;
  }

  const elapsedYears = Math.floor(elapsedMonths / 12);
  return `${elapsedYears}y ago`;
}

export function NotesScreen({ navigation }: NotesScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const [activeFilter, setActiveFilter] = useState<NotesFilter>('unused');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDeleteNote, setPendingDeleteNote] = useState<NoteRecord | null>(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);

  const notesQuery = useQuery({
    queryKey: ['feature', 'notes'],
    queryFn: listNotes,
  });

  const notePhotosQuery = useQuery({
    queryKey: ['feature', 'notePhotos'],
    queryFn: async () => pb.collection('note_photos').getFullList<NotePhotoRecord>({ sort: 'created' }),
  });

  const notes = notesQuery.data ?? [];
  const unusedCount = notes.filter((note) => note.status === 'draft').length;
  const usedCount = notes.filter((note) => note.status === 'used').length;

  const notePhotosByNoteId = useMemo(() => {
    const map = new Map<string, NotePhotoRecord[]>();
    for (const photo of notePhotosQuery.data ?? []) {
      const existing = map.get(photo.note) ?? [];
      existing.push(photo);
      map.set(photo.note, existing);
    }
    return map;
  }, [notePhotosQuery.data]);

  const filterOptions = useMemo<readonly SegmentedControlOption<NotesFilter>[]>(
    () => [
      { label: 'Unused', value: 'unused', badgeCount: unusedCount },
      { label: 'Used', value: 'used', badgeCount: usedCount },
      { label: 'All', value: 'all', badgeCount: notes.length },
    ],
    [notes.length, unusedCount, usedCount],
  );

  const filteredNotes = useMemo(() => {
    if (activeFilter === 'all') {
      return notes;
    }

    const targetStatus = activeFilter === 'unused' ? 'draft' : 'used';
    return notes.filter((note) => note.status === targetStatus);
  }, [activeFilter, notes]);

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
    },
    accessoryButton: {
      alignItems: 'center',
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
    accessoryLabel: {
      fontSize: 12,
      lineHeight: 16,
    },
    noteTopRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    noteMeta: {
      alignItems: 'center',
      flexDirection: 'row',
      flex: 1,
      gap: theme.spacing.xs,
    },
    noteActionsInline: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    useActionLabel: {
      color: theme.colors.text.brand,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 18,
    },
    iconAction: {
      padding: 2,
    },
    noteContentRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    photoWrap: {
      position: 'relative',
    },
    photoThumb: {
      backgroundColor: theme.colors.border.subtle,
      borderRadius: 8,
      height: 64,
      width: 64,
    },
    photoCountBadge: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.inverse,
      borderRadius: theme.radii.pill,
      justifyContent: 'center',
      minWidth: 20,
      paddingHorizontal: 4,
      position: 'absolute',
      left: 2,
      top: 2,
    },
    photoCountText: {
      color: theme.colors.text.inverse,
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 14,
    },
    noteTextContent: {
      flex: 1,
      gap: 4,
      minHeight: 64,
      justifyContent: 'center',
    },
    notePreview: {
      lineHeight: 20,
    },
    locationRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xxs,
    },
  });

  const openPhotoViewer = useCallback((photos: NotePhotoRecord[], initialIndex = 0) => {
    if (photos.length === 0) {
      return;
    }

    const urls = photos.map((photo) => pb.files.getURL(photo, photo.photo));
    const boundedIndex = Math.max(0, Math.min(initialIndex, urls.length - 1));

    setPhotoViewerUrls(urls);
    setPhotoViewerInitialIndex(boundedIndex);
    setPhotoViewerVisible(true);
  }, []);

  const closePhotoViewer = useCallback(() => {
    setPhotoViewerVisible(false);
  }, []);

  const closeDeleteModal = useCallback(() => {
    if (isDeletingNote) {
      return;
    }

    setPendingDeleteNote(null);
  }, [isDeletingNote]);

  const handleDelete = useCallback(async () => {
    if (!pendingDeleteNote) {
      return;
    }

    setErrorMessage(null);
    setIsDeletingNote(true);

    try {
      await queueWrite('note.delete');
      await deleteNote(pendingDeleteNote.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'notePhotos'] }),
      ]);
      setPendingDeleteNote(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete note.';
      setErrorMessage(message);
    } finally {
      setIsDeletingNote(false);
    }
  }, [pendingDeleteNote, queryClient, queueWrite]);

  return (
    <FeatureDetailScreenScaffold
      onBackPress={() => {
        navigation.navigate('AddVisit');
      }}
      rightAccessory={
        <Pressable
          accessibilityLabel="Create note"
          accessibilityRole="button"
          onPress={() => {
            navigation.navigate('NoteEditor');
          }}
          style={styles.accessoryButton}
          testID="notes-create-button"
        >
          <Ionicons color={theme.colors.text.primary} name="add-outline" size={14} />
          <Text style={styles.accessoryLabel} variant="label">
            Add note
          </Text>
        </Pressable>
      }
      subtitle="View, edit, or delete your saved notes."
      title="My Notes"
    >
      <View style={styles.body}>
        <SegmentedControl onChange={setActiveFilter} options={filterOptions} value={activeFilter} />

        {errorMessage ? <ErrorState description={errorMessage} title="Notes update failed" /> : null}

        {notesQuery.isLoading ? (
          <>
            <Skeleton height={20} />
            <Skeleton height={20} />
            <Skeleton height={20} />
          </>
        ) : null}

        {notesQuery.isError ? (
          <ErrorState
            description="Could not load notes."
            onRetry={() => {
              void notesQuery.refetch();
              void notePhotosQuery.refetch();
            }}
            title="Notes unavailable"
          />
        ) : null}

        {!notesQuery.isLoading && !notesQuery.isError && filteredNotes.length === 0 ? (
          <EmptyState
            actionLabel="Log a Note"
            description={
              activeFilter === 'unused'
                ? 'No unused notes.'
                : activeFilter === 'used'
                  ? 'No used notes yet.'
                  : 'No notes yet.'
            }
            onAction={() => {
              navigation.navigate('NoteEditor');
            }}
            title="Nothing to show"
          />
        ) : null}

        {!notesQuery.isLoading && !notesQuery.isError
          ? filteredNotes.map((note) => {
              const location = buildNoteLocation(note);
              const notePhotos = notePhotosByNoteId.get(note.id) ?? [];
              const primaryPhoto = notePhotos[0];
              const thumbnailUrl = primaryPhoto
                ? pb.files.getURL(primaryPhoto, primaryPhoto.photo, { thumb: '100x100' })
                : null;

              return (
                <Card key={note.id} tone={note.status === 'used' ? 'muted' : 'info'}>
                  <View style={styles.noteTopRow}>
                    <View style={styles.noteMeta}>
                      <Ionicons color={theme.colors.text.muted} name="document-text-outline" size={14} />
                      <Text tone="muted" variant="bodySm">
                        {formatTimeAgo(note.createdAt)}
                      </Text>
                      {note.status === 'used' ? <StatusPill label="Used" tone="success" /> : null}
                    </View>

                    <View style={styles.noteActionsInline}>
                      {note.status === 'draft' ? (
                        <Pressable
                          accessibilityLabel="Use note to track item"
                          accessibilityRole="button"
                          onPress={() => {
                            navigation.navigate('QuickTrack', { sourceNoteId: note.id });
                          }}
                          testID={`note-use-button-${note.id}`}
                        >
                          <Text style={styles.useActionLabel}>Use</Text>
                        </Pressable>
                      ) : null}

                      <Pressable
                        accessibilityLabel="Edit note"
                        accessibilityRole="button"
                        onPress={() => {
                          navigation.navigate('NoteEditor', { noteId: note.id });
                        }}
                        style={styles.iconAction}
                        testID={`note-edit-button-${note.id}`}
                      >
                        <Ionicons color={theme.colors.text.primary} name="create-outline" size={18} />
                      </Pressable>

                      <Pressable
                        accessibilityLabel="Delete note"
                        accessibilityRole="button"
                        onPress={() => {
                          setErrorMessage(null);
                          setPendingDeleteNote(note);
                        }}
                        style={styles.iconAction}
                        testID={`note-delete-button-${note.id}`}
                      >
                        <Ionicons color={theme.colors.text.danger} name="trash-outline" size={18} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.noteContentRow}>
                    {thumbnailUrl ? (
                      <Pressable
                        accessibilityLabel={`View photos for note ${note.id}`}
                        onPress={() => {
                          openPhotoViewer(notePhotos);
                        }}
                        style={styles.photoWrap}
                      >
                        <Image source={{ uri: thumbnailUrl }} style={styles.photoThumb} />
                        {notePhotos.length > 1 ? (
                          <View style={styles.photoCountBadge}>
                            <Text style={styles.photoCountText}>+{notePhotos.length - 1}</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    ) : null}

                    <View style={styles.noteTextContent}>
                      <Text style={styles.notePreview}>{buildNotePreview(note.content)}</Text>
                      {location ? (
                        <View style={styles.locationRow}>
                          <Ionicons color={theme.colors.text.muted} name="location-outline" size={14} />
                          <Text tone="secondary">{location}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Card>
              );
            })
          : null}
      </View>

      <PhotoViewerModal
        initialIndex={photoViewerInitialIndex}
        onRequestClose={closePhotoViewer}
        urls={photoViewerUrls}
        visible={photoViewerVisible}
      />

      <Modal
        description={
          pendingDeleteNote
            ? 'Delete this note permanently? This action cannot be undone.'
            : undefined
        }
        onRequestClose={closeDeleteModal}
        primaryAction={{
          label: 'Delete Note',
          loading: isDeletingNote,
          onPress: () => {
            void handleDelete();
          },
          disabled: isDeletingNote || !pendingDeleteNote,
        }}
        secondaryAction={{
          label: 'Keep Note',
          onPress: closeDeleteModal,
          disabled: isDeletingNote,
        }}
        title="Delete Note?"
        visible={pendingDeleteNote !== null}
      />
    </FeatureDetailScreenScaffold>
  );
}
