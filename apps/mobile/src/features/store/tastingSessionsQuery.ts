import type { QueryClient, QueryKey } from '@tanstack/react-query';

import type { TastingSessionRecord } from '../models';
import type { TastingSessionListFilter } from './tastingSessionsApiStore';

const TASTING_SESSION_LIST_FILTERS: readonly TastingSessionListFilter[] = ['active', 'completed'];

export const tastingSessionsQueryKeys = {
  root: ['feature', 'tasting-sessions'] as const,
  summariesRoot: ['feature', 'tasting-sessions', 'summaries'] as const,
  summaries: (filter: TastingSessionListFilter) =>
    ['feature', 'tasting-sessions', 'summaries', filter] as const,
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
  return isPaginatedTastingSessionSummariesQueryKey(queryKey);
}

function isPaginatedTastingSessionSummariesQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === 4 &&
    queryKey[0] === tastingSessionsQueryKeys.root[0] &&
    queryKey[1] === tastingSessionsQueryKeys.root[1] &&
    queryKey[2] === 'summaries' &&
    TASTING_SESSION_LIST_FILTERS.includes(queryKey[3] as TastingSessionListFilter)
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
  return (
    queryClient.getQueryData<TastingSessionRecord | null>(
      tastingSessionsQueryKeys.detail(sessionId),
    ) ?? null
  );
}
