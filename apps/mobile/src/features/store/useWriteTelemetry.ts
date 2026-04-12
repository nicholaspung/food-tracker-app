import { useCallback } from 'react';

import { trackObservabilityEvent } from '../../observability';
import { useConnectivity } from '../../providers/ConnectivityProvider';

export function useWriteTelemetry() {
  const { isOnline } = useConnectivity();

  return useCallback(
    async (operationName: string): Promise<void> => {
      trackObservabilityEvent('ONLINE_WRITE_MARKED', {
        source: 'useWriteTelemetry',
        operationName,
        isOnline,
      });
    },
    [isOnline],
  );
}
