import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { readUsageSnapshotCache, writeUsageSnapshotCache, type CachedUsageSnapshot } from '../../lib/usageSnapshotCache';
import { getAuthenticatedUserIdOrNull } from './pocketbaseGateway';
import { getMonthlyUsage, type MonthlyUsageSnapshot, type UsagePreviewTier } from './usageLimitsGateway';

interface UseMonthlyUsageResult {
  snapshot: MonthlyUsageSnapshot | null;
  cachedAt: string | null;
  isUsingCachedSnapshot: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
}

interface UseMonthlyUsageOptions {
  viewAsTier?: UsagePreviewTier | null;
}

export function useMonthlyUsage(options?: UseMonthlyUsageOptions): UseMonthlyUsageResult {
  const userId = getAuthenticatedUserIdOrNull() ?? '';
  const viewAsTier = options?.viewAsTier ?? null;
  const cacheScope = viewAsTier ?? 'actual';
  const [cachedSnapshot, setCachedSnapshot] = useState<CachedUsageSnapshot | null>(null);

  const monthlyUsageQuery = useQuery({
    queryKey: ['feature', 'usage', 'monthly', cacheScope],
    queryFn: () => getMonthlyUsage(viewAsTier ? { viewAsTier } : undefined),
    enabled: Boolean(userId),
    retry: false,
  });

  useEffect(() => {
    let isMounted = true;

    const loadCachedSnapshot = async () => {
      if (!userId) {
        if (isMounted) {
          setCachedSnapshot(null);
        }
        return;
      }

      const cached = await readUsageSnapshotCache(userId, cacheScope);
      if (isMounted) {
        setCachedSnapshot(cached);
      }
    };

    void loadCachedSnapshot();
    return () => {
      isMounted = false;
    };
  }, [cacheScope, userId]);

  useEffect(() => {
    if (!userId || !monthlyUsageQuery.data) {
      return;
    }

    const nextCached: CachedUsageSnapshot = {
      snapshot: monthlyUsageQuery.data,
      cachedAt: new Date().toISOString(),
    };

    setCachedSnapshot(nextCached);
    void writeUsageSnapshotCache(userId, monthlyUsageQuery.data, cacheScope);
  }, [cacheScope, monthlyUsageQuery.data, userId]);

  const snapshot = useMemo(
    () => monthlyUsageQuery.data ?? cachedSnapshot?.snapshot ?? null,
    [cachedSnapshot?.snapshot, monthlyUsageQuery.data],
  );

  return {
    snapshot,
    cachedAt: cachedSnapshot?.cachedAt ?? null,
    isUsingCachedSnapshot: !monthlyUsageQuery.data && Boolean(cachedSnapshot?.snapshot),
    isLoading: monthlyUsageQuery.isLoading,
    isFetching: monthlyUsageQuery.isFetching,
    isError: monthlyUsageQuery.isError && !snapshot,
    refetch: monthlyUsageQuery.refetch,
  };
}
