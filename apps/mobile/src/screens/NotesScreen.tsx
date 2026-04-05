import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ConfirmDestructiveModal,
  EmptyState,
  ErrorState,
  FeatureDetailScreenScaffold,
  HeaderAccessoryButton,
  PhotoViewerModal,
  SegmentedControl,
  Skeleton,
  StatusPill,
  type SegmentedControlOption,
} from '../components/shared';
import {
  buildPocketBaseFileUrl,
  deleteNote,
  listNotePhotosForNoteIds,
  listNotesPage,
  type NotePhotoRecord,
  type NoteRecord,
} from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Card, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type NotesScreenProps = NativeStackScreenProps<RootStackParamList, 'Notes'>;
type NotesFilter = 'unused' | 'used' | 'all';

function resolveNoteStatusFilter(activeFilter: NotesFilter): 'all' | 'draft' | 'used' {
  if (activeFilter === 'unused') {
    return 'draft';
  }

  if (activeFilter === 'used') {
    return 'used';
  }

  return 'all';
}

function buildNotePreview(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 140) {
    return normalized;
  }

  return `${normalized.slice(0, 137).trimEnd()}...`;
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
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();
  const [activeFilter, setActiveFilter] = useState<NotesFilter>('unused');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDeleteNote, setPendingDeleteNote] = useState<NoteRecord | null>(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const noteStatusFilter = resolveNoteStatusFilter(activeFilter);

  const notesQuery = useInfiniteQuery({
    queryKey: ['feature', 'notes', 'paginated', noteStatusFilter],
    queryFn: ({ pageParam }) =>
      listNotesPage({
        page: pageParam,
        pageSize: 20,
        status: noteStatusFilter,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
  });
  const allNotesCountQuery = useQuery({
    queryKey: ['feature', 'notes', 'count', 'all'],
    queryFn: async () => (await listNotesPage({ page: 1, pageSize: 1, status: 'all' })).totalItems,
  });
  const unusedNotesCountQuery = useQuery({
    queryKey: ['feature', 'notes', 'count', 'draft'],
    queryFn: async () => (await listNotesPage({ page: 1, pageSize: 1, status: 'draft' })).totalItems,
  });
  const usedNotesCountQuery = useQuery({
    queryKey: ['feature', 'notes', 'count', 'used'],
    queryFn: async () => (await listNotesPage({ page: 1, pageSize: 1, status: 'used' })).totalItems,
  });
  const notes = useMemo(
    () => notesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [notesQuery.data],
  );
  const visibleNoteIds = useMemo(() => notes.map((note) => note.id), [notes]);

  const notePhotosQuery = useQuery({
    queryKey: ['feature', 'notePhotos', 'notes', ...visibleNoteIds],
    queryFn: () => listNotePhotosForNoteIds(visibleNoteIds),
    enabled: visibleNoteIds.length > 0,
  });
  const hasBlockingNotesError = notesQuery.isError && (!notesQuery.data || notesQuery.data.pages.length === 0);
  const hasNotesRefreshError = !hasBlockingNotesError && (notesQuery.isError || notePhotosQuery.isError);
  const unusedCount = unusedNotesCountQuery.data ?? notes.filter((note) => note.status === 'draft').length;
  const usedCount = usedNotesCountQuery.data ?? notes.filter((note) => note.status === 'used').length;
  const allCount = allNotesCountQuery.data ?? notes.length;

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
      { label: 'All', value: 'all', badgeCount: allCount },
    ],
    [allCount, unusedCount, usedCount],
  );

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
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

    trackObservabilityEvent('NOTE_PHOTO_VIEWER_OPENED', {
      source: 'NotesScreen',
      photoCount: photos.length,
      initialIndex,
    });

    const urls = photos.map((photo) =>
      buildPocketBaseFileUrl({
        collectionName: 'note_photos',
        recordId: photo.id,
        filename: photo.photo,
      }),
    );
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

    trackObservabilityEvent('NOTE_DELETE_CONFIRMED', {
      source: 'NotesScreen',
      wasUsed: pendingDeleteNote.status === 'used',
    });

    setErrorMessage(null);
    setIsDeletingNote(true);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('note.delete', { noteId: pendingDeleteNote.id });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'notePhotos'] }),
        ]);
        setPendingDeleteNote(null);
        showQueuedOfflineAlert('Note delete');
        return;
      }

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
  }, [isOnline, pendingDeleteNote, queryClient, queueFeatureOutbox, queueWrite]);

  return (
    <FeatureDetailScreenScaffold
      onBackPress={() => {
        navigation.navigate('AddVisit');
      }}
      rightAccessory={
        <HeaderAccessoryButton
          accessibilityLabel="Create note"
          label="Add note"
          onPress={() => {
            trackObservabilityEvent('NOTES_CREATE_CTA_TAPPED', {
              source: 'NotesScreen',
              placement: 'header',
            });
            navigation.navigate('NoteEditor');
          }}
          testID="notes-create-button"
        />
      }
      subtitle="View, edit, or delete your saved notes."
      title="My Notes"
    >
      <View style={styles.body}>
        <SegmentedControl
          onChange={(nextFilter) => {
            trackObservabilityEvent('NOTES_FILTER_CHANGED', {
              source: 'NotesScreen',
              filter: nextFilter,
            });
            setActiveFilter(nextFilter);
          }}
          options={filterOptions}
          value={activeFilter}
        />

        {errorMessage ? <ErrorState description={errorMessage} title="Notes update failed" /> : null}

        <PageErrorToast
          errorMessage={
            hasBlockingNotesError
              ? 'Could not load notes.'
              : hasNotesRefreshError
                ? notePhotosQuery.isError
                  ? 'Could not refresh note photos. Showing saved notes.'
                  : 'Could not refresh notes. Showing saved data.'
                : null
          }
          title="Notes unavailable"
          actionLabel="Retry"
          onAction={() => {
            void notesQuery.refetch();
            if (visibleNoteIds.length > 0) {
              void notePhotosQuery.refetch();
            }
          }}
        />

        {notesQuery.isLoading ? (
          <>
            <Skeleton height={20} />
            <Skeleton height={20} />
            <Skeleton height={20} />
          </>
        ) : null}

        {hasBlockingNotesError ? (
          <ErrorState
            description="Could not load notes."
            onRetry={() => {
              void notesQuery.refetch();
              if (visibleNoteIds.length > 0) {
                void notePhotosQuery.refetch();
              }
            }}
            title="Notes unavailable"
          />
        ) : null}

        {!notesQuery.isLoading && !hasBlockingNotesError && notes.length === 0 ? (
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
              trackObservabilityEvent('NOTES_CREATE_CTA_TAPPED', {
                source: 'NotesScreen',
                placement: 'empty_state',
              });
              navigation.navigate('NoteEditor');
            }}
            title="Nothing to show"
          />
        ) : null}

        {!notesQuery.isLoading && !hasBlockingNotesError
          ? notes.map((note) => {
              const notePhotos = notePhotosByNoteId.get(note.id) ?? [];
              const primaryPhoto = notePhotos[0];
              const thumbnailUrl = primaryPhoto
                ? buildPocketBaseFileUrl({
                    collectionName: 'note_photos',
                    recordId: primaryPhoto.id,
                    filename: primaryPhoto.photo,
                    thumb: '100x100',
                  })
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
                            trackObservabilityEvent('NOTE_USE_TAPPED', {
                              source: 'NotesScreen',
                              noteStatus: note.status,
                            });
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
                          trackObservabilityEvent('NOTE_EDIT_TAPPED', {
                            source: 'NotesScreen',
                            noteStatus: note.status,
                          });
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
                          trackObservabilityEvent('NOTE_DELETE_TAPPED', {
                            source: 'NotesScreen',
                            noteStatus: note.status,
                          });
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
                    </View>
                  </View>
                </Card>
              );
            })
          : null}

        {!notesQuery.isLoading && !hasBlockingNotesError && notes.length > 0 && notesQuery.hasNextPage ? (
          <Button
            label={notesQuery.isFetchingNextPage ? 'Loading more...' : 'Load more notes'}
            loading={notesQuery.isFetchingNextPage}
            onPress={() => {
              void notesQuery.fetchNextPage();
            }}
            variant="secondary"
          />
        ) : null}
      </View>

      <PhotoViewerModal
        initialIndex={photoViewerInitialIndex}
        onRequestClose={closePhotoViewer}
        urls={photoViewerUrls}
        visible={photoViewerVisible}
      />

      <ConfirmDestructiveModal
        cancelLabel="Keep Note"
        confirmLabel="Delete Note"
        description="Delete this note permanently? This action cannot be undone."
        disabled={!pendingDeleteNote}
        loading={isDeletingNote}
        onCancel={closeDeleteModal}
        onConfirm={() => {
          void handleDelete();
        }}
        testID="delete-note-confirmation-modal"
        visible={pendingDeleteNote !== null}
        title="Delete Note?"
      />
    </FeatureDetailScreenScaffold>
  );
}
