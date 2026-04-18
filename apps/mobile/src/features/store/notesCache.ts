import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { NoteRecord } from '../models';
import type { NoteDetailRecord, NoteOverviewItemRecord, NoteOverviewPage } from './featureStore';
import { notesQueryKeys } from './notesQuery';

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
  const directNote = queryClient.getQueryData<NoteRecord | null>(['feature', 'note', noteId]);
  if (directNote) {
    return directNote;
  }

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

  queryClient.setQueryData<NoteRecord | null>(['feature', 'note', noteId], (currentNote) =>
    currentNote ? buildPromotedNote(currentNote, usedAt) : currentNote,
  );

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
