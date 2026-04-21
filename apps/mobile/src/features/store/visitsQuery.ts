import type { QueryKey } from '@tanstack/react-query';

import type { ListVisitsPageInput } from './featureStore';

type VisitBrowseScope = NonNullable<ListVisitsPageInput['scope']>;
type VisitsPaginatedQueryKey =
  | readonly ['feature', 'visits', 'paginated', VisitBrowseScope]
  | readonly ['feature', 'visits', 'paginated', VisitBrowseScope, string];

const VISIT_BROWSE_SCOPES = ['all', 'mine', 'friends'] as const;

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

function isPaginatedVisitsQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    (queryKey.length === 4 || queryKey.length === 5) &&
    queryKey[0] === visitsQueryKeys.root[0] &&
    queryKey[1] === visitsQueryKeys.root[1] &&
    queryKey[2] === 'paginated' &&
    typeof queryKey[3] === 'string' &&
    VISIT_BROWSE_SCOPES.includes(queryKey[3] as VisitBrowseScope) &&
    (queryKey.length === 4 || typeof queryKey[4] === 'string')
  );
}
