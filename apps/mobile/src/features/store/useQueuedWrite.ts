import { useCallback } from 'react';

import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { useConnectivity } from '../../providers/ConnectivityProvider';
import { useSync } from '../../providers/SyncProvider';

export function useQueuedWrite() {
  const { enqueueMutation } = useSync();
  const { isOnline } = useConnectivity();

  const queueWrite = useCallback(
    async (operationName: string): Promise<void> => {
      if (!isOnline) {
        logger.warn(
          `[QueuedWrite] Skipping marker enqueue for "${operationName}" while offline. Queue a replayable payload instead.`,
        );
        return;
      }

      try {
        await enqueueMutation({
          method: 'POST',
          url: `${env.apiBaseUrl}/api/collections/users/auth-refresh`,
          headers: {
            'X-Mobile-Write-Operation': operationName,
          },
        });
      } catch (error) {
        logger.warn(`[QueuedWrite] Failed to enqueue operation "${operationName}":`, error);
        throw error;
      }
    },
    [enqueueMutation, isOnline],
  );

  return queueWrite;
}
