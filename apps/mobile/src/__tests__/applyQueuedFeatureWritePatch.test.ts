import { QueryClient } from '@tanstack/react-query';

import { applyQueuedFeatureWritePatch } from '../features/store/applyQueuedFeatureWritePatch';
import { billsQueryKeys } from '../features/store/billsQuery';
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

describe('applyQueuedFeatureWritePatch', () => {
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

    applyQueuedFeatureWritePatch(queryClient, [
      buildQueuedWrite({
        operationName: 'note.create',
        payload: {
          title: 'Queued note',
          content: 'Try the noodles',
        },
      }),
    ]);

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
    queryClient.setQueryData(restaurantListQueryKeys.paginated('my', ''), {
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
    queryClient.setQueryData(billsQueryKeys.root, []);

    applyQueuedFeatureWritePatch(queryClient, [
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
    ]);

    const listData = queryClient.getQueryData<{
      pages: { items: { id: string; name: string }[] }[];
    }>(restaurantListQueryKeys.paginated('my', ''));
    const billData = queryClient.getQueryData<{ id: string; title: string }[]>(billsQueryKeys.root);

    expect(listData?.pages[0]?.items[0]).toMatchObject({
      id: 'queued:list.create:idem-list.create',
      name: 'Queued list',
    });
    expect(billData?.[0]).toMatchObject({
      id: 'queued:bill.create:idem-bill.create',
      title: 'Queued bill',
    });
  });
});
