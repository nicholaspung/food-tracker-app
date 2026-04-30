import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { logger } from '../../lib/logger';
import { useSync } from '../../providers/SyncProvider';
import { applyQueuedFeatureWritePatch } from './applyQueuedFeatureWritePatch';
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
  const queryClient = useQueryClient();
  const [allQueuedWrites, setAllQueuedWrites] = useState<QueuedFeatureWrite[]>([]);

  const refreshQueuedWrites = useCallback(async () => {
    try {
      const queuedMutations = await getQueuedMutations(limit);
      const parsedQueuedWrites = parseQueuedFeatureWrites(queuedMutations);
      applyQueuedFeatureWritePatch(queryClient, parsedQueuedWrites);
      setAllQueuedWrites(parsedQueuedWrites);
    } catch (error) {
      logger.warn('[useQueuedFeatureWrites] Failed to load queued feature writes:', error);
      setAllQueuedWrites([]);
    }
  }, [getQueuedMutations, limit, queryClient]);

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
