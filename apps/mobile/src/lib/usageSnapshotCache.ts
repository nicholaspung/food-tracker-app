import type { MonthlyUsageSnapshot } from '../features/store/usageLimitsGateway';
import { localPersistence } from '../localPersistence';

export interface CachedUsageSnapshot {
  snapshot: MonthlyUsageSnapshot;
  cachedAt: string;
}

function buildCacheKey(userId: string, scope?: string | null): string {
  return localPersistence.usageSnapshots.buildStorageKey(userId, scope);
}

export async function readUsageSnapshotCache(
  userId: string,
  scope?: string | null,
): Promise<CachedUsageSnapshot | null> {
  if (!userId) {
    return null;
  }

  const raw = await localPersistence.usageSnapshots.storage.getItem(buildCacheKey(userId, scope));
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

  await localPersistence.usageSnapshots.storage.setItem(buildCacheKey(userId, scope), JSON.stringify(payload));
}
