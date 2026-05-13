import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

import {
  ConfirmDestructiveModal,
  EmptyState,
  ErrorState,
  FeatureFormScreenScaffold,
  LinkedNoteCard,
  LoadingState,
  OptionList,
  OptionListRow,
  PageErrorToast,
  StepProgressBar,
  VisitMenuItemOptionRow,
  VisitRestaurantOptionTrailing,
  VisitRestaurantSearchHeaderToggle,
  VisitRestaurantSearchOptionDescription,
  VisitRestaurantSearchSection,
  type VisitRestaurantSearchOption,
} from '../components/shared';
import {
  convertVisitItemToFoodProduct,
  createMenuReviewRequest,
  getAuthenticatedUserIdOrNull,
  getNoteDetail,
  getVisitById,
  listVisitItemPhotos,
  syncFoodProductMutationCaches,
  syncVisitMutationCaches,
  type MenuItemRecord,
  useMonthlyUsage,
  type RestaurantRecord,
  type VisitItem,
  type VisitPhotoRecord,
} from '../features';
import { buildPhotoFileUrl, buildPhotoThumbnailUrl } from '../lib/photoUrls';
import { notesQueryKeys } from '../features/store/notesQuery';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { visitPhotosQueryKeys } from '../features/store/visitPhotosQuery';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import { useRestaurantSelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import {
  formatDateToLocalDateString,
  formatPhotoAttachmentDateLabel,
  getTodayLocalDateString,
  isValidLocalDate,
} from '../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import { stageLocalPhotoFile } from '../lib/photoStaging';
import type { VisitRestaurantWithDistance } from '../lib/visitRestaurantSearch';
import {
  resolveDisplayPhotoUploadsPerRecordLimit,
  shouldShowOfflineUsageWarning,
} from '../lib/usageUiRules';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { CreateVisitReviewStep } from './createVisit/CreateVisitReviewStep';
import {
  FREE_MONTHLY_PHOTO_LIMIT,
  WIZARD_STEPS,
  buildDraftVisitItem,
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
import { Card, Input, Modal, Text } from '../ui';

type CreateVisitEntrySource = 'add_visit' | 'source_note' | 'source_list' | 'edit';
type CreateVisitExitMethod =
  | 'header_back'
  | 'secondary_cancel'
  | 'system_back_or_gesture'
  | 'programmatic_navigation';

function formatFreeMonthlyPhotoLimitStatus(remaining: number): string {
  return `Free users can upload up to ${FREE_MONTHLY_PHOTO_LIMIT} photos per month. Remaining estimate: ${remaining}.`;
}

function resolveCreateVisitEntrySource(options: {
  editVisitId?: string;
  sourceListItemId?: string;
  sourceNoteId?: string;
}): CreateVisitEntrySource {
  if (options.editVisitId) {
    return 'edit';
  }

  if (options.sourceNoteId) {
    return 'source_note';
  }

  if (options.sourceListItemId) {
    return 'source_list';
  }

  return 'add_visit';
}

function resolveCreateVisitStepName(step: VisitWizardStep): 'restaurant' | 'menu_items' | 'review' {
  if (step === 0) {
    return 'restaurant';
  }

  if (step === 1) {
    return 'menu_items';
  }

  return 'review';
}

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
  headerActionButton: {
    alignItems: "center",
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  headerActionButtonDisabled: {
    opacity: 0.55,
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
}));

function buildExistingDraftVisitPhoto(
  photo: VisitPhotoRecord,
): DraftVisitItemPhoto {
  const collectionName = photo.collectionName ?? 'visit_photos';

  return {
    kind: 'existing',
    id: photo.id,
    photoId: photo.id,
    thumbnailUri: buildPhotoThumbnailUrl({ ...photo, collectionName }),
    viewerUri: buildPhotoFileUrl({ ...photo, collectionName }),
    labelDate: formatPhotoAttachmentDateLabel(photo.created),
  };
}

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
  const displayMaxPhotosPerItem = resolveDisplayPhotoUploadsPerRecordLimit({
    snapshotLimit: monthlyUsage.snapshot?.limits.photoUploadsPerRecord,
    isDisplayAdminUser,
    isDisplaySubscriberUser,
    isDisplayFreeUser,
  });
  const placesQueriesRemaining = isDisplayFreeUser
    ? monthlyUsage.snapshot?.remaining.placesQueriesMonthly ?? null
    : null;
  const editVisitId = route.params?.editVisitId;
  const sourceNoteId = route.params?.sourceNoteId;
  const isEditMode = Boolean(editVisitId);
  const entrySourceRef = useRef<CreateVisitEntrySource>(
    resolveCreateVisitEntrySource({
      editVisitId,
      sourceListItemId: route.params?.sourceListItemId,
      sourceNoteId,
    }),
  );
  const hasTrackedFlowOpenRef = useRef(false);
  const lastTrackedStepRef = useRef<VisitWizardStep | null>(null);
  const hasCompletedFlowRef = useRef(false);
  const hasTrackedFlowExitRef = useRef(false);
  const exitMethodRef = useRef<CreateVisitExitMethod | null>(null);
  const hasTrackedEditLoadFailureRef = useRef(false);
  const hasTrackedEditNotFoundRef = useRef(false);

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
  const [sourceListReturnListId, setSourceListReturnListId] = useState<string | null>(null);
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
    autoCaptureReferenceLocation: step === 0,
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
    removeDraftItem,
    removeDraftItemPhoto,
    selectedMenuItemCount,
    setDraftItems,
    toggleMenuItemSelection,
    updateDraftItem,
  } = useCreateVisitDraftItems({
    menuItems: menuItemsQuery.data,
  });
  const estimatedUsedWithDraftPhotos =
    shouldEnforceUsageLimitsClientSide && isDisplayFreeUser && monthlyUsage.snapshot
      ? monthlyUsage.snapshot.usage.photoUploads + draftPhotoCount
      : null;
  const estimatedMonthlyPhotoTotal =
    estimatedUsedWithDraftPhotos ?? draftPhotoCount;
  const estimatedFreeMonthlyPhotosRemaining = Math.max(
    FREE_MONTHLY_PHOTO_LIMIT - estimatedMonthlyPhotoTotal,
    0,
  );
  const shouldHidePhotoSourceActions =
    !isEditMode &&
    isDisplayFreeUser &&
    shouldEnforceUsageLimitsClientSide &&
    typeof estimatedUsedWithDraftPhotos === 'number' &&
    estimatedFreeMonthlyPhotosRemaining <= 0;
  const photoQuotaStatusMessage = shouldHidePhotoSourceActions
    ? formatFreeMonthlyPhotoLimitStatus(estimatedFreeMonthlyPhotosRemaining)
    : null;
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
  const scrollViewRef = useRef<KeyboardAwareScrollViewRef | null>(null);
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
  const editVisitItemIds = useMemo(
    () => editVisitQuery.data?.items.map((item) => item.id).filter(Boolean) ?? [],
    [editVisitQuery.data?.items],
  );
  const editVisitPhotosQuery = useQuery({
    queryKey: visitPhotosQueryKeys.visit(editVisitId ?? ''),
    queryFn: ({ signal }) => listVisitItemPhotos(editVisitItemIds, { signal }),
    enabled: Boolean(editVisitId && editVisitQuery.data && editVisitItemIds.length > 0),
  });
  const linkedNoteQuery = useQuery({
    queryKey: notesQueryKeys.detail(sourceNoteId ?? ''),
    queryFn: ({ signal }) => (sourceNoteId ? getNoteDetail(sourceNoteId, { signal }) : Promise.resolve(null)),
    enabled: Boolean(sourceNoteId),
    select: (detail) => detail?.note ?? null,
  });

  useEffect(() => {
    const preselectedRestaurantId = route.params?.preselectedRestaurantId;
    const preselectedRestaurantName = route.params?.preselectedRestaurantName;
    const preselectedMenuItemId = route.params?.preselectedMenuItemId;
    const preselectedMenuItemName = route.params?.preselectedMenuItemName;
    const sourceListIdParam = route.params?.sourceListId;
    const sourceListItemIdParam = route.params?.sourceListItemId;
    const returnToStep = route.params?.returnToStep;

    if (
      !preselectedRestaurantId &&
      !preselectedMenuItemId &&
      !sourceListIdParam &&
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
      setSourceListReturnListId(sourceListIdParam ?? null);
    } else if (
      preselectedRestaurantId ||
      preselectedMenuItemId ||
      returnToStep !== undefined
    ) {
      setSourceListItemId(null);
      setSourceListReturnListId(null);
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
      sourceListId: undefined,
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
    route.params?.sourceListId,
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

    const editVisitPhotosByItemId = editVisitPhotosQuery.data;
    const areEditVisitPhotosReady =
      editVisitQuery.data.items.length === 0 ||
      editVisitPhotosQuery.isError ||
      editVisitPhotosByItemId !== undefined;
    if (!areEditVisitPhotosReady) {
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
        photos:
          editVisitPhotosByItemId?.[item.id]?.map((photo) =>
            buildExistingDraftVisitPhoto(photo),
          ) ?? [],
        deletedPhotoIds: [],
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
    setSourceListReturnListId(null);
    setHydratedEditVisitId(editVisitId);
  }, [
    clearSearchErrorMessage,
    editVisitId,
    editVisitPhotosQuery.data,
    editVisitPhotosQuery.isError,
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
      description: (
        <VisitRestaurantSearchOptionDescription
          distance={distance}
          restaurant={restaurant}
          stats={getRestaurantStats(restaurant.id)}
        />
      ),
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
      trackObservabilityEvent('CREATE_VISIT_MENU_REVIEW_REQUEST_STARTED', buildFlowAnalyticsPayload());
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
      trackObservabilityEvent('CREATE_VISIT_MENU_REVIEW_REQUEST_SUCCEEDED', buildFlowAnalyticsPayload());
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not submit review request.";
      trackObservabilityEvent('CREATE_VISIT_MENU_REVIEW_REQUEST_FAILED', buildFlowAnalyticsPayload({
        errorType: error instanceof Error ? error.name : 'unknown_error',
      }));
      setErrorMessage(message);
    }
  };

  const renderMenuItemCard = (menuItem: MenuItemRecord, index: number) => {
    const isSelected = isMenuItemSelected(menuItem);
    const isUserCreated = menuItem.createdBy === currentUserId;

    return (
      <VisitMenuItemOptionRow
        compactActions={isUserCreated}
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
        friendEatenCount={menuItem.friendEatenCount}
        userEatenCount={menuItem.userEatenCount}
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
    (captureDate: Date | null) => {
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

    if (
      shouldHidePhotoSourceActions &&
      typeof estimatedUsedWithDraftPhotos === 'number'
    ) {
      trackObservabilityEvent("USAGE_LIMIT_REACHED", {
        enforcement: "client_estimate",
        limit: FREE_MONTHLY_PHOTO_LIMIT,
        metric: "photo_uploads",
        remaining: estimatedFreeMonthlyPhotosRemaining,
        source: "CreateVisitScreen",
        used: estimatedUsedWithDraftPhotos,
      });
      setErrorMessage(formatFreeMonthlyPhotoLimitStatus(estimatedFreeMonthlyPhotosRemaining));
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
    const upload = await stageLocalPhotoFile(asset, {
      fallbackPrefix: 'visit-item',
    });
    if (!upload) {
      setErrorMessage('Could not prepare the selected image for upload.');
      return;
    }

    const captureDate = await resolvePhotoCaptureDate(asset);
    applyPhotoCaptureDateToVisit(captureDate);

    const nextPhoto: DraftVisitItemPhoto = {
      kind: 'new',
      id: upload.uri,
      upload,
      thumbnailUri: upload.uri,
      viewerUri: upload.uri,
      labelDate: formatPhotoAttachmentDateLabel(captureDate ?? new Date()),
    };

    setDraftItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        if (
          item.photos.some(
            (existingPhoto) =>
              existingPhoto.kind === 'new' &&
              existingPhoto.upload.uri === nextPhoto.upload.uri,
          )
        ) {
          return item;
        }

        return {
          ...item,
          photos: [...item.photos, nextPhoto],
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
    isOnline,
    monthlyUsageSnapshot: monthlyUsage.snapshot,
    navigation,
    onSubmitSucceeded: () => {
      hasCompletedFlowRef.current = true;
    },
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
  const [isConvertingVisitItem, setIsConvertingVisitItem] = useState(false);
  const [isVisitActionsModalVisible, setIsVisitActionsModalVisible] = useState(false);
  const [isConversionPickerVisible, setIsConversionPickerVisible] = useState(false);
  const [isConversionConfirmVisible, setIsConversionConfirmVisible] = useState(false);
  const [selectedConversionItemId, setSelectedConversionItemId] = useState<string | null>(
    draftItems.length === 1 ? draftItems[0]?.id ?? null : null,
  );
  const persistedEditVisitItemIds = useMemo(
    () => new Set(editVisitQuery.data?.items.map((item) => item.id) ?? []),
    [editVisitQuery.data?.items],
  );
  const convertibleDraftItems = useMemo(
    () => draftItems.filter((item) => persistedEditVisitItemIds.has(item.id)),
    [draftItems, persistedEditVisitItemIds],
  );
  const selectedConversionItem = useMemo(
    () => convertibleDraftItems.find((item) => item.id === selectedConversionItemId) ?? null,
    [convertibleDraftItems, selectedConversionItemId],
  );
  const canOpenVisitActions =
    isEditMode &&
    step === 2 &&
    hydratedEditVisitId === editVisitId &&
    !isSubmitting &&
    !isConvertingVisitItem;
  useEffect(() => {
    if (!isEditMode || step !== 2) {
      setIsVisitActionsModalVisible(false);
      setIsConversionPickerVisible(false);
      setIsConversionConfirmVisible(false);
      return;
    }

    if (convertibleDraftItems.length === 1) {
      setSelectedConversionItemId(convertibleDraftItems[0]?.id ?? null);
      return;
    }

    if (
      selectedConversionItemId &&
      !convertibleDraftItems.some((item) => item.id === selectedConversionItemId)
    ) {
      setSelectedConversionItemId(null);
    }
  }, [convertibleDraftItems, isEditMode, selectedConversionItemId, step]);

  const navigateAfterEditMutation = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Home');
  }, [navigation]);

  const handleConvertVisitItemToFoodProduct = useCallback(
    async (itemId: string) => {
      const normalizedItemId = itemId.trim();
      if (!normalizedItemId || !editVisitId) {
        setErrorMessage('Choose an item to convert.');
        throw new Error('Choose an item to convert.');
      }

      setErrorMessage(null);
      trackObservabilityEvent('VISIT_ITEM_CONVERT_TO_FOOD_PRODUCT_STARTED', {
        source: 'CreateVisitScreen',
        itemId: normalizedItemId,
        visitId: editVisitId,
        isOnline,
      });
      setIsConvertingVisitItem(true);

      try {
        const conversionResult = await writeFeature({
          operationName: 'visit.item.convert-to-food-product',
          offline: {
            strategy: 'outbox',
            payload: {
              itemId: normalizedItemId,
            },
          },
          execute: () => convertVisitItemToFoodProduct({ itemId: normalizedItemId }),
        });

        if (conversionResult.status === 'queued') {
          await Promise.all([
            syncVisitMutationCaches(queryClient, {
              visitId: editVisitId,
              includeVisitPhotos: true,
            }),
            syncFoodProductMutationCaches(queryClient),
          ]);
          hasCompletedFlowRef.current = true;
          trackObservabilityEvent('VISIT_ITEM_CONVERT_TO_FOOD_PRODUCT_SUCCEEDED', {
            source: 'CreateVisitScreen',
            itemId: normalizedItemId,
            visitId: editVisitId,
            queued: true,
          });
          showQueuedOfflineAlert({
            analyticsSource: 'CreateVisitScreen',
            subject: 'Food product conversion',
          });
          navigateAfterEditMutation();
          return;
        }

        await Promise.all([
          syncVisitMutationCaches(queryClient, {
            visitId: conversionResult.result.sourceVisitId,
            includeVisitPhotos: true,
          }),
          syncFoodProductMutationCaches(queryClient, {
            foodProductId: conversionResult.result.foodProductId,
            includeFoodProductPhotos: true,
          }),
        ]);
        hasCompletedFlowRef.current = true;
        trackObservabilityEvent('VISIT_ITEM_CONVERT_TO_FOOD_PRODUCT_SUCCEEDED', {
          source: 'CreateVisitScreen',
          itemId: normalizedItemId,
          visitId: conversionResult.result.sourceVisitId,
          foodProductId: conversionResult.result.foodProductId,
          deletedSourceVisit: conversionResult.result.deletedSourceVisit,
          queued: false,
        });
        navigation.navigate('EditFoodProduct', {
          foodProductId: conversionResult.result.foodProductId,
          exitToHomeOnClose: true,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not convert item to food product.';
        setErrorMessage(message);
        trackObservabilityEvent('VISIT_ITEM_CONVERT_TO_FOOD_PRODUCT_FAILED', {
          source: 'CreateVisitScreen',
          itemId: normalizedItemId,
          visitId: editVisitId,
          errorMessage: message,
          errorType: error instanceof Error ? error.name : 'unknown_error',
        });
        throw error;
      } finally {
        setIsConvertingVisitItem(false);
      }
    },
    [
      editVisitId,
      isOnline,
      navigateAfterEditMutation,
      navigation,
      queryClient,
      writeFeature,
    ],
  );

  const handleConfirmSelectedConversion = useCallback(async () => {
    if (!selectedConversionItem) {
      setErrorMessage('Choose an item to convert.');
      return;
    }

    try {
      await handleConvertVisitItemToFoodProduct(selectedConversionItem.id);
      setIsConversionConfirmVisible(false);
      setIsConversionPickerVisible(false);
      setIsVisitActionsModalVisible(false);
    } catch {
      // Error text is surfaced through the page error toast by the conversion handler.
    }
  }, [handleConvertVisitItemToFoodProduct, selectedConversionItem]);

  const isSourceListFlow = sourceListItemId !== null || sourceListReturnListId !== null;
  const returnToSourceList = (exitMethod: CreateVisitExitMethod) => {
    exitMethodRef.current = exitMethod;
    const returnListId = sourceListReturnListId;
    setSourceListItemId(null);
    setSourceListReturnListId(null);
    setErrorMessage(null);

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    if (returnListId) {
      navigation.navigate('ListDetail', { listId: returnListId });
      return;
    }

    navigation.navigate('Lists');
  };

  const handleBackPress = () => {
    if (isSourceListFlow) {
      returnToSourceList('header_back');
      return;
    }

    if (step > 0) {
      setStep((currentStep) => (currentStep - 1) as VisitWizardStep);
      setErrorMessage(null);
      return;
    }

    exitMethodRef.current = 'header_back';
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
            disabled: isSubmitting || isConvertingVisitItem || draftItems.length === 0,
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
            if (isSourceListFlow) {
              returnToSourceList('secondary_cancel');
              return;
            }

            exitMethodRef.current = 'secondary_cancel';
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
              if (isSourceListFlow) {
                returnToSourceList('secondary_cancel');
                return;
              }

              setSourceListItemId(null);
              setStep(0);
              setErrorMessage(null);
            },
          }
        : {
            label: "Back",
            onPress: () => {
              if (isSourceListFlow) {
                returnToSourceList('secondary_cancel');
                return;
              }

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
  const editVisitPhotoLoadWarningMessage =
    isEditMode &&
    hydratedEditVisitId === editVisitId &&
    editVisitItemIds.length > 0 &&
    editVisitPhotosQuery.isError
      ? 'Could not load current item photos. You can still upload a new photo.'
      : null;
  const initialEditVisitDate = editVisitQuery.data?.visitedAt
    ? formatDateToLocalDateString(new Date(editVisitQuery.data.visitedAt))
    : null;
  const hasUnsavedChanges = useMemo(() => {
    if (isEditMode && editVisitQuery.data && hydratedEditVisitId === editVisitId) {
      const originalVisibility =
        editVisitQuery.data.visibility === 'private' ? 'private' : 'friends';

      if (restaurantName.trim() !== editVisitQuery.data.restaurantName.trim()) {
        return true;
      }

      if ((selectedRestaurantId ?? '') !== (editVisitQuery.data.restaurantId ?? '')) {
        return true;
      }

      if (visitDate !== initialEditVisitDate) {
        return true;
      }

      if (visitVisibility !== originalVisibility) {
        return true;
      }

      if (draftItems.length !== editVisitQuery.data.items.length) {
        return true;
      }

      return draftItems.some((item, index) => {
        const originalItem = editVisitQuery.data?.items[index];
        if (!originalItem) {
          return true;
        }

        return (
          item.name.trim() !== originalItem.name.trim() ||
          item.rating !== originalItem.rating ||
          item.description.trim() !== (originalItem.description?.trim() ?? '') ||
          item.notes.trim() !== (originalItem.notes?.trim() ?? '') ||
          item.deletedPhotoIds.length > 0 ||
          item.photos.some((photo) => photo.kind === 'new')
        );
      });
    }

    return (
      Boolean(restaurantName.trim()) ||
      Boolean(selectedRestaurantId) ||
      draftItems.length > 0 ||
      sourceListItemId !== null ||
      sourceListReturnListId !== null ||
      visitVisibility !== resolveDefaultVisitVisibility() ||
      visitDate !== getTodayLocalDateString()
    );
  }, [
    draftItems,
    editVisitId,
    editVisitQuery.data,
    hydratedEditVisitId,
    initialEditVisitDate,
    isEditMode,
    restaurantName,
    selectedRestaurantId,
    sourceListItemId,
    sourceListReturnListId,
    visitDate,
    visitVisibility,
  ]);
  const buildFlowAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'CreateVisitScreen',
      mode: isEditMode ? 'edit' : 'create',
      entrySource: entrySourceRef.current,
      step: resolveCreateVisitStepName(step),
      restaurantSelected: Boolean(selectedRestaurantId && restaurantName.trim()),
      selectedMenuItemCount,
      draftItemCount: draftItems.length,
      draftPhotoCount,
      hasUnsavedChanges,
      ...overrides,
    }),
    [
      draftItems.length,
      draftPhotoCount,
      hasUnsavedChanges,
      isEditMode,
      restaurantName,
      selectedMenuItemCount,
      selectedRestaurantId,
      step,
    ],
  );
  const trackFlowExited = useCallback(
    (exitMethod: CreateVisitExitMethod) => {
      if (hasCompletedFlowRef.current || hasTrackedFlowExitRef.current || !hasTrackedFlowOpenRef.current) {
        return;
      }

      hasTrackedFlowExitRef.current = true;
      trackObservabilityEvent('CREATE_VISIT_FLOW_EXITED', buildFlowAnalyticsPayload({
        exitMethod,
      }));
    },
    [buildFlowAnalyticsPayload],
  );

  useEffect(() => {
    const canTrackFlow = !isEditMode || hydratedEditVisitId === editVisitId;
    if (!canTrackFlow || hasTrackedFlowOpenRef.current) {
      return;
    }

    hasTrackedFlowOpenRef.current = true;
    trackObservabilityEvent('CREATE_VISIT_FLOW_OPENED', buildFlowAnalyticsPayload());
  }, [buildFlowAnalyticsPayload, editVisitId, hydratedEditVisitId, isEditMode]);

  useEffect(() => {
    const canTrackStep = !isEditMode || hydratedEditVisitId === editVisitId;
    if (!canTrackStep || lastTrackedStepRef.current === step) {
      return;
    }

    lastTrackedStepRef.current = step;
    trackObservabilityEvent('CREATE_VISIT_STEP_VIEWED', buildFlowAnalyticsPayload());
  }, [buildFlowAnalyticsPayload, editVisitId, hydratedEditVisitId, isEditMode, step]);

  useEffect(() => {
    if (!isEditMode || hydratedEditVisitId === editVisitId || !editVisitQuery.isError || hasTrackedEditLoadFailureRef.current) {
      return;
    }

    hasTrackedEditLoadFailureRef.current = true;
    trackObservabilityEvent('CREATE_VISIT_EDIT_LOAD_FAILED', {
      entrySource: entrySourceRef.current,
      mode: 'edit',
      source: 'CreateVisitScreen',
    });
  }, [editVisitId, editVisitQuery.isError, hydratedEditVisitId, isEditMode]);

  useEffect(() => {
    if (
      !isEditMode ||
      hydratedEditVisitId === editVisitId ||
      editVisitQuery.isLoading ||
      editVisitQuery.isError ||
      editVisitQuery.data ||
      hasTrackedEditNotFoundRef.current
    ) {
      return;
    }

    hasTrackedEditNotFoundRef.current = true;
    trackObservabilityEvent('CREATE_VISIT_EDIT_NOT_FOUND', {
      entrySource: entrySourceRef.current,
      mode: 'edit',
      source: 'CreateVisitScreen',
    });
  }, [editVisitId, editVisitQuery.data, editVisitQuery.isError, editVisitQuery.isLoading, hydratedEditVisitId, isEditMode]);

  useEffect(
    () => () => {
      trackFlowExited(exitMethodRef.current ?? 'system_back_or_gesture');
    },
    [trackFlowExited],
  );

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
            analyticsProps={{
              entrySource: entrySourceRef.current,
              mode: 'edit',
            }}
            analyticsSource="CreateVisitScreen"
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
            analyticsProps={{
              entrySource: entrySourceRef.current,
              mode: 'edit',
            }}
            analyticsSource="CreateVisitScreen"
            onAction={() => {
              exitMethodRef.current = 'programmatic_navigation';
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

  const shouldShowEditVisitActions =
    isEditMode && step === 2 && hydratedEditVisitId === editVisitId;
  const editVisitHeaderAccessory = shouldShowEditVisitActions ? (
    <Pressable
      accessibilityLabel="Visit actions"
      accessibilityRole="button"
      disabled={!canOpenVisitActions}
      onPress={() => {
        setIsVisitActionsModalVisible(true);
      }}
      style={[
        styles.headerActionButton,
        !canOpenVisitActions ? styles.headerActionButtonDisabled : null,
      ]}
      testID="edit-visit-actions-button"
    >
      <Ionicons
        color={theme.colors.text.secondary}
        name="ellipsis-horizontal"
        size={18}
      />
    </Pressable>
  ) : null;

  return (
    <FeatureFormScreenScaffold
      headerBottomCompact
      headerBottomContent={headerProgress}
      keyboardAware
      onBackPress={handleBackPress}
      primaryAction={primaryAction}
      rightAccessory={editVisitHeaderAccessory}
      scrollViewRef={scrollViewRef}
      secondaryAction={secondaryAction}
      subtitle={headerSubtitle}
      testID={isEditMode ? "edit-visit-screen" : "create-visit-screen"}
      title={isEditMode ? "Edit Restaurant Visit" : "Track Restaurant Visit"}
    >
      <PageErrorToast
        actionLabel={photoPermissionNeedsSettings ? "Open Settings" : undefined}
        analyticsProps={buildFlowAnalyticsPayload()}
        analyticsSource="CreateVisitScreen"
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
      <Modal
        description="Choose an action for this visit."
        onRequestClose={() => {
          setIsVisitActionsModalVisible(false);
        }}
        secondaryAction={{
          accessibilityLabel: 'Cancel',
          label: 'Cancel',
          onPress: () => {
            setIsVisitActionsModalVisible(false);
          },
          testID: 'edit-visit-actions-modal-cancel-button',
        }}
        testID="edit-visit-actions-modal"
        title="Visit Actions"
        visible={isVisitActionsModalVisible}
      >
        <OptionList>
          <OptionListRow
            accessibilityLabel="Convert item to food product"
            iconName="swap-horizontal-outline"
            isLast
            onPress={() => {
              if (convertibleDraftItems.length === 0) {
                setIsVisitActionsModalVisible(false);
                setErrorMessage('Save changes before converting newly added items.');
                return;
              }

              setIsVisitActionsModalVisible(false);
              setIsConversionPickerVisible(true);
            }}
            subtitle="Move one item and its photos out of this restaurant visit."
            testID="edit-visit-actions-convert-button"
            title="Convert Item to Food Product"
          />
        </OptionList>
      </Modal>
      <Modal
        description="Choose the item to convert. Attached photos will carry over."
        onRequestClose={() => {
          if (!isConvertingVisitItem) {
            setIsConversionPickerVisible(false);
          }
        }}
        secondaryAction={{
          accessibilityLabel: 'Cancel',
          disabled: isConvertingVisitItem,
          label: 'Cancel',
          onPress: () => {
            setIsConversionPickerVisible(false);
          },
          testID: 'edit-visit-conversion-picker-cancel-button',
        }}
        testID="edit-visit-conversion-picker-modal"
        title="Convert to Food Product"
        visible={isConversionPickerVisible}
      >
        <OptionList>
          {convertibleDraftItems.map((item, index) => (
            <OptionListRow
              accessibilityLabel={`Convert ${item.name} to food product`}
              iconName="cube-outline"
              isLast={index === convertibleDraftItems.length - 1}
              key={item.id}
              onPress={() => {
                setSelectedConversionItemId(item.id);
                setIsConversionPickerVisible(false);
                setIsConversionConfirmVisible(true);
              }}
              subtitle={`Rating ${item.rating}/5`}
              testID={`edit-visit-convert-item-option-${index}`}
              title={item.name}
            />
          ))}
        </OptionList>
      </Modal>
      <ConfirmDestructiveModal
        cancelLabel="Cancel"
        confirmLabel="Convert Item"
        confirmLoadingLabel="Converting"
        description={
          selectedConversionItem
            ? `This will remove "${selectedConversionItem.name}" from this restaurant visit and save it as a food product. Attached photos will carry over.`
            : 'This will remove the selected item from this restaurant visit and save it as a food product. Attached photos will carry over.'
        }
        disabled={isSubmitting}
        loading={isConvertingVisitItem}
        onCancel={() => {
          if (!isConvertingVisitItem) {
            setIsConversionConfirmVisible(false);
          }
        }}
        onConfirm={() => {
          void handleConfirmSelectedConversion();
        }}
        testID="edit-visit-convert-item-confirmation-modal"
        title="Convert to Food Product"
        visible={isConversionConfirmVisible}
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
                      sourceNoteId,
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
              <VisitRestaurantSearchHeaderToggle
                expanded={isSearchExpanded}
                onPress={() => {
                  setIsSearchExpanded((currentValue) => !currentValue);
                }}
                testID="create-visit-search-toggle"
              />
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
                    sourceNoteId,
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
                  sourceNoteId,
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
          allowItemRemoval={isEditMode}
          detectedVisitDateValue={detectedVisitDateValue}
          draftItems={draftItems}
          displayMaxPhotosPerItem={displayMaxPhotosPerItem}
          onAttachPhoto={(itemId, source) => {
            void attachPhotoToDraftItem(itemId, source);
          }}
          photoActionsHidden={shouldHidePhotoSourceActions}
          photoQuotaStatusMessage={photoQuotaStatusMessage}
          photoLoadWarningMessage={editVisitPhotoLoadWarningMessage}
          onRemoveDraftItem={(itemId) => {
            removeDraftItem(itemId);
            setErrorMessage(null);
          }}
          onRemoveDraftItemPhoto={removeDraftItemPhoto}
          onUpdateDraftItem={updateDraftItem}
          onVisitDateChange={handleVisitDateChange}
          onVisitVisibilityChange={handleVisitVisibilityChange}
          showOfflineUsageWarning={
            !isEditMode &&
            shouldShowOfflineUsageWarning(isOnline, isDisplayFreeUser)
          }
          visitDate={visitDate}
          visitVisibility={visitVisibility}
        />
      ) : null}
    </FeatureFormScreenScaffold>
  );
}
