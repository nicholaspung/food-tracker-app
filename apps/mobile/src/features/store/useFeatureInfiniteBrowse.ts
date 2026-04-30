import { useCallback } from 'react';

import { trackObservabilityEvent } from '../../observability';
import { usePullToRefreshState } from '../../hooks/usePullToRefreshState';

type BrowseAnalyticsPayload = Record<string, string | number | boolean | null>;

interface BrowseQueryResult<TData> {
  fetchNextPage?: () => Promise<{ data?: TData }>;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isRefetching: boolean;
  refetch: () => Promise<{ data?: TData }>;
}

export interface UseFeatureInfiniteBrowseOptions<TData> {
  analyticsSource: string;
  buildAnalyticsPayload: (overrides?: BrowseAnalyticsPayload) => BrowseAnalyticsPayload;
  getResultCountFromData: (data: TData | undefined, fallbackCount: number) => number;
  loadMoreEventPrefix?: string;
  query: BrowseQueryResult<TData>;
  refreshEventPrefix: string;
  resultCount: number;
}

export function useFeatureInfiniteBrowse<TData>({
  analyticsSource,
  buildAnalyticsPayload,
  getResultCountFromData,
  loadMoreEventPrefix,
  query,
  refreshEventPrefix,
  resultCount,
}: UseFeatureInfiniteBrowseOptions<TData>) {
  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(query.isRefetching);
  const isFetchingNextPage = Boolean(query.isFetchingNextPage);

  const onRefresh = useCallback(async () => {
    return runPullRefresh(async () => {
      const resultCountBefore = resultCount;
      trackObservabilityEvent(`${refreshEventPrefix}_STARTED`, buildAnalyticsPayload({
        resultCountBefore,
      }));

      try {
        const result = await query.refetch();
        const resultCountAfter = getResultCountFromData(result.data, resultCountBefore);
        trackObservabilityEvent(`${refreshEventPrefix}_COMPLETED`, buildAnalyticsPayload({
          resultCountBefore,
          resultCountAfter,
          deltaCount: resultCountAfter - resultCountBefore,
        }));
      } catch (error) {
        trackObservabilityEvent(`${refreshEventPrefix}_FAILED`, buildAnalyticsPayload({
          resultCountBefore,
          errorType: error instanceof Error ? error.name : 'unknown_error',
        }));
        throw error;
      }
    });
  }, [
    buildAnalyticsPayload,
    getResultCountFromData,
    query,
    refreshEventPrefix,
    resultCount,
    runPullRefresh,
  ]);

  const onEndReached = useCallback(async () => {
    if (!query.fetchNextPage || !query.hasNextPage || query.isFetchingNextPage) {
      return undefined;
    }

    const resultCountBefore = resultCount;
    if (loadMoreEventPrefix) {
      trackObservabilityEvent(`${loadMoreEventPrefix}_STARTED`, buildAnalyticsPayload({
        resultCountBefore,
      }));
    }

    try {
      const result = await query.fetchNextPage();
      if (loadMoreEventPrefix) {
        const resultCountAfter = getResultCountFromData(result.data, resultCountBefore);
        trackObservabilityEvent(`${loadMoreEventPrefix}_COMPLETED`, buildAnalyticsPayload({
          resultCountBefore,
          resultCountAfter,
          deltaCount: resultCountAfter - resultCountBefore,
        }));
      }
    } catch (error) {
      if (loadMoreEventPrefix) {
        trackObservabilityEvent(`${loadMoreEventPrefix}_FAILED`, buildAnalyticsPayload({
          resultCountBefore,
          errorType: error instanceof Error ? error.name : 'unknown_error',
        }));
      }
      throw error;
    }
  }, [
    buildAnalyticsPayload,
    getResultCountFromData,
    loadMoreEventPrefix,
    query,
    resultCount,
  ]);

  return {
    analyticsSource,
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage,
    isRefreshing: isPullRefreshing,
    onEndReached,
    onRefresh,
  };
}
