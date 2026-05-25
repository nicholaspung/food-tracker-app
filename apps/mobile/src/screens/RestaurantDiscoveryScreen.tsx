import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import type { Region } from 'react-native-maps';
import { useQueryClient } from '@tanstack/react-query';

import { RestaurantMapView, type RestaurantMapGroup } from '../components/maps';
import {
  BackHeaderScreenScaffold,
  CurrentLocationButton,
  LoadingState,
  PageErrorToast,
  PhotoSourceActionCards,
  SegmentedControl,
  UpgradePromptCard,
  VisitRestaurantOptionTrailing,
  VisitRestaurantSearchHeaderToggle,
  VisitRestaurantSearchOptionDescription,
  VisitRestaurantSearchSection,
  type SegmentedControlOption,
  type VisitRestaurantSearchOption,
} from '../components/shared';
import {
  extractRestaurantNamesFromImage,
  formatLimitExceededMessage,
  parseLimitExceededError,
  type RestaurantNameExtractionResponse,
  type RestaurantRecord,
  useMonthlyUsage,
} from '../features';
import { useImageSourcePicker } from '../hooks/useImageSourcePicker';
import type { PhotoPickerPermissionSource } from '../hooks/usePhotoPickerPermissions';
import { useRestaurantDiscoverySelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import { calculateDistance, formatDistance } from '../lib/googlePlaces';
import { cleanupStagedPhotoFiles, stageLocalPhotoFile } from '../lib/photoStaging';
import type { VisitRestaurantWithDistance } from '../lib/visitRestaurantSearch';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { captureObservabilityError, trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Input, ListItem, Text } from '../ui';
import {
  createAIRequestCorrelation,
  resolveAIImageErrorProperties,
} from '../features/store/aiImageObservability';

type RestaurantDiscoveryScreenProps = NativeStackScreenProps<RootStackParamList, 'RestaurantDiscovery'>;
type ImageSource = PhotoPickerPermissionSource;
type DiscoveryTab = 'search' | 'scan';
type DiscoverySearchViewMode = 'list' | 'map';

const DISCOVERY_TAB_OPTIONS: readonly SegmentedControlOption<DiscoveryTab>[] = [
  { label: 'Search', value: 'search' },
  { label: 'Scan', value: 'scan' },
];

const DISCOVERY_SEARCH_VIEW_OPTIONS: readonly SegmentedControlOption<DiscoverySearchViewMode>[] = [
  { label: 'List', value: 'list' },
  { label: 'Map', value: 'map' },
];

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  mapBody: {
    flex: 1,
    gap: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  card: {
    gap: theme.spacing.sm,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  mapModeRoot: {
    flex: 1,
  },
  mapModeControls: {
    backgroundColor: theme.colors.background.surface,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  mapCanvasWrap: {
    backgroundColor: theme.colors.background.app,
    flex: 1,
    position: 'relative',
  },
  mapFull: {
    flex: 1,
  },
  floatingSearchPanelWrap: {
    left: theme.spacing.md,
    position: 'absolute',
    right: theme.spacing.md,
    top: theme.spacing.md,
    zIndex: 3,
  },
  floatingSearchPanel: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    elevation: 3,
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    shadowColor: theme.colors.background.inverse,
    shadowOffset: {
      height: 2,
      width: 0,
    },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  mapSearchHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  floatingSearchPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  floatingSearchPanelTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  floatingSearchPanelText: {
    flex: 1,
    gap: 2,
  },
  floatingSearchPanelStatus: {
    color: theme.colors.text.secondary,
  },
  floatingSearchPanelToggle: {
    alignItems: 'center',
    borderRadius: theme.radii.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  floatingSearchPanelExpandedContent: {
    gap: theme.spacing.sm,
  },
  searchHereButtonWrap: {
    alignSelf: 'center',
    elevation: 3,
    position: 'absolute',
    shadowColor: theme.colors.background.inverse,
    shadowOffset: {
      height: 2,
      width: 0,
    },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    zIndex: 2,
  },
  locationField: {
    flex: 1,
  },
  locationInput: {
    height: theme.sizes.inputMinHeight,
    minHeight: theme.sizes.inputMinHeight,
  },
  locationAction: {
    alignSelf: 'flex-end',
    minWidth: 96,
  },
  viewModeControl: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.default,
    borderRadius: 10,
    borderWidth: 1,
    padding: 2,
  },
  viewModeSegment: {
    borderRadius: 8,
    minHeight: 38,
  },
  viewModeSegmentActive: {
    backgroundColor: theme.colors.background.surface,
    shadowColor: theme.colors.background.inverse,
    shadowOffset: {
      height: 1,
      width: 0,
    },
    shadowOpacity: 0.08,
    shadowRadius: 1,
  },
  viewModeLabel: {
    color: theme.colors.text.muted,
  },
  viewModeLabelActive: {
    color: theme.colors.text.primary,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  action: {
    flexGrow: 1,
  },
  inlineLink: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.xxs,
  },
  iconTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  extractedText: {
    lineHeight: 20,
  },
  warningPanel: {
    backgroundColor: theme.colors.status.warningBg,
    borderColor: theme.colors.status.warningBorder,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
}));

const MIN_SEARCH_HERE_MOVE_MILES = 0.15;

function hasUsableCoordinates(restaurant: RestaurantRecord): restaurant is RestaurantRecord & {
  latitude: number;
  longitude: number;
} {
  return (
    typeof restaurant.latitude === 'number' &&
    typeof restaurant.longitude === 'number' &&
    Number.isFinite(restaurant.latitude) &&
    Number.isFinite(restaurant.longitude) &&
    restaurant.latitude >= -90 &&
    restaurant.latitude <= 90 &&
    restaurant.longitude >= -180 &&
    restaurant.longitude <= 180 &&
    !(restaurant.latitude === 0 && restaurant.longitude === 0)
  );
}

function hasUsableMapCenter(region: Region): boolean {
  return (
    Number.isFinite(region.latitude) &&
    Number.isFinite(region.longitude) &&
    region.latitude >= -90 &&
    region.latitude <= 90 &&
    region.longitude >= -180 &&
    region.longitude <= 180 &&
    !(region.latitude === 0 && region.longitude === 0)
  );
}

function hasMeaningfulMapCenterMove(current: Region, previous: Region | null): boolean {
  if (!previous) {
    return true;
  }

  return calculateDistance(
    previous.latitude,
    previous.longitude,
    current.latitude,
    current.longitude,
  ) >= MIN_SEARCH_HERE_MOVE_MILES;
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildDiscoveryRestaurantSummary({ distance, restaurant }: VisitRestaurantWithDistance): string {
  const parts = [
    restaurant.cuisineType,
    distance !== null ? formatDistance(distance) : null,
    typeof restaurant.userVisitCount === 'number' && restaurant.userVisitCount > 0
      ? pluralize(restaurant.userVisitCount, 'visit', 'visits')
      : null,
    typeof restaurant.friendCount === 'number' && restaurant.friendCount > 0
      ? pluralize(restaurant.friendCount, 'friend', 'friends')
      : null,
  ].filter(Boolean);

  return parts.join(' • ') || 'Restaurant';
}

function buildDiscoveryMapGroups(
  restaurants: readonly VisitRestaurantWithDistance[],
): RestaurantMapGroup[] {
  return restaurants.flatMap((entry) => {
    const { restaurant } = entry;
    if (!hasUsableCoordinates(restaurant)) {
      return [];
    }

    const meta = [
      restaurant.isGooglePlace ? { label: 'Google Place' } : null,
      typeof restaurant.userVisitCount === 'number' && restaurant.userVisitCount > 0
        ? { label: pluralize(restaurant.userVisitCount, 'visit', 'visits') }
        : null,
      typeof restaurant.friendCount === 'number' && restaurant.friendCount > 0
        ? { label: pluralize(restaurant.friendCount, 'friend', 'friends') }
        : null,
    ].filter((value): value is { label: string } => Boolean(value));

    return [
      {
        id: restaurant.id,
        items: [
          {
            id: restaurant.id,
            meta,
            name: restaurant.cuisineType ?? 'Restaurant',
          },
        ],
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
        restaurantLocation: restaurant.location ?? restaurant.city,
        restaurantName: restaurant.name,
        summary: buildDiscoveryRestaurantSummary(entry),
      },
    ];
  });
}

function resolveConfidenceTone(confidence: string): 'success' | 'info' | 'warning' {
  if (confidence === 'high') {
    return 'success';
  }

  if (confidence === 'medium') {
    return 'info';
  }

  return 'warning';
}

function getRestaurantNameOptions(response: RestaurantNameExtractionResponse | null): string[] {
  if (!response) {
    return [];
  }

  if ('found' in response && response.found) {
    return response.options.map((option) => option.name.trim()).filter(Boolean);
  }

  if ('found' in response && response.allText?.trim()) {
    return response.allText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  return [];
}

function getStorefrontExtractionSuccessProperties(result: RestaurantNameExtractionResponse) {
  if ('error' in result) {
    return {
      found: false,
      language: null,
      optionCount: 0,
      resultType: 'not_restaurant',
    };
  }

  if (result.found) {
    return {
      found: true,
      language: result.language ?? null,
      optionCount: result.options.length,
      resultType: 'found',
    };
  }

  return {
    found: false,
    language: null,
    optionCount: 0,
    resultType: result.allText?.trim() ? 'all_text' : 'not_restaurant',
  };
}

export function RestaurantDiscoveryScreen({
  navigation,
}: RestaurantDiscoveryScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { isOnline } = useConnectivity();
  const { actualUser, user } = useAuth();
  const isActualAdmin = actualUser?.isAdmin === true;
  const isDisplayAdminUser = user?.isAdmin === true;
  const isDisplaySubscriberUser = user?.isSubscriber === true;
  const isDisplayFreeUser = !isDisplayAdminUser && !isDisplaySubscriberUser;
  const usagePreviewTier = isActualAdmin && !isDisplayAdminUser
    ? (isDisplaySubscriberUser ? 'subscriber' : 'free')
    : null;
  const monthlyUsage = useMonthlyUsage({
    viewAsTier: usagePreviewTier,
  });
  const shouldEnforceUsageLimitsClientSide = !isActualAdmin;
  const placesQueriesRemaining = isDisplayFreeUser
    ? monthlyUsage.snapshot?.remaining.placesQueriesMonthly ?? null
    : null;

  const [storefrontResult, setStorefrontResult] =
    useState<RestaurantNameExtractionResponse | null>(null);
  const [storefrontErrorMessage, setStorefrontErrorMessage] = useState<string | null>(null);
  const [isExtractingStorefront, setIsExtractingStorefront] = useState(false);
  const [activeTab, setActiveTab] = useState<DiscoveryTab>('search');
  const [searchViewMode, setSearchViewMode] = useState<DiscoverySearchViewMode>('list');
  const [mapSearchPanelExpanded, setMapSearchPanelExpanded] = useState(false);
  const [mapSearchPanelHeight, setMapSearchPanelHeight] = useState(0);
  const [latestUserMapRegion, setLatestUserMapRegion] = useState<Region | null>(null);
  const [lastMapSearchRegion, setLastMapSearchRegion] = useState<Region | null>(null);
  const [showSearchHereButton, setShowSearchHereButton] = useState(false);
  const [searchHereButtonHeight, setSearchHereButtonHeight] = useState(0);
  const [preserveMapRegionOnGroupsChange, setPreserveMapRegionOnGroupsChange] = useState(false);
  const [selectedMapGroupId, setSelectedMapGroupId] = useState<string | null>(null);
  const [mapResetSignal, setMapResetSignal] = useState(0);
  const [showStorefrontPhotoSources, setShowStorefrontPhotoSources] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const hasAutoSearchedMapNearbyRef = useRef(false);

  const { permissionNeedsSettings, pickImageAssets } = useImageSourcePicker({
    cameraBlockedMessage: 'Camera permission is blocked. Enable it in device settings.',
    cameraRequiredMessage: 'Camera permission is required to take a photo.',
    galleryBlockedMessage: 'Photo library permission is blocked. Enable it in device settings.',
    galleryRequiredMessage: 'Photo library permission is required to upload an image.',
  });

  const restaurantSelection = useRestaurantDiscoverySelectionFlow({
    autoCaptureReferenceLocation: true,
    isOnline,
    menuItemsEnabled: false,
    savedRestaurantsEnabled: true,
    selectedRestaurantId: null,
    usage: {
      enforceQuota: shouldEnforceUsageLimitsClientSide,
      isFreeTier: isDisplayFreeUser,
      placesQueriesRemaining,
    },
  });
  const { quotaDisplay, savedSuggestions, search } = restaurantSelection;
  const clearPlacesSearchState = search.clearPlacesState;
  const compactSearchLabel = search.compactLabel;
  const displayedNearbyRestaurants = search.displayedNearbyRestaurants;
  const displayedSavedRestaurants = savedSuggestions.displayedSavedRestaurants;
  const expandedSearchLabel = search.expandedLabel;
  const gpsReferenceCoords = search.gpsReferenceCoords;
  const isGettingLocation = search.isGettingLocation;
  const isPlacesQuotaReached = quotaDisplay.isPlacesQuotaReached;
  const isSearchExpanded = search.isExpanded;
  const isSearchingNearbyRestaurants = search.isSearchingNearby;
  const isSearchingRestaurants = search.isSearchingText;
  const locationPermissionNeedsSettings = search.locationPermissionNeedsSettings;
  const manualLocation = search.manualLocation;
  const flowPlacesQueriesRemaining = quotaDisplay.placesQueriesRemaining;
  const savedEmptyDescription = savedSuggestions.emptyDescription;
  const savedEmptyTitle = savedSuggestions.emptyTitle;
  const savedRestaurantsErrorMessage = savedSuggestions.errorMessage;
  const savedRestaurantsLoading = savedSuggestions.isLoading;
  const savedRestaurantsTitle = savedSuggestions.title;
  const searchButtonDisabled = search.searchButtonDisabled;
  const searchByText = search.searchByText;
  const searchErrorMessage = search.searchErrorMessage;
  const searchNearby = search.nearby;
  const searchNearbyAt = search.nearbyAt;
  const searchQuery = search.query;
  const setIsSearchExpanded = search.setExpanded;
  const setManualLocation = search.setManualLocation;
  const setSearchQuery = search.setQuery;
  const shouldShowPlacesUpgradePrompt = quotaDisplay.shouldShowPlacesUpgradePrompt;
  const showNearbyPlaces = search.showNearbyPlaces;
  const triggerSavedRestaurantsRefetch = savedSuggestions.refetch;

  const isBusyWithImage = isExtractingStorefront;
  const extractedNames = useMemo(() => getRestaurantNameOptions(storefrontResult), [storefrontResult]);
  const isSearchMapMode = activeTab === 'search' && searchViewMode === 'map';
  const currentMapRestaurants = showNearbyPlaces ? displayedNearbyRestaurants : displayedSavedRestaurants;
  const discoveryMapGroups = useMemo(
    () => buildDiscoveryMapGroups(currentMapRestaurants),
    [currentMapRestaurants],
  );
  const omittedDiscoveryMapRestaurants = currentMapRestaurants.length - discoveryMapGroups.length;
  const discoveryUserCoordinates = gpsReferenceCoords
    ? { latitude: gpsReferenceCoords.lat, longitude: gpsReferenceCoords.lng }
    : null;
  const mapSearchStatusLabel = isSearchingNearbyRestaurants || isGettingLocation
    ? 'Finding nearby places...'
    : searchErrorMessage
      ? 'Search needs attention'
      : showNearbyPlaces
        ? 'Showing search results'
        : displayedSavedRestaurants.length > 0
          ? 'Showing saved restaurants'
          : 'Nearby-first map search';
  const mapExternalTopInset =
    mapSearchPanelHeight +
    theme.spacing.sm +
    (showSearchHereButton ? searchHereButtonHeight + theme.spacing.sm : 0);

  const handleSelectRestaurant = useCallback((restaurant: RestaurantRecord) => {
    trackObservabilityEvent('FOOD_DISCOVERY_RESTAURANT_SELECTED', {
      restaurantId: restaurant.id,
      isGooglePlace: restaurant.isGooglePlace === true,
      source: 'RestaurantDiscoveryScreen',
    });
    navigation.navigate('RestaurantDiscoveryRestaurant', {
      city: restaurant.city,
      cuisineType: restaurant.cuisineType,
      friendCount: restaurant.friendCount,
      hasPendingMenuReview: restaurant.hasPendingMenuReview,
      isGooglePlace: restaurant.isGooglePlace,
      latitude: restaurant.latitude,
      location: restaurant.location,
      longitude: restaurant.longitude,
      placeId: restaurant.placeId,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      userVisitCount: restaurant.userVisitCount,
      visibility: restaurant.visibility,
    });
  }, [navigation]);

  const handleSearchViewModeChange = useCallback((nextViewMode: DiscoverySearchViewMode) => {
    setSearchViewMode(nextViewMode);
    setSelectedMapGroupId(null);
    setMapResetSignal((value) => value + 1);
    setShowSearchHereButton(false);
    setPreserveMapRegionOnGroupsChange(false);
    trackObservabilityEvent('FOOD_DISCOVERY_VIEW_MODE_CHANGED', {
      source: 'RestaurantDiscoveryScreen',
      viewMode: nextViewMode,
    });
  }, []);

  const handleDiscoveryTabChange = useCallback((nextTab: DiscoveryTab) => {
    setActiveTab(nextTab);
    if (nextTab !== 'search') {
      setSelectedMapGroupId(null);
      setShowSearchHereButton(false);
      setPreserveMapRegionOnGroupsChange(false);
    }
  }, []);

  const handleSelectedMapGroupChange = useCallback((groupId: string | null) => {
    setSelectedMapGroupId(groupId);

    if (!groupId) {
      return;
    }

    const restaurant = currentMapRestaurants.find((entry) => entry.restaurant.id === groupId)?.restaurant;
    trackObservabilityEvent('FOOD_DISCOVERY_MAP_MARKER_SELECTED', {
      isGooglePlace: restaurant?.isGooglePlace === true,
      restaurantId: groupId,
    });
  }, [currentMapRestaurants]);

  const handleOpenSelectedMapGroup = useCallback((group: RestaurantMapGroup) => {
    const restaurant = currentMapRestaurants.find((entry) => entry.restaurant.id === group.id)?.restaurant;
    if (!restaurant) {
      return;
    }

    trackObservabilityEvent('FOOD_DISCOVERY_MAP_RESTAURANT_OPENED', {
      isGooglePlace: restaurant.isGooglePlace === true,
      restaurantId: restaurant.id,
    });
    handleSelectRestaurant(restaurant);
  }, [currentMapRestaurants, handleSelectRestaurant]);

  const buildRestaurantOption = useCallback(
    (
      { restaurant, distance }: VisitRestaurantWithDistance,
      index: number,
      source: 'saved' | 'search',
    ): VisitRestaurantSearchOption => {
      return {
        description: (
          <VisitRestaurantSearchOptionDescription
            distance={distance}
            restaurant={restaurant}
          />
        ),
        key: restaurant.id,
        onPress: () => {
          handleSelectRestaurant(restaurant);
        },
        selected: false,
        testID: `restaurant-discovery-${source}-restaurant-option-${index}`,
        title: restaurant.name,
        trailing: <VisitRestaurantOptionTrailing restaurant={restaurant} selected={false} />,
      };
    },
    [handleSelectRestaurant],
  );

  const copyText = useCallback(async (value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      setCopyStatus('Copied.');
    } catch (error) {
      setCopyStatus(error instanceof Error ? error.message : 'Could not copy text.');
    }
  }, []);

  const runCandidateSearch = useCallback(
    async (name: string) => {
      setSearchQuery(name);
      setIsSearchExpanded(true);
      setActiveTab('search');
      trackObservabilityEvent('FOOD_DISCOVERY_EXTRACTED_NAME_SEARCH_STARTED', {
        source: 'RestaurantDiscoveryScreen',
      });
      await searchByText({ queryOverride: name });
    },
    [searchByText, setIsSearchExpanded, setSearchQuery],
  );

  const extractStorefrontName = useCallback(
    async (source: ImageSource) => {
      const requestCorrelation = createAIRequestCorrelation('storefront');
      const eventProperties = {
        analyticsSource: 'RestaurantDiscoveryStorefront',
        photoSource: source,
        requestCorrelation,
      };

      if (!isOnline) {
        setStorefrontErrorMessage('Restaurant name extraction requires internet connection.');
        trackObservabilityEvent('FOOD_DISCOVERY_STOREFRONT_OFFLINE_BLOCKED', eventProperties);
        return;
      }

      setIsExtractingStorefront(true);
      setStorefrontErrorMessage(null);
      setStorefrontResult(null);
      setCopyStatus(null);
      trackObservabilityEvent('FOOD_DISCOVERY_STOREFRONT_EXTRACTION_STARTED', eventProperties);

      let imageInput: Awaited<ReturnType<typeof stageLocalPhotoFile>> | null = null;
      try {
        const pickResult = await pickImageAssets({ source });
        if (pickResult.status === 'permission_denied') {
          trackObservabilityEvent('FOOD_DISCOVERY_STOREFRONT_IMAGE_PERMISSION_DENIED', {
            ...eventProperties,
            canAskAgain: pickResult.canAskAgain,
          });
          setStorefrontErrorMessage(pickResult.message);
          return;
        }

        if (pickResult.status === 'canceled') {
          trackObservabilityEvent('FOOD_DISCOVERY_STOREFRONT_IMAGE_PICK_CANCELED', eventProperties);
          return;
        }

        imageInput = await stageLocalPhotoFile(pickResult.assets[0], {
          fallbackPrefix: source === 'camera' ? 'storefront-camera' : 'storefront-image',
          maxLongEdge: 2048,
        });
        if (!imageInput) {
          throw new Error('Could not prepare the selected image.');
        }

        const result = await extractRestaurantNamesFromImage({
          ...imageInput,
          requestCorrelation,
        });
        setStorefrontResult(result);
        trackObservabilityEvent('FOOD_DISCOVERY_STOREFRONT_EXTRACTION_SUCCEEDED', {
          ...eventProperties,
          ...getStorefrontExtractionSuccessProperties(result),
        });
      } catch (error) {
        const limitPayload = parseLimitExceededError(error);
        if (limitPayload) {
          trackObservabilityEvent('USAGE_LIMIT_REACHED', {
            enforcement: 'server',
            limit: limitPayload.limit,
            metric: limitPayload.metric,
            monthKey: limitPayload.monthKey,
            remaining: limitPayload.remaining,
            source: 'RestaurantDiscoveryStorefront',
            used: limitPayload.used,
            userTier: limitPayload.userTier ?? null,
          });
        }

        const resolvedErrorProperties = resolveAIImageErrorProperties(error);
        const message = limitPayload
          ? formatLimitExceededMessage(limitPayload)
          : typeof resolvedErrorProperties.errorMessage === 'string'
            ? resolvedErrorProperties.errorMessage
            : 'Could not extract a restaurant name.';

        trackObservabilityEvent('FOOD_DISCOVERY_STOREFRONT_EXTRACTION_FAILED', {
          ...eventProperties,
          ...resolvedErrorProperties,
          errorMessage: message,
        });

        if (!limitPayload) {
          captureObservabilityError(error, {
            ...eventProperties,
            ...resolvedErrorProperties,
            source: 'RestaurantDiscoveryStorefront',
          });
        }

        setStorefrontErrorMessage(message);
      } finally {
        setIsExtractingStorefront(false);
        if (imageInput) {
          await cleanupStagedPhotoFiles([imageInput]);
        }
        void queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] });
      }
    },
    [isOnline, pickImageAssets, queryClient],
  );

  const handleManualAdd = useCallback((name?: string) => {
    navigation.navigate('CreateVisitAddRestaurant', {
      initialLocation: manualLocation.trim() || undefined,
      initialRestaurantName: name?.trim() || searchQuery.trim() || extractedNames[0],
      returnTo: 'RestaurantDiscoveryRestaurant',
    });
  }, [extractedNames, manualLocation, navigation, searchQuery]);

  const handleClearPlacesSearchState = useCallback(() => {
    clearPlacesSearchState();
    setSelectedMapGroupId(null);
    setMapResetSignal((value) => value + 1);
    setLatestUserMapRegion(null);
    setLastMapSearchRegion(null);
    setShowSearchHereButton(false);
    setPreserveMapRegionOnGroupsChange(false);
  }, [clearPlacesSearchState]);

  const handleUseCurrentLocationPress = useCallback(async () => {
    await searchNearby();
  }, [searchNearby]);

  const handleMapSearchPanelLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setMapSearchPanelHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight,
    );
  }, []);

  const handleSearchHereButtonLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setSearchHereButtonHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight,
    );
  }, []);

  const toggleMapSearchPanel = useCallback(() => {
    setMapSearchPanelExpanded((expanded) => !expanded);
  }, []);

  const handleUserMapRegionChangeComplete = useCallback((region: Region) => {
    setLatestUserMapRegion(region);

    if (
      !isSearchMapMode ||
      !isOnline ||
      isSearchingNearbyRestaurants ||
      !hasUsableMapCenter(region) ||
      !hasMeaningfulMapCenterMove(region, lastMapSearchRegion)
    ) {
      setShowSearchHereButton(false);
      return;
    }

    setShowSearchHereButton((isVisible) => {
      if (!isVisible) {
        trackObservabilityEvent('FOOD_DISCOVERY_MAP_SEARCH_HERE_SHOWN', {
          source: 'RestaurantDiscoveryScreen',
        });
      }
      return true;
    });
  }, [
    isOnline,
    isSearchMapMode,
    isSearchingNearbyRestaurants,
    lastMapSearchRegion,
  ]);

  const handleSearchHerePress = useCallback(async () => {
    if (
      !latestUserMapRegion ||
      !hasUsableMapCenter(latestUserMapRegion) ||
      !isOnline ||
      searchButtonDisabled
    ) {
      return;
    }

    const coords = {
      lat: latestUserMapRegion.latitude,
      lng: latestUserMapRegion.longitude,
    };
    const existingResultCount = displayedNearbyRestaurants.length;
    trackObservabilityEvent('FOOD_DISCOVERY_MAP_SEARCH_HERE_STARTED', {
      existingResultCount,
      source: 'RestaurantDiscoveryScreen',
    });

    setPreserveMapRegionOnGroupsChange(true);
    const result = await searchNearbyAt(coords, { appendResults: true });

    if (result.status === 'success') {
      const totalResultCount = new Set([
        ...displayedNearbyRestaurants.map((entry) => entry.restaurant.id),
        ...result.results.map((restaurant) => restaurant.id),
      ]).size;
      setLastMapSearchRegion(latestUserMapRegion);
      setShowSearchHereButton(false);
      setSelectedMapGroupId(null);

      trackObservabilityEvent('FOOD_DISCOVERY_MAP_SEARCH_HERE_SUCCEEDED', {
        resultCount: result.results.length,
        source: 'RestaurantDiscoveryScreen',
        totalResultCount,
      });
    } else {
      setPreserveMapRegionOnGroupsChange(false);
      trackObservabilityEvent('FOOD_DISCOVERY_MAP_SEARCH_HERE_FAILED', {
        source: 'RestaurantDiscoveryScreen',
        status: result.status,
      });
    }
  }, [
    displayedNearbyRestaurants,
    isOnline,
    latestUserMapRegion,
    searchButtonDisabled,
    searchNearbyAt,
  ]);

  useEffect(() => {
    if (
      activeTab !== 'search' ||
      searchViewMode !== 'map' ||
      showNearbyPlaces ||
      hasAutoSearchedMapNearbyRef.current ||
      !isOnline ||
      searchButtonDisabled ||
      isSearchingNearbyRestaurants ||
      isGettingLocation
    ) {
      return;
    }

    hasAutoSearchedMapNearbyRef.current = true;
    trackObservabilityEvent('FOOD_DISCOVERY_MAP_AUTO_NEARBY_STARTED', {
      source: 'RestaurantDiscoveryScreen',
    });
    void searchNearby();
  }, [
    activeTab,
    isGettingLocation,
    isOnline,
    isSearchingNearbyRestaurants,
    searchButtonDisabled,
    searchNearby,
    searchViewMode,
    showNearbyPlaces,
  ]);

  const discoveryTabControl = (
    <SegmentedControl
      getOptionTestID={(value) => `restaurant-discovery-tab-${value}`}
      onChange={handleDiscoveryTabChange}
      options={DISCOVERY_TAB_OPTIONS}
      value={activeTab}
    />
  );

  const searchViewModeControl = (
    <SegmentedControl
      activeLabelStyle={styles.viewModeLabelActive}
      activeSegmentStyle={styles.viewModeSegmentActive}
      containerStyle={styles.viewModeControl}
      getOptionTestID={(value) => `restaurant-discovery-search-view-mode-${value}`}
      labelStyle={styles.viewModeLabel}
      onChange={handleSearchViewModeChange}
      options={DISCOVERY_SEARCH_VIEW_OPTIONS}
      segmentStyle={styles.viewModeSegment}
      value={searchViewMode}
    />
  );

  const mapSearchPanel = (
    <View
      onLayout={handleMapSearchPanelLayout}
      style={styles.floatingSearchPanel}
      testID="restaurant-discovery-map-search-panel"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: mapSearchPanelExpanded }}
        onPress={toggleMapSearchPanel}
        style={styles.floatingSearchPanelHeader}
        testID="restaurant-discovery-map-search-panel-toggle"
      >
        <View style={styles.floatingSearchPanelTitleRow}>
          <Ionicons color={theme.colors.text.info} name="search-outline" size={18} />
          <View style={styles.floatingSearchPanelText}>
            <Text variant="label">Search for food places</Text>
            <Text numberOfLines={1} style={styles.floatingSearchPanelStatus} variant="bodySmTight">
              {mapSearchStatusLabel}
            </Text>
          </View>
        </View>
        <View style={styles.floatingSearchPanelToggle}>
          <Ionicons
            color={theme.colors.text.secondary}
            name={mapSearchPanelExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={18}
          />
        </View>
      </Pressable>

      {mapSearchPanelExpanded ? (
        <View
          style={styles.floatingSearchPanelExpandedContent}
          testID="restaurant-discovery-map-search-panel-expanded-content"
        >
          <Input
            autoCapitalize="words"
            label="Place name or type"
            onChangeText={setSearchQuery}
            placeholder="e.g., Starbucks, cafe, bakery"
            value={searchQuery}
          />
          <View style={styles.row}>
            <Input
              autoCapitalize="words"
              containerStyle={styles.locationField}
              inputStyle={styles.locationInput}
              label="Location (city, zip, or address)"
              onChangeText={setManualLocation}
              placeholder="e.g., 90210, Los Angeles"
              value={manualLocation}
            />
            <CurrentLocationButton
              accessibilityLabel="Use current location"
              disabled={searchButtonDisabled}
              loading={isSearchingNearbyRestaurants || isGettingLocation}
              onPress={() => {
                void handleUseCurrentLocationPress();
              }}
              style={styles.locationAction}
              variant="inline"
            />
          </View>
          <Button
            disabled={searchButtonDisabled}
            label={isSearchingRestaurants ? 'Searching...' : expandedSearchLabel}
            loading={isSearchingRestaurants}
            onPress={() => {
              void searchByText();
            }}
          />
          {isOnline && isPlacesQuotaReached ? (
            <Text tone="warning">
              {shouldEnforceUsageLimitsClientSide
                ? 'Monthly food place search limit reached.'
                : 'Monthly food place search limit reached in preview mode. Admin access is still allowed.'}
            </Text>
          ) : null}
          {shouldShowPlacesUpgradePrompt ? (
            <UpgradePromptCard
              description={
                isPlacesQuotaReached
                  ? "You have reached this month's free search limit. Subscriber accounts have higher limits for place search."
                  : `Only ${flowPlacesQueriesRemaining} food place searches left this month. Subscriber accounts have higher limits for place search.`
              }
              title={isPlacesQuotaReached ? 'Free limit reached' : 'You are close to your free limit'}
            />
          ) : null}
          {!isOnline ? <Text tone="warning">Online search is unavailable while offline.</Text> : null}
          {showNearbyPlaces ? (
            <Button
              label="Clear Search Results"
              onPress={handleClearPlacesSearchState}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const restaurantMapView = (
    <RestaurantMapView
      analyticsSource="RestaurantDiscoveryMapView"
      emptyDescription="Search nearby places when online or choose a saved restaurant with a location."
      emptyTitle="No restaurants to map"
      errorMessage={null}
      externalTopInset={isSearchMapMode ? mapExternalTopInset : 0}
      groups={discoveryMapGroups}
      hiddenLocationPluralLabel="restaurants"
      hiddenLocationSingularLabel="restaurant"
      initialUserCoordinates={discoveryUserCoordinates}
      loading={isSearchingNearbyRestaurants || isGettingLocation}
      mapTestID="restaurant-discovery-map"
      omittedWithoutCoordinates={omittedDiscoveryMapRestaurants}
      onOpenSelectedGroup={handleOpenSelectedMapGroup}
      onRetry={() => {
        void searchNearby();
      }}
      onSelectedGroupChange={handleSelectedMapGroupChange}
      onUserRegionChangeComplete={handleUserMapRegionChangeComplete}
      preserveRegionOnGroupsChange={isSearchMapMode && preserveMapRegionOnGroupsChange}
      resetSignal={mapResetSignal}
      selectedGroupActionLabel="Open Restaurant"
      selectedGroupId={selectedMapGroupId}
      style={styles.mapFull}
      testID="restaurant-discovery-map-view"
    />
  );

  return (
    <BackHeaderScreenScaffold
      bodyStyle={isSearchMapMode ? styles.mapBody : undefined}
      onBackPress={() => {
        navigation.goBack();
      }}
      scroll={!isSearchMapMode}
      subtitle="Search food places, read storefronts, and add menu items."
      title="Food Discovery"
      testID="restaurant-discovery-screen"
    >
      {isSearchMapMode ? (
        <View style={styles.mapModeRoot}>
          <View style={styles.mapModeControls}>
            {discoveryTabControl}
            {searchViewModeControl}
          </View>
          <View style={styles.mapCanvasWrap}>
            {restaurantMapView}
            {showSearchHereButton ? (
              <View
                onLayout={handleSearchHereButtonLayout}
                style={[
                  styles.searchHereButtonWrap,
                  { top: mapSearchPanelHeight + theme.spacing.lg },
                ]}
                testID="restaurant-discovery-map-search-here-wrap"
              >
                <Button
                  disabled={searchButtonDisabled || !isOnline || isSearchingNearbyRestaurants}
                  label={isSearchingNearbyRestaurants ? 'Searching...' : 'Search Here'}
                  loading={isSearchingNearbyRestaurants}
                  onPress={() => {
                    void handleSearchHerePress();
                  }}
                  testID="restaurant-discovery-map-search-here"
                  variant="secondary"
                />
              </View>
            ) : null}
            <View style={styles.floatingSearchPanelWrap}>
              {mapSearchPanel}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          {discoveryTabControl}

          {activeTab === 'search' ? (
            <>
              {searchViewModeControl}

              <VisitRestaurantSearchSection
                connectivityWarningMessage={!isOnline ? 'Online search is unavailable while offline.' : null}
                footerContent={
                  isSearchExpanded ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        handleManualAdd();
                      }}
                      style={styles.inlineLink}
                      testID="restaurant-discovery-add-restaurant-link"
                    >
                      <Text tone="brand">Add new restaurant</Text>
                    </Pressable>
                  ) : null
                }
                headerAccessory={
                  <VisitRestaurantSearchHeaderToggle
                    expanded={isSearchExpanded}
                    onPress={() => {
                      setIsSearchExpanded((current) => !current);
                    }}
                    testID="restaurant-discovery-search-toggle"
                  />
                }
                isSearchResultsLoading={isSearchingRestaurants || isSearchingNearbyRestaurants || isGettingLocation}
                locationPermissionNeedsSettings={locationPermissionNeedsSettings}
                manualLocation={manualLocation}
                onClearSearchResults={handleClearPlacesSearchState}
                onManualLocationChange={setManualLocation}
                onOpenLocationSettings={() => {
                  void Linking.openSettings();
                }}
                onRetrySavedResults={() => {
                  void triggerSavedRestaurantsRefetch();
                }}
                onSearchPress={() => {
                  void searchByText();
                }}
                onSearchQueryChange={setSearchQuery}
                onUseCurrentLocationPress={() => {
                  void handleUseCurrentLocationPress();
                }}
                quotaWarningMessage={
                  isOnline && isPlacesQuotaReached
                    ? shouldEnforceUsageLimitsClientSide
                      ? 'Monthly food place search limit reached.'
                      : 'Monthly food place search limit reached in preview mode. Admin access is still allowed.'
                    : null
                }
                savedEmptyDescription={savedEmptyDescription}
                savedEmptyTitle={savedEmptyTitle}
                savedOptions={displayedSavedRestaurants.map((restaurant, index) =>
                  buildRestaurantOption(restaurant, index, 'saved'),
                )}
                savedResultsErrorMessage={savedRestaurantsErrorMessage}
                savedResultsLoading={savedRestaurantsLoading}
                savedResultsTitle={savedRestaurantsTitle}
                searchButtonDisabled={searchButtonDisabled}
                searchButtonLabel={isSearchExpanded ? expandedSearchLabel : compactSearchLabel}
                searchButtonLoading={isSearchingRestaurants}
                searchErrorMessage={searchErrorMessage}
                searchInputsMode={isSearchExpanded ? 'full' : 'compact'}
                searchQuery={searchQuery}
                searchResultsOptions={displayedNearbyRestaurants.map((restaurant, index) =>
                  buildRestaurantOption(restaurant, index, 'search'),
                )}
                showSearchResults={showNearbyPlaces}
                upgradePromptDescription={
                  shouldShowPlacesUpgradePrompt
                    ? isPlacesQuotaReached
                      ? "You have reached this month's free search limit. Subscriber accounts have higher limits for place search."
                      : `Only ${flowPlacesQueriesRemaining} food place searches left this month. Subscriber accounts have higher limits for place search.`
                    : null
                }
                upgradePromptTitle={
                  shouldShowPlacesUpgradePrompt
                    ? isPlacesQuotaReached
                      ? 'Free limit reached'
                      : 'You are close to your free limit'
                    : null
                }
              />
            </>
          ) : (
          <Card style={styles.card}>
            <View style={styles.iconTitle}>
              <Ionicons color={theme.colors.text.info} name="scan-outline" size={18} />
              <Text variant="label">Read a Storefront</Text>
            </View>
            <Text tone="secondary">
              Extract possible restaurant names from a sign, then search or copy the text.
            </Text>
            <Button
              disabled={!isOnline || isBusyWithImage}
              label="Read a Storefront"
              loading={isExtractingStorefront}
              onPress={() => {
                setShowStorefrontPhotoSources((visible) => !visible);
              }}
            />
            {showStorefrontPhotoSources ? (
              <PhotoSourceActionCards
                cameraSubtitle="Storefront"
                cameraTitle="Take Photo"
                disabled={!isOnline || isBusyWithImage}
                gallerySubtitle="Photo Library"
                galleryTitle="Upload"
                onCameraPress={() => {
                  void extractStorefrontName('camera');
                }}
                onGalleryPress={() => {
                  void extractStorefrontName('gallery');
                }}
              />
            ) : null}
            {!isOnline ? <Text tone="warning">Storefront extraction requires internet connection.</Text> : null}
            {isExtractingStorefront ? <LoadingState label="Reading restaurant text..." /> : null}
            <PageErrorToast
              errorMessage={storefrontErrorMessage}
              title="Could not read storefront"
            />
            {permissionNeedsSettings ? (
              <Button
                label="Open Settings"
                onPress={() => {
                  void Linking.openSettings();
                }}
                variant="secondary"
              />
            ) : null}

            {storefrontResult && 'error' in storefrontResult ? (
              <View style={styles.warningPanel}>
                <Text tone="warning" variant="label">No restaurant detected</Text>
                <Text tone="secondary">{storefrontResult.reason ?? 'Try a clearer photo of the sign or storefront.'}</Text>
              </View>
            ) : null}

            {storefrontResult && 'found' in storefrontResult && storefrontResult.found ? (
              <View style={styles.card}>
                <Text variant="label">Possible Names</Text>
                {storefrontResult.options.map((option) => (
                  <ListItem
                    description={
                      <View style={styles.card}>
                        <Text tone={resolveConfidenceTone(option.confidence)}>
                          {option.confidence} confidence
                        </Text>
                        {option.reason ? <Text tone="secondary">{option.reason}</Text> : null}
                        <View style={styles.wrapRow}>
                          <Button
                            label="Search"
                            onPress={() => {
                              void runCandidateSearch(option.name);
                            }}
                            style={styles.action}
                          />
                          <Button
                            label="Copy"
                            onPress={() => {
                              void copyText(option.name);
                            }}
                            style={styles.action}
                            variant="secondary"
                          />
                          <Button
                            label="Add Manually"
                            onPress={() => {
                              handleManualAdd(option.name);
                            }}
                            style={styles.action}
                            variant="secondary"
                          />
                        </View>
                      </View>
                    }
                    key={option.name}
                    title={option.name}
                  />
                ))}
              </View>
            ) : null}

            {storefrontResult && 'found' in storefrontResult && !storefrontResult.found ? (
              <View style={styles.card}>
                <Text variant="label">Visible Text</Text>
                <Text style={styles.extractedText}>{storefrontResult.allText?.trim() || 'No clear text found.'}</Text>
                {storefrontResult.allText?.trim() ? (
                  <View style={styles.wrapRow}>
                    <Button
                      label="Copy Text"
                      onPress={() => {
                        void copyText(storefrontResult.allText ?? '');
                      }}
                      style={styles.action}
                      variant="secondary"
                    />
                    <Button
                      label="Add Manually"
                      onPress={() => {
                        handleManualAdd(extractedNames[0]);
                      }}
                      style={styles.action}
                      variant="secondary"
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
            {copyStatus ? <Text tone="secondary">{copyStatus}</Text> : null}
          </Card>
        )}
        </View>
      )}
    </BackHeaderScreenScaffold>
  );
}
