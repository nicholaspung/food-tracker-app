import React from 'react';
import { act, create } from 'react-test-renderer';

import { useFeatureBrowse } from '../features/store/useFeatureBrowse';
import { useQueuedFeatureWriteBrowseProjection } from '../features/store/queuedFeatureWriteBrowseProjection';
import { useQueuedFeatureWrites } from '../features/store/useQueuedFeatureWrites';
import { trackObservabilityEvent } from '../observability';

jest.mock('../features/store/useQueuedFeatureWrites', () => ({
  useQueuedFeatureWrites: jest.fn(),
}));

jest.mock('../features/store/queuedFeatureWriteBrowseProjection', () => ({
  useQueuedFeatureWriteBrowseProjection: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

const mockedUseQueuedFeatureWrites = useQueuedFeatureWrites as jest.MockedFunction<
  typeof useQueuedFeatureWrites
>;
const mockedUseQueuedFeatureWriteBrowseProjection =
  useQueuedFeatureWriteBrowseProjection as jest.MockedFunction<
    typeof useQueuedFeatureWriteBrowseProjection
  >;

type HookState = ReturnType<typeof useFeatureBrowse<string[], string, 'note.create'>>;

describe('useFeatureBrowse', () => {
  let latestHook: HookState | null = null;
  const refetch = jest.fn();

  function Harness({
    data,
    isError = false,
    isFetching = false,
    isLoading = false,
    isSuccess = true,
    projectQueuedWrites = false,
  }: {
    data?: string[];
    isError?: boolean;
    isFetching?: boolean;
    isLoading?: boolean;
    isSuccess?: boolean;
    projectQueuedWrites?: boolean;
  }) {
    latestHook = useFeatureBrowse<string[], string, 'note.create'>({
      analyticsSource: 'TestScreen',
      buildAnalyticsPayload: (overrides = {}) => ({
        source: 'TestScreen',
        resultCount: data?.length ?? 0,
        ...overrides,
      }),
      getItemsFromData: (queryData) => queryData ?? [],
      pendingQueuedWriteOperationNames: ['note.create'],
      queuedWriteBrowseProjectionTargets: projectQueuedWrites ? ['notes'] : undefined,
      query: {
        data,
        isError,
        isFetching,
        isLoading,
        isRefetching: false,
        isSuccess,
        refetch,
      },
      refreshEventPrefix: 'TEST_REFRESH',
      toPendingRow: (write) => ({
        id: write.id,
        createdAt: write.createdAt,
        description: write.payload.content,
        idempotencyKey: write.idempotencyKey,
        lastError: write.lastError,
        status: write.status,
        title: 'Queued note',
      }),
    });

    return React.createElement('HookState', {
      hasBlockingError: latestHook.hasBlockingError,
      hasRefreshError: latestHook.hasRefreshError,
      isLoading: latestHook.isLoading,
      showEmpty: latestHook.showEmpty,
    });
  }

  function NoQueuedWritesHarness({ data }: { data?: string[] }) {
    latestHook = useFeatureBrowse<string[], string, 'note.create'>({
      analyticsSource: 'TestScreen',
      buildAnalyticsPayload: (overrides = {}) => ({
        source: 'TestScreen',
        resultCount: data?.length ?? 0,
        ...overrides,
      }),
      getItemsFromData: (queryData) => queryData ?? [],
      query: {
        data,
        isError: false,
        isFetching: false,
        isLoading: false,
        isRefetching: false,
        isSuccess: true,
        refetch,
      },
      refreshEventPrefix: 'TEST_REFRESH',
    });

    return React.createElement('HookState', {
      showEmpty: latestHook.showEmpty,
    });
  }

  beforeEach(() => {
    latestHook = null;
    refetch.mockReset();
    (trackObservabilityEvent as jest.Mock).mockReset();
    mockedUseQueuedFeatureWriteBrowseProjection.mockReset();
    mockedUseQueuedFeatureWrites.mockReturnValue({
      queuedWrites: [],
      refreshQueuedWrites: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('exposes loading and empty states', async () => {
    await act(async () => {
      create(React.createElement(Harness, { isLoading: true, isSuccess: false }));
    });

    expect(latestHook?.isLoading).toBe(true);
    expect(latestHook?.showEmpty).toBe(false);

    await act(async () => {
      create(React.createElement(Harness, { data: [] }));
    });

    expect(latestHook?.isLoading).toBe(false);
    expect(latestHook?.showEmpty).toBe(true);
  });

  it('treats errors as blocking only when no cached data is available', async () => {
    await act(async () => {
      create(React.createElement(Harness, { data: undefined, isError: true, isSuccess: false }));
    });

    expect(latestHook?.hasBlockingError).toBe(true);
    expect(latestHook?.hasRefreshError).toBe(false);

    await act(async () => {
      create(React.createElement(Harness, { data: ['cached'], isError: true }));
    });

    expect(latestHook?.hasBlockingError).toBe(false);
    expect(latestHook?.hasRefreshError).toBe(true);
    expect(latestHook?.items).toEqual(['cached']);
  });

  it('tracks refresh analytics with source and result counts', async () => {
    const refreshQueuedWrites = jest.fn().mockResolvedValue(undefined);
    mockedUseQueuedFeatureWrites.mockReturnValue({
      queuedWrites: [],
      refreshQueuedWrites,
    });
    refetch.mockResolvedValue({ data: ['one', 'two', 'three'] });

    await act(async () => {
      create(React.createElement(Harness, { data: ['one'] }));
    });

    await act(async () => {
      await latestHook?.onRefresh();
    });

    expect(trackObservabilityEvent).toHaveBeenCalledWith('TEST_REFRESH_STARTED', {
      source: 'TestScreen',
      resultCount: 1,
      resultCountBefore: 1,
    });
    expect(trackObservabilityEvent).toHaveBeenCalledWith('TEST_REFRESH_COMPLETED', {
      source: 'TestScreen',
      resultCount: 1,
      resultCountBefore: 1,
      resultCountAfter: 3,
      deltaCount: 2,
    });
    expect(refreshQueuedWrites).toHaveBeenCalledTimes(1);
  });

  it('disables queued write hydration when no queued row config is provided', async () => {
    await act(async () => {
      create(React.createElement(NoQueuedWritesHarness, { data: ['one'] }));
    });

    expect(mockedUseQueuedFeatureWrites).toHaveBeenCalledWith([], 100, { enabled: false });
    expect(mockedUseQueuedFeatureWriteBrowseProjection).toHaveBeenCalledWith(
      [],
      [],
      { enabled: false },
    );
    expect(latestHook?.pendingRows).toEqual([]);
  });

  it('does not refresh queued writes during no-op browse refreshes', async () => {
    const refreshQueuedWrites = jest.fn().mockResolvedValue(undefined);
    mockedUseQueuedFeatureWrites.mockReturnValue({
      queuedWrites: [],
      refreshQueuedWrites,
    });
    refetch.mockResolvedValue({ data: ['one', 'two'] });

    await act(async () => {
      create(React.createElement(NoQueuedWritesHarness, { data: ['one'] }));
    });

    await act(async () => {
      await latestHook?.onRefresh();
    });

    expect(refreshQueuedWrites).not.toHaveBeenCalled();
  });

  it('maps pending queued writes into display rows', async () => {
    mockedUseQueuedFeatureWrites.mockReturnValue({
      queuedWrites: [
        {
          id: 'queued_1',
          operationName: 'note.create',
          payload: { content: 'Saved offline' },
          status: 'pending',
          createdAt: 123,
          idempotencyKey: 'idem_1',
          lastError: null,
        },
      ] as ReturnType<typeof useQueuedFeatureWrites<'note.create'>>['queuedWrites'],
      refreshQueuedWrites: jest.fn().mockResolvedValue(undefined),
    });

    await act(async () => {
      create(React.createElement(Harness, { data: ['one'] }));
    });

    expect(latestHook?.pendingRows).toEqual([
      {
        id: 'queued_1',
        createdAt: 123,
        description: 'Saved offline',
        idempotencyKey: 'idem_1',
        lastError: null,
        status: 'pending',
        title: 'Queued note',
      },
    ]);
  });

  it('opts into queued write browse projection only when targets are provided', async () => {
    const queuedWrites = [
      {
        id: 'queued_1',
        operationName: 'note.create',
        payload: { content: 'Saved offline' },
        status: 'pending',
        createdAt: 123,
        idempotencyKey: 'idem_1',
        lastError: null,
      },
    ] as ReturnType<typeof useQueuedFeatureWrites<'note.create'>>['queuedWrites'];
    mockedUseQueuedFeatureWrites.mockReturnValue({
      queuedWrites,
      refreshQueuedWrites: jest.fn().mockResolvedValue(undefined),
    });

    await act(async () => {
      create(React.createElement(Harness, { data: ['one'], projectQueuedWrites: true }));
    });

    expect(mockedUseQueuedFeatureWriteBrowseProjection).toHaveBeenCalledWith(
      queuedWrites,
      ['notes'],
      { enabled: true },
    );
  });
});
