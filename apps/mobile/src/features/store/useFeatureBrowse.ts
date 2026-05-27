import { useCallback, useMemo } from 'react';

import { usePullToRefreshState } from '../../hooks/usePullToRefreshState';
import type { QueuedMutation } from '../../offline/types';
import { trackObservabilityEvent } from '../../observability';
import type { FeatureOutboxOperationName } from './featureOutboxOperations';
import type { QueuedFeatureWrite } from './queuedFeatureWrites';
import { useQueuedFeatureWrites } from './useQueuedFeatureWrites';

type BrowseAnalyticsPayload = Record<string, string | number | boolean | null>;

interface BrowseQueryResult<TData> {
  data: TData | undefined;
  fetchNextPage?: () => Promise<{ data?: TData }>;
  hasNextPage?: boolean;
  isError: boolean;
  isFetching: boolean;
  isFetchingNextPage?: boolean;
  isLoading: boolean;
  isRefetching: boolean;
  isSuccess: boolean;
  refetch: () => Promise<{ data?: TData }>;
}

export interface FeatureBrowsePendingRow {
  createdAt?: number;
  description?: string;
  details?: readonly { label: string; value: string }[];
  id: string;
  idempotencyKey?: string;
  lastError?: string | null;
  status: QueuedMutation['status'];
  testID?: string;
  title: string;
}

export interface UseFeatureBrowseOptions<
  TData,
  TItem,
  TOperationName extends FeatureOutboxOperationName = FeatureOutboxOperationName,
> {
  analyticsSource: string;
  buildAnalyticsPayload: (overrides?: BrowseAnalyticsPayload) => BrowseAnalyticsPayload;
  emptyWhen?: (items: readonly TItem[]) => boolean;
  enabled?: boolean;
  extraRefreshError?: boolean;
  getHasCachedData?: (data: TData | undefined) => boolean;
  getItemsFromData: (data: TData | undefined) => readonly TItem[];
  getResultCountFromData?: (data: TData | undefined, fallbackCount: number) => number;
  getTotalItemsFromData?: (data: TData | undefined, items: readonly TItem[]) => number;
  loadMoreEventPrefix?: string;
  pendingQueuedWriteOperationNames?: readonly TOperationName[];
  query: BrowseQueryResult<TData>;
  refreshEventPrefix: string;
  resultCount?: number;
  toPendingRow?: (write: QueuedFeatureWrite<TOperationName>) => FeatureBrowsePendingRow;
}

const EMPTY_OPERATION_NAMES: readonly FeatureOutboxOperationName[] = [];

function defaultHasCachedData<TData>(data: TData | undefined): boolean {
  return data !== undefined;
}

export function useFeatureBrowse<
  TData,
  TItem,
  TOperationName extends FeatureOutboxOperationName = FeatureOutboxOperationName,
>({
  analyticsSource,
  buildAnalyticsPayload,
  emptyWhen,
  enabled = true,
  extraRefreshError = false,
  getHasCachedData = defaultHasCachedData,
  getItemsFromData,
  getResultCountFromData,
  getTotalItemsFromData,
  loadMoreEventPrefix,
  pendingQueuedWriteOperationNames,
  query,
  refreshEventPrefix,
  resultCount,
  toPendingRow,
}: UseFeatureBrowseOptions<TData, TItem, TOperationName>) {
  const items = useMemo(() => getItemsFromData(query.data), [getItemsFromData, query.data]);
  const totalItems = getTotalItemsFromData?.(query.data, items) ?? items.length;
  const resolvedResultCount = resultCount ?? items.length;
  const hasCachedData = getHasCachedData(query.data);
  const hasBlockingError = enabled && query.isError && !hasCachedData;
  const hasRefreshError = enabled && !hasBlockingError && (query.isError || extraRefreshError);
  const hasResolvedData = enabled && query.isSuccess && !query.isFetching;
  const showEmpty = !query.isLoading && !hasBlockingError && (emptyWhen?.(items) ?? (hasResolvedData && items.length === 0));
  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(query.isRefetching);
  const { queuedWrites, refreshQueuedWrites } = useQueuedFeatureWrites(
    pendingQueuedWriteOperationNames ?? (EMPTY_OPERATION_NAMES as readonly TOperationName[]),
  );
  const pendingRows = useMemo(() => {
    if (!toPendingRow) {
      return [];
    }

    return queuedWrites.map(toPendingRow);
  }, [queuedWrites, toPendingRow]);

  const readResultCountFromData = useCallback(
    (data: TData | undefined, fallbackCount: number) => {
      return getResultCountFromData?.(data, fallbackCount) ?? getItemsFromData(data).length;
    },
    [getItemsFromData, getResultCountFromData],
  );

  const onRefresh = useCallback(async () => {
    return runPullRefresh(async () => {
      const resultCountBefore = resolvedResultCount;
      trackObservabilityEvent(`${refreshEventPrefix}_STARTED`, buildAnalyticsPayload({
        resultCountBefore,
      }));

      try {
        const result = await query.refetch();
        const resultCountAfter = readResultCountFromData(result.data, resultCountBefore);
        trackObservabilityEvent(`${refreshEventPrefix}_COMPLETED`, buildAnalyticsPayload({
          resultCountBefore,
          resultCountAfter,
          deltaCount: resultCountAfter - resultCountBefore,
        }));
        await refreshQueuedWrites();
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
    query,
    readResultCountFromData,
    refreshEventPrefix,
    refreshQueuedWrites,
    resolvedResultCount,
    runPullRefresh,
  ]);

  const onEndReached = useCallback(async () => {
    if (!query.fetchNextPage || !query.hasNextPage || query.isFetchingNextPage) {
      return undefined;
    }

    const resultCountBefore = resolvedResultCount;
    if (loadMoreEventPrefix) {
      trackObservabilityEvent(`${loadMoreEventPrefix}_STARTED`, buildAnalyticsPayload({
        resultCountBefore,
      }));
    }

    try {
      const result = await query.fetchNextPage();
      if (loadMoreEventPrefix) {
        const resultCountAfter = readResultCountFromData(result.data, resultCountBefore);
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

    return undefined;
  }, [
    buildAnalyticsPayload,
    loadMoreEventPrefix,
    query,
    readResultCountFromData,
    resolvedResultCount,
  ]);

  return {
    analyticsProps: buildAnalyticsPayload(),
    analyticsSource,
    hasBlockingError,
    hasItems: items.length > 0,
    hasNextPage: Boolean(query.hasNextPage),
    hasRefreshError,
    hasResolvedData,
    isFetchingNextPage: Boolean(query.isFetchingNextPage),
    isLoading: query.isLoading,
    isRefreshing: isPullRefreshing,
    items,
    onEndReached,
    onRefresh,
    pendingRows,
    showEmpty,
    totalItems,
  };
}
