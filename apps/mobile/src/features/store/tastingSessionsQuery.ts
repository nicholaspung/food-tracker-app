import type { QueryClient, QueryKey } from '@tanstack/react-query';

import type { TastingSessionRecord } from '../models';

export const tastingSessionsQueryKeys = {
  root: ['feature', 'tastingSessions'] as const,
  detail: (sessionId: string) => ['feature', 'tastingSession', sessionId.trim()] as const,
};

export function isTastingSessionsListQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === tastingSessionsQueryKeys.root.length &&
    tastingSessionsQueryKeys.root.every((segment, index) => queryKey[index] === segment)
  );
}

export function isTastingSessionDetailQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === 3 &&
    queryKey[0] === 'feature' &&
    queryKey[1] === 'tastingSession' &&
    typeof queryKey[2] === 'string' &&
    queryKey[2].trim().length > 0
  );
}

export function getCachedTastingSessionDetail(
  queryClient: QueryClient,
  sessionId: string,
): TastingSessionRecord | null {
  const cachedDetail = queryClient.getQueryData<TastingSessionRecord | null>(
    tastingSessionsQueryKeys.detail(sessionId),
  );
  if (cachedDetail) {
    return cachedDetail;
  }

  return (
    queryClient
      .getQueryData<TastingSessionRecord[]>(tastingSessionsQueryKeys.root)
      ?.find((session) => session.id === sessionId) ?? null
  );
}

