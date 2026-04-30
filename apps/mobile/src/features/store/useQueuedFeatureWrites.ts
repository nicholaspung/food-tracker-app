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
): {
  queuedWrites: QueuedFeatureWrite<TName>[];
  refreshQueuedWrites: () => Promise<void>;
} {
  const { failedCount, getQueuedMutations, isSyncing, queueDepth } = useSync();
  const [allQueuedWrites, setAllQueuedWrites] = useState<QueuedFeatureWrite[]>([]);

  const refreshQueuedWrites = useCallback(async () => {
    try {
      const queuedMutations = await getQueuedMutations(limit);
      setAllQueuedWrites(parseQueuedFeatureWrites(queuedMutations));
    } catch (error) {
      logger.warn('[useQueuedFeatureWrites] Failed to load queued feature writes:', error);
      setAllQueuedWrites([]);
    }
  }, [getQueuedMutations, limit]);

  useEffect(() => {
    void refreshQueuedWrites();
  }, [failedCount, isSyncing, queueDepth, refreshQueuedWrites]);

  const queuedWrites = useMemo(() => {
    if (!operationNames) {
      return allQueuedWrites as QueuedFeatureWrite<TName>[];
    }

    return filterQueuedFeatureWrites(allQueuedWrites, operationNames);
  }, [allQueuedWrites, operationNames]);

  return {
    queuedWrites,
    refreshQueuedWrites,
  };
}
