import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { logger } from '../../lib/logger';
import type { QueuedMutation } from '../../offline/types';
import { useSync } from '../../providers/SyncProvider';
import {
  filterQueuedFeatureWrites,
  parseQueuedFeatureWrites,
  type QueuedFeatureWrite,
} from './queuedFeatureWrites';
import type { FeatureOutboxOperationName } from './featureOutboxOperations';

export async function refreshQueuedFeatureWriteSnapshot(input: {
  applyLatest: (writes: QueuedFeatureWrite[]) => void;
  generationRef: { current: number };
  onError: (error: unknown) => void;
  readLimit: number;
  readQueuedMutations: (limit: number) => Promise<QueuedMutation[]>;
}): Promise<void> {
  const refreshGeneration = input.generationRef.current + 1;
  input.generationRef.current = refreshGeneration;
  try {
    const queuedMutations = await input.readQueuedMutations(input.readLimit);
    const parsedQueuedWrites = parseQueuedFeatureWrites(queuedMutations);
    if (refreshGeneration === input.generationRef.current) {
      input.applyLatest(parsedQueuedWrites);
    }
  } catch (error) {
    input.onError(error);
  }
}

export function useQueuedFeatureWrites<TName extends FeatureOutboxOperationName>(
  operationNames?: readonly TName[],
  limit: number | 'all' = 100,
  options: { enabled?: boolean } = {},
): {
  queuedWrites: QueuedFeatureWrite<TName>[];
  refreshQueuedWrites: () => Promise<void>;
} {
  const enabled = options.enabled ?? true;
  const {
    failedCount,
    getQueuedMutations,
    isSyncing,
    queueDepth,
  } = useSync();
  const readLimit = limit === 'all' ? Math.max(1, queueDepth) : limit;
  const [allQueuedWrites, setAllQueuedWrites] = useState<QueuedFeatureWrite[]>([]);
  const refreshGenerationRef = useRef(0);

  const refreshQueuedWrites = useCallback(async () => {
    if (!enabled) {
      return;
    }

    await refreshQueuedFeatureWriteSnapshot({
      applyLatest: setAllQueuedWrites,
      generationRef: refreshGenerationRef,
      onError: (error) => {
        logger.warn('[useQueuedFeatureWrites] Failed to load queued feature writes:', error);
      },
      readLimit,
      readQueuedMutations: getQueuedMutations,
    });
  }, [enabled, getQueuedMutations, readLimit]);

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
