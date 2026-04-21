import type { QueryClient } from '@tanstack/react-query';

import type { VisitRecord } from '../models';
import { invalidateHomeFeedQueries } from './homeFeedQuery';
import { notesQueryKeys } from './notesQuery';
import { invalidateMonthlyUsageQueries } from './usageQuery';
import { invalidateVisitPhotoQuery, visitPhotosQueryKeys } from './visitPhotosQuery';
import type { ListVisitsPageInput } from './featureStore';

type VisitBrowseScope = NonNullable<ListVisitsPageInput['scope']>;
type VisitsPaginatedQueryKey =
  | readonly ['feature', 'visits', 'paginated', VisitBrowseScope]
  | readonly ['feature', 'visits', 'paginated', VisitBrowseScope, string];

function hasNonEmptyValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export const visitsQueryKeys = {
  root: ['feature', 'visits'] as const,
  detail: (visitId: string) => ['feature', 'visit', visitId.trim()] as const,
  paginated: (scope: VisitBrowseScope, searchQuery = ''): VisitsPaginatedQueryKey => {
    const trimmedSearchQuery = searchQuery.trim();
    if (!trimmedSearchQuery) {
      return ['feature', 'visits', 'paginated', scope] as const;
    }

    return ['feature', 'visits', 'paginated', scope, trimmedSearchQuery] as const;
  },
};

const visitStatsQueryKeys = {
  root: ['feature', 'restaurants', 'visitStats'] as const,
};

export function setCachedVisitDetail(
  queryClient: QueryClient,
  visit: VisitRecord,
): void {
  queryClient.setQueryData(visitsQueryKeys.detail(visit.id), visit);
}

interface SyncVisitMutationCachesOptions {
  visit?: VisitRecord | null;
  visitId?: string;
  includeUsage?: boolean;
  includeVisitPhotos?: boolean;
  sourceNoteId?: string | null;
}

export async function syncVisitMutationCaches(
  queryClient: QueryClient,
  options: SyncVisitMutationCachesOptions = {},
): Promise<void> {
  const visitId = options.visit?.id ?? options.visitId?.trim() ?? '';

  if (options.visit) {
    setCachedVisitDetail(queryClient, options.visit);
  }

  const invalidations: Promise<unknown>[] = [
    invalidateHomeFeedQueries(queryClient),
    queryClient.invalidateQueries({ queryKey: visitsQueryKeys.root }),
    queryClient.invalidateQueries({ queryKey: visitStatsQueryKeys.root }),
  ];

  if (!options.visit && visitId) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: visitsQueryKeys.detail(visitId),
      }),
    );
  }

  if (options.includeUsage) {
    invalidations.push(invalidateMonthlyUsageQueries(queryClient));
  }

  if (options.includeVisitPhotos && visitId) {
    invalidations.push(
      invalidateVisitPhotoQuery(
        queryClient,
        visitPhotosQueryKeys.visit(visitId),
      ),
    );
  }

  if (hasNonEmptyValue(options.sourceNoteId)) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: notesQueryKeys.root,
      }),
    );
  }

  await Promise.all(invalidations);
}
