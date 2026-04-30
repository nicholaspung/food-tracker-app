import React from 'react';
import { act, create } from 'react-test-renderer';

import { useFeatureInfiniteBrowse } from '../features/store/useFeatureInfiniteBrowse';
import { trackObservabilityEvent } from '../observability';

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

type HookState = ReturnType<typeof useFeatureInfiniteBrowse<{ pages: { items: string[] }[] }>>;

describe('useFeatureInfiniteBrowse', () => {
  let latestHook: HookState | null = null;
  const refetch = jest.fn();
  const fetchNextPage = jest.fn();

  function Harness({
    hasNextPage = true,
    isFetchingNextPage = false,
  }: {
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
  }) {
    latestHook = useFeatureInfiniteBrowse<{ pages: { items: string[] }[] }>({
      analyticsSource: 'TestScreen',
      buildAnalyticsPayload: (overrides = {}) => ({
        source: 'TestScreen',
        resultCount: 2,
        ...overrides,
      }),
      getResultCountFromData: (data, fallbackCount) =>
        data?.pages.reduce((sum: number, page) => sum + page.items.length, 0) ?? fallbackCount,
      loadMoreEventPrefix: 'TEST_LOAD_MORE',
      query: {
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isRefetching: false,
        refetch,
      },
      refreshEventPrefix: 'TEST_REFRESH',
      resultCount: 2,
    });

    return React.createElement('HookState', {
      hasNextPage: latestHook.hasNextPage,
      isFetchingNextPage: latestHook.isFetchingNextPage,
      isRefreshing: latestHook.isRefreshing,
    });
  }

  beforeEach(() => {
    latestHook = null;
    refetch.mockReset();
    fetchNextPage.mockReset();
    (trackObservabilityEvent as jest.Mock).mockReset();
  });

  it('tracks refresh start and completion with result deltas', async () => {
    refetch.mockResolvedValue({
      data: {
        pages: [{ items: ['a', 'b', 'c'] }],
      },
    });

    await act(async () => {
      create(React.createElement(Harness));
    });

    await act(async () => {
      await latestHook?.onRefresh();
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(trackObservabilityEvent).toHaveBeenCalledWith('TEST_REFRESH_STARTED', {
      source: 'TestScreen',
      resultCount: 2,
      resultCountBefore: 2,
    });
    expect(trackObservabilityEvent).toHaveBeenCalledWith('TEST_REFRESH_COMPLETED', {
      source: 'TestScreen',
      resultCount: 2,
      resultCountBefore: 2,
      resultCountAfter: 3,
      deltaCount: 1,
    });
  });

  it('guards load more when there is no next page or a page is already fetching', async () => {
    await act(async () => {
      create(React.createElement(Harness, { hasNextPage: false }));
    });

    await act(async () => {
      await latestHook?.onEndReached();
    });

    await act(async () => {
      create(React.createElement(Harness, { isFetchingNextPage: true }));
    });

    await act(async () => {
      await latestHook?.onEndReached();
    });

    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});
