import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useSync } from '../providers/SyncProvider';
import type { QueuedMutation } from '../offline';
import { parseQueuedFeatureWrites } from '../features/store/queuedFeatureWrites';
import {
  refreshQueuedFeatureWriteSnapshot,
  useQueuedFeatureWrites,
} from '../features/store/useQueuedFeatureWrites';

jest.unmock('../features/store/useQueuedFeatureWrites');

jest.mock('../providers/SyncProvider', () => ({
  useSync: jest.fn(),
}));

const mockedUseSync = useSync as jest.MockedFunction<typeof useSync>;

describe('useQueuedFeatureWrites', () => {
  const getQueuedMutations = jest.fn();
  const queuedNoteMutation = {
    id: 'queue-1',
    url: 'local://feature/note.create',
    method: 'POST',
    originAccountId: 'user_1',
    headers: {
      'X-Mobile-Write-Operation': 'note.create',
    },
    body: JSON.stringify({
      content: 'Queued note',
      title: 'Draft',
    }),
    status: 'pending',
    createdAt: Date.parse('2026-04-29T12:00:00.000Z'),
    idempotencyKey: 'idem-1',
    attemptCount: 0,
    lastError: null,
    lastAttemptAt: null,
    maxAttempts: 5,
    nextRetryAt: 0,
    updatedAt: Date.parse('2026-04-29T12:00:00.000Z'),
  } as const;
  let latestHook: ReturnType<typeof useQueuedFeatureWrites<'note.create'>> | null = null;
  let renderer: ReactTestRenderer | null = null;

  function Harness({
    enabled,
    limit = 100,
  }: {
    enabled?: boolean;
    limit?: number | 'all';
  }) {
    latestHook = useQueuedFeatureWrites<'note.create'>(['note.create'], limit, { enabled });
    return React.createElement('HookState', {
      queuedWrites: latestHook.queuedWrites.length,
    });
  }

  function EnabledHarness() {
    latestHook = useQueuedFeatureWrites<'note.create'>(['note.create']);
    return React.createElement('HookState', {
      queuedWrites: latestHook.queuedWrites.length,
    });
  }

  beforeEach(() => {
    latestHook = null;
    renderer = null;
    getQueuedMutations.mockReset();
    mockedUseSync.mockReturnValue({
      failedCount: 0,
      getQueuedMutations,
      isSyncing: false,
      queueDepth: 0,
    } as unknown as ReturnType<typeof useSync>);
  });

  afterEach(async () => {
    await act(async () => {
      renderer?.unmount();
    });
  });

  it('does not read queued mutations when disabled', async () => {
    await act(async () => {
      renderer = create(React.createElement(Harness, { enabled: false }));
    });

    await act(async () => {
      if (!latestHook) {
        throw new Error('Expected refreshQueuedWrites to be available');
      }

      await latestHook.refreshQueuedWrites();
    });

    expect(latestHook?.queuedWrites).toEqual([]);
    expect(getQueuedMutations).not.toHaveBeenCalled();
  });

  it('loads queued writes without requiring a query client or projecting browse caches', async () => {
    expect(parseQueuedFeatureWrites([queuedNoteMutation])).toHaveLength(1);
    getQueuedMutations.mockResolvedValue([queuedNoteMutation]);

    await act(async () => {
      renderer = create(React.createElement(EnabledHarness));
    });

    expect(latestHook?.queuedWrites.map((write) => write.id)).toEqual(['queue-1']);
  });

  it('keeps the newest full-depth queue snapshot across out-of-order reads and read failures', async () => {
    let resolveFirstRead: ((value: QueuedMutation[]) => void) | undefined;
    let resolveSecondRead: ((value: QueuedMutation[]) => void) | undefined;
    const firstRead = new Promise<QueuedMutation[]>((resolve) => {
      resolveFirstRead = resolve;
    });
    const secondRead = new Promise<QueuedMutation[]>((resolve) => {
      resolveSecondRead = resolve;
    });
    const secondQueuedNoteMutation = {
      ...queuedNoteMutation,
      id: 'queue-2',
      idempotencyKey: 'idem-2',
    } as const;
    const readQueuedMutations = jest.fn()
      .mockReturnValueOnce(firstRead)
      .mockReturnValueOnce(secondRead)
      .mockRejectedValueOnce(new Error('Queue read failed'));
    const generationRef = { current: 0 };
    let latestWrites: ReturnType<typeof parseQueuedFeatureWrites> = [];
    const refresh = (readLimit: number) => refreshQueuedFeatureWriteSnapshot({
      applyLatest: (writes) => {
        latestWrites = writes;
      },
      generationRef,
      onError: jest.fn(),
      readLimit,
      readQueuedMutations,
    });

    const firstRefresh = refresh(1);
    const secondRefresh = refresh(2);
    expect(readQueuedMutations).toHaveBeenNthCalledWith(1, 1);
    expect(readQueuedMutations).toHaveBeenNthCalledWith(2, 2);

    resolveSecondRead?.([secondQueuedNoteMutation, queuedNoteMutation]);
    await secondRefresh;
    expect(latestWrites.map((write) => write.id)).toEqual(['queue-2', 'queue-1']);

    resolveFirstRead?.([queuedNoteMutation]);
    await firstRefresh;
    expect(latestWrites.map((write) => write.id)).toEqual(['queue-2', 'queue-1']);

    await refresh(2);
    expect(latestWrites.map((write) => write.id)).toEqual(['queue-2', 'queue-1']);
  });

});
