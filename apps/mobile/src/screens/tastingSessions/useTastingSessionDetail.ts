import { useQuery } from '@tanstack/react-query';

import { getTastingSessionById, tastingSessionsQueryKeys } from '../../features';
import { useConnectivity } from '../../providers/ConnectivityProvider';

export function useTastingSessionDetail(sessionId: string, poll = false) {
  const { isOnline } = useConnectivity();
  return useQuery({
    queryKey: tastingSessionsQueryKeys.detail(sessionId),
    queryFn: ({ signal }) => getTastingSessionById(sessionId, { signal }),
    refetchInterval: poll && isOnline ? 3000 : false,
  });
}
