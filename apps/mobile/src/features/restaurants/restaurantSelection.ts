import type { QueryClient, QueryFunctionContext } from '@tanstack/react-query';

import type { RestaurantRecord } from '../models';
import {
  listMenuItemsForRestaurant,
  listRestaurantSuggestions,
  searchRestaurantsPage,
  type MenuItemRecord,
} from '../store/featureStore';
import { restaurantsQueryKeys } from '../store/restaurantsQuery';
import type { MonthlyUsageSnapshot } from '../store/usageLimitsGateway';
import {
  dedupeVisitRestaurants,
  matchesVisitRestaurantSearch,
  prioritizeSelectedVisitRestaurant,
  withVisitRestaurantDistance,
  type VisitRestaurantReferenceCoords,
  type VisitRestaurantWithDistance,
} from '../../lib/visitRestaurantSearch';

export const MONTHLY_USAGE_QUERY_KEY = ['feature', 'usage', 'monthly', 'actual'] as const;
export const RESTAURANT_SELECTION_PAGE_SIZE = 12;
export const RESTAURANT_SUGGESTIONS_LIMIT = 50;

type RestaurantSearchQueryKey = readonly ['feature', 'restaurants', 'search', string, number, number];

export function buildRecentRestaurantsQueryOptions({
  enabled,
  limit = RESTAURANT_SUGGESTIONS_LIMIT,
  search = '',
}: {
  enabled: boolean;
  limit?: number;
  search?: string;
}) {
  const normalizedSearch = search.replace(/\s+/g, ' ').trim();

  return {
    enabled,
    queryFn: ({ signal }: QueryFunctionContext) =>
      listRestaurantSuggestions({
        limit,
        search: normalizedSearch || undefined,
        signal,
      }),
    queryKey: restaurantsQueryKeys.suggestions(limit, normalizedSearch),
  };
}

export function buildRestaurantSearchQueryOptions({
  enabled,
  pageSize = RESTAURANT_SELECTION_PAGE_SIZE,
  search,
}: {
  enabled: boolean;
  pageSize?: number;
  search: string;
}) {
  const queryKey = ['feature', 'restaurants', 'search', search, 1, pageSize] as const;

  return {
    enabled,
    queryFn: async ({
      signal,
    }: QueryFunctionContext<RestaurantSearchQueryKey>) =>
      searchRestaurantsPage({
        page: 1,
        pageSize,
        search,
      }, { signal }),
    queryKey,
  };
}

export function buildRestaurantMenuItemsQueryOptions({
  enabled,
  isOnline,
  queryClient,
  selectedRestaurantId,
}: {
  enabled: boolean;
  isOnline: boolean;
  queryClient: QueryClient;
  selectedRestaurantId: string | null;
}) {
  return {
    enabled,
    queryFn: async ({ signal }: QueryFunctionContext): Promise<MenuItemRecord[]> => {
      if (!selectedRestaurantId) {
        return [];
      }

      if (!isOnline) {
        return queryClient.getQueryData<MenuItemRecord[]>(['feature', 'menuItems', selectedRestaurantId]) ?? [];
      }

      return listMenuItemsForRestaurant(selectedRestaurantId, { signal });
    },
    queryKey: ['feature', 'menuItems', selectedRestaurantId ?? ''] as const,
  };
}

export function resolveSavedRestaurantsUiState({
  hasReferenceCoords,
  hasSearchQuery,
  recentRestaurantsIsError,
  recentRestaurantsIsLoading,
  savedRestaurantsEmptyDescription,
}: {
  hasReferenceCoords: boolean;
  hasSearchQuery: boolean;
  recentRestaurantsIsError: boolean;
  recentRestaurantsIsLoading: boolean;
  savedRestaurantsEmptyDescription: string;
}) {
  return {
    savedEmptyDescription: hasSearchQuery
      ? 'Try a different name, location, or cuisine.'
      : savedRestaurantsEmptyDescription,
    savedEmptyTitle: hasSearchQuery ? 'No matching restaurants' : 'No restaurants yet',
    savedRestaurantsErrorMessage: recentRestaurantsIsError ? 'Could not load restaurants.' : null,
    savedRestaurantsLoading: recentRestaurantsIsLoading,
    savedRestaurantsTitle: hasSearchQuery
      ? 'Matching restaurants'
      : hasReferenceCoords
        ? 'Nearby restaurants'
        : 'Recent restaurants',
  };
}

export function syncMonthlyUsageSnapshot(
  queryClient: QueryClient,
  snapshot: MonthlyUsageSnapshot | null,
): boolean {
  if (!snapshot) {
    return false;
  }

  queryClient.setQueryData(MONTHLY_USAGE_QUERY_KEY, snapshot);
  return true;
}

export function buildDisplayedSavedRestaurants({
  referenceCoords,
  savedRestaurantRecords,
  selectedRestaurantId,
}: {
  referenceCoords: VisitRestaurantReferenceCoords | null;
  savedRestaurantRecords: RestaurantRecord[];
  selectedRestaurantId: string | null;
}): VisitRestaurantWithDistance[] {
  return prioritizeSelectedVisitRestaurant(
    withVisitRestaurantDistance(savedRestaurantRecords, referenceCoords),
    selectedRestaurantId,
  );
}

export function buildDisplayedNearbyRestaurants({
  nearbyResults,
  referenceCoords,
  searchQuery,
  searchResults,
  selectedRestaurantId,
}: {
  nearbyResults: RestaurantRecord[];
  referenceCoords: VisitRestaurantReferenceCoords | null;
  searchQuery: string;
  searchResults: RestaurantRecord[];
  selectedRestaurantId: string | null;
}): VisitRestaurantWithDistance[] {
  const combined = dedupeVisitRestaurants([...nearbyResults, ...searchResults]);
  const filtered = combined.filter((restaurant) =>
    matchesVisitRestaurantSearch(restaurant, searchQuery),
  );

  return prioritizeSelectedVisitRestaurant(
    withVisitRestaurantDistance(filtered, referenceCoords),
    selectedRestaurantId,
  );
}

export function buildLoadedRestaurantRecords({
  nearbyResults,
  savedRestaurantRecords,
  searchResults,
}: {
  nearbyResults: RestaurantRecord[];
  savedRestaurantRecords: RestaurantRecord[];
  searchResults: RestaurantRecord[];
}): RestaurantRecord[] {
  return dedupeVisitRestaurants([
    ...savedRestaurantRecords,
    ...searchResults,
    ...nearbyResults,
  ]);
}
