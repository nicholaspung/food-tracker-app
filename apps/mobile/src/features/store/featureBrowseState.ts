export interface ResolveFeatureBrowseStateOptions<TItem> {
  emptyWhen?: (items: readonly TItem[]) => boolean;
  enabled?: boolean;
  extraRefreshError?: boolean;
  hasCachedData: boolean;
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
  isSuccess: boolean;
  items: readonly TItem[];
}

export interface FeatureBrowseState {
  hasBlockingError: boolean;
  hasItems: boolean;
  hasRefreshError: boolean;
  hasResolvedData: boolean;
  isLoading: boolean;
  showEmpty: boolean;
}

export function resolveFeatureBrowseState<TItem>({
  emptyWhen,
  enabled = true,
  extraRefreshError = false,
  hasCachedData,
  isError,
  isFetching,
  isLoading,
  isSuccess,
  items,
}: ResolveFeatureBrowseStateOptions<TItem>): FeatureBrowseState {
  const hasBlockingError = enabled && isError && !hasCachedData;
  const hasRefreshError = enabled && !hasBlockingError && (isError || extraRefreshError);
  const hasResolvedData = enabled && isSuccess && !isFetching;
  const showEmpty = !isLoading && !hasBlockingError && (emptyWhen?.(items) ?? (hasResolvedData && items.length === 0));

  return {
    hasBlockingError,
    hasItems: items.length > 0,
    hasRefreshError,
    hasResolvedData,
    isLoading,
    showEmpty,
  };
}
