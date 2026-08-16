import { QueryClient } from '@tanstack/react-query';

import { applyQueuedFeatureWriteBrowseProjection } from '../features/store/queuedFeatureWriteBrowseProjection';
import { billsQueryKeys } from '../features/store/billsQuery';
import { homeFeedQueryKeys } from '../features/store/homeFeedQuery';
import { notesQueryKeys } from '../features/store/notesQuery';
import { restaurantListQueryKeys } from '../features/store/restaurantListQuery';
import type { QueuedFeatureWrite } from '../features/store/queuedFeatureWrites';

function buildQueuedWrite(
  overrides: Partial<QueuedFeatureWrite> & Pick<QueuedFeatureWrite, 'operationName' | 'payload'>,
): QueuedFeatureWrite {
  return {
    id: `queue-${overrides.operationName}`,
    status: 'pending',
    createdAt: Date.parse('2026-04-29T12:00:00.000Z'),
    idempotencyKey: `idem-${overrides.operationName}`,
    lastError: null,
    ...overrides,
  } as QueuedFeatureWrite;
}

describe('applyQueuedFeatureWriteBrowseProjection', () => {
  it('ignores non-paginated query data under patched roots', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(notesQueryKeys.summary, {
      totalCount: 1,
      draftCount: 1,
      usedCount: 0,
    });
    queryClient.setQueryData(notesQueryKeys.detail('note-1'), {
      note: {
        id: 'note-1',
        title: 'Saved',
        content: 'Existing note',
        status: 'draft',
        createdAt: '2026-04-28T00:00:00.000Z',
        updatedAt: '2026-04-28T00:00:00.000Z',
      },
      photos: [],
    });
    queryClient.setQueryData(restaurantListQueryKeys.scope('my'), {
      totalCount: 1,
    });

    expect(() =>
      applyQueuedFeatureWriteBrowseProjection(
        queryClient,
        [
          buildQueuedWrite({
            operationName: 'note.create',
            payload: {
              title: 'Queued note',
              content: 'Try the noodles',
            },
          }),
          buildQueuedWrite({
            operationName: 'list.create',
            payload: {
              name: 'Queued list',
              visibility: 'friends',
            },
          }),
        ],
        ['notes', 'restaurant-lists'],
      ),
    ).not.toThrow();

    expect(queryClient.getQueryData(notesQueryKeys.summary)).toEqual({
      totalCount: 1,
      draftCount: 1,
      usedCount: 0,
    });
    expect(queryClient.getQueryData(restaurantListQueryKeys.scope('my'))).toEqual({
      totalCount: 1,
    });
  });

  it('inserts queued notes and removes stale queued notes from paginated caches', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(notesQueryKeys.paginated('draft'), {
      pages: [
        {
          items: [
            {
              id: 'queued:note.create:stale',
              title: 'Stale',
              content: 'Old queued note',
              status: 'draft',
              createdAt: '2026-04-28T00:00:00.000Z',
              updatedAt: '2026-04-28T00:00:00.000Z',
            },
            {
              id: 'note-1',
              title: 'Saved',
              content: 'Existing note',
              status: 'draft',
              createdAt: '2026-04-28T00:00:00.000Z',
              updatedAt: '2026-04-28T00:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 20,
          totalItems: 2,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    });

    applyQueuedFeatureWriteBrowseProjection(
      queryClient,
      [
        buildQueuedWrite({
          operationName: 'note.create',
          payload: {
            title: 'Queued note',
            content: 'Try the noodles',
          },
        }),
      ],
      ['notes'],
    );

    const data = queryClient.getQueryData<{
      pages: { items: { id: string; title: string }[]; totalItems: number }[];
    }>(notesQueryKeys.paginated('draft'));

    expect(data?.pages[0]?.items.map((item) => item.id)).toEqual([
      'queued:note.create:idem-note.create',
      'note-1',
    ]);
    expect(data?.pages[0]?.totalItems).toBe(2);
  });

  it('patches queued list and bill creates into their browse caches', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(restaurantListQueryKeys.paginatedInfinite('my', ''), {
      pages: [
        {
          items: [],
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    });
    queryClient.setQueryData(billsQueryKeys.root, [{ id: 'legacy-bill', title: 'Legacy bill' }]);
    queryClient.setQueryData(billsQueryKeys.paginated('you_owe'), {
      pages: [
        {
          items: [],
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    });

    applyQueuedFeatureWriteBrowseProjection(
      queryClient,
      [
        buildQueuedWrite({
          operationName: 'list.create',
          payload: {
            name: 'Queued list',
            visibility: 'friends',
          },
        }),
        buildQueuedWrite({
          operationName: 'bill.create',
          payload: {
            title: 'Queued bill',
            restaurantName: 'Cafe',
            createdByUserId: 'user-1',
            items: [],
            participants: [],
            tax: 0,
            tip: 0,
            fees: 0,
            extrasSplitMode: 'equal',
          },
        }),
      ],
      ['restaurant-lists', 'bills'],
    );

    const listData = queryClient.getQueryData<{
      pages: { items: { id: string; name: string }[] }[];
    }>(restaurantListQueryKeys.paginatedInfinite('my', ''));
    const legacyBillData = queryClient.getQueryData<{ id: string; title: string }[]>(billsQueryKeys.root);
    const billData = queryClient.getQueryData<{
      pages: { items: { id: string; title: string }[]; totalItems: number }[];
    }>(billsQueryKeys.paginated('you_owe'));

    expect(listData?.pages[0]?.items[0]).toMatchObject({
      id: 'queued:list.create:idem-list.create',
      name: 'Queued list',
    });
    expect(legacyBillData).toEqual([{ id: 'legacy-bill', title: 'Legacy bill' }]);
    expect(billData?.pages[0]?.items[0]).toMatchObject({
      id: 'queued:bill.create:idem-bill.create',
      title: 'Queued bill',
    });
    expect(billData?.pages[0]?.totalItems).toBe(1);
  });

  it('projects only the selected browse targets', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(notesQueryKeys.paginated('draft'), {
      pages: [
        {
          items: [
            {
              id: 'queued:note.create:stale',
              title: 'Stale note',
              content: 'Old queued note',
              status: 'draft',
              createdAt: '2026-04-28T00:00:00.000Z',
              updatedAt: '2026-04-28T00:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    });
    queryClient.setQueryData(restaurantListQueryKeys.paginatedInfinite('my', ''), {
      pages: [
        {
          items: [],
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    });

    applyQueuedFeatureWriteBrowseProjection(
      queryClient,
      [
        buildQueuedWrite({
          operationName: 'list.create',
          payload: {
            name: 'Queued list',
            visibility: 'private',
          },
        }),
      ],
      ['restaurant-lists'],
    );

    const noteData = queryClient.getQueryData<{
      pages: { items: { id: string; title: string }[]; totalItems: number }[];
    }>(notesQueryKeys.paginated('draft'));
    const listData = queryClient.getQueryData<{
      pages: { items: { id: string; name: string }[] }[];
    }>(restaurantListQueryKeys.paginatedInfinite('my', ''));

    expect(noteData?.pages[0]?.items).toEqual([
      expect.objectContaining({
        id: 'queued:note.create:stale',
        title: 'Stale note',
      }),
    ]);
    expect(listData?.pages[0]?.items[0]).toMatchObject({
      id: 'queued:list.create:idem-list.create',
      name: 'Queued list',
    });
  });

  it('projects queued visit creates into Home feed browse caches', () => {
    const queryClient = new QueryClient();
    const homeFeedKey = homeFeedQueryKeys.paginated('user-1', 'mine', 'visits', 'created', 'ramen');
    queryClient.setQueryData(homeFeedKey, {
      pages: [
        {
          items: [
            {
              id: 'visit-1',
              source: 'visit',
              eventAt: '2026-04-28T00:00:00.000Z',
              visit: {
                id: 'visit-1',
                restaurantName: 'Saved ramen',
                visitedAt: '2026-04-28T00:00:00.000Z',
                items: [],
              },
            },
          ],
        },
      ],
      pageParams: [undefined],
    });

    applyQueuedFeatureWriteBrowseProjection(
      queryClient,
      [
        buildQueuedWrite({
          operationName: 'visit.create',
          payload: {
            restaurantId: 'restaurant-1',
            restaurantName: 'Ramen Shop',
            items: [
              {
                name: 'Shoyu ramen',
                rating: 5,
              },
            ],
          },
        }),
      ],
      ['home-feed'],
    );

    const data = queryClient.getQueryData<{
      pages: { items: { id: string; source: string }[] }[];
    }>(homeFeedKey);

    expect(data?.pages[0]?.items.map((item) => item.id)).toEqual([
      'queued:visit.create:idem-visit.create',
      'visit-1',
    ]);
  });
});
