import { useCallback } from 'react';

import { trackObservabilityEvent } from '../../observability';
import { useConnectivity } from '../../providers/ConnectivityProvider';

export function useQueuedWrite() {
  const { isOnline } = useConnectivity();

  return useCallback(
    async (operationName: string): Promise<void> => {
      // Preserve the legacy hook contract for online call sites without generating
      // a second marker request. Offline-capable flows should queue replayable
      // payloads separately through the outbox helpers.
      trackObservabilityEvent('ONLINE_WRITE_MARKED', {
        source: 'useQueuedWrite',
        operationName,
        isOnline,
      });
    },
    [isOnline],
  );
}
