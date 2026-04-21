import type { ListVisitsPageInput } from './featureStore';

type VisitBrowseScope = NonNullable<ListVisitsPageInput['scope']>;
type VisitsPaginatedQueryKey =
  | readonly ['feature', 'visits', 'paginated', VisitBrowseScope]
  | readonly ['feature', 'visits', 'paginated', VisitBrowseScope, string];

export const visitsQueryKeys = {
  root: ['feature', 'visits'] as const,
  paginated: (scope: VisitBrowseScope, searchQuery = ''): VisitsPaginatedQueryKey => {
    const trimmedSearchQuery = searchQuery.trim();
    if (!trimmedSearchQuery) {
      return ['feature', 'visits', 'paginated', scope] as const;
    }

    return ['feature', 'visits', 'paginated', scope, trimmedSearchQuery] as const;
  },
};
