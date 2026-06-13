import { Ionicons } from '../ui/AppIcon';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import type { Region } from 'react-native-maps';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  RestaurantMapView,
  type RestaurantMapGroup,
  type RestaurantMapSheetTabId,
} from '../components/maps';
import {
  BackHeaderScreenScaffold,
  ConfirmDestructiveModal,
  ExpandableText,
  FeatureListFooter,
  FocusedRestaurantSearchHeader,
  LoadingState,
  PageErrorToast,
  PhotoSourcePicker,
  SegmentedControl,
  UpgradePromptCard,
  VisitRestaurantOptionTrailing,
  VisitRestaurantSearchHeaderToggle,
  VisitRestaurantSearchOptionDescription,
  VisitRestaurantSearchSection,
  WantToTryBookmarkButton,
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
import { useFoodDiscoveryMapReadModel } from '../features/store/useFoodDiscoveryMapReadModel';
import { useRestaurantListWrites } from '../features/store/useRestaurantListWrites';
import { useWantToTryListRead } from '../features/store/useWantToTryListRead';
import { useImageSourcePicker } from '../hooks/useImageSourcePicker';
import type { PhotoPickerPermissionSource } from '../hooks/usePhotoPickerPermissions';
import { useRestaurantDiscoverySelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import { calculateDistance } from '../lib/googlePlaces';
import { formatDateToLocalDateString, formatLocalDateLabel } from '../lib/dateFormatting';
import { cleanupStagedPhotoFiles, stageLocalPhotoFile } from '../lib/photoStaging';
import type { VisitRestaurantWithDistance } from '../lib/visitRestaurantSearch';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { captureObservabilityError, trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { createPlatformShadow } from '../theme/shadows';
import { Button, Card, Input, Text } from '../ui';
import {
  createAIRequestCorrelation,
  resolveAIImageErrorProperties,
} from '../features/store/aiImageObservability';
import {
  deleteStorefrontScanHistoryOption,
  getStorefrontScanHistory,
  removeStorefrontScanHistoryOption,
  saveStorefrontScanHistoryEntry,
  STOREFRONT_SCAN_HISTORY_PAGE_SIZE,
  storefrontScanHistoryQueryKey,
  type StorefrontScanHistoryEntry,
} from '../features/store/storefrontScanHistory';

type RestaurantDiscoveryScreenProps = NativeStackScreenProps<RootStackParamList, 'RestaurantDiscovery'>;
type ImageSource = PhotoPickerPermissionSource;
type DiscoveryTab = 'search' | 'scan';
type DiscoverySearchViewMode = 'list' | 'map';

const CURRENT_LOCATION_LABEL = 'Current location';
const LEGACY_CURRENT_PHONE_LOCATION_LABEL = 'Your location (phone GPS)';
const LEGACY_CURRENT_PHONE_LOCATION_PARTIAL_PREFIX = 'Your location (phone GPS';

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
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    ...createPlatformShadow({
      color: theme.colors.background.inverse,
      elevation: 3,
      offset: { height: 2, width: 0 },
      opacity: 0.12,
      radius: 4,
    }),
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
    position: 'absolute',
    ...createPlatformShadow({
      color: theme.colors.background.inverse,
      elevation: 3,
      offset: { height: 2, width: 0 },
      opacity: 0.12,
      radius: 4,
    }),
    zIndex: 2,
  },
  locationField: {
    flex: 1,
  },
  locationInput: {
    height: theme.sizes.inputMinHeight,
    minHeight: theme.sizes.inputMinHeight,
  },
  currentLocationInputText: {
    color: theme.colors.text.info,
  },
  locationAction: {
    alignSelf: 'flex-end',
    height: theme.sizes.inputMinHeight,
    minHeight: theme.sizes.inputMinHeight,
    width: theme.sizes.inputMinHeight,
  },
  searchIconButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.button.primaryBg,
    borderRadius: theme.radii.md,
    justifyContent: 'center',
  },
  searchIconButtonDisabled: {
    backgroundColor: theme.colors.button.primaryDisabledBg,
    opacity: 0.9,
  },
  currentLocationOption: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.strong,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: theme.sizes.inputMinHeight,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.sm,
  },
  currentLocationOptionPressed: {
    backgroundColor: theme.colors.background.muted,
  },
  currentLocationOptionIcon: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  clearButton: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  clearButtonPressed: {
    backgroundColor: theme.colors.background.muted,
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
    ...createPlatformShadow({
      color: theme.colors.background.inverse,
      offset: { height: 1, width: 0 },
      opacity: 0.08,
      radius: 1,
    }),
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
  storefrontHistoryGroup: {
    gap: theme.spacing.sm,
  },
  storefrontHistoryHeader: {
    borderBottomColor: theme.colors.border.default,
    borderBottomWidth: 1,
    gap: theme.spacing.xxs,
    paddingBottom: theme.spacing.xs,
  },
  storefrontScanResultGroup: {
    gap: theme.spacing.sm,
  },
  storefrontScanHeader: {
    paddingTop: theme.spacing.xs,
  },
  storefrontResultPanel: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  storefrontResultHeader: {
    gap: theme.spacing.xxs,
  },
  storefrontOption: {
    gap: theme.spacing.sm,
  },
  storefrontOptionCard: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  storefrontOptionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  storefrontOptionTitleWrap: {
    flex: 1,
    gap: 0,
  },
  storefrontPrimaryActionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  storefrontSearchAction: {
    flex: 3,
  },
  storefrontCopyAction: {
    flex: 1,
  },
  storefrontCopyIconButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: theme.sizes.inputMinHeight,
  },
  storefrontCopyIconButtonPressed: {
    backgroundColor: theme.colors.background.muted,
  },
  storefrontDeleteIconButton: {
    alignItems: 'center',
    borderRadius: theme.radii.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  storefrontDeleteIconButtonPressed: {
    backgroundColor: theme.colors.background.muted,
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

interface StorefrontScanHistoryDayGroup {
  dateKey: string;
  label: string;
  entries: StorefrontScanHistoryEntry[];
}

interface PendingStorefrontNameDelete {
  entryId: string;
  name: string;
  optionIndex: number;
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

function getStorefrontScanDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  return formatDateToLocalDateString(date);
}

function formatStorefrontScanDayLabel(dateKey: string): string {
  if (dateKey === 'unknown') {
    return 'Unknown date';
  }

  const todayKey = formatDateToLocalDateString(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = formatDateToLocalDateString(yesterday);
  if (dateKey === todayKey) {
    return 'Today';
  }
  if (dateKey === yesterdayKey) {
    return 'Yesterday';
  }

  return formatLocalDateLabel(dateKey, {
    options: {
      day: 'numeric',
      month: 'short',
      weekday: 'long',
      year: 'numeric',
    },
  });
}

function formatStorefrontScanTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function groupStorefrontScanHistoryEntries(
  entries: StorefrontScanHistoryEntry[],
): StorefrontScanHistoryDayGroup[] {
  const groups: StorefrontScanHistoryDayGroup[] = [];
  const groupByDateKey = new Map<string, StorefrontScanHistoryDayGroup>();

  for (const entry of entries) {
    const dateKey = getStorefrontScanDayKey(entry.scannedAt);
    const existingGroup = groupByDateKey.get(dateKey);
    if (existingGroup) {
      existingGroup.entries.push(entry);
      continue;
    }

    const nextGroup = {
      dateKey,
      entries: [entry],
      label: formatStorefrontScanDayLabel(dateKey),
    };
    groupByDateKey.set(dateKey, nextGroup);
    groups.push(nextGroup);
  }

  return groups;
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
  const restaurantListWrites = useRestaurantListWrites();
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
  const storefrontReadsLimit = monthlyUsage.snapshot?.limits?.storefrontReadsMonthly;
  const storefrontReadsUsed = monthlyUsage.snapshot?.usage?.storefrontReads ?? 0;
  const storefrontReadsRemaining = isDisplayFreeUser
    ? monthlyUsage.snapshot?.remaining?.storefrontReadsMonthly ?? null
    : null;
  const isStorefrontQuotaReached =
    shouldEnforceUsageLimitsClientSide &&
    isDisplayFreeUser &&
    typeof storefrontReadsRemaining === 'number' &&
    storefrontReadsRemaining <= 0;
  const storefrontUsageText = monthlyUsage.snapshot
    ? typeof storefrontReadsLimit === 'number'
      ? `${Math.max(storefrontReadsLimit - storefrontReadsUsed, 0)} of ${storefrontReadsLimit} monthly storefront reads left.`
      : 'Monthly storefront reads are unlimited for this account.'
    : monthlyUsage.isLoading
      ? 'Checking monthly storefront read usage...'
      : 'Free accounts include 25 storefront reads per month. Subscribers include 100.';

  const [storefrontErrorMessage, setStorefrontErrorMessage] = useState<string | null>(null);
  const [isExtractingStorefront, setIsExtractingStorefront] = useState(false);
  const [activeTab, setActiveTab] = useState<DiscoveryTab>('search');
  const [searchViewMode, setSearchViewMode] = useState<DiscoverySearchViewMode>('list');
  const [mapSearchPanelExpanded, setMapSearchPanelExpanded] = useState(false);
  const [isMapLocationFocused, setIsMapLocationFocused] = useState(false);
  const [isMapCurrentLocationDefaultEnabled, setIsMapCurrentLocationDefaultEnabled] = useState(true);
  const [isRestaurantSearchFocused, setIsRestaurantSearchFocused] = useState(false);
  const [focusedLocationOptionsDismissSignal, setFocusedLocationOptionsDismissSignal] = useState(0);
  const [mapSearchPanelHeight, setMapSearchPanelHeight] = useState(0);
  const [latestUserMapRegion, setLatestUserMapRegion] = useState<Region | null>(null);
  const [lastMapSearchRegion, setLastMapSearchRegion] = useState<Region | null>(null);
  const [showSearchHereButton, setShowSearchHereButton] = useState(false);
  const [preserveMapRegionOnGroupsChange, setPreserveMapRegionOnGroupsChange] = useState(false);
  const [selectedMapGroupId, setSelectedMapGroupId] = useState<string | null>(null);
  const [mapSheetTab, setMapSheetTab] = useState<RestaurantMapSheetTabId>('location');
  const [mapResetSignal, setMapResetSignal] = useState(0);
  const [locallySavedRestaurantIds, setLocallySavedRestaurantIds] = useState<Set<string>>(() => new Set());
  const [locallyRemovedRestaurantIds, setLocallyRemovedRestaurantIds] = useState<Set<string>>(() => new Set());
  const [bookmarkErrorMessage, setBookmarkErrorMessage] = useState<string | null>(null);
  const [isBookmarkSubmitting, setIsBookmarkSubmitting] = useState(false);
  const [showStorefrontPhotoSources, setShowStorefrontPhotoSources] = useState(false);
  const [visibleStorefrontScanCount, setVisibleStorefrontScanCount] = useState(
    STOREFRONT_SCAN_HISTORY_PAGE_SIZE,
  );
  const [latestStorefrontScanEntry, setLatestStorefrontScanEntry] =
    useState<StorefrontScanHistoryEntry | null>(null);
  const [pendingStorefrontNameDelete, setPendingStorefrontNameDelete] =
    useState<PendingStorefrontNameDelete | null>(null);
  const [isDeletingStorefrontName, setIsDeletingStorefrontName] = useState(false);
  const [storefrontHistoryErrorMessage, setStorefrontHistoryErrorMessage] = useState<string | null>(null);
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
  const isUsingCurrentLocation = search.isUsingCurrentLocation;
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
  const searchCurrentLocationByText = search.searchCurrentLocationByText;
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
  const isMapSheetOpen = selectedMapGroupId !== null;
  const { defaultListDetailQuery, defaultListId, defaultListQuery } = useWantToTryListRead();
  const storefrontScanIdentityKey = useMemo(() => {
    const userId = user?.id ?? actualUser?.id;
    const trimmedUserId = typeof userId === 'string' ? userId.trim() : '';
    return trimmedUserId || 'current-user';
  }, [actualUser?.id, user?.id]);
  const storefrontHistoryQueryKey = useMemo(
    () => storefrontScanHistoryQueryKey(storefrontScanIdentityKey),
    [storefrontScanIdentityKey],
  );
  const storefrontHistoryQuery = useQuery<StorefrontScanHistoryEntry[]>({
    queryKey: storefrontHistoryQueryKey,
    queryFn: () => getStorefrontScanHistory(storefrontScanIdentityKey),
  });
  useEffect(() => {
    setLatestStorefrontScanEntry(null);
    setVisibleStorefrontScanCount(STOREFRONT_SCAN_HISTORY_PAGE_SIZE);
  }, [storefrontScanIdentityKey]);
  const savedRestaurantIds = useMemo(() => {
    const ids = new Set(locallySavedRestaurantIds);
    for (const item of defaultListDetailQuery.data?.items ?? []) {
      ids.add(item.restaurantId);
    }
    for (const restaurantId of locallyRemovedRestaurantIds) {
      ids.delete(restaurantId);
    }
    return ids;
  }, [defaultListDetailQuery.data?.items, locallyRemovedRestaurantIds, locallySavedRestaurantIds]);

  const isBusyWithImage = isExtractingStorefront;
  const isStorefrontReadDisabled = !isOnline || isBusyWithImage || isStorefrontQuotaReached;
  const storefrontScanEntries = useMemo(() => {
    const savedEntries = storefrontHistoryQuery.data ?? [];
    if (!latestStorefrontScanEntry) {
      return savedEntries;
    }
    if (savedEntries.some((entry) => entry.id === latestStorefrontScanEntry.id)) {
      return savedEntries;
    }
    return [latestStorefrontScanEntry, ...savedEntries];
  }, [latestStorefrontScanEntry, storefrontHistoryQuery.data]);
  const visibleStorefrontScanEntries = useMemo(
    () => storefrontScanEntries.slice(0, visibleStorefrontScanCount),
    [storefrontScanEntries, visibleStorefrontScanCount],
  );
  const storefrontScanHistoryGroups = useMemo(
    () => groupStorefrontScanHistoryEntries(visibleStorefrontScanEntries),
    [visibleStorefrontScanEntries],
  );
  const hasMoreStorefrontScanResults = visibleStorefrontScanCount < storefrontScanEntries.length;
  const shouldShowStorefrontResultsCard =
    storefrontHistoryQuery.isLoading ||
    Boolean(storefrontHistoryQuery.error) ||
    Boolean(storefrontHistoryErrorMessage) ||
    storefrontScanEntries.length > 0;
  const isSearchMapMode = activeTab === 'search' && searchViewMode === 'map';
  const currentMapRestaurants = showNearbyPlaces ? displayedNearbyRestaurants : displayedSavedRestaurants;
  const foodDiscoveryMap = useFoodDiscoveryMapReadModel({
    activeSheetTab: mapSheetTab,
    currentRestaurants: currentMapRestaurants,
    displayedSavedRestaurantsCount: displayedSavedRestaurants.length,
    isGettingLocation,
    isMapMode: isSearchMapMode,
    isOnline,
    isSearchingNearbyRestaurants,
    onSheetTabChange: setMapSheetTab,
    searchErrorMessage,
    selectedGroupId: selectedMapGroupId,
    showNearbyPlaces,
  });
  const discoveryUserCoordinates = gpsReferenceCoords
    ? { latitude: gpsReferenceCoords.lat, longitude: gpsReferenceCoords.lng }
    : null;
  const mapExternalTopInset =
    isMapSheetOpen
      ? 0
      : mapSearchPanelHeight + theme.spacing.sm;

  const handleSelectRestaurant = useCallback((restaurant: RestaurantRecord) => {
    setIsRestaurantSearchFocused(false);
    trackObservabilityEvent('FOOD_DISCOVERY_RESTAURANT_SELECTED', {
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

  const handleToggleRestaurantWantToTry = useCallback(async (restaurant: RestaurantRecord) => {
    if (savedRestaurantIds.has(restaurant.id)) {
      if (!defaultListId) {
        return;
      }

      setBookmarkErrorMessage(null);
      setIsBookmarkSubmitting(true);
      setLocallyRemovedRestaurantIds((current) => new Set(current).add(restaurant.id));
      setLocallySavedRestaurantIds((current) => {
        const next = new Set(current);
        next.delete(restaurant.id);
        return next;
      });

      try {
        const result = await restaurantListWrites.removeBookmarkFromDefaultList({
          bookmark: {
            restaurantId: restaurant.id,
          },
          defaultListId,
          sourceListId: defaultListId,
        });

        if (result.status === 'completed') {
          void defaultListQuery.refetch();
          void defaultListDetailQuery.refetch();
        }
      } catch (error) {
        setLocallyRemovedRestaurantIds((current) => {
          const next = new Set(current);
          next.delete(restaurant.id);
          return next;
        });
        setBookmarkErrorMessage(error instanceof Error ? error.message : 'Could not remove bookmark.');
      } finally {
        setIsBookmarkSubmitting(false);
      }
      return;
    }

    setBookmarkErrorMessage(null);
    setIsBookmarkSubmitting(true);
    setLocallySavedRestaurantIds((current) => new Set(current).add(restaurant.id));
    setLocallyRemovedRestaurantIds((current) => {
      const next = new Set(current);
      next.delete(restaurant.id);
      return next;
    });

    try {
      const result = await restaurantListWrites.saveRestaurantToDefaultList({
        restaurant: {
          restaurantId: restaurant.id,
        },
        optimisticRestaurant: {
          city: restaurant.city,
          cuisineType: restaurant.cuisineType,
          id: restaurant.id,
          latitude: restaurant.latitude,
          location: restaurant.location,
          longitude: restaurant.longitude,
          name: restaurant.name,
          visibility: restaurant.visibility,
        },
        sourceListId: defaultListId ?? 'default',
      });

      if (result.status === 'completed') {
        void defaultListQuery.refetch();
        if (defaultListId) {
          void defaultListDetailQuery.refetch();
        }
      }

      trackObservabilityEvent('FOOD_DISCOVERY_RESTAURANT_BOOKMARK_SAVED', {
        isGooglePlace: restaurant.isGooglePlace === true,
        status: result.status,
        source: 'RestaurantDiscoveryScreen',
      });
    } catch (error) {
      setLocallySavedRestaurantIds((current) => {
        const next = new Set(current);
        next.delete(restaurant.id);
        return next;
      });
      setBookmarkErrorMessage(error instanceof Error ? error.message : 'Could not save bookmark.');
    } finally {
      setIsBookmarkSubmitting(false);
    }
  }, [
    defaultListDetailQuery,
    defaultListId,
    defaultListQuery,
    restaurantListWrites,
    savedRestaurantIds,
  ]);

  const handleSearchViewModeChange = useCallback((nextViewMode: DiscoverySearchViewMode) => {
    setSearchViewMode(nextViewMode);
    if (nextViewMode === 'map' && !manualLocation.trim()) {
      setIsMapCurrentLocationDefaultEnabled(true);
    }
    setSelectedMapGroupId(null);
    setMapSheetTab('location');
    setMapResetSignal((value) => value + 1);
    setShowSearchHereButton(false);
    setPreserveMapRegionOnGroupsChange(false);
    trackObservabilityEvent('FOOD_DISCOVERY_VIEW_MODE_CHANGED', {
      source: 'RestaurantDiscoveryScreen',
      viewMode: nextViewMode,
    });
  }, [manualLocation]);

  const handleDiscoveryTabChange = useCallback((nextTab: DiscoveryTab) => {
    setActiveTab(nextTab);
    if (nextTab !== 'search') {
      setSelectedMapGroupId(null);
      setMapSheetTab('location');
      setShowSearchHereButton(false);
      setPreserveMapRegionOnGroupsChange(false);
    }
  }, []);

  const handleSelectedMapGroupChange = useCallback((groupId: string | null) => {
    setSelectedMapGroupId(groupId);
    setMapSheetTab('location');

    if (!groupId) {
      return;
    }

    const restaurant = currentMapRestaurants.find((entry) => entry.restaurant.id === groupId)?.restaurant;
    trackObservabilityEvent('FOOD_DISCOVERY_MAP_MARKER_SELECTED', {
      isGooglePlace: restaurant?.isGooglePlace === true,
      source: 'RestaurantDiscoveryScreen',
    });
  }, [currentMapRestaurants]);

  const handleOpenSelectedMapGroup = useCallback((group: RestaurantMapGroup) => {
    const restaurant = currentMapRestaurants.find((entry) => entry.restaurant.id === group.id)?.restaurant;
    if (!restaurant) {
      return;
    }

    trackObservabilityEvent('FOOD_DISCOVERY_MAP_RESTAURANT_OPENED', {
      isGooglePlace: restaurant.isGooglePlace === true,
      source: 'RestaurantDiscoveryScreen',
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
        trailing: (
          <View style={styles.row}>
            <VisitRestaurantOptionTrailing restaurant={restaurant} selected={false} />
            <WantToTryBookmarkButton
              accessibilityLabel={
                savedRestaurantIds.has(restaurant.id)
                  ? `${restaurant.name} is saved to Want to Try`
                  : `Save ${restaurant.name} to Want to Try`
              }
              loading={isBookmarkSubmitting}
              onPress={() => {
                void handleToggleRestaurantWantToTry(restaurant);
              }}
              saved={savedRestaurantIds.has(restaurant.id)}
              testID={`restaurant-discovery-${source}-restaurant-bookmark-${index}`}
              variant="inline"
            />
          </View>
        ),
      };
    },
    [
      handleToggleRestaurantWantToTry,
      handleSelectRestaurant,
      isBookmarkSubmitting,
      savedRestaurantIds,
      styles.row,
    ],
  );

  const copyText = useCallback(async (value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      Alert.alert('Copied', 'Copied to clipboard.');
    } catch (error) {
      captureObservabilityError(error, {
        source: 'RestaurantDiscoveryStorefrontCopy',
      });
    }
  }, []);

  const requestStorefrontNameDelete = useCallback(
    (entry: StorefrontScanHistoryEntry, name: string, optionIndex: number) => {
      setStorefrontHistoryErrorMessage(null);
      setPendingStorefrontNameDelete({
        entryId: entry.id,
        name,
        optionIndex,
      });
    },
    [],
  );

  const cancelStorefrontNameDelete = useCallback(() => {
    if (isDeletingStorefrontName) {
      return;
    }

    setPendingStorefrontNameDelete(null);
  }, [isDeletingStorefrontName]);

  const confirmStorefrontNameDelete = useCallback(async () => {
    if (!pendingStorefrontNameDelete) {
      return;
    }

    setIsDeletingStorefrontName(true);
    setStorefrontHistoryErrorMessage(null);

    try {
      const nextEntries = await deleteStorefrontScanHistoryOption(
        storefrontScanIdentityKey,
        pendingStorefrontNameDelete,
      );
      queryClient.setQueryData(storefrontHistoryQueryKey, nextEntries);
      setLatestStorefrontScanEntry((currentEntry) => {
        if (!currentEntry) {
          return currentEntry;
        }

        return removeStorefrontScanHistoryOption([currentEntry], pendingStorefrontNameDelete)[0] ?? null;
      });
      setPendingStorefrontNameDelete(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete saved scan result.';
      setStorefrontHistoryErrorMessage(message);
      captureObservabilityError(error, {
        source: 'RestaurantDiscoveryStorefrontHistoryDelete',
      });
    } finally {
      setIsDeletingStorefrontName(false);
    }
  }, [
    pendingStorefrontNameDelete,
    queryClient,
    storefrontHistoryQueryKey,
    storefrontScanIdentityKey,
  ]);

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

      if (isStorefrontQuotaReached && typeof storefrontReadsLimit === 'number') {
        const message = `Storefront read limit reached for this month (${storefrontReadsLimit}).`;
        setStorefrontErrorMessage(message);
        trackObservabilityEvent('USAGE_LIMIT_REACHED', {
          enforcement: 'client',
          limit: storefrontReadsLimit,
          metric: 'storefront_reads',
          monthKey: monthlyUsage.snapshot?.monthKey ?? null,
          remaining: storefrontReadsRemaining ?? 0,
          source: 'RestaurantDiscoveryStorefront',
          used: storefrontReadsUsed,
          userTier: monthlyUsage.snapshot?.userTier ?? null,
        });
        return;
      }

      setIsExtractingStorefront(true);
      setStorefrontErrorMessage(null);
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
        const scannedAt = new Date().toISOString();
        try {
          const savedEntries = await saveStorefrontScanHistoryEntry(storefrontScanIdentityKey, {
            result,
            scannedAt,
            source,
          });
          setLatestStorefrontScanEntry(savedEntries[0] ?? null);
          queryClient.setQueryData(storefrontHistoryQueryKey, savedEntries);
        } catch (historyError) {
          const optimisticEntry: StorefrontScanHistoryEntry = {
            id: `storefront-scan-${requestCorrelation}`,
            result,
            scannedAt,
            source,
          };
          setLatestStorefrontScanEntry(optimisticEntry);
          queryClient.setQueryData<StorefrontScanHistoryEntry[]>(
            storefrontHistoryQueryKey,
            (currentEntries = []) => [
              optimisticEntry,
              ...currentEntries,
            ].slice(0, STOREFRONT_SCAN_HISTORY_PAGE_SIZE),
          );
          captureObservabilityError(historyError, {
            requestCorrelation,
            source: 'RestaurantDiscoveryStorefrontHistory',
          });
        }
        setVisibleStorefrontScanCount(STOREFRONT_SCAN_HISTORY_PAGE_SIZE);
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
    [
      isOnline,
      isStorefrontQuotaReached,
      monthlyUsage.snapshot?.monthKey,
      monthlyUsage.snapshot?.userTier,
      pickImageAssets,
      queryClient,
      storefrontReadsLimit,
      storefrontReadsRemaining,
      storefrontReadsUsed,
      storefrontHistoryQueryKey,
      storefrontScanIdentityKey,
    ],
  );

  const handleManualAdd = useCallback((name?: string) => {
    navigation.navigate('CreateVisitAddRestaurant', {
      initialLocation: manualLocation.trim() || undefined,
      initialRestaurantName: name?.trim() || searchQuery.trim(),
      returnTo: 'RestaurantDiscoveryRestaurant',
    });
  }, [manualLocation, navigation, searchQuery]);

  const handleClearPlacesSearchState = useCallback(() => {
    clearPlacesSearchState();
    setSelectedMapGroupId(null);
    setMapSheetTab('location');
    setMapResetSignal((value) => value + 1);
    setLatestUserMapRegion(null);
    setLastMapSearchRegion(null);
    setShowSearchHereButton(false);
    setPreserveMapRegionOnGroupsChange(false);
    setIsMapCurrentLocationDefaultEnabled(true);
  }, [clearPlacesSearchState]);

  const handleUseCurrentSearchLocationPress = useCallback(async () => {
    await searchCurrentLocationByText();
  }, [searchCurrentLocationByText]);

  const handleMapSearchPanelLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setMapSearchPanelHeight((currentHeight) =>
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

  const renderCopyIconButton = useCallback((value: string, accessibilityLabel: string) => (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={() => {
        void copyText(value);
      }}
      style={({ pressed }) => [
        styles.storefrontCopyAction,
        styles.storefrontCopyIconButton,
        pressed && styles.storefrontCopyIconButtonPressed,
      ]}
    >
      <Ionicons color={theme.colors.text.primary} name="copy-outline" size={20} />
    </Pressable>
  ), [
    copyText,
    styles.storefrontCopyAction,
    styles.storefrontCopyIconButton,
    styles.storefrontCopyIconButtonPressed,
    theme.colors.text.primary,
  ]);

  const renderStorefrontNameDeleteButton = useCallback(
    (entry: StorefrontScanHistoryEntry, name: string, optionIndex: number) => (
      <Pressable
        accessibilityLabel={`Delete ${name}`}
        accessibilityRole="button"
        onPress={() => {
          requestStorefrontNameDelete(entry, name, optionIndex);
        }}
        style={({ pressed }) => [
          styles.storefrontDeleteIconButton,
          pressed && styles.storefrontDeleteIconButtonPressed,
        ]}
      >
        <Ionicons color={theme.colors.text.danger} name="trash-outline" size={18} />
      </Pressable>
    ),
    [
      requestStorefrontNameDelete,
      styles.storefrontDeleteIconButton,
      styles.storefrontDeleteIconButtonPressed,
      theme.colors.text.danger,
    ],
  );

  const renderStorefrontScanResult = useCallback((entry: StorefrontScanHistoryEntry) => {
    const scannedAtLabel = formatStorefrontScanTimeLabel(entry.scannedAt);

    if ('error' in entry.result) {
      return (
        <View key={entry.id} style={styles.storefrontScanResultGroup}>
          {scannedAtLabel ? (
            <Text style={styles.storefrontScanHeader} tone="secondary">Scanned {scannedAtLabel}</Text>
          ) : null}
          <View style={styles.warningPanel}>
            <Text tone="warning" variant="label">No restaurant detected</Text>
            <Text tone="secondary">{entry.result.reason ?? 'Try a clearer photo of the sign or storefront.'}</Text>
          </View>
        </View>
      );
    }

    if (entry.result.found) {
      return (
        <View key={entry.id} style={styles.storefrontScanResultGroup}>
          {scannedAtLabel ? (
            <Text style={styles.storefrontScanHeader} tone="secondary">Scanned {scannedAtLabel}</Text>
          ) : null}
          {entry.result.options.map((option, index) => (
            <View
              key={`${entry.id}-${option.name}-${index}`}
              style={styles.storefrontOptionCard}
              testID={`restaurant-discovery-storefront-option-${entry.id}-${index}`}
            >
              <View style={styles.storefrontOptionHeader}>
                <View style={styles.storefrontOptionTitleWrap}>
                  <Text variant="label">{option.name}</Text>
                  <Text tone={resolveConfidenceTone(option.confidence)}>
                    {option.confidence} confidence
                  </Text>
                </View>
                {renderStorefrontNameDeleteButton(entry, option.name, index)}
              </View>
              <View style={styles.storefrontOption}>
                {option.reason ? (
                  <ExpandableText
                    collapsedNumberOfLines={1}
                    interactionMode="tap-text"
                    tone="secondary"
                  >
                    {option.reason}
                  </ExpandableText>
                ) : null}
                <View style={styles.storefrontPrimaryActionRow}>
                  <Button
                    label="Search"
                    onPress={() => {
                      void runCandidateSearch(option.name);
                    }}
                    style={styles.storefrontSearchAction}
                  />
                  {renderCopyIconButton(option.name, `Copy ${option.name}`)}
                </View>
                <Button
                  label="Add Manually"
                  onPress={() => {
                    handleManualAdd(option.name);
                  }}
                  variant="secondary"
                />
              </View>
            </View>
          ))}
        </View>
      );
    }

    const visibleText = entry.result.allText?.trim();
    return (
      <View key={entry.id} style={styles.storefrontScanResultGroup}>
        {scannedAtLabel ? (
          <Text style={styles.storefrontScanHeader} tone="secondary">Scanned {scannedAtLabel}</Text>
        ) : null}
        <View style={styles.storefrontResultPanel}>
          <View style={styles.storefrontResultHeader}>
            <Text variant="label">Visible Text</Text>
          </View>
          <Text style={styles.extractedText}>{visibleText || 'No clear text found.'}</Text>
          {visibleText ? (
            <View style={styles.wrapRow}>
              {renderCopyIconButton(visibleText, 'Copy visible storefront text')}
              <Button
                label="Add Manually"
                onPress={() => {
                  handleManualAdd(getRestaurantNameOptions(entry.result)[0]);
                }}
                style={styles.action}
                variant="secondary"
              />
            </View>
          ) : null}
        </View>
      </View>
    );
  }, [
    handleManualAdd,
    renderCopyIconButton,
    renderStorefrontNameDeleteButton,
    runCandidateSearch,
    styles.action,
    styles.extractedText,
    styles.storefrontOption,
    styles.storefrontOptionCard,
    styles.storefrontOptionHeader,
    styles.storefrontOptionTitleWrap,
    styles.storefrontPrimaryActionRow,
    styles.storefrontResultHeader,
    styles.storefrontResultPanel,
    styles.storefrontScanHeader,
    styles.storefrontScanResultGroup,
    styles.storefrontSearchAction,
    styles.warningPanel,
    styles.wrapRow,
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

  const isMapSearchActionDisabled = searchButtonDisabled || isSearchingRestaurants;
  const isCurrentLocationActionLoading = isSearchingNearbyRestaurants || isGettingLocation;
  const canUseCurrentLocation = !searchButtonDisabled && !isCurrentLocationActionLoading;
  const isMapCurrentLocationToken =
    isUsingCurrentLocation ||
    manualLocation === CURRENT_LOCATION_LABEL ||
    manualLocation === LEGACY_CURRENT_PHONE_LOCATION_LABEL ||
    manualLocation.startsWith(LEGACY_CURRENT_PHONE_LOCATION_PARTIAL_PREFIX) ||
    (isMapCurrentLocationDefaultEnabled && !manualLocation.trim());
  const mapLocationInputValue = isMapCurrentLocationToken ? CURRENT_LOCATION_LABEL : manualLocation;
  const shouldShowMapCurrentLocationOption = isMapLocationFocused && !isMapCurrentLocationToken;
  const mapSearchQueryClearButton = searchQuery.length > 0 ? (
    <Pressable
      accessibilityLabel="Clear place name or type"
      accessibilityRole="button"
      onPress={() => {
        setSearchQuery('');
      }}
      style={({ pressed }) => [styles.clearButton, pressed ? styles.clearButtonPressed : null]}
    >
      <Ionicons color={theme.colors.text.muted} name="close-circle" size={18} />
    </Pressable>
  ) : null;
  const mapLocationClearButton = mapLocationInputValue.length > 0 ? (
    <Pressable
      accessibilityLabel="Clear location"
      accessibilityRole="button"
      onPress={() => {
        setIsMapCurrentLocationDefaultEnabled(false);
        setManualLocation('');
      }}
      style={({ pressed }) => [styles.clearButton, pressed ? styles.clearButtonPressed : null]}
    >
      <Ionicons color={theme.colors.text.muted} name="close-circle" size={18} />
    </Pressable>
  ) : null;
  const handleMapSearchPress = () => {
    if (isMapCurrentLocationToken) {
      void handleUseCurrentSearchLocationPress();
      return;
    }

    void searchByText();
  };
  const handleMapManualLocationChange = (value: string) => {
    if (
      isMapCurrentLocationToken &&
      (value === '' ||
        mapLocationInputValue.startsWith(value) ||
        CURRENT_LOCATION_LABEL.startsWith(value) ||
        LEGACY_CURRENT_PHONE_LOCATION_LABEL.startsWith(value))
    ) {
      setIsMapCurrentLocationDefaultEnabled(false);
      setManualLocation('');
      return;
    }

    setIsMapCurrentLocationDefaultEnabled(false);
    setManualLocation(value);
  };
  const handleMapManualLocationPress = () => {
    if (isMapCurrentLocationToken) {
      setIsMapCurrentLocationDefaultEnabled(false);
      setManualLocation('');
      setIsMapLocationFocused(true);
    }
  };
  const mapSearchIconButton = (
    <Pressable
      accessibilityLabel={expandedSearchLabel}
      accessibilityRole="button"
      disabled={isMapSearchActionDisabled}
      onPress={handleMapSearchPress}
      style={({ pressed }) => [
        styles.locationAction,
        styles.searchIconButton,
        isMapSearchActionDisabled ? styles.searchIconButtonDisabled : null,
        pressed && !isMapSearchActionDisabled ? { opacity: 0.8 } : null,
      ]}
    >
      {isSearchingRestaurants ? (
        <ActivityIndicator color={theme.colors.button.primaryText} />
      ) : (
        <Ionicons color={theme.colors.button.primaryText} name="search-outline" size={20} />
      )}
    </Pressable>
  );
  const mapCurrentLocationOption = shouldShowMapCurrentLocationOption ? (
    <Pressable
      accessibilityLabel="Use your current phone location"
      accessibilityRole="button"
      disabled={!canUseCurrentLocation}
      onPressIn={() => {
        if (!canUseCurrentLocation) {
          return;
        }

        setIsMapLocationFocused(false);
        setIsMapCurrentLocationDefaultEnabled(true);
        void handleUseCurrentSearchLocationPress();
      }}
      style={({ pressed }) => [
        styles.currentLocationOption,
        pressed && canUseCurrentLocation ? styles.currentLocationOptionPressed : null,
        !canUseCurrentLocation ? { opacity: 0.55 } : null,
      ]}
      testID="restaurant-discovery-map-current-location-option"
    >
      <View style={styles.currentLocationOptionIcon}>
        {isCurrentLocationActionLoading ? (
          <ActivityIndicator color={theme.colors.text.secondary} />
        ) : (
          <Ionicons color={theme.colors.text.secondary} name="locate-outline" size={18} />
        )}
      </View>
      <View>
        <Text variant="label">Current location</Text>
        <Text tone="secondary" variant="bodySm">
          Use this phone's current location
        </Text>
      </View>
    </Pressable>
  ) : null;
  const shouldShowFocusedRestaurantSearch = isRestaurantSearchFocused && activeTab === 'search';
  const dismissFocusedLocationOptions = useCallback(() => {
    if (!shouldShowFocusedRestaurantSearch) {
      return;
    }

    setFocusedLocationOptionsDismissSignal((currentSignal) => currentSignal + 1);
  }, [shouldShowFocusedRestaurantSearch]);
  const focusedRestaurantSearchHeader = (
    <FocusedRestaurantSearchHeader
      currentLocationDisabled={
        !isOnline ||
        isGettingLocation ||
        isSearchingNearbyRestaurants ||
        (isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide)
      }
      currentLocationLoading={isGettingLocation || isSearchingNearbyRestaurants}
      isUsingCurrentLocation={isUsingCurrentLocation}
      locationOptionsDismissSignal={focusedLocationOptionsDismissSignal}
      manualLocation={manualLocation}
      onBackPress={() => {
        setIsRestaurantSearchFocused(false);
      }}
      onManualLocationChange={setManualLocation}
      onSearchPress={() => {
        void searchByText();
      }}
      onSearchQueryChange={setSearchQuery}
      onUseCurrentLocationPress={() => {
        void handleUseCurrentSearchLocationPress();
      }}
      searchButtonDisabled={searchButtonDisabled}
      searchButtonLabel={expandedSearchLabel}
      searchButtonLoading={isSearchingRestaurants}
      searchQuery={searchQuery}
      testID="restaurant-discovery-focused-restaurant-search-header"
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
          <Text variant="label">Search for food places</Text>
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
            onChangeText={setSearchQuery}
            placeholder="Place name or type"
            rightAccessory={mapSearchQueryClearButton}
            value={searchQuery}
          />
          <View style={styles.row}>
            <Input
              autoCapitalize="words"
              containerStyle={styles.locationField}
              inputStyle={[
                styles.locationInput,
                isMapCurrentLocationToken ? styles.currentLocationInputText : null,
              ]}
              onBlur={() => {
                setIsMapLocationFocused(false);
              }}
              onChangeText={handleMapManualLocationChange}
              onFocus={() => {
                setIsMapLocationFocused(true);
              }}
              onKeyPress={(event) => {
                if (isMapCurrentLocationToken && event.nativeEvent.key === 'Backspace') {
                  setIsMapCurrentLocationDefaultEnabled(false);
                  setManualLocation('');
                }
              }}
              onPressIn={handleMapManualLocationPress}
              placeholder="City, zip, address, or your location"
              rightAccessory={mapLocationClearButton}
              value={mapLocationInputValue}
            />
            {mapSearchIconButton}
          </View>
          {mapCurrentLocationOption}
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
      groups={foodDiscoveryMap.groups}
      hiddenLocationPluralLabel="restaurants"
      hiddenLocationSingularLabel="restaurant"
      initialUserCoordinates={discoveryUserCoordinates}
      loading={isSearchingNearbyRestaurants || isGettingLocation}
      mapTestID="restaurant-discovery-map"
      omittedWithoutCoordinates={foodDiscoveryMap.omittedWithoutCoordinates}
      onOpenSelectedGroup={handleOpenSelectedMapGroup}
      onRetry={() => {
        void searchNearby();
      }}
      onSelectedGroupChange={handleSelectedMapGroupChange}
      selectedGroupTabs={foodDiscoveryMap.selectedGroupTabs}
      onUserRegionChangeComplete={handleUserMapRegionChangeComplete}
      preserveRegionOnGroupsChange={isSearchMapMode && preserveMapRegionOnGroupsChange}
      resetSignal={mapResetSignal}
      selectedGroupActionLabel="Open Restaurant"
      selectedGroupId={selectedMapGroupId}
      showCurrentLocationControl={!isMapSheetOpen}
      style={styles.mapFull}
      testID="restaurant-discovery-map-view"
    />
  );

  return (
    <BackHeaderScreenScaffold
      bodyStyle={!shouldShowFocusedRestaurantSearch && isSearchMapMode ? styles.mapBody : undefined}
      customHeader={shouldShowFocusedRestaurantSearch ? focusedRestaurantSearchHeader : undefined}
      headerScrollMode="fixed"
      onBackPress={() => {
        navigation.goBack();
      }}
      scroll={shouldShowFocusedRestaurantSearch || !isSearchMapMode}
      screenBackgroundTone="surface"
      subtitle="Search food places, read storefronts, and add menu items."
      title="Food Discovery"
      testID="restaurant-discovery-screen"
    >
      {shouldShowFocusedRestaurantSearch ? (
        <View onTouchStart={dismissFocusedLocationOptions}>
          <VisitRestaurantSearchSection
            connectivityWarningMessage={!isOnline ? 'Online search is unavailable while offline.' : null}
            currentLocationDisabled={
              !isOnline ||
              isGettingLocation ||
              isSearchingNearbyRestaurants ||
              (isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide)
            }
            currentLocationLoading={isGettingLocation || isSearchingNearbyRestaurants}
            hideSearchCard
            isSearchResultsLoading={isSearchingRestaurants || isSearchingNearbyRestaurants || isGettingLocation}
            isUsingCurrentLocation={isUsingCurrentLocation}
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
              void handleUseCurrentSearchLocationPress();
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
            searchButtonLabel={expandedSearchLabel}
            searchButtonLoading={isSearchingRestaurants}
            searchErrorMessage={searchErrorMessage}
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
          <PageErrorToast
            errorMessage={bookmarkErrorMessage}
            title="Could not save bookmark"
          />
        </View>
      ) : isSearchMapMode ? (
        <View style={styles.mapModeRoot}>
          <View style={styles.mapModeControls}>
            {discoveryTabControl}
            {searchViewModeControl}
          </View>
          <View style={styles.mapCanvasWrap}>
            {restaurantMapView}
            {showSearchHereButton && !isMapSheetOpen ? (
              <View
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
            {!isMapSheetOpen ? (
              <View style={styles.floatingSearchPanelWrap}>
                {mapSearchPanel}
              </View>
            ) : null}
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
                isUsingCurrentLocation={isUsingCurrentLocation}
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
                onSearchQueryFocus={() => {
                  setIsRestaurantSearchFocused(true);
                }}
                onUseCurrentLocationPress={() => {
                  void handleUseCurrentSearchLocationPress();
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
              <PageErrorToast
                errorMessage={bookmarkErrorMessage}
                title="Could not save bookmark"
              />
            </>
          ) : (
            <>
              <Card style={styles.card}>
                <View style={styles.iconTitle}>
                  <Ionicons color={theme.colors.text.info} name="scan-outline" size={18} />
                  <Text variant="label">Read a Storefront</Text>
                </View>
                <Text tone="secondary">
                  Extract possible restaurant names from a sign, then search or copy the text.
                </Text>
                <Text tone={isStorefrontQuotaReached ? 'warning' : 'secondary'}>
                  {storefrontUsageText}
                </Text>
                <Button
                  disabled={isStorefrontReadDisabled}
                  label="Read a Storefront"
                  loading={isExtractingStorefront}
                  onPress={() => {
                    setShowStorefrontPhotoSources((visible) => !visible);
                  }}
                />
                {showStorefrontPhotoSources ? (
                  <PhotoSourcePicker
                    cameraSubtitle="Storefront"
                    cameraTitle="Take Photo"
                    disabled={isStorefrontReadDisabled}
                    gallerySubtitle="Photo Library"
                    galleryTitle="Upload"
                    title=""
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
              </Card>

              {shouldShowStorefrontResultsCard ? (
                <Card style={styles.card}>
                  <Text variant="label">Possible Names</Text>
                  <PageErrorToast
                    errorMessage={
                      storefrontHistoryQuery.error instanceof Error ? storefrontHistoryQuery.error.message : null
                    }
                    title="Could not load saved scans"
                  />
                  <PageErrorToast
                    errorMessage={storefrontHistoryErrorMessage}
                    title="Could not update saved scans"
                  />
                  {storefrontHistoryQuery.isLoading ? <LoadingState label="Loading saved scans..." /> : null}
                  {storefrontScanHistoryGroups.map((group) => (
                    <View key={group.dateKey} style={styles.storefrontHistoryGroup}>
                      <View style={styles.storefrontHistoryHeader}>
                        <Text variant="label">{group.label}</Text>
                      </View>
                      {group.entries.map(renderStorefrontScanResult)}
                    </View>
                  ))}
                  {hasMoreStorefrontScanResults ? (
                    <FeatureListFooter
                      isFetchingNextPage={false}
                      label="Load more results"
                      onLoadMore={() => {
                        setVisibleStorefrontScanCount((currentCount) =>
                          currentCount + STOREFRONT_SCAN_HISTORY_PAGE_SIZE,
                        );
                      }}
                      testID="restaurant-discovery-storefront-load-more"
                    />
                  ) : null}
                </Card>
              ) : null}
            </>
        )}
        </View>
      )}
      <ConfirmDestructiveModal
        confirmLabel="Delete Result"
        confirmLoadingLabel="Deleting..."
        description={
          pendingStorefrontNameDelete
            ? `Delete "${pendingStorefrontNameDelete.name}" from saved storefront scan results?`
            : 'Delete this saved storefront scan result?'
        }
        loading={isDeletingStorefrontName}
        onCancel={cancelStorefrontNameDelete}
        onConfirm={confirmStorefrontNameDelete}
        testID="restaurant-discovery-delete-storefront-name-modal"
        title="Delete Result?"
        visible={pendingStorefrontNameDelete !== null}
      />
    </BackHeaderScreenScaffold>
  );
}
