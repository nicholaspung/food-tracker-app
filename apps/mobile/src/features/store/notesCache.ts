import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import type { NoteRecord } from '../models';
import type { NoteCountSummary, NoteDetailRecord, NoteOverviewItemRecord, NoteOverviewPage } from './featureStore';
import {
  isPaginatedNotesQueryKey,
  matchesNoteSearch,
  notePhotosQueryKeys,
  notesQueryKeys,
} from './notesQuery';

interface PromoteCachedNoteToUsedInput {
  noteId: string;
  usedAt: string;
}

type NotesInfiniteData = InfiniteData<NoteOverviewPage, unknown>;

function parseTimestamp(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function adjustSummaryForDeletedNote(
  summary: NoteCountSummary | undefined,
  noteStatus: NoteRecord['status'],
): NoteCountSummary | undefined {
  if (!summary) {
    return summary;
  }

  return {
    ...summary,
    allCount: Math.max(summary.allCount - 1, 0),
    draftCount:
      noteStatus === 'draft'
        ? Math.max(summary.draftCount - 1, 0)
        : summary.draftCount,
    usedCount:
      noteStatus === 'used'
        ? Math.max(summary.usedCount - 1, 0)
        : summary.usedCount,
  };
}

function resolveNextTotalPages(totalItems: number | undefined, pageSize: number, currentTotalPages?: number): number | undefined {
  if (totalItems === undefined || !Number.isFinite(pageSize) || pageSize <= 0) {
    return currentTotalPages;
  }

  if (totalItems === 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function resolveCachedNoteSearchQuery(queryKey: QueryKey): string {
  return Array.isArray(queryKey) && queryKey.length === 5 && typeof queryKey[4] === 'string'
    ? queryKey[4]
    : '';
}

function shouldAdjustNotesQueryForDeletedNote(queryKey: QueryKey, note: NoteRecord): boolean {
  if (!isPaginatedNotesQueryKey(queryKey)) {
    return false;
  }

  const statusFilter = queryKey[3];
  if (statusFilter !== 'all' && statusFilter !== note.status) {
    return false;
  }

  return matchesNoteSearch(note, resolveCachedNoteSearchQuery(queryKey));
}

function removeCachedNoteFromInfiniteData(
  currentData: NotesInfiniteData | undefined,
  noteId: string,
  noteStatus: NoteRecord['status'],
  shouldAdjustCounts: boolean,
): NotesInfiniteData | undefined {
  if (!currentData) {
    return currentData;
  }

  return {
    ...currentData,
    pages: currentData.pages.map((page) => {
      const nextTotalItems =
        shouldAdjustCounts && typeof page.totalItems === 'number'
          ? Math.max(page.totalItems - 1, 0)
          : page.totalItems;

      return {
        ...page,
        items: page.items.filter((item) => item.id !== noteId),
        summary: shouldAdjustCounts ? adjustSummaryForDeletedNote(page.summary, noteStatus) : page.summary,
        totalItems: nextTotalItems,
        totalPages: resolveNextTotalPages(nextTotalItems, page.pageSize, page.totalPages),
      };
    }),
  };
}

function sortNotesByCreatedAtDesc<T extends Pick<NoteRecord, 'createdAt' | 'updatedAt'>>(notes: readonly T[]): T[] {
  return [...notes].sort((left, right) => {
    const createdDiff = parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt);
    if (createdDiff !== 0) {
      return createdDiff;
    }

    return parseTimestamp(right.updatedAt) - parseTimestamp(left.updatedAt);
  });
}

function buildPromotedNote<T extends NoteRecord>(note: T, usedAt: string): T {
  return {
    ...note,
    status: 'used',
    usedAt: note.usedAt ?? usedAt,
  };
}

function findNoteInPages(
  data: NotesInfiniteData | undefined,
  noteId: string,
): NoteOverviewItemRecord | undefined {
  return data?.pages.flatMap((page) => page.items).find((item) => item.id === noteId);
}

function isNotePresentInPages(data: NotesInfiniteData | undefined, noteId: string): boolean {
  return Boolean(findNoteInPages(data, noteId));
}

function adjustFirstPageSummary(
  data: NotesInfiniteData | undefined,
  shouldAdjust: boolean,
): NotesInfiniteData | undefined {
  const firstPage = data?.pages[0];
  const firstPageSummary = firstPage?.summary;

  if (!data || !shouldAdjust || !firstPage || !firstPageSummary) {
    return data;
  }

  const [, ...restPages] = data.pages;
  return {
    ...data,
    pages: [
      {
        ...firstPage,
        summary: {
          ...firstPageSummary,
          draftCount: Math.max(firstPageSummary.draftCount - 1, 0),
          usedCount: firstPageSummary.usedCount + 1,
        },
      },
      ...restPages,
    ],
  };
}

function findCachedNote(queryClient: QueryClient, noteId: string): NoteRecord | undefined {
  const detailNote = queryClient.getQueryData<NoteDetailRecord | null>(notesQueryKeys.detail(noteId))?.note;
  if (detailNote) {
    return detailNote;
  }

  return (
    findNoteInPages(queryClient.getQueryData<NotesInfiniteData>(notesQueryKeys.paginated('draft')), noteId) ??
    findNoteInPages(queryClient.getQueryData<NotesInfiniteData>(notesQueryKeys.paginated('all')), noteId) ??
    findNoteInPages(queryClient.getQueryData<NotesInfiniteData>(notesQueryKeys.paginated('used')), noteId)
  );
}

export function promoteCachedNoteToUsed(
  queryClient: QueryClient,
  { noteId, usedAt }: PromoteCachedNoteToUsedInput,
): void {
  const draftData = queryClient.getQueryData<NotesInfiniteData>(notesQueryKeys.paginated('draft'));
  const existingNote = findCachedNote(queryClient, noteId);
  const shouldAdjustSummary = existingNote?.status === 'draft' || isNotePresentInPages(draftData, noteId);
  const promotedNote = existingNote ? buildPromotedNote(existingNote, usedAt) : null;

  queryClient.setQueryData<NoteDetailRecord | null>(notesQueryKeys.detail(noteId), (currentDetail) =>
    currentDetail?.note
      ? {
          ...currentDetail,
          note: buildPromotedNote(currentDetail.note, usedAt),
        }
      : currentDetail,
  );

  queryClient.setQueryData<NotesInfiniteData | undefined>(notesQueryKeys.paginated('draft'), (currentData) => {
    if (!currentData) {
      return currentData;
    }

    const nextData = {
      ...currentData,
      pages: currentData.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) => item.id !== noteId),
      })),
    };

    return adjustFirstPageSummary(nextData, shouldAdjustSummary);
  });

  queryClient.setQueryData<NotesInfiniteData | undefined>(notesQueryKeys.paginated('all'), (currentData) => {
    if (!currentData) {
      return currentData;
    }

    const nextData = {
      ...currentData,
      pages: currentData.pages.map((page) => ({
        ...page,
        items: sortNotesByCreatedAtDesc(
          page.items.map((item) => (item.id === noteId ? buildPromotedNote(item, usedAt) : item)),
        ),
      })),
    };

    return adjustFirstPageSummary(nextData, shouldAdjustSummary);
  });

  queryClient.setQueryData<NotesInfiniteData | undefined>(notesQueryKeys.paginated('used'), (currentData) => {
    if (!currentData) {
      return currentData;
    }

    const hasExistingUsedItem = isNotePresentInPages(currentData, noteId);
    const nextPages = currentData.pages.map((page, pageIndex) => {
      const nextItems = page.items.map((item) => (item.id === noteId ? buildPromotedNote(item, usedAt) : item));

      if (pageIndex === 0 && !hasExistingUsedItem && promotedNote) {
        return {
          ...page,
          items: sortNotesByCreatedAtDesc([promotedNote, ...nextItems]),
        };
      }

      return {
        ...page,
        items: sortNotesByCreatedAtDesc(nextItems),
      };
    });

    return adjustFirstPageSummary(
      {
        ...currentData,
        pages: nextPages,
      },
      shouldAdjustSummary,
    );
  });
}

export function removeCachedNote(queryClient: QueryClient, noteId: string): void {
  const existingNote = findCachedNote(queryClient, noteId);

  queryClient.removeQueries({ queryKey: notesQueryKeys.detail(noteId) });
  queryClient.removeQueries({ queryKey: notePhotosQueryKeys.detail(noteId) });

  if (!existingNote) {
    return;
  }

  const notesQueryData = queryClient.getQueriesData<NotesInfiniteData>({
    queryKey: notesQueryKeys.root,
  });

  for (const [queryKey, currentData] of notesQueryData) {
    if (!isPaginatedNotesQueryKey(queryKey)) {
      continue;
    }

    const hasLoadedNote = currentData?.pages.some((page) => page.items.some((item) => item.id === noteId)) === true;
    const shouldAdjustCounts = shouldAdjustNotesQueryForDeletedNote(queryKey, existingNote) || hasLoadedNote;
    if (!shouldAdjustCounts && !hasLoadedNote) {
      continue;
    }

    queryClient.setQueryData(
      queryKey,
      removeCachedNoteFromInfiniteData(currentData, noteId, existingNote.status, shouldAdjustCounts),
    );
  }

  queryClient.setQueryData<NoteCountSummary | undefined>(notesQueryKeys.summary, (currentSummary) =>
    adjustSummaryForDeletedNote(currentSummary, existingNote.status),
  );
}
