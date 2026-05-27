import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ConfirmDestructiveModal,
  EmptyState,
  ErrorState,
  ExpandableText,
  FeatureDetailScreenScaffold,
  PhotoViewerModal,
  RatingPill,
  SectionHeader,
  SegmentedControl,
  type SegmentedControlOption,
  Skeleton,
} from '../components/shared';
import { RestaurantMapView, type RestaurantMapGroup } from '../components/maps';
import {
  disableRestaurantListShareLink,
  getOrCreateRestaurantListShareLink,
  getRestaurantListDetail,
  regenerateRestaurantListShareLink,
  restaurantListQueryKeys,
  useRestaurantListWrites,
} from '../features';
import { env } from '../config/env';
import { usePullToRefreshState } from '../hooks/usePullToRefreshState';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { trackProductEvent } from '../observability/productAnalytics';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Modal, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import {
  disableShareLinkAction,
  removeSourceRatingAction,
  removeUserRatingAction,
  reorderRestaurantAction,
  saveBookmarkToDefaultListAction,
  saveBookmarkToListsAction,
  shareListLinkAction,
  trackNoSelectedSaveTarget,
  type ListDetailActionDependencies,
} from './listDetail/listDetailActions';
import { formatMonthYearLabel } from './listDetail/listDetailFormatters';
import { ListDetailBookmarkedItemRow } from './listDetail/ListDetailBookmarkedItemRow';
import { ListDetailOwnerItemCard } from './listDetail/ListDetailOwnerItemCard';
import { buildListDetailReadModel } from './listDetail/listDetailReadModel';
import type {
  GroupedBookmarkedItem,
  GroupedRestaurant,
  OwnerItemPhotoEntry,
  PendingDeleteListItem,
  SaveBookmarkTarget,
  SaveBookmarkTrackingContext,
} from './listDetail/listDetailTypes';

type ListDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'ListDetail'>;
type ListDetailViewMode = 'list' | 'map';

const LIST_DETAIL_VIEW_OPTIONS: readonly SegmentedControlOption<ListDetailViewMode>[] = [
  { label: 'List', value: 'list' },
  { label: 'Map', value: 'map' },
];

const useStyles = createThemedStyles((theme) => ({
  container: {
    gap: theme.spacing.md,
  },
  subtitleText: {
    color: theme.colors.text.secondary,
    ...theme.typography.bodyMd,
  },
  headerRightRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  headerIconButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  headerIconButtonActive: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.info,
  },
  shareStatusCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  shareStatusText: {
    color: theme.colors.text.info,
    flex: 1,
    ...theme.typography.bodyMdMedium,
  },
  addBannerButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.button.primaryBg,
    borderColor: theme.colors.button.primaryBg,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  addBannerButtonPressed: {
    backgroundColor: theme.colors.button.primaryPressed,
    borderColor: theme.colors.button.primaryPressed,
  },
  addBannerLabel: {
    color: theme.colors.button.primaryText,
    ...theme.typography.bodyLgBold,
  },
  listCard: {
    gap: theme.spacing.sm,
  },
  restaurantHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  restaurantTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  restaurantIndex: {
    color: theme.colors.text.muted,
    ...theme.typography.bodyLgMedium,
  },
  restaurantTitle: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyLgBold,
  },
  locationRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.xxs,
  },
  locationIcon: {
    flexShrink: 0,
    marginTop: 1,
  },
  locationPrimaryText: {
    color: theme.colors.text.secondary,
    flex: 1,
    minWidth: 0,
    ...theme.typography.bodyMd,
  },
  section: {
    borderTopColor: theme.colors.border.subtle,
    borderTopWidth: 1,
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
  },
  metaDot: {
    color: theme.colors.text.muted,
    ...theme.typography.bodySm,
  },
  bookmarkedDate: {
    color: theme.colors.text.muted,
    ...theme.typography.bodySm,
  },
  reorderControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  reorderButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  reorderButtonPressed: {
    backgroundColor: theme.colors.background.muted,
  },
  noteText: {
    color: theme.colors.text.secondary,
    fontStyle: 'italic',
    ...theme.typography.bodyMd,
  },
  emptyItemsText: {
    color: theme.colors.text.muted,
    ...theme.typography.label,
  },
  saveModalItemCard: {
    borderColor: theme.colors.border.info,
    gap: theme.spacing.xs,
  },
  saveModalItemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xxs,
  },
  saveModalItemName: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyLgTightBold,
  },
  saveModalCaption: {
    color: theme.colors.text.secondary,
    ...theme.typography.label,
  },
  saveListHeader: {
    marginTop: theme.spacing.xs,
  },
  saveListRows: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  saveListRow: {
    alignItems: 'center',
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 46,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  saveListRowSelected: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.info,
  },
  saveListRowDisabled: {
    backgroundColor: theme.colors.background.muted,
    opacity: 0.7,
  },
  saveListLabelWrap: {
    flex: 1,
    gap: 2,
  },
  saveListLabelTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  saveListName: {
    color: theme.colors.text.primary,
    ...theme.typography.labelMdBold,
  },
  saveListDescription: {
    color: theme.colors.text.muted,
    ...theme.typography.bodySm,
  },
  saveListAlreadyLabel: {
    color: theme.colors.text.success,
    ...theme.typography.bodySmTightSemiBold,
  },
  saveModalFooter: {
    marginTop: theme.spacing.sm,
  },
  saveModalError: {
    color: theme.colors.text.danger,
    ...theme.typography.bodySm,
  },
  viewModeControl: {
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
      width: 0,
      height: 1,
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
  mapWrap: {
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    height: 560,
    overflow: 'hidden',
  },
}));

type ListDetailStyles = ReturnType<typeof useStyles>;

interface RestaurantMetaRowProps {
  primaryMetaLabel: string;
  secondaryMetaLabel: string | null;
  iconColor: string;
  isLocked?: boolean;
  lockTestID?: string;
  styles: ListDetailStyles;
}

function RestaurantMetaRow({
  primaryMetaLabel,
  secondaryMetaLabel,
  iconColor,
  isLocked = false,
  lockTestID,
  styles,
}: RestaurantMetaRowProps) {
  const metadataLabel = secondaryMetaLabel
    ? `${primaryMetaLabel} • ${secondaryMetaLabel}`
    : primaryMetaLabel;

  return (
    <View style={styles.locationRow}>
      {isLocked ? (
        <Ionicons
          accessibilityLabel="Private restaurant"
          color={iconColor}
          name="lock-closed-outline"
          size={14}
          style={styles.locationIcon}
          testID={lockTestID}
        />
      ) : null}
      <Ionicons color={iconColor} name="location-outline" size={14} style={styles.locationIcon} />
      <Text style={styles.locationPrimaryText}>{metadataLabel}</Text>
    </View>
  );
}

export function ListDetailScreen({ navigation, route }: ListDetailScreenProps) {
  const { listId } = route.params;
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const restaurantListWrites = useRestaurantListWrites();
  const { isOnline } = useConnectivity();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeletingList, setIsDeletingList] = useState(false);
  const [isRedirectingAfterListDelete, setIsRedirectingAfterListDelete] = useState(false);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<PendingDeleteListItem | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);
  const [saveBookmarkTarget, setSaveBookmarkTarget] = useState<SaveBookmarkTarget | null>(null);
  const [selectedSaveListIds, setSelectedSaveListIds] = useState<Set<string>>(new Set());
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const [saveModalError, setSaveModalError] = useState<string | null>(null);
  const [movingRestaurantId, setMovingRestaurantId] = useState<string | null>(null);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerPreviewUrls, setPhotoViewerPreviewUrls] = useState<string[]>(
    [],
  );
  const [photoViewerOwnerLabels, setPhotoViewerOwnerLabels] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ListDetailViewMode>('list');
  const [selectedMapGroupId, setSelectedMapGroupId] = useState<string | null>(null);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [isSharingList, setIsSharingList] = useState(false);
  const [isRegeneratingShareLink, setIsRegeneratingShareLink] = useState(false);
  const [isDisablingShareLink, setIsDisablingShareLink] = useState(false);

  const detailQuery = useQuery({
    queryKey: restaurantListQueryKeys.detail(listId),
    queryFn: ({ signal }) => getRestaurantListDetail(listId, { signal }),
  });

  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(detailQuery.isRefetching);

  const readModel = useMemo(
    () =>
      buildListDetailReadModel({
        detail: detailQuery.data,
        isError: detailQuery.isError,
        isLoading: detailQuery.isLoading,
        saveBookmarkTarget,
        userId: user?.id,
      }),
    [
      detailQuery.data,
      detailQuery.isError,
      detailQuery.isLoading,
      saveBookmarkTarget,
      user?.id,
    ],
  );

  const {
    alreadySavedListIdsForTarget,
    analyticsContext: listAnalyticsContext,
    defaultList,
    groupedRestaurants,
    hasBlockingListItemsError,
    hasListItemsRefreshError,
    hasListsRefreshError,
    isLoadingMyLists,
    isOwner,
    list,
    nonDefaultLists,
    omittedMapRestaurantCount,
    restaurantRows,
    subtitle,
  } = readModel;

  const openPhotoViewer = useCallback((entries: OwnerItemPhotoEntry[], initialIndex = 0) => {
    if (entries.length === 0) {
      return;
    }

    trackObservabilityEvent('LIST_DETAIL_PHOTO_VIEWER_OPENED', {
      source: 'ListDetailScreen',
      photoCount: entries.length,
      initialIndex,
    });

    const boundedIndex = Math.max(0, Math.min(initialIndex, entries.length - 1));
    setPhotoViewerPreviewUrls(entries.map((entry) => entry.previewUrl));
    setPhotoViewerUrls(entries.map((entry) => entry.url));
    setPhotoViewerOwnerLabels(entries.map((entry) => entry.ownerLabel));
    setPhotoViewerInitialIndex(boundedIndex);
    setPhotoViewerVisible(true);
  }, []);

  const closePhotoViewer = useCallback(() => {
    setPhotoViewerVisible(false);
  }, []);

  const listDetailMapGroups = useMemo<RestaurantMapGroup[]>(() => {
    return readModel.mapGroups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        id: item.id,
        meta: item.meta,
        name: item.name,
        notes: item.notes,
        onOpenPhotos:
          item.photoEntries.length > 0
            ? () => {
                openPhotoViewer(item.photoEntries);
              }
            : undefined,
        photoCount: item.photoCount,
        photoThumbnailUrl: item.photoThumbnailUrl,
      })),
    }));
  }, [openPhotoViewer, readModel.mapGroups]);

  const styles = useStyles();

  const listDetailActionDependencies = useMemo<ListDetailActionDependencies>(
    () => ({
      analyticsContext: listAnalyticsContext,
      isOnline,
      listId,
      queryClient,
      queryKeys: restaurantListQueryKeys,
      refetchDetail: detailQuery.refetch,
      restaurantListWrites,
      share: Share.share,
      shareLinkService: {
        disable: disableRestaurantListShareLink,
        getOrCreate: getOrCreateRestaurantListShareLink,
        regenerate: regenerateRestaurantListShareLink,
      },
      shareUrlBase: env.appWebUrl,
      trackObservabilityEvent,
      trackProductEvent,
    }),
    [
      detailQuery.refetch,
      isOnline,
      listAnalyticsContext,
      listId,
      queryClient,
      restaurantListWrites,
    ],
  );

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Lists');
  };

  const shareListLink = async (mode: 'create' | 'regenerate' = 'create') => {
    if (!list || !isOwner) {
      return;
    }

    const isRegenerate = mode === 'regenerate';
    if (isRegenerate) {
      setIsRegeneratingShareLink(true);
    } else {
      setIsSharingList(true);
    }
    setErrorMessage(null);

    try {
      await shareListLinkAction({
        deps: listDetailActionDependencies,
        isOwner,
        list,
        mode,
      });
      setShareSheetVisible(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not share list.');
    } finally {
      if (isRegenerate) {
        setIsRegeneratingShareLink(false);
      } else {
        setIsSharingList(false);
      }
    }
  };

  const disableShareLink = async () => {
    if (!list || !isOwner) {
      return;
    }

    setIsDisablingShareLink(true);
    setErrorMessage(null);
    try {
      await disableShareLinkAction({
        deps: listDetailActionDependencies,
        isOwner,
        list,
      });
      setShareSheetVisible(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not disable sharing.');
    } finally {
      setIsDisablingShareLink(false);
    }
  };

  const deleteList = useCallback(async () => {
    if (!list || !isOwner || list.isDefault) {
      return;
    }

    trackObservabilityEvent('LIST_DETAIL_DELETE_CONFIRMED', {
      ...listAnalyticsContext,
      isOnline,
    });
    trackObservabilityEvent('LIST_DETAIL_DELETE_STARTED', {
      ...listAnalyticsContext,
      isOnline,
    });
    setErrorMessage(null);
    setIsDeletingList(true);

    try {
      const result = await restaurantListWrites.deleteRestaurantList({ listId: list.id });
      setIsDeleteConfirmVisible(false);
      setIsRedirectingAfterListDelete(true);
      trackObservabilityEvent('LIST_DETAIL_DELETE_SUCCEEDED', {
        ...listAnalyticsContext,
        queued: result.status === 'queued',
      });
      navigation.replace('Lists');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete list.';
      trackObservabilityEvent('LIST_DETAIL_DELETE_FAILED', {
        ...listAnalyticsContext,
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        isOnline,
      });
      setErrorMessage(message);
    } finally {
      setIsDeletingList(false);
    }
  }, [isOnline, isOwner, list, listAnalyticsContext, navigation, restaurantListWrites]);

  const confirmDeleteList = () => {
    if (!list || !isOwner) {
      return;
    }

    trackObservabilityEvent('LIST_DETAIL_DELETE_TAPPED', {
      ...listAnalyticsContext,
    });
    if (list.isDefault) {
      trackObservabilityEvent('LIST_DETAIL_DELETE_VALIDATION_FAILED', {
        ...listAnalyticsContext,
        reason: 'default_list',
      });
      setErrorMessage('The Saved list cannot be deleted.');
      return;
    }

    setIsDeleteConfirmVisible(true);
  };

  const handleMoveRestaurant = async (restaurantId: string, direction: 'up' | 'down') => {
    if (!isOwner || movingRestaurantId) {
      return;
    }

    setErrorMessage(null);
    setMovingRestaurantId(restaurantId);

    try {
      await reorderRestaurantAction({
        deps: listDetailActionDependencies,
        isOwner,
        restaurantId,
        direction,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not reorder restaurant.';
      setErrorMessage(message);
    } finally {
      setMovingRestaurantId(null);
    }
  };

  const handleRemoveSourceRating = async (
    input: { listItemId: string; foodItemId: string },
    itemKind: 'source' | 'user_standalone' = 'source',
  ): Promise<boolean> => {
    if (!isOwner) {
      return false;
    }

    setErrorMessage(null);

    try {
      await removeSourceRatingAction({
        deps: listDetailActionDependencies,
        isOwner,
        listItemId: input.listItemId,
        foodItemId: input.foodItemId,
        itemKind,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not remove rating.';
      setErrorMessage(message);
      return false;
    }
  };

  const handleRemoveUserRating = async (listItemId: string): Promise<boolean> => {
    if (!isOwner) {
      return false;
    }

    setErrorMessage(null);

    try {
      await removeUserRatingAction({
        deps: listDetailActionDependencies,
        isOwner,
        listItemId,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not remove rating.';
      setErrorMessage(message);
      return false;
    }
  };

  const confirmDeleteItem = (item: PendingDeleteListItem) => {
    if (!isOwner) {
      return;
    }

    setPendingDeleteItem(item);
  };

  const closeDeleteItemModal = () => {
    if (isDeletingItem) {
      return;
    }

    setPendingDeleteItem(null);
  };

  const handleConfirmDeleteItem = async () => {
    if (!pendingDeleteItem || isDeletingItem) {
      return;
    }

    setIsDeletingItem(true);

    try {
      const didDelete =
        pendingDeleteItem.kind === 'source'
          ? await handleRemoveSourceRating({
              listItemId: pendingDeleteItem.listItemId,
              foodItemId: pendingDeleteItem.foodItemId,
            })
          : pendingDeleteItem.kind === 'user-linked'
            ? await handleRemoveUserRating(pendingDeleteItem.listItemId)
            : await handleRemoveSourceRating({
                listItemId: pendingDeleteItem.listItemId,
                foodItemId: pendingDeleteItem.foodItemId,
              }, 'user_standalone');

      if (didDelete) {
        setPendingDeleteItem(null);
      }
    } finally {
      setIsDeletingItem(false);
    }
  };

  const handleIWentThere = (
    group: GroupedRestaurant,
    item: { listItemId: string; name: string },
  ) => {
    trackObservabilityEvent('LIST_DETAIL_I_WENT_TAPPED', {
      source: 'ListDetailScreen',
      restaurantId: group.restaurantId,
    });
    trackProductEvent('social.i_went_there_started', {
      source: 'ListDetailScreen',
      entryType: 'restaurant_visit',
      hasRating: true,
    });
    trackProductEvent('tracking.entry_started', {
      entryType: 'restaurant_visit',
      source: 'list',
      hasPhoto: false,
      itemCount: 1,
      ratingCount: 1,
      completed: false,
    });
    navigation.navigate('CreateVisit', {
      preselectedRestaurantId: group.restaurantId,
      preselectedRestaurantName: group.restaurantName,
      preselectedMenuItemId: `bookmark-${item.listItemId}`,
      preselectedMenuItemName: item.name,
      sourceListId: route.params.listId,
      sourceListItemId: item.listItemId,
      returnToStep: 2,
    });
  };

  const openSaveModal = (group: GroupedRestaurant, item: GroupedBookmarkedItem) => {
    trackObservabilityEvent('LIST_DETAIL_SAVE_MODAL_OPENED', {
      source: 'ListDetailScreen',
      restaurantId: group.restaurantId,
      hasSourceUser: Boolean(item.sourceUserId || item.sourceUserName),
    });
    setSaveModalError(null);
    setSelectedSaveListIds(new Set());
    setSaveBookmarkTarget({
      bookmarkLookupIds: item.bookmarkLookupIds,
      restaurantId: group.restaurantId,
      restaurantName: group.restaurantName,
      foodItemId: item.foodItemId,
      foodItemName: item.name,
      foodItemRating: item.rating,
      visitedAt: item.visitedAt,
      sourceNote: item.sourceNote,
    });
  };

  const closeSaveModal = () => {
    if (isSavingBookmark) {
      return;
    }

    setSaveBookmarkTarget(null);
    setSelectedSaveListIds(new Set());
    setSaveModalError(null);
  };

  const toggleSaveListSelection = (selectedListId: string) => {
    if (alreadySavedListIdsForTarget.has(selectedListId)) {
      return;
    }

    setSelectedSaveListIds((previousValue) => {
      const nextValue = new Set(previousValue);
      if (nextValue.has(selectedListId)) {
        nextValue.delete(selectedListId);
      } else {
        nextValue.add(selectedListId);
      }
      return nextValue;
    });
  };

  const saveBookmarkToLists = async (
    targetListIds: string[],
    trackingContext: SaveBookmarkTrackingContext,
  ) => {
    if (!saveBookmarkTarget || !list || targetListIds.length === 0) {
      return;
    }

    setSaveModalError(null);
    setIsSavingBookmark(true);

    try {
      const result = await saveBookmarkToListsAction({
        deps: listDetailActionDependencies,
        isOwner,
        list,
        saveBookmarkTarget,
        targetListIds,
        trackingContext,
      });
      if (result.saved) {
        setSaveBookmarkTarget(null);
        setSelectedSaveListIds(new Set());
        setSaveModalError(null);
      } else if (result.errorMessage) {
        setSaveModalError(result.errorMessage);
      }
    } finally {
      setIsSavingBookmark(false);
    }
  };

  const handleQuickSaveToDefaultList = async () => {
    if (!saveBookmarkTarget) {
      return;
    }

    setSaveModalError(null);
    setIsSavingBookmark(true);

    try {
      const result = await saveBookmarkToDefaultListAction({
        alreadySavedListIdsForTarget,
        defaultList,
        deps: listDetailActionDependencies,
        isOwner,
        list,
        saveBookmarkTarget,
      });
      if (result.saved) {
        setSaveBookmarkTarget(null);
        setSelectedSaveListIds(new Set());
        setSaveModalError(null);
      } else if (result.errorMessage) {
        setSaveModalError(result.errorMessage);
      }
    } finally {
      setIsSavingBookmark(false);
    }
  };

  const handleSaveToSelectedLists = async () => {
    const targetListIds = Array.from(selectedSaveListIds).filter((targetListId) => !alreadySavedListIdsForTarget.has(targetListId));
    trackObservabilityEvent('LIST_DETAIL_SAVE_SELECTED_TAPPED', {
      source: 'ListDetailScreen',
      selectedListCount: targetListIds.length,
    });
    if (targetListIds.length === 0) {
      setSaveModalError(
        trackNoSelectedSaveTarget(listDetailActionDependencies, {
          hasDefaultList: Boolean(defaultList?.id),
        }),
      );
      return;
    }

    await saveBookmarkToLists(targetListIds, {
      entryMethod: 'selected_lists',
      createdDefaultList: false,
    });
  };
  const handleRefresh = useCallback(async () => {
    await runPullRefresh(async () => {
      await detailQuery.refetch();
    });
  }, [detailQuery, runPullRefresh]);

  if (detailQuery.isLoading) {
    return (
      <FeatureDetailScreenScaffold headerScrollMode="fixed" onBackPress={handleBack} title="List">
        <Skeleton height={20} />
        <Skeleton height={20} />
      </FeatureDetailScreenScaffold>
    );
  }

  if (isRedirectingAfterListDelete) {
    return (
      <FeatureDetailScreenScaffold headerScrollMode="fixed" onBackPress={handleBack} title="List">
        <Skeleton height={20} />
        <Skeleton height={20} />
      </FeatureDetailScreenScaffold>
    );
  }

  if (hasBlockingListItemsError) {
    return (
      <FeatureDetailScreenScaffold headerScrollMode="fixed" onBackPress={handleBack} title="List">
        <ErrorState
          description="Could not load list detail."
          onRetry={() => {
            void detailQuery.refetch();
          }}
          title="List detail unavailable"
        />
      </FeatureDetailScreenScaffold>
    );
  }

  if (!list) {
    return (
      <FeatureDetailScreenScaffold headerScrollMode="fixed" onBackPress={handleBack} title="List">
        <EmptyState
          actionLabel="Back to Lists"
          onAction={handleBack}
          title="List not found"
        />
      </FeatureDetailScreenScaffold>
    );
  }

  return (
    <FeatureDetailScreenScaffold
      headerScrollMode="fixed"
      onRefresh={handleRefresh}
      onBackPress={handleBack}
      refreshing={isPullRefreshing}
      rightAccessory={
        isOwner ? (
          <View style={styles.headerRightRow}>
            <Pressable
              accessibilityLabel="Share list"
              accessibilityRole="button"
              onPress={() => {
                trackObservabilityEvent('LIST_SHARE_LINK_TAPPED', {
                  source: 'ListDetailScreen',
                });
                setShareSheetVisible(true);
              }}
              style={[styles.headerIconButton, list.shareEnabled ? styles.headerIconButtonActive : null]}
              testID="list-detail-share-button"
            >
              <Ionicons
                color={list.shareEnabled ? theme.colors.text.info : theme.colors.text.primary}
                name={list.shareEnabled ? 'link-outline' : 'share-outline'}
                size={16}
              />
            </Pressable>
            {!list.isDefault ? (
              <>
                <Pressable
                  accessibilityLabel="Edit list"
                  accessibilityRole="button"
                  onPress={() => {
                    trackObservabilityEvent('LIST_DETAIL_EDIT_TAPPED', {
                      source: 'ListDetailScreen',
                    });
                    navigation.navigate('EditRestaurantList', { listId });
                  }}
                  style={styles.headerIconButton}
                  testID="list-detail-edit-button"
                >
                  <Ionicons color={theme.colors.text.primary} name="create-outline" size={16} />
                </Pressable>
                <Pressable
                  accessibilityLabel="Delete list"
                  accessibilityRole="button"
                  disabled={isDeletingList}
                  onPress={confirmDeleteList}
                  style={styles.headerIconButton}
                  testID="list-detail-delete-button"
                >
                  <Ionicons color={theme.colors.text.danger} name="trash-outline" size={16} />
                </Pressable>
              </>
            ) : null}
          </View>
        ) : undefined
      }
      subtitle={subtitle}
      testID="list-detail-screen"
      title={list.name}
    >
      <View style={styles.container}>
        <PageErrorToast errorMessage={errorMessage} title="List update failed" />
        <PageErrorToast
          actionLabel="Retry"
          errorMessage={hasListItemsRefreshError ? 'Could not refresh list detail. Showing saved data.' : null}
          onAction={() => {
            void detailQuery.refetch();
          }}
          title="List detail unavailable"
        />
        <PageErrorToast
          actionLabel="Retry"
          errorMessage={hasListsRefreshError ? 'Could not load your lists.' : null}
          onAction={() => {
            void detailQuery.refetch();
          }}
          title="Lists unavailable"
        />

        {isOwner && list.shareEnabled ? (
          <Card style={styles.shareStatusCard} testID="list-detail-share-enabled-indicator" tone="info">
            <Ionicons color={theme.colors.text.info} name="link-outline" size={16} />
            <Text style={styles.shareStatusText}>Shared by secret link</Text>
          </Card>
        ) : null}

        <SegmentedControl
          activeLabelStyle={styles.viewModeLabelActive}
          activeSegmentStyle={styles.viewModeSegmentActive}
          containerStyle={styles.viewModeControl}
          getOptionTestID={(value) => `list-detail-view-mode-${value}`}
          labelStyle={styles.viewModeLabel}
          onChange={(nextViewMode) => {
            setViewMode(nextViewMode);
            setSelectedMapGroupId(null);
          }}
          options={LIST_DETAIL_VIEW_OPTIONS}
          segmentStyle={styles.viewModeSegment}
          value={viewMode}
        />

        {viewMode === 'map' ? (
          <RestaurantMapView
            analyticsSource="ListDetailMapView"
            emptyDescription="Restaurants need a saved location before they can appear here."
            emptyTitle="No map locations yet"
            errorMessage={null}
            groups={listDetailMapGroups}
            hiddenLocationPluralLabel="restaurants"
            hiddenLocationSingularLabel="restaurant"
            loading={false}
            mapTestID="list-detail-map"
            omittedWithoutCoordinates={omittedMapRestaurantCount}
            onRetry={() => {
              void detailQuery.refetch();
            }}
            onSelectedGroupChange={setSelectedMapGroupId}
            selectedGroupId={selectedMapGroupId}
            style={styles.mapWrap}
            testID="list-detail-map-view"
          />
        ) : (
          <>
            {isOwner ? (
              <Pressable
                accessibilityLabel="Add restaurant to list"
                accessibilityRole="button"
                onPress={() => {
                  trackObservabilityEvent('LIST_DETAIL_ADD_RESTAURANT_TAPPED', {
                    source: 'ListDetailScreen',
                  });
                  navigation.navigate('AddRestaurantToList', { listId });
                }}
                style={({ pressed }) => [styles.addBannerButton, pressed && styles.addBannerButtonPressed]}
                testID="add-restaurant-banner"
              >
                <Ionicons color={theme.colors.button.primaryText} name="add-outline" size={20} />
                <Text style={styles.addBannerLabel}>Add Visit Ratings to List</Text>
              </Pressable>
            ) : null}

            {groupedRestaurants.length === 0 ? (
              <EmptyState
                description={readModel.emptyRestaurantsDescription}
                tone="default"
                title="No restaurants yet"
              />
            ) : (
              restaurantRows.map((row) => {
                const { group, groupIndex, isRestaurantLocked, primaryMetaLabel, secondaryMetaLabel } = row;

                return (
                  <Card key={group.restaurantId} style={styles.listCard} tone="default">
                    <View style={styles.restaurantHeaderRow}>
                      <View style={styles.restaurantTitleRow}>
                        <Text style={styles.restaurantIndex}>{`${groupIndex + 1}.`}</Text>
                        <Text style={styles.restaurantTitle}>{group.restaurantName}</Text>
                      </View>
                      {isOwner ? (
                        <View style={styles.reorderControls}>
                          {groupIndex > 0 ? (
                            <Pressable
                              accessibilityLabel={`Move ${group.restaurantName} up`}
                              accessibilityRole="button"
                              disabled={Boolean(movingRestaurantId)}
                              onPress={() => {
                                void handleMoveRestaurant(group.restaurantId, 'up');
                              }}
                              style={({ pressed }) => [styles.reorderButton, pressed && styles.reorderButtonPressed]}
                              testID={`move-restaurant-up-${group.restaurantId}`}
                            >
                              <Ionicons color={theme.colors.text.primary} name="chevron-up" size={14} />
                            </Pressable>
                          ) : null}
                          {groupIndex < groupedRestaurants.length - 1 ? (
                            <Pressable
                              accessibilityLabel={`Move ${group.restaurantName} down`}
                              accessibilityRole="button"
                              disabled={Boolean(movingRestaurantId)}
                              onPress={() => {
                                void handleMoveRestaurant(group.restaurantId, 'down');
                              }}
                              style={({ pressed }) => [styles.reorderButton, pressed && styles.reorderButtonPressed]}
                              testID={`move-restaurant-down-${group.restaurantId}`}
                            >
                              <Ionicons color={theme.colors.text.primary} name="chevron-down" size={14} />
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>

                    <RestaurantMetaRow
                      iconColor={theme.colors.text.muted}
                      isLocked={isRestaurantLocked}
                      lockTestID={`locked-restaurant-${group.restaurantId}`}
                      primaryMetaLabel={primaryMetaLabel}
                      secondaryMetaLabel={secondaryMetaLabel}
                      styles={styles}
                    />

                    <View style={styles.section}>
                      <SectionHeader
                        title={isOwner ? 'Bookmarked Items' : 'Recommended Items'}
                        titleTone="secondary"
                      />
                      {group.items.length === 0 ? (
                        <Text style={styles.emptyItemsText}>No items added yet.</Text>
                      ) : isOwner ? (
                        row.ownerItems.map((item, itemIndex) => {
                          return (
                            <ListDetailOwnerItemCard
                              canCreateVisitFromRestaurant={!isRestaurantLocked}
                              groupIndex={groupIndex}
                              item={item}
                              itemIndex={itemIndex}
                              key={item.key}
                              onConfirmDeleteItem={confirmDeleteItem}
                              onIWentThere={(input) => {
                                handleIWentThere(group, input);
                              }}
                              onOpenPhotos={openPhotoViewer}
                              photoEntries={item.photoEntries}
                            />
                          );
                        })
                      ) : (
                        row.bookmarkedItems.map((item, itemIndex) => {
                          return (
                            <ListDetailBookmarkedItemRow
                              canSave={!isRestaurantLocked}
                              groupIndex={groupIndex}
                              isSaved={item.isSaved}
                              item={item}
                              itemIndex={itemIndex}
                              key={item.key}
                              onOpenPhotos={openPhotoViewer}
                              onSave={(targetItem) => {
                                openSaveModal(group, targetItem);
                              }}
                              photoEntries={item.photoEntries}
                            />
                          );
                        })
                      )}
                    </View>

                    {group.notes.length > 0 ? (
                      <View style={styles.section}>
                        <SectionHeader title="Notes" titleTone="secondary" />
                        {group.notes.map((note, noteIndex) => (
                          <Text key={`${group.restaurantId}-note-${noteIndex}`} style={styles.noteText}>
                            "{note}"
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}
          </>
        )}

      </View>

      <PhotoViewerModal
        initialIndex={photoViewerInitialIndex}
        onRequestClose={closePhotoViewer}
        ownerLabels={photoViewerOwnerLabels}
        previewUrls={photoViewerPreviewUrls}
        urls={photoViewerUrls}
        visible={photoViewerVisible}
      />

      <ConfirmDestructiveModal
        cancelLabel="Keep List"
        confirmLabel="Delete List"
        description={list ? `Delete "${list.name}" and all of its saved restaurants?` : 'Delete this list?'}
        loading={isDeletingList}
        onCancel={() => {
          if (isDeletingList) {
            return;
          }
          setIsDeleteConfirmVisible(false);
        }}
        onConfirm={() => {
          void deleteList();
        }}
        testID="delete-list-confirmation-modal"
        title="Delete List?"
        visible={isDeleteConfirmVisible}
      />

      <Modal
        description={
          list?.shareEnabled
            ? 'This list is available to anyone with the secret link. You can share, regenerate, or disable it.'
            : 'Create a secret link so anyone with the link can view a read-only version of this list.'
        }
        onRequestClose={() => {
          if (isSharingList || isRegeneratingShareLink || isDisablingShareLink) {
            return;
          }
          setShareSheetVisible(false);
        }}
        primaryAction={{
          disabled: isRegeneratingShareLink || isDisablingShareLink,
          label: list?.shareEnabled ? 'Share Link' : 'Enable & Share Link',
          loading: isSharingList,
          onPress: () => {
            void shareListLink();
          },
          testID: 'share-list-link-button',
        }}
        secondaryAction={{
          disabled: isSharingList || isRegeneratingShareLink || isDisablingShareLink,
          label: 'Cancel',
          onPress: () => {
            setShareSheetVisible(false);
          },
        }}
        testID="share-list-modal"
        title="Share List"
        visible={shareSheetVisible}
      >
        {list?.shareEnabled ? (
          <>
            <Button
              disabled={isSharingList || isDisablingShareLink}
              label="Regenerate Link"
              loading={isRegeneratingShareLink}
              onPress={() => {
                void shareListLink('regenerate');
              }}
              testID="regenerate-share-list-link-button"
              variant="secondary"
            />
            <Button
              disabled={isSharingList || isRegeneratingShareLink}
              label="Disable Sharing"
              loading={isDisablingShareLink}
              onPress={() => {
                void disableShareLink();
              }}
              testID="disable-share-list-link-button"
              variant="secondary"
            />
          </>
        ) : null}
      </Modal>

      <ConfirmDestructiveModal
        cancelLabel="Keep Item"
        confirmLabel="Delete Item"
        confirmLoadingLabel="Deleting..."
        description={
          pendingDeleteItem
            ? pendingDeleteItem.kind === 'source'
              ? `Delete "${pendingDeleteItem.itemName}" from this list?`
              : `Delete your rating for "${pendingDeleteItem.itemName}" from this list?`
            : 'Delete this item from the list?'
        }
        loading={isDeletingItem}
        onCancel={closeDeleteItemModal}
        onConfirm={() => {
          void handleConfirmDeleteItem();
        }}
        testID="delete-list-item-confirmation-modal"
        title={pendingDeleteItem?.kind === 'source' ? 'Delete Bookmarked Item?' : 'Delete Rating?'}
        visible={Boolean(pendingDeleteItem)}
      />

      <Modal
        description="Choose where to save this bookmarked item."
        onRequestClose={closeSaveModal}
        primaryAction={{
          disabled: isSavingBookmark || selectedSaveListIds.size === 0,
          label:
            selectedSaveListIds.size === 1
              ? 'Save to 1 list'
              : `Save to ${selectedSaveListIds.size} lists`,
          loading: isSavingBookmark,
          onPress: () => {
            void handleSaveToSelectedLists();
          },
        }}
        secondaryAction={{
          disabled: isSavingBookmark,
          label: 'Cancel',
          onPress: closeSaveModal,
        }}
        title={saveBookmarkTarget ? `Save from "${saveBookmarkTarget.restaurantName}"` : undefined}
        visible={Boolean(saveBookmarkTarget)}
      >
        {saveBookmarkTarget ? (
          <Card style={styles.saveModalItemCard} tone="info">
            <Text style={styles.saveModalCaption}>Selected item</Text>
            <View style={styles.saveModalItemRow}>
              <Text style={styles.saveModalItemName}>{saveBookmarkTarget.foodItemName}</Text>
              <Text style={styles.metaDot}>•</Text>
              <RatingPill rating={saveBookmarkTarget.foodItemRating} />
              {formatMonthYearLabel(saveBookmarkTarget.visitedAt) ? (
                <>
                  <Text style={styles.metaDot}>•</Text>
                  <Text style={styles.bookmarkedDate}>{formatMonthYearLabel(saveBookmarkTarget.visitedAt)}</Text>
                </>
              ) : null}
            </View>
          </Card>
        ) : null}

        <Button
          disabled={
            isSavingBookmark ||
            !saveBookmarkTarget ||
            isLoadingMyLists ||
            Boolean(defaultList?.id && alreadySavedListIdsForTarget.has(defaultList.id))
          }
          label={
            isLoadingMyLists
              ? 'Loading your lists...'
              : defaultList?.id && alreadySavedListIdsForTarget.has(defaultList.id)
              ? 'Already in "Saved" list'
              : defaultList
                ? 'Quick Save to "Saved" list'
                : 'Create & Save to "Saved" list'
          }
          onPress={() => {
            void handleQuickSaveToDefaultList();
          }}
          variant="secondary"
        />

        {isLoadingMyLists ? (
          <Text tone="secondary">Loading your lists...</Text>
        ) : nonDefaultLists.length > 0 ? (
          <>
            <SectionHeader style={styles.saveListHeader} title="Or choose lists" titleTone="secondary" />
            <View style={styles.saveListRows}>
              {nonDefaultLists.map((targetList) => {
                const alreadySavedInList = alreadySavedListIdsForTarget.has(targetList.id);
                const isSelected = selectedSaveListIds.has(targetList.id);
                const visibilityIconName =
                  targetList.visibility === 'friends' ? 'people-outline' : 'lock-closed-outline';

                return (
                  <Pressable
                    accessibilityRole="button"
                    disabled={alreadySavedInList}
                    key={targetList.id}
                    onPress={() => {
                      toggleSaveListSelection(targetList.id);
                    }}
                    style={[
                      styles.saveListRow,
                      isSelected ? styles.saveListRowSelected : null,
                      alreadySavedInList ? styles.saveListRowDisabled : null,
                    ]}
                  >
                    <Ionicons
                      color={alreadySavedInList ? theme.colors.text.success : theme.colors.text.muted}
                      name={alreadySavedInList || isSelected ? 'checkbox' : 'square-outline'}
                      size={20}
                    />
                    <View style={styles.saveListLabelWrap}>
                      <View style={styles.saveListLabelTop}>
                        <Text style={styles.saveListName}>{targetList.name}</Text>
                        <Ionicons color={theme.colors.text.muted} name={visibilityIconName} size={13} />
                      </View>
                      {targetList.description ? (
                        <ExpandableText
                          collapsedNumberOfLines={1}
                          interactionMode="inline-toggle"
                          stopPropagationOnToggle
                          style={styles.saveListDescription}
                        >
                          {targetList.description}
                        </ExpandableText>
                      ) : null}
                      {alreadySavedInList ? <Text style={styles.saveListAlreadyLabel}>Already saved in this list</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <SectionHeader
            style={styles.saveListHeader}
            title="No additional lists yet. Use quick save or create a list."
            titleTone="secondary"
          />
        )}

        {saveModalError ? <Text style={styles.saveModalError}>{saveModalError}</Text> : null}
      </Modal>
    </FeatureDetailScreenScaffold>
  );
}
