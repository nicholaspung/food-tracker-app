import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, View, type ListRenderItem } from 'react-native';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import {
  ConfirmDestructiveModal,
  EmptyState,
  ErrorState,
  FeatureDetailScreenScaffold,
  FeatureListFooter,
  HeaderAccessoryButton,
  PendingQueuedWriteRow,
  PhotoViewerModal,
  SegmentedControl,
  Skeleton,
  type SegmentedControlOption,
} from '../components/shared';
import {
  listNotePhotosForNote,
  listNotesOverviewPage,
  type NoteOverviewItemRecord,
  type NoteOverviewPage,
  type NotePhotoRecord,
  type NoteRecord,
} from '../features';
import { buildPhotoViewerState } from '../lib/photoUrls';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useFeatureBrowse } from '../features/store/useFeatureBrowse';
import { useNoteWrites } from '../features/store/useNoteWrites';
import type { QueuedFeatureWrite } from '../features/store/queuedFeatureWrites';
import { notesQueryKeys } from '../features/store/notesQuery';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { trackProductEvent } from '../observability/productAnalytics';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Card, Input, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import { NoteCard } from './notes/NoteCard';
import { compareNotesByCreatedAtDesc } from './notes/notesFormatters';
import {
  matchesNoteSearch,
  MIN_SERVER_NOTE_SEARCH_LENGTH,
  NOTE_SEARCH_DEBOUNCE_MS,
  resolveNoteStatusFilter,
  serverSearchResultsMatchQuery,
} from './notes/notesSearch';
import type { NotesFilter } from './notes/notesTypes';

type NotesScreenProps = NativeStackScreenProps<RootStackParamList, 'Notes'>;
type NotesInfiniteData = InfiniteData<NoteOverviewPage, unknown>;

const NOTE_PENDING_OPERATION_NAMES = ['note.create'] as const;

function getNotesFromData(data: NotesInfiniteData | undefined): NoteOverviewItemRecord[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

function getNoteCountFromData(data: NotesInfiniteData | undefined, fallbackCount: number): number {
  return data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? fallbackCount;
}

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  listFooter: {
    paddingTop: theme.spacing.md,
  },
  listHeader: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  headerStack: {
    gap: theme.spacing.sm,
  },
  noteSeparator: {
    height: theme.spacing.md,
  },
  screenBody: {
    flex: 1,
    gap: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
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
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  photoWrap: {
    alignSelf: 'flex-start',
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
    justifyContent: 'flex-start',
    minHeight: 64,
  },
  notePreviewTapTarget: {
    alignSelf: 'stretch',
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

export function NotesScreen({ navigation }: NotesScreenProps) {
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const noteWrites = useNoteWrites();
  const [activeFilter, setActiveFilter] = useState<NotesFilter>('unused');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);
  const [pendingDeleteNote, setPendingDeleteNote] = useState<NoteRecord | null>(null);
  const [loadingPhotoNoteId, setLoadingPhotoNoteId] = useState<string | null>(null);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerPreviewUrls, setPhotoViewerPreviewUrls] = useState<string[]>(
    [],
  );
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const lastRejectedSearchResultsKeyRef = useRef<string | null>(null);
  const lastTrackedSearchExecutionKeyRef = useRef<string | null>(null);
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
  const baseNotes = useMemo(
    () => getNotesFromData(baseNotesQuery.data).sort(compareNotesByCreatedAtDesc),
    [baseNotesQuery.data],
  );
  const searchedNotes = useMemo(
    () => getNotesFromData(searchedNotesQuery.data).sort(compareNotesByCreatedAtDesc),
    [searchedNotesQuery.data],
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
  const buildBrowseAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'NotesScreen',
      activeFilter,
      queryLength: trimmedSearchQuery.length,
      resultCount: notes.length,
      ...overrides,
    }),
    [activeFilter, notes.length, trimmedSearchQuery.length],
  );

  useEffect(() => {
    if (!hasSearch) {
      lastTrackedSearchExecutionKeyRef.current = null;
      return;
    }

    const trackingKey = `${activeFilter}::${trimmedSearchQuery}::${notes.length}`;
    if (lastTrackedSearchExecutionKeyRef.current === trackingKey) {
      return;
    }

    lastTrackedSearchExecutionKeyRef.current = trackingKey;
    trackObservabilityEvent('NOTES_SEARCH_EXECUTED', {
      activeFilter,
      queryLength: trimmedSearchQuery.length,
      resultCount: notes.length,
      source: 'NotesScreen',
    });
  }, [activeFilter, hasSearch, notes.length, trimmedSearchQuery]);

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

    const viewerState = buildPhotoViewerState(photos, initialIndex, {
      collectionName: 'note_photos',
    });

    setPhotoViewerUrls(viewerState.urls);
    setPhotoViewerPreviewUrls(viewerState.previewUrls);
    setPhotoViewerInitialIndex(viewerState.initialIndex);
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
    const wasUsed = pendingDeleteNote.status === 'used';

    trackObservabilityEvent('NOTE_DELETE_CONFIRMED', {
      source: 'NotesScreen',
      wasUsed,
    });
    trackObservabilityEvent('NOTE_DELETE_STARTED', {
      source: 'NotesScreen',
      isOnline,
      wasUsed,
    });

    setActionErrorMessage(null);
    setIsDeletingNote(true);

    try {
      const deleteResult = await noteWrites.deleteNote({ noteId: pendingDeleteNote.id });

      if (deleteResult.status === 'queued') {
        trackObservabilityEvent('NOTE_DELETE_SUCCEEDED', {
          source: 'NotesScreen',
          queued: true,
          wasUsed,
        });
        setPendingDeleteNote(null);
        return;
      }

      trackObservabilityEvent('NOTE_DELETE_SUCCEEDED', {
        source: 'NotesScreen',
        queued: false,
        wasUsed,
      });
      setPendingDeleteNote(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete note.';
      trackObservabilityEvent('NOTE_DELETE_FAILED', {
        source: 'NotesScreen',
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        isOnline,
        wasUsed,
      });
      setActionErrorMessage(message);
    } finally {
      setIsDeletingNote(false);
    }
  }, [isOnline, noteWrites, pendingDeleteNote]);

  const activePaginationQuery =
    shouldQueryNotesBySearch
      ? searchedNotesQuery
      : baseNotesQuery;
  const browseQuery = useMemo(
    () => ({
      data: activePaginationQuery.data,
      fetchNextPage: activePaginationQuery.fetchNextPage,
      hasNextPage: activePaginationQuery.hasNextPage,
      isError: baseNotesQuery.isError,
      isFetching: activePaginationQuery.isFetching,
      isFetchingNextPage: activePaginationQuery.isFetchingNextPage,
      isLoading: baseNotesQuery.isLoading,
      isRefetching: activePaginationQuery.isRefetching,
      isSuccess: baseNotesQuery.isSuccess,
      refetch: activePaginationQuery.refetch,
    }),
    [
      activePaginationQuery.data,
      activePaginationQuery.fetchNextPage,
      activePaginationQuery.hasNextPage,
      activePaginationQuery.isFetching,
      activePaginationQuery.isFetchingNextPage,
      activePaginationQuery.isRefetching,
      activePaginationQuery.refetch,
      baseNotesQuery.isError,
      baseNotesQuery.isLoading,
      baseNotesQuery.isSuccess,
    ],
  );
  const hasSearchFallbackError =
    shouldQueryNotesBySearch &&
    searchedNotesQuery.isError &&
    baseNotes.length > 0;
  const browseState = useFeatureBrowse<NotesInfiniteData, NoteOverviewItemRecord, 'note.create'>({
    analyticsSource: 'NotesScreen',
    buildAnalyticsPayload: buildBrowseAnalyticsPayload,
    emptyWhen: () => notes.length === 0,
    extraRefreshError: hasSearchFallbackError,
    getItemsFromData: useCallback(() => notes, [notes]),
    getResultCountFromData: getNoteCountFromData,
    getTotalItemsFromData: useCallback(() => notes.length, [notes.length]),
    loadMoreEventPrefix: 'NOTES_LOAD_MORE',
    pendingQueuedWriteOperationNames: NOTE_PENDING_OPERATION_NAMES,
    query: browseQuery,
    refreshEventPrefix: 'NOTES_REFRESH',
    resultCount: notes.length,
    toPendingRow: useCallback((write: QueuedFeatureWrite<'note.create'>) => {
      const payload = write.payload as {
        content: string;
        locationText?: string;
        title?: string;
      };

      return {
        id: write.id,
        createdAt: write.createdAt,
        description: payload.locationText,
        idempotencyKey: write.idempotencyKey,
        lastError: write.lastError,
        status: write.status,
        title: payload.title?.trim() || payload.content.trim().slice(0, 80) || 'New note',
      };
    }, []),
  });
  const notesErrorMessage =
    browseState.hasBlockingError
      ? 'Could not load notes.'
      : hasSearchFallbackError
        ? 'Could not refresh search results. Showing local matches.'
        : browseState.hasRefreshError
          ? 'Could not refresh notes. Showing saved data.'
          : null;

  const renderNoteCard = useCallback(
    (note: NoteOverviewItemRecord) => (
      <NoteCard
        loadingPhotoNoteId={loadingPhotoNoteId}
        note={note}
        onDelete={(targetNote) => {
          trackObservabilityEvent('NOTE_DELETE_TAPPED', {
            source: 'NotesScreen',
            noteStatus: targetNote.status,
          });
          setActionErrorMessage(null);
          setPendingDeleteNote(targetNote);
        }}
        onEdit={(targetNote) => {
          trackObservabilityEvent('NOTE_EDIT_TAPPED', {
            source: 'NotesScreen',
            noteStatus: targetNote.status,
          });
          navigation.navigate('NoteEditor', { noteId: targetNote.id });
        }}
        onOpenPhotos={(targetNote) => {
          void handleOpenNotePhotos(targetNote);
        }}
        onUse={(targetNote) => {
          trackObservabilityEvent('NOTE_USE_TAPPED', {
            source: 'NotesScreen',
            noteStatus: targetNote.status,
          });
          trackProductEvent('tracking.entry_started', {
            entryType: 'photo_batch',
            source: 'note',
            hasPhoto: (targetNote.photoPreview?.count ?? 0) > 0,
            itemCount: targetNote.photoPreview?.count ?? 0,
            completed: false,
          });
          navigation.navigate('ProcessPhotos', { sourceNoteId: targetNote.id });
        }}
        styles={styles}
      />
    ),
    [handleOpenNotePhotos, loadingPhotoNoteId, navigation, styles],
  );
  const renderNoteItem = useCallback<ListRenderItem<NoteOverviewItemRecord>>(
    ({ item }) => renderNoteCard(item),
    [renderNoteCard],
  );

  const notesListHeader = (
    <View style={styles.listHeader}>
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

      {browseState.pendingRows.length > 0 ? (
        <View style={styles.headerStack}>
          <Text variant="label">Pending notes</Text>
          {browseState.pendingRows.map((row) => {
            return (
              <PendingQueuedWriteRow
                key={row.id}
                createdAt={row.createdAt}
                description={row.description}
                idempotencyKey={row.idempotencyKey}
                lastError={row.lastError}
                status={row.status}
                title={row.title}
              />
            );
          })}
        </View>
      ) : null}

      {actionErrorMessage ? (
        <ErrorState
          analyticsProps={buildBrowseAnalyticsPayload()}
          analyticsSource="NotesScreen"
          description={actionErrorMessage}
          title="Notes action failed"
        />
      ) : null}

      <PageErrorToast
        analyticsProps={buildBrowseAnalyticsPayload()}
        analyticsSource="NotesScreen"
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
    </View>
  );

  const notesListEmptyComponent = (() => {
    if (browseState.isLoading) {
      return (
        <View style={styles.body}>
          <Skeleton height={20} />
          <Skeleton height={20} />
          <Skeleton height={20} />
        </View>
      );
    }

    if (browseState.hasBlockingError) {
      return (
        <ErrorState
          analyticsProps={buildBrowseAnalyticsPayload()}
          analyticsSource="NotesScreen"
          description="Could not load notes."
          onRetry={() => {
            void baseNotesQuery.refetch();
          }}
          title="Notes unavailable"
        />
      );
    }

    if (notes.length === 0) {
      return hasSearch ? (
        <EmptyState
          actionLabel="Clear Search"
          analyticsProps={buildBrowseAnalyticsPayload()}
          analyticsSource="NotesScreen"
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
          analyticsProps={buildBrowseAnalyticsPayload()}
          analyticsSource="NotesScreen"
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
      );
    }

    return null;
  })();

  const notesListFooter =
    !browseState.isLoading &&
    !browseState.hasBlockingError &&
    browseState.hasItems &&
    browseState.hasNextPage ? (
      <FeatureListFooter
        isFetchingNextPage={browseState.isFetchingNextPage}
        label="Load more notes"
        onLoadMore={browseState.onEndReached}
      />
    ) : null;

  return (
    <FeatureDetailScreenScaffold
      bodyStyle={styles.screenBody}
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
      scroll={false}
      screenBackgroundTone="surface"
      subtitle="View, edit, or delete your saved notes."
      title="My Notes"
    >
      <FlatList
        contentContainerStyle={styles.listContent}
        data={browseState.isLoading || browseState.hasBlockingError ? [] : notes}
        initialNumToRender={10}
        ItemSeparatorComponent={() => <View style={styles.noteSeparator} />}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(note) => note.id}
        ListEmptyComponent={notesListEmptyComponent}
        ListFooterComponent={notesListFooter}
        ListHeaderComponent={notesListHeader}
        maxToRenderPerBatch={10}
        onRefresh={browseState.onRefresh}
        refreshing={browseState.isRefreshing}
        removeClippedSubviews
        renderItem={renderNoteItem}
        style={styles.list}
        windowSize={7}
      />

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
