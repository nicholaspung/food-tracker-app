import { Ionicons } from '../ui/AppIcon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

import {
  EmptyState,
  ErrorState,
  FeatureActionCard,
  FeatureFormScreenScaffold,
  FocusedRestaurantSearchHeader,
  LinkedNoteCard,
  LightweightStatusCard,
  LoadingState,
  OFFLINE_USAGE_WARNING_MESSAGE,
  PageErrorToast,
  PhotoViewerModal,
  PhotoSourcePickerCard,
  FoodProductFormFields,
  RatingLegend,
  RatingSelector,
  ScreenHeader,
  SegmentedControl,
  StatusPill,
  StepProgressBar,
  VisitMenuItemOptionRow,
  VisitMetadataCard,
  VisitRestaurantOptionTrailing,
  VisitRestaurantSearchSection,
  type VisitRestaurantSearchOption,
} from '../components/shared';
import {
  formatFreeMonthlyPhotoLimitStatus,
  getNoteDetail,
  getAuthenticatedUserIdOrNull,
  type MenuItemRecord,
  useMonthlyUsage,
  useMenuItemCatalogWrites,
  type RestaurantRecord,
} from '../features';
import {
  isCurrentLocationSearchSelection,
  isUserAddedRestaurantOption,
} from '../features/restaurants/restaurantSelection';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { notesQueryKeys } from '../features/store/notesQuery';
import { useImageSourcePicker } from '../hooks/useImageSourcePicker';
import { usePhotoProcessingRestaurantSelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import {
  getTodayLocalDateString,
} from '../lib/dateFormatting';
import {
  buildDefaultFoodProductForm,
  resolveDefaultFoodProductVisibility,
} from '../lib/foodProductForm';
import {
  buildVisitRestaurantDescription,
  type VisitRestaurantWithDistance,
} from '../lib/visitRestaurantSearch';
import {
  resolveDisplayPhotoUploadsPerRecordLimit,
  shouldShowOfflineUsageWarning,
} from '../lib/usageUiRules';
import { trackObservabilityEvent } from '../observability';
import { trackProductEvent } from '../observability/productAnalytics';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { MenuScanPhotoProcessingScreen } from './MenuScanPhotoProcessingScreen';
import { formatFriendCount, formatVisitCount } from './createVisit/shared';
import { PhotoProcessingReviewStep } from './photoProcessing/PhotoProcessingReviewStep';
import {
  buildDefaultRestaurantForm,
  collapseRestaurantOptionsToSelection,
  formatCoordinatesForDisplay,
  FREE_MONTHLY_PHOTO_LIMIT,
  normalizeSelectionLabel,
  resolveDraftPhotoDetectedDateValue,
  resolveProgressSteps,
  resolveWizardStepIndex,
  formatDraftPhotoMetadataLabel,
  type DraftPhotoAsset,
  type GeneralPhotoStep,
  type MenuItemMode,
  type PhotoProcessingScreenProps,
  type ProcessType,
  type RestaurantPhotoForm,
  type ScanSource,
} from './photoProcessing/shared';
import {
  areRestaurantPhotoGroupsEqual,
  buildPhotoProcessingDraftSnapshot,
  initializeRestaurantPhotoGrouping,
  movePhotoToRestaurantGroup as movePhotoToRestaurantGroupTransition,
  reconcileRestaurantPhotoGroupsWithPhotos,
  removePhotoFromPhotoProcessingDraft,
  replaceRestaurantGroupPhoto as replaceRestaurantGroupPhotoTransition,
  resolveSelectedRestaurantPhotoGroupId,
  splitPhotoToRestaurantGroup as splitPhotoToRestaurantGroupTransition,
  type PhotoProcessingDraftSnapshot,
} from '../features/photoProcessing/photoProcessingDraft';
import type { RestaurantPhotoGroup } from '../features/photoProcessing/photoProcessingTypes';
import {
  cleanupHydratedNotePhotos,
  hydrateDraftPhotosFromNote,
} from './photoProcessing/notePhotoHydration';
import { usePhotoProcessingDraftState } from './photoProcessing/usePhotoProcessingDraftState';
import { usePhotoProcessingReviewData } from './photoProcessing/usePhotoProcessingReviewData';
import { usePhotoProcessingSubmission } from './photoProcessing/usePhotoProcessingSubmission';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';

type PhotoProcessingExitMethod =
  | 'header_back'
  | 'secondary_cancel'
  | 'system_back_or_gesture'
  | 'programmatic_navigation';

const useStyles = createThemedStyles((theme) => ({
  choiceContent: {
    backgroundColor: theme.colors.background.muted,
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  choiceBody: {
    flex: 1,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  uploadCard: {
    gap: theme.spacing.sm,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  photoTile: {
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    overflow: 'hidden',
    width: '47%',
  },
  photoImage: {
    backgroundColor: theme.colors.background.app,
    height: 120,
    width: '100%',
  },
  photoMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
  },
  photoName: {
    flex: 1,
  },
  photoRemoveButton: {
    alignItems: 'center',
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  photoPreviewCard: {
    gap: theme.spacing.xs,
  },
  groupingCard: {
    gap: theme.spacing.sm,
  },
  groupingHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  groupingPhotoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  groupingHorizontalContent: {
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.md,
  },
  groupingPhotoTile: {
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    overflow: 'hidden',
    width: '30%',
  },
  groupingHorizontalTile: {
    width: 132,
  },
  groupingPhotoTileSelected: {
    borderColor: theme.colors.border.strong,
    borderWidth: 2,
  },
  groupingPhotoFrame: {
    position: 'relative',
  },
  groupingPhotoImage: {
    backgroundColor: theme.colors.background.app,
    height: 92,
    width: '100%',
  },
  groupingIconButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: theme.spacing.xs,
    top: theme.spacing.xs,
    width: 28,
  },
  groupingPhotoAction: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  groupingPhotoStrip: {
    gap: theme.spacing.xs,
  },
  groupingStripContent: {
    gap: theme.spacing.xs,
  },
  groupingStripPhotoWrap: {
    position: 'relative',
  },
  groupingStripImage: {
    backgroundColor: theme.colors.background.app,
    borderRadius: theme.radii.sm,
    height: 56,
    width: 56,
  },
  groupingStripRemoveButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: 22,
  },
  largePhotoPreview: {
    backgroundColor: theme.colors.background.app,
    borderRadius: theme.radii.md,
    height: 220,
    width: '100%',
  },
  sectionCard: {
    gap: theme.spacing.sm,
  },
  listCard: {
    gap: theme.spacing.xs,
  },
  statusCard: {
    gap: theme.spacing.xs,
  },
  searchHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  searchHeaderTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  searchHeaderButton: {
    alignItems: 'center',
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xxs,
  },
  row: {
    flexDirection: 'row',
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
    alignSelf: 'flex-end',
    minWidth: 96,
  },
  listSection: {
    gap: theme.spacing.xs,
  },
  descriptionContainer: {
    gap: theme.spacing.xxs,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  statPill: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
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
  selectedHint: {
    alignItems: 'center',
    backgroundColor: theme.colors.status.successBg,
    borderColor: theme.colors.status.successBorder,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  menuModeControl: {
    marginTop: theme.spacing.xxs,
  },
  menuSearchInput: {
    marginTop: theme.spacing.xxs,
  },
  inlineEditorActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  inlineEditorAction: {
    flex: 1,
  },
  notesInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  reviewFeedList: {
    gap: theme.spacing.md,
  },
  reviewCard: {
    gap: theme.spacing.sm,
  },
}));

export function PhotoProcessingScreen(screenProps: PhotoProcessingScreenProps) {
  const mode = screenProps.route.params?.mode ?? 'general';
  if (mode === 'menu_scan') {
    return <MenuScanPhotoProcessingScreen {...screenProps} />;
  }

  return <GeneralPhotoProcessingScreen {...screenProps} />;
}

function GeneralPhotoProcessingScreen({ navigation, route }: PhotoProcessingScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const menuItemCatalogWrites = useMenuItemCatalogWrites();
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
  const sourceNoteId = route.params?.sourceNoteId;
  const isNoteDrivenFlow = Boolean(sourceNoteId);
  const shouldEnforceUsageLimitsClientSide = !isActualAdmin;
  const displayMaxPhotosPerRestaurantItem = resolveDisplayPhotoUploadsPerRecordLimit({
    snapshotLimit: monthlyUsage.snapshot?.limits?.photoUploadsPerRecord,
    isDisplayAdminUser,
    isDisplaySubscriberUser,
    isDisplayFreeUser,
  });
  const effectiveMaxPhotosPerRestaurantItem = isActualAdmin
    ? null
    : displayMaxPhotosPerRestaurantItem;
  const currentUserId = getAuthenticatedUserIdOrNull();
  const placesQueriesRemaining = isDisplayFreeUser
    ? monthlyUsage.snapshot?.remaining.placesQueriesMonthly ?? null
    : null;
  const noteDetailQuery = useQuery({
    queryKey: notesQueryKeys.detail(sourceNoteId ?? ''),
    queryFn: ({ signal }) => (sourceNoteId ? getNoteDetail(sourceNoteId, { signal }) : Promise.resolve(null)),
    enabled: isNoteDrivenFlow,
  });

  const [step, setStep] = useState<GeneralPhotoStep>('choice');
  const [processType, setProcessType] = useState<ProcessType | null>(null);
  const {
    appendAssets,
    applyDraftSnapshot,
    currentPhoto: indexedCurrentPhoto,
    currentPhotoIndex,
    currentFoodProductForm,
    currentRestaurantForm: indexedCurrentRestaurantForm,
    dismissCurrentPhotoLocationHint,
    locationMetadataHintDismissedByPhotoId,
    photos,
    foodProductForms,
    replacePhotos,
    resetDraftState,
    resetProcessingForms,
    restaurantForms,
    setCurrentPhotoIndex,
    setFoodProductForms,
    setRestaurantForms,
    updateCurrentFoodProductForm,
    updateCurrentRestaurantForm: updateIndexedCurrentRestaurantForm,
  } = usePhotoProcessingDraftState();
  const [restaurantPhotoGroups, setRestaurantPhotoGroups] = useState<RestaurantPhotoGroup[]>([]);
  const [selectedRestaurantPhotoGroupId, setSelectedRestaurantPhotoGroupId] =
    useState<string | null>(null);
  const photoProcessingDraftSnapshot: PhotoProcessingDraftSnapshot = useMemo(
    () =>
      buildPhotoProcessingDraftSnapshot({
        currentPhotoIndex,
        foodProductForms,
        locationMetadataHintDismissedByPhotoId,
        photos,
        restaurantForms,
        restaurantPhotoGroups,
        selectedRestaurantPhotoGroupId,
      }),
    [
      currentPhotoIndex,
      foodProductForms,
      locationMetadataHintDismissedByPhotoId,
      photos,
      restaurantForms,
      restaurantPhotoGroups,
      selectedRestaurantPhotoGroupId,
    ],
  );
  const [visitVisibility, setVisitVisibility] = useState<'friends' | 'private'>(
    resolveDefaultFoodProductVisibility(),
  );
  const [menuItemSearchQuery, setMenuItemSearchQuery] = useState('');
  const [menuItemMode, setMenuItemMode] = useState<MenuItemMode>('existing');
  const [newMenuItemName, setNewMenuItemName] = useState('');
  const [isEditingMenuItemInline, setIsEditingMenuItemInline] = useState(false);
  const [editingMenuItemName, setEditingMenuItemName] = useState('');
  const [isUpdatingMenuItem, setIsUpdatingMenuItem] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSelectingSource, setIsSelectingSource] = useState(false);
  const [isPreparingNotePhotos, setIsPreparingNotePhotos] = useState(false);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [groupingPhotoViewerVisible, setGroupingPhotoViewerVisible] = useState(false);
  const [groupingPhotoViewerUrls, setGroupingPhotoViewerUrls] = useState<string[]>([]);
  const [groupingPhotoViewerInitialIndex, setGroupingPhotoViewerInitialIndex] = useState(0);
  const [isRestaurantSearchFocused, setIsRestaurantSearchFocused] = useState(false);
  const [focusedLocationOptionsDismissSignal, setFocusedLocationOptionsDismissSignal] = useState(0);
  const [isCreatingMenuItem, setIsCreatingMenuItem] = useState(false);
  const [lastRequestedSource, setLastRequestedSource] = useState<ScanSource>('gallery');
  const processStepScrollViewRef = useRef<KeyboardAwareScrollViewRef | null>(null);
  const processStepScrollOffsetYRef = useRef(0);
  const processStepRestoreScrollYRef = useRef<number | null>(null);
  const shouldResetFocusedRestaurantSearchScrollRef = useRef(false);
  const hasTrackedFlowOpenRef = useRef(false);
  const hasTrackedFlowExitRef = useRef(false);
  const hasCompletedFlowRef = useRef(false);
  const lastTrackedStepRef = useRef<GeneralPhotoStep | null>(null);
  const exitMethodRef = useRef<PhotoProcessingExitMethod | null>(null);
  const { permissionNeedsSettings, pickImageAssets } = useImageSourcePicker({
    cameraBlockedMessage: 'Camera permission is blocked. Enable it in device settings.',
    cameraRequiredMessage: 'Camera permission is required to take a photo.',
    galleryBlockedMessage: 'Photo library permission is blocked. Enable it in device settings.',
    galleryRequiredMessage: 'Photo library permission is required to upload images.',
  });
  const photosById = useMemo(
    () => new Map(photos.map((photo) => [photo.id, photo])),
    [photos],
  );
  const currentRestaurantGroup =
    processType === 'restaurant' ? restaurantPhotoGroups[currentPhotoIndex] ?? null : null;
  const currentRestaurantGroupId = currentRestaurantGroup?.id ?? null;
  const currentRestaurantGroupPhotos = useMemo(
    () =>
      currentRestaurantGroup
        ? currentRestaurantGroup.photoIds
            .map((photoId) => photosById.get(photoId))
            .filter((photo): photo is DraftPhotoAsset => Boolean(photo))
        : [],
    [currentRestaurantGroup, photosById],
  );
  const selectedRestaurantPhotoGroup = useMemo(
    () =>
      restaurantPhotoGroups.find((group) => group.id === selectedRestaurantPhotoGroupId) ??
      restaurantPhotoGroups[0] ??
      null,
    [restaurantPhotoGroups, selectedRestaurantPhotoGroupId],
  );
  const selectedRestaurantPhotoGroupPhotos = useMemo(
    () =>
      selectedRestaurantPhotoGroup
        ? selectedRestaurantPhotoGroup.photoIds
            .map((photoId) => photosById.get(photoId))
            .filter((photo): photo is DraftPhotoAsset => Boolean(photo))
        : [],
    [photosById, selectedRestaurantPhotoGroup],
  );
  const currentPhoto =
    processType === 'restaurant'
      ? currentRestaurantGroupPhotos[0] ?? null
      : indexedCurrentPhoto;
  const currentRestaurantForm =
    processType === 'restaurant' && currentRestaurantGroup
      ? restaurantForms[currentRestaurantGroup.id]
      : indexedCurrentRestaurantForm;
  const updateCurrentRestaurantForm = useCallback(
    (updates: Partial<RestaurantPhotoForm>) => {
      if (processType !== 'restaurant' || !currentRestaurantGroup || !currentPhoto) {
        updateIndexedCurrentRestaurantForm(updates);
        return;
      }

      setRestaurantForms((current) => {
        const currentForm =
          current[currentRestaurantGroup.id] ??
          buildDefaultRestaurantForm(currentPhoto, undefined);
        return {
          ...current,
          [currentRestaurantGroup.id]: {
            ...currentForm,
            ...updates,
          },
        };
      });
    },
    [
      currentPhoto,
      currentRestaurantGroup,
      processType,
      setRestaurantForms,
      updateIndexedCurrentRestaurantForm,
    ],
  );
  const currentRestaurantId = currentRestaurantForm?.restaurantId ?? null;
  const shouldEnableRestaurantSelectionQueries = processType === 'restaurant' && step === 'process';
  const restaurantSelection = usePhotoProcessingRestaurantSelectionFlow({
    autoCaptureReferenceLocation:
      shouldEnableRestaurantSelectionQueries && !currentPhoto?.captureCoordinates,
    fallbackReferenceCoords: currentPhoto?.captureCoordinates
      ? {
          lat: currentPhoto.captureCoordinates.latitude,
          lng: currentPhoto.captureCoordinates.longitude,
        }
      : null,
    isOnline,
    menuItemsEnabled:
      processType === 'restaurant' &&
      step === 'process' &&
      Boolean(currentRestaurantId),
    savedRestaurantsEmptyDescription:
      'Search nearby places or use the place search above to continue.',
    savedRestaurantsEnabled: shouldEnableRestaurantSelectionQueries,
    selectedRestaurantId: currentRestaurantId,
    usage: {
      enforceQuota: shouldEnforceUsageLimitsClientSide,
      isFreeTier: isDisplayFreeUser,
      placesQueriesRemaining,
    },
  });
  const { menuItems, quotaDisplay, reset: resetRestaurantSelectionFlow, savedSuggestions, search: restaurantSearch } =
    restaurantSelection;
  const clearRestaurantSearchState = restaurantSearch.clearPlacesState;
  const clearSearchErrorMessage = restaurantSearch.clearErrorMessage;
  const compactSearchLabel = restaurantSearch.compactLabel;
  const allDisplayedNearbyRestaurants = restaurantSearch.displayedNearbyRestaurants;
  const allDisplayedSavedRestaurants = savedSuggestions.displayedSavedRestaurants;
  const expandedSearchLabel = restaurantSearch.expandedLabel;
  const isGettingLocation = restaurantSearch.isGettingLocation;
  const isUsingCurrentLocation = restaurantSearch.isUsingCurrentLocation;
  const isPlacesQuotaReached = quotaDisplay.isPlacesQuotaReached;
  const isSearchExpanded = restaurantSearch.isExpanded;
  const isSearchingNearbyRestaurants = restaurantSearch.isSearchingNearby;
  const isSearchingRestaurants = restaurantSearch.isSearchingText;
  const loadedRestaurantRecords = menuItems.loadedRestaurantRecords;
  const locationPermissionNeedsSettings = restaurantSearch.locationPermissionNeedsSettings;
  const manualLocation = restaurantSearch.manualLocation;
  const menuItemsQuery = menuItems.query;
  const savedEmptyDescription = savedSuggestions.emptyDescription;
  const savedRestaurantsErrorMessage = savedSuggestions.errorMessage;
  const savedRestaurantsLoading = savedSuggestions.isLoading;
  const savedRestaurantsTitle = savedSuggestions.title;
  const searchButtonDisabled = restaurantSearch.searchButtonDisabled;
  const runCurrentLocationRestaurantSearch = restaurantSearch.searchCurrentLocationByText;
  const runRestaurantSearchByText = restaurantSearch.searchByText;
  const searchErrorMessage = restaurantSearch.searchErrorMessage;
  const restaurantSearchQuery = restaurantSearch.query;
  const selectCurrentLocationForSearch = restaurantSearch.selectCurrentLocation;
  const setIsSearchExpanded = restaurantSearch.setExpanded;
  const setManualLocation = restaurantSearch.setManualLocation;
  const setRestaurantSearchQuery = restaurantSearch.setQuery;
  const shouldShowPlacesUpgradePrompt = quotaDisplay.shouldShowPlacesUpgradePrompt;
  const showNearbyPlaces = restaurantSearch.showNearbyPlaces;
  const triggerSavedRestaurantsRefetch = savedSuggestions.refetch;
  const hasNotePhotos = (noteDetailQuery.data?.photos.length ?? 0) > 0;
  const notePhotoCount = noteDetailQuery.data?.photos.length ?? 0;
  const isBlockingNotePhotoLoad = isNoteDrivenFlow && noteDetailQuery.isLoading && !noteDetailQuery.data;
  const hasBlockingNotePhotoError = isNoteDrivenFlow && noteDetailQuery.isError && !noteDetailQuery.data;

  useEffect(() => {
    if (!sourceNoteId) {
      return undefined;
    }

    return () => {
      cleanupHydratedNotePhotos(sourceNoteId);
    };
  }, [sourceNoteId]);

  useEffect(() => {
    if (photos.length === 0) {
      if (step === 'group' || step === 'process' || step === 'review') {
        setStep('upload');
      }
      setCurrentPhotoIndex(0);
      setRestaurantPhotoGroups([]);
      return;
    }

    const maxIndex =
      processType === 'restaurant' && (step === 'process' || step === 'review')
        ? restaurantPhotoGroups.length - 1
        : photos.length - 1;
    if (currentPhotoIndex > maxIndex) {
      setCurrentPhotoIndex(Math.max(maxIndex, 0));
    }
  }, [
    currentPhotoIndex,
    photos.length,
    processType,
    restaurantPhotoGroups.length,
    setCurrentPhotoIndex,
    step,
  ]);

  useEffect(() => {
    if (restaurantPhotoGroups.length === 0) {
      setSelectedRestaurantPhotoGroupId(null);
      return;
    }

    const reconciled = reconcileRestaurantPhotoGroupsWithPhotos({
      photos,
      restaurantPhotoGroups,
      selectedRestaurantPhotoGroupId,
    });
    if (
      !areRestaurantPhotoGroupsEqual(
        restaurantPhotoGroups,
        reconciled.restaurantPhotoGroups,
      )
    ) {
      setRestaurantPhotoGroups(reconciled.restaurantPhotoGroups);
    }
    if (selectedRestaurantPhotoGroupId !== reconciled.selectedRestaurantPhotoGroupId) {
      setSelectedRestaurantPhotoGroupId(reconciled.selectedRestaurantPhotoGroupId);
    }
  }, [photos, restaurantPhotoGroups, selectedRestaurantPhotoGroupId]);

  useEffect(() => {
    if (
      selectedRestaurantPhotoGroupId &&
      !restaurantPhotoGroups.some((group) => group.id === selectedRestaurantPhotoGroupId)
    ) {
      setSelectedRestaurantPhotoGroupId(
        resolveSelectedRestaurantPhotoGroupId(
          restaurantPhotoGroups,
          selectedRestaurantPhotoGroupId,
        ),
      );
    }
  }, [restaurantPhotoGroups, selectedRestaurantPhotoGroupId]);

  useEffect(() => {
    if (step !== 'process' || !currentPhoto) {
      setIsPhotoViewerVisible(false);
    }
  }, [currentPhoto, step]);

  useEffect(() => {
    if (step !== 'group') {
      setGroupingPhotoViewerVisible(false);
    }
  }, [step]);

  useEffect(() => {
    if (step !== 'process' || !processType || !currentPhoto) {
      return;
    }

    if (processType === 'restaurant') {
      if (!currentRestaurantGroup) {
        return;
      }

      setRestaurantForms((current) => {
        if (current[currentRestaurantGroup.id]) {
          return current;
        }

        const previousGroup =
          currentPhotoIndex > 0 ? restaurantPhotoGroups[currentPhotoIndex - 1] : null;
        const previousForm = previousGroup ? current[previousGroup.id] : undefined;

        return {
          ...current,
          [currentRestaurantGroup.id]: buildDefaultRestaurantForm(currentPhoto, previousForm),
        };
      });
      return;
    }

    setFoodProductForms((current) => {
      if (current[currentPhoto.id]) {
        return current;
      }

      const previousPhoto = currentPhotoIndex > 0 ? photos[currentPhotoIndex - 1] : null;
      const previousForm = previousPhoto ? current[previousPhoto.id] : undefined;

      return {
        ...current,
        [currentPhoto.id]: buildDefaultFoodProductForm({
          captureDate: currentPhoto.captureDate,
          detectedDateValue: resolveDraftPhotoDetectedDateValue(currentPhoto),
          previousForm,
        }),
      };
    });
  }, [
    currentPhoto,
    currentPhotoIndex,
    photos,
    processType,
    currentRestaurantGroup,
    restaurantPhotoGroups,
    setFoodProductForms,
    setRestaurantForms,
    step,
  ]);

  useEffect(() => {
    if (step === 'process' && processType === 'restaurant') {
      setMenuItemSearchQuery('');
      setNewMenuItemName('');
      setIsEditingMenuItemInline(false);
      setEditingMenuItemName('');
    }
  }, [currentPhoto?.id, currentRestaurantGroupId, processType, step]);

  useEffect(() => {
    if (step === 'process' && processType === 'restaurant') {
      setMenuItemMode('existing');
    }
  }, [currentPhoto?.id, currentRestaurantGroupId, processType, step]);

  const resetFlowSelectionState = useCallback(() => {
    resetRestaurantSelectionFlow();
    setMenuItemSearchQuery('');
    setMenuItemMode('existing');
    setNewMenuItemName('');
    setIsEditingMenuItemInline(false);
    setEditingMenuItemName('');
  }, [resetRestaurantSelectionFlow]);

  const initializeRestaurantPhotoGroups = useCallback(() => {
    const nextGrouping = initializeRestaurantPhotoGrouping(photos);
    setRestaurantPhotoGroups(nextGrouping.restaurantPhotoGroups);
    setSelectedRestaurantPhotoGroupId(nextGrouping.selectedRestaurantPhotoGroupId);
    setRestaurantForms(nextGrouping.restaurantForms);
    setCurrentPhotoIndex(nextGrouping.currentPhotoIndex);
  }, [photos, setCurrentPhotoIndex, setRestaurantForms]);

  const handleRemovePhoto = useCallback(
    (photoId: string) => {
      const nextDraft = removePhotoFromPhotoProcessingDraft({
        photoId,
        snapshot: photoProcessingDraftSnapshot,
      });
      applyDraftSnapshot(nextDraft);
      setRestaurantPhotoGroups(nextDraft.restaurantPhotoGroups);
      setSelectedRestaurantPhotoGroupId(nextDraft.selectedRestaurantPhotoGroupId);
    },
    [applyDraftSnapshot, photoProcessingDraftSnapshot],
  );

  const movePhotoToRestaurantGroup = useCallback(
    (photoId: string, targetGroupId: string) => {
      const result = movePhotoToRestaurantGroupTransition({
        maxPhotosPerRestaurantItem: effectiveMaxPhotosPerRestaurantItem,
        photoId,
        restaurantPhotoGroups,
        targetGroupId,
      });

      if (result.status === 'limit_reached') {
        setErrorMessage(result.message);
        return;
      }

      if (result.status === 'changed') {
        setErrorMessage(null);
        setRestaurantPhotoGroups(result.restaurantPhotoGroups);
        setSelectedRestaurantPhotoGroupId(result.selectedRestaurantPhotoGroupId);
      }
    },
    [effectiveMaxPhotosPerRestaurantItem, restaurantPhotoGroups],
  );

  const replaceRestaurantGroupPhoto = useCallback(
    (photoId: string, targetGroupId: string) => {
      const result = replaceRestaurantGroupPhotoTransition({
        photoId,
        restaurantPhotoGroups,
        targetGroupId,
      });

      if (result.status === 'changed') {
        setErrorMessage(null);
        setRestaurantPhotoGroups(result.restaurantPhotoGroups);
        setSelectedRestaurantPhotoGroupId(result.selectedRestaurantPhotoGroupId);
      }
    },
    [restaurantPhotoGroups],
  );

  const splitPhotoToRestaurantGroup = useCallback((photoId: string) => {
    const result = splitPhotoToRestaurantGroupTransition({
      photoId,
      restaurantPhotoGroups,
    });

    if (result.status === 'changed') {
      setErrorMessage(null);
      setRestaurantPhotoGroups(result.restaurantPhotoGroups);
      setSelectedRestaurantPhotoGroupId(result.selectedRestaurantPhotoGroupId);
    }
  }, [restaurantPhotoGroups]);

  const beginStandardProcessFlow = useCallback(
    (nextProcessType: ProcessType) => {
      setProcessType(nextProcessType);
      setStep('upload');
      resetDraftState();
      setRestaurantPhotoGroups([]);
      setSelectedRestaurantPhotoGroupId(null);
      resetFlowSelectionState();
      setErrorMessage(null);
    },
    [resetDraftState, resetFlowSelectionState],
  );

  const beginNotePhotoProcessFlow = useCallback(
    async (nextProcessType: ProcessType) => {
      if (!sourceNoteId || !hasNotePhotos) {
        return;
      }

      setIsPreparingNotePhotos(true);
      setErrorMessage(null);

      try {
        if (photos.length === 0) {
          const hydratedPhotos = await hydrateDraftPhotosFromNote(sourceNoteId, noteDetailQuery.data?.photos ?? []);
          replacePhotos(hydratedPhotos);
        } else {
          resetProcessingForms();
        }

        setRestaurantPhotoGroups([]);
        setSelectedRestaurantPhotoGroupId(null);
        resetFlowSelectionState();
        setProcessType(nextProcessType);
        setStep('upload');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not load note photos.';
        setErrorMessage(message);
      } finally {
        setIsPreparingNotePhotos(false);
      }
    },
    [
      hasNotePhotos,
      noteDetailQuery.data?.photos,
      photos.length,
      replacePhotos,
      resetFlowSelectionState,
      resetProcessingForms,
      sourceNoteId,
    ],
  );

  const scrollProcessStepToTop = useCallback(() => {
    processStepScrollViewRef.current?.scrollTo({
      y: 0,
      animated: false,
    });
  }, []);
  const scrollProcessStepToOffset = useCallback((offsetY: number) => {
    requestAnimationFrame(() => {
      processStepScrollViewRef.current?.scrollTo({
        y: offsetY,
        animated: false,
      });
    });
  }, []);

  const goToProcessPhoto = useCallback(
    (nextIndex: number) => {
      Keyboard.dismiss();
      scrollProcessStepToTop();
      setIsPhotoViewerVisible(false);
      setCurrentPhotoIndex(nextIndex);
      setErrorMessage(null);
    },
    [scrollProcessStepToTop, setCurrentPhotoIndex],
  );

  const openPhotoViewer = useCallback((initialIndex = 0) => {
    setPhotoViewerInitialIndex(initialIndex);
    setIsPhotoViewerVisible(true);
  }, []);

  const closePhotoViewer = useCallback(() => {
    setIsPhotoViewerVisible(false);
  }, []);

  const openGroupingPhotoViewer = useCallback(
    (viewerPhotos: DraftPhotoAsset[], initialIndex = 0) => {
      const urls = viewerPhotos
        .map((photo) => photo.uri.trim())
        .filter((uri) => uri.length > 0);
      if (urls.length === 0) {
        return;
      }

      setGroupingPhotoViewerUrls(urls);
      setGroupingPhotoViewerInitialIndex(
        Math.max(0, Math.min(initialIndex, urls.length - 1)),
      );
      setGroupingPhotoViewerVisible(true);
    },
    [],
  );

  const closeGroupingPhotoViewer = useCallback(() => {
    setGroupingPhotoViewerVisible(false);
  }, []);

  const displayedSavedRestaurants = useMemo(() => {
    return allDisplayedSavedRestaurants.filter(isUserAddedRestaurantOption).slice(0, 12);
  }, [allDisplayedSavedRestaurants]);

  const displayedNearbyRestaurants = useMemo(() => {
    return allDisplayedNearbyRestaurants.slice(0, 12);
  }, [allDisplayedNearbyRestaurants]);

  const filteredMenuItems = useMemo(() => {
    const normalizedQuery = normalizeSelectionLabel(menuItemSearchQuery);
    const menuItems = menuItemsQuery.data ?? [];
    if (!normalizedQuery) {
      return menuItems;
    }

    return menuItems.filter((item) => normalizeSelectionLabel(item.name).includes(normalizedQuery));
  }, [menuItemSearchQuery, menuItemsQuery.data]);

  const selectedMenuItem = useMemo(() => {
    const menuItems = menuItemsQuery.data ?? [];
    if (!currentRestaurantForm?.menuItemName && !currentRestaurantForm?.menuItemId) {
      return null;
    }

    return (
      menuItems.find((item) => item.id === currentRestaurantForm?.menuItemId) ??
      menuItems.find(
        (item) => normalizeSelectionLabel(item.name) === normalizeSelectionLabel(currentRestaurantForm?.menuItemName ?? ''),
      ) ??
      null
    );
  }, [currentRestaurantForm?.menuItemId, currentRestaurantForm?.menuItemName, menuItemsQuery.data]);

  const displayedMenuItems = useMemo(() => {
    const normalizedQuery = normalizeSelectionLabel(menuItemSearchQuery);
    const normalizedSelectedName = normalizeSelectionLabel(selectedMenuItem?.name ?? '');
    if (selectedMenuItem && (!normalizedQuery || normalizedQuery === normalizedSelectedName)) {
      return [selectedMenuItem];
    }

    const selected: MenuItemRecord[] = [];
    const unselected: MenuItemRecord[] = [];

    for (const item of filteredMenuItems) {
      const isSelected =
        (currentRestaurantForm?.menuItemId
          ? item.id === currentRestaurantForm.menuItemId
          : normalizeSelectionLabel(item.name) === normalizeSelectionLabel(currentRestaurantForm?.menuItemName ?? ''));

      if (isSelected) {
        selected.push(item);
      } else {
        unselected.push(item);
      }
    }

    return [...selected, ...unselected];
  }, [
    currentRestaurantForm?.menuItemId,
    currentRestaurantForm?.menuItemName,
    filteredMenuItems,
    menuItemSearchQuery,
    selectedMenuItem,
  ]);
  const shouldShowMenuItemSearch = menuItemMode === 'existing' && !selectedMenuItem;

  const selectedRestaurant = useMemo(() => {
    const selectedRestaurantId = currentRestaurantForm?.restaurantId;
    if (!selectedRestaurantId) {
      return null;
    }

    return (
      loadedRestaurantRecords.find((restaurant) => restaurant.id === selectedRestaurantId) ??
      (currentRestaurantForm?.restaurantName
        ? {
            id: selectedRestaurantId,
            name: currentRestaurantForm.restaurantName,
          }
        : null)
    );
  }, [
    currentRestaurantForm?.restaurantId,
    currentRestaurantForm?.restaurantName,
    loadedRestaurantRecords,
  ]);
  const collapsedRestaurantOptions = useMemo(
    () =>
      collapseRestaurantOptionsToSelection({
        savedRestaurants: displayedSavedRestaurants,
        searchRestaurants: displayedNearbyRestaurants,
        selectedRestaurant,
      }),
    [displayedNearbyRestaurants, displayedSavedRestaurants, selectedRestaurant],
  );

  const matchingMenuItemByName = useMemo(() => {
    const normalizedName = normalizeSelectionLabel(newMenuItemName);
    if (!normalizedName) {
      return null;
    }

    return (
      (menuItemsQuery.data ?? []).find((item) => normalizeSelectionLabel(item.name) === normalizedName) ?? null
    );
  }, [menuItemsQuery.data, newMenuItemName]);
  const {
    foodProductReviewEntries,
    restaurantReviewGroups,
    reviewFoodProductCards,
    reviewVisitCards,
  } = usePhotoProcessingReviewData({
    currentUserId,
    draftSnapshot: photoProcessingDraftSnapshot,
    userName: user?.name?.trim() || undefined,
    visitVisibility,
  });

  const estimatedFreeMonthlyPhotoTotal = (monthlyUsage.snapshot?.usage.photoUploads ?? 0) + photos.length;
  const estimatedFreeMonthlyPhotoRemaining = Math.max(
    FREE_MONTHLY_PHOTO_LIMIT - estimatedFreeMonthlyPhotoTotal,
    0,
  );
  const shouldHidePhotoSourceActions =
    isDisplayFreeUser &&
    shouldEnforceUsageLimitsClientSide &&
    Boolean(monthlyUsage.snapshot) &&
    estimatedFreeMonthlyPhotoRemaining <= 0;
  const photoQuotaStatusMessage = shouldHidePhotoSourceActions
    ? formatFreeMonthlyPhotoLimitStatus(estimatedFreeMonthlyPhotoRemaining)
    : null;
  const monthlyPhotoSelectionLimit =
    monthlyUsage.snapshot && isDisplayFreeUser
      ? estimatedFreeMonthlyPhotoRemaining
      : null;
  const ratedCount = useMemo(() => {
    if (processType === 'restaurant') {
      return Object.values(restaurantForms).filter(
        (form) => Boolean(form.menuItemName.trim()) && form.rating > 0,
      ).length;
    }

    if (processType === 'foodProduct') {
      return Object.values(foodProductForms).filter(
        (form) => Boolean(form.itemName.trim()) && form.rating > 0,
      ).length;
    }

    return 0;
  }, [foodProductForms, processType, restaurantForms]);
  const hasUnsavedChanges =
    processType !== null ||
    photos.length > 0 ||
    Object.keys(restaurantForms).length > 0 ||
    Object.keys(foodProductForms).length > 0;
  const buildFlowAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'PhotoProcessingScreen',
      processType: processType ?? 'unselected',
      step,
      photoCount: photos.length,
      ratedCount,
      hasUnsavedChanges,
      ...overrides,
    }),
    [hasUnsavedChanges, photos.length, processType, ratedCount, step],
  );
  const { handleProcessNext, handleSubmitAll, isSubmitting } =
    usePhotoProcessingSubmission({
      currentPhoto,
      currentPhotoIndex,
      currentFoodProductForm,
      currentRestaurantForm,
      goToProcessPhoto,
      isDisplayFreeUser,
      isOnline,
      monthlyUsageSnapshot: monthlyUsage.snapshot,
      navigation,
      onSubmitSucceeded: () => {
        hasCompletedFlowRef.current = true;
      },
      photos: photoProcessingDraftSnapshot.photos,
      processUnitCount:
        processType === 'restaurant'
          ? photoProcessingDraftSnapshot.restaurantPhotoGroups.length
          : photoProcessingDraftSnapshot.photos.length,
      processType,
      queryClient,
      foodProductForms: photoProcessingDraftSnapshot.foodProductForms,
      restaurantPhotoGroups:
        processType === 'restaurant'
          ? photoProcessingDraftSnapshot.restaurantPhotoGroups
          : undefined,
      restaurantForms: photoProcessingDraftSnapshot.restaurantForms,
      setErrorMessage,
      setStep,
      sourceNoteId,
      shouldEnforceUsageLimitsClientSide,
      visitVisibility,
      writeFeature,
    });

  useEffect(() => {
    if (hasTrackedFlowOpenRef.current) {
      return;
    }

    hasTrackedFlowOpenRef.current = true;
    trackObservabilityEvent('PHOTO_PROCESSING_FLOW_OPENED', buildFlowAnalyticsPayload());
    trackProductEvent('tracking.entry_started', {
      entryType: 'photo_batch',
      source: sourceNoteId ? 'note' : 'photo_processing',
      hasPhoto: photos.length > 0,
      itemCount: photos.length,
      completed: false,
      processType: processType ?? 'unselected',
    });
  }, [buildFlowAnalyticsPayload, photos.length, processType, sourceNoteId]);

  useEffect(() => {
    if (lastTrackedStepRef.current === step) {
      return;
    }

    lastTrackedStepRef.current = step;
    trackObservabilityEvent('PHOTO_PROCESSING_STEP_VIEWED', buildFlowAnalyticsPayload());
  }, [buildFlowAnalyticsPayload, step]);

  useEffect(
    () => () => {
      if (
        hasCompletedFlowRef.current ||
        hasTrackedFlowExitRef.current ||
        !hasTrackedFlowOpenRef.current
      ) {
        return;
      }

      hasTrackedFlowExitRef.current = true;
      trackObservabilityEvent(
        'PHOTO_PROCESSING_FLOW_EXITED',
        buildFlowAnalyticsPayload({
          exitMethod: exitMethodRef.current ?? 'system_back_or_gesture',
        }),
      );
      trackProductEvent('tracking.entry_abandoned', {
        entryType: 'photo_batch',
        source: sourceNoteId ? 'note' : 'photo_processing',
        hasPhoto: photos.length > 0,
        itemCount: photos.length,
        ratingCount: ratedCount,
        completed: false,
        exitMethod: exitMethodRef.current ?? 'system_back_or_gesture',
        processType: processType ?? 'unselected',
      });
    },
    [buildFlowAnalyticsPayload, photos.length, processType, ratedCount, sourceNoteId],
  );

  const handleSearchByText = async (collapseAfterSearch = false) => {
    if (isCurrentLocationSearchSelection({ isUsingCurrentLocation, manualLocation })) {
      await handleSearchCurrentLocationByText();
      return;
    }

    dismissCurrentPhotoLocationHint();
    const result = await runRestaurantSearchByText({
      collapseAfterSearch,
    });

    if (result.status === 'quota_reached') {
      trackObservabilityEvent('USAGE_LIMIT_REACHED', {
        enforcement: 'client_estimate',
        limit: monthlyUsage.snapshot?.limits.placesQueriesMonthly ?? null,
        metric: 'places_queries',
        remaining: placesQueriesRemaining,
        source: 'PhotoProcessingScreen',
        used: monthlyUsage.snapshot?.usage.placesQueries ?? null,
      });
      trackProductEvent('quality.usage_limit_reached', {
        enforcement: 'client_estimate',
        limit: monthlyUsage.snapshot?.limits.placesQueriesMonthly ?? null,
        metric: 'places_queries',
        remaining: placesQueriesRemaining,
        source: 'PhotoProcessingScreen',
        used: monthlyUsage.snapshot?.usage.placesQueries ?? null,
      });
      return;
    }

    if (result.status === 'error' && result.limitPayload) {
      trackObservabilityEvent('USAGE_LIMIT_REACHED', {
        enforcement: 'server',
        limit: result.limitPayload.limit,
        metric: result.limitPayload.metric,
        monthKey: result.limitPayload.monthKey,
        remaining: result.limitPayload.remaining,
        source: 'PhotoProcessingScreen',
        used: result.limitPayload.used,
        userTier: result.limitPayload.userTier ?? null,
      });
      trackProductEvent('quality.usage_limit_reached', {
        enforcement: 'server',
        limit: result.limitPayload.limit,
        metric: result.limitPayload.metric,
        monthKey: result.limitPayload.monthKey,
        remaining: result.limitPayload.remaining,
        source: 'PhotoProcessingScreen',
        used: result.limitPayload.used,
        userTier: result.limitPayload.userTier ?? null,
      });
    }
  };

  const handleSearchCurrentLocationByText = async () => {
    dismissCurrentPhotoLocationHint();
    const result = await runCurrentLocationRestaurantSearch();

    if (result.status === 'quota_reached') {
      trackObservabilityEvent('USAGE_LIMIT_REACHED', {
        enforcement: 'client_estimate',
        limit: monthlyUsage.snapshot?.limits.placesQueriesMonthly ?? null,
        metric: 'places_queries',
        remaining: placesQueriesRemaining,
        source: 'PhotoProcessingScreen',
        used: monthlyUsage.snapshot?.usage.placesQueries ?? null,
      });
      trackProductEvent('quality.usage_limit_reached', {
        enforcement: 'client_estimate',
        limit: monthlyUsage.snapshot?.limits.placesQueriesMonthly ?? null,
        metric: 'places_queries',
        remaining: placesQueriesRemaining,
        source: 'PhotoProcessingScreen',
        used: monthlyUsage.snapshot?.usage.placesQueries ?? null,
      });
      return;
    }

    if (result.status === 'error' && result.limitPayload) {
      trackObservabilityEvent('USAGE_LIMIT_REACHED', {
        enforcement: 'server',
        limit: result.limitPayload.limit,
        metric: result.limitPayload.metric,
        monthKey: result.limitPayload.monthKey,
        remaining: result.limitPayload.remaining,
        source: 'PhotoProcessingScreen',
        used: result.limitPayload.used,
        userTier: result.limitPayload.userTier ?? null,
      });
      trackProductEvent('quality.usage_limit_reached', {
        enforcement: 'server',
        limit: result.limitPayload.limit,
        metric: result.limitPayload.metric,
        monthKey: result.limitPayload.monthKey,
        remaining: result.limitPayload.remaining,
        source: 'PhotoProcessingScreen',
        used: result.limitPayload.used,
        userTier: result.limitPayload.userTier ?? null,
      });
    }
  };

  const shouldShowFocusedRestaurantSearch =
    isRestaurantSearchFocused && processType === 'restaurant' && step === 'process';
  const openFocusedRestaurantSearch = useCallback(() => {
    processStepRestoreScrollYRef.current = processStepScrollOffsetYRef.current;
    shouldResetFocusedRestaurantSearchScrollRef.current = true;
    setIsRestaurantSearchFocused(true);
    if (!manualLocation.trim()) {
      selectCurrentLocationForSearch();
    }
  }, [manualLocation, selectCurrentLocationForSearch]);
  const closeFocusedRestaurantSearch = useCallback(() => {
    if (isRestaurantSearchFocused && processStepRestoreScrollYRef.current === null) {
      processStepRestoreScrollYRef.current = processStepScrollOffsetYRef.current;
    }

    setIsRestaurantSearchFocused(false);
  }, [isRestaurantSearchFocused]);
  const handleProcessStepScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (shouldShowFocusedRestaurantSearch) {
        return;
      }

      processStepScrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
    },
    [shouldShowFocusedRestaurantSearch],
  );
  const dismissFocusedLocationOptions = useCallback(() => {
    if (!shouldShowFocusedRestaurantSearch) {
      return;
    }

    setFocusedLocationOptionsDismissSignal((currentSignal) => currentSignal + 1);
  }, [shouldShowFocusedRestaurantSearch]);
  const resetFocusedRestaurantSearchScrollToTop = useCallback(() => {
    if (!shouldShowFocusedRestaurantSearch || !shouldResetFocusedRestaurantSearchScrollRef.current) {
      return;
    }

    shouldResetFocusedRestaurantSearchScrollRef.current = false;
    scrollProcessStepToOffset(0);
  }, [scrollProcessStepToOffset, shouldShowFocusedRestaurantSearch]);
  useEffect(() => {
    if (shouldShowFocusedRestaurantSearch) {
      scrollProcessStepToOffset(0);
      return;
    }

    if (processType !== 'restaurant' || step !== 'process') {
      processStepRestoreScrollYRef.current = null;
      return;
    }

    const restoreOffsetY = processStepRestoreScrollYRef.current;
    if (restoreOffsetY === null) {
      return;
    }

    processStepRestoreScrollYRef.current = null;
    scrollProcessStepToOffset(restoreOffsetY);
  }, [processType, scrollProcessStepToOffset, shouldShowFocusedRestaurantSearch, step]);
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
        closeFocusedRestaurantSearch();
      }}
      onManualLocationChange={(value) => {
        setManualLocation(value);
        dismissCurrentPhotoLocationHint();
      }}
      onSearchPress={() => {
        void handleSearchByText(false);
      }}
      onSearchQueryChange={(value) => {
        setRestaurantSearchQuery(value);
        dismissCurrentPhotoLocationHint();
      }}
      onUseCurrentLocationPress={() => {
        void handleSearchCurrentLocationByText();
      }}
      searchButtonDisabled={searchButtonDisabled}
      searchButtonLabel={expandedSearchLabel}
      searchButtonLoading={isSearchingRestaurants}
      searchQuery={restaurantSearchQuery}
      testID="process-photos-focused-restaurant-search-header"
    />
  );

  const clearSelectedRestaurant = () => {
    updateCurrentRestaurantForm({
      restaurantId: '',
      restaurantName: '',
      menuItemId: '',
      menuItemName: '',
      rating: 3,
      description: '',
      notes: '',
    });
    setMenuItemSearchQuery('');
    setNewMenuItemName('');
    setMenuItemMode('existing');
    setIsEditingMenuItemInline(false);
    setEditingMenuItemName('');
    setErrorMessage(null);
    clearSearchErrorMessage();
  };

  const handleSelectRestaurant = (restaurant: RestaurantRecord) => {
    if (currentRestaurantForm?.restaurantId === restaurant.id) {
      clearSelectedRestaurant();
      closeFocusedRestaurantSearch();
      return;
    }

    const isChangingRestaurant =
      Boolean(currentRestaurantForm?.restaurantId) && currentRestaurantForm?.restaurantId !== restaurant.id;

    updateCurrentRestaurantForm({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      ...(isChangingRestaurant
        ? {
            menuItemId: '',
            menuItemName: '',
            rating: 3,
            description: '',
            notes: '',
          }
        : {}),
    });
    setMenuItemSearchQuery('');
    setNewMenuItemName('');
    setMenuItemMode('existing');
    setIsEditingMenuItemInline(false);
    setEditingMenuItemName('');
    setErrorMessage(null);
    clearSearchErrorMessage();
    closeFocusedRestaurantSearch();
  };

  const clearSelectedMenuItem = () => {
    updateCurrentRestaurantForm({
      menuItemId: '',
      menuItemName: '',
      rating: 3,
      description: '',
      notes: '',
    });
    setMenuItemSearchQuery('');
    setNewMenuItemName('');
    setMenuItemMode('existing');
    setIsEditingMenuItemInline(false);
    setEditingMenuItemName('');
    setErrorMessage(null);
  };

  const handleSelectMenuItem = (menuItem: MenuItemRecord) => {
    const isAlreadySelected =
      currentRestaurantForm?.menuItemId === menuItem.id ||
      (!currentRestaurantForm?.menuItemId &&
        normalizeSelectionLabel(currentRestaurantForm?.menuItemName ?? '') === normalizeSelectionLabel(menuItem.name));

    if (isAlreadySelected) {
      clearSelectedMenuItem();
      return;
    }

    const isChangingMenuItem =
      currentRestaurantForm?.menuItemId !== menuItem.id &&
      normalizeSelectionLabel(currentRestaurantForm?.menuItemName ?? '') !== normalizeSelectionLabel(menuItem.name);

    updateCurrentRestaurantForm({
      menuItemId: menuItem.id,
      menuItemName: menuItem.name,
      ...(isChangingMenuItem
        ? {
            rating: 3,
            description: '',
            notes: '',
          }
        : {}),
    });
    setMenuItemSearchQuery(menuItem.name);
    setNewMenuItemName('');
    setMenuItemMode('existing');
    setIsEditingMenuItemInline(false);
    setEditingMenuItemName(menuItem.name);
    setErrorMessage(null);
  };

  const buildRestaurantSearchOption = (
    { restaurant, distance }: VisitRestaurantWithDistance,
    source: 'search' | 'saved',
  ): VisitRestaurantSearchOption => {
    const isSelected = currentRestaurantForm?.restaurantId === restaurant.id;
    const userVisitCount = restaurant.userVisitCount ?? 0;
    const friendCount = restaurant.friendCount ?? 0;
    const description = (
      <View style={styles.descriptionContainer}>
        <Text tone="secondary">{buildVisitRestaurantDescription(restaurant, distance)}</Text>
        {userVisitCount > 0 || friendCount > 0 ? (
          <View style={styles.statsRow}>
            {userVisitCount > 0 ? (
              <View style={[styles.statPill, styles.userStatPill]}>
                <Ionicons
                  color={theme.colors.text.success}
                  name="calendar-outline"
                  size={12}
                />
                <Text tone="success" variant="bodySm">
                  {`You: ${formatVisitCount(userVisitCount)}`}
                </Text>
              </View>
            ) : null}
            {friendCount > 0 ? (
              <View style={[styles.statPill, styles.friendStatPill]}>
                <Ionicons
                  color={theme.colors.text.info}
                  name="people-outline"
                  size={12}
                />
                <Text tone="info" variant="bodySm">
                  {`Friends: ${formatFriendCount(friendCount)}`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );

    return {
      description,
      key: `${source}-${restaurant.id}`,
      onPress: () => {
        handleSelectRestaurant(restaurant);
      },
      selected: isSelected,
      title: restaurant.name,
      trailing: <VisitRestaurantOptionTrailing restaurant={restaurant} selected={isSelected} />,
    };
  };

  const pickPhotos = useCallback(
    async (source: ScanSource) => {
      trackObservabilityEvent('PHOTO_PROCESSING_MULTI_PICK_STARTED', {
        photoSource: source,
        source: 'PhotoProcessingScreen',
      });
      if (shouldHidePhotoSourceActions) {
        trackObservabilityEvent('USAGE_LIMIT_REACHED', {
          enforcement: 'client_estimate',
          limit: FREE_MONTHLY_PHOTO_LIMIT,
          metric: 'photo_uploads',
          remaining: estimatedFreeMonthlyPhotoRemaining,
          source: 'PhotoProcessingScreen',
          used: estimatedFreeMonthlyPhotoTotal,
        });
        trackProductEvent('quality.usage_limit_reached', {
          enforcement: 'client_estimate',
          limit: FREE_MONTHLY_PHOTO_LIMIT,
          metric: 'photo_uploads',
          remaining: estimatedFreeMonthlyPhotoRemaining,
          source: 'PhotoProcessingScreen',
          used: estimatedFreeMonthlyPhotoTotal,
        });
        setErrorMessage(formatFreeMonthlyPhotoLimitStatus(estimatedFreeMonthlyPhotoRemaining));
        return;
      }

      setIsSelectingSource(true);
      setErrorMessage(null);
      setLastRequestedSource(source);

      try {
        const selectionLimit =
          source === 'gallery' && typeof monthlyPhotoSelectionLimit === 'number'
            ? Math.max(monthlyPhotoSelectionLimit, 1)
            : 20;
        const result = await pickImageAssets({
          source,
          allowsMultipleSelection: source === 'gallery',
          selectionLimit,
          exif: true,
          quality: source === 'gallery' ? 0.7 : 0.8,
        });
        if (result.status === 'permission_denied') {
          trackObservabilityEvent('PHOTO_PROCESSING_MULTI_PERMISSION_DENIED', {
            canAskAgain: result.canAskAgain,
            photoSource: source,
            source: 'PhotoProcessingScreen',
          });
          setErrorMessage(result.message);
          return;
        }

        if (result.status === 'canceled') {
          trackObservabilityEvent('PHOTO_PROCESSING_MULTI_PICK_CANCELED', {
            photoSource: source,
            source: 'PhotoProcessingScreen',
          });
          return;
        }

        trackObservabilityEvent('PHOTO_PROCESSING_MULTI_PICKED', {
          photoCount: result.assets.length,
          photoSource: source,
          source: 'PhotoProcessingScreen',
        });
        const selectedAssets =
          source === 'gallery'
            ? result.assets.slice(0, selectionLimit)
            : result.assets;
        await appendAssets(selectedAssets);
        if (selectedAssets.length < result.assets.length) {
          setErrorMessage(`Only ${selectionLimit} photo upload${selectionLimit === 1 ? '' : 's'} left this month.`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not select images.';
        trackObservabilityEvent('PHOTO_PROCESSING_MULTI_PICK_FAILED', {
          errorMessage: message,
          errorType: error instanceof Error ? error.name : 'unknown_error',
          photoSource: source,
          source: 'PhotoProcessingScreen',
        });
        setErrorMessage(message);
      } finally {
        setIsSelectingSource(false);
      }
    },
    [
      appendAssets,
      estimatedFreeMonthlyPhotoRemaining,
      estimatedFreeMonthlyPhotoTotal,
      monthlyPhotoSelectionLimit,
      pickImageAssets,
      shouldHidePhotoSourceActions,
    ],
  );

  const handleCreateMenuItem = async () => {
    if (!currentRestaurantForm?.restaurantId) {
      setErrorMessage('Select a restaurant before adding a menu item.');
      return;
    }

    if (!isOnline) {
      setErrorMessage('Creating menu items requires internet connection.');
      return;
    }

    if (!currentUserId) {
      setErrorMessage('Please sign in again to continue.');
      return;
    }

    if (matchingMenuItemByName) {
      const isMatchingItemSelected =
        currentRestaurantForm?.menuItemId === matchingMenuItemByName.id ||
        (!currentRestaurantForm?.menuItemId &&
          normalizeSelectionLabel(currentRestaurantForm?.menuItemName ?? '') ===
            normalizeSelectionLabel(matchingMenuItemByName.name));

      if (isMatchingItemSelected) {
        setMenuItemMode('existing');
        setNewMenuItemName('');
        return;
      }
      handleSelectMenuItem(matchingMenuItemByName);
      return;
    }

    const menuItemName = newMenuItemName.trim();
    if (!menuItemName) {
      setErrorMessage('Enter a menu item name first.');
      return;
    }

    setErrorMessage(null);
    setIsCreatingMenuItem(true);
    try {
      const createResult = await menuItemCatalogWrites.createMenuItem({
        restaurantId: currentRestaurantForm.restaurantId,
        name: menuItemName,
        createdBy: currentUserId,
        visibility: 'friends',
        isFromOCR: false,
      });

      if (createResult.status === 'blocked') {
        setErrorMessage('Creating menu items requires internet connection.');
        return;
      }

      handleSelectMenuItem(createResult.result);
      setMenuItemMode('existing');
      setNewMenuItemName('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add menu item.';
      setErrorMessage(message);
    } finally {
      setIsCreatingMenuItem(false);
    }
  };

  const handleSaveInlineMenuItemEdit = async () => {
    if (!selectedMenuItem || !currentRestaurantForm?.restaurantId) {
      return;
    }

    if (!isOnline) {
      setErrorMessage('Editing menu items requires internet connection.');
      return;
    }

    const trimmedName = editingMenuItemName.trim();
    if (!trimmedName) {
      setErrorMessage('Enter a menu item name first.');
      return;
    }

    setErrorMessage(null);
    setIsUpdatingMenuItem(true);

    try {
      const updateResult = await menuItemCatalogWrites.updateMenuItem({
        menuItemId: selectedMenuItem.id,
        restaurantId: currentRestaurantForm.restaurantId,
        name: trimmedName,
      });

      if (updateResult.status === 'blocked') {
        setErrorMessage('Editing menu items requires internet connection.');
        return;
      }

      setRestaurantForms((current) => {
        const next: Record<string, RestaurantPhotoForm> = {};
        for (const [photoId, form] of Object.entries(current)) {
          const matchesById = form.menuItemId === selectedMenuItem.id;
          const matchesByLegacyName =
            !form.menuItemId &&
            form.restaurantId === currentRestaurantForm.restaurantId &&
            normalizeSelectionLabel(form.menuItemName) === normalizeSelectionLabel(selectedMenuItem.name);

          next[photoId] =
            matchesById || matchesByLegacyName
              ? {
                  ...form,
                  menuItemId: selectedMenuItem.id,
                  menuItemName: trimmedName,
                }
              : form;
        }

        return next;
      });
      setMenuItemSearchQuery(trimmedName);
      setNewMenuItemName('');
      setEditingMenuItemName(trimmedName);
      setIsEditingMenuItemInline(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update menu item.';
      setErrorMessage(message);
    } finally {
      setIsUpdatingMenuItem(false);
    }
  };

  const styles = useStyles();

  const errorActionLabel = permissionNeedsSettings ? 'Open Settings' : undefined;
  const errorAction = permissionNeedsSettings
    ? () => {
        void Linking.openSettings();
      }
    : undefined;
  const linkedNoteCard = isNoteDrivenFlow ? (
    <LinkedNoteCard
      isLoading={noteDetailQuery.isLoading}
      note={noteDetailQuery.data?.note}
      testID="linked-note-card"
      titleAccessory={
        step === 'choice' && hasNotePhotos ? (
          <StatusPill
            label={`${notePhotoCount} photo${notePhotoCount === 1 ? '' : 's'}`}
            tone="info"
            variant="soft"
          />
        ) : undefined
      }
    />
  ) : null;
  const progressSteps = resolveProgressSteps(processType);
  const progressHeaderContent = processType ? (
    <StepProgressBar
      compact
      currentStep={resolveWizardStepIndex(step, processType)}
      showCompletedCheckmark={false}
      steps={progressSteps}
    />
  ) : null;

  if (step === 'choice') {
    return (
      <Screen
        background="surface"
        contentStyle={styles.choiceContent}
        edges={['top']}
        padded={false}
        scroll={isNoteDrivenFlow}
        testID="process-photos-choice-screen"
      >
        <ScreenHeader
          onBackPress={() => {
            exitMethodRef.current = 'header_back';
            navigation.goBack();
          }}
          subtitle={isNoteDrivenFlow ? 'Choose how you want to use this note.' : 'What would you like to track?'}
          title={isNoteDrivenFlow ? 'Use Note' : 'Process Photos'}
          variant="compact"
        />
        <View style={styles.choiceBody} testID={isNoteDrivenFlow ? 'note-use-choice-screen' : undefined}>
          <PageErrorToast
            actionLabel={errorActionLabel}
            analyticsProps={buildFlowAnalyticsPayload()}
            analyticsSource="PhotoProcessingScreen"
            errorMessage={errorMessage}
            onAction={errorAction}
          />
          {linkedNoteCard}
          <StepProgressBar
            compact
            currentStep={resolveWizardStepIndex('choice', null)}
            showCompletedCheckmark={false}
            steps={resolveProgressSteps(null)}
          />

          {isBlockingNotePhotoLoad ? <LoadingState label="Loading note photos..." /> : null}
          {hasBlockingNotePhotoError ? (
            <ErrorState
              analyticsProps={buildFlowAnalyticsPayload()}
              analyticsSource="PhotoProcessingScreen"
              description="Could not load note photos."
              onRetry={() => {
                void noteDetailQuery.refetch();
              }}
              title="Note unavailable"
            />
          ) : null}

          {!isBlockingNotePhotoLoad && !hasBlockingNotePhotoError ? (
            <>
              <FeatureActionCard
                description={
                  isNoteDrivenFlow
                    ? 'Full experience with restaurant, menu items, and ratings'
                    : 'Track menu items from your saved photos'
                }
                disabled={isPreparingNotePhotos}
                iconBackground={theme.colors.fill.info}
                iconColor={theme.colors.text.inverse}
                iconName="restaurant-outline"
                onPress={() => {
                  if (isNoteDrivenFlow) {
                    if (hasNotePhotos) {
                      void beginNotePhotoProcessFlow('restaurant');
                      return;
                    }

                    setErrorMessage(null);
                    exitMethodRef.current = 'programmatic_navigation';
                    navigation.navigate('CreateVisit', { sourceNoteId });
                    return;
                  }

                  beginStandardProcessFlow('restaurant');
                }}
                testID={isNoteDrivenFlow ? 'note-use-choice-restaurant' : undefined}
                title="Track Restaurant Visit"
              />

              <FeatureActionCard
                description={
                  isNoteDrivenFlow
                    ? 'Rate a grocery, convenience-store, or market item'
                    : 'Rate each photo as a food product'
                }
                disabled={isPreparingNotePhotos}
                iconBackground={theme.colors.fill.success}
                iconColor={theme.colors.text.inverse}
                iconName="flash-outline"
                onPress={() => {
                  if (isNoteDrivenFlow) {
                    if (hasNotePhotos) {
                      void beginNotePhotoProcessFlow('foodProduct');
                      return;
                    }

                    setErrorMessage(null);
                    exitMethodRef.current = 'programmatic_navigation';
                    navigation.navigate('FoodProduct', {
                      returnToPrevious: true,
                      sourceNoteId,
                    });
                    return;
                  }

                  beginStandardProcessFlow('foodProduct');
                }}
                testID={isNoteDrivenFlow ? 'note-use-choice-food-product' : undefined}
                title={isNoteDrivenFlow ? 'Food Product' : 'Food Products'}
              />

              {isPreparingNotePhotos ? <Text tone="secondary">Preparing note photos...</Text> : null}
            </>
          ) : null}
        </View>
      </Screen>
    );
  }

  if (step === 'upload' && processType) {
    const hasSelectedPhotos = photos.length > 0;
    const photoSourceCard = (
      <PhotoSourcePickerCard
        cardStyle={styles.uploadCard}
        cardTone={hasSelectedPhotos ? 'muted' : 'default'}
        description={
          hasSelectedPhotos
            ? 'Take another photo or upload more saved photos.'
            : 'Take a new photo or upload multiple saved photos.'
        }
        footer={photoQuotaStatusMessage ? (
          <Text tone="secondary" variant="bodySm">
            {photoQuotaStatusMessage}
          </Text>
        ) : null}
        galleryTitle="Upload Images"
        hideSourceActions={shouldHidePhotoSourceActions}
        isSelecting={isSelectingSource}
        onCameraPress={() => {
          void pickPhotos('camera');
        }}
        onGalleryPress={() => {
          void pickPhotos('gallery');
        }}
        title={hasSelectedPhotos ? 'Add more photos' : 'Choose Photo Source'}
        tone={hasSelectedPhotos ? 'muted' : 'default'}
      />
    );
    const photoSelectionCard = !hasSelectedPhotos ? (
      <Card>
        <EmptyState
          analyticsProps={buildFlowAnalyticsPayload()}
          analyticsSource="PhotoProcessingScreen"
          description="Add photos to start processing."
          title="No photos selected"
        />
      </Card>
    ) : (
      <Card style={styles.uploadCard}>
        <Text variant="label">
          {photos.length} photo{photos.length === 1 ? '' : 's'} selected
        </Text>
        <Text tone="secondary">Review your photos before continuing.</Text>
        <View style={styles.photoGrid}>
          {photos.map((photo) => (
            <View key={photo.id} style={styles.photoTile}>
              <Image source={{ uri: photo.uri }} style={styles.photoImage} />
              <View style={styles.photoMetaRow}>
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={1}
                  style={styles.photoName}
                  tone="secondary"
                  variant="bodySm"
                >
                  {formatDraftPhotoMetadataLabel(photo)}
                </Text>
                <Pressable
                  accessibilityLabel="Remove photo"
                  accessibilityRole="button"
                  onPress={() => {
                    handleRemovePhoto(photo.id);
                  }}
                  style={styles.photoRemoveButton}
                >
                  <Ionicons color={theme.colors.text.secondary} name="close" size={12} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </Card>
    );

    return (
      <FeatureFormScreenScaffold
        key={`photo-processing-${processType}-upload`}
        headerBottomCompact
        headerBottomContent={progressHeaderContent}
        keyboardAware={false}
        onBackPress={() => {
          setStep('choice');
          setProcessType(null);
          setErrorMessage(null);
        }}
        primaryAction={{
          label: 'Next',
          disabled: photos.length === 0 || isSelectingSource,
          onPress: () => {
            if (photos.length === 0) {
              setErrorMessage('Please choose at least one photo.');
              return;
            }

            setCurrentPhotoIndex(0);
            setErrorMessage(null);
            if (processType === 'restaurant') {
              initializeRestaurantPhotoGroups();
              setStep('group');
              return;
            }

            setStep('process');
          },
        }}
        secondaryAction={{
          label: 'Back',
          onPress: () => {
            setStep('choice');
            setProcessType(null);
            setErrorMessage(null);
          },
        }}
        subtitle="Upload and rate multiple food photos."
        title="Process Saved Photos"
      >
        <PageErrorToast
          actionLabel={errorActionLabel}
          analyticsProps={buildFlowAnalyticsPayload()}
          analyticsSource="PhotoProcessingScreen"
          errorMessage={errorMessage}
          onAction={errorAction}
          title="Photo upload issue"
        />
        {linkedNoteCard}

        {shouldShowOfflineUsageWarning(isOnline, isDisplayFreeUser) ? (
          <LightweightStatusCard message={OFFLINE_USAGE_WARNING_MESSAGE} style={styles.sectionCard} />
        ) : null}

        {hasSelectedPhotos ? photoSelectionCard : photoSourceCard}
        {hasSelectedPhotos ? photoSourceCard : photoSelectionCard}
      </FeatureFormScreenScaffold>
    );
  }

  if (step === 'group' && processType === 'restaurant') {
    const selectedGroupId = selectedRestaurantPhotoGroup?.id ?? null;
    const selectedPhotoIds = new Set(selectedRestaurantPhotoGroup?.photoIds ?? []);
    const availablePhotos = restaurantPhotoGroups
      .filter((group) => group.id !== selectedGroupId && group.photoIds.length === 1)
      .map((group) => photosById.get(group.photoIds[0] ?? ''))
      .filter((photo): photo is DraftPhotoAsset => {
        if (!photo) {
          return false;
        }

        return !selectedPhotoIds.has(photo.id);
      });
    const selectedGroupIndex = selectedGroupId
      ? restaurantPhotoGroups.findIndex((group) => group.id === selectedGroupId)
      : -1;
    const selectedGroupTitle =
      selectedGroupIndex >= 0 ? `Item ${selectedGroupIndex + 1}` : 'Selected item';
    const isSelectedGroupAtLimit =
      effectiveMaxPhotosPerRestaurantItem !== null &&
      selectedRestaurantPhotoGroupPhotos.length >= effectiveMaxPhotosPerRestaurantItem;

    return (
      <FeatureFormScreenScaffold
        key="photo-processing-restaurant-group"
        headerBottomCompact
        headerBottomContent={progressHeaderContent}
        keyboardAware={false}
        onBackPress={() => {
          setStep('upload');
          setErrorMessage(null);
        }}
        primaryAction={{
          label: 'Next',
          disabled: restaurantPhotoGroups.length === 0,
          onPress: () => {
            if (restaurantPhotoGroups.length === 0) {
              setErrorMessage('Group at least one photo before continuing.');
              return;
            }

            setCurrentPhotoIndex(0);
            setErrorMessage(null);
            setStep('process');
          },
        }}
        secondaryAction={{
          label: 'Back to Upload',
          onPress: () => {
            setStep('upload');
            setErrorMessage(null);
          },
          variant: 'secondary',
        }}
        subtitle={`${restaurantPhotoGroups.length} item${restaurantPhotoGroups.length === 1 ? '' : 's'} from ${photos.length} photo${photos.length === 1 ? '' : 's'}`}
        title="Group Photos"
      >
        <PageErrorToast
          analyticsProps={buildFlowAnalyticsPayload()}
          analyticsSource="PhotoProcessingScreen"
          errorMessage={errorMessage}
          title="Photo grouping issue"
        />
        {linkedNoteCard}

        {effectiveMaxPhotosPerRestaurantItem === 1 ? (
          <LightweightStatusCard
            message="Free users can keep one photo per menu item. Subscriber accounts can group multiple photos for one item."
            style={styles.sectionCard}
          />
        ) : null}

        <Card style={styles.groupingCard}>
          <Text variant="label">Item Groups</Text>
          <Text tone="secondary">
            Select an item group, then add matching photos to it.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groupingHorizontalContent}
          >
            {restaurantPhotoGroups.map((group, index) => {
              const groupPhotos = group.photoIds
                .map((photoId) => photosById.get(photoId))
                .filter((photo): photo is DraftPhotoAsset => Boolean(photo));
              const primaryPhotoUri = groupPhotos[0]?.uri ?? '';
              const isSelected = group.id === selectedGroupId;
              return (
                <Pressable
                  accessibilityLabel={`Select item group ${index + 1}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={group.id}
                  onPress={() => {
                    setSelectedRestaurantPhotoGroupId(group.id);
                    setErrorMessage(null);
                  }}
                  style={[
                    styles.groupingPhotoTile,
                    styles.groupingHorizontalTile,
                    isSelected ? styles.groupingPhotoTileSelected : null,
                  ]}
                >
                  <Image
                    source={{ uri: primaryPhotoUri }}
                    style={styles.groupingPhotoImage}
                  />
                  <View style={styles.groupingPhotoAction}>
                    <Text variant="bodySmTightBold">Item {index + 1}</Text>
                    <Text tone="secondary" variant="bodySm">
                      {groupPhotos.length} photo{groupPhotos.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Card>

        {selectedRestaurantPhotoGroup ? (
          <Card style={styles.groupingCard}>
            <View style={styles.groupingHeaderRow}>
              <View>
                <Text variant="label">{selectedGroupTitle}</Text>
                <Text tone="secondary" variant="bodySm">
                  {selectedRestaurantPhotoGroupPhotos.length} photo{selectedRestaurantPhotoGroupPhotos.length === 1 ? '' : 's'} selected
                </Text>
              </View>
              {displayMaxPhotosPerRestaurantItem === null ? (
                <StatusPill label="No item limit" tone="success" />
              ) : (
                <StatusPill
                  label={`${selectedRestaurantPhotoGroupPhotos.length}/${displayMaxPhotosPerRestaurantItem}`}
                  tone={isSelectedGroupAtLimit ? 'warning' : 'info'}
                />
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.groupingPhotoStrip}
              contentContainerStyle={styles.groupingStripContent}
            >
              {selectedRestaurantPhotoGroupPhotos.map((photo, index) => (
                <View key={photo.id} style={styles.groupingStripPhotoWrap}>
                  <Pressable
                    accessibilityLabel={`View ${photo.name} full screen`}
                    accessibilityRole="button"
                    onPress={() => {
                      openGroupingPhotoViewer(selectedRestaurantPhotoGroupPhotos, index);
                    }}
                  >
                    <Image source={{ uri: photo.uri }} style={styles.groupingStripImage} />
                  </Pressable>
                  {index > 0 ? (
                    <Pressable
                      accessibilityLabel={`Remove ${photo.name} from ${selectedGroupTitle}`}
                      accessibilityRole="button"
                      hitSlop={{ bottom: 22, left: 22 }}
                      onPress={() => {
                        splitPhotoToRestaurantGroup(photo.id);
                      }}
                      style={styles.groupingStripRemoveButton}
                    >
                      <Ionicons color={theme.colors.text.secondary} name="close" size={14} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </Card>
        ) : null}

        <Card style={styles.groupingCard}>
          <Text variant="label">Other Photos</Text>
          {availablePhotos.length === 0 ? (
            <EmptyState
              analyticsProps={buildFlowAnalyticsPayload()}
              analyticsSource="PhotoProcessingScreen"
              description="All photos are already in the selected item group."
              title="No other photos"
            />
          ) : (
            <View style={styles.groupingPhotoGrid}>
              {availablePhotos.map((photo, index) => (
                <View key={photo.id} style={styles.groupingPhotoTile}>
                  <View style={styles.groupingPhotoFrame}>
                    <Pressable
                      accessibilityLabel={`View ${photo.name} full screen`}
                      accessibilityRole="button"
                      onPress={() => {
                        openGroupingPhotoViewer(availablePhotos, index);
                      }}
                    >
                      <Image source={{ uri: photo.uri }} style={styles.groupingPhotoImage} />
                    </Pressable>
                    <Pressable
                      accessibilityHint={
                        selectedGroupId
                          ? undefined
                          : 'Select an item group before adding this photo.'
                      }
                      accessibilityLabel={
                        selectedGroupId
                          ? `Add ${photo.name} to ${selectedGroupTitle}`
                          : `Add ${photo.name} to an item group`
                      }
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !selectedGroupId }}
                      disabled={!selectedGroupId}
                      hitSlop={8}
                      onPress={() => {
                        if (selectedGroupId) {
                          movePhotoToRestaurantGroup(photo.id, selectedGroupId);
                        }
                      }}
                      style={styles.groupingIconButton}
                    >
                      <Ionicons color={theme.colors.text.secondary} name="add" size={18} />
                    </Pressable>
                  </View>
                  <View style={styles.groupingPhotoAction}>
                    <Text
                      ellipsizeMode="tail"
                      numberOfLines={1}
                      tone="secondary"
                      variant="bodySm"
                    >
                      {formatDraftPhotoMetadataLabel(photo)}
                    </Text>
                    {selectedGroupId && effectiveMaxPhotosPerRestaurantItem === 1 ? (
                      <Button
                        label="Replace"
                        onPress={() => {
                          replaceRestaurantGroupPhoto(photo.id, selectedGroupId);
                        }}
                        variant="secondary"
                      />
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
        <PhotoViewerModal
          initialIndex={groupingPhotoViewerInitialIndex}
          onRequestClose={closeGroupingPhotoViewer}
          urls={groupingPhotoViewerUrls}
          visible={groupingPhotoViewerVisible}
        />
      </FeatureFormScreenScaffold>
    );
  }

  if (step === 'process' && processType && currentPhoto) {
    const processUnitCount =
      processType === 'restaurant' ? restaurantPhotoGroups.length : photos.length;
    const isLastPhoto = currentPhotoIndex === processUnitCount - 1;
    const detectedDateValue = resolveDraftPhotoDetectedDateValue(currentPhoto);
    const captureCoordinatesLabel = currentPhoto.captureCoordinates
      ? formatCoordinatesForDisplay(currentPhoto.captureCoordinates)
      : null;
    const showLocationMetadataHint =
      Boolean(captureCoordinatesLabel) && !locationMetadataHintDismissedByPhotoId[currentPhoto.id];
    const renderRestaurantSearchSection = (hideSearchCard = false) => {
      const shouldShowRestaurantOptions = hideSearchCard || Boolean(selectedRestaurant);

      return (
        <VisitRestaurantSearchSection
          connectivityWarningMessage={
            !isOnline ? 'Google Places search requires internet connection.' : null
          }
          currentLocationDisabled={
            !isOnline ||
            isGettingLocation ||
            isSearchingNearbyRestaurants ||
            (isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide)
          }
          currentLocationLoading={isGettingLocation || isSearchingNearbyRestaurants}
          headerAccessory={
            hideSearchCard ? undefined : (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const shouldExpand = !isSearchExpanded;
                  setIsSearchExpanded(shouldExpand);
                  if (shouldExpand && !manualLocation.trim()) {
                    selectCurrentLocationForSearch();
                  }
                }}
                style={styles.searchHeaderButton}
                testID="process-photos-search-toggle"
              >
                <Text tone="secondary" variant="bodySm">
                  {isSearchExpanded ? 'Collapse' : 'Expand'}
                </Text>
                <Ionicons
                  color={theme.colors.text.secondary}
                  name={isSearchExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={14}
                />
              </Pressable>
            )
          }
          hideSearchCard={hideSearchCard}
          locationMetadataHintText={
            showLocationMetadataHint && captureCoordinatesLabel
              ? `Using this photo's saved location (${captureCoordinatesLabel}) to prioritize nearby restaurants.`
              : null
          }
          locationPermissionNeedsSettings={locationPermissionNeedsSettings}
          manualLocation={manualLocation}
          onClearSearchResults={clearRestaurantSearchState}
          onManualLocationChange={(value) => {
            setManualLocation(value);
            dismissCurrentPhotoLocationHint();
          }}
          onOpenLocationSettings={() => {
            void Linking.openSettings();
          }}
          onRetrySavedResults={() => {
            void triggerSavedRestaurantsRefetch();
          }}
          onSearchPress={() => {
            void handleSearchByText(!hideSearchCard);
          }}
          onSearchQueryChange={(value) => {
            setRestaurantSearchQuery(value);
            dismissCurrentPhotoLocationHint();
          }}
          onSearchQueryFocus={
            hideSearchCard
              ? undefined
              : () => {
                  openFocusedRestaurantSearch();
                }
          }
          onUseCurrentLocationPress={() => {
            void handleSearchCurrentLocationByText();
          }}
          quotaWarningMessage={
            isOnline && isPlacesQuotaReached
              ? shouldEnforceUsageLimitsClientSide
                ? 'Monthly food place search limit reached.'
                : 'Monthly food place search limit reached in preview mode. Admin access is still allowed.'
              : null
          }
          savedOptions={
            shouldShowRestaurantOptions
              ? collapsedRestaurantOptions.savedRestaurants.map((restaurant) =>
                  buildRestaurantSearchOption(restaurant, 'saved'),
                )
              : []
          }
          savedEmptyDescription={
            shouldShowRestaurantOptions
              ? savedEmptyDescription
              : 'Tap the place name field to search and choose a restaurant.'
          }
          savedResultsErrorMessage={shouldShowRestaurantOptions ? savedRestaurantsErrorMessage : null}
          savedResultsLoading={shouldShowRestaurantOptions ? savedRestaurantsLoading : false}
          savedResultsTitle={
            selectedRestaurant
              ? 'Selected restaurant'
              : shouldShowRestaurantOptions
                ? savedRestaurantsTitle
                : 'Restaurant'
          }
          searchButtonDisabled={searchButtonDisabled}
          searchButtonLabel={hideSearchCard || isSearchExpanded ? expandedSearchLabel : compactSearchLabel}
          searchButtonLoading={isSearchingRestaurants}
          searchErrorMessage={searchErrorMessage}
          searchInputsMode={isSearchExpanded ? 'full' : 'compact'}
          searchQuery={restaurantSearchQuery}
          searchResultsOptions={collapsedRestaurantOptions.searchRestaurants.map((restaurant) =>
            buildRestaurantSearchOption(restaurant, 'search'),
          )}
          searchResultsTitle={selectedRestaurant ? 'Selected restaurant' : undefined}
          showSearchResults={shouldShowRestaurantOptions && showNearbyPlaces}
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
                ? 'Free limit reached'
                : 'You are close to your free limit'
              : null
          }
        />
      );
    };

    return (
      <FeatureFormScreenScaffold
        key={`process-photo-${processType}-${currentPhoto.id}-${
          shouldShowFocusedRestaurantSearch ? 'restaurant-search' : 'form'
        }`}
        customHeader={shouldShowFocusedRestaurantSearch ? focusedRestaurantSearchHeader : undefined}
        headerBottomCompact
        headerBottomContent={shouldShowFocusedRestaurantSearch ? undefined : progressHeaderContent}
        keyboardAware
        onBackPress={() => {
          if (shouldShowFocusedRestaurantSearch) {
            closeFocusedRestaurantSearch();
            return;
          }

          if (currentPhotoIndex > 0) {
            goToProcessPhoto(currentPhotoIndex - 1);
            return;
          }
          Keyboard.dismiss();
          setStep(processType === 'restaurant' ? 'group' : 'upload');
          setErrorMessage(null);
        }}
        primaryAction={
          shouldShowFocusedRestaurantSearch
            ? undefined
            : {
                label: isLastPhoto ? 'Review' : processType === 'restaurant' ? 'Next Item' : 'Next Photo',
                onPress: handleProcessNext,
              }
        }
        scrollViewProps={{
          contentOffset: { x: 0, y: 0 },
          onContentSizeChange: resetFocusedRestaurantSearchScrollToTop,
          onScroll: handleProcessStepScroll,
          scrollEventThrottle: 16,
        }}
        scrollViewRef={processStepScrollViewRef}
        secondaryAction={
          shouldShowFocusedRestaurantSearch
            ? undefined
            : {
                label:
                  currentPhotoIndex > 0
                    ? 'Previous'
                    : processType === 'restaurant'
                      ? 'Back to Group'
                      : 'Back to Upload',
                onPress: () => {
                  if (currentPhotoIndex > 0) {
                    goToProcessPhoto(currentPhotoIndex - 1);
                    return;
                  }
                  Keyboard.dismiss();
                  setStep(processType === 'restaurant' ? 'group' : 'upload');
                  setErrorMessage(null);
                },
                variant: 'secondary',
              }
        }
        subtitle={
          processType === 'restaurant'
            ? `Item ${currentPhotoIndex + 1} of ${processUnitCount}`
            : `Photo ${currentPhotoIndex + 1} of ${processUnitCount}`
        }
        title={processType === 'restaurant' ? 'Process Saved Photos' : 'Food Product'}
      >
        {shouldShowFocusedRestaurantSearch ? (
          <View onTouchStart={dismissFocusedLocationOptions}>
            {renderRestaurantSearchSection(true)}
          </View>
        ) : (
          <>
        <PageErrorToast
          actionLabel={errorActionLabel}
          analyticsProps={buildFlowAnalyticsPayload()}
          analyticsSource="PhotoProcessingScreen"
          errorMessage={errorMessage}
          onAction={errorAction}
          title="Photo details issue"
        />
        {linkedNoteCard}

        <Card style={styles.photoPreviewCard}>
          {processType === 'restaurant' && currentRestaurantGroupPhotos.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.groupingPhotoStrip}
              contentContainerStyle={styles.groupingStripContent}
            >
              {currentRestaurantGroupPhotos.map((photo, index) => (
                <Pressable
                  accessibilityLabel={`View item photo ${index + 1}`}
                  accessibilityRole="button"
                  key={photo.id}
                  onPress={() => {
                    openPhotoViewer(index);
                  }}
                >
                  <Image source={{ uri: photo.uri }} style={styles.groupingStripImage} />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Pressable
              accessibilityLabel={
                processType === 'restaurant'
                  ? `View photos for item ${currentPhotoIndex + 1} full screen`
                  : `View photo ${currentPhotoIndex + 1} full screen`
              }
              accessibilityRole="button"
              onPress={() => {
                openPhotoViewer(0);
              }}
              testID="process-photo-preview-button"
            >
              <Image source={{ uri: currentPhoto.uri }} style={styles.largePhotoPreview} />
            </Pressable>
          )}
        </Card>

        {processType === 'restaurant' ? (
          <>
            <VisitMetadataCard
              detectedDateValue={detectedDateValue}
              dateLabel="Visit Date"
              dateModalTitle="Select visit date"
              dateValue={currentRestaurantForm?.date ?? getTodayLocalDateString()}
              onDateChange={(value) => {
                updateCurrentRestaurantForm({ date: value });
              }}
              onVisibilityChange={(value) => {
                if (value === 'friends' || value === 'private') {
                  setVisitVisibility(value);
                }
              }}
              visibilityValue={visitVisibility}
            />

            {renderRestaurantSearchSection(false)}

            {selectedRestaurant ? (
              <Card style={styles.sectionCard}>
                <Text variant="label">Menu Item</Text>
                <Text tone="secondary" variant="bodySm">
                  Select an existing item for {selectedRestaurant.name}, or create one if it is missing.
                </Text>

                <SegmentedControl
                  containerStyle={styles.menuModeControl}
                  onChange={setMenuItemMode}
                  options={[
                    { label: 'Existing Items', value: 'existing' },
                    { label: 'Create New', value: 'create' },
                  ]}
                  value={menuItemMode}
                />

                {menuItemMode === 'existing' ? (
                  <>
                    {shouldShowMenuItemSearch ? (
                      <Input
                        autoCapitalize="words"
                        containerStyle={styles.menuSearchInput}
                        onChangeText={setMenuItemSearchQuery}
                        placeholder="Search menu items..."
                        value={menuItemSearchQuery}
                      />
                    ) : null}
                    {menuItemsQuery.isLoading ? <LoadingState label="Loading menu items..." /> : null}
                    {menuItemsQuery.isError ? <Text tone="danger">Could not load menu items.</Text> : null}
                    {!menuItemsQuery.isLoading && !menuItemsQuery.isError ? (
                      displayedMenuItems.length === 0 ? (
                        <EmptyState
                          analyticsProps={buildFlowAnalyticsPayload()}
                          analyticsSource="PhotoProcessingScreen"
                          description={
                            menuItemSearchQuery.trim()
                              ? 'No matching items found. Try another search or create a new one.'
                              : 'No menu items yet. Create one to continue.'
                          }
                          title="No menu items available"
                        />
                      ) : (
                        <View style={styles.listSection}>
                          {displayedMenuItems.map((menuItem) => {
                            const isSelected =
                              (currentRestaurantForm?.menuItemId
                                ? menuItem.id === currentRestaurantForm.menuItemId
                                : normalizeSelectionLabel(menuItem.name) ===
                                  normalizeSelectionLabel(currentRestaurantForm?.menuItemName ?? ''));
                            const isSelectedUserCreated =
                              isSelected && menuItem.createdBy === currentUserId;
                            return (
                              <View key={menuItem.id} style={styles.listSection}>
                                <VisitMenuItemOptionRow
                                  compactActions={isSelectedUserCreated}
                                  description={menuItem.description}
                                  name={menuItem.name}
                                  onEditPress={
                                    isSelectedUserCreated
                                      ? () => {
                                          const nextValue = !isEditingMenuItemInline;
                                          setIsEditingMenuItemInline(nextValue);
                                          setEditingMenuItemName(menuItem.name);
                                        }
                                      : undefined
                                  }
                                  onPress={() => {
                                    handleSelectMenuItem(menuItem);
                                  }}
                                  selected={isSelected}
                                  friendEatenCount={menuItem.friendEatenCount}
                                  userEatenCount={menuItem.userEatenCount}
                                  visibility={menuItem.visibility}
                                />
                                {isSelectedUserCreated && isEditingMenuItemInline ? (
                                  <Card style={styles.sectionCard}>
                                    <Input
                                      autoCapitalize="words"
                                      label="Edit Menu Item"
                                      onChangeText={setEditingMenuItemName}
                                      placeholder="Menu item name"
                                      value={editingMenuItemName}
                                    />
                                    <View style={styles.inlineEditorActions}>
                                      <Button
                                        disabled={!editingMenuItemName.trim() || isUpdatingMenuItem || !isOnline}
                                        label="Save"
                                        loading={isUpdatingMenuItem}
                                        onPress={() => {
                                          void handleSaveInlineMenuItemEdit();
                                        }}
                                        style={styles.inlineEditorAction}
                                      />
                                      <Button
                                        label="Cancel"
                                        onPress={() => {
                                          setIsEditingMenuItemInline(false);
                                          setEditingMenuItemName(menuItem.name);
                                          setErrorMessage(null);
                                        }}
                                        style={styles.inlineEditorAction}
                                        variant="secondary"
                                      />
                                    </View>
                                  </Card>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      )
                    ) : null}
                  </>
                ) : (
                  <>
                    <Input
                      autoCapitalize="words"
                      label="Menu Item Name"
                      onChangeText={setNewMenuItemName}
                      placeholder="Enter a menu item name"
                      value={newMenuItemName}
                    />
                    {matchingMenuItemByName ? (
                      <Text tone="secondary" variant="bodySm">
                        That menu item already exists for this restaurant. Select it instead of creating a duplicate.
                      </Text>
                    ) : null}
                    {!isOnline && !matchingMenuItemByName ? (
                      <Text tone="warning">You are offline. Connect to create a new menu item.</Text>
                    ) : null}
                    <Button
                      disabled={
                        !newMenuItemName.trim() ||
                        isCreatingMenuItem ||
                        (!isOnline && !matchingMenuItemByName)
                      }
                      label={
                        matchingMenuItemByName
                          ? 'Select Existing Item'
                          : isCreatingMenuItem
                            ? 'Creating...'
                            : 'Create Menu Item'
                      }
                      loading={isCreatingMenuItem}
                      onPress={() => {
                        void handleCreateMenuItem();
                      }}
                    />
                  </>
                )}
              </Card>
            ) : null}

            {currentRestaurantForm?.menuItemName.trim() ? (
              <>
                <RatingLegend initiallyExpanded />
                <Card style={styles.sectionCard}>
                  <Text variant="label">{currentRestaurantForm.menuItemName}</Text>
                  <RatingSelector
                    onChange={(value) => {
                      updateCurrentRestaurantForm({ rating: value });
                    }}
                    value={currentRestaurantForm?.rating ?? 3}
                  />
                  <Input
                    label="Description"
                    onChangeText={(value) => {
                      updateCurrentRestaurantForm({ description: value });
                    }}
                    placeholder="Optional description or modification"
                    value={currentRestaurantForm?.description ?? ''}
                  />
                  <Input
                    inputStyle={styles.notesInput}
                    label="Notes"
                    multiline
                    onChangeText={(value) => {
                      updateCurrentRestaurantForm({ notes: value });
                    }}
                    placeholder="Optional notes"
                    value={currentRestaurantForm?.notes ?? ''}
                  />
                </Card>
              </>
            ) : null}
          </>
        ) : (
          <>
            <FoodProductFormFields
              detectedDateValue={detectedDateValue}
              onChange={updateCurrentFoodProductForm}
              value={
                currentFoodProductForm ??
                buildDefaultFoodProductForm({
                  captureDate: currentPhoto.captureDate,
                  detectedDateValue,
                })
              }
            />
          </>
        )}

        <PhotoViewerModal
          initialIndex={photoViewerInitialIndex}
          onRequestClose={closePhotoViewer}
          urls={
            processType === 'restaurant'
              ? currentRestaurantGroupPhotos.map((photo) => photo.uri)
              : [currentPhoto.uri]
          }
          visible={isPhotoViewerVisible}
        />
          </>
        )}
      </FeatureFormScreenScaffold>
    );
  }

  if (step === 'review' && processType) {
    return (
      <FeatureFormScreenScaffold
        key={`photo-processing-${processType}-review`}
        headerBottomCompact
        headerBottomContent={progressHeaderContent}
        keyboardAware={false}
        onBackPress={() => {
          setStep('process');
          setCurrentPhotoIndex(
            processType === 'restaurant'
              ? Math.max(restaurantPhotoGroups.length - 1, 0)
              : Math.max(photos.length - 1, 0),
          );
          setErrorMessage(null);
        }}
        primaryAction={{
          label: processType === 'restaurant' ? 'Submit Visits' : 'Save All Items',
          disabled: isSubmitting,
          loading: isSubmitting,
          onPress: () => {
            void handleSubmitAll();
          },
        }}
        secondaryAction={{
          label: 'Edit',
          onPress: () => {
            setStep('process');
            setCurrentPhotoIndex(
              processType === 'restaurant'
                ? Math.max(restaurantPhotoGroups.length - 1, 0)
                : Math.max(photos.length - 1, 0),
            );
            setErrorMessage(null);
          },
          variant: 'secondary',
        }}
        subtitle={
          processType === 'restaurant'
            ? `${restaurantReviewGroups.length} visit${restaurantReviewGroups.length === 1 ? '' : 's'} • ${restaurantPhotoGroups.length} item${restaurantPhotoGroups.length === 1 ? '' : 's'}`
            : `${foodProductReviewEntries.length} item${foodProductReviewEntries.length === 1 ? '' : 's'} ready to save`
        }
        title={processType === 'restaurant' ? 'Review Your Visits' : 'Review Food Products'}
      >
        {linkedNoteCard}
        <PhotoProcessingReviewStep
          errorMessage={errorMessage}
          processType={processType}
          reviewFoodProductCards={reviewFoodProductCards}
          reviewVisitCards={reviewVisitCards}
          showOfflineUsageWarning={shouldShowOfflineUsageWarning(
            isOnline,
            isDisplayFreeUser,
          )}
          visitVisibility={visitVisibility}
        />
      </FeatureFormScreenScaffold>
    );
  }

  return (
    <FeatureFormScreenScaffold
      key="photo-processing-fallback"
      keyboardAware={false}
      onBackPress={() => {
        exitMethodRef.current = 'header_back';
        navigation.goBack();
      }}
      primaryAction={{
        label: 'Back',
        onPress: () => {
          exitMethodRef.current = 'secondary_cancel';
          navigation.goBack();
        },
      }}
      title="Process Photos"
      subtitle="This route is not ready yet."
    >
      <Card>
        <Text tone="secondary">Start from Add tab to begin processing photos.</Text>
      </Card>
      <PageErrorToast
        analyticsProps={buildFlowAnalyticsPayload()}
        analyticsSource="PhotoProcessingScreen"
        errorMessage={errorMessage}
        title="Process photos issue"
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
      <Button
        label="Retry Last Source"
        onPress={() => {
          void pickPhotos(lastRequestedSource);
        }}
        variant="secondary"
      />
    </FeatureFormScreenScaffold>
  );
}
