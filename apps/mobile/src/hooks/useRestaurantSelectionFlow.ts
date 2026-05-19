import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import {
  formatLimitExceededMessage,
  parseLimitExceededError,
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
  type VisitRestaurantReferenceCoords,
  type VisitRestaurantWithDistance,
} from '../lib/visitRestaurantSearch';
import {
  buildDisplayedNearbyRestaurants,
  buildDisplayedSavedRestaurants,
  buildLoadedRestaurantRecords,
  buildRecentRestaurantsQueryOptions,
  buildRestaurantMenuItemsQueryOptions,
  resolveSavedRestaurantsUiState,
  syncMonthlyUsageSnapshot,
  RESTAURANT_SUGGESTIONS_LIMIT,
} from '../features/restaurants/restaurantSelection';

const FREE_SEARCH_WARNING_THRESHOLD = 2;

interface RestaurantSelectionUsageOptions {
  enforceQuota: boolean;
  isFreeTier: boolean;
  placesQueriesRemaining: number | null;
}

interface UseSavedRestaurantSuggestionsOptions {
  enabled: boolean;
  hasReferenceCoords?: boolean;
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
  autoCaptureReferenceLocation?: boolean;
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
    queryOverride?: string;
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

export {
  buildRestaurantMenuItemsQueryOptions,
  buildRestaurantSearchQueryOptions,
} from '../features/restaurants/restaurantSelection';

export function useSavedRestaurantSuggestions({
  enabled,
  hasReferenceCoords = false,
  recentLimit = RESTAURANT_SUGGESTIONS_LIMIT,
  savedRestaurantsEmptyDescription = 'Search nearby places or add a new restaurant to start.',
  searchQuery,
}: UseSavedRestaurantSuggestionsOptions): UseSavedRestaurantSuggestionsResult {
  const trimmedSearchQuery = searchQuery.trim();
  const recentRestaurantsQuery = useQuery<RestaurantRecord[]>(
    buildRecentRestaurantsQueryOptions({
      enabled,
      limit: recentLimit,
      search: trimmedSearchQuery,
    }),
  );

  const savedRestaurantRecords = useMemo(() => {
    return recentRestaurantsQuery.data ?? [];
  }, [recentRestaurantsQuery.data]);

  const savedRestaurantsUiState = useMemo(
    () =>
      resolveSavedRestaurantsUiState({
        savedRestaurantsEmptyDescription,
        hasReferenceCoords,
        hasSearchQuery: Boolean(trimmedSearchQuery),
        recentRestaurantsIsError: recentRestaurantsQuery.isError,
        recentRestaurantsIsLoading: recentRestaurantsQuery.isLoading,
      }),
    [
      hasReferenceCoords,
      recentRestaurantsQuery.isError,
      recentRestaurantsQuery.isLoading,
      savedRestaurantsEmptyDescription,
      trimmedSearchQuery,
    ],
  );

  const triggerSavedRestaurantsRefetch = useCallback(() => {
    return recentRestaurantsQuery.refetch();
  }, [recentRestaurantsQuery]);

  return {
    savedEmptyDescription: savedRestaurantsUiState.savedEmptyDescription,
    savedEmptyTitle: savedRestaurantsUiState.savedEmptyTitle,
    savedRestaurantRecords,
    savedRestaurantsErrorMessage: savedRestaurantsUiState.savedRestaurantsErrorMessage,
    savedRestaurantsLoading: savedRestaurantsUiState.savedRestaurantsLoading,
    savedRestaurantsTitle: savedRestaurantsUiState.savedRestaurantsTitle,
    shouldQuerySavedRestaurantsBySearch: false,
    triggerSavedRestaurantsRefetch,
  };
}

export function useRestaurantSelectionFlow({
  autoCaptureReferenceLocation = false,
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
  const hasAutoCapturedReferenceLocationRef = useRef(false);
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
  const effectiveReferenceCoords = referenceCoords ?? fallbackReferenceCoords;

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
    hasReferenceCoords: Boolean(effectiveReferenceCoords),
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

  const displayedSavedRestaurants = useMemo(() => {
    return buildDisplayedSavedRestaurants({
      referenceCoords: effectiveReferenceCoords,
      savedRestaurantRecords,
      selectedRestaurantId,
    });
  }, [effectiveReferenceCoords, savedRestaurantRecords, selectedRestaurantId]);

  const displayedNearbyRestaurants = useMemo(() => {
    return buildDisplayedNearbyRestaurants({
      nearbyResults,
      referenceCoords: effectiveReferenceCoords,
      searchQuery,
      searchResults,
      selectedRestaurantId,
    });
  }, [
    effectiveReferenceCoords,
    nearbyResults,
    searchQuery,
    searchResults,
    selectedRestaurantId,
  ]);

  const loadedRestaurantRecords = useMemo(() => {
    return buildLoadedRestaurantRecords({
      nearbyResults,
      savedRestaurantRecords,
      searchResults,
    });
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

  useEffect(() => {
    if (
      !autoCaptureReferenceLocation ||
      !savedRestaurantsEnabled ||
      fallbackReferenceCoords ||
      referenceCoords ||
      hasAutoCapturedReferenceLocationRef.current
    ) {
      return undefined;
    }

    hasAutoCapturedReferenceLocationRef.current = true;
    let isActive = true;

    void captureLocation().then((locationCapture) => {
      if (!isActive || locationCapture.status !== 'success') {
        return;
      }

      setReferenceCoords({
        lat: locationCapture.coordinates.latitude,
        lng: locationCapture.coordinates.longitude,
      });
    });

    return () => {
      isActive = false;
    };
  }, [
    autoCaptureReferenceLocation,
    captureLocation,
    fallbackReferenceCoords,
    referenceCoords,
    savedRestaurantsEnabled,
  ]);

  const searchByText = useCallback(
    async ({
      collapseAfterSearch = false,
      queryOverride,
    }: {
      collapseAfterSearch?: boolean;
      queryOverride?: string;
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
      const effectiveSearchQuery = queryOverride?.trim() ?? trimmedSearchQuery;
      if (!effectiveSearchQuery && !trimmedLocation) {
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
          query: effectiveSearchQuery || 'food',
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
