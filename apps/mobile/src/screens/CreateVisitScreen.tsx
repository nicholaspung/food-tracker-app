import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  CurrentLocationButton,
  EmptyState,
  ErrorState,
  FeatureFormScreenScaffold,
  LocalDatePickerField,
  LoadingState,
  PageErrorToast,
  PhotoAttachmentRow,
  PhotoSourceActionCards,
  PhotoViewerModal,
  RatingLegend,
  RatingSelector,
  StepProgressBar,
  UpgradePromptCard,
  VisibilityBadge,
  VisibilityOptionSelector,
  type VisibilityOptionValue,
} from '../components/shared';
import {
  createCollectionRecord,
  createVisit,
  formatLimitExceededMessage,
  getAuthenticatedUserIdOrNull,
  getVisitById,
  linkVisitToListBookmark,
  listCollectionRecords,
  listRestaurants,
  listVisits,
  parseLimitExceededError,
  resolveDefaultVisitVisibilityFromAuth,
  updateVisit,
  useMonthlyUsage,
  type RestaurantRecord,
} from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import {
  calculateDistance,
  formatDistance,
  geocodeLocation,
  searchAndCacheNearbyRestaurants,
  searchAndCacheRestaurantsByText,
} from '../lib/googlePlaces';
import {
  formatDateToLocalDateString,
  getTodayLocalDateString,
  isValidLocalDate,
  localDateStringToUTC,
} from '../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { resolveCreateVisitSearchUi, shouldShowOfflineUsageWarning } from './usageUiRules';
import { useTheme } from '../theme';
import { Button, Card, Input, ListItem, Text } from '../ui';

type CreateVisitScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'CreateVisit'
>;

type VisitWizardStep = 0 | 1 | 2; // 0-indexed to match StepProgressBar
type VisitVisibility = 'friends' | 'private';

interface DraftVisitItem {
  id: string;
  name: string;
  rating: number;
  description: string;
  notes: string;
  photos: DraftVisitItemPhoto[];
  sourceMenuItemId?: string;
}

interface DraftVisitItemPhoto {
  uri: string;
  name: string;
  mimeType: string;
}

interface RestaurantWithDistance {
  restaurant: RestaurantRecord;
  distance: number | null;
}

interface FriendshipRecord {
  id: string;
  user: string;
  friend: string;
  status: "pending" | "accepted" | "blocked";
}

interface RestaurantStats {
  userVisitCount: number;
  friendCount: number;
}

interface MenuItemRecord {
  id: string;
  restaurant: string;
  name: string;
  createdBy?: string;
  visibility?: "private" | "friends" | "public";
  isFromOCR?: boolean;
  created: string;
  updated: string;
}

interface MenuReviewRequestRecord {
  id: string;
  restaurant: string;
  status: "pending" | "reviewed" | "dismissed";
}

type MenuItemVisibility = "private" | "friends" | "public";

function normalizeMenuItemVisibility(
  value: MenuItemRecord["visibility"],
): MenuItemVisibility {
  if (value === "private" || value === "public") {
    return value;
  }

  return "friends";
}

function resolveDefaultVisitVisibility(): VisitVisibility {
  return resolveDefaultVisitVisibilityFromAuth();
}

function inferImageMimeType(uri: string): string {
  const normalizedUri = uri.toLowerCase();
  if (normalizedUri.endsWith(".png")) {
    return "image/png";
  }

  if (normalizedUri.endsWith(".webp")) {
    return "image/webp";
  }

  if (normalizedUri.endsWith(".heic") || normalizedUri.endsWith(".heif")) {
    return "image/heic";
  }

  return "image/jpeg";
}

function buildDraftPhotoName(uri: string): string {
  const baseName = uri.split("/").pop();
  if (baseName && baseName.includes(".")) {
    return baseName;
  }

  return `visit-item-${Date.now()}.jpg`;
}

function matchesRestaurantSearch(
  restaurant: RestaurantRecord,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return (
    restaurant.name.toLowerCase().includes(normalizedQuery) ||
    (restaurant.location ?? "").toLowerCase().includes(normalizedQuery) ||
    (restaurant.city ?? "").toLowerCase().includes(normalizedQuery) ||
    (restaurant.cuisineType ?? "").toLowerCase().includes(normalizedQuery)
  );
}

function dedupeRestaurants(
  restaurants: RestaurantRecord[],
): RestaurantRecord[] {
  const map = new Map<string, RestaurantRecord>();
  for (const restaurant of restaurants) {
    if (!map.has(restaurant.id)) {
      map.set(restaurant.id, restaurant);
    }
  }
  return Array.from(map.values());
}

function withDistance(
  restaurants: RestaurantRecord[],
  referenceCoords: { lat: number; lng: number } | null,
): RestaurantWithDistance[] {
  return restaurants
    .map((restaurant) => {
      if (
        !referenceCoords ||
        typeof restaurant.latitude !== "number" ||
        typeof restaurant.longitude !== "number"
      ) {
        return { restaurant, distance: null };
      }

      return {
        restaurant,
        distance: calculateDistance(
          referenceCoords.lat,
          referenceCoords.lng,
          restaurant.latitude,
          restaurant.longitude,
        ),
      };
    })
    .sort((left, right) => {
      if (left.distance === null && right.distance === null) {
        return left.restaurant.name.localeCompare(right.restaurant.name);
      }

      if (left.distance === null) {
        return 1;
      }

      if (right.distance === null) {
        return -1;
      }

      return left.distance - right.distance;
    });
}

function prioritizeSelectedRestaurant(
  restaurants: RestaurantWithDistance[],
  selectedRestaurantId: string | null,
): RestaurantWithDistance[] {
  if (!selectedRestaurantId) {
    return restaurants;
  }

  const selected = restaurants.find(
    ({ restaurant }) => restaurant.id === selectedRestaurantId,
  );
  if (!selected) {
    return restaurants;
  }

  return [
    selected,
    ...restaurants.filter(
      ({ restaurant }) => restaurant.id !== selectedRestaurantId,
    ),
  ];
}

function buildRestaurantDescription(
  restaurant: RestaurantRecord,
  distance: number | null,
): string {
  const parts: string[] = [];

  const location = restaurant.location ?? restaurant.city;
  if (location) {
    parts.push(location);
  }

  if (restaurant.cuisineType) {
    parts.push(restaurant.cuisineType);
  }

  if (distance !== null) {
    parts.push(formatDistance(distance));
  }

  return parts.join(" • ") || "Restaurant";
}

function normalizeSelectionLabel(value: string): string {
  return value.trim().toLowerCase();
}

function formatVisitCount(count: number): string {
  return `${count} ${count === 1 ? "visit" : "visits"}`;
}

function formatFriendCount(count: number): string {
  return `${count} ${count === 1 ? "friend" : "friends"}`;
}

function getVisibilityIcon(
  restaurant: RestaurantRecord,
): {
  name: keyof typeof Ionicons.glyphMap;
  tone: "secondary" | "info" | "success";
} | null {
  const visibility =
    restaurant.visibility ?? (restaurant.isGooglePlace ? "public" : undefined);
  if (visibility === "private") {
    return { name: "lock-closed-outline", tone: "secondary" };
  }

  if (visibility === "friends") {
    return { name: "people-outline", tone: "info" };
  }

  if (visibility === "public") {
    return { name: "earth-outline", tone: "success" };
  }

  return null;
}

const WIZARD_STEPS = [
  { label: "Restaurant" },
  { label: "Items" },
  { label: "Rate & Save" },
];

const FREE_MONTHLY_PHOTO_LIMIT = 5;
const FREE_MONTHLY_PHOTO_WARNING_THRESHOLD = 1;
const FREE_SEARCH_WARNING_THRESHOLD = 2;

export function CreateVisitScreen({
  navigation,
  route,
}: CreateVisitScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
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
  const perRecordPhotoLimit = isActualAdmin ? null : isDisplaySubscriberUser ? 20 : 1;
  const placesQueriesRemaining = isDisplayFreeUser
    ? monthlyUsage.snapshot?.remaining.placesQueriesMonthly ?? null
    : null;
  const editVisitId = route.params?.editVisitId;
  const isEditMode = Boolean(editVisitId);

  const restaurantsQuery = useQuery({
    queryKey: ["feature", "restaurants"],
    queryFn: listRestaurants,
  });
  const visitsQuery = useQuery({
    queryKey: ["feature", "visits", "restaurant-stats"],
    queryFn: listVisits,
  });
  const friendshipsQuery = useQuery({
    queryKey: [
      "feature",
      "friendships",
      "accepted",
      getAuthenticatedUserIdOrNull() ?? "",
    ],
    queryFn: async () => {
      const currentUserId = getAuthenticatedUserIdOrNull();
      if (!currentUserId) {
        return [] as FriendshipRecord[];
      }

      return listCollectionRecords<FriendshipRecord>("friendships", {
        filter: `(user = "${currentUserId}" || friend = "${currentUserId}") && status = "accepted"`,
        fields: "id,user,friend,status",
      });
    },
    enabled: Boolean(getAuthenticatedUserIdOrNull()),
  });

  const [step, setStep] = useState<VisitWizardStep>(0);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [restaurantName, setRestaurantName] = useState("");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<
    string | null
  >(null);
  const [restaurantSearchQuery, setRestaurantSearchQuery] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [showNearbyPlaces, setShowNearbyPlaces] = useState(false);
  const [referenceCoords, setReferenceCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [searchResults, setSearchResults] = useState<RestaurantRecord[]>([]);
  const [nearbyResults, setNearbyResults] = useState<RestaurantRecord[]>([]);
  const [searchErrorMessage, setSearchErrorMessage] = useState<string | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchingNearby, setIsSearchingNearby] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [menuItemSearchQuery, setMenuItemSearchQuery] = useState("");
  const [menuReviewSubmitted, setMenuReviewSubmitted] = useState(false);
  const [isTipPopoverVisible, setIsTipPopoverVisible] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftVisitItem[]>([]);
  const [visitDate, setVisitDate] = useState(getTodayLocalDateString());
  const [isVisitDateAutoFilled, setIsVisitDateAutoFilled] = useState(false);
  const [visitVisibility, setVisitVisibility] = useState<VisitVisibility>(
    resolveDefaultVisitVisibility,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [locationPermissionNeedsSettings, setLocationPermissionNeedsSettings] =
    useState(false);
  const [photoPermissionNeedsSettings, setPhotoPermissionNeedsSettings] =
    useState(false);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sourceListItemId, setSourceListItemId] = useState<string | null>(null);
  const [restaurantListAnchorY, setRestaurantListAnchorY] = useState(0);
  const [hydratedEditVisitId, setHydratedEditVisitId] = useState<string | null>(
    null,
  );
  const currentUserId = getAuthenticatedUserIdOrNull() ?? "";
  const createVisitSearchUi = resolveCreateVisitSearchUi({
    isFreeTier: isDisplayFreeUser,
    enforceQuota: shouldEnforceUsageLimitsClientSide,
    placesQueriesRemaining,
    isOnline,
    isSearching,
  });
  const isPlacesQuotaReached = createVisitSearchUi.isQuotaReached;
  const compactSearchLabel = createVisitSearchUi.compactLabel;
  const expandedSearchLabel = createVisitSearchUi.expandedLabel;
  const scrollViewRef = useRef<ScrollView | null>(null);
  const editVisitQuery = useQuery({
    queryKey: ["feature", "visit", editVisitId ?? ""],
    queryFn: async () => {
      if (!editVisitId) {
        return null;
      }

      return getVisitById(editVisitId);
    },
    enabled: Boolean(editVisitId),
  });
  const menuItemsQuery = useQuery({
    queryKey: ["feature", "menuItems", selectedRestaurantId ?? ""],
    queryFn: async () => {
      if (!selectedRestaurantId) {
        return [] as MenuItemRecord[];
      }

      if (!isOnline) {
        return (
          queryClient.getQueryData<MenuItemRecord[]>([
            "feature",
            "menuItems",
            selectedRestaurantId,
          ]) ?? []
        );
      }

      return listCollectionRecords<MenuItemRecord>("menu_items", {
        filter: `restaurant = "${selectedRestaurantId}"`,
        sort: "-created",
      });
    },
    enabled: step === 1 && Boolean(selectedRestaurantId),
  });
  const pendingMenuReviewQuery = useQuery({
    queryKey: ["feature", "menuReview", "pending", selectedRestaurantId ?? ""],
    queryFn: async () => {
      if (!selectedRestaurantId) {
        return false;
      }

      const records = await listCollectionRecords<MenuReviewRequestRecord>(
        "menu_review_requests",
        {
          filter: `restaurant = "${selectedRestaurantId}" && status = "pending"`,
          fields: "id,restaurant,status",
        },
      );

      return records.length > 0;
    },
    enabled: step === 1 && Boolean(selectedRestaurantId) && isOnline,
  });

  useEffect(() => {
    const preselectedRestaurantId = route.params?.preselectedRestaurantId;
    const preselectedRestaurantName = route.params?.preselectedRestaurantName;
    const preselectedMenuItemId = route.params?.preselectedMenuItemId;
    const preselectedMenuItemName = route.params?.preselectedMenuItemName;
    const sourceListItemIdParam = route.params?.sourceListItemId;
    const returnToStep = route.params?.returnToStep;

    if (
      !preselectedRestaurantId &&
      !preselectedMenuItemId &&
      !sourceListItemIdParam &&
      returnToStep === undefined
    ) {
      return;
    }

    if (preselectedRestaurantId && preselectedRestaurantName) {
      if (
        selectedRestaurantId &&
        selectedRestaurantId !== preselectedRestaurantId
      ) {
        setDraftItems([]);
      }

      setRestaurantName(preselectedRestaurantName);
      setSelectedRestaurantId(preselectedRestaurantId);
    }

    if (preselectedMenuItemId && preselectedMenuItemName) {
      setDraftItems((currentItems) => {
        if (currentItems.some((item) => item.id === preselectedMenuItemId)) {
          return currentItems;
        }

        return [
          ...currentItems,
          {
            id: preselectedMenuItemId,
            name: preselectedMenuItemName,
            rating: 3,
            description: "",
            notes: "",
            photos: [],
            sourceMenuItemId: preselectedMenuItemId,
          },
        ];
      });
    }

    if (sourceListItemIdParam) {
      setSourceListItemId(sourceListItemIdParam);
    } else if (
      preselectedRestaurantId ||
      preselectedMenuItemId ||
      returnToStep !== undefined
    ) {
      setSourceListItemId(null);
    }

    setErrorMessage(null);
    setSearchErrorMessage(null);
    if (returnToStep !== undefined) {
      setStep(returnToStep);
    } else if (preselectedRestaurantId || preselectedMenuItemId) {
      setStep(1);
    }

    navigation.setParams({
      preselectedRestaurantId: undefined,
      preselectedRestaurantName: undefined,
      preselectedMenuItemId: undefined,
      preselectedMenuItemName: undefined,
      sourceListItemId: undefined,
      returnToStep: undefined,
    });
  }, [
    navigation,
    route.params?.preselectedRestaurantId,
    route.params?.preselectedRestaurantName,
    route.params?.preselectedMenuItemId,
    route.params?.preselectedMenuItemName,
    route.params?.sourceListItemId,
    route.params?.returnToStep,
    selectedRestaurantId,
  ]);

  useEffect(() => {
    if (!editVisitId) {
      if (hydratedEditVisitId !== null) {
        setHydratedEditVisitId(null);
      }
      return;
    }

    if (!editVisitQuery.data || hydratedEditVisitId === editVisitId) {
      return;
    }

    const hydratedVisitDate = formatDateToLocalDateString(
      new Date(editVisitQuery.data.visitedAt),
    );
    const requestedStep = route.params?.returnToStep;

    setRestaurantName(editVisitQuery.data.restaurantName);
    setSelectedRestaurantId(editVisitQuery.data.restaurantId ?? null);
    setDraftItems(
      editVisitQuery.data.items.map((item) => ({
        id: item.id,
        name: item.name,
        rating: item.rating,
        description: item.description?.trim() ?? "",
        notes: item.notes?.trim() ?? "",
        photos: [],
      })),
    );
    setVisitDate(
      isValidLocalDate(hydratedVisitDate)
        ? hydratedVisitDate
        : getTodayLocalDateString(),
    );
    setIsVisitDateAutoFilled(false);
    setVisitVisibility(
      editVisitQuery.data.visibility === "private" ? "private" : "friends",
    );
    setStep(requestedStep ?? 2);
    setErrorMessage(null);
    setSearchErrorMessage(null);
    setSourceListItemId(null);
    setHydratedEditVisitId(editVisitId);
  }, [
    editVisitId,
    editVisitQuery.data,
    hydratedEditVisitId,
    route.params?.returnToStep,
  ]);

  useEffect(() => {
    setMenuItemSearchQuery("");
    setMenuReviewSubmitted(false);
  }, [selectedRestaurantId]);

  useEffect(() => {
    if (step !== 2) {
      if (step !== 1) {
        setIsTipPopoverVisible(false);
      }
      return;
    }

    setIsTipPopoverVisible(false);
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, 0);
  }, [step]);

  const filteredSavedRestaurants = useMemo(() => {
    return (restaurantsQuery.data ?? []).filter((restaurant) =>
      matchesRestaurantSearch(restaurant, restaurantSearchQuery),
    );
  }, [restaurantSearchQuery, restaurantsQuery.data]);

  const displayedNearbyRestaurants = useMemo(() => {
    const combined = dedupeRestaurants([...nearbyResults, ...searchResults]);
    const filtered = combined.filter((restaurant) =>
      matchesRestaurantSearch(restaurant, restaurantSearchQuery),
    );
    return prioritizeSelectedRestaurant(
      withDistance(filtered, referenceCoords),
      selectedRestaurantId,
    );
  }, [
    nearbyResults,
    referenceCoords,
    restaurantSearchQuery,
    searchResults,
    selectedRestaurantId,
  ]);

  const displayedSavedRestaurants = useMemo(() => {
    return prioritizeSelectedRestaurant(
      withDistance(filteredSavedRestaurants, referenceCoords),
      selectedRestaurantId,
    );
  }, [filteredSavedRestaurants, referenceCoords, selectedRestaurantId]);
  const isMenuItemSelected = useCallback(
    (menuItem: MenuItemRecord) => {
      const normalizedMenuItemName = normalizeSelectionLabel(menuItem.name);
      return draftItems.some(
        (item) =>
          item.sourceMenuItemId === menuItem.id ||
          normalizeSelectionLabel(item.name) === normalizedMenuItemName,
      );
    },
    [draftItems],
  );
  const filteredMenuItems = useMemo(() => {
    const items = menuItemsQuery.data ?? [];
    const normalizedQuery = menuItemSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) =>
      item.name.toLowerCase().includes(normalizedQuery),
    );
  }, [menuItemSearchQuery, menuItemsQuery.data]);
  const displayedMenuItems = useMemo(() => {
    const selected = filteredMenuItems.filter((item) => isMenuItemSelected(item));
    const unselected = filteredMenuItems.filter(
      (item) => !isMenuItemSelected(item),
    );
    return [...selected, ...unselected];
  }, [filteredMenuItems, isMenuItemSelected]);
  const selectedMenuItemCount = draftItems.length;
  const draftPhotoCount = useMemo(
    () =>
      draftItems.reduce((totalCount, item) => totalCount + item.photos.length, 0),
    [draftItems],
  );
  const hasPendingMenuReview = pendingMenuReviewQuery.data === true;

  useEffect(() => {
    const menuItems = menuItemsQuery.data;
    if (!menuItems || menuItems.length === 0) {
      return;
    }

    const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));
    const menuItemsByNormalizedName = new Map(
      menuItems.map((item) => [normalizeSelectionLabel(item.name), item]),
    );
    setDraftItems((currentItems) =>
      currentItems.map((item) => {
        const matchedMenuItem =
          (item.sourceMenuItemId
            ? menuItemsById.get(item.sourceMenuItemId)
            : undefined) ??
          menuItemsByNormalizedName.get(normalizeSelectionLabel(item.name));
        if (!matchedMenuItem) {
          return item;
        }

        return {
          ...item,
          name: matchedMenuItem.name,
          sourceMenuItemId: matchedMenuItem.id,
        };
      }),
    );
  }, [menuItemsQuery.data]);

  const friendIds = useMemo(() => {
    const ids = new Set<string>();
    for (const friendship of friendshipsQuery.data ?? []) {
      const otherId =
        friendship.user === currentUserId ? friendship.friend : friendship.user;
      if (otherId) {
        ids.add(otherId);
      }
    }
    return ids;
  }, [currentUserId, friendshipsQuery.data]);

  const restaurantIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const restaurant of restaurantsQuery.data ?? []) {
      const normalizedName = restaurant.name.trim().toLowerCase();
      if (!normalizedName || map.has(normalizedName)) {
        continue;
      }
      map.set(normalizedName, restaurant.id);
    }
    return map;
  }, [restaurantsQuery.data]);

  const restaurantStatsMap = useMemo(() => {
    const stats = new Map<
      string,
      { userVisitCount: number; friendUserIds: Set<string> }
    >();
    for (const visit of visitsQuery.data ?? []) {
      const restaurantId =
        visit.restaurantId ??
        (visit.restaurantName?.trim()
          ? restaurantIdByName.get(visit.restaurantName.trim().toLowerCase())
          : undefined);

      if (!restaurantId) {
        continue;
      }

      const current = stats.get(restaurantId) ?? {
        userVisitCount: 0,
        friendUserIds: new Set<string>(),
      };
      if (visit.userId === currentUserId) {
        current.userVisitCount += 1;
      } else if (visit.userId && friendIds.has(visit.userId)) {
        current.friendUserIds.add(visit.userId);
      }
      stats.set(restaurantId, current);
    }

    const resolved = new Map<string, RestaurantStats>();
    for (const [restaurantId, value] of stats.entries()) {
      resolved.set(restaurantId, {
        userVisitCount: value.userVisitCount,
        friendCount: value.friendUserIds.size,
      });
    }

    return resolved;
  }, [currentUserId, friendIds, restaurantIdByName, visitsQuery.data]);

  const styles = StyleSheet.create({
    sectionCard: {
      gap: theme.spacing.sm,
    },
    row: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    locationField: {
      flex: 1,
    },
    locationInput: {
      height: theme.sizes.inputMinHeight,
      minHeight: theme.sizes.inputMinHeight,
    },
    locationAction: {
      alignSelf: "flex-end",
      minWidth: 96,
    },
    statusCard: {
      gap: theme.spacing.xs,
    },
    searchHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.xs,
      justifyContent: "space-between",
    },
    searchHeaderTitle: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    searchHeaderButton: {
      alignItems: "center",
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: theme.spacing.xxs,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: theme.spacing.xxs,
    },
    compactSearchRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    compactSearchField: {
      flex: 1,
    },
    compactSearchButton: {
      minWidth: 126,
    },
    listCard: {
      gap: theme.spacing.xs,
    },
    stepOneContainer: {
      gap: theme.spacing.md,
      position: "relative",
    },
    tipDismissOverlay: {
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
      zIndex: 20,
    },
    tipIconButton: {
      alignItems: "center",
      borderColor: theme.colors.status.warningBorder,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    tipPopover: {
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.strong,
      borderRadius: theme.radii.md,
      borderWidth: 2,
      elevation: 14,
      gap: theme.spacing.xs,
      maxWidth: 320,
      minWidth: 230,
      padding: theme.spacing.md,
      position: "absolute",
      right: theme.spacing.md,
      shadowColor: theme.colors.background.inverse,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.2,
      shadowRadius: 18,
      top: 48,
      zIndex: 35,
    },
    tipPopoverArrow: {
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.strong,
      borderLeftWidth: 2,
      borderTopWidth: 2,
      height: 14,
      position: "absolute",
      right: 12,
      top: -9,
      transform: [{ rotate: "45deg" }],
      width: 14,
    },
    tipPopoverHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    tipPopoverTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.xxs,
    },
    tipPopoverClose: {
      alignItems: "center",
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      height: 22,
      justifyContent: "center",
      width: 22,
    },
    menuItemsHeaderLeft: {
      alignItems: "center",
      flexDirection: "row",
      flexShrink: 1,
      gap: theme.spacing.xs,
    },
    reviewBadge: {
      alignItems: "center",
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: theme.spacing.xxs,
      minHeight: 24,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 2,
    },
    reviewBadgeDisabled: {
      opacity: 0.75,
    },
    quickActionsCard: {
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.strong,
      borderWidth: 1,
      gap: theme.spacing.xs,
      overflow: "visible",
      position: "relative",
    },
    quickActionsCardRaised: {
      elevation: 12,
      zIndex: 30,
    },
    quickActionsPrimaryRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    quickActionsPrimaryButton: {
      flex: 1,
    },
    menuActionButton: {
      alignItems: "center",
      backgroundColor: theme.colors.button.secondaryBg,
      borderColor: theme.colors.button.secondaryBorder,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: theme.spacing.xs,
      justifyContent: "center",
      minHeight: theme.sizes.secondaryButtonHeight,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    menuSearchInput: {
      marginBottom: theme.spacing.xs,
    },
    menuItemsHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: theme.spacing.xs,
    },
    menuItemDividerRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.xs,
      marginVertical: theme.spacing.xs,
    },
    menuItemDividerLine: {
      borderTopColor: theme.colors.border.default,
      borderTopWidth: 1,
      flex: 1,
    },
    menuItemRow: {
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      gap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
    },
    menuItemRowSelected: {
      backgroundColor: theme.colors.status.successBg,
      borderColor: theme.colors.status.successBorder,
    },
    menuItemHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    menuItemNameWrap: {
      flex: 1,
      paddingRight: theme.spacing.xs,
    },
    menuItemMetaRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    menuItemBadgeRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    menuItemEditButton: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.xxs,
      paddingVertical: theme.spacing.xxs,
    },
    itemCard: {
      gap: theme.spacing.sm,
    },
    metadataCard: {
      gap: theme.spacing.sm,
    },
    datePickerButton: {
      alignItems: "center",
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: theme.spacing.xs,
      minHeight: theme.sizes.inputMinHeight,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    datePickerFallbackCard: {
      backgroundColor: theme.colors.status.warningBg,
      borderColor: theme.colors.status.warningBorder,
      borderWidth: 1,
      gap: theme.spacing.xxs,
    },
    datePickerModalOverlay: {
      backgroundColor: theme.colors.background.overlay,
      flex: 1,
      justifyContent: "flex-end",
    },
    datePickerModalBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    datePickerModalSheet: {
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.default,
      borderTopLeftRadius: theme.radii.lg,
      borderTopRightRadius: theme.radii.lg,
      borderWidth: 1,
      borderBottomWidth: 0,
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.lg,
    },
    datePickerModalActions: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    datePickerModalAction: {
      flex: 1,
    },
    visibilitySection: {
      gap: theme.spacing.xs,
    },
    itemPhotoSection: {
      gap: theme.spacing.xs,
    },
    itemPhotoLabelRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.xxs,
    },
    itemPhotoList: {
      gap: theme.spacing.xs,
    },
    inlineLink: {
      alignSelf: "flex-start",
      paddingVertical: theme.spacing.xxs,
    },
    selectedHint: {
      alignItems: "center",
      backgroundColor: theme.colors.status.successBg,
      borderColor: theme.colors.status.successBorder,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: theme.spacing.xxs,
      marginBottom: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    listTrailing: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.xxs,
    },
    selectedRestaurantItem: {
      backgroundColor: theme.colors.status.successBg,
      borderColor: theme.colors.status.successBorder,
    },
    descriptionContainer: {
      gap: theme.spacing.xxs,
    },
    statsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    statPill: {
      alignItems: "center",
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: theme.spacing.xxs,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 2,
    },
    userStatPill: {
      backgroundColor: theme.colors.status.successBg,
      borderColor: theme.colors.status.successBorder,
    },
    friendStatPill: {
      backgroundColor: theme.colors.status.infoBg,
      borderColor: theme.colors.status.infoBorder,
    },
  });

  const clearSearchState = () => {
    setShowNearbyPlaces(false);
    setNearbyResults([]);
    setSearchResults([]);
    setSearchErrorMessage(null);
    setLocationPermissionNeedsSettings(false);
  };

  const scrollToRestaurantList = useCallback(() => {
    if (!scrollViewRef.current || restaurantListAnchorY <= 0) {
      return;
    }

    scrollViewRef.current.scrollTo({
      y: Math.max(0, restaurantListAnchorY - theme.spacing.sm),
      animated: true,
    });
  }, [restaurantListAnchorY, theme.spacing.sm]);

  const handleSelectRestaurant = (restaurant: RestaurantRecord) => {
    if (selectedRestaurantId && selectedRestaurantId !== restaurant.id) {
      setDraftItems([]);
    }
    setRestaurantName(restaurant.name);
    setSelectedRestaurantId(restaurant.id);
    setErrorMessage(null);
    setSearchErrorMessage(null);
    setStep(1);
  };

  const getRestaurantStats = (restaurantId: string): RestaurantStats => {
    return (
      restaurantStatsMap.get(restaurantId) ?? {
        userVisitCount: 0,
        friendCount: 0,
      }
    );
  };

  const renderRestaurantListDescription = (
    restaurant: RestaurantRecord,
    distance: number | null,
  ) => {
    const base = buildRestaurantDescription(restaurant, distance);
    const stats = getRestaurantStats(restaurant.id);

    return (
      <View style={styles.descriptionContainer}>
        <Text tone="secondary">{base}</Text>
        {stats.userVisitCount > 0 || stats.friendCount > 0 ? (
          <View style={styles.statsRow}>
            {stats.userVisitCount > 0 ? (
              <View style={[styles.statPill, styles.userStatPill]}>
                <Ionicons
                  color={theme.colors.text.success}
                  name="calendar-outline"
                  size={12}
                />
                <Text tone="success" variant="bodySm">
                  {`You: ${formatVisitCount(stats.userVisitCount)}`}
                </Text>
              </View>
            ) : null}
            {stats.friendCount > 0 ? (
              <View style={[styles.statPill, styles.friendStatPill]}>
                <Ionicons
                  color={theme.colors.text.info}
                  name="people-outline"
                  size={12}
                />
                <Text tone="info" variant="bodySm">
                  {`Friends: ${formatFriendCount(stats.friendCount)}`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const resolveVisibilityIconColor = (
    tone: "secondary" | "info" | "success",
  ): string => {
    if (tone === "info") {
      return theme.colors.text.info;
    }

    if (tone === "success") {
      return theme.colors.text.success;
    }

    return theme.colors.text.secondary;
  };

  const renderRestaurantTrailing = (restaurant: RestaurantRecord) => {
    const visibilityIcon = getVisibilityIcon(restaurant);
    const showSelected = selectedRestaurantId === restaurant.id;
    if (!visibilityIcon && !showSelected) {
      return undefined;
    }

    return (
      <View style={styles.listTrailing}>
        {visibilityIcon ? (
          <Ionicons
            color={resolveVisibilityIconColor(visibilityIcon.tone)}
            name={visibilityIcon.name}
            size={16}
          />
        ) : null}
        {showSelected ? (
          <Ionicons
            color={theme.colors.text.success}
            name="checkmark-circle"
            size={18}
          />
        ) : null}
      </View>
    );
  };

  const renderRestaurantItem = ({
    restaurant,
    distance,
  }: RestaurantWithDistance) => {
    const isSelected = selectedRestaurantId === restaurant.id;

    return (
      <ListItem
        description={renderRestaurantListDescription(restaurant, distance)}
        key={restaurant.id}
        onPress={() => {
          handleSelectRestaurant(restaurant);
        }}
        style={isSelected ? styles.selectedRestaurantItem : undefined}
        title={restaurant.name}
        trailing={renderRestaurantTrailing(restaurant)}
      />
    );
  };

  const toggleMenuItemSelection = (menuItem: MenuItemRecord) => {
    const normalizedMenuItemName = normalizeSelectionLabel(menuItem.name);
    const existingDraftItem = draftItems.find(
      (item) =>
        item.sourceMenuItemId === menuItem.id ||
        normalizeSelectionLabel(item.name) === normalizedMenuItemName,
    );
    if (existingDraftItem) {
      setDraftItems((currentItems) =>
        currentItems.filter((item) => item.id !== existingDraftItem.id),
      );
      return;
    }

    setDraftItems((currentItems) => [
      ...currentItems,
      {
        id: menuItem.id,
        name: menuItem.name,
        rating: 3,
        description: "",
        notes: "",
        photos: [],
        sourceMenuItemId: menuItem.id,
      },
    ]);
  };

  const handleRequestMenuReview = async () => {
    if (
      !selectedRestaurantId ||
      !isOnline ||
      hasPendingMenuReview ||
      menuReviewSubmitted
    ) {
      return;
    }

    try {
      await createCollectionRecord("menu_review_requests", {
        restaurant: selectedRestaurantId,
        requestedBy: currentUserId,
        reason: "User reported incorrect menu items",
        status: "pending",
      });
      setMenuReviewSubmitted(true);
      setTimeout(() => {
        setMenuReviewSubmitted(false);
      }, 3000);
      await pendingMenuReviewQuery.refetch();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not submit review request.";
      setErrorMessage(message);
    }
  };

  const renderMenuItemCard = (menuItem: MenuItemRecord) => {
    const isSelected = isMenuItemSelected(menuItem);
    const visibility = normalizeMenuItemVisibility(menuItem.visibility);
    const isUserCreated = menuItem.createdBy === currentUserId;

    return (
      <Pressable
        onPress={() => {
          toggleMenuItemSelection(menuItem);
        }}
        style={[
          styles.menuItemRow,
          isSelected ? styles.menuItemRowSelected : null,
        ]}
      >
        <View style={styles.menuItemHeaderRow}>
          <View style={styles.menuItemNameWrap}>
            <Text variant="label">{menuItem.name}</Text>
          </View>
          <Ionicons
            color={
              isSelected ? theme.colors.text.success : theme.colors.text.muted
            }
            name={isSelected ? "checkmark-circle" : "ellipse-outline"}
            size={20}
          />
        </View>

        <View style={styles.menuItemMetaRow}>
          <View style={styles.menuItemBadgeRow}>
            <VisibilityBadge value={visibility} />
          </View>

          {isUserCreated ? (
            <Pressable
              accessibilityRole="button"
              onPress={(event) => {
                event.stopPropagation();
                navigation.navigate("CreateVisitEditMenuItem", {
                  menuItemId: menuItem.id,
                  restaurantId: menuItem.restaurant,
                  initialName: menuItem.name,
                  initialVisibility: visibility,
                });
              }}
              style={styles.menuItemEditButton}
            >
              <Ionicons
                color={theme.colors.text.secondary}
                name="pencil-outline"
                size={14}
              />
              <Text tone="secondary" variant="bodySm">
                Edit
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const handleSearchByText = async (collapseAfterSearch = false) => {
    if (!isOnline) {
      setSearchErrorMessage(
        "Google Places search requires internet connection.",
      );
      return;
    }

    if (isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide) {
      trackObservabilityEvent("USAGE_LIMIT_REACHED", {
        enforcement: "client_estimate",
        limit: monthlyUsage.snapshot?.limits.placesQueriesMonthly ?? null,
        metric: "places_queries",
        remaining: placesQueriesRemaining,
        source: "CreateVisitScreen",
        used: monthlyUsage.snapshot?.usage.placesQueries ?? null,
      });
      setSearchErrorMessage("Monthly food place search limit reached.");
      return;
    }

    const trimmedQuery = restaurantSearchQuery.trim();
    const trimmedLocation = manualLocation.trim();
    trackObservabilityEvent("CREATE_VISIT_RESTAURANT_SEARCH_STARTED", {
      hasLocation: Boolean(trimmedLocation),
      hasQuery: Boolean(trimmedQuery),
      source: "CreateVisitScreen",
    });
    if (!trimmedQuery && !trimmedLocation) {
      setSearchErrorMessage("Enter a place name/type or a location to search.");
      return;
    }

    if (collapseAfterSearch) {
      setIsSearchExpanded(false);
    }

    setIsSearching(true);
    setShowNearbyPlaces(true);
    setSearchErrorMessage(null);
    setLocationPermissionNeedsSettings(false);
    let didAttemptPlacesQuery = false;

    try {
      let nextReferenceCoords: { lat: number; lng: number } | null =
        referenceCoords;
      if (trimmedLocation) {
        nextReferenceCoords = await geocodeLocation(trimmedLocation);
      }

      setReferenceCoords(nextReferenceCoords);
      didAttemptPlacesQuery = true;
      const results = await searchAndCacheRestaurantsByText({
        query: trimmedQuery || "food",
        location: trimmedLocation || undefined,
        radius: 5000,
      });

      setSearchResults(results);
      trackObservabilityEvent("CREATE_VISIT_RESTAURANT_SEARCH_COMPLETED", {
        resultCount: results.length,
        source: "CreateVisitScreen",
      });
      await restaurantsQuery.refetch();
      if (collapseAfterSearch) {
        setTimeout(() => {
          scrollToRestaurantList();
        }, 60);
      }
    } catch (error) {
      const limitPayload = parseLimitExceededError(error);
      if (limitPayload) {
        trackObservabilityEvent("USAGE_LIMIT_REACHED", {
          enforcement: "server",
          limit: limitPayload.limit,
          metric: limitPayload.metric,
          monthKey: limitPayload.monthKey,
          remaining: limitPayload.remaining,
          source: "CreateVisitScreen",
          used: limitPayload.used,
          userTier: limitPayload.userTier ?? null,
        });
      }
      const message = limitPayload
        ? formatLimitExceededMessage(limitPayload)
        : error instanceof Error
          ? error.message
          : "Could not search restaurants.";
      trackObservabilityEvent("CREATE_VISIT_RESTAURANT_SEARCH_FAILED", {
        errorMessage: message,
        errorType: error instanceof Error ? error.name : "unknown_error",
        source: "CreateVisitScreen",
      });
      setSearchErrorMessage(message);
    } finally {
      setIsSearching(false);
      if (didAttemptPlacesQuery) {
        await queryClient.invalidateQueries({
          queryKey: ["feature", "usage", "monthly"],
        });
      }
    }
  };

  const handleSearchNearby = async () => {
    if (!isOnline) {
      setSearchErrorMessage("Nearby search requires internet connection.");
      return;
    }

    if (isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide) {
      trackObservabilityEvent("USAGE_LIMIT_REACHED", {
        enforcement: "client_estimate",
        limit: monthlyUsage.snapshot?.limits.placesQueriesMonthly ?? null,
        metric: "places_queries",
        remaining: placesQueriesRemaining,
        source: "CreateVisitScreen",
        used: monthlyUsage.snapshot?.usage.placesQueries ?? null,
      });
      setSearchErrorMessage("Monthly food place search limit reached.");
      return;
    }

    trackObservabilityEvent("CREATE_VISIT_NEARBY_SEARCH_STARTED", {
      source: "CreateVisitScreen",
    });
    setShowNearbyPlaces(true);
    setSearchErrorMessage(null);
    setLocationPermissionNeedsSettings(false);
    setIsGettingLocation(true);
    let didAttemptPlacesQuery = false;

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        trackObservabilityEvent("CREATE_VISIT_LOCATION_PERMISSION_DENIED", {
          canAskAgain: permission.canAskAgain,
          source: "CreateVisitScreen",
        });
        setLocationPermissionNeedsSettings(permission.canAskAgain === false);
        setSearchErrorMessage(
          permission.canAskAgain === false
            ? "Location permission is blocked. Enable it in device settings."
            : "Location permission is required to find nearby places.",
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setReferenceCoords(coords);

      setIsSearchingNearby(true);
      didAttemptPlacesQuery = true;
      const results = await searchAndCacheNearbyRestaurants({
        latitude: coords.lat,
        longitude: coords.lng,
        radius: 5000,
      });

      setNearbyResults(results);
      trackObservabilityEvent("CREATE_VISIT_NEARBY_SEARCH_COMPLETED", {
        resultCount: results.length,
        source: "CreateVisitScreen",
      });
      await restaurantsQuery.refetch();
    } catch (error) {
      const limitPayload = parseLimitExceededError(error);
      if (limitPayload) {
        trackObservabilityEvent("USAGE_LIMIT_REACHED", {
          enforcement: "server",
          limit: limitPayload.limit,
          metric: limitPayload.metric,
          monthKey: limitPayload.monthKey,
          remaining: limitPayload.remaining,
          source: "CreateVisitScreen",
          used: limitPayload.used,
          userTier: limitPayload.userTier ?? null,
        });
      }
      const message = limitPayload
        ? formatLimitExceededMessage(limitPayload)
        : error instanceof Error
          ? error.message
          : "Could not load nearby restaurants.";
      trackObservabilityEvent("CREATE_VISIT_NEARBY_SEARCH_FAILED", {
        errorMessage: message,
        errorType: error instanceof Error ? error.name : "unknown_error",
        source: "CreateVisitScreen",
      });
      setSearchErrorMessage(message);
    } finally {
      setIsGettingLocation(false);
      setIsSearchingNearby(false);
      if (didAttemptPlacesQuery) {
        await queryClient.invalidateQueries({
          queryKey: ["feature", "usage", "monthly"],
        });
      }
    }
  };

  const updateDraftItem = (
    itemId: string,
    updates: Partial<
      Pick<DraftVisitItem, "rating" | "description" | "notes" | "photos">
    >,
  ) => {
    setDraftItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId ? { ...item, ...updates } : item,
      ),
    );
  };

  const handleVisitDateChange = (value: string) => {
    setVisitDate(value);
    setIsVisitDateAutoFilled(false);
  };

  const applyPhotoCaptureDateToVisit = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      const captureDate = await resolvePhotoCaptureDate(asset);
      if (!captureDate) {
        return;
      }

      setVisitDate(formatDateToLocalDateString(captureDate));
      setIsVisitDateAutoFilled(true);
    },
    [],
  );

  const openPhotoViewer = (photos: DraftVisitItemPhoto[], initialIndex: number) => {
    if (photos.length === 0) {
      return;
    }

    setPhotoViewerUrls(photos.map((photo) => photo.uri));
    setPhotoViewerInitialIndex(initialIndex);
    setIsPhotoViewerVisible(true);
  };

  const handleVisitVisibilityChange = (value: VisibilityOptionValue) => {
    if (value === "friends" || value === "private") {
      setVisitVisibility(value);
    }
  };

  const attachPhotoToDraftItem = async (
    itemId: string,
    source: "camera" | "gallery",
  ) => {
    trackObservabilityEvent("CREATE_VISIT_PHOTO_PICK_STARTED", {
      photoSource: source,
      source: "CreateVisitScreen",
    });
    setPhotoPermissionNeedsSettings(false);

    const targetItem = draftItems.find((item) => item.id === itemId);
    if (!targetItem) {
      return;
    }

    if (
      perRecordPhotoLimit !== null &&
      targetItem.photos.length >= perRecordPhotoLimit
    ) {
      trackObservabilityEvent("USAGE_LIMIT_REACHED", {
        enforcement: "client_estimate",
        limit: perRecordPhotoLimit,
        metric: "photo_uploads_per_record",
        remaining: Math.max(perRecordPhotoLimit - targetItem.photos.length, 0),
        source: "CreateVisitScreen",
        used: targetItem.photos.length,
      });
      setErrorMessage(
        `You can upload up to ${perRecordPhotoLimit} photo${perRecordPhotoLimit === 1 ? "" : "s"} per item.`,
      );
      return;
    }

    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      const needsSettings = permission.canAskAgain === false;
      trackObservabilityEvent("CREATE_VISIT_PHOTO_PERMISSION_DENIED", {
        canAskAgain: permission.canAskAgain,
        photoSource: source,
        source: "CreateVisitScreen",
      });
      setPhotoPermissionNeedsSettings(needsSettings);
      setErrorMessage(
        needsSettings
          ? source === "camera"
            ? "Camera permission is blocked. Enable it in device settings."
            : "Photo library permission is blocked. Enable it in device settings."
          : source === "camera"
            ? "Camera permission is required to take a photo."
            : "Photo library permission is required to upload an image.",
      );
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: false,
            exif: true,
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: false,
            exif: true,
            quality: 0.8,
            selectionLimit: 1,
          });

    if (result.canceled || result.assets.length === 0) {
      trackObservabilityEvent("CREATE_VISIT_PHOTO_PICK_CANCELED", {
        photoSource: source,
        source: "CreateVisitScreen",
      });
      return;
    }

    const asset = result.assets[0];
    const photo: DraftVisitItemPhoto = {
      uri: asset.uri,
      name: asset.fileName?.trim() || buildDraftPhotoName(asset.uri),
      mimeType: asset.mimeType || inferImageMimeType(asset.uri),
    };

    await applyPhotoCaptureDateToVisit(asset);

    setDraftItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        if (
          item.photos.some((existingPhoto) => existingPhoto.uri === photo.uri)
        ) {
          return item;
        }

        return {
          ...item,
          photos: [...item.photos, photo],
        };
      }),
    );
    trackObservabilityEvent("CREATE_VISIT_PHOTO_PICKED", {
      photoSource: source,
      source: "CreateVisitScreen",
    });
    setPhotoPermissionNeedsSettings(false);
    setErrorMessage(null);
  };

  const removeDraftItemPhoto = (itemId: string, uri: string) => {
    setIsPhotoViewerVisible(false);
    setDraftItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              photos: item.photos.filter((photo) => photo.uri !== uri),
            }
          : item,
      ),
    );
  };

  const submitVisit = async () => {
    const trimmedRestaurant = restaurantName.trim();
    const trimmedVisitDate = visitDate.trim();

    if (!trimmedRestaurant) {
      setErrorMessage("Select a restaurant before continuing.");
      return;
    }

    if (draftItems.length === 0) {
      setErrorMessage("Add at least one item.");
      return;
    }

    if (!isValidLocalDate(trimmedVisitDate)) {
      setErrorMessage("Visit date must be in YYYY-MM-DD format.");
      return;
    }

    const parsedItems = draftItems.map((item) => ({
      id: item.id,
      name: item.name,
      rating: item.rating,
      description: item.description.trim() || undefined,
      notes: item.notes.trim() || undefined,
      photos: item.photos,
    }));

    if (parsedItems.some((item) => item.rating < 1 || item.rating > 5)) {
      setErrorMessage("Ratings must be between 1 and 5.");
      return;
    }

    if (shouldEnforceUsageLimitsClientSide && isDisplayFreeUser && monthlyUsage.snapshot) {
      const photosInSubmission = parsedItems.reduce(
        (totalCount, item) => totalCount + item.photos.length,
        0,
      );
      const estimatedTotalAfterSubmit =
        monthlyUsage.snapshot.usage.photoUploads + photosInSubmission;
      if (estimatedTotalAfterSubmit > FREE_MONTHLY_PHOTO_LIMIT) {
        const remaining = Math.max(
          FREE_MONTHLY_PHOTO_LIMIT - monthlyUsage.snapshot.usage.photoUploads,
          0,
        );
        trackObservabilityEvent("USAGE_LIMIT_REACHED", {
          enforcement: "client_estimate",
          limit: FREE_MONTHLY_PHOTO_LIMIT,
          metric: "photo_uploads",
          remaining,
          source: "CreateVisitScreen",
          used: monthlyUsage.snapshot.usage.photoUploads,
        });
        setErrorMessage(
          `Free users can upload up to ${FREE_MONTHLY_PHOTO_LIMIT} photos per month. Remaining estimate: ${remaining}.`,
        );
        return;
      }
    }

    const visitInput = {
      restaurantName: trimmedRestaurant,
      items: parsedItems,
      visitedAt: localDateStringToUTC(trimmedVisitDate),
      visibility: visitVisibility,
      source: "visit" as const,
    };

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (isEditMode && editVisitId) {
        const visitUpdateInput = {
          restaurantName: trimmedRestaurant,
          items: parsedItems.map((item) => ({
            id: item.id,
            name: item.name,
            rating: item.rating,
            description: item.description,
            notes: item.notes,
          })),
          visitedAt: localDateStringToUTC(trimmedVisitDate),
          visibility: visitVisibility,
        };

        if (!isOnline) {
          await queueFeatureOutbox("visit.update", {
            visitId: editVisitId,
            updates: visitUpdateInput,
          });
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["feature", "visits"] }),
            queryClient.invalidateQueries({
              queryKey: ["feature", "visit", editVisitId],
            }),
          ]);
          showQueuedOfflineAlert("Visit update");
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate("Home");
          }
          return;
        }

        await queueWrite("visit.update");
        await updateVisit(editVisitId, visitUpdateInput);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["feature", "visits"] }),
          queryClient.invalidateQueries({
            queryKey: ["feature", "visit", editVisitId],
          }),
        ]);
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate("Home");
        }
        return;
      }

      if (!isOnline) {
        await queueFeatureOutbox("visit.create", visitInput);
        setSourceListItemId(null);
        await queryClient.invalidateQueries({ queryKey: ["feature", "visits"] });
        showQueuedOfflineAlert('Visit');
        navigation.navigate("Home");
        return;
      }

      await queueWrite("visit.create");
      const createdVisit = await createVisit(visitInput);

      if (sourceListItemId && createdVisit.items.length > 0) {
        const createdItemId = createdVisit.items[0]?.id;
        if (createdItemId) {
          try {
            await queueWrite("list.bookmark.link-visit");
            await linkVisitToListBookmark({
              listItemId: sourceListItemId,
              userFoodItemId: createdItemId,
            });
            await queryClient.invalidateQueries({
              queryKey: ["feature", "restaurantListItems"],
            });
          } catch {
            // Keep visit creation successful even when link-back fails.
          }
        }
      }
      setSourceListItemId(null);

      trackObservabilityEvent("Visit Creation Completed", {
        creationMethod: "manual",
        hasNotes: parsedItems.some((item) => Boolean(item.notes)),
        hasPhotos: parsedItems.some((item) => item.photos.length > 0),
        itemCount: parsedItems.length,
        source: "CreateVisitScreen",
        visitVisibility,
      });

      await queryClient.invalidateQueries({ queryKey: ["feature", "visits"] });
      await queryClient.invalidateQueries({
        queryKey: ["feature", "usage", "monthly"],
      });
      navigation.navigate("Home");
    } catch (error) {
      const limitPayload = parseLimitExceededError(error);
      if (limitPayload) {
        trackObservabilityEvent("USAGE_LIMIT_REACHED", {
          enforcement: "server",
          limit: limitPayload.limit,
          metric: limitPayload.metric,
          monthKey: limitPayload.monthKey,
          remaining: limitPayload.remaining,
          source: "CreateVisitScreen",
          used: limitPayload.used,
          userTier: limitPayload.userTier ?? null,
        });
      }
      const message = limitPayload
        ? formatLimitExceededMessage(limitPayload)
        : error instanceof Error
          ? error.message
          : "Could not save visit.";
      setErrorMessage(message);
      trackObservabilityEvent("Visit Creation Failed", {
        errorMessage: message,
        errorType: error instanceof Error ? error.name : "unknown_error",
        source: "CreateVisitScreen",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackPress = () => {
    if (step > 0) {
      setStep((currentStep) => (currentStep - 1) as VisitWizardStep);
      setErrorMessage(null);
      return;
    }

    setSourceListItemId(null);
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate(isEditMode ? "Home" : "AddVisit");
  };

  const primaryAction =
    step === 0
      ? {
          label: "Continue",
          disabled: !restaurantName.trim(),
          onPress: () => {
            setStep(1);
            setErrorMessage(null);
          },
        }
      : step === 1
        ? {
            label: selectedMenuItemCount > 0 ? "Rate Items" : "Select Items",
            disabled: selectedMenuItemCount === 0,
            onPress: () => {
              setStep(2);
              setErrorMessage(null);
            },
          }
      : {
            label: isEditMode ? "Save Changes" : "Save Visit",
            disabled: isSubmitting || draftItems.length === 0,
            loading: isSubmitting,
            onPress: () => {
              void submitVisit();
            },
          };

  const secondaryAction =
    step === 0
      ? {
          label: "Cancel",
          onPress: () => {
            setSourceListItemId(null);
            if (navigation.canGoBack()) {
              navigation.goBack();
              return;
            }

            navigation.navigate(isEditMode ? "Home" : "AddVisit");
          },
        }
      : step === 1
        ? {
            label: "Cancel",
            onPress: () => {
              setSourceListItemId(null);
              setStep(0);
              setErrorMessage(null);
            },
          }
        : {
            label: "Back",
            onPress: () => {
              setStep((currentStep) => (currentStep - 1) as VisitWizardStep);
              setErrorMessage(null);
            },
          };

  const headerReviewText = hasPendingMenuReview
    ? "Review requested"
    : menuReviewSubmitted
      ? "Request submitted"
      : "Request review";
  const isReviewBadgeDisabled =
    !isOnline || hasPendingMenuReview || menuReviewSubmitted;
  const trimmedRestaurantName = restaurantName.trim();
  const headerSubtitle =
    step === 0
      ? isEditMode
        ? "Update the restaurant for this visit."
        : "Select your restaurant here."
      : step === 1
        ? `Search and select items you had at ${trimmedRestaurantName || "this restaurant"}.`
        : isEditMode
          ? `Update ratings for your selected items from ${trimmedRestaurantName || "this restaurant"}.`
          : `Rate your selected items and save your visit for ${trimmedRestaurantName || "this restaurant"}.`;

  const headerProgress = (
    <StepProgressBar compact currentStep={step} steps={WIZARD_STEPS} />
  );
  const menuItemsLabel = menuItemSearchQuery.trim()
    ? `Search results (${filteredMenuItems.length})`
    : `All menu items (${menuItemsQuery.data?.length ?? 0})`;
  const firstUnselectedMenuItemIndex = displayedMenuItems.findIndex(
    (item) => !isMenuItemSelected(item),
  );
  const estimatedMonthlyPhotoTotal =
    (monthlyUsage.snapshot?.usage.photoUploads ?? 0) + draftPhotoCount;
  const estimatedFreeMonthlyPhotosRemaining = Math.max(
    FREE_MONTHLY_PHOTO_LIMIT - estimatedMonthlyPhotoTotal,
    0,
  );
  const shouldShowPlacesUpgradePrompt =
    isDisplayFreeUser &&
    typeof placesQueriesRemaining === 'number' &&
    placesQueriesRemaining <= FREE_SEARCH_WARNING_THRESHOLD;
  const shouldShowPhotoUpgradePrompt =
    isDisplayFreeUser &&
    draftPhotoCount > 0 &&
    estimatedFreeMonthlyPhotosRemaining <= FREE_MONTHLY_PHOTO_WARNING_THRESHOLD;

  if (isEditMode && hydratedEditVisitId !== editVisitId) {
    if (editVisitQuery.isError) {
      return (
        <FeatureFormScreenScaffold
          keyboardAware
          onBackPress={handleBackPress}
          primaryAction={{
            label: "Retry",
            onPress: () => {
              void editVisitQuery.refetch();
            },
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: handleBackPress,
          }}
          subtitle="We couldn't load this visit."
          title="Edit Restaurant Visit"
        >
          <ErrorState
            description="Could not load visit details."
            onRetry={() => {
              void editVisitQuery.refetch();
            }}
            title="Visit unavailable"
          />
        </FeatureFormScreenScaffold>
      );
    }

    if (!editVisitQuery.isLoading && !editVisitQuery.data) {
      return (
        <FeatureFormScreenScaffold
          keyboardAware
          onBackPress={handleBackPress}
          primaryAction={{
            label: "Back to Home",
            onPress: () => {
              navigation.navigate("Home");
            },
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: handleBackPress,
          }}
          subtitle="This visit could not be found."
          title="Edit Restaurant Visit"
        >
          <EmptyState
            actionLabel="Back to Home"
            onAction={() => {
              navigation.navigate("Home");
            }}
            title="Visit not found"
          />
        </FeatureFormScreenScaffold>
      );
    }

    return (
      <FeatureFormScreenScaffold
        keyboardAware
        onBackPress={handleBackPress}
        primaryAction={{
          label: "Loading",
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: "Cancel",
          onPress: handleBackPress,
        }}
        subtitle="Loading your visit details."
        title="Edit Restaurant Visit"
      >
        <LoadingState label="Loading visit..." />
      </FeatureFormScreenScaffold>
    );
  }

  return (
    <FeatureFormScreenScaffold
      headerBottomCompact
      headerBottomContent={headerProgress}
      keyboardAware
      onBackPress={handleBackPress}
      primaryAction={primaryAction}
      scrollViewRef={scrollViewRef}
      secondaryAction={secondaryAction}
      subtitle={headerSubtitle}
      title={isEditMode ? "Edit Restaurant Visit" : "Track Restaurant Visit"}
    >
      <PageErrorToast
        actionLabel={photoPermissionNeedsSettings ? "Open Settings" : undefined}
        errorMessage={errorMessage}
        onAction={
          photoPermissionNeedsSettings
            ? () => {
                void Linking.openSettings();
              }
            : undefined
        }
        title="Visit draft issue"
      />

      {step === 0 ? (
        <>
          {restaurantName.trim() ? (
            <View style={styles.selectedHint}>
              <Ionicons
                color={theme.colors.text.success}
                name="checkmark-circle"
                size={16}
              />
              <Text tone="success">Selected: {restaurantName}</Text>
            </View>
          ) : null}

          <Card style={styles.sectionCard}>
            <View style={styles.searchHeader}>
              <View style={styles.searchHeaderTitle}>
                <Ionicons
                  color={theme.colors.text.info}
                  name="search-outline"
                  size={18}
                />
                <Text variant="label">Search for food places</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setIsSearchExpanded((currentValue) => !currentValue);
                }}
                style={styles.searchHeaderButton}
              >
                <Text tone="secondary" variant="bodySm">
                  {isSearchExpanded ? "Collapse" : "Expand"}
                </Text>
                <Ionicons
                  color={theme.colors.text.secondary}
                  name={
                    isSearchExpanded
                      ? "chevron-up-outline"
                      : "chevron-down-outline"
                  }
                  size={14}
                />
              </Pressable>
            </View>

            {!isSearchExpanded ? (
              <View style={styles.compactSearchRow}>
                <Input
                  autoCapitalize="words"
                  containerStyle={styles.compactSearchField}
                  onChangeText={setRestaurantSearchQuery}
                  placeholder="Place name or type"
                  value={restaurantSearchQuery}
                />
                <Button
                  disabled={createVisitSearchUi.isSearchDisabled}
                  label={isSearching ? "Searching..." : compactSearchLabel}
                  loading={isSearching}
                  onPress={() => {
                    void handleSearchByText(true);
                  }}
                  style={styles.compactSearchButton}
                />
              </View>
            ) : (
              <>
                <Input
                  autoCapitalize="words"
                  label="Place name or type"
                  onChangeText={setRestaurantSearchQuery}
                  placeholder="e.g., Starbucks, cafe, bakery"
                  value={restaurantSearchQuery}
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
                    disabled={
                      !isOnline ||
                      isGettingLocation ||
                      isSearchingNearby ||
                      (isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide)
                    }
                    loading={isGettingLocation || isSearchingNearby}
                    onPress={() => {
                      void handleSearchNearby();
                    }}
                    style={styles.locationAction}
                    variant="inline"
                  />
                </View>

                <Button
                  disabled={createVisitSearchUi.isSearchDisabled}
                  label={isSearching ? "Searching..." : expandedSearchLabel}
                  loading={isSearching}
                  onPress={() => {
                    void handleSearchByText(true);
                  }}
                />

                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    navigation.navigate("CreateVisitAddRestaurant", {
                      editVisitId,
                    });
                  }}
                  style={styles.inlineLink}
                >
                  <Text tone="brand">Add new restaurant</Text>
                </Pressable>
              </>
            )}

            {!isOnline ? (
              <Text tone="warning">
                Google Places search requires internet connection.
              </Text>
            ) : isPlacesQuotaReached ? (
              <Text tone="warning">
                {shouldEnforceUsageLimitsClientSide
                  ? "Monthly food place search limit reached."
                  : "Monthly food place search limit reached in preview mode. Admin access is still allowed."}
              </Text>
            ) : null}

            {shouldShowPlacesUpgradePrompt ? (
              <UpgradePromptCard
                description={
                  isPlacesQuotaReached
                    ? "You have reached this month's free search limit. Subscriber accounts have higher limits for place search."
                    : `Only ${placesQueriesRemaining} food place searches left this month. Subscriber accounts have higher limits for place search.`
                }
                title={
                  isPlacesQuotaReached ? 'Free limit reached' : 'You are close to your free limit'
                }
              />
            ) : null}
          </Card>

          {searchErrorMessage ? (
          <Card style={styles.statusCard}>
            <Text tone="danger">{searchErrorMessage}</Text>
            {locationPermissionNeedsSettings ? (
              <Button
                label="Open Settings"
                onPress={() => {
                  void Linking.openSettings();
                }}
                variant="secondary"
              />
            ) : null}
          </Card>
        ) : null}

          {showNearbyPlaces ? (
            <>
              {isSearching || isSearchingNearby || isGettingLocation ? (
                <Card style={styles.statusCard} tone="muted">
                  <LoadingState label="Looking up nearby food places..." />
                </Card>
              ) : null}

              <View
                onLayout={(event) => {
                  setRestaurantListAnchorY(event.nativeEvent.layout.y);
                }}
              >
                <Card style={styles.listCard}>
                  <Text variant="label">Search Results</Text>
                  {displayedNearbyRestaurants.length === 0 ? (
                    <EmptyState
                      description="Try a different query or location."
                      title="No food places found"
                    />
                  ) : (
                    displayedNearbyRestaurants.map(renderRestaurantItem)
                  )}
                </Card>
              </View>

              <Button
                label="Clear Search Results"
                onPress={clearSearchState}
                variant="secondary"
              />
            </>
          ) : null}

          {!showNearbyPlaces ? (
            <View
              onLayout={(event) => {
                setRestaurantListAnchorY(event.nativeEvent.layout.y);
              }}
            >
                <Card style={styles.listCard}>
                  <Text variant="label">Your restaurants</Text>
                  {restaurantsQuery.isLoading ? (
                    <LoadingState label="Loading restaurants..." />
                  ) : restaurantsQuery.isError ? (
                    <PageErrorToast
                      errorMessage="Could not load your restaurants."
                    title="Restaurant list unavailable"
                    actionLabel="Retry"
                    onAction={() => {
                      void restaurantsQuery.refetch();
                    }}
                  />
                ) : displayedSavedRestaurants.length === 0 ? (
                  <EmptyState
                    description="Search nearby places or add a new restaurant to start."
                    title="No restaurants yet"
                  />
                ) : (
                  displayedSavedRestaurants.map(renderRestaurantItem)
                )}
              </Card>
            </View>
          ) : null}
        </>
      ) : null}

      {step === 1 ? (
        <View style={styles.stepOneContainer}>
          {isTipPopoverVisible ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss tip"
              onPress={() => {
                setIsTipPopoverVisible(false);
              }}
              style={styles.tipDismissOverlay}
            />
          ) : null}

          <Card
            style={[
              styles.quickActionsCard,
              isTipPopoverVisible ? styles.quickActionsCardRaised : null,
            ]}
          >
            <View style={styles.quickActionsPrimaryRow}>
              <Pressable
                accessibilityRole="button"
                disabled={!isOnline}
                onPress={() => {
                  navigation.navigate("ProcessPhotos", {
                    mode: "menu_scan",
                    restaurantId: selectedRestaurantId ?? undefined,
                    restaurantName: restaurantName.trim() || undefined,
                    autoStartSourcePicker: true,
                  });
                }}
                style={[
                  styles.menuActionButton,
                  styles.quickActionsPrimaryButton,
                  !isOnline ? { opacity: 0.55 } : null,
                ]}
              >
                <Ionicons
                  color={theme.colors.text.primary}
                  name={isOnline ? "camera-outline" : "cloud-offline-outline"}
                  size={16}
                />
                <Text>
                  {isOnline ? "Scan Menu Photo" : "Scan Menu (Offline)"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show item entry tip"
                onPress={() => {
                  setIsTipPopoverVisible((visible) => !visible);
                }}
                style={styles.tipIconButton}
              >
                <Ionicons
                  color={theme.colors.text.warning}
                  name="bulb-outline"
                  size={14}
                />
              </Pressable>
            </View>
            {isTipPopoverVisible ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                }}
                style={styles.tipPopover}
              >
                <View style={styles.tipPopoverArrow} />
                <View style={styles.tipPopoverHeaderRow}>
                  <View style={styles.tipPopoverTitleRow}>
                    <Ionicons
                      color={theme.colors.text.warning}
                      name="bulb-outline"
                      size={14}
                    />
                    <Text variant="label">Tip</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close tip"
                    onPress={() => {
                      setIsTipPopoverVisible(false);
                    }}
                    style={styles.tipPopoverClose}
                  >
                    <Ionicons
                      color={theme.colors.text.secondary}
                      name="close"
                      size={12}
                    />
                  </Pressable>
                </View>
                <Text tone="secondary" variant="bodySm">
                  Use “Scan Menu Photo” for faster item entry, or add an item
                  manually if it is missing.
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={!selectedRestaurantId}
              onPress={() => {
                if (!selectedRestaurantId || !restaurantName.trim()) {
                  return;
                }

                navigation.navigate("CreateVisitAddMenuItem", {
                  editVisitId,
                  restaurantId: selectedRestaurantId,
                  restaurantName: restaurantName.trim(),
                });
              }}
              style={[
                styles.menuActionButton,
                !selectedRestaurantId ? { opacity: 0.55 } : null,
              ]}
            >
              <Ionicons
                color={theme.colors.text.primary}
                name="add-outline"
                size={16}
              />
              <Text>Can't find it? Add manually</Text>
            </Pressable>
          </Card>

          <Card style={styles.listCard}>
            <View style={styles.menuItemsHeader}>
              <View style={styles.menuItemsHeaderLeft}>
                <Text tone="secondary">{menuItemsLabel}</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={isReviewBadgeDisabled}
                  onPress={() => {
                    void handleRequestMenuReview();
                  }}
                  style={[
                    styles.reviewBadge,
                    isReviewBadgeDisabled ? styles.reviewBadgeDisabled : null,
                  ]}
                >
                  <Ionicons
                    color={
                      hasPendingMenuReview
                        ? theme.colors.text.warning
                        : menuReviewSubmitted
                          ? theme.colors.text.success
                          : theme.colors.text.secondary
                    }
                    name={
                      menuReviewSubmitted
                        ? "checkmark-circle-outline"
                        : "flag-outline"
                    }
                    size={12}
                  />
                  <Text
                    ellipsizeMode="tail"
                    numberOfLines={1}
                    tone={
                      hasPendingMenuReview
                        ? "warning"
                        : menuReviewSubmitted
                          ? "success"
                          : "secondary"
                    }
                    variant="bodySm"
                  >
                    {headerReviewText}
                  </Text>
                </Pressable>
              </View>
              {selectedMenuItemCount > 0 ? (
                <Text tone="success" variant="label">
                  {selectedMenuItemCount} selected
                </Text>
              ) : null}
            </View>
            <Input
              containerStyle={styles.menuSearchInput}
              onChangeText={setMenuItemSearchQuery}
              placeholder="Search menu items..."
              value={menuItemSearchQuery}
            />

            {menuItemsQuery.isLoading ? (
              <LoadingState label="Loading menu items..." />
            ) : menuItemsQuery.isError ? (
              <PageErrorToast
                errorMessage="Could not load menu items for this restaurant."
                title="Menu unavailable"
                actionLabel="Retry"
                onAction={() => {
                  void menuItemsQuery.refetch();
                }}
              />
            ) : displayedMenuItems.length === 0 ? (
              <EmptyState
                description={
                  menuItemSearchQuery.trim()
                    ? "No items found. Try another search or add manually."
                    : "No menu items yet. Scan a menu or add one manually."
                }
                title="No items available"
              />
            ) : (
              displayedMenuItems.map((menuItem, index) => (
                <View key={menuItem.id}>
                  {selectedMenuItemCount > 0 &&
                  index === firstUnselectedMenuItemIndex ? (
                    <View style={styles.menuItemDividerRow}>
                      <View style={styles.menuItemDividerLine} />
                      <Text tone="muted" variant="bodySm">
                        Other items
                      </Text>
                      <View style={styles.menuItemDividerLine} />
                    </View>
                  ) : null}
                  {renderMenuItemCard(menuItem)}
                </View>
              ))
            )}
          </Card>
        </View>
      ) : null}

      {step === 2 ? (
        <>
          {!isEditMode && shouldShowOfflineUsageWarning(isOnline, isDisplayFreeUser) ? (
            <Card style={styles.statusCard}>
              <Text tone="warning">
                Offline estimate may be stale. Backend limits are enforced when sync runs.
              </Text>
            </Card>
          ) : null}

          {!isEditMode && isDisplayFreeUser && draftPhotoCount > 0 ? (
            <Card style={styles.statusCard} tone="muted">
              <Text tone="secondary">
                Monthly photo estimate: {estimatedFreeMonthlyPhotosRemaining} left.
              </Text>
            </Card>
          ) : null}

          {!isEditMode && shouldShowPhotoUpgradePrompt ? (
            <UpgradePromptCard
              description={
                estimatedFreeMonthlyPhotosRemaining <= 0
                  ? "You have reached this month's free photo limit. Subscriber accounts have higher monthly photo limits."
                  : `Only ${estimatedFreeMonthlyPhotosRemaining} photo uploads left this month. Subscriber accounts have higher monthly photo limits.`
              }
              title={
                estimatedFreeMonthlyPhotosRemaining <= 0
                  ? 'Free limit reached'
                  : 'You are close to your free limit'
              }
            />
          ) : null}

          {isEditMode ? (
            <Card style={styles.statusCard} tone="muted">
              <Text tone="secondary">
                Edit mode currently updates restaurant, date, visibility, ratings, descriptions, and notes.
              </Text>
            </Card>
          ) : null}

          <Card style={styles.metadataCard}>
            <LocalDatePickerField
              helperText={
                isVisitDateAutoFilled ? "Auto-set from a selected photo date. You can still change it." : undefined
              }
              highlighted={isVisitDateAutoFilled}
              label="Visit Date"
              modalTitle="Select visit date"
              onChange={handleVisitDateChange}
              value={visitDate}
            />

            <View style={styles.visibilitySection}>
              <Text variant="label">Visibility</Text>
              <VisibilityOptionSelector
                labelOverrides={{ friends: "Friends only", private: "Only me" }}
                onChange={handleVisitVisibilityChange}
                options={["friends", "private"]}
                value={visitVisibility}
              />
            </View>
          </Card>

          <RatingLegend initiallyExpanded />

          {draftItems.map((item) => (
            <Card key={item.id} style={styles.itemCard}>
              <Text variant="label">{item.name}</Text>
              <RatingSelector
                onChange={(value) => {
                  updateDraftItem(item.id, { rating: value });
                }}
                value={item.rating}
              />
              <Input
                label="Description"
                onChangeText={(value) => {
                  updateDraftItem(item.id, { description: value });
                }}
                placeholder="Optional description or modification"
                value={item.description}
              />
              {!isEditMode ? (
                <>
                  <View style={styles.itemPhotoSection}>
                    <View style={styles.itemPhotoLabelRow}>
                      <Ionicons
                        color={theme.colors.text.secondary}
                        name="images-outline"
                        size={14}
                      />
                      <Text variant="label">Add photos</Text>
                    </View>
                    <PhotoSourceActionCards
                      cameraSubtitle="Camera"
                      cameraTitle="Capture"
                      gallerySubtitle="Photo Library"
                      galleryTitle="Upload"
                      onCameraPress={() => {
                        void attachPhotoToDraftItem(item.id, "camera");
                      }}
                      onGalleryPress={() => {
                        void attachPhotoToDraftItem(item.id, "gallery");
                      }}
                    />
                  </View>
                  {item.photos.length > 0 ? (
                    <View style={styles.itemPhotoList}>
                      {item.photos.map((photo, index) => (
                        <PhotoAttachmentRow
                          accessibilityLabel={`View attached photo ${index + 1} full screen`}
                          key={photo.uri}
                          name={photo.name}
                          onPress={() => {
                            openPhotoViewer(item.photos, index);
                          }}
                          onRemove={() => {
                            removeDraftItemPhoto(item.id, photo.uri);
                          }}
                          uri={photo.uri}
                        />
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}
              <Input
                label="Notes"
                onChangeText={(value) => {
                  updateDraftItem(item.id, { notes: value });
                }}
                placeholder='Optional notes, e.g. "tastes the same as every other boba shop"'
                value={item.notes}
              />
            </Card>
          ))}
        </>
      ) : null}

      <PhotoViewerModal
        initialIndex={photoViewerInitialIndex}
        onRequestClose={() => {
          setIsPhotoViewerVisible(false);
        }}
        urls={photoViewerUrls}
        visible={isPhotoViewerVisible}
      />
    </FeatureFormScreenScaffold>
  );
}
