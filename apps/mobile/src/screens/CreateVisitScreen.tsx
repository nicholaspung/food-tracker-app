import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
  EmptyState,
  ErrorState,
  FeatureFormScreenScaffold,
  LinkedNoteCard,
  LoadingState,
  PageErrorToast,
  StepProgressBar,
  VisitMenuItemOptionRow,
  VisitRestaurantOptionTrailing,
  VisitRestaurantSearchSection,
  type VisitRestaurantSearchOption,
} from '../components/shared';
import {
  createMenuReviewRequest,
  getAuthenticatedUserIdOrNull,
  getNoteById,
  getVisitById,
  type MenuItemRecord,
  useMonthlyUsage,
  type RestaurantRecord,
  type VisitItem,
} from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import { useRestaurantSelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import {
  formatDateToLocalDateString,
  getTodayLocalDateString,
  isValidLocalDate,
} from '../lib/dateFormatting';
import { buildLocalPhotoFile } from '../lib/photoFiles';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import {
  buildVisitRestaurantDescription,
  type VisitRestaurantWithDistance,
} from '../lib/visitRestaurantSearch';
import { shouldShowOfflineUsageWarning } from '../lib/usageUiRules';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { CreateVisitReviewStep } from './createVisit/CreateVisitReviewStep';
import {
  FREE_MONTHLY_PHOTO_LIMIT,
  FREE_MONTHLY_PHOTO_WARNING_THRESHOLD,
  WIZARD_STEPS,
  buildDraftVisitItem,
  formatFriendCount,
  formatVisitCount,
  resolveDefaultVisitVisibility,
  type CreateVisitScreenProps,
  type DraftVisitItemPhoto,
  type RestaurantStats,
  type VisitVisibility,
  type VisitWizardStep,
} from './createVisit/shared';
import { useCreateVisitDraftItems } from './createVisit/useCreateVisitDraftItems';
import { useCreateVisitSubmission } from './createVisit/useCreateVisitSubmission';
import { createThemedStyles, useTheme } from '../theme';
import { Card, Input, Text } from '../ui';

const useStyles = createThemedStyles((theme) => ({
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
}));

export function CreateVisitScreen({
  navigation,
  route,
}: CreateVisitScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();
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
  const sourceNoteId = route.params?.sourceNoteId;
  const isEditMode = Boolean(editVisitId);

  const [step, setStep] = useState<VisitWizardStep>(0);
  const [restaurantName, setRestaurantName] = useState("");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<
    string | null
  >(null);
  const [menuItemSearchQuery, setMenuItemSearchQuery] = useState("");
  const [menuReviewSubmitted, setMenuReviewSubmitted] = useState(false);
  const [isTipPopoverVisible, setIsTipPopoverVisible] = useState(false);
  const [visitDate, setVisitDate] = useState(getTodayLocalDateString());
  const [detectedVisitDateValue, setDetectedVisitDateValue] = useState<string | null>(null);
  const [visitVisibility, setVisitVisibility] = useState<VisitVisibility>(
    resolveDefaultVisitVisibility,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceListItemId, setSourceListItemId] = useState<string | null>(null);
  const [restaurantListAnchorY, setRestaurantListAnchorY] = useState(0);
  const [hydratedEditVisitId, setHydratedEditVisitId] = useState<string | null>(
    null,
  );
  const {
    permissionNeedsSettings: photoPermissionNeedsSettings,
    requestPermission: requestPhotoPickerPermission,
    resetPermissionNeedsSettings: resetPhotoPermissionNeedsSettings,
  } = usePhotoPickerPermissions({
    cameraBlockedMessage:
      "Camera permission is blocked. Enable it in device settings.",
    cameraRequiredMessage: "Camera permission is required to take a photo.",
    galleryBlockedMessage:
      "Photo library permission is blocked. Enable it in device settings.",
    galleryRequiredMessage:
      "Photo library permission is required to upload an image.",
  });
  const {
    clearPlacesSearchState: clearSearchState,
    clearSearchErrorMessage,
    compactSearchLabel,
    displayedNearbyRestaurants,
    displayedSavedRestaurants,
    expandedSearchLabel,
    isGettingLocation,
    isPlacesQuotaReached,
    isSearchExpanded,
    isSearchingNearbyRestaurants: isSearchingNearby,
    isSearchingRestaurants: isSearching,
    loadedRestaurantRecords,
    locationPermissionNeedsSettings,
    manualLocation,
    menuItemsQuery,
    savedEmptyDescription,
    savedEmptyTitle,
    savedRestaurantsErrorMessage,
    savedRestaurantsLoading,
    savedRestaurantsTitle,
    searchButtonDisabled,
    searchByText: runRestaurantSearchByText,
    searchErrorMessage,
    searchNearby: runNearbyRestaurantSearch,
    searchQuery: restaurantSearchQuery,
    setIsSearchExpanded,
    setManualLocation,
    setSearchQuery: setRestaurantSearchQuery,
    shouldShowPlacesUpgradePrompt,
    showNearbyPlaces,
    triggerSavedRestaurantsRefetch,
  } = useRestaurantSelectionFlow({
    isOnline,
    menuItemsEnabled: step === 1 && Boolean(selectedRestaurantId),
    savedRestaurantsEnabled: step === 0,
    selectedRestaurantId,
    usage: {
      enforceQuota: shouldEnforceUsageLimitsClientSide,
      isFreeTier: isDisplayFreeUser,
      placesQueriesRemaining,
    },
  });
  const {
    draftItems,
    draftPhotoCount,
    isMenuItemSelected,
    removeDraftItemPhoto,
    selectedMenuItemCount,
    setDraftItems,
    toggleMenuItemSelection,
    updateDraftItem,
  } = useCreateVisitDraftItems({
    menuItems: menuItemsQuery.data,
  });
  const currentUserId = getAuthenticatedUserIdOrNull() ?? "";
  const restaurantMetadataById = useMemo(() => {
    const metadata = new Map<
      string,
      RestaurantStats & { hasPendingMenuReview: boolean }
    >();
    for (const restaurant of loadedRestaurantRecords) {
      metadata.set(restaurant.id, {
        userVisitCount: restaurant.userVisitCount ?? 0,
        friendCount: restaurant.friendCount ?? 0,
        hasPendingMenuReview: restaurant.hasPendingMenuReview === true,
      });
    }
    return metadata;
  }, [loadedRestaurantRecords]);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const editVisitQuery = useQuery({
    queryKey: ["feature", "visit", editVisitId ?? ""],
    queryFn: async ({ signal }) => {
      if (!editVisitId) {
        return null;
      }

      return getVisitById(editVisitId, { signal });
    },
    enabled: Boolean(editVisitId),
  });
  const linkedNoteQuery = useQuery({
    queryKey: ['feature', 'note', sourceNoteId],
    queryFn: ({ signal }) => (sourceNoteId ? getNoteById(sourceNoteId, { signal }) : Promise.resolve(null)),
    enabled: Boolean(sourceNoteId),
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
          buildDraftVisitItem({
            id: preselectedMenuItemId,
            name: preselectedMenuItemName,
          }),
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
    clearSearchErrorMessage();
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
    clearSearchErrorMessage,
    navigation,
    route.params?.preselectedRestaurantId,
    route.params?.preselectedRestaurantName,
    route.params?.preselectedMenuItemId,
    route.params?.preselectedMenuItemName,
    route.params?.sourceListItemId,
    route.params?.returnToStep,
    selectedRestaurantId,
    setDraftItems,
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
      editVisitQuery.data.items.map((item: VisitItem) => ({
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
    setDetectedVisitDateValue(null);
    setVisitVisibility(
      editVisitQuery.data.visibility === "private" ? "private" : "friends",
    );
    setStep(requestedStep ?? 2);
    setErrorMessage(null);
    clearSearchErrorMessage();
    setSourceListItemId(null);
    setHydratedEditVisitId(editVisitId);
  }, [
    clearSearchErrorMessage,
    editVisitId,
    editVisitQuery.data,
    hydratedEditVisitId,
    route.params?.returnToStep,
    setDraftItems,
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
  const selectedRestaurantMetadata = selectedRestaurantId
    ? restaurantMetadataById.get(selectedRestaurantId) ?? null
    : null;
  const hasPendingMenuReview =
    selectedRestaurantMetadata?.hasPendingMenuReview === true;

  const styles = useStyles();

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
    clearSearchErrorMessage();
    setStep(1);
  };

  const getRestaurantStats = (restaurantId: string): RestaurantStats => {
    const metadata = restaurantMetadataById.get(restaurantId);
    if (!metadata) {
      return {
        userVisitCount: 0,
        friendCount: 0,
      };
    }

    return {
      userVisitCount: metadata.userVisitCount,
      friendCount: metadata.friendCount,
    };
  };

  const renderRestaurantListDescription = (
    restaurant: RestaurantRecord,
    distance: number | null,
  ) => {
    const base = buildVisitRestaurantDescription(restaurant, distance);
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

  const buildRestaurantOption = (
    {
      restaurant,
      distance,
    }: VisitRestaurantWithDistance,
    index: number,
    source: "search" | "saved",
  ): VisitRestaurantSearchOption => {
    const isSelected = selectedRestaurantId === restaurant.id;

    return {
      description: renderRestaurantListDescription(restaurant, distance),
      key: restaurant.id,
      onPress: () => {
        handleSelectRestaurant(restaurant);
      },
      selected: isSelected,
      testID: `create-visit-${source}-restaurant-option-${index}`,
      title: restaurant.name,
      trailing: (
        <VisitRestaurantOptionTrailing
          restaurant={restaurant}
          selected={isSelected}
        />
      ),
    };
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
      await createMenuReviewRequest({
        restaurantId: selectedRestaurantId,
        reason: "User reported incorrect menu items",
      });
      setMenuReviewSubmitted(true);
      queryClient.setQueryData(
        ["feature", "menuReview", "pending", selectedRestaurantId],
        true,
      );
      setTimeout(() => {
        setMenuReviewSubmitted(false);
      }, 3000);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not submit review request.";
      setErrorMessage(message);
    }
  };

  const renderMenuItemCard = (menuItem: MenuItemRecord, index: number) => {
    const isSelected = isMenuItemSelected(menuItem);
    const isUserCreated = menuItem.createdBy === currentUserId;

    return (
      <VisitMenuItemOptionRow
        description={menuItem.description}
        editButtonTestID={isUserCreated ? `create-visit-menu-item-edit-button-${index}` : undefined}
        name={menuItem.name}
        onEditPress={
          isUserCreated
            ? () => {
                navigation.navigate("CreateVisitEditMenuItem", {
                  menuItemId: menuItem.id,
                  restaurantId: menuItem.restaurant,
                  initialName: menuItem.name,
                  initialVisibility: menuItem.visibility,
                });
              }
            : undefined
        }
        onPress={() => {
          toggleMenuItemSelection(menuItem);
        }}
        optionTestID={`create-visit-menu-item-option-${index}`}
        selectButtonTestID={`create-visit-menu-item-select-button-${index}`}
        selected={isSelected}
        visibility={menuItem.visibility}
      />
    );
  };

  const handleSearchByText = async (collapseAfterSearch = false) => {
    const trimmedQuery = restaurantSearchQuery.trim();
    const trimmedLocation = manualLocation.trim();
    if (isOnline && !(isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide)) {
      trackObservabilityEvent("CREATE_VISIT_RESTAURANT_SEARCH_STARTED", {
        hasLocation: Boolean(trimmedLocation),
        hasQuery: Boolean(trimmedQuery),
        source: "CreateVisitScreen",
      });
    }

    const result = await runRestaurantSearchByText({
      collapseAfterSearch,
    });

    if (result.status === "quota_reached") {
      trackObservabilityEvent("USAGE_LIMIT_REACHED", {
        enforcement: "client_estimate",
        limit: monthlyUsage.snapshot?.limits.placesQueriesMonthly ?? null,
        metric: "places_queries",
        remaining: placesQueriesRemaining,
        source: "CreateVisitScreen",
        used: monthlyUsage.snapshot?.usage.placesQueries ?? null,
      });
      return;
    }

    if (result.status === "success") {
      trackObservabilityEvent("CREATE_VISIT_RESTAURANT_SEARCH_COMPLETED", {
        resultCount: result.results.length,
        source: "CreateVisitScreen",
      });
      if (collapseAfterSearch) {
        setTimeout(() => {
          scrollToRestaurantList();
        }, 60);
      }
      return;
    }

    if (result.status === "error") {
      if (result.limitPayload) {
        trackObservabilityEvent("USAGE_LIMIT_REACHED", {
          enforcement: "server",
          limit: result.limitPayload.limit,
          metric: result.limitPayload.metric,
          monthKey: result.limitPayload.monthKey,
          remaining: result.limitPayload.remaining,
          source: "CreateVisitScreen",
          used: result.limitPayload.used,
          userTier: result.limitPayload.userTier ?? null,
        });
      }
      trackObservabilityEvent("CREATE_VISIT_RESTAURANT_SEARCH_FAILED", {
        errorMessage: result.message,
        errorType:
          result.error instanceof Error ? result.error.name : "unknown_error",
        source: "CreateVisitScreen",
      });
    }
  };

  const handleSearchNearby = async () => {
    if (isOnline && !(isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide)) {
      trackObservabilityEvent("CREATE_VISIT_NEARBY_SEARCH_STARTED", {
        source: "CreateVisitScreen",
      });
    }

    const result = await runNearbyRestaurantSearch();

    if (result.status === "quota_reached") {
      trackObservabilityEvent("USAGE_LIMIT_REACHED", {
        enforcement: "client_estimate",
        limit: monthlyUsage.snapshot?.limits.placesQueriesMonthly ?? null,
        metric: "places_queries",
        remaining: placesQueriesRemaining,
        source: "CreateVisitScreen",
        used: monthlyUsage.snapshot?.usage.placesQueries ?? null,
      });
      return;
    }

    if (result.status === "permission_denied") {
      trackObservabilityEvent("CREATE_VISIT_LOCATION_PERMISSION_DENIED", {
        canAskAgain: result.canAskAgain,
        source: "CreateVisitScreen",
      });
      return;
    }

    if (result.status === "location_error") {
      trackObservabilityEvent("CREATE_VISIT_NEARBY_SEARCH_FAILED", {
        errorMessage: result.message,
        errorType:
          result.error instanceof Error
            ? result.error.name
            : "unknown_error",
        source: "CreateVisitScreen",
      });
      return;
    }

    if (result.status === "success") {
      trackObservabilityEvent("CREATE_VISIT_NEARBY_SEARCH_COMPLETED", {
        resultCount: result.results.length,
        source: "CreateVisitScreen",
      });
      return;
    }

    if (result.status === "error") {
      if (result.limitPayload) {
        trackObservabilityEvent("USAGE_LIMIT_REACHED", {
          enforcement: "server",
          limit: result.limitPayload.limit,
          metric: result.limitPayload.metric,
          monthKey: result.limitPayload.monthKey,
          remaining: result.limitPayload.remaining,
          source: "CreateVisitScreen",
          used: result.limitPayload.used,
          userTier: result.limitPayload.userTier ?? null,
        });
      }
      trackObservabilityEvent("CREATE_VISIT_NEARBY_SEARCH_FAILED", {
        errorMessage: result.message,
        errorType:
          result.error instanceof Error ? result.error.name : "unknown_error",
        source: "CreateVisitScreen",
      });
    }
  };

  const handleVisitDateChange = (value: string) => {
    setVisitDate(value);
  };

  const applyPhotoCaptureDateToVisit = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      const captureDate = await resolvePhotoCaptureDate(asset);
      if (!captureDate) {
        return;
      }

      const nextDetectedDateValue = formatDateToLocalDateString(captureDate);
      setVisitDate(nextDetectedDateValue);
      setDetectedVisitDateValue(nextDetectedDateValue);
    },
    [],
  );

  const handleVisitVisibilityChange = (value: 'friends' | 'private' | 'public') => {
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
    resetPhotoPermissionNeedsSettings();

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

    const permission = await requestPhotoPickerPermission(source);
    if (!permission.granted) {
      trackObservabilityEvent("CREATE_VISIT_PHOTO_PERMISSION_DENIED", {
        canAskAgain: permission.canAskAgain,
        photoSource: source,
        source: "CreateVisitScreen",
      });
      setErrorMessage(permission.message);
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
    const photo: DraftVisitItemPhoto | null = buildLocalPhotoFile(asset, {
      fallbackPrefix: 'visit-item',
    });
    if (!photo) {
      setErrorMessage('Could not read the selected image.');
      return;
    }

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
    resetPhotoPermissionNeedsSettings();
    setErrorMessage(null);
  };
  const { isSubmitting, submitVisit } = useCreateVisitSubmission({
    draftItems,
    editVisitId,
    isDisplayFreeUser,
    isEditMode,
    monthlyUsageSnapshot: monthlyUsage.snapshot,
    navigation,
    queryClient,
    restaurantId: selectedRestaurantId,
    restaurantName,
    setErrorMessage,
    setSourceListItemId,
    shouldEnforceUsageLimitsClientSide,
    sourceNoteId,
    sourceListItemId,
    visitDate,
    visitVisibility,
    writeFeature,
  });

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
      testID={isEditMode ? "edit-visit-screen" : "create-visit-screen"}
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
      {sourceNoteId ? (
        <LinkedNoteCard
          isLoading={linkedNoteQuery.isLoading}
          note={linkedNoteQuery.data}
          testID="linked-note-card"
        />
      ) : null}

      {step === 0 ? (
        <>
          <VisitRestaurantSearchSection
            connectivityWarningMessage={
              !isOnline ? "Google Places search requires internet connection." : null
            }
            currentLocationDisabled={
              !isOnline ||
              isGettingLocation ||
              isSearchingNearby ||
              (isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide)
            }
            currentLocationLoading={isGettingLocation || isSearchingNearby}
            footerContent={
              isSearchExpanded ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    navigation.navigate("CreateVisitAddRestaurant", {
                      editVisitId,
                    });
                  }}
                  style={styles.inlineLink}
                  testID="create-visit-add-restaurant-link"
                >
                  <Text tone="brand">Add new restaurant</Text>
                </Pressable>
              ) : null
            }
            headerAccessory={
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setIsSearchExpanded((currentValue) => !currentValue);
                }}
                style={styles.searchHeaderButton}
                testID="create-visit-search-toggle"
              >
                <Text tone="secondary" variant="bodySm">
                  {isSearchExpanded ? "Collapse" : "Expand"}
                </Text>
                <Ionicons
                  color={theme.colors.text.secondary}
                  name={isSearchExpanded ? "chevron-up-outline" : "chevron-down-outline"}
                  size={14}
                />
              </Pressable>
            }
            isSearchResultsLoading={isSearching || isSearchingNearby || isGettingLocation}
            locationPermissionNeedsSettings={locationPermissionNeedsSettings}
            manualLocation={manualLocation}
            onClearSearchResults={clearSearchState}
            onManualLocationChange={setManualLocation}
            onOpenLocationSettings={() => {
              void Linking.openSettings();
            }}
            onRetrySavedResults={() => {
              void triggerSavedRestaurantsRefetch();
            }}
            onSavedResultsLayout={(event) => {
              setRestaurantListAnchorY(event.nativeEvent.layout.y);
            }}
            onSearchPress={() => {
              void handleSearchByText(true);
            }}
            onSearchQueryChange={setRestaurantSearchQuery}
            onSearchResultsLayout={(event) => {
              setRestaurantListAnchorY(event.nativeEvent.layout.y);
            }}
            onUseCurrentLocationPress={() => {
              void handleSearchNearby();
            }}
            quotaWarningMessage={
              isOnline && isPlacesQuotaReached
                ? shouldEnforceUsageLimitsClientSide
                  ? "Monthly food place search limit reached."
                  : "Monthly food place search limit reached in preview mode. Admin access is still allowed."
                : null
            }
            savedOptions={displayedSavedRestaurants.map((restaurant, index) =>
              buildRestaurantOption(restaurant, index, "saved"),
            )}
            savedEmptyDescription={savedEmptyDescription}
            savedEmptyTitle={savedEmptyTitle}
            savedResultsErrorMessage={savedRestaurantsErrorMessage}
            savedResultsLoading={savedRestaurantsLoading}
            savedResultsTitle={savedRestaurantsTitle}
            searchButtonDisabled={searchButtonDisabled}
            searchButtonLabel={isSearchExpanded ? expandedSearchLabel : compactSearchLabel}
            searchButtonLoading={isSearching}
            searchErrorMessage={searchErrorMessage}
            searchInputsMode={isSearchExpanded ? "full" : "compact"}
            searchQuery={restaurantSearchQuery}
            searchResultsOptions={displayedNearbyRestaurants.map((restaurant, index) =>
              buildRestaurantOption(restaurant, index, "search"),
            )}
            selectedRestaurantName={restaurantName.trim() || null}
            showSearchResults={showNearbyPlaces}
            upgradePromptDescription={
              shouldShowPlacesUpgradePrompt
                ? isPlacesQuotaReached
                  ? "You have reached this month's free search limit. Subscriber accounts have higher limits for place search."
                  : `Only ${placesQueriesRemaining} food place searches left this month. Subscriber accounts have higher limits for place search.`
                : null
            }
            upgradePromptTitle={
              shouldShowPlacesUpgradePrompt
                ? isPlacesQuotaReached
                  ? "Free limit reached"
                  : "You are close to your free limit"
                : null
            }
          />
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
                    autoStartSourcePicker: false,
                  });
                }}
                style={[
                  styles.menuActionButton,
                  styles.quickActionsPrimaryButton,
                  !isOnline ? { opacity: 0.55 } : null,
                ]}
                testID="create-visit-scan-menu-photo-button"
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
                hitSlop={12}
                onPress={() => {
                  setIsTipPopoverVisible((visible) => !visible);
                }}
                style={styles.tipIconButton}
                testID="create-visit-tip-button"
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
                testID="create-visit-tip-popover"
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
                    hitSlop={12}
                    onPress={() => {
                      setIsTipPopoverVisible(false);
                    }}
                    style={styles.tipPopoverClose}
                    testID="create-visit-tip-close-button"
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
              testID="create-visit-add-menu-item-button"
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
                  {renderMenuItemCard(menuItem, index)}
                </View>
              ))
            )}
          </Card>
        </View>
      ) : null}

      {step === 2 ? (
        <CreateVisitReviewStep
          detectedVisitDateValue={detectedVisitDateValue}
          draftItems={draftItems}
          estimatedFreeMonthlyPhotosRemaining={
            estimatedFreeMonthlyPhotosRemaining
          }
          isEditMode={isEditMode}
          onAttachPhoto={(itemId, source) => {
            void attachPhotoToDraftItem(itemId, source);
          }}
          onRemoveDraftItemPhoto={removeDraftItemPhoto}
          onUpdateDraftItem={updateDraftItem}
          onVisitDateChange={handleVisitDateChange}
          onVisitVisibilityChange={handleVisitVisibilityChange}
          shouldShowPhotoUpgradePrompt={!isEditMode && shouldShowPhotoUpgradePrompt}
          showOfflineUsageWarning={
            !isEditMode &&
            shouldShowOfflineUsageWarning(isOnline, isDisplayFreeUser)
          }
          showUsageEstimate={!isEditMode && isDisplayFreeUser && draftPhotoCount > 0}
          visitDate={visitDate}
          visitVisibility={visitVisibility}
        />
      ) : null}
    </FeatureFormScreenScaffold>
  );
}
