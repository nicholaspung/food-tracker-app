import {
  type QueryFunctionContext,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import {
  formatLimitExceededMessage,
  listMenuItemsForRestaurant,
  listRecentRestaurants,
  type MonthlyUsageSnapshot,
  parseLimitExceededError,
  searchRestaurantsPage,
  type LimitExceededPayload,
  type MenuItemRecord,
  type RestaurantRecord,
} from '../features';
import { useForegroundLocationCapture } from './useForegroundLocationCapture';
import {
  searchAndCacheNearbyRestaurants,
  searchAndCacheRestaurantsByText,
} from '../lib/googlePlaces';
import { resolveCreateVisitSearchUi } from '../lib/usageUiRules';
import {
  dedupeVisitRestaurants,
  matchesVisitRestaurantSearch,
  prioritizeSelectedVisitRestaurant,
  withVisitRestaurantDistance,
  type VisitRestaurantReferenceCoords,
  type VisitRestaurantWithDistance,
} from '../lib/visitRestaurantSearch';
import { useDebouncedValue } from './useDebouncedValue';

const FREE_SEARCH_WARNING_THRESHOLD = 2;
const MONTHLY_USAGE_QUERY_KEY = ['feature', 'usage', 'monthly', 'actual'] as const;
const RESTAURANT_SELECTION_PAGE_SIZE = 12;
const MIN_SERVER_RESTAURANT_SEARCH_LENGTH = 2;
const RESTAURANT_SEARCH_DEBOUNCE_MS = 250;
type RestaurantSearchQueryKey = readonly ['feature', 'restaurants', 'search', string, number, number];

interface RestaurantSelectionUsageOptions {
  enforceQuota: boolean;
  isFreeTier: boolean;
  placesQueriesRemaining: number | null;
}

interface UseSavedRestaurantSuggestionsOptions {
  enabled: boolean;
  recentLimit?: number;
  savedRestaurantsEmptyDescription?: string;
  searchQuery: string;
}

interface UseSavedRestaurantSuggestionsResult {
  savedEmptyDescription: string;
  savedEmptyTitle: string;
  savedRestaurantRecords: RestaurantRecord[];
  savedRestaurantsErrorMessage: string | null;
  savedRestaurantsLoading: boolean;
  savedRestaurantsTitle: string;
  shouldQuerySavedRestaurantsBySearch: boolean;
  triggerSavedRestaurantsRefetch: () => Promise<unknown>;
}

interface UseRestaurantSelectionFlowOptions {
  fallbackReferenceCoords?: VisitRestaurantReferenceCoords | null;
  isOnline: boolean;
  menuItemsEnabled: boolean;
  savedRestaurantsEmptyDescription?: string;
  savedRestaurantsEnabled: boolean;
  selectedRestaurantId: string | null;
  usage: RestaurantSelectionUsageOptions;
}

interface UseRestaurantSelectionFlowResult {
  clearPlacesSearchState: () => void;
  clearSearchErrorMessage: () => void;
  compactSearchLabel: string;
  displayedNearbyRestaurants: VisitRestaurantWithDistance[];
  displayedSavedRestaurants: VisitRestaurantWithDistance[];
  expandedSearchLabel: string;
  isGettingLocation: boolean;
  isPlacesQuotaReached: boolean;
  isSearchExpanded: boolean;
  isSearchingNearbyRestaurants: boolean;
  isSearchingRestaurants: boolean;
  loadedRestaurantRecords: RestaurantRecord[];
  locationPermissionNeedsSettings: boolean;
  manualLocation: string;
  menuItemsQuery: UseQueryResult<MenuItemRecord[], Error>;
  placesQueriesRemaining: number | null;
  resetLocationPermissionNeedsSettings: () => void;
  resetRestaurantSelectionFlow: () => void;
  savedEmptyDescription: string;
  savedEmptyTitle: string;
  savedRestaurantRecords: RestaurantRecord[];
  savedRestaurantsErrorMessage: string | null;
  savedRestaurantsLoading: boolean;
  savedRestaurantsTitle: string;
  searchButtonDisabled: boolean;
  searchByText: (options?: {
    collapseAfterSearch?: boolean;
  }) => Promise<TextRestaurantSearchResult>;
  searchErrorMessage: string | null;
  searchNearby: () => Promise<NearbyRestaurantSearchResult>;
  searchQuery: string;
  setIsSearchExpanded: Dispatch<SetStateAction<boolean>>;
  setManualLocation: Dispatch<SetStateAction<string>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  shouldEnforceUsageLimitsClientSide: boolean;
  shouldQuerySavedRestaurantsBySearch: boolean;
  shouldShowPlacesUpgradePrompt: boolean;
  showNearbyPlaces: boolean;
  triggerSavedRestaurantsRefetch: () => Promise<unknown>;
}

export type TextRestaurantSearchResult =
  | {
      message: string;
      status: 'offline' | 'quota_reached' | 'validation_error';
    }
  | {
      results: RestaurantRecord[];
      status: 'success';
    }
  | {
      error: unknown;
      limitPayload: LimitExceededPayload | null;
      message: string;
      status: 'error';
    };

export type NearbyRestaurantSearchResult =
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
      results: RestaurantRecord[];
      status: 'success';
    }
  | {
      error: unknown;
      limitPayload: LimitExceededPayload | null;
      message: string;
      status: 'error';
    };

function buildRecentRestaurantsQueryOptions({
  enabled,
  limit = RESTAURANT_SELECTION_PAGE_SIZE,
}: {
  enabled: boolean;
  limit?: number;
}) {
  return {
    enabled,
    queryFn: ({ signal }: QueryFunctionContext) => listRecentRestaurants({ limit, signal }),
    queryKey: ['feature', 'restaurants', 'recent', limit] as const,
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

function resolveSavedRestaurantsUiState(
  savedRestaurantsEmptyDescription: string,
  shouldQuerySavedRestaurantsBySearch: boolean,
  recentRestaurantsIsError: boolean,
  recentRestaurantsIsLoading: boolean,
  searchedRestaurantsIsError: boolean,
  searchedRestaurantsIsLoading: boolean,
) {
  return {
    savedEmptyDescription: shouldQuerySavedRestaurantsBySearch
      ? 'Try a different name, location, or cuisine.'
      : savedRestaurantsEmptyDescription,
    savedEmptyTitle: shouldQuerySavedRestaurantsBySearch ? 'No matching restaurants' : 'No recent restaurants',
    savedRestaurantsErrorMessage: shouldQuerySavedRestaurantsBySearch
      ? searchedRestaurantsIsError
        ? 'Could not load matching restaurants.'
        : null
      : recentRestaurantsIsError
        ? 'Could not load recent restaurants.'
        : null,
    savedRestaurantsLoading: shouldQuerySavedRestaurantsBySearch
      ? searchedRestaurantsIsLoading
      : recentRestaurantsIsLoading,
    savedRestaurantsTitle: shouldQuerySavedRestaurantsBySearch ? 'Matching restaurants' : 'Recent restaurants',
  };
}

function syncMonthlyUsageSnapshot(
  queryClient: QueryClient,
  snapshot: MonthlyUsageSnapshot | null,
): boolean {
  if (!snapshot) {
    return false;
  }

  queryClient.setQueryData(MONTHLY_USAGE_QUERY_KEY, snapshot);
  return true;
}

export function useSavedRestaurantSuggestions({
  enabled,
  recentLimit = RESTAURANT_SELECTION_PAGE_SIZE,
  savedRestaurantsEmptyDescription = 'Search nearby places or add a new restaurant to start.',
  searchQuery,
}: UseSavedRestaurantSuggestionsOptions): UseSavedRestaurantSuggestionsResult {
  const trimmedSearchQuery = searchQuery.trim();
  const debouncedTrimmedSearchQuery = useDebouncedValue(
    trimmedSearchQuery,
    RESTAURANT_SEARCH_DEBOUNCE_MS,
  );
  const shouldQuerySavedRestaurantsBySearch =
    trimmedSearchQuery.length >= MIN_SERVER_RESTAURANT_SEARCH_LENGTH &&
    debouncedTrimmedSearchQuery.length >= MIN_SERVER_RESTAURANT_SEARCH_LENGTH &&
    trimmedSearchQuery === debouncedTrimmedSearchQuery;
  const recentRestaurantsQuery = useQuery<RestaurantRecord[]>(
    buildRecentRestaurantsQueryOptions({
      enabled: enabled && !shouldQuerySavedRestaurantsBySearch,
      limit: recentLimit,
    }),
  );
  const searchedRestaurantsQuery = useQuery(
    buildRestaurantSearchQueryOptions({
      enabled: enabled && shouldQuerySavedRestaurantsBySearch,
      pageSize: recentLimit,
      search: debouncedTrimmedSearchQuery,
    }),
  );

  const savedRestaurantRecords = useMemo(() => {
    if (shouldQuerySavedRestaurantsBySearch) {
      return searchedRestaurantsQuery.data?.items ?? [];
    }

    const recentRestaurants = recentRestaurantsQuery.data ?? [];
    if (!trimmedSearchQuery) {
      return recentRestaurants;
    }

    return recentRestaurants.filter((restaurant) =>
      matchesVisitRestaurantSearch(restaurant, trimmedSearchQuery),
    );
  }, [
    recentRestaurantsQuery.data,
    searchedRestaurantsQuery.data?.items,
    shouldQuerySavedRestaurantsBySearch,
    trimmedSearchQuery,
  ]);

  const savedRestaurantsUiState = useMemo(
    () =>
      resolveSavedRestaurantsUiState(
        savedRestaurantsEmptyDescription,
        shouldQuerySavedRestaurantsBySearch,
        recentRestaurantsQuery.isError,
        recentRestaurantsQuery.isLoading,
        searchedRestaurantsQuery.isError,
        searchedRestaurantsQuery.isLoading,
      ),
    [
      recentRestaurantsQuery.isError,
      recentRestaurantsQuery.isLoading,
      savedRestaurantsEmptyDescription,
      searchedRestaurantsQuery.isError,
      searchedRestaurantsQuery.isLoading,
      shouldQuerySavedRestaurantsBySearch,
    ],
  );

  const triggerSavedRestaurantsRefetch = useCallback(() => {
    if (shouldQuerySavedRestaurantsBySearch) {
      return searchedRestaurantsQuery.refetch();
    }

    return recentRestaurantsQuery.refetch();
  }, [
    recentRestaurantsQuery,
    searchedRestaurantsQuery,
    shouldQuerySavedRestaurantsBySearch,
  ]);

  return {
    savedEmptyDescription: savedRestaurantsUiState.savedEmptyDescription,
    savedEmptyTitle: savedRestaurantsUiState.savedEmptyTitle,
    savedRestaurantRecords,
    savedRestaurantsErrorMessage: savedRestaurantsUiState.savedRestaurantsErrorMessage,
    savedRestaurantsLoading: savedRestaurantsUiState.savedRestaurantsLoading,
    savedRestaurantsTitle: savedRestaurantsUiState.savedRestaurantsTitle,
    shouldQuerySavedRestaurantsBySearch,
    triggerSavedRestaurantsRefetch,
  };
}

export function useRestaurantSelectionFlow({
  fallbackReferenceCoords = null,
  isOnline,
  menuItemsEnabled,
  savedRestaurantsEmptyDescription = 'Search nearby places or add a new restaurant to start.',
  savedRestaurantsEnabled,
  selectedRestaurantId,
  usage,
}: UseRestaurantSelectionFlowOptions): UseRestaurantSelectionFlowResult {
  const queryClient = useQueryClient();
  const shouldEnforceUsageLimitsClientSide = usage.enforceQuota;
  const placesQueriesRemaining = usage.placesQueriesRemaining;
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [manualLocation, setManualLocation] = useState('');
  const [showNearbyPlaces, setShowNearbyPlaces] = useState(false);
  const [referenceCoords, setReferenceCoords] = useState<VisitRestaurantReferenceCoords | null>(null);
  const [searchResults, setSearchResults] = useState<RestaurantRecord[]>([]);
  const [nearbyResults, setNearbyResults] = useState<RestaurantRecord[]>([]);
  const [searchErrorMessage, setSearchErrorMessage] = useState<string | null>(null);
  const [isSearchingRestaurants, setIsSearchingRestaurants] = useState(false);
  const [isSearchingNearbyRestaurants, setIsSearchingNearbyRestaurants] = useState(false);
  const trimmedSearchQuery = searchQuery.trim();
  const {
    captureLocation,
    isCapturing: isGettingLocation,
    permissionNeedsSettings: locationPermissionNeedsSettings,
    resetPermissionNeedsSettings: resetLocationPermissionNeedsSettings,
  } = useForegroundLocationCapture({
    blockedPermissionMessage: 'Location permission is blocked. Enable it in device settings.',
    defaultErrorMessage: 'Could not get current location.',
    deniedPermissionMessage: 'Location permission is required to find nearby places.',
  });

  const {
    savedEmptyDescription,
    savedEmptyTitle,
    savedRestaurantRecords,
    savedRestaurantsErrorMessage,
    savedRestaurantsLoading,
    savedRestaurantsTitle,
    shouldQuerySavedRestaurantsBySearch,
    triggerSavedRestaurantsRefetch,
  } = useSavedRestaurantSuggestions({
    enabled: savedRestaurantsEnabled,
    savedRestaurantsEmptyDescription,
    searchQuery,
  });
  const menuItemsQuery = useQuery<MenuItemRecord[]>(
    buildRestaurantMenuItemsQueryOptions({
      enabled: menuItemsEnabled && Boolean(selectedRestaurantId),
      isOnline,
      queryClient,
      selectedRestaurantId,
    }),
  );

  const effectiveReferenceCoords = referenceCoords ?? fallbackReferenceCoords;
  const displayedSavedRestaurants = useMemo(() => {
    return prioritizeSelectedVisitRestaurant(
      withVisitRestaurantDistance(savedRestaurantRecords, effectiveReferenceCoords),
      selectedRestaurantId,
    );
  }, [effectiveReferenceCoords, savedRestaurantRecords, selectedRestaurantId]);

  const displayedNearbyRestaurants = useMemo(() => {
    const combined = dedupeVisitRestaurants([...nearbyResults, ...searchResults]);
    const filtered = combined.filter((restaurant) =>
      matchesVisitRestaurantSearch(restaurant, searchQuery),
    );

    return prioritizeSelectedVisitRestaurant(
      withVisitRestaurantDistance(filtered, effectiveReferenceCoords),
      selectedRestaurantId,
    );
  }, [
    effectiveReferenceCoords,
    nearbyResults,
    searchQuery,
    searchResults,
    selectedRestaurantId,
  ]);

  const loadedRestaurantRecords = useMemo(() => {
    return dedupeVisitRestaurants([
      ...savedRestaurantRecords,
      ...searchResults,
      ...nearbyResults,
    ]);
  }, [nearbyResults, savedRestaurantRecords, searchResults]);

  const searchUi = resolveCreateVisitSearchUi({
    enforceQuota: shouldEnforceUsageLimitsClientSide,
    isFreeTier: usage.isFreeTier,
    isOnline,
    isSearching: isSearchingRestaurants || isSearchingNearbyRestaurants || isGettingLocation,
    placesQueriesRemaining,
  });
  const shouldShowPlacesUpgradePrompt =
    usage.isFreeTier &&
    typeof placesQueriesRemaining === 'number' &&
    placesQueriesRemaining <= FREE_SEARCH_WARNING_THRESHOLD;

  const clearSearchErrorMessage = useCallback(() => {
    setSearchErrorMessage(null);
  }, []);

  const clearPlacesSearchState = useCallback(() => {
    setShowNearbyPlaces(false);
    setNearbyResults([]);
    setSearchResults([]);
    setSearchErrorMessage(null);
    resetLocationPermissionNeedsSettings();
  }, [resetLocationPermissionNeedsSettings]);

  const resetRestaurantSelectionFlow = useCallback(() => {
    setSearchQuery('');
    setIsSearchExpanded(false);
    setManualLocation('');
    setReferenceCoords(null);
    setShowNearbyPlaces(false);
    setSearchResults([]);
    setNearbyResults([]);
    setSearchErrorMessage(null);
    resetLocationPermissionNeedsSettings();
  }, [resetLocationPermissionNeedsSettings]);

  const searchByText = useCallback(
    async ({
      collapseAfterSearch = false,
    }: {
      collapseAfterSearch?: boolean;
    } = {}): Promise<TextRestaurantSearchResult> => {
      if (!isOnline) {
        const message = 'Google Places search requires internet connection.';
        setSearchErrorMessage(message);
        return { message, status: 'offline' };
      }

      if (searchUi.isQuotaReached && shouldEnforceUsageLimitsClientSide) {
        const message = 'Monthly food place search limit reached.';
        setSearchErrorMessage(message);
        return { message, status: 'quota_reached' };
      }

      const trimmedLocation = manualLocation.trim();
      if (!trimmedSearchQuery && !trimmedLocation) {
        const message = 'Enter a place name/type or a location to search.';
        setSearchErrorMessage(message);
        return { message, status: 'validation_error' };
      }

      if (collapseAfterSearch) {
        setIsSearchExpanded(false);
      }

      setIsSearchingRestaurants(true);
      setShowNearbyPlaces(true);
      setSearchErrorMessage(null);
      resetLocationPermissionNeedsSettings();

      let didAttemptPlacesQuery = false;
      let didSyncMonthlyUsageSnapshot = false;

      try {
        didAttemptPlacesQuery = true;

        const { resolvedLocation, restaurants, usageSnapshot } = await searchAndCacheRestaurantsByText({
          locationText: trimmedLocation || undefined,
          query: trimmedSearchQuery || 'food',
          radius: 5000,
        });
        didSyncMonthlyUsageSnapshot = syncMonthlyUsageSnapshot(queryClient, usageSnapshot);

        setReferenceCoords(trimmedLocation ? resolvedLocation : effectiveReferenceCoords);

        setSearchResults(restaurants);
        return {
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
        setSearchErrorMessage(message);
        return {
          error,
          limitPayload,
          message,
          status: 'error',
        };
      } finally {
        setIsSearchingRestaurants(false);
        if (didAttemptPlacesQuery && !didSyncMonthlyUsageSnapshot) {
          await queryClient.invalidateQueries({
            queryKey: ['feature', 'usage', 'monthly'],
          });
        }
      }
    },
    [
      effectiveReferenceCoords,
      isOnline,
      manualLocation,
      queryClient,
      resetLocationPermissionNeedsSettings,
      searchUi.isQuotaReached,
      shouldEnforceUsageLimitsClientSide,
      trimmedSearchQuery,
    ],
  );

  const searchNearby = useCallback(async (): Promise<NearbyRestaurantSearchResult> => {
    if (!isOnline) {
      const message = 'Nearby search requires internet connection.';
      setSearchErrorMessage(message);
      return { message, status: 'offline' };
    }

    if (searchUi.isQuotaReached && shouldEnforceUsageLimitsClientSide) {
      const message = 'Monthly food place search limit reached.';
      setSearchErrorMessage(message);
      return { message, status: 'quota_reached' };
    }

    setShowNearbyPlaces(true);
    setSearchErrorMessage(null);
    resetLocationPermissionNeedsSettings();

    const locationCapture = await captureLocation();
    if (locationCapture.status === 'permission_denied') {
      setSearchErrorMessage(locationCapture.message);
      return {
        canAskAgain: locationCapture.canAskAgain,
        message: locationCapture.message,
        status: 'permission_denied',
      };
    }

    if (locationCapture.status === 'error') {
      setSearchErrorMessage(locationCapture.message);
      return {
        error: locationCapture.error,
        message: locationCapture.message,
        status: 'location_error',
      };
    }

    const coords = {
      lat: locationCapture.coordinates.latitude,
      lng: locationCapture.coordinates.longitude,
    };
    setReferenceCoords(coords);

    let didAttemptPlacesQuery = false;
    let didSyncMonthlyUsageSnapshot = false;

    try {
      setIsSearchingNearbyRestaurants(true);
      didAttemptPlacesQuery = true;

      const { restaurants, usageSnapshot } = await searchAndCacheNearbyRestaurants({
        latitude: coords.lat,
        longitude: coords.lng,
        radius: 5000,
      });
      didSyncMonthlyUsageSnapshot = syncMonthlyUsageSnapshot(queryClient, usageSnapshot);

      setNearbyResults(restaurants);
      return {
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
      setSearchErrorMessage(message);
      return {
        error,
        limitPayload,
        message,
        status: 'error',
      };
    } finally {
      setIsSearchingNearbyRestaurants(false);
      if (didAttemptPlacesQuery && !didSyncMonthlyUsageSnapshot) {
        await queryClient.invalidateQueries({
          queryKey: ['feature', 'usage', 'monthly'],
        });
      }
    }
  }, [
    captureLocation,
    isOnline,
    queryClient,
    resetLocationPermissionNeedsSettings,
    searchUi.isQuotaReached,
    shouldEnforceUsageLimitsClientSide,
  ]);

  return {
    clearPlacesSearchState,
    clearSearchErrorMessage,
    compactSearchLabel: searchUi.compactLabel,
    displayedNearbyRestaurants,
    displayedSavedRestaurants,
    expandedSearchLabel: searchUi.expandedLabel,
    isGettingLocation,
    isPlacesQuotaReached: searchUi.isQuotaReached,
    isSearchExpanded,
    isSearchingNearbyRestaurants,
    isSearchingRestaurants,
    loadedRestaurantRecords,
    locationPermissionNeedsSettings,
    manualLocation,
    menuItemsQuery,
    placesQueriesRemaining,
    resetLocationPermissionNeedsSettings,
    resetRestaurantSelectionFlow,
    savedEmptyDescription,
    savedEmptyTitle,
    savedRestaurantRecords,
    savedRestaurantsErrorMessage,
    savedRestaurantsLoading,
    savedRestaurantsTitle,
    searchButtonDisabled: searchUi.isSearchDisabled,
    searchByText,
    searchErrorMessage,
    searchNearby,
    searchQuery,
    setIsSearchExpanded,
    setManualLocation,
    setSearchQuery,
    shouldEnforceUsageLimitsClientSide,
    shouldQuerySavedRestaurantsBySearch,
    shouldShowPlacesUpgradePrompt,
    showNearbyPlaces,
    triggerSavedRestaurantsRefetch,
  };
}
