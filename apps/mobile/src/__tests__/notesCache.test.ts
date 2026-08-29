import { QueryClient } from '@tanstack/react-query';

import type { NoteDetailRecord, NoteOverviewItemRecord, NoteOverviewPage } from '../features/store/featureStore';
import { promoteCachedNoteToUsed, removeCachedNote } from '../features/store/notesCache';
import { notePhotosQueryKeys, notesQueryKeys } from '../features/store/notesQuery';

function buildNote(
  id: string,
  status: 'draft' | 'used',
  createdAt: string,
  updatedAt: string,
): NoteOverviewItemRecord {
  return {
    id,
    title: `Title ${id}`,
    content: `Content ${id}`,
    status,
    createdAt,
    updatedAt,
  };
}

function buildNotesPage(
  items: NoteOverviewItemRecord[],
  overrides: Partial<NoteOverviewPage> = {},
): NoteOverviewPage {
  return {
    items,
    summary: {
      allCount: 3,
      draftCount: 2,
      usedCount: 1,
    },
    page: 1,
    pageSize: 20,
    totalItems: items.length,
    totalPages: 1,
    hasNextPage: false,
    ...overrides,
  };
}

describe('notesCache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  it('removes a note from the unused cache and updates cached summary counts', () => {
    queryClient.setQueryData(notesQueryKeys.paginated('draft'), {
      pages: [
        buildNotesPage([
          buildNote('note_1', 'draft', '2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z'),
          buildNote('note_2', 'draft', '2026-02-01T00:00:00.000Z', '2026-02-02T00:00:00.000Z'),
        ]),
      ],
      pageParams: [1],
    });

    promoteCachedNoteToUsed(queryClient, {
      noteId: 'note_1',
      usedAt: '2026-04-01T12:00:00.000Z',
    });

    const draftData = queryClient.getQueryData<{
      pages: NoteOverviewPage[];
      pageParams: number[];
    }>(notesQueryKeys.paginated('draft'));

    expect(draftData?.pages[0]?.items.map((item) => item.id)).toEqual(['note_2']);
    expect(draftData?.pages[0]?.summary).toEqual({
      allCount: 3,
      draftCount: 1,
      usedCount: 2,
    });
  });

  it('updates loaded detail and all caches to used and inserts the note into a cached used page', () => {
    const draftNote = buildNote('note_1', 'draft', '2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z');
    const existingUsedNote = buildNote('note_3', 'used', '2026-02-01T00:00:00.000Z', '2026-02-02T00:00:00.000Z');

    queryClient.setQueryData<NoteDetailRecord>(notesQueryKeys.detail('note_1'), {
      note: draftNote,
      photos: [],
    });
    queryClient.setQueryData(notesQueryKeys.paginated('all'), {
      pages: [buildNotesPage([existingUsedNote, draftNote])],
      pageParams: [1],
    });
    queryClient.setQueryData(notesQueryKeys.paginated('used'), {
      pages: [
        buildNotesPage([existingUsedNote], {
          summary: {
            allCount: 3,
            draftCount: 2,
            usedCount: 1,
          },
        }),
      ],
      pageParams: [1],
    });

    promoteCachedNoteToUsed(queryClient, {
      noteId: 'note_1',
      usedAt: '2026-04-01T12:00:00.000Z',
    });

    expect(queryClient.getQueryData<NoteDetailRecord>(notesQueryKeys.detail('note_1'))?.note).toMatchObject({
      id: 'note_1',
      status: 'used',
      usedAt: '2026-04-01T12:00:00.000Z',
    });

    const allData = queryClient.getQueryData<{
      pages: NoteOverviewPage[];
      pageParams: number[];
    }>(notesQueryKeys.paginated('all'));
    expect(allData?.pages[0]?.items.find((item) => item.id === 'note_1')).toMatchObject({
      status: 'used',
      usedAt: '2026-04-01T12:00:00.000Z',
    });

    const usedData = queryClient.getQueryData<{
      pages: NoteOverviewPage[];
      pageParams: number[];
    }>(notesQueryKeys.paginated('used'));
    expect(usedData?.pages[0]?.items.map((item) => item.id)).toEqual(['note_1', 'note_3']);
    expect(usedData?.pages[0]?.summary).toEqual({
      allCount: 3,
      draftCount: 1,
      usedCount: 2,
    });
  });

  it('removes a deleted note from cached detail, browse, and summary queries', () => {
    const deletedNote = buildNote('note_1', 'draft', '2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z');
    const remainingNote = buildNote('note_2', 'draft', '2026-02-01T00:00:00.000Z', '2026-02-02T00:00:00.000Z');
    const noteSearchKey = notesQueryKeys.paginated('all', 'note_1');

    queryClient.setQueryData<NoteDetailRecord>(notesQueryKeys.detail('note_1'), {
      note: deletedNote,
      photos: [],
    });
    queryClient.setQueryData(notePhotosQueryKeys.detail('note_1'), [{ id: 'photo_1' }]);
    queryClient.setQueryData(notesQueryKeys.paginated('draft'), {
      pages: [
        buildNotesPage([deletedNote, remainingNote], {
          summary: {
            allCount: 2,
            draftCount: 2,
            usedCount: 0,
          },
          totalItems: 2,
        }),
      ],
      pageParams: [1],
    });
    queryClient.setQueryData(noteSearchKey, {
      pages: [
        buildNotesPage([deletedNote], {
          summary: {
            allCount: 2,
            draftCount: 2,
            usedCount: 0,
          },
          totalItems: 1,
        }),
      ],
      pageParams: [1],
    });
    queryClient.setQueryData(notesQueryKeys.summary, {
      allCount: 2,
      draftCount: 2,
      usedCount: 0,
    });

    removeCachedNote(queryClient, 'note_1');

    expect(queryClient.getQueryData(notesQueryKeys.detail('note_1'))).toBeUndefined();
    expect(queryClient.getQueryData(notePhotosQueryKeys.detail('note_1'))).toBeUndefined();
    expect(
      queryClient.getQueryData<{
        pages: NoteOverviewPage[];
        pageParams: number[];
      }>(notesQueryKeys.paginated('draft'))?.pages[0],
    ).toEqual(
      expect.objectContaining({
        items: [remainingNote],
        summary: {
          allCount: 1,
          draftCount: 1,
          usedCount: 0,
        },
        totalItems: 1,
      }),
    );
    expect(
      queryClient.getQueryData<{
        pages: NoteOverviewPage[];
        pageParams: number[];
      }>(noteSearchKey)?.pages[0],
    ).toEqual(
      expect.objectContaining({
        items: [],
        summary: {
          allCount: 1,
          draftCount: 1,
          usedCount: 0,
        },
        totalItems: 0,
      }),
    );
    expect(queryClient.getQueryData(notesQueryKeys.summary)).toEqual({
      allCount: 1,
      draftCount: 1,
      usedCount: 0,
    });
  });
});
