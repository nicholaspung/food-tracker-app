import type { QueryClient, QueryKey } from '@tanstack/react-query';

import type { TastingSessionRecord } from '../models';

export const tastingSessionsQueryKeys = {
  root: ['feature', 'tasting-sessions'] as const,
  detail: (sessionId: string) => ['feature', 'tasting-sessions', sessionId.trim()] as const,
  friends: (sessionId: string) => ['feature', 'tasting-sessions', sessionId.trim(), 'friends'] as const,
  resultPhotos: (sessionId: string, generatedFoodItemIds: readonly string[]) =>
    [
      'feature',
      'tasting-sessions',
      sessionId.trim(),
      'result-photos',
      normalizeTastingSessionResultPhotoIds(generatedFoodItemIds),
    ] as const,
};

function normalizeTastingSessionResultPhotoIds(
  generatedFoodItemIds: readonly string[],
): string[] {
  return Array.from(
    new Set(
      generatedFoodItemIds
        .map((foodItemId) => foodItemId.trim())
        .filter((foodItemId) => foodItemId.length > 0),
    ),
  ).sort();
}

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
    queryKey[1] === 'tasting-sessions' &&
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
