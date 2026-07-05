import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { useSync } from '../providers/SyncProvider';
import { applyQueuedFeatureWritePatch } from '../features/store/applyQueuedFeatureWritePatch';
import { useQueuedFeatureWrites } from '../features/store/useQueuedFeatureWrites';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../providers/SyncProvider', () => ({
  useSync: jest.fn(),
}));

jest.mock('../features/store/applyQueuedFeatureWritePatch', () => ({
  applyQueuedFeatureWritePatch: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseSync = useSync as jest.MockedFunction<typeof useSync>;
const mockedApplyQueuedFeatureWritePatch =
  applyQueuedFeatureWritePatch as jest.MockedFunction<typeof applyQueuedFeatureWritePatch>;

describe('useQueuedFeatureWrites', () => {
  const getQueuedMutations = jest.fn();
  const queryClient = {};
  let latestHook: ReturnType<typeof useQueuedFeatureWrites<'note.create'>> | null = null;
  let latestRefreshQueuedWrites: (() => Promise<void>) | null = null;

  function Harness({ enabled }: { enabled?: boolean }) {
    latestHook = useQueuedFeatureWrites<'note.create'>(['note.create'], 100, { enabled });
    latestRefreshQueuedWrites = latestHook.refreshQueuedWrites;
    return React.createElement('HookState', {
      queuedWrites: latestHook.queuedWrites.length,
    });
  }

  beforeEach(() => {
    latestHook = null;
    latestRefreshQueuedWrites = null;
    getQueuedMutations.mockReset();
    mockedApplyQueuedFeatureWritePatch.mockReset();
    mockedUseQueryClient.mockReturnValue(queryClient as ReturnType<typeof useQueryClient>);
    mockedUseSync.mockReturnValue({
      failedCount: 0,
      getQueuedMutations,
      isSyncing: false,
      queueDepth: 0,
    } as unknown as ReturnType<typeof useSync>);
  });

  it('does not read queued mutations or patch query caches when disabled', async () => {
    await act(async () => {
      create(React.createElement(Harness, { enabled: false }));
    });

    await act(async () => {
      if (!latestRefreshQueuedWrites) {
        throw new Error('Expected refreshQueuedWrites to be available');
      }

      await latestRefreshQueuedWrites();
    });

    expect(latestHook?.queuedWrites).toEqual([]);
    expect(getQueuedMutations).not.toHaveBeenCalled();
    expect(mockedApplyQueuedFeatureWritePatch).not.toHaveBeenCalled();
  });
});
