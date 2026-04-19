import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

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
  listNotePhotosForNote,
  listNotesOverviewPage,
  type NoteOverviewItemRecord,
  type NotePhotoRecord,
  type NoteRecord,
} from '../features';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePaginatedQueryState } from '../hooks/useListQueryState';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { notesQueryKeys } from '../features/store/notesQuery';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type NotesScreenProps = NativeStackScreenProps<RootStackParamList, 'Notes'>;
type NotesFilter = 'unused' | 'used' | 'all';

const MIN_SERVER_NOTE_SEARCH_LENGTH = 2;
const NOTE_SEARCH_DEBOUNCE_MS = 250;

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  searchField: {
    flex: 1,
  },
  clearSearchButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: theme.sizes.secondaryButtonHeight,
    paddingHorizontal: theme.spacing.md,
  },
  clearSearchButtonPressed: {
    backgroundColor: theme.colors.background.muted,
  },
  clearSearchLabel: {
    color: theme.colors.text.secondary,
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
  photoWrapLoading: {
    opacity: 0.6,
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
  },
  noteTextContent: {
    flex: 1,
    gap: 4,
    minHeight: 64,
    justifyContent: 'center',
  },
  locationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xxs,
  },
  locationText: {
    color: theme.colors.text.muted,
    flex: 1,
  },
}));

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
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return '';
  }

  return trimmedContent
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      if (!line.trim()) {
        return '';
      }

      return line.replace(/[^\S\n]+/g, ' ').trim();
    })
    .join('\n');
}

function matchesNoteSearch(note: Pick<NoteRecord, 'content' | 'locationText'>, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return (
    note.content.toLowerCase().includes(normalizedQuery) ||
    note.locationText?.toLowerCase().includes(normalizedQuery) === true
  );
}

function serverSearchResultsMatchQuery(
  notes: readonly Pick<NoteRecord, 'content' | 'locationText'>[],
  query: string,
): boolean {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return true;
  }

  return notes.every((note) => matchesNoteSearch(note, normalizedQuery));
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

function compareNotesByCreatedAtDesc(left: Pick<NoteRecord, 'createdAt' | 'updatedAt'>, right: Pick<NoteRecord, 'createdAt' | 'updatedAt'>): number {
  const createdDiff = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  if (!Number.isNaN(createdDiff) && createdDiff !== 0) {
    return createdDiff;
  }

  const updatedDiff = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  if (!Number.isNaN(updatedDiff)) {
    return updatedDiff;
  }

  return 0;
}

export function NotesScreen({ navigation }: NotesScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();
  const [activeFilter, setActiveFilter] = useState<NotesFilter>('unused');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [pendingDeleteNote, setPendingDeleteNote] = useState<NoteRecord | null>(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);
  const [loadingPhotoNoteId, setLoadingPhotoNoteId] = useState<string | null>(null);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerPreviewUrls, setPhotoViewerPreviewUrls] = useState<string[]>(
    [],
  );
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const lastRejectedSearchResultsKeyRef = useRef<string | null>(null);
  const noteStatusFilter = resolveNoteStatusFilter(activeFilter);
  const trimmedSearchQuery = searchQuery.trim();
  const debouncedTrimmedSearchQuery = useDebouncedValue(
    trimmedSearchQuery,
    NOTE_SEARCH_DEBOUNCE_MS,
  );
  const shouldQueryNotesBySearch =
    trimmedSearchQuery.length >= MIN_SERVER_NOTE_SEARCH_LENGTH &&
    debouncedTrimmedSearchQuery.length >= MIN_SERVER_NOTE_SEARCH_LENGTH &&
    trimmedSearchQuery === debouncedTrimmedSearchQuery;
  const hasSearch = trimmedSearchQuery.length > 0;

  const baseNotesQuery = useInfiniteQuery({
    queryKey: notesQueryKeys.paginated(noteStatusFilter),
    queryFn: ({ pageParam, signal }) =>
      listNotesOverviewPage({
        page: pageParam,
        pageSize: 20,
        signal,
        status: noteStatusFilter,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
  });
  const searchedNotesQuery = useInfiniteQuery({
    queryKey: notesQueryKeys.paginated(noteStatusFilter, debouncedTrimmedSearchQuery),
    queryFn: ({ pageParam, signal }) =>
      listNotesOverviewPage({
        page: pageParam,
        pageSize: 20,
        search: debouncedTrimmedSearchQuery || undefined,
        signal,
        status: noteStatusFilter,
      }),
    enabled: shouldQueryNotesBySearch,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
  });
  const baseNotesState = usePaginatedQueryState({
    data: baseNotesQuery.data,
    isError: baseNotesQuery.isError,
    isFetching: baseNotesQuery.isFetching,
    isLoading: baseNotesQuery.isLoading,
    isSuccess: baseNotesQuery.isSuccess,
  });
  const searchedNotesState = usePaginatedQueryState({
    data: searchedNotesQuery.data,
    enabled: shouldQueryNotesBySearch,
    isError: searchedNotesQuery.isError,
    isFetching: searchedNotesQuery.isFetching,
    isLoading: searchedNotesQuery.isLoading,
    isSuccess: searchedNotesQuery.isSuccess,
  });
  const baseNotes = useMemo(
    () => [...baseNotesState.items].sort(compareNotesByCreatedAtDesc),
    [baseNotesState.items],
  );
  const searchedNotes = useMemo(
    () => [...searchedNotesState.items].sort(compareNotesByCreatedAtDesc),
    [searchedNotesState.items],
  );
  const locallyFilteredBaseNotes = useMemo(
    () => (hasSearch ? baseNotes.filter((note) => matchesNoteSearch(note, trimmedSearchQuery)) : baseNotes),
    [baseNotes, hasSearch, trimmedSearchQuery],
  );
  const searchedNotesMatchCurrentQuery = useMemo(
    () => serverSearchResultsMatchQuery(searchedNotes, trimmedSearchQuery),
    [searchedNotes, trimmedSearchQuery],
  );
  const shouldUseServerSearchResults =
    shouldQueryNotesBySearch &&
    searchedNotesQuery.isSuccess &&
    searchedNotesMatchCurrentQuery;
  const shouldRejectServerSearchResults =
    shouldQueryNotesBySearch &&
    searchedNotesQuery.isSuccess &&
    !searchedNotesMatchCurrentQuery;

  useEffect(() => {
    if (!shouldRejectServerSearchResults) {
      lastRejectedSearchResultsKeyRef.current = null;
      return;
    }

    const rejectionKey = `${activeFilter}::${trimmedSearchQuery}::${searchedNotes.length}`;
    if (lastRejectedSearchResultsKeyRef.current === rejectionKey) {
      return;
    }

    lastRejectedSearchResultsKeyRef.current = rejectionKey;
    trackObservabilityEvent('NOTES_SEARCH_RESULTS_REJECTED', {
      source: 'NotesScreen',
      activeFilter,
      noteStatusFilter,
      searchTermLength: trimmedSearchQuery.length,
      returnedItemCount: searchedNotes.length,
      hasNonMatchingItem: searchedNotes.some((note) => !matchesNoteSearch(note, trimmedSearchQuery)),
    });
  }, [
    activeFilter,
    noteStatusFilter,
    searchedNotes,
    shouldRejectServerSearchResults,
    trimmedSearchQuery,
  ]);

  const notes = useMemo(() => {
    if (!hasSearch) {
      return baseNotes;
    }

    if (shouldUseServerSearchResults) {
      return searchedNotes;
    }

    return locallyFilteredBaseNotes;
  }, [
    baseNotes,
    hasSearch,
    locallyFilteredBaseNotes,
    searchedNotes,
    shouldUseServerSearchResults,
  ]);
  const noteSummary =
    shouldUseServerSearchResults
      ? searchedNotesQuery.data?.pages[0]?.summary
      : baseNotesQuery.data?.pages[0]?.summary;
  const unusedCount = noteSummary?.draftCount ?? baseNotes.filter((note) => note.status === 'draft').length;
  const usedCount = noteSummary?.usedCount ?? baseNotes.filter((note) => note.status === 'used').length;
  const allCount = noteSummary?.allCount ?? baseNotes.length;

  const filterOptions = useMemo<readonly SegmentedControlOption<NotesFilter>[]>(
    () => [
      { label: 'Unused', value: 'unused', badgeCount: unusedCount },
      { label: 'Used', value: 'used', badgeCount: usedCount },
      { label: 'All', value: 'all', badgeCount: allCount },
    ],
    [allCount, unusedCount, usedCount],
  );

  const styles = useStyles();

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
    const previewUrls = photos.map((photo) =>
      buildPocketBaseFileUrl({
        collectionName: 'note_photos',
        recordId: photo.id,
        filename: photo.photo,
        thumb: '100x100',
      }),
    );
    const boundedIndex = Math.max(0, Math.min(initialIndex, urls.length - 1));

    setPhotoViewerUrls(urls);
    setPhotoViewerPreviewUrls(previewUrls);
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

  const handleOpenNotePhotos = useCallback(async (note: NoteOverviewItemRecord) => {
    if (!note.photoPreview) {
      return;
    }

    setActionErrorMessage(null);
    setLoadingPhotoNoteId(note.id);

    try {
      const notePhotos = await queryClient.fetchQuery({
        queryKey: ['feature', 'notePhotos', note.id],
        queryFn: ({ signal }) => listNotePhotosForNote(note.id, { signal }),
      });
      if (notePhotos.length === 0) {
        setActionErrorMessage('Could not load note photos.');
        return;
      }
      openPhotoViewer(notePhotos);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load note photos.';
      setActionErrorMessage(message);
    } finally {
      setLoadingPhotoNoteId((current) => (current === note.id ? null : current));
    }
  }, [openPhotoViewer, queryClient]);

  const handleDelete = useCallback(async () => {
    if (!pendingDeleteNote) {
      return;
    }

    trackObservabilityEvent('NOTE_DELETE_CONFIRMED', {
      source: 'NotesScreen',
      wasUsed: pendingDeleteNote.status === 'used',
    });

    setActionErrorMessage(null);
    setIsDeletingNote(true);

    try {
      const deleteResult = await writeFeature({
        operationName: 'note.delete',
        offline: {
          strategy: 'outbox',
          payload: { noteId: pendingDeleteNote.id },
        },
        execute: () => deleteNote(pendingDeleteNote.id),
      });

      if (deleteResult.status === 'queued') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'notePhotos'] }),
        ]);
        setPendingDeleteNote(null);
        showQueuedOfflineAlert('Note delete');
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'notePhotos'] }),
      ]);
      setPendingDeleteNote(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete note.';
      setActionErrorMessage(message);
    } finally {
      setIsDeletingNote(false);
    }
  }, [pendingDeleteNote, queryClient, writeFeature]);

  const handleRefresh = useCallback(async () => {
    setIsPullRefreshing(true);

    try {
      if (shouldQueryNotesBySearch) {
        await Promise.all([baseNotesQuery.refetch(), searchedNotesQuery.refetch()]);
        return;
      }

      await baseNotesQuery.refetch();
    } finally {
      setIsPullRefreshing(false);
    }
  }, [baseNotesQuery, searchedNotesQuery, shouldQueryNotesBySearch]);

  const hasSearchFallbackError =
    shouldQueryNotesBySearch &&
    searchedNotesQuery.isError &&
    baseNotes.length > 0;
  const notesErrorMessage =
    baseNotesState.hasBlockingError
      ? 'Could not load notes.'
      : baseNotesState.hasRefreshError
        ? 'Could not refresh notes. Showing saved data.'
        : hasSearchFallbackError
          ? 'Could not refresh search results. Showing local matches.'
          : null;
  const activePaginationQuery =
    shouldUseServerSearchResults
      ? searchedNotesQuery
      : baseNotesQuery;

  return (
    <FeatureDetailScreenScaffold
      onRefresh={handleRefresh}
      onBackPress={() => {
        navigation.navigate('AddVisit');
      }}
      refreshing={isPullRefreshing}
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

        <View style={styles.searchRow}>
          <Input
            containerStyle={styles.searchField}
            onChangeText={setSearchQuery}
            placeholder="Search notes..."
            testID="notes-search-input"
            value={searchQuery}
          />
          {hasSearch ? (
            <Pressable
              accessibilityLabel="Clear search"
              accessibilityRole="button"
              onPress={() => {
                setSearchQuery('');
              }}
              style={({ pressed }) => [styles.clearSearchButton, pressed ? styles.clearSearchButtonPressed : null]}
            >
              <Text style={styles.clearSearchLabel} variant="labelMd">Clear</Text>
            </Pressable>
          ) : null}
        </View>

        {activeFilter === 'used' ? (
          <View testID="notes-used-retention-banner">
            <Card tone="info">
              <Text tone="secondary">
                Used notes auto-delete 30 days after first use. Editing does not reset the timer.
              </Text>
            </Card>
          </View>
        ) : null}

        {actionErrorMessage ? <ErrorState description={actionErrorMessage} title="Notes action failed" /> : null}

        <PageErrorToast
          errorMessage={notesErrorMessage}
          title="Notes unavailable"
          actionLabel="Retry"
          onAction={() => {
            if (hasSearchFallbackError) {
              void searchedNotesQuery.refetch();
              return;
            }

            void baseNotesQuery.refetch();
          }}
        />

        {baseNotesQuery.isLoading ? (
          <>
            <Skeleton height={20} />
            <Skeleton height={20} />
            <Skeleton height={20} />
          </>
        ) : null}

        {baseNotesState.hasBlockingError ? (
          <ErrorState
            description="Could not load notes."
            onRetry={() => {
              void baseNotesQuery.refetch();
            }}
            title="Notes unavailable"
          />
        ) : null}

        {!baseNotesQuery.isLoading && !baseNotesState.hasBlockingError && notes.length === 0 ? (
          hasSearch ? (
            <EmptyState
              actionLabel="Clear Search"
              description="Try a different search term."
              onAction={() => {
                setSearchQuery('');
              }}
              tone="muted"
              title="No matching notes"
            />
          ) : (
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
              tone="muted"
              title="Nothing to show"
            />
          )
        ) : null}

        {!baseNotesQuery.isLoading && !baseNotesState.hasBlockingError
          ? notes.map((note) => {
              const photoPreview = note.photoPreview;
              const extraPhotoCount = photoPreview ? Math.max(photoPreview.count - 1, 0) : 0;
              const thumbnailUrl = photoPreview
                ? buildPocketBaseFileUrl({
                    collectionName: 'note_photos',
                    recordId: photoPreview.id,
                    filename: photoPreview.photo,
                    thumb: '100x100',
                  })
                : null;

              return (
                <Card key={note.id} tone={note.status === 'used' ? 'default' : 'info'}>
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
                          accessibilityLabel="Use note"
                          accessibilityRole="button"
                          onPress={() => {
                            trackObservabilityEvent('NOTE_USE_TAPPED', {
                              source: 'NotesScreen',
                              noteStatus: note.status,
                            });
                            navigation.navigate('ProcessPhotos', { sourceNoteId: note.id });
                          }}
                          testID={`note-use-button-${note.id}`}
                        >
                          <Text style={styles.useActionLabel} variant="bodyBaseSemiBold">Use</Text>
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
                          setActionErrorMessage(null);
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
                        disabled={loadingPhotoNoteId === note.id}
                        onPress={() => {
                          void handleOpenNotePhotos(note);
                        }}
                        style={[
                          styles.photoWrap,
                          loadingPhotoNoteId === note.id ? styles.photoWrapLoading : null,
                        ]}
                      >
                        <Image source={{ uri: thumbnailUrl }} style={styles.photoThumb} />
                        {extraPhotoCount > 0 ? (
                          <View style={styles.photoCountBadge}>
                            <Text style={styles.photoCountText} variant="captionStrong">
                              +{extraPhotoCount}
                            </Text>
                          </View>
                        ) : null}
                      </Pressable>
                    ) : null}

                    <View style={styles.noteTextContent}>
                      <Text numberOfLines={note.locationText ? 3 : 4} variant="bodyMd">
                        {buildNotePreview(note.content)}
                      </Text>
                      {note.locationText ? (
                        <View style={styles.locationRow}>
                          <Ionicons color={theme.colors.text.muted} name="location-outline" size={14} />
                          <Text numberOfLines={1} style={styles.locationText} variant="bodySm">
                            {note.locationText}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Card>
              );
            })
          : null}

        {!baseNotesQuery.isLoading &&
        !baseNotesState.hasBlockingError &&
        notes.length > 0 &&
        activePaginationQuery.hasNextPage ? (
          <Button
            label={activePaginationQuery.isFetchingNextPage ? 'Loading more...' : 'Load more notes'}
            loading={activePaginationQuery.isFetchingNextPage}
            onPress={() => {
              void activePaginationQuery.fetchNextPage();
            }}
            variant="secondary"
          />
        ) : null}
      </View>

      <PhotoViewerModal
        initialIndex={photoViewerInitialIndex}
        onRequestClose={closePhotoViewer}
        previewUrls={photoViewerPreviewUrls}
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
