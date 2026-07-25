import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type {
  TastingSessionListFilter,
  TastingSessionListPage,
} from './tastingSessionsApiStore';
import { tastingSessionsQueryKeys } from './tastingSessionsQuery';

const TASTING_SESSION_LIST_FILTERS: readonly TastingSessionListFilter[] = [
  'active',
  'completed',
];

export type TastingSessionSummariesInfiniteData = InfiniteData<
  TastingSessionListPage,
  number
>;

function removeTastingSessionFromSummaryPages(
  currentData: TastingSessionSummariesInfiniteData | undefined,
  sessionId: string,
): TastingSessionSummariesInfiniteData | undefined {
  if (!currentData) {
    return currentData;
  }

  const removedCount = currentData.pages.reduce(
    (count, page) => count + page.items.filter((session) => session.id === sessionId).length,
    0,
  );
  if (removedCount === 0) {
    return currentData;
  }

  return {
    ...currentData,
    pages: currentData.pages.map((page) => {
      const totalItems = Math.max(0, page.totalItems - removedCount);
      const totalPages =
        page.pageSize > 0 ? Math.ceil(totalItems / page.pageSize) : page.totalPages;

      return {
        ...page,
        hasNextPage: page.page < totalPages,
        items: page.items.filter((session) => session.id !== sessionId),
        totalItems,
        totalPages,
      };
    }),
  };
}

export function removeTastingSessionFromSummariesCache(
  queryClient: QueryClient,
  sessionId: string,
): void {
  for (const filter of TASTING_SESSION_LIST_FILTERS) {
    queryClient.setQueryData<TastingSessionSummariesInfiniteData | undefined>(
      tastingSessionsQueryKeys.summaries(filter),
      (currentData) => removeTastingSessionFromSummaryPages(currentData, sessionId),
    );
  }
}
