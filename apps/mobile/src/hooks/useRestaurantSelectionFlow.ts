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
  resolveRestaurantTextSearchPreflight,
  resolveRestaurantNearbySearchPreflight,
  runRestaurantNearbyCoordinateSearch,
  runRestaurantNearbySearch,
  runRestaurantTextSearch,
  RESTAURANT_SUGGESTIONS_LIMIT,
  type RestaurantNearbySearchResult,
  type RestaurantTextSearchResult,
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
  gpsReferenceCoords: VisitRestaurantReferenceCoords | null;
  locationPermissionNeedsSettings: boolean;
  manualLocation: string;
  menuItemsQuery: UseQueryResult<MenuItemRecord[], Error>;
  placesQueriesRemaining: number | null;
  referenceCoords: VisitRestaurantReferenceCoords | null;
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
  searchNearbyAt: (
    coords: VisitRestaurantReferenceCoords,
    options?: { appendResults?: boolean },
  ) => Promise<NearbyRestaurantSearchResult>;
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

interface RestaurantSelectionSavedSuggestions {
  displayedSavedRestaurants: VisitRestaurantWithDistance[];
  emptyDescription: string;
  emptyTitle: string;
  errorMessage: string | null;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
  title: string;
}

interface RestaurantSelectionSearchActions {
  clearErrorMessage: () => void;
  clearPlacesState: () => void;
  compactLabel: string;
  displayedNearbyRestaurants: VisitRestaurantWithDistance[];
  expandedLabel: string;
  isExpanded: boolean;
  isGettingLocation: boolean;
  gpsReferenceCoords: VisitRestaurantReferenceCoords | null;
  isSearchingNearby: boolean;
  isSearchingText: boolean;
  locationPermissionNeedsSettings: boolean;
  manualLocation: string;
  nearby: () => Promise<NearbyRestaurantSearchResult>;
  nearbyAt: (
    coords: VisitRestaurantReferenceCoords,
    options?: { appendResults?: boolean },
  ) => Promise<NearbyRestaurantSearchResult>;
  query: string;
  referenceCoords: VisitRestaurantReferenceCoords | null;
  searchByText: (options?: {
    collapseAfterSearch?: boolean;
    queryOverride?: string;
  }) => Promise<TextRestaurantSearchResult>;
  searchButtonDisabled: boolean;
  searchErrorMessage: string | null;
  setExpanded: Dispatch<SetStateAction<boolean>>;
  setManualLocation: Dispatch<SetStateAction<string>>;
  setQuery: Dispatch<SetStateAction<string>>;
  showNearbyPlaces: boolean;
}

interface RestaurantSelectionMenuItems {
  loadedRestaurantRecords: RestaurantRecord[];
  query: UseQueryResult<MenuItemRecord[], Error>;
}

interface RestaurantSelectionQuotaDisplay {
  isPlacesQuotaReached: boolean;
  placesQueriesRemaining: number | null;
  shouldShowPlacesUpgradePrompt: boolean;
}

interface RestaurantSelectionConceptInterfaces {
  menuItems: RestaurantSelectionMenuItems;
  quotaDisplay: RestaurantSelectionQuotaDisplay;
  savedSuggestions: RestaurantSelectionSavedSuggestions;
  search: RestaurantSelectionSearchActions;
}

interface PhotoProcessingRestaurantSelectionFlowResult extends RestaurantSelectionConceptInterfaces {
  reset: () => void;
}

type CreateVisitRestaurantSelectionFlowResult = RestaurantSelectionConceptInterfaces;
type RestaurantSearchOnlySelectionFlowResult = Omit<RestaurantSelectionConceptInterfaces, 'menuItems'>;

export type TextRestaurantSearchResult = RestaurantTextSearchResult;

export type NearbyRestaurantSearchResult = RestaurantNearbySearchResult;

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
  const [gpsReferenceCoords, setGpsReferenceCoords] = useState<VisitRestaurantReferenceCoords | null>(null);
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
    setGpsReferenceCoords(null);
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

      const capturedCoords = {
        lat: locationCapture.coordinates.latitude,
        lng: locationCapture.coordinates.longitude,
      };
      setReferenceCoords(capturedCoords);
      setGpsReferenceCoords(capturedCoords);
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
      const effectiveSearchQuery = queryOverride?.trim() ?? trimmedSearchQuery;
      const preflight = resolveRestaurantTextSearchPreflight({
        isOnline,
        isQuotaReached: searchUi.isQuotaReached,
        locationText: manualLocation,
        query: effectiveSearchQuery,
        shouldEnforceUsageLimitsClientSide,
      });
      if (!('ok' in preflight)) {
        setSearchErrorMessage(preflight.message);
        return preflight;
      }

      if (collapseAfterSearch) {
        setIsSearchExpanded(false);
      }

      setIsSearchingRestaurants(true);
      setShowNearbyPlaces(true);
      setSearchErrorMessage(null);
      resetLocationPermissionNeedsSettings();

      const result = await runRestaurantTextSearch({
        effectiveReferenceCoords,
        isOnline,
        isQuotaReached: searchUi.isQuotaReached,
        locationText: manualLocation,
        query: effectiveSearchQuery,
        queryClient,
        searchByText: searchAndCacheRestaurantsByText,
        shouldEnforceUsageLimitsClientSide,
      });

      if (result.status === 'success') {
        setReferenceCoords(result.referenceCoords);
        setSearchResults(result.results);
      } else {
        setSearchErrorMessage(result.message);
      }

      try {
        return result;
      } finally {
        setIsSearchingRestaurants(false);
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
    const preflight = resolveRestaurantNearbySearchPreflight({
      isOnline,
      isQuotaReached: searchUi.isQuotaReached,
      shouldEnforceUsageLimitsClientSide,
    });
    if (!('ok' in preflight)) {
      setSearchErrorMessage(preflight.message);
      return preflight;
    }

    setShowNearbyPlaces(true);
    setSearchErrorMessage(null);
    resetLocationPermissionNeedsSettings();

    try {
      const result = await runRestaurantNearbySearch({
        captureLocation,
        isOnline,
        isQuotaReached: searchUi.isQuotaReached,
        queryClient,
        searchNearby: async (params) => {
          setIsSearchingNearbyRestaurants(true);
          return searchAndCacheNearbyRestaurants(params);
        },
        shouldEnforceUsageLimitsClientSide,
      });

      if ('referenceCoords' in result) {
        setReferenceCoords(result.referenceCoords);
        setGpsReferenceCoords(result.referenceCoords);
      }

      if (result.status === 'success') {
        setNearbyResults(result.results);
      } else {
        setSearchErrorMessage(result.message);
      }

      return result;
    } finally {
      setIsSearchingNearbyRestaurants(false);
    }
  }, [
    captureLocation,
    isOnline,
    queryClient,
    resetLocationPermissionNeedsSettings,
    searchUi.isQuotaReached,
    shouldEnforceUsageLimitsClientSide,
  ]);

  const searchNearbyAt = useCallback(async (
    coords: VisitRestaurantReferenceCoords,
    { appendResults = true }: { appendResults?: boolean } = {},
  ): Promise<NearbyRestaurantSearchResult> => {
    const preflight = resolveRestaurantNearbySearchPreflight({
      isOnline,
      isQuotaReached: searchUi.isQuotaReached,
      shouldEnforceUsageLimitsClientSide,
    });
    if (!('ok' in preflight)) {
      setSearchErrorMessage(preflight.message);
      return preflight;
    }

    setShowNearbyPlaces(true);
    setSearchErrorMessage(null);
    resetLocationPermissionNeedsSettings();
    setIsSearchingNearbyRestaurants(true);

    try {
      const result = await runRestaurantNearbyCoordinateSearch({
        coords,
        isOnline,
        isQuotaReached: searchUi.isQuotaReached,
        queryClient,
        searchNearby: searchAndCacheNearbyRestaurants,
        shouldEnforceUsageLimitsClientSide,
      });

      if ('referenceCoords' in result) {
        setReferenceCoords(result.referenceCoords);
      }

      if (result.status === 'success') {
        setNearbyResults((currentResults) =>
          appendResults
            ? dedupeVisitRestaurants([...currentResults, ...result.results])
            : result.results,
        );
      } else {
        setSearchErrorMessage(result.message);
      }

      return result;
    } finally {
      setIsSearchingNearbyRestaurants(false);
    }
  }, [
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
    gpsReferenceCoords,
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
    referenceCoords: effectiveReferenceCoords,
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
    searchNearbyAt,
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

function buildRestaurantSelectionConceptInterfaces(
  flow: UseRestaurantSelectionFlowResult,
): RestaurantSelectionConceptInterfaces {
  return {
    menuItems: {
      loadedRestaurantRecords: flow.loadedRestaurantRecords,
      query: flow.menuItemsQuery,
    },
    quotaDisplay: {
      isPlacesQuotaReached: flow.isPlacesQuotaReached,
      placesQueriesRemaining: flow.placesQueriesRemaining,
      shouldShowPlacesUpgradePrompt: flow.shouldShowPlacesUpgradePrompt,
    },
    savedSuggestions: {
      displayedSavedRestaurants: flow.displayedSavedRestaurants,
      emptyDescription: flow.savedEmptyDescription,
      emptyTitle: flow.savedEmptyTitle,
      errorMessage: flow.savedRestaurantsErrorMessage,
      isLoading: flow.savedRestaurantsLoading,
      refetch: flow.triggerSavedRestaurantsRefetch,
      title: flow.savedRestaurantsTitle,
    },
    search: {
      clearErrorMessage: flow.clearSearchErrorMessage,
      clearPlacesState: flow.clearPlacesSearchState,
      compactLabel: flow.compactSearchLabel,
      displayedNearbyRestaurants: flow.displayedNearbyRestaurants,
      expandedLabel: flow.expandedSearchLabel,
      gpsReferenceCoords: flow.gpsReferenceCoords,
      isExpanded: flow.isSearchExpanded,
      isGettingLocation: flow.isGettingLocation,
      isSearchingNearby: flow.isSearchingNearbyRestaurants,
      isSearchingText: flow.isSearchingRestaurants,
      locationPermissionNeedsSettings: flow.locationPermissionNeedsSettings,
      manualLocation: flow.manualLocation,
      nearby: flow.searchNearby,
      nearbyAt: flow.searchNearbyAt,
      query: flow.searchQuery,
      referenceCoords: flow.referenceCoords,
      searchByText: flow.searchByText,
      searchButtonDisabled: flow.searchButtonDisabled,
      searchErrorMessage: flow.searchErrorMessage,
      setExpanded: flow.setIsSearchExpanded,
      setManualLocation: flow.setManualLocation,
      setQuery: flow.setSearchQuery,
      showNearbyPlaces: flow.showNearbyPlaces,
    },
  };
}

export function useCreateVisitRestaurantSelectionFlow(
  options: UseRestaurantSelectionFlowOptions,
): CreateVisitRestaurantSelectionFlowResult {
  const flow = useRestaurantSelectionFlow(options);

  return buildRestaurantSelectionConceptInterfaces(flow);
}

export function usePhotoProcessingRestaurantSelectionFlow(
  options: UseRestaurantSelectionFlowOptions,
): PhotoProcessingRestaurantSelectionFlowResult {
  const flow = useRestaurantSelectionFlow(options);

  return {
    ...buildRestaurantSelectionConceptInterfaces(flow),
    reset: flow.resetRestaurantSelectionFlow,
  };
}

export function useRestaurantDiscoverySelectionFlow(
  options: UseRestaurantSelectionFlowOptions,
): RestaurantSearchOnlySelectionFlowResult {
  const flow = useRestaurantSelectionFlow(options);
  const { menuItems: _menuItems, ...concepts } = buildRestaurantSelectionConceptInterfaces(flow);

  return concepts;
}

export const useTastingPlanRestaurantSelectionFlow =
  useRestaurantDiscoverySelectionFlow;
