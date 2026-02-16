import { useCallback } from 'react';

import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { useSync } from '../../providers/SyncProvider';

export function useQueuedWrite() {
  const { enqueueMutation } = useSync();

  const queueWrite = useCallback(
    async (operationName: string): Promise<void> => {
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
    [enqueueMutation],
  );

  return queueWrite;
}
