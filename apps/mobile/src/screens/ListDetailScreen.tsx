import { Ionicons } from '../ui/AppIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Keyboard, Pressable, Share, Switch, TextInput, View } from 'react-native';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ConfirmDestructiveModal,
  EmptyState,
  ErrorState,
  FeatureDetailScreenScaffold,
  PhotoViewerModal,
  SegmentedControl,
  type SegmentedControlOption,
  Skeleton,
} from '../components/shared';
import { RestaurantMapView, type RestaurantMapGroup } from '../components/maps';
import {
  disableRestaurantListShareLink,
  getOrCreateRestaurantListShareLink,
  getRestaurantListDetail,
  listRestaurantListsPage,
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
import { createPlatformShadow } from '../theme/shadows';
import { Button, Modal, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import {
  disableShareLinkAction,
  removeSourceRatingAction,
  removeUserRatingAction,
  reorderRestaurantAction,
  saveBookmarkToDefaultListAction,
  shareListLinkAction,
  type ListDetailActionDependencies,
} from './listDetail/listDetailActions';
import { ListDetailBookmarkedItemRow } from './listDetail/ListDetailBookmarkedItemRow';
import { ListDetailOwnerItemCard } from './listDetail/ListDetailOwnerItemCard';
import { ListItemTransferModal } from './listDetail/ListItemTransferModal';
import { ListDetailRestaurantRecommendationGroupCard } from './listDetail/ListDetailRestaurantRecommendationGroupCard';
import { ListDetailWantToTryBookmarkCard } from './listDetail/ListDetailWantToTryBookmarkCard';
import { ListDetailWantToTryMenuItemRow } from './listDetail/ListDetailWantToTryMenuItemRow';
import { buildListDetailReadModel } from './listDetail/listDetailReadModel';
import type {
  GroupedBookmarkedItem,
  GroupedRestaurant,
  OwnerDisplayItem,
  OwnerItemPhotoEntry,
  PendingListItemTransferTarget,
  PendingDeleteListItem,
  SaveBookmarkTarget,
} from './listDetail/listDetailTypes';

type ListDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'ListDetail'>;
type ListDetailViewMode = 'list' | 'map';
type LocallyRemovedListItemKey =
  | `restaurant-bookmark:${string}`
  | `menu-bookmark:${string}`
  | `source:${string}:${string}`
  | `user-linked:${string}`
  | `user-standalone:${string}:${string}`;

const LIST_DETAIL_VIEW_OPTIONS: readonly SegmentedControlOption<ListDetailViewMode>[] = [
  { label: 'List', value: 'list' },
  { label: 'Map', value: 'map' },
];
const LIST_DETAIL_PAGE_SIZE = 20;
const TRANSFER_LIST_PAGE_SIZE = 100;
const TRANSFER_LIST_QUERY_KEY = ['feature', 'restaurantLists', 'my', 'transferDestinations'] as const;

function normalizeListDetailSearchValue(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

function doesListDetailRestaurantRowMatchSearch(
  row: ReturnType<typeof buildListDetailReadModel>['restaurantRows'][number],
  searchTokens: string[],
): boolean {
  if (searchTokens.length === 0) {
    return true;
  }

  const searchableText = [
    row.group.restaurantName,
    row.group.restaurantLocation,
    row.group.restaurantCity,
    row.group.restaurantCuisineType,
    row.primaryMetaLabel,
    row.secondaryMetaLabel,
    ...row.group.notes,
    ...row.group.items.flatMap((item) => [
      item.name,
      item.sourceNote,
      item.sourceUserName,
    ]),
    ...(row.group.friendMatches?.flatMap((match) => [
      match.friendName,
      match.itemName,
    ]) ?? []),
    ...row.ownerItems.flatMap((item) => [
      item.name,
      item.source?.sourceUserName,
    ]),
    ...row.bookmarkedItems.flatMap((item) => [
      item.name,
      item.sourceUserName,
      item.sourceNote,
    ]),
  ]
    .map(normalizeListDetailSearchValue)
    .filter(Boolean)
    .join(' ');

  return searchTokens.every((token) => searchableText.includes(token));
}

function getLocallyRemovedListItemKey(
  item: PendingDeleteListItem,
): LocallyRemovedListItemKey {
  switch (item.kind) {
    case 'restaurant-bookmark':
      return `restaurant-bookmark:${item.restaurantId}`;
    case 'menu-bookmark':
      return `menu-bookmark:${item.listItemId}`;
    case 'source':
      return `source:${item.listItemId}:${item.foodItemId}`;
    case 'user-linked':
      return `user-linked:${item.listItemId}`;
    case 'user-standalone':
      return `user-standalone:${item.listItemId}:${item.foodItemId}`;
  }
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  screenBody: {
    flex: 1,
    paddingBottom: 0,
    paddingTop: 0,
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
    ...createPlatformShadow({
      color: theme.colors.background.inverse,
      offset: { width: 0, height: 1 },
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
  friendMatchesToggleRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  friendMatchesToggleTextWrap: {
    flex: 1,
    gap: theme.spacing.xxs,
    paddingRight: theme.spacing.sm,
  },
  friendMatchesToggleTitle: {
    color: theme.colors.text.primary,
  },
  friendMatchesToggleSubtitle: {
    color: theme.colors.text.secondary,
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  searchField: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.default,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minHeight: 42,
    paddingHorizontal: theme.spacing.sm,
  },
  searchInput: {
    color: theme.colors.text.primary,
    flex: 1,
    ...theme.typography.bodyLg,
    paddingVertical: theme.spacing.xs,
  },
  clearSearchButton: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  clearSearchButtonPressed: {
    backgroundColor: theme.colors.background.muted,
  },
  clearSearchLabel: {
    color: theme.colors.text.muted,
  },
  filtersToggle: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 82,
    paddingHorizontal: theme.spacing.sm,
  },
  filtersToggleActive: {
    backgroundColor: theme.colors.fill.brand,
    borderColor: theme.colors.fill.brand,
  },
  filtersToggleLabel: {
    color: theme.colors.text.primary,
  },
  filtersToggleLabelActive: {
    color: theme.colors.text.inverse,
  },
  listHeader: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.sm,
  },
  listItemSeparator: {
    height: theme.spacing.sm,
  },
  mapWrap: {
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    height: 560,
    overflow: 'hidden',
  },
}));

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
  const [locallyRemovedListItemKeys, setLocallyRemovedListItemKeys] = useState<Set<LocallyRemovedListItemKey>>(
    new Set(),
  );
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const [transferTarget, setTransferTarget] = useState<PendingListItemTransferTarget | null>(null);
  const [selectedTransferListIds, setSelectedTransferListIds] = useState<Set<string>>(new Set());
  const [isTransferringItem, setIsTransferringItem] = useState(false);
  const [transferModalError, setTransferModalError] = useState<string | null>(null);
  const [movingRestaurantId, setMovingRestaurantId] = useState<string | null>(null);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerPreviewUrls, setPhotoViewerPreviewUrls] = useState<string[]>(
    [],
  );
  const [photoViewerOwnerLabels, setPhotoViewerOwnerLabels] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ListDetailViewMode>('list');
  const [showFriendMatches, setShowFriendMatches] = useState(false);
  const [listFiltersExpanded, setListFiltersExpanded] = useState(false);
  const [selectedMapGroupId, setSelectedMapGroupId] = useState<string | null>(null);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [isSharingList, setIsSharingList] = useState(false);
  const [isRegeneratingShareLink, setIsRegeneratingShareLink] = useState(false);
  const [isDisablingShareLink, setIsDisablingShareLink] = useState(false);
  const [listSearchQuery, setListSearchQuery] = useState('');

  const detailQuery = useInfiniteQuery({
    queryKey: restaurantListQueryKeys.detailPages(listId),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      getRestaurantListDetail(listId, {
        page: pageParam,
        pageSize: LIST_DETAIL_PAGE_SIZE,
        signal,
      }),
    getNextPageParam: (lastPage) => lastPage.hasNextPage ? (lastPage.page ?? 1) + 1 : undefined,
  });
  const transferListsQuery = useQuery({
    enabled: transferTarget !== null,
    queryKey: TRANSFER_LIST_QUERY_KEY,
    queryFn: ({ signal }) =>
      listRestaurantListsPage({
        page: 1,
        pageSize: TRANSFER_LIST_PAGE_SIZE,
        scope: 'my',
        signal,
      }),
  });

  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(detailQuery.isRefetching);

  const loadedDetail = useMemo(() => {
    const pages = detailQuery.data?.pages ?? [];
    const firstPage = pages[0];
    if (!firstPage) {
      return undefined;
    }
    const lastPage = pages[pages.length - 1] ?? firstPage;

    return {
      ...firstPage,
      items: pages.flatMap((page) => page.items),
      photoPreviews: pages.flatMap((page) => page.photoPreviews),
      page: lastPage.page ?? pages.length,
      pageSize: lastPage.pageSize,
      totalItems: lastPage.totalItems,
      totalPages: lastPage.totalPages,
      hasNextPage: lastPage.hasNextPage,
    };
  }, [detailQuery.data?.pages]);

  const readModel = useMemo(
    () =>
      buildListDetailReadModel({
        detail: loadedDetail,
        isError: detailQuery.isError,
        isLoading: detailQuery.isLoading,
        saveBookmarkTarget: null,
        userId: user?.id,
      }),
    [
      detailQuery.isError,
      detailQuery.isLoading,
      loadedDetail,
      user?.id,
    ],
  );

  const {
    analyticsContext: listAnalyticsContext,
    defaultList,
    hasBlockingListItemsError,
    hasListItemsRefreshError,
    isDefaultList,
    isOwner,
    list,
    myLists,
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

  const styles = useStyles();
  const trimmedListSearchQuery = listSearchQuery.trim();
  const listSearchTokens = useMemo(
    () =>
      normalizeListDetailSearchValue(trimmedListSearchQuery)
        .split(/\s+/)
        .filter(Boolean),
    [trimmedListSearchQuery],
  );
  const hasListSearch = listSearchTokens.length > 0;

  const visibleRestaurantRows = useMemo(
    () =>
      restaurantRows
        .filter((row) => {
          if (!isDefaultList) {
            return true;
          }
          return !locallyRemovedListItemKeys.has(`restaurant-bookmark:${row.group.restaurantId}`);
        })
        .map((row) => {
          const ownerItems = row.ownerItems.filter((item) => {
            if (locallyRemovedListItemKeys.has(`menu-bookmark:${item.bookmark.listItemId}`)) {
              return false;
            }
            const isSourceRemoved = item.source
              ? locallyRemovedListItemKeys.has(`source:${item.source.listItemId}:${item.source.foodItemId}`)
              : false;
            const isUserRemoved = item.user
              ? item.user.kind === 'linked'
                ? locallyRemovedListItemKeys.has(`user-linked:${item.user.listItemId}`)
                : locallyRemovedListItemKeys.has(`user-standalone:${item.user.listItemId}:${item.user.foodItemId}`)
              : false;
            return !isSourceRemoved && !isUserRemoved;
          });

          return {
            ...row,
            ownerItems,
          };
        })
        .filter((row) => {
          if (!isDefaultList || !showFriendMatches) {
            return true;
          }
          return (row.group.friendMatches?.length ?? 0) > 0 || (row.group.friendOverlapCount ?? 0) > 0;
        })
        .filter((row) => doesListDetailRestaurantRowMatchSearch(row, listSearchTokens)),
    [isDefaultList, listSearchTokens, locallyRemovedListItemKeys, restaurantRows, showFriendMatches],
  );

  const listDetailMapGroups = useMemo<RestaurantMapGroup[]>(() => {
    const visibleRestaurantIds = new Set(visibleRestaurantRows.map((row) => row.group.restaurantId));

    return readModel.mapGroups
      .filter((group) => visibleRestaurantIds.has(group.id))
      .map((group) => ({
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
  }, [openPhotoViewer, readModel.mapGroups, visibleRestaurantRows]);
  const omittedVisibleMapRestaurantCount = visibleRestaurantRows.length - listDetailMapGroups.length;

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
      setErrorMessage('The Want to Try list cannot be deleted.');
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

  const confirmDeleteRestaurantBookmark = (group: GroupedRestaurant) => {
    if (!isOwner || !isDefaultList || !group.restaurantBookmarkListItemId) {
      return;
    }

    setPendingDeleteItem({
      kind: 'restaurant-bookmark',
      restaurantId: group.restaurantId,
      restaurantName: group.restaurantName,
    });
  };

  const confirmDeleteWantToTryMenuItem = (group: GroupedRestaurant, item: OwnerDisplayItem) => {
    if (!isOwner || !isDefaultList) {
      return;
    }

    setPendingDeleteItem({
      kind: 'menu-bookmark',
      itemName: item.name,
      restaurantId: item.bookmark.restaurantId ?? group.restaurantId,
      listItemId: item.bookmark.listItemId,
      foodItemId: item.bookmark.foodItemId,
      ...(item.bookmark.menuItemId ? { menuItemId: item.bookmark.menuItemId } : {}),
    });
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
      let didDelete = false;

      if (pendingDeleteItem.kind === 'restaurant-bookmark') {
        setErrorMessage(null);
        try {
          await restaurantListWrites.removeBookmarkFromDefaultList({
            bookmark: {
              restaurantId: pendingDeleteItem.restaurantId,
            },
            defaultListId: listId,
            sourceListId: listId,
          });
          didDelete = true;
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not remove restaurant from Want to Try.');
        }
      } else if (pendingDeleteItem.kind === 'menu-bookmark') {
        setErrorMessage(null);
        try {
          await restaurantListWrites.removeBookmarkFromDefaultList({
            bookmark: {
              restaurantId: pendingDeleteItem.restaurantId,
              ...(pendingDeleteItem.menuItemId
                ? { menuItemId: pendingDeleteItem.menuItemId }
                : { foodItemId: pendingDeleteItem.foodItemId }),
            },
            defaultListId: listId,
            sourceListId: listId,
          });
          didDelete = true;
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not remove menu item from Want to Try.');
        }
      } else {
        didDelete =
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
      }

      if (didDelete) {
        setLocallyRemovedListItemKeys((currentKeys) => {
          const nextKeys = new Set(currentKeys);
          nextKeys.add(getLocallyRemovedListItemKey(pendingDeleteItem));
          return nextKeys;
        });
        setPendingDeleteItem(null);
      }
    } finally {
      setIsDeletingItem(false);
    }
  };

  const handleIWentThere = (
    group: GroupedRestaurant,
    item?: { listItemId: string; menuItemId?: string; name: string },
  ) => {
    trackObservabilityEvent('LIST_DETAIL_I_WENT_TAPPED', {
      source: 'ListDetailScreen',
      hasRestaurantId: Boolean(group.restaurantId),
      hasPreselectedMenuItem: Boolean(item),
    });
    trackProductEvent('social.i_went_there_started', {
      source: 'ListDetailScreen',
      entryType: 'restaurant_visit',
      hasRating: Boolean(item),
    });
    trackProductEvent('tracking.entry_started', {
      entryType: 'restaurant_visit',
      source: 'list',
      hasPhoto: false,
      itemCount: item ? 1 : 0,
      ratingCount: item ? 1 : 0,
      completed: false,
    });
    navigation.navigate('CreateVisit', {
      preselectedRestaurantId: group.restaurantId,
      preselectedRestaurantName: group.restaurantName,
      preselectedMenuItemId: item ? item.menuItemId ?? `bookmark-${item.listItemId}` : undefined,
      preselectedMenuItemName: item?.name,
      sourceListId: route.params.listId,
      sourceListItemId: item?.listItemId ?? group.restaurantBookmarkListItemId,
      returnToStep: item ? 2 : 1,
    });
  };

  const buildSaveBookmarkTarget = (
    group: GroupedRestaurant,
    item: GroupedBookmarkedItem,
  ): SaveBookmarkTarget => ({
    bookmarkLookupIds: item.bookmarkLookupIds,
    restaurantId: item.foodItemRestaurantId ?? group.restaurantId,
    restaurantName: group.restaurantName,
    foodItemId: item.foodItemId,
    foodItemName: item.name,
    foodItemRating: item.rating,
    sourceListItemId: item.listItemId,
    visitedAt: item.visitedAt,
    sourceNote: item.sourceNote,
  });

  const resolveAlreadySavedListIdsForBookmarkTarget = useCallback(
    (target: SaveBookmarkTarget) => {
      const listIds = new Set<string>();
      for (const bookmarkLookupId of target.bookmarkLookupIds) {
        const existingListIds = readModel.savedListIdsByBookmarkLookupId.get(bookmarkLookupId);
        if (!existingListIds) {
          continue;
        }
        for (const existingListId of existingListIds) {
          listIds.add(existingListId);
        }
      }
      return listIds;
    },
    [readModel.savedListIdsByBookmarkLookupId],
  );

  const isBookmarkedItemSavedToDefaultList = useCallback(
    (item: GroupedBookmarkedItem) => {
      const defaultListId = defaultList?.id;
      if (!defaultListId) {
        return false;
      }
      return item.bookmarkLookupIds.some((bookmarkLookupId) =>
        readModel.savedListIdsByBookmarkLookupId.get(bookmarkLookupId)?.has(defaultListId),
      );
    },
    [defaultList?.id, readModel.savedListIdsByBookmarkLookupId],
  );

  const saveBookmarkToWantToTry = async (
    group: GroupedRestaurant,
    item: GroupedBookmarkedItem,
  ) => {
    if (isOwner || isSavingBookmark) {
      return;
    }

    const saveBookmarkTarget = buildSaveBookmarkTarget(group, item);
    const alreadySavedListIdsForTarget =
      resolveAlreadySavedListIdsForBookmarkTarget(saveBookmarkTarget);
    if (defaultList?.id && alreadySavedListIdsForTarget.has(defaultList.id)) {
      return;
    }

    setErrorMessage(null);
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
      if (result.errorMessage) {
        setErrorMessage(result.errorMessage);
      }
    } finally {
      setIsSavingBookmark(false);
    }
  };

  const transferLookupIds = useMemo(() => {
    if (!transferTarget) {
      return [];
    }

    return Array.from(
      new Set(
        [
          transferTarget.source?.foodItemId,
          transferTarget.user?.kind === 'linked'
            ? transferTarget.user.userFoodItemId
            : transferTarget.user?.foodItemId,
        ].filter((value): value is string => Boolean(value?.trim())),
      ),
    );
  }, [transferTarget]);

  const transferTargetLists = useMemo(() => {
    const listsById = new Map<string, (typeof myLists)[number]>();
    for (const candidateList of myLists) {
      if (!candidateList.isDefault) {
        listsById.set(candidateList.id, candidateList);
      }
    }
    if (list && !list.isDefault) {
      listsById.set(list.id, list);
    }

    for (const candidateList of transferListsQuery.data?.items ?? []) {
      if (!candidateList.isDefault) {
        listsById.set(candidateList.id, candidateList);
      }
    }

    return Array.from(listsById.values());
  }, [list, myLists, transferListsQuery.data?.items]);

  const alreadyTransferredListIds = useMemo(() => {
    const listIds = new Set<string>();
    if (transferLookupIds.length === 0) {
      return listIds;
    }

    for (const candidateList of transferTargetLists) {
      const hasEveryLookup = transferLookupIds.every((lookupId) =>
        readModel.savedListIdsByBookmarkLookupId.get(lookupId)?.has(candidateList.id),
      );
      if (hasEveryLookup) {
        listIds.add(candidateList.id);
      }
    }

    return listIds;
  }, [readModel.savedListIdsByBookmarkLookupId, transferLookupIds, transferTargetLists]);

  const selectedNewTransferListIds = useMemo(
    () =>
      Array.from(selectedTransferListIds).filter(
        (targetListId) => targetListId !== listId && !alreadyTransferredListIds.has(targetListId),
      ),
    [alreadyTransferredListIds, listId, selectedTransferListIds],
  );
  const shouldRemoveTransferTargetFromCurrentList =
    Boolean(transferTarget) && !selectedTransferListIds.has(listId);
  const hasAnySelectedTransferList =
    selectedTransferListIds.size > 0 ||
    Array.from(alreadyTransferredListIds).some((targetListId) => targetListId !== listId);
  const hasTransferSelectionChange =
    selectedNewTransferListIds.length > 0 || shouldRemoveTransferTargetFromCurrentList;

  const openTransferModal = (
    group: GroupedRestaurant,
    item: OwnerDisplayItem,
  ) => {
    if (!isOwner || isDefaultList || (!item.source && !item.user)) {
      return;
    }

    trackObservabilityEvent('LIST_DETAIL_ITEM_TRANSFER_MENU_OPENED', {
      source: 'ListDetailScreen',
      hasSourceRating: Boolean(item.source),
      hasUserRating: Boolean(item.user),
    });
    setTransferTarget({
      itemName: item.name,
      restaurantId: group.restaurantId,
      restaurantName: group.restaurantName,
      ...(item.source ? { source: item.source } : {}),
      ...(item.user ? { user: item.user } : {}),
    });
    setSelectedTransferListIds(new Set([listId]));
    setTransferModalError(null);
  };

  const closeTransferModal = () => {
    if (isTransferringItem) {
      return;
    }

    setTransferTarget(null);
    setSelectedTransferListIds(new Set());
    setTransferModalError(null);
  };

  const toggleTransferListSelection = (targetListId: string) => {
    if (targetListId !== listId && alreadyTransferredListIds.has(targetListId)) {
      return;
    }

    setSelectedTransferListIds((previousValue) => {
      const nextValue = new Set(previousValue);
      if (nextValue.has(targetListId)) {
        nextValue.delete(targetListId);
      } else {
        nextValue.add(targetListId);
      }
      return nextValue;
    });
    setTransferModalError(null);
  };

  const addTransferTargetToList = async (
    target: PendingListItemTransferTarget,
    destinationListId: string,
  ): Promise<boolean> => {
    let queued = false;

    if (target.source) {
      const result = await restaurantListWrites.saveBookmarkToLists({
        listIds: [destinationListId],
        sourceListId: listId,
        bookmark: {
          restaurantId: target.source.restaurantId ?? target.restaurantId,
          foodItemId: target.source.foodItemId,
          sourceListId: listId,
          sourceListItemId: target.source.listItemId,
          ...(target.source.sourceUserId ? { sourceUserId: target.source.sourceUserId } : {}),
        },
      });
      queued = queued || result.status === 'queued';
    }

    if (target.user) {
      const foodItemId =
        target.user.kind === 'linked' ? target.user.userFoodItemId : target.user.foodItemId;
      const result = await restaurantListWrites.addRestaurant({
        listId: destinationListId,
        restaurantId: target.user.restaurantId ?? target.restaurantId,
        foodItemIds: [foodItemId],
      });
      queued = queued || result.status === 'queued';
    }

    return queued;
  };

  const removeTransferTargetFromCurrentList = async (
    target: PendingListItemTransferTarget,
  ): Promise<boolean> => {
    let queued = false;

    if (target.source) {
      const result = await restaurantListWrites.removeRestaurantListSourceRating({
        listId,
        listItemId: target.source.listItemId,
        foodItemId: target.source.foodItemId,
      });
      queued = queued || result.status === 'queued';
    }

    if (target.user) {
      const result =
        target.user.kind === 'linked'
          ? await restaurantListWrites.removeRestaurantListUserRating({
              listId,
              listItemId: target.user.listItemId,
            })
          : await restaurantListWrites.removeRestaurantListSourceRating({
              listId,
              listItemId: target.user.listItemId,
              foodItemId: target.user.foodItemId,
            });
      queued = queued || result.status === 'queued';
    }

    return queued;
  };

  const confirmTransferItem = async () => {
    if (!transferTarget || isTransferringItem) {
      return;
    }

    if (!hasTransferSelectionChange) {
      setTransferModalError('Choose at least one list change to save.');
      return;
    }

    if (shouldRemoveTransferTargetFromCurrentList && !hasAnySelectedTransferList) {
      setTransferModalError('Select at least one list before removing this item from the current list.');
      return;
    }

    setTransferModalError(null);
    setIsTransferringItem(true);
    trackObservabilityEvent('LIST_DETAIL_ITEM_TRANSFER_STARTED', {
      source: 'ListDetailScreen',
      addListCount: selectedNewTransferListIds.length,
      removeFromCurrentList: shouldRemoveTransferTargetFromCurrentList,
      isOnline,
      hasSourceRating: Boolean(transferTarget.source),
      hasUserRating: Boolean(transferTarget.user),
    });

    try {
      let addQueued = false;
      for (const targetListId of selectedNewTransferListIds) {
        addQueued = (await addTransferTargetToList(transferTarget, targetListId)) || addQueued;
      }
      const removeQueued = shouldRemoveTransferTargetFromCurrentList
        ? await removeTransferTargetFromCurrentList(transferTarget)
        : false;

      trackObservabilityEvent('LIST_DETAIL_ITEM_TRANSFER_SUCCEEDED', {
        source: 'ListDetailScreen',
        addListCount: selectedNewTransferListIds.length,
        removeFromCurrentList: shouldRemoveTransferTargetFromCurrentList,
        queued: addQueued || removeQueued,
      });
      setTransferTarget(null);
      setSelectedTransferListIds(new Set());
      setTransferModalError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not organize this item.';
      trackObservabilityEvent('LIST_DETAIL_ITEM_TRANSFER_FAILED', {
        source: 'ListDetailScreen',
        addListCount: selectedNewTransferListIds.length,
        removeFromCurrentList: shouldRemoveTransferTargetFromCurrentList,
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        isOnline,
      });
      setTransferModalError(message);
    } finally {
      setIsTransferringItem(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    await runPullRefresh(async () => {
      await detailQuery.refetch();
    });
  }, [detailQuery, runPullRefresh]);

  const handleAddRestaurant = useCallback(() => {
    trackObservabilityEvent('LIST_DETAIL_ADD_RESTAURANT_TAPPED', {
      source: 'ListDetailScreen',
      isDefaultList,
    });
    if (isDefaultList) {
      navigation.navigate('RestaurantDiscovery');
      return;
    }
    navigation.navigate('AddRestaurantToList', { listId });
  }, [isDefaultList, listId, navigation]);

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

  const listDetailHeaderContent = (
    <View style={styles.listHeader}>
      <PageErrorToast errorMessage={errorMessage} title="List update failed" />
      <PageErrorToast
        actionLabel="Retry"
        errorMessage={hasListItemsRefreshError ? 'Could not refresh list detail. Showing saved data.' : null}
        onAction={() => {
          void detailQuery.refetch();
        }}
        title="List detail unavailable"
      />

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

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <TextInput
            accessibilityLabel="Search list"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setListSearchQuery}
            onSubmitEditing={() => {
              Keyboard.dismiss();
            }}
            placeholder="Search restaurants or items"
            placeholderTextColor={theme.colors.text.muted}
            returnKeyType="search"
            style={styles.searchInput}
            testID="list-detail-search-input"
            value={listSearchQuery}
          />
          {hasListSearch ? (
            <Pressable
              accessibilityLabel="Clear list search"
              accessibilityRole="button"
              onPress={() => {
                setListSearchQuery('');
                trackObservabilityEvent('LIST_DETAIL_SEARCH_CLEARED', {
                  source: 'ListDetailScreen',
                });
              }}
              style={({ pressed }) => [styles.clearSearchButton, pressed ? styles.clearSearchButtonPressed : null]}
              testID="list-detail-clear-search-button"
            >
              <Text style={styles.clearSearchLabel} variant="bodySmTightSemiBold">Clear</Text>
            </Pressable>
          ) : null}
        </View>
        {isOwner && isDefaultList ? (
          <Pressable
            accessibilityLabel="Show list filters"
            accessibilityRole="button"
            onPress={() => {
              setListFiltersExpanded((previous) => !previous);
            }}
            style={[styles.filtersToggle, listFiltersExpanded && styles.filtersToggleActive]}
            testID="list-detail-filters-button"
          >
            <Text
              style={[styles.filtersToggleLabel, listFiltersExpanded && styles.filtersToggleLabelActive]}
              variant="button"
            >
              Filters
            </Text>
          </Pressable>
        ) : null}
      </View>

      {isOwner && isDefaultList && listFiltersExpanded ? (
        <View style={styles.friendMatchesToggleRow}>
          <View style={styles.friendMatchesToggleTextWrap}>
            <Text style={styles.friendMatchesToggleTitle} variant="label">
              Show friend matches
            </Text>
            <Text style={styles.friendMatchesToggleSubtitle} variant="bodySmTight">
              Only show restaurants friends also saved, with their names.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Show friend matches"
            ios_backgroundColor={theme.colors.border.strong}
            onValueChange={(nextValue) => {
              setShowFriendMatches(nextValue);
              trackObservabilityEvent('LIST_DETAIL_FRIEND_MATCHES_TOGGLED', {
                source: 'ListDetailScreen',
                enabled: nextValue,
              });
            }}
            testID="want-to-try-friend-matches-toggle"
            thumbColor={theme.colors.background.surface}
            trackColor={{
              false: theme.colors.border.strong,
              true: theme.colors.fill.brand,
            }}
            value={showFriendMatches}
          />
        </View>
      ) : null}

      {isOwner && !isDefaultList ? (
        <Pressable
          accessibilityLabel="Add restaurant to list"
          accessibilityRole="button"
          onPress={handleAddRestaurant}
          style={({ pressed }) => [styles.addBannerButton, pressed && styles.addBannerButtonPressed]}
          testID="add-restaurant-banner"
        >
          <Ionicons
            color={theme.colors.button.primaryText}
            name="add-outline"
            size={20}
          />
          <Text style={styles.addBannerLabel}>
            Add Visit Ratings to List
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <FeatureDetailScreenScaffold
      headerScrollMode="fixed"
      scroll={false}
      screenBackgroundTone="surface"
      onRefresh={handleRefresh}
      onBackPress={handleBack}
      refreshing={isPullRefreshing}
      bodyStyle={styles.screenBody}
      rightAccessory={
        isOwner && isDefaultList ? (
          <Pressable
            accessibilityLabel="Find restaurants to bookmark"
            accessibilityRole="button"
            onPress={handleAddRestaurant}
            style={styles.headerIconButton}
            testID="list-detail-add-button"
          >
            <Ionicons color={theme.colors.text.primary} name="add-outline" size={18} />
          </Pressable>
        ) : isOwner ? (
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
        {viewMode === 'map' ? (
          <>
            {listDetailHeaderContent}
            <RestaurantMapView
              analyticsSource="ListDetailMapView"
              emptyDescription={
                hasListSearch
                  ? 'Try another restaurant, city, cuisine, or menu item.'
                  : 'Restaurants need a saved location before they can appear here.'
              }
              emptyTitle={hasListSearch ? 'No matching restaurants' : 'No map locations yet'}
              errorMessage={null}
              groups={listDetailMapGroups}
              hiddenLocationPluralLabel="restaurants"
              hiddenLocationSingularLabel="restaurant"
              loading={false}
              mapTestID="list-detail-map"
              omittedWithoutCoordinates={omittedVisibleMapRestaurantCount}
              onRetry={() => {
                void detailQuery.refetch();
              }}
              onSelectedGroupChange={setSelectedMapGroupId}
              selectedGroupId={selectedMapGroupId}
              style={styles.mapWrap}
              testID="list-detail-map-view"
            />
          </>
        ) : (
            <FlatList
              contentContainerStyle={styles.listContent}
              data={visibleRestaurantRows}
              testID="list-detail-rows"
              ItemSeparatorComponent={() => <View style={styles.listItemSeparator} />}
              keyExtractor={(row) => row.group.restaurantId}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={listDetailHeaderContent}
              ListEmptyComponent={
                <EmptyState
                  actionLabel={hasListSearch ? 'Clear Search' : undefined}
                  description={
                    hasListSearch
                      ? 'Try another restaurant, city, cuisine, or menu item.'
                      : isOwner && isDefaultList && showFriendMatches
                      ? 'No friends have matching Want to Try bookmarks for these restaurants yet.'
                      : readModel.emptyRestaurantsDescription
                  }
                  onAction={
                    hasListSearch
                      ? () => {
                          setListSearchQuery('');
                        }
                      : undefined
                  }
                  tone="default"
                  title={
                    hasListSearch
                      ? 'No matching restaurants'
                      : isOwner && isDefaultList && showFriendMatches
                        ? 'No friend matches yet'
                        : 'No restaurants yet'
                  }
                />
              }
              onEndReached={() => {
                if (detailQuery.hasNextPage && !detailQuery.isFetchingNextPage) {
                  void detailQuery.fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.4}
              refreshing={isPullRefreshing}
              onRefresh={handleRefresh}
              renderItem={({ item: row, index: visibleRowIndex }) => {
                const { group, groupIndex, isRestaurantLocked, primaryMetaLabel, secondaryMetaLabel } = row;

                return isDefaultList && isOwner ? (
                  <ListDetailWantToTryBookmarkCard
                    friendMatches={group.friendMatches}
                    friendOverlapCount={group.friendOverlapCount}
                    groupIndex={groupIndex}
                    isLocked={isRestaurantLocked}
                    items={row.ownerItems}
                    key={group.restaurantId}
                    lockTestID={`locked-restaurant-${group.restaurantId}`}
                    onIWentThere={
                      isRestaurantLocked
                        ? undefined
                        : () => {
                            handleIWentThere(group);
                          }
                    }
                    onDeleteRestaurantBookmark={
                      group.restaurantBookmarkListItemId
                        ? () => {
                            confirmDeleteRestaurantBookmark(group);
                          }
                        : undefined
                    }
                    primaryMetaLabel={primaryMetaLabel}
                    renderItem={(item, itemIndex) => (
                      <ListDetailWantToTryMenuItemRow
                        canCreateVisitFromRestaurant={!isRestaurantLocked}
                        canDelete
                        item={item}
                        itemIndex={itemIndex}
                        key={item.key}
                        onDelete={(targetItem) => {
                          confirmDeleteWantToTryMenuItem(group, targetItem);
                        }}
                        onIWentThere={(input) => {
                          handleIWentThere(group, input);
                        }}
                      />
                    )}
                    restaurantName={group.restaurantName}
                    secondaryMetaLabel={secondaryMetaLabel}
                    showFriendMatches={showFriendMatches}
                  />
                ) : isOwner ? (
                  <ListDetailRestaurantRecommendationGroupCard
                    groupIndex={groupIndex}
                    isLocked={isRestaurantLocked}
                    items={row.ownerItems}
                    key={group.restaurantId}
                    lockTestID={`locked-restaurant-${group.restaurantId}`}
                    mode="owner"
                    notes={group.notes}
                    primaryMetaLabel={primaryMetaLabel}
                    recommendationUsageProofs={group.recommendationUsageProofs}
                    renderItem={(item, itemIndex) => (
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
                        onLongPressItem={(targetItem) => {
                          openTransferModal(group, targetItem);
                        }}
                        onOpenPhotos={openPhotoViewer}
                        photoEntries={item.photoEntries}
                      />
                    )}
                    restaurantId={group.restaurantId}
                    restaurantName={group.restaurantName}
                    reorderControls={
                      hasListSearch
                        ? undefined
                        : (
                            <View style={styles.reorderControls}>
                              {visibleRowIndex > 0 ? (
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
                              {visibleRowIndex < visibleRestaurantRows.length - 1 ? (
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
                          )
                    }
                    secondaryMetaLabel={secondaryMetaLabel}
                  />
                ) : (
                  <ListDetailRestaurantRecommendationGroupCard
                    groupIndex={groupIndex}
                    isLocked={isRestaurantLocked}
                    items={row.bookmarkedItems}
                    key={group.restaurantId}
                    lockTestID={`locked-restaurant-${group.restaurantId}`}
                    mode="viewer"
                    notes={group.notes}
                    primaryMetaLabel={primaryMetaLabel}
                    renderItem={(item, itemIndex) => (
                      <ListDetailBookmarkedItemRow
                        canSave={!isRestaurantLocked}
                        groupIndex={groupIndex}
                        isSaved={isBookmarkedItemSavedToDefaultList(item)}
                        item={item}
                        itemIndex={itemIndex}
                        key={item.key}
                        onOpenPhotos={openPhotoViewer}
                        onSave={(targetItem) => {
                          void saveBookmarkToWantToTry(group, targetItem);
                        }}
                        photoEntries={item.photoEntries}
                      />
                    )}
                    restaurantId={group.restaurantId}
                    restaurantName={group.restaurantName}
                    secondaryMetaLabel={secondaryMetaLabel}
                  />
                );
              }}
              style={styles.list}
            />
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
        cancelLabel={pendingDeleteItem?.kind === 'restaurant-bookmark' ? 'Keep Restaurant' : 'Keep Item'}
        confirmLabel={
          pendingDeleteItem?.kind === 'restaurant-bookmark'
            ? 'Remove Restaurant'
            : pendingDeleteItem?.kind === 'menu-bookmark'
              ? 'Remove Menu Item'
              : 'Delete Item'
        }
        confirmLoadingLabel="Deleting..."
        description={
          pendingDeleteItem
            ? pendingDeleteItem.kind === 'restaurant-bookmark'
              ? `Remove "${pendingDeleteItem.restaurantName}" from your Want to Try list?`
              : pendingDeleteItem.kind === 'menu-bookmark'
                ? `Remove "${pendingDeleteItem.itemName}" from your Want to Try list?`
              : pendingDeleteItem.kind === 'source'
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
        title={
          pendingDeleteItem?.kind === 'restaurant-bookmark'
            ? 'Remove Restaurant?'
            : pendingDeleteItem?.kind === 'menu-bookmark'
              ? 'Remove Menu Item?'
            : pendingDeleteItem?.kind === 'source'
              ? 'Delete Bookmarked Item?'
              : 'Delete Rating?'
        }
        visible={Boolean(pendingDeleteItem)}
      />

      <ListItemTransferModal
        alreadySavedListIds={alreadyTransferredListIds}
        currentListId={listId}
        errorMessage={transferModalError}
        hasChanges={hasTransferSelectionChange}
        isLoadingLists={transferListsQuery.isLoading && transferTargetLists.length === 0}
        isSubmitting={isTransferringItem}
        onClose={closeTransferModal}
        onConfirm={() => {
          void confirmTransferItem();
        }}
        onToggleList={toggleTransferListSelection}
        selectedListIds={selectedTransferListIds}
        target={transferTarget}
        targetLists={transferTargetLists}
      />

    </FeatureDetailScreenScaffold>
  );
}
