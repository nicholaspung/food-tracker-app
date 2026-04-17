import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  Linking,
  Pressable,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

import {
  EmptyState,
  ErrorState,
  FeatureFormScreenScaffold,
  IconActionCard,
  LinkedNoteCard,
  LoadingState,
  PageErrorToast,
  PhotoSourceActionCards,
  QuickTrackFormFields,
  RatingLegend,
  RatingSelector,
  ScreenHeader,
  SegmentedControl,
  StatusPill,
  StepProgressBar,
  UpgradePromptCard,
  VisitMenuItemOptionRow,
  VisitMetadataCard,
  VisitRestaurantOptionTrailing,
  VisitRestaurantSearchSection,
  type VisitRestaurantSearchOption,
} from '../components/shared';
import {
  createCollectionRecord,
  getNoteDetail,
  getAuthenticatedUserIdOrNull,
  updateCollectionRecord,
  type MenuItemRecord,
  useMonthlyUsage,
  type RestaurantRecord,
} from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { notesQueryKeys } from '../features/store/notesQuery';
import { useImageSourcePicker } from '../hooks/useImageSourcePicker';
import { useRestaurantSelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import {
  formatDateToLocalDateString,
  getTodayLocalDateString,
} from '../lib/dateFormatting';
import {
  buildDefaultQuickTrackForm,
  resolveDefaultQuickTrackVisibility,
} from '../lib/quickTrackForm';
import {
  buildVisitRestaurantDescription,
  type VisitRestaurantWithDistance,
} from '../lib/visitRestaurantSearch';
import { shouldShowOfflineUsageWarning } from '../lib/usageUiRules';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { MenuScanPhotoProcessingScreen } from './MenuScanPhotoProcessingScreen';
import { PhotoProcessingReviewStep } from './photoProcessing/PhotoProcessingReviewStep';
import {
  buildDefaultRestaurantForm,
  formatCoordinatesForDisplay,
  FREE_MONTHLY_PHOTO_LIMIT,
  FREE_MONTHLY_PHOTO_WARNING_THRESHOLD,
  normalizeSelectionLabel,
  resolveProgressSteps,
  resolveWizardStepIndex,
  formatDraftPhotoMetadataLabel,
  type GeneralPhotoStep,
  type MenuItemMode,
  type PhotoProcessingScreenProps,
  type ProcessType,
  type RestaurantPhotoForm,
  type ScanSource,
} from './photoProcessing/shared';
import {
  cleanupHydratedNotePhotos,
  hydrateDraftPhotosFromNote,
} from './photoProcessing/notePhotoHydration';
import { usePhotoProcessingDraftState } from './photoProcessing/usePhotoProcessingDraftState';
import { usePhotoProcessingReviewData } from './photoProcessing/usePhotoProcessingReviewData';
import { usePhotoProcessingSubmission } from './photoProcessing/usePhotoProcessingSubmission';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';

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
  const currentUserId = getAuthenticatedUserIdOrNull();
  const placesQueriesRemaining = isDisplayFreeUser
    ? monthlyUsage.snapshot?.remaining.placesQueriesMonthly ?? null
    : null;
  const noteDetailQuery = useQuery({
    queryKey: sourceNoteId ? notesQueryKeys.detail(sourceNoteId) : ['feature', 'notes', 'detail', ''],
    queryFn: ({ signal }) => (sourceNoteId ? getNoteDetail(sourceNoteId, { signal }) : Promise.resolve(null)),
    enabled: isNoteDrivenFlow,
  });

  const [step, setStep] = useState<GeneralPhotoStep>('choice');
  const [processType, setProcessType] = useState<ProcessType | null>(null);
  const {
    appendAssets,
    currentPhoto,
    currentPhotoIndex,
    currentQuickTrackForm,
    currentRestaurantForm,
    dismissCurrentPhotoLocationHint,
    locationMetadataHintDismissedByPhotoId,
    photos,
    quickTrackForms,
    removePhoto,
    replacePhotos,
    resetDraftState,
    resetProcessingForms,
    restaurantForms,
    setCurrentPhotoIndex,
    setQuickTrackForms,
    setRestaurantForms,
    updateCurrentQuickTrackForm,
    updateCurrentRestaurantForm,
  } = usePhotoProcessingDraftState();
  const [visitVisibility, setVisitVisibility] = useState<'friends' | 'private'>(
    resolveDefaultQuickTrackVisibility(),
  );
  const [isQuickTrackCategoryExpanded, setIsQuickTrackCategoryExpanded] = useState(false);
  const [menuItemSearchQuery, setMenuItemSearchQuery] = useState('');
  const [menuItemMode, setMenuItemMode] = useState<MenuItemMode>('existing');
  const [newMenuItemName, setNewMenuItemName] = useState('');
  const [isEditingMenuItemInline, setIsEditingMenuItemInline] = useState(false);
  const [editingMenuItemName, setEditingMenuItemName] = useState('');
  const [isUpdatingMenuItem, setIsUpdatingMenuItem] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSelectingSource, setIsSelectingSource] = useState(false);
  const [isPreparingNotePhotos, setIsPreparingNotePhotos] = useState(false);
  const [isCreatingMenuItem, setIsCreatingMenuItem] = useState(false);
  const [lastRequestedSource, setLastRequestedSource] = useState<ScanSource>('gallery');
  const processStepScrollViewRef = useRef<KeyboardAwareScrollViewRef | null>(null);
  const { permissionNeedsSettings, pickImageAssets } = useImageSourcePicker({
    cameraBlockedMessage: 'Camera permission is blocked. Enable it in device settings.',
    cameraRequiredMessage: 'Camera permission is required to take a photo.',
    galleryBlockedMessage: 'Photo library permission is blocked. Enable it in device settings.',
    galleryRequiredMessage: 'Photo library permission is required to upload images.',
  });
  const currentRestaurantId = currentRestaurantForm?.restaurantId ?? null;
  const shouldEnableRestaurantSelectionQueries = processType === 'restaurant' && step === 'process';
  const {
    clearPlacesSearchState: clearRestaurantSearchState,
    clearSearchErrorMessage,
    compactSearchLabel,
    displayedNearbyRestaurants: allDisplayedNearbyRestaurants,
    displayedSavedRestaurants: allDisplayedSavedRestaurants,
    expandedSearchLabel,
    isGettingLocation,
    isPlacesQuotaReached,
    isSearchExpanded,
    isSearchingNearbyRestaurants,
    isSearchingRestaurants,
    loadedRestaurantRecords,
    locationPermissionNeedsSettings,
    manualLocation,
    menuItemsQuery,
    resetRestaurantSelectionFlow,
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
      if (step === 'process' || step === 'review') {
        setStep('upload');
      }
      setCurrentPhotoIndex(0);
      return;
    }

    if (currentPhotoIndex >= photos.length) {
      setCurrentPhotoIndex(photos.length - 1);
    }
  }, [currentPhotoIndex, photos.length, setCurrentPhotoIndex, step]);

  useEffect(() => {
    if (step !== 'process' || !processType || !currentPhoto) {
      return;
    }

    if (processType === 'restaurant') {
      setRestaurantForms((current) => {
        if (current[currentPhoto.id]) {
          return current;
        }

        const previousPhoto = currentPhotoIndex > 0 ? photos[currentPhotoIndex - 1] : null;
        const previousForm = previousPhoto ? current[previousPhoto.id] : undefined;

        return {
          ...current,
          [currentPhoto.id]: buildDefaultRestaurantForm(currentPhoto, previousForm),
        };
      });
      return;
    }

    setQuickTrackForms((current) => {
      if (current[currentPhoto.id]) {
        return current;
      }

      const previousPhoto = currentPhotoIndex > 0 ? photos[currentPhotoIndex - 1] : null;
      const previousForm = previousPhoto ? current[previousPhoto.id] : undefined;

      return {
        ...current,
        [currentPhoto.id]: buildDefaultQuickTrackForm({
          captureDate: currentPhoto.captureDate,
          previousForm,
        }),
      };
    });
  }, [
    currentPhoto,
    currentPhotoIndex,
    photos,
    processType,
    setQuickTrackForms,
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
  }, [currentPhoto?.id, processType, step]);

  useEffect(() => {
    if (step === 'process' && processType === 'restaurant') {
      setMenuItemMode('existing');
    }
  }, [currentPhoto?.id, processType, step]);

  useEffect(() => {
    if (step !== 'process' || processType !== 'quickTrack') {
      setIsQuickTrackCategoryExpanded(false);
      return;
    }

    setIsQuickTrackCategoryExpanded(false);
  }, [currentPhoto?.id, processType, step]);

  const resetFlowSelectionState = useCallback(() => {
    resetRestaurantSelectionFlow();
    setIsQuickTrackCategoryExpanded(false);
    setMenuItemSearchQuery('');
    setMenuItemMode('existing');
    setNewMenuItemName('');
    setIsEditingMenuItemInline(false);
    setEditingMenuItemName('');
  }, [resetRestaurantSelectionFlow]);

  const beginStandardProcessFlow = useCallback(
    (nextProcessType: ProcessType) => {
      setProcessType(nextProcessType);
      setStep('upload');
      resetDraftState();
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

  const goToProcessPhoto = useCallback(
    (nextIndex: number) => {
      Keyboard.dismiss();
      scrollProcessStepToTop();
      setCurrentPhotoIndex(nextIndex);
      setErrorMessage(null);
    },
    [scrollProcessStepToTop, setCurrentPhotoIndex],
  );

  const displayedSavedRestaurants = useMemo(() => {
    return allDisplayedSavedRestaurants.slice(0, 12);
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
    quickTrackReviewEntries,
    restaurantReviewGroups,
    reviewQuickTrackCards,
    reviewVisitCards,
  } = usePhotoProcessingReviewData({
    currentUserId,
    photos,
    quickTrackForms,
    restaurantForms,
    userName: user?.name?.trim() || undefined,
    visitVisibility,
  });

  const estimatedFreeMonthlyPhotoTotal = (monthlyUsage.snapshot?.usage.photoUploads ?? 0) + photos.length;
  const estimatedFreeMonthlyPhotoRemaining = Math.max(
    FREE_MONTHLY_PHOTO_LIMIT - estimatedFreeMonthlyPhotoTotal,
    0,
  );
  const shouldShowPhotoUpgradePrompt =
    isDisplayFreeUser &&
    estimatedFreeMonthlyPhotoRemaining <= FREE_MONTHLY_PHOTO_WARNING_THRESHOLD;
  const { handleProcessNext, handleSubmitAll, isSubmitting } =
    usePhotoProcessingSubmission({
      currentPhoto,
      currentPhotoIndex,
      currentQuickTrackForm,
      currentRestaurantForm,
      goToProcessPhoto,
      isDisplayFreeUser,
      isOnline,
      monthlyUsageSnapshot: monthlyUsage.snapshot,
      navigation,
      photos,
      processType,
      queryClient,
      quickTrackForms,
      restaurantForms,
      setErrorMessage,
      setStep,
      sourceNoteId,
      shouldEnforceUsageLimitsClientSide,
      visitVisibility,
      writeFeature,
    });

  const handleSearchByText = async (collapseAfterSearch = false) => {
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
    }
  };

  const handleSearchNearby = async () => {
    dismissCurrentPhotoLocationHint();
    const result = await runNearbyRestaurantSearch();

    if (result.status === 'quota_reached') {
      trackObservabilityEvent('USAGE_LIMIT_REACHED', {
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
    }
  };

  const handleSelectRestaurant = (restaurant: RestaurantRecord) => {
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

    return {
      description: buildVisitRestaurantDescription(restaurant, distance),
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
      setIsSelectingSource(true);
      setErrorMessage(null);
      setLastRequestedSource(source);

      try {
        const result = await pickImageAssets({
          source,
          allowsMultipleSelection: source === 'gallery',
          selectionLimit: 20,
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
        await appendAssets(result.assets);
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
    [appendAssets, pickImageAssets],
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
      const createdItem = await createCollectionRecord<MenuItemRecord>('menu_items', {
        restaurant: currentRestaurantForm.restaurantId,
        name: menuItemName,
        createdBy: currentUserId,
        visibility: 'friends',
        isFromOCR: false,
      });

      queryClient.setQueryData<MenuItemRecord[]>(
        ['feature', 'menuItems', currentRestaurantForm.restaurantId],
        (currentItems) => [createdItem, ...(currentItems ?? [])],
      );
      await queryClient.invalidateQueries({
        queryKey: ['feature', 'menuItems', currentRestaurantForm.restaurantId],
      });

      handleSelectMenuItem(createdItem);
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
      await updateCollectionRecord('menu_items', selectedMenuItem.id, {
        name: trimmedName,
      });

      queryClient.setQueryData<MenuItemRecord[]>(
        ['feature', 'menuItems', currentRestaurantForm.restaurantId],
        (currentItems) =>
          currentItems?.map((item) =>
            item.id === selectedMenuItem.id ? { ...item, name: trimmedName } : item,
          ) ?? currentItems,
      );
      await queryClient.invalidateQueries({
        queryKey: ['feature', 'menuItems', currentRestaurantForm.restaurantId],
      });

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
      currentStep={resolveWizardStepIndex(step)}
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
            navigation.goBack();
          }}
          subtitle={isNoteDrivenFlow ? 'Choose how you want to use this note.' : 'What would you like to track?'}
          title={isNoteDrivenFlow ? 'Use Note' : 'Process Photos'}
          variant="compact"
        />
        <View style={styles.choiceBody} testID={isNoteDrivenFlow ? 'note-use-choice-screen' : undefined}>
          <PageErrorToast actionLabel={errorActionLabel} errorMessage={errorMessage} onAction={errorAction} />
          {linkedNoteCard}
          <StepProgressBar
            compact
            currentStep={resolveWizardStepIndex('choice')}
            showCompletedCheckmark={false}
            steps={resolveProgressSteps(null)}
          />

          {isBlockingNotePhotoLoad ? <LoadingState label="Loading note photos..." /> : null}
          {hasBlockingNotePhotoError ? (
            <ErrorState
              description="Could not load note photos."
              onRetry={() => {
                void noteDetailQuery.refetch();
              }}
              title="Note unavailable"
            />
          ) : null}

          {!isBlockingNotePhotoLoad && !hasBlockingNotePhotoError ? (
            <>
              <IconActionCard
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
                    navigation.navigate('CreateVisit', { sourceNoteId });
                    return;
                  }

                  beginStandardProcessFlow('restaurant');
                }}
                testID={isNoteDrivenFlow ? 'note-use-choice-restaurant' : undefined}
                title="Track Restaurant Visit"
                trailing={<Ionicons color={theme.colors.text.muted} name="chevron-forward" size={20} />}
              />

              <IconActionCard
                description={
                  isNoteDrivenFlow
                    ? 'Quickly rate any item without a restaurant'
                    : 'Rate each photo as an individual item'
                }
                disabled={isPreparingNotePhotos}
                iconBackground={theme.colors.fill.success}
                iconColor={theme.colors.text.inverse}
                iconName="flash-outline"
                onPress={() => {
                  if (isNoteDrivenFlow) {
                    if (hasNotePhotos) {
                      void beginNotePhotoProcessFlow('quickTrack');
                      return;
                    }

                    setErrorMessage(null);
                    navigation.navigate('QuickTrack', {
                      returnToPrevious: true,
                      sourceNoteId,
                    });
                    return;
                  }

                  beginStandardProcessFlow('quickTrack');
                }}
                testID={isNoteDrivenFlow ? 'note-use-choice-quick-track' : undefined}
                title={isNoteDrivenFlow ? 'Quick Track Item' : 'Quick Track Items'}
                trailing={<Ionicons color={theme.colors.text.muted} name="chevron-forward" size={20} />}
              />

              {isPreparingNotePhotos ? <Text tone="secondary">Preparing note photos...</Text> : null}
            </>
          ) : null}
        </View>
      </Screen>
    );
  }

  if (step === 'upload' && processType) {
    return (
      <FeatureFormScreenScaffold
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
          errorMessage={errorMessage}
          onAction={errorAction}
          title="Photo upload issue"
        />
        {linkedNoteCard}

        {shouldShowOfflineUsageWarning(isOnline, isDisplayFreeUser) ? (
          <Card style={styles.sectionCard} tone="muted">
            <Text tone="warning">
              Offline estimate may be stale. Backend limits are enforced when sync runs.
            </Text>
          </Card>
        ) : null}

        {isDisplayFreeUser ? (
          <Card style={styles.sectionCard} tone="muted">
            <Text tone="secondary">
              Monthly photo estimate:{' '}
              {monthlyUsage.snapshot
                ? `${estimatedFreeMonthlyPhotoRemaining} left`
                : 'unknown'}.
            </Text>
          </Card>
        ) : null}

        {shouldShowPhotoUpgradePrompt ? (
          <UpgradePromptCard
            description={
              estimatedFreeMonthlyPhotoRemaining <= 0
                ? "You have reached this month's free photo limit. Subscriber accounts have higher monthly limits."
                : `Only ${estimatedFreeMonthlyPhotoRemaining} photo uploads left this month. Subscriber accounts have higher monthly limits.`
            }
            title={
              estimatedFreeMonthlyPhotoRemaining <= 0
                ? 'Free limit reached'
                : 'You are close to your free limit'
            }
          />
        ) : null}

        <Card style={styles.uploadCard}>
          <Text variant="label">Choose Photo Source</Text>
          <Text tone="secondary">Take a new photo or upload multiple saved photos.</Text>
          <PhotoSourceActionCards
            cameraSubtitle="Camera"
            cameraTitle="Take Photo"
            disabled={isSelectingSource}
            gallerySubtitle="Photo Library"
            galleryTitle="Upload Images"
            onCameraPress={() => {
              void pickPhotos('camera');
            }}
            onGalleryPress={() => {
              void pickPhotos('gallery');
            }}
          />
          {isSelectingSource ? <Text tone="secondary">Opening source picker...</Text> : null}
        </Card>

        {photos.length === 0 ? (
          <Card>
            <EmptyState description="Add photos to start processing." title="No photos selected" />
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
                        removePhoto(photo.id);
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
        )}
      </FeatureFormScreenScaffold>
    );
  }

  if (step === 'process' && processType && currentPhoto) {
    const isLastPhoto = currentPhotoIndex === photos.length - 1;
    const captureDateValue = currentPhoto.captureDate ? formatDateToLocalDateString(currentPhoto.captureDate) : null;
    const captureCoordinatesLabel = currentPhoto.captureCoordinates
      ? formatCoordinatesForDisplay(currentPhoto.captureCoordinates)
      : null;
    const showLocationMetadataHint =
      Boolean(captureCoordinatesLabel) && !locationMetadataHintDismissedByPhotoId[currentPhoto.id];

    return (
      <FeatureFormScreenScaffold
        key={`process-photo-${processType}-${currentPhoto.id}`}
        headerBottomCompact
        headerBottomContent={progressHeaderContent}
        keyboardAware
        onBackPress={() => {
          if (currentPhotoIndex > 0) {
            goToProcessPhoto(currentPhotoIndex - 1);
            return;
          }
          Keyboard.dismiss();
          setStep('upload');
          setErrorMessage(null);
        }}
        primaryAction={{
          label: isLastPhoto ? 'Review' : 'Next Photo',
          onPress: handleProcessNext,
        }}
        scrollViewProps={{
          contentOffset: { x: 0, y: 0 },
        }}
        scrollViewRef={processStepScrollViewRef}
        secondaryAction={{
          label: currentPhotoIndex > 0 ? 'Previous' : 'Back to Upload',
          onPress: () => {
            if (currentPhotoIndex > 0) {
              goToProcessPhoto(currentPhotoIndex - 1);
              return;
            }
            Keyboard.dismiss();
            setStep('upload');
            setErrorMessage(null);
          },
          variant: 'secondary',
        }}
        subtitle={`Photo ${currentPhotoIndex + 1} of ${photos.length}`}
        title={processType === 'restaurant' ? 'Process Saved Photos' : 'Quick Track Item'}
      >
        <PageErrorToast
          actionLabel={errorActionLabel}
          errorMessage={errorMessage}
          onAction={errorAction}
          title="Photo details issue"
        />
        {linkedNoteCard}

        <Card style={styles.photoPreviewCard}>
          <Image source={{ uri: currentPhoto.uri }} style={styles.largePhotoPreview} />
        </Card>

        {processType === 'restaurant' ? (
          <>
            <VisitMetadataCard
              detectedDateValue={captureDateValue}
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
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setIsSearchExpanded((currentValue) => !currentValue);
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
              }
              locationMetadataHintText={
                showLocationMetadataHint
                  ? `Using screenshot location metadata: ${captureCoordinatesLabel}. Nearby saved restaurants are shown first.`
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
                void handleSearchByText(true);
              }}
              onSearchQueryChange={(value) => {
                setRestaurantSearchQuery(value);
                dismissCurrentPhotoLocationHint();
              }}
              onUseCurrentLocationPress={() => {
                void handleSearchNearby();
              }}
              quotaWarningMessage={
                isOnline && isPlacesQuotaReached
                  ? shouldEnforceUsageLimitsClientSide
                    ? 'Monthly food place search limit reached.'
                    : 'Monthly food place search limit reached in preview mode. Admin access is still allowed.'
                  : null
              }
              savedOptions={displayedSavedRestaurants.map((restaurant) =>
                buildRestaurantSearchOption(restaurant, 'saved'),
              )}
              savedEmptyDescription={savedEmptyDescription}
              savedEmptyTitle={savedEmptyTitle}
              savedResultsErrorMessage={savedRestaurantsErrorMessage}
              savedResultsLoading={savedRestaurantsLoading}
              savedResultsTitle={savedRestaurantsTitle}
              searchButtonDisabled={searchButtonDisabled}
              searchButtonLabel={isSearchExpanded ? expandedSearchLabel : compactSearchLabel}
              searchButtonLoading={isSearchingRestaurants}
              searchErrorMessage={searchErrorMessage}
              searchInputsMode={isSearchExpanded ? 'full' : 'compact'}
              searchQuery={restaurantSearchQuery}
              searchResultsOptions={displayedNearbyRestaurants.map((restaurant) =>
                buildRestaurantSearchOption(restaurant, 'search'),
              )}
              selectedRestaurantName={selectedRestaurant?.name ?? null}
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
                    ? 'Free limit reached'
                    : 'You are close to your free limit'
                  : null
              }
            />

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
                    <Input
                      autoCapitalize="words"
                      containerStyle={styles.menuSearchInput}
                      onChangeText={setMenuItemSearchQuery}
                      placeholder="Search menu items..."
                      value={menuItemSearchQuery}
                    />
                    {menuItemsQuery.isLoading ? <LoadingState label="Loading menu items..." /> : null}
                    {menuItemsQuery.isError ? <Text tone="danger">Could not load menu items.</Text> : null}
                    {!menuItemsQuery.isLoading && !menuItemsQuery.isError ? (
                      displayedMenuItems.length === 0 ? (
                        <EmptyState
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
            <QuickTrackFormFields
              detectedDateValue={captureDateValue}
              isCategoryExpanded={isQuickTrackCategoryExpanded}
              onCategoryExpandedChange={setIsQuickTrackCategoryExpanded}
              onChange={updateCurrentQuickTrackForm}
              value={
                currentQuickTrackForm ??
                buildDefaultQuickTrackForm({
                  captureDate: currentPhoto.captureDate,
                })
              }
            />
          </>
        )}
      </FeatureFormScreenScaffold>
    );
  }

  if (step === 'review' && processType) {
    return (
      <FeatureFormScreenScaffold
        headerBottomCompact
        headerBottomContent={progressHeaderContent}
        keyboardAware={false}
        onBackPress={() => {
          setStep('process');
          setCurrentPhotoIndex(Math.max(photos.length - 1, 0));
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
            setCurrentPhotoIndex(Math.max(photos.length - 1, 0));
            setErrorMessage(null);
          },
          variant: 'secondary',
        }}
        subtitle={
          processType === 'restaurant'
            ? `${restaurantReviewGroups.length} visit${restaurantReviewGroups.length === 1 ? '' : 's'} • ${photos.length} item${photos.length === 1 ? '' : 's'}`
            : `${quickTrackReviewEntries.length} item${quickTrackReviewEntries.length === 1 ? '' : 's'} ready to save`
        }
        title={processType === 'restaurant' ? 'Review Your Visits' : 'Review Quick Track Items'}
      >
        {linkedNoteCard}
        <PhotoProcessingReviewStep
          errorMessage={errorMessage}
          estimatedFreeMonthlyPhotoRemaining={estimatedFreeMonthlyPhotoRemaining}
          processType={processType}
          reviewQuickTrackCards={reviewQuickTrackCards}
          reviewVisitCards={reviewVisitCards}
          shouldShowPhotoUpgradePrompt={shouldShowPhotoUpgradePrompt}
          showOfflineUsageWarning={shouldShowOfflineUsageWarning(
            isOnline,
            isDisplayFreeUser,
          )}
          showUsageEstimate={isDisplayFreeUser}
          usageEstimateLabel={
            monthlyUsage.snapshot
              ? `${estimatedFreeMonthlyPhotoRemaining} left`
              : 'unknown'
          }
          visitVisibility={visitVisibility}
        />
      </FeatureFormScreenScaffold>
    );
  }

  return (
    <FeatureFormScreenScaffold
      keyboardAware={false}
      onBackPress={() => {
        navigation.goBack();
      }}
      primaryAction={{
        label: 'Back',
        onPress: () => {
          navigation.goBack();
        },
      }}
      title="Process Photos"
      subtitle="This route is not ready yet."
    >
      <Card>
        <Text tone="secondary">Start from Add tab to begin processing photos.</Text>
      </Card>
      <PageErrorToast errorMessage={errorMessage} title="Process photos issue" />
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
