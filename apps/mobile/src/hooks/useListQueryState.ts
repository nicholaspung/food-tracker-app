import { useMemo } from 'react';
import type { InfiniteData } from '@tanstack/react-query';

interface PageWithItems<TItem> {
  items: TItem[];
  totalItems?: number;
}

interface BaseListQueryStateOptions {
  enabled?: boolean;
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
  isSuccess: boolean;
}

interface UsePaginatedQueryStateOptions<TItem> extends BaseListQueryStateOptions {
  data: InfiniteData<PageWithItems<TItem>, unknown> | undefined;
  extraRefreshError?: boolean;
}

interface UseQueryListStateOptions<TItem> extends BaseListQueryStateOptions {
  data: readonly TItem[] | undefined;
}

export function usePaginatedQueryState<TItem>({
  data,
  enabled = true,
  extraRefreshError = false,
  isError,
  isFetching,
  isLoading,
  isSuccess,
}: UsePaginatedQueryStateOptions<TItem>) {
  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const hasCachedPages = (data?.pages.length ?? 0) > 0;
  const hasBlockingError = enabled && isError && !hasCachedPages;
  const hasRefreshError = enabled && !hasBlockingError && (isError || extraRefreshError);
  const hasResolvedData = enabled && isSuccess && !isFetching;

  return {
    items,
    totalItems: data?.pages[0]?.totalItems ?? items.length,
    hasBlockingError,
    hasRefreshError,
    hasResolvedData,
    hasItems: items.length > 0,
    isLoading,
  };
}

export function useQueryListState<TItem>({
  data,
  enabled = true,
  isError,
  isFetching,
  isLoading,
  isSuccess,
}: UseQueryListStateOptions<TItem>) {
  const items = useMemo(() => data ?? [], [data]);
  const hasBlockingError = enabled && isError && data === undefined;
  const hasRefreshError = enabled && !hasBlockingError && isError;
  const hasResolvedData = enabled && isSuccess && !isFetching;

  return {
    items,
    totalItems: items.length,
    hasBlockingError,
    hasRefreshError,
    hasResolvedData,
    hasItems: items.length > 0,
    isLoading,
  };
}
