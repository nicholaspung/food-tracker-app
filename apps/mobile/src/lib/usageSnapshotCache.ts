import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MonthlyUsageSnapshot } from '../features/store/usageLimitsGateway';

const USAGE_SNAPSHOT_CACHE_PREFIX = 'usage.monthly.snapshot.v1';
const DEFAULT_USAGE_SNAPSHOT_SCOPE = 'actual';

export interface CachedUsageSnapshot {
  snapshot: MonthlyUsageSnapshot;
  cachedAt: string;
}

function normalizeScope(scope?: string | null): string {
  const trimmed = scope?.trim();
  return trimmed ? trimmed : DEFAULT_USAGE_SNAPSHOT_SCOPE;
}

function buildCacheKey(userId: string, scope?: string | null): string {
  return `${USAGE_SNAPSHOT_CACHE_PREFIX}:${userId}:${normalizeScope(scope)}`;
}

export async function readUsageSnapshotCache(
  userId: string,
  scope?: string | null,
): Promise<CachedUsageSnapshot | null> {
  if (!userId) {
    return null;
  }

  const raw = await AsyncStorage.getItem(buildCacheKey(userId, scope));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CachedUsageSnapshot;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (!parsed.snapshot || typeof parsed.snapshot !== 'object' || typeof parsed.cachedAt !== 'string') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function writeUsageSnapshotCache(
  userId: string,
  snapshot: MonthlyUsageSnapshot,
  scope?: string | null,
): Promise<void> {
  if (!userId) {
    return;
  }

  const payload: CachedUsageSnapshot = {
    snapshot,
    cachedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(buildCacheKey(userId, scope), JSON.stringify(payload));
}
