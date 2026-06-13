import type { QueryClient, QueryFunctionContext } from '@tanstack/react-query';

import type { RestaurantRecord } from '../models';
import {
  listMenuItemsForRestaurant,
  listRestaurantSuggestions,
  searchRestaurantsPage,
  type MenuItemRecord,
} from '../store/featureStore';
import { restaurantsQueryKeys } from '../store/restaurantsQuery';
import {
  formatLimitExceededMessage,
  parseLimitExceededError,
  type LimitExceededPayload,
  type MonthlyUsageSnapshot,
} from '../store/usageLimitsGateway';
import {
  dedupeVisitRestaurants,
  matchesVisitRestaurantSearch,
  prioritizeSelectedVisitRestaurant,
  withVisitRestaurantDistance,
  type VisitRestaurantReferenceCoords,
  type VisitRestaurantWithDistance,
} from '../../lib/visitRestaurantSearch';

const MONTHLY_USAGE_QUERY_KEY = ['feature', 'usage', 'monthly', 'actual'] as const;
const RESTAURANT_SELECTION_PAGE_SIZE = 12;
export const RESTAURANT_SUGGESTIONS_LIMIT = 50;

type RestaurantSearchQueryKey = readonly ['feature', 'restaurants', 'search', string, number, number];

interface RestaurantTextSearchAdapterResult {
  resolvedLocation: VisitRestaurantReferenceCoords | null;
  restaurants: RestaurantRecord[];
  usageSnapshot: MonthlyUsageSnapshot | null;
}

interface RunRestaurantTextSearchInput {
  coordinateBias?: VisitRestaurantReferenceCoords | null;
  effectiveReferenceCoords: VisitRestaurantReferenceCoords | null;
  isOnline: boolean;
  isQuotaReached: boolean;
  locationText: string;
  query: string;
  queryClient: QueryClient;
  searchByText: (params: {
    latitude?: number;
    longitude?: number;
    locationText?: string;
    query: string;
    radius: number;
  }) => Promise<RestaurantTextSearchAdapterResult>;
  shouldEnforceUsageLimitsClientSide: boolean;
}

type RestaurantLocationCaptureResult =
  | {
      coordinates: {
        latitude: number;
        longitude: number;
      };
      status: 'success';
    }
  | {
      canAskAgain: boolean;
      message: string;
      status: 'permission_denied';
    }
  | {
      error: unknown;
      message: string;
      status: 'error';
    };

interface RestaurantNearbySearchAdapterResult {
  restaurants: RestaurantRecord[];
  usageSnapshot: MonthlyUsageSnapshot | null;
}

interface RunRestaurantNearbySearchInput {
  captureLocation: () => Promise<RestaurantLocationCaptureResult>;
  isOnline: boolean;
  isQuotaReached: boolean;
  queryClient: QueryClient;
  searchNearby: (params: {
    latitude: number;
    longitude: number;
    radius: number;
  }) => Promise<RestaurantNearbySearchAdapterResult>;
  shouldEnforceUsageLimitsClientSide: boolean;
}

interface RunRestaurantNearbyCoordinateSearchInput {
  coords: VisitRestaurantReferenceCoords;
  isOnline: boolean;
  isQuotaReached: boolean;
  queryClient: QueryClient;
  searchNearby: (params: {
    latitude: number;
    longitude: number;
    radius: number;
  }) => Promise<RestaurantNearbySearchAdapterResult>;
  shouldEnforceUsageLimitsClientSide: boolean;
}

interface ResolveRestaurantTextSearchPreflightInput {
  isOnline: boolean;
  isQuotaReached: boolean;
  locationText: string;
  query: string;
  shouldEnforceUsageLimitsClientSide: boolean;
}

export type RestaurantTextSearchResult =
  | {
      message: string;
      status: 'offline' | 'quota_reached' | 'validation_error';
    }
  | {
      referenceCoords: VisitRestaurantReferenceCoords | null;
      results: RestaurantRecord[];
      status: 'success';
    }
  | {
      error: unknown;
      limitPayload: LimitExceededPayload | null;
      message: string;
      status: 'error';
    };

export type RestaurantNearbySearchResult =
  | {
      message: string;
      status: 'offline' | 'quota_reached';
    }
  | {
      canAskAgain: boolean;
      message: string;
      status: 'permission_denied';
    }
  | {
      error: unknown;
      message: string;
      status: 'location_error';
    }
  | {
      referenceCoords: VisitRestaurantReferenceCoords;
      results: RestaurantRecord[];
      status: 'success';
    }
  | {
      error: unknown;
      limitPayload: LimitExceededPayload | null;
      message: string;
      referenceCoords: VisitRestaurantReferenceCoords;
      status: 'error';
    };

export type RestaurantTextSearchPreflightResult =
  | {
      ok: true;
    }
  | Extract<
      RestaurantTextSearchResult,
      { status: 'offline' | 'quota_reached' | 'validation_error' }
    >;

export type RestaurantNearbySearchPreflightResult =
  | {
      ok: true;
    }
  | Extract<
      RestaurantNearbySearchResult,
      { status: 'offline' | 'quota_reached' }
    >;

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

export function buildRestaurantSuggestionSearchText({
  locationQuery,
  searchQuery,
}: {
  locationQuery: string;
  searchQuery: string;
}): string {
  const normalizedSearchQuery = searchQuery.replace(/\s+/g, ' ').trim();
  if (normalizedSearchQuery) {
    return normalizedSearchQuery;
  }

  return locationQuery.replace(/\s+/g, ' ').trim();
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
  locationQuery = '',
  referenceCoords,
  savedRestaurantRecords,
  searchQuery = '',
  selectedRestaurantId,
}: {
  locationQuery?: string;
  referenceCoords: VisitRestaurantReferenceCoords | null;
  savedRestaurantRecords: RestaurantRecord[];
  searchQuery?: string;
  selectedRestaurantId: string | null;
}): VisitRestaurantWithDistance[] {
  const filtered = savedRestaurantRecords.filter((restaurant) =>
    matchesVisitRestaurantSearch(restaurant, searchQuery) &&
    matchesVisitRestaurantSearch(restaurant, locationQuery),
  );

  return prioritizeSelectedVisitRestaurant(
    withVisitRestaurantDistance(filtered, referenceCoords),
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

export function resolveRestaurantTextSearchPreflight({
  isOnline,
  isQuotaReached,
  locationText,
  query,
  shouldEnforceUsageLimitsClientSide,
}: ResolveRestaurantTextSearchPreflightInput): RestaurantTextSearchPreflightResult {
  if (!isOnline) {
    return {
      message: 'Google Places search requires internet connection.',
      status: 'offline',
    };
  }

  if (isQuotaReached && shouldEnforceUsageLimitsClientSide) {
    return {
      message: 'Monthly food place search limit reached.',
      status: 'quota_reached',
    };
  }

  if (!query.trim() && !locationText.trim()) {
    return {
      message: 'Enter a place name/type or a location to search.',
      status: 'validation_error',
    };
  }

  return { ok: true };
}

export function resolveRestaurantNearbySearchPreflight({
  isOnline,
  isQuotaReached,
  shouldEnforceUsageLimitsClientSide,
}: Pick<
  RunRestaurantNearbySearchInput,
  'isOnline' | 'isQuotaReached' | 'shouldEnforceUsageLimitsClientSide'
>): RestaurantNearbySearchPreflightResult {
  if (!isOnline) {
    return {
      message: 'Nearby search requires internet connection.',
      status: 'offline',
    };
  }

  if (isQuotaReached && shouldEnforceUsageLimitsClientSide) {
    return {
      message: 'Monthly food place search limit reached.',
      status: 'quota_reached',
    };
  }

  return { ok: true };
}

export async function runRestaurantTextSearch({
  coordinateBias,
  effectiveReferenceCoords,
  isOnline,
  isQuotaReached,
  locationText,
  query,
  queryClient,
  searchByText,
  shouldEnforceUsageLimitsClientSide,
}: RunRestaurantTextSearchInput): Promise<RestaurantTextSearchResult> {
  const trimmedQuery = query.trim();
  const trimmedLocation = locationText.trim();
  const preflight = resolveRestaurantTextSearchPreflight({
    isOnline,
    isQuotaReached,
    locationText: coordinateBias ? 'current location' : locationText,
    query,
    shouldEnforceUsageLimitsClientSide,
  });
  if (!('ok' in preflight)) {
    return preflight;
  }

  let didSyncMonthlyUsageSnapshot = false;

  try {
    const searchParams: Parameters<RunRestaurantTextSearchInput['searchByText']>[0] = {
      locationText: trimmedLocation || undefined,
      query: trimmedQuery || 'food',
      radius: 5000,
    };
    if (coordinateBias) {
      searchParams.latitude = coordinateBias.lat;
      searchParams.longitude = coordinateBias.lng;
    }

    const { resolvedLocation, restaurants, usageSnapshot } = await searchByText(searchParams);
    didSyncMonthlyUsageSnapshot = syncMonthlyUsageSnapshot(
      queryClient,
      usageSnapshot,
    );

    return {
      referenceCoords: coordinateBias ?? (trimmedLocation ? resolvedLocation : effectiveReferenceCoords),
      results: restaurants,
      status: 'success',
    };
  } catch (error) {
    const limitPayload = parseLimitExceededError(error);
    const message = limitPayload
      ? formatLimitExceededMessage(limitPayload)
      : error instanceof Error
        ? error.message
        : 'Could not search restaurants.';

    return {
      error,
      limitPayload,
      message,
      status: 'error',
    };
  } finally {
    if (!didSyncMonthlyUsageSnapshot) {
      await queryClient.invalidateQueries({
        queryKey: ['feature', 'usage', 'monthly'],
      });
    }
  }
}

export async function runRestaurantNearbySearch({
  captureLocation,
  isOnline,
  isQuotaReached,
  queryClient,
  searchNearby,
  shouldEnforceUsageLimitsClientSide,
}: RunRestaurantNearbySearchInput): Promise<RestaurantNearbySearchResult> {
  const preflight = resolveRestaurantNearbySearchPreflight({
    isOnline,
    isQuotaReached,
    shouldEnforceUsageLimitsClientSide,
  });
  if (!('ok' in preflight)) {
    return preflight;
  }

  const locationCapture = await captureLocation();
  if (locationCapture.status === 'permission_denied') {
    return {
      canAskAgain: locationCapture.canAskAgain,
      message: locationCapture.message,
      status: 'permission_denied',
    };
  }

  if (locationCapture.status === 'error') {
    return {
      error: locationCapture.error,
      message: locationCapture.message,
      status: 'location_error',
    };
  }

  const referenceCoords = {
    lat: locationCapture.coordinates.latitude,
    lng: locationCapture.coordinates.longitude,
  };
  let didSyncMonthlyUsageSnapshot = false;

  try {
    const { restaurants, usageSnapshot } = await searchNearby({
      latitude: referenceCoords.lat,
      longitude: referenceCoords.lng,
      radius: 5000,
    });
    didSyncMonthlyUsageSnapshot = syncMonthlyUsageSnapshot(
      queryClient,
      usageSnapshot,
    );

    return {
      referenceCoords,
      results: restaurants,
      status: 'success',
    };
  } catch (error) {
    const limitPayload = parseLimitExceededError(error);
    const message = limitPayload
      ? formatLimitExceededMessage(limitPayload)
      : error instanceof Error
        ? error.message
        : 'Could not load nearby restaurants.';

    return {
      error,
      limitPayload,
      message,
      referenceCoords,
      status: 'error',
    };
  } finally {
    if (!didSyncMonthlyUsageSnapshot) {
      await queryClient.invalidateQueries({
        queryKey: ['feature', 'usage', 'monthly'],
      });
    }
  }
}

export async function runRestaurantNearbyCoordinateSearch({
  coords,
  isOnline,
  isQuotaReached,
  queryClient,
  searchNearby,
  shouldEnforceUsageLimitsClientSide,
}: RunRestaurantNearbyCoordinateSearchInput): Promise<RestaurantNearbySearchResult> {
  const preflight = resolveRestaurantNearbySearchPreflight({
    isOnline,
    isQuotaReached,
    shouldEnforceUsageLimitsClientSide,
  });
  if (!('ok' in preflight)) {
    return preflight;
  }

  const referenceCoords = {
    lat: coords.lat,
    lng: coords.lng,
  };
  let didSyncMonthlyUsageSnapshot = false;

  try {
    const { restaurants, usageSnapshot } = await searchNearby({
      latitude: referenceCoords.lat,
      longitude: referenceCoords.lng,
      radius: 5000,
    });
    didSyncMonthlyUsageSnapshot = syncMonthlyUsageSnapshot(
      queryClient,
      usageSnapshot,
    );

    return {
      referenceCoords,
      results: restaurants,
      status: 'success',
    };
  } catch (error) {
    const limitPayload = parseLimitExceededError(error);
    const message = limitPayload
      ? formatLimitExceededMessage(limitPayload)
      : error instanceof Error
        ? error.message
        : 'Could not load nearby restaurants.';

    return {
      error,
      limitPayload,
      message,
      referenceCoords,
      status: 'error',
    };
  } finally {
    if (!didSyncMonthlyUsageSnapshot) {
      await queryClient.invalidateQueries({
        queryKey: ['feature', 'usage', 'monthly'],
      });
    }
  }
}
