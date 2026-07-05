import { useCallback, useEffect, useMemo, useState } from 'react';

import { logger } from '../../lib/logger';
import { useSync } from '../../providers/SyncProvider';
import {
  filterQueuedFeatureWrites,
  parseQueuedFeatureWrites,
  type QueuedFeatureWrite,
} from './queuedFeatureWrites';
import type { FeatureOutboxOperationName } from './featureOutboxOperations';

export function useQueuedFeatureWrites<TName extends FeatureOutboxOperationName>(
  operationNames?: readonly TName[],
  limit = 100,
  options: { enabled?: boolean } = {},
): {
  queuedWrites: QueuedFeatureWrite<TName>[];
  refreshQueuedWrites: () => Promise<void>;
} {
  const enabled = options.enabled ?? true;
  const { failedCount, getQueuedMutations, isSyncing, queueDepth } = useSync();
  const [allQueuedWrites, setAllQueuedWrites] = useState<QueuedFeatureWrite[]>([]);

  const refreshQueuedWrites = useCallback(async () => {
    if (!enabled) {
      return;
    }

    try {
      const queuedMutations = await getQueuedMutations(limit);
      const parsedQueuedWrites = parseQueuedFeatureWrites(queuedMutations);
      setAllQueuedWrites(parsedQueuedWrites);
    } catch (error) {
      logger.warn('[useQueuedFeatureWrites] Failed to load queued feature writes:', error);
      setAllQueuedWrites([]);
    }
  }, [enabled, getQueuedMutations, limit]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void refreshQueuedWrites();
  }, [enabled, failedCount, isSyncing, queueDepth, refreshQueuedWrites]);

  const queuedWrites = useMemo(() => {
    if (!enabled) {
      return [];
    }

    if (!operationNames) {
      return allQueuedWrites as QueuedFeatureWrite<TName>[];
    }

    return filterQueuedFeatureWrites(allQueuedWrites, operationNames);
  }, [allQueuedWrites, enabled, operationNames]);

  return {
    queuedWrites,
    refreshQueuedWrites,
  };
}
