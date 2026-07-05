import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useSync } from '../providers/SyncProvider';
import { parseQueuedFeatureWrites } from '../features/store/queuedFeatureWrites';
import { useQueuedFeatureWrites } from '../features/store/useQueuedFeatureWrites';

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

  function Harness({ enabled }: { enabled?: boolean }) {
    latestHook = useQueuedFeatureWrites<'note.create'>(['note.create'], 100, { enabled });
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

  it('renders enabled without requiring a query client or projecting browse caches', async () => {
    expect(parseQueuedFeatureWrites([queuedNoteMutation])).toHaveLength(1);
    getQueuedMutations.mockResolvedValue([queuedNoteMutation]);

    await act(async () => {
      renderer = create(React.createElement(EnabledHarness));
    });

    expect(latestHook?.queuedWrites).toEqual([]);
  });
});
