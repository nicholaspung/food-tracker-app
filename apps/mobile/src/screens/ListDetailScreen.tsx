import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
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
  Skeleton,
} from '../components/shared';
import {
  createDefaultRestaurantList,
  deleteRestaurantList,
  getRestaurantListDetail,
  invalidateRestaurantListCollectionQueries,
  invalidateRestaurantListContentQueries,
  invalidateRestaurantListSaveTargetQueries,
  moveRestaurantListRestaurant,
  removeRestaurantListSourceRating,
  removeRestaurantListQueries,
  removeRestaurantListUserRating,
  restaurantListQueryKeys,
  saveRestaurantFoodItemToList,
} from '../features';
import { useQueryListState } from '../hooks/useListQueryState';
import { usePullToRefreshState } from '../hooks/usePullToRefreshState';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useWriteTelemetry } from '../features/store/useWriteTelemetry';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Modal, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import {
  buildBookmarkLookupIds,
  formatMonthYearLabel,
} from './listDetail/listDetailFormatters';
import { buildOwnerDisplayItems } from './listDetail/listDetailDisplayItems';
import { ListDetailBookmarkedItemRow } from './listDetail/ListDetailBookmarkedItemRow';
import { ListDetailOwnerItemCard } from './listDetail/ListDetailOwnerItemCard';
import {
  buildBookmarkedItemPhotoEntries as buildBookmarkedPhotoEntries,
  buildOwnerItemPhotoEntries as buildOwnerPhotoEntries,
  groupListDetailPhotosByFoodItemId,
} from './listDetail/listDetailPhotoEntries';
import type {
  GroupedBookmarkedItem,
  GroupedRestaurant,
  OwnerDisplayItem,
  OwnerItemPhotoEntry,
  PendingDeleteListItem,
  SaveBookmarkTarget,
  SaveBookmarkTrackingContext,
} from './listDetail/listDetailTypes';

type ListDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'ListDetail'>;

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const trackWriteTelemetry = useWriteTelemetry();
  const queueFeatureOutbox = useFeatureOutboxQueue();
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

  const detailQuery = useQuery({
    queryKey: restaurantListQueryKeys.detail(listId),
    queryFn: ({ signal }) => getRestaurantListDetail(listId, { signal }),
  });

  const listItemsState = useQueryListState({
    data: detailQuery.data?.items,
    enabled: true,
    isError: detailQuery.isError,
    isFetching: detailQuery.isFetching,
    isLoading: detailQuery.isLoading,
    isSuccess: detailQuery.isSuccess,
  });
  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(detailQuery.isRefetching);

  const list = detailQuery.data?.list ?? null;
  const isOwner = Boolean(list && user?.id && list.userId === user.id);

  const listItems = listItemsState.items;
  const hasBlockingListItemsError = listItemsState.hasBlockingError;
  const hasListItemsRefreshError = listItemsState.hasRefreshError;
  const savedListIdsByBookmarkLookupId = useMemo(() => {
    const mapping = new Map<string, Set<string>>();
    for (const [bookmarkLookupId, rawListIds] of Object.entries(
      detailQuery.data?.bookmarkState.savedListIdsByBookmarkLookupId ?? {},
    )) {
      const listIds = mapping.get(bookmarkLookupId) ?? new Set<string>();
      for (const candidateListId of rawListIds) {
        if (!candidateListId?.trim()) {
          continue;
        }
        listIds.add(candidateListId);
      }
      mapping.set(bookmarkLookupId, listIds);
    }
    return mapping;
  }, [detailQuery.data]);

  const savedBookmarkLookupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const bookmarkLookupId of savedListIdsByBookmarkLookupId.keys()) {
      ids.add(bookmarkLookupId);
    }
    return ids;
  }, [savedListIdsByBookmarkLookupId]);

  const myLists = useMemo(() => detailQuery.data?.viewerLists ?? [], [detailQuery.data?.viewerLists]);
  const defaultList = useMemo(() => myLists.find((candidate) => candidate.isDefault), [myLists]);
  const nonDefaultLists = useMemo(() => myLists.filter((candidate) => !candidate.isDefault), [myLists]);
  const isLoadingMyLists = Boolean(saveBookmarkTarget && !isOwner && detailQuery.isLoading && myLists.length === 0);
  const alreadySavedListIdsForTarget = useMemo(() => {
    if (!saveBookmarkTarget) {
      return new Set<string>();
    }

    const listIds = new Set<string>();
    for (const bookmarkLookupId of saveBookmarkTarget.bookmarkLookupIds) {
      const existingListIds = savedListIdsByBookmarkLookupId.get(bookmarkLookupId);
      if (!existingListIds) {
        continue;
      }

      for (const listId of existingListIds) {
        listIds.add(listId);
      }
    }

    return listIds;
  }, [saveBookmarkTarget, savedListIdsByBookmarkLookupId]);

  const groupedRestaurants = useMemo<GroupedRestaurant[]>(() => {
    const groups = new Map<string, GroupedRestaurant>();

    for (const listItem of listItems ?? []) {
      const normalizedBookmarkedItems = Array.isArray(listItem.bookmarkedItems)
        ? listItem.bookmarkedItems
        : [];
      const existingGroup = groups.get(listItem.restaurantId);
      const group =
        existingGroup ??
        {
          restaurantId: listItem.restaurantId,
          restaurantName: listItem.restaurantName,
          restaurantCity: listItem.restaurantCity,
          restaurantCuisineType: listItem.restaurantCuisineType,
          restaurantVisibility: listItem.restaurantVisibility,
          notes: [],
          firstPosition: listItem.position,
          items: [],
        };

      group.firstPosition = Math.min(group.firstPosition, listItem.position);
      group.restaurantName = listItem.restaurantName;
      group.restaurantCity = listItem.restaurantCity;
      group.restaurantCuisineType = listItem.restaurantCuisineType;
      group.restaurantVisibility = listItem.restaurantVisibility;

      if (listItem.note && !group.notes.includes(listItem.note)) {
        group.notes.push(listItem.note);
      }

      for (const item of normalizedBookmarkedItems) {
        group.items.push({
          key: `${listItem.id}:${item.id}`,
          bookmarkLookupIds: buildBookmarkLookupIds(item.id, item.userFoodItemId),
          foodItemId: item.id,
          listItemId: listItem.id,
          name: item.name,
          rating: item.rating,
          visitedAt: item.visitedAt,
          sourceUserId: item.sourceUserId ?? listItem.sourceUserId,
          sourceUserName: item.sourceUserName ?? listItem.sourceUserName,
          sourceNote: listItem.note,
          userFoodItemId: item.userFoodItemId,
          userFoodItemRating: item.userFoodItemRating,
          userFoodItemVisitedAt: item.userFoodItemVisitedAt,
        });
      }

      groups.set(listItem.restaurantId, group);
    }

    return Array.from(groups.values()).sort((left, right) => left.firstPosition - right.firstPosition);
  }, [listItems]);

  const photosByFoodItemId = useMemo(
    () => groupListDetailPhotosByFoodItemId(detailQuery.data?.photoPreviews ?? []),
    [detailQuery.data],
  );

  const buildOwnerItemPhotoEntries = (item: OwnerDisplayItem): OwnerItemPhotoEntry[] =>
    buildOwnerPhotoEntries(item, photosByFoodItemId);

  const buildBookmarkedItemPhotoEntries = (item: GroupedBookmarkedItem): OwnerItemPhotoEntry[] =>
    buildBookmarkedPhotoEntries(item, photosByFoodItemId);

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

  const styles = useStyles();

  const subtitle = useMemo(() => {
    const restaurantCount = list?.restaurantCount ?? groupedRestaurants.length;
    const countLabel = `${restaurantCount} ${restaurantCount === 1 ? 'restaurant' : 'restaurants'}`;
    if (!list) {
      return countLabel;
    }

    const descriptionLabel = list.description?.trim();

    if (isOwner) {
      return descriptionLabel ? `${countLabel}\n${descriptionLabel}` : countLabel;
    }

    const ownerName = list.ownerName ?? 'Unknown user';
    const baseLabel = `${ownerName}'s list · ${countLabel}`;
    return descriptionLabel ? `${baseLabel}\n${descriptionLabel}` : baseLabel;
  }, [groupedRestaurants.length, isOwner, list]);

  const listAnalyticsContext = useMemo(
    () => ({
      source: 'ListDetailScreen',
      isDefaultList: Boolean(list?.isDefault),
      restaurantCount: list?.restaurantCount ?? groupedRestaurants.length,
    }),
    [groupedRestaurants.length, list?.isDefault, list?.restaurantCount],
  );

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Lists');
  };

  const invalidateCurrentListDetailQueries = useCallback(async () => {
    await invalidateRestaurantListContentQueries(queryClient, listId);
  }, [listId, queryClient]);

  const invalidateCurrentListMembershipQueries = useCallback(async () => {
    await invalidateRestaurantListContentQueries(queryClient, listId, {
      includeCandidateRestaurants: true,
    });
  }, [listId, queryClient]);

  const invalidateSaveTargetQueries = useCallback(async () => {
    await invalidateRestaurantListSaveTargetQueries(queryClient, listId);
  }, [listId, queryClient]);

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
      if (!isOnline) {
        await queueFeatureOutbox('list.delete', { listId: list.id });
        await invalidateRestaurantListCollectionQueries(queryClient);
        removeRestaurantListQueries(queryClient, list.id);
        setIsDeleteConfirmVisible(false);
        setIsRedirectingAfterListDelete(true);
        trackObservabilityEvent('LIST_DETAIL_DELETE_SUCCEEDED', {
          ...listAnalyticsContext,
          queued: true,
        });
        showQueuedOfflineAlert('List delete');
        navigation.replace('Lists');
        return;
      }

      await trackWriteTelemetry('list.delete');
      await deleteRestaurantList(list.id);
      await invalidateRestaurantListCollectionQueries(queryClient);
      removeRestaurantListQueries(queryClient, list.id);
      setIsDeleteConfirmVisible(false);
      setIsRedirectingAfterListDelete(true);
      trackObservabilityEvent('LIST_DETAIL_DELETE_SUCCEEDED', {
        ...listAnalyticsContext,
        queued: false,
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
  }, [isOnline, isOwner, list, listAnalyticsContext, navigation, queryClient, queueFeatureOutbox, trackWriteTelemetry]);

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

    trackObservabilityEvent('LIST_DETAIL_REORDER_TAPPED', {
      ...listAnalyticsContext,
      direction,
      isOnline,
    });
    trackObservabilityEvent('LIST_DETAIL_REORDER_STARTED', {
      ...listAnalyticsContext,
      direction,
      isOnline,
    });
    setErrorMessage(null);
    setMovingRestaurantId(restaurantId);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('list.restaurant.reorder', { listId, restaurantId, direction });
        await invalidateCurrentListDetailQueries();
        trackObservabilityEvent('LIST_DETAIL_REORDER_SUCCEEDED', {
          ...listAnalyticsContext,
          direction,
          queued: true,
        });
        showQueuedOfflineAlert('List reorder');
        return;
      }

      await trackWriteTelemetry('list.restaurant.reorder');
      await moveRestaurantListRestaurant({ listId, restaurantId, direction });
      await invalidateCurrentListDetailQueries();
      trackObservabilityEvent('LIST_DETAIL_REORDER_SUCCEEDED', {
        ...listAnalyticsContext,
        direction,
        queued: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not reorder restaurant.';
      trackObservabilityEvent('LIST_DETAIL_REORDER_FAILED', {
        ...listAnalyticsContext,
        direction,
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        isOnline,
      });
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

    trackObservabilityEvent(
      itemKind === 'source' ? 'LIST_DETAIL_SOURCE_RATING_REMOVE_TAPPED' : 'LIST_DETAIL_USER_RATING_REMOVE_TAPPED',
      {
        ...listAnalyticsContext,
        isOnline,
      },
    );
    trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_STARTED', {
      ...listAnalyticsContext,
      isOnline,
      itemKind,
    });
    setErrorMessage(null);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('list.restaurant.remove.source', {
          listId,
          listItemId: input.listItemId,
          foodItemId: input.foodItemId,
        });
        await invalidateCurrentListMembershipQueries();
        trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_SUCCEEDED', {
          ...listAnalyticsContext,
          itemKind,
          queued: true,
        });
        showQueuedOfflineAlert('List update');
        return true;
      }

      await trackWriteTelemetry('list.restaurant.remove.source');
      await removeRestaurantListSourceRating({
        listId,
        listItemId: input.listItemId,
        foodItemId: input.foodItemId,
      });
      await invalidateCurrentListMembershipQueries();
      trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_SUCCEEDED', {
        ...listAnalyticsContext,
        itemKind,
        queued: false,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not remove rating.';
      trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_FAILED', {
        ...listAnalyticsContext,
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        isOnline,
        itemKind,
      });
      setErrorMessage(message);
      return false;
    }
  };

  const handleRemoveUserRating = async (listItemId: string): Promise<boolean> => {
    if (!isOwner) {
      return false;
    }

    trackObservabilityEvent('LIST_DETAIL_USER_RATING_REMOVE_TAPPED', {
      ...listAnalyticsContext,
      isOnline,
    });
    trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_STARTED', {
      ...listAnalyticsContext,
      isOnline,
      itemKind: 'user_linked',
    });
    setErrorMessage(null);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('list.restaurant.remove.user', { listId, listItemId });
        await invalidateCurrentListMembershipQueries();
        trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_SUCCEEDED', {
          ...listAnalyticsContext,
          itemKind: 'user_linked',
          queued: true,
        });
        showQueuedOfflineAlert('List update');
        return true;
      }

      await trackWriteTelemetry('list.restaurant.remove.user');
      await removeRestaurantListUserRating(listId, listItemId);
      await invalidateCurrentListMembershipQueries();
      trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_SUCCEEDED', {
        ...listAnalyticsContext,
        itemKind: 'user_linked',
        queued: false,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not remove rating.';
      trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_FAILED', {
        ...listAnalyticsContext,
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        isOnline,
        itemKind: 'user_linked',
      });
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

    trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_STARTED', {
      source: 'ListDetailScreen',
      targetListCount: targetListIds.length,
      isOnline,
    });
    setSaveModalError(null);
    setIsSavingBookmark(true);

    try {
      if (!isOnline) {
        for (const targetListId of targetListIds) {
          await queueFeatureOutbox('list.bookmark.save', {
            listId: targetListId,
            restaurantId: saveBookmarkTarget.restaurantId,
            foodItemId: saveBookmarkTarget.foodItemId,
            note: saveBookmarkTarget.sourceNote,
            sourceUserId: list.userId,
          });
        }

        await invalidateSaveTargetQueries();
        trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_SUCCEEDED', {
          source: 'ListDetailScreen',
          entryMethod: trackingContext.entryMethod,
          queued: true,
          targetListCount: targetListIds.length,
          createdDefaultList: trackingContext.createdDefaultList,
          isOnline,
        });

        setSaveBookmarkTarget(null);
        setSelectedSaveListIds(new Set());
        setSaveModalError(null);
        showQueuedOfflineAlert('Bookmark save');
        return;
      }

      await trackWriteTelemetry('list.bookmark.save');

      for (const targetListId of targetListIds) {
        await saveRestaurantFoodItemToList({
          listId: targetListId,
          restaurantId: saveBookmarkTarget.restaurantId,
          foodItemId: saveBookmarkTarget.foodItemId,
          note: saveBookmarkTarget.sourceNote,
          sourceUserId: list.userId,
        });
      }

      await invalidateSaveTargetQueries();
      trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_SUCCEEDED', {
        source: 'ListDetailScreen',
        entryMethod: trackingContext.entryMethod,
        queued: false,
        targetListCount: targetListIds.length,
        createdDefaultList: trackingContext.createdDefaultList,
        isOnline,
      });

      setSaveBookmarkTarget(null);
      setSelectedSaveListIds(new Set());
      setSaveModalError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save this bookmark.';
      trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_FAILED', {
        source: 'ListDetailScreen',
        entryMethod: trackingContext.entryMethod,
        stage: 'bookmark_save',
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        targetListCount: targetListIds.length,
        createdDefaultList: trackingContext.createdDefaultList,
        isOnline,
      });
      setSaveModalError(message);
    } finally {
      setIsSavingBookmark(false);
    }
  };

  const handleQuickSaveToDefaultList = async () => {
    if (!saveBookmarkTarget) {
      return;
    }

    trackObservabilityEvent('LIST_DETAIL_SAVE_QUICK_DEFAULT_TAPPED', {
      source: 'ListDetailScreen',
      isOnline,
      hasDefaultList: Boolean(defaultList?.id),
    });
    let targetDefaultListId = defaultList?.id;
    if (!targetDefaultListId) {
      try {
        if (!isOnline) {
          await queueFeatureOutbox('list.default.bookmark.save', {
            restaurantId: saveBookmarkTarget.restaurantId,
            foodItemId: saveBookmarkTarget.foodItemId,
            note: saveBookmarkTarget.sourceNote,
            sourceUserId: list?.userId,
          });

          await invalidateSaveTargetQueries();
          trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_SUCCEEDED', {
            source: 'ListDetailScreen',
            entryMethod: 'quick_default',
            queued: true,
            targetListCount: 1,
            createdDefaultList: true,
            isOnline,
          });
          setSaveBookmarkTarget(null);
          setSelectedSaveListIds(new Set());
          setSaveModalError(null);
          showQueuedOfflineAlert('Saved list + bookmark');
          return;
        }

        await trackWriteTelemetry('list.default.create');
        const createdDefaultList = await createDefaultRestaurantList();
        targetDefaultListId = createdDefaultList.id;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not create your Saved list.';
        trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_FAILED', {
          source: 'ListDetailScreen',
          entryMethod: 'quick_default',
          stage: 'default_list_create',
          errorMessage: message,
          errorType: error instanceof Error ? error.name : 'unknown_error',
          targetListCount: 1,
          createdDefaultList: true,
          isOnline,
        });
        setSaveModalError(message);
        return;
      }
    }

    if (!targetDefaultListId) {
      trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_VALIDATION_FAILED', {
        source: 'ListDetailScreen',
        entryMethod: 'quick_default',
        reason: 'default_list_unavailable',
        targetListCount: 1,
        hasDefaultList: Boolean(defaultList?.id),
        isOnline,
      });
      setSaveModalError('Saved list is not available.');
      return;
    }

    if (alreadySavedListIdsForTarget.has(targetDefaultListId)) {
      trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_VALIDATION_FAILED', {
        source: 'ListDetailScreen',
        entryMethod: 'quick_default',
        reason: 'already_saved_in_default_list',
        targetListCount: 1,
        hasDefaultList: Boolean(defaultList?.id),
        isOnline,
      });
      setSaveModalError('This item is already in your Saved list.');
      return;
    }

    await saveBookmarkToLists([targetDefaultListId], {
      entryMethod: 'quick_default',
      createdDefaultList: !defaultList?.id,
    });
  };

  const handleSaveToSelectedLists = async () => {
    const targetListIds = Array.from(selectedSaveListIds).filter((targetListId) => !alreadySavedListIdsForTarget.has(targetListId));
    trackObservabilityEvent('LIST_DETAIL_SAVE_SELECTED_TAPPED', {
      source: 'ListDetailScreen',
      selectedListCount: targetListIds.length,
    });
    if (targetListIds.length === 0) {
      trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_VALIDATION_FAILED', {
        source: 'ListDetailScreen',
        entryMethod: 'selected_lists',
        reason: 'no_target_lists',
        targetListCount: 0,
        hasDefaultList: Boolean(defaultList?.id),
        isOnline,
      });
      setSaveModalError('Select at least one list.');
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
        isOwner && !list.isDefault ? (
          <View style={styles.headerRightRow}>
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
          errorMessage={saveBookmarkTarget && !isOwner && detailQuery.isError ? 'Could not load your lists.' : null}
          onAction={() => {
            void detailQuery.refetch();
          }}
          title="Lists unavailable"
        />

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
            description={
              isOwner
                ? 'Use Add Visit Ratings to List to save your first restaurant.'
                : 'No restaurants have been added to this list yet.'
            }
            tone="default"
            title="No restaurants yet"
          />
        ) : (
          groupedRestaurants.map((group, groupIndex) => {
            const primaryMetaLabel =
              group.restaurantCity || group.restaurantCuisineType || 'Location not set';
            const secondaryMetaLabel =
              group.restaurantCity && group.restaurantCuisineType
                ? group.restaurantCuisineType
                : null;
            const isRestaurantLocked = group.restaurantVisibility === 'private';
            const ownerDisplayItems = isOwner ? buildOwnerDisplayItems(group.items) : [];

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
                    ownerDisplayItems.map((item, itemIndex) => {
                      const itemPhotoEntries = buildOwnerItemPhotoEntries(item);

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
                          photoEntries={itemPhotoEntries}
                        />
                      );
                    })
                  ) : (
                    group.items.map((item, itemIndex) => {
                      const isSaved = item.bookmarkLookupIds.some((bookmarkLookupId) =>
                        savedBookmarkLookupIds.has(bookmarkLookupId),
                      );
                      const itemPhotoEntries = buildBookmarkedItemPhotoEntries(item);

                      return (
                        <ListDetailBookmarkedItemRow
                          canSave={!isRestaurantLocked}
                          groupIndex={groupIndex}
                          isSaved={isSaved}
                          item={item}
                          itemIndex={itemIndex}
                          key={item.key}
                          onOpenPhotos={openPhotoViewer}
                          onSave={(targetItem) => {
                            openSaveModal(group, targetItem);
                          }}
                          photoEntries={itemPhotoEntries}
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
