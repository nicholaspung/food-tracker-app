import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ConfirmDestructiveModal,
  EmptyState,
  ErrorState,
  FeatureDetailScreenScaffold,
  PhotoViewerModal,
  RatingPill,
  SectionHeader,
  Skeleton,
} from '../components/shared';
import {
  buildPocketBaseFileUrl,
  createDefaultRestaurantList,
  deleteRestaurantList,
  getRestaurantListItemLinkFoodItemIds,
  getRestaurantListById,
  listMyBookmarkedListItemLinksForFoodItemIds,
  listRestaurantListsPage,
  listRestaurantListItemsPage,
  listVisitPhotosForFoodItemIds,
  moveRestaurantListRestaurant,
  removeRestaurantListSourceRating,
  removeRestaurantListUserRating,
  saveRestaurantFoodItemToList,
  type VisitPhotoRecord,
} from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { formatDisplayDate } from '../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { useIncrementalIdQuery } from '../hooks/useIncrementalIdQuery';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Card, Modal, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type ListDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'ListDetail'>;

interface GroupedBookmarkedItem {
  key: string;
  bookmarkLookupIds: string[];
  foodItemId: string;
  listItemId: string;
  name: string;
  rating: number;
  visitedAt?: string;
  sourceUserId?: string;
  sourceUserName?: string;
  sourceNote?: string;
  userFoodItemId?: string;
  userFoodItemRating?: number;
  userFoodItemVisitedAt?: string;
}

interface OwnerSourceRating {
  listItemId: string;
  foodItemId: string;
  sourceUserName: string;
  rating: number;
  visitedAt?: string;
}

type OwnerUserRating =
  | {
      kind: 'linked';
      listItemId: string;
      userFoodItemId: string;
      rating: number;
      visitedAt?: string;
    }
  | {
      kind: 'standalone';
      listItemId: string;
      foodItemId: string;
      rating: number;
      visitedAt?: string;
    };

interface OwnerDisplayItem {
  key: string;
  name: string;
  orderIndex: number;
  source?: OwnerSourceRating;
  user?: OwnerUserRating;
}

interface OwnerItemPhotoEntry {
  id: string;
  url: string;
  ownerLabel: string;
}

interface GroupedRestaurant {
  restaurantId: string;
  restaurantName: string;
  restaurantCity?: string;
  restaurantCuisineType?: string;
  notes: string[];
  firstPosition: number;
  items: GroupedBookmarkedItem[];
}

interface SaveBookmarkTarget {
  bookmarkLookupIds: string[];
  restaurantId: string;
  restaurantName: string;
  foodItemId: string;
  foodItemName: string;
  foodItemRating: number;
  visitedAt?: string;
  sourceNote?: string;
}

type PendingDeleteListItem =
  | {
      kind: 'source';
      itemName: string;
      listItemId: string;
      foodItemId: string;
    }
  | {
      kind: 'user-linked';
      itemName: string;
      listItemId: string;
    }
  | {
      kind: 'user-standalone';
      itemName: string;
      listItemId: string;
      foodItemId: string;
    };

function buildBookmarkLookupIds(...ids: (string | undefined)[]): string[] {
  return Array.from(
    new Set(
      ids
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  );
}

function formatMonthYearLabel(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const label = formatDisplayDate(value, {
    fallback: '',
    options: { month: 'short', year: 'numeric' },
  });
  return label || null;
}

function formatFullDateLabel(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const label = formatDisplayDate(value, {
    fallback: '',
    options: { month: 'short', day: 'numeric', year: 'numeric' },
  });
  return label || null;
}

function normalizeMenuItemKey(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed || value;
}

function resolveExpandedPhotoOwnerName(photo: VisitPhotoRecord): string | null {
  const displayName = photo.expand?.user?.name?.trim();
  if (displayName) {
    return displayName;
  }

  const email = photo.expand?.user?.email?.trim();
  if (email) {
    return email.split('@')[0] || null;
  }

  return null;
}

export function ListDetailScreen({ navigation, route }: ListDetailScreenProps) {
  const { listId } = route.params;
  const theme = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeletingList, setIsDeletingList] = useState(false);
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
  const [photoViewerOwnerLabels, setPhotoViewerOwnerLabels] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);

  const listQuery = useQuery({
    queryKey: ['feature', 'restaurantList', listId],
    queryFn: () => getRestaurantListById(listId),
  });

  const listItemsQuery = useInfiniteQuery({
    queryKey: ['feature', 'restaurantListItems', listId, 'paginated'],
    queryFn: ({ pageParam }) => listRestaurantListItemsPage(listId, { page: pageParam, pageSize: 20 }),
    enabled: !!listQuery.data,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
  });

  const myListsQuery = useInfiniteQuery({
    queryKey: ['feature', 'restaurantLists', 'my', 'paginated'],
    queryFn: ({ pageParam }) => listRestaurantListsPage({ scope: 'my', page: pageParam, pageSize: 20 }),
    enabled: Boolean(user?.id && listQuery.data && listQuery.data.userId !== user.id),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
  });

  const list = listQuery.data;
  const isOwner = Boolean(list && user?.id && list.userId === user.id);
  const listItems = useMemo(
    () => listItemsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [listItemsQuery.data],
  );
  const hasBlockingListItemsError =
    listItemsQuery.isError && (!listItemsQuery.data || listItemsQuery.data.pages.length === 0);
  const hasListItemsRefreshError = !hasBlockingListItemsError && listItemsQuery.isError;
  const visibleFoodItemIds = useMemo(() => {
    const ids = new Set<string>();

    for (const listItem of listItems ?? []) {
      const bookmarkedItems = Array.isArray(listItem.bookmarkedItems) ? listItem.bookmarkedItems : [];
      for (const item of bookmarkedItems) {
        ids.add(item.id);
        if (item.userFoodItemId) {
          ids.add(item.userFoodItemId);
        }
      }
    }

    return Array.from(ids);
  }, [listItems]);

  const myBookmarkedLinksQuery = useIncrementalIdQuery({
    queryKey: ['feature', 'myBookmarkedListItemLinks', 'restaurantList', listId, user?.id ?? 'anonymous'],
    ids: visibleFoodItemIds,
    enabled: Boolean(user?.id && listQuery.data && listQuery.data.userId !== user.id),
    fetchByIds: listMyBookmarkedListItemLinksForFoodItemIds,
    getRecordIds: getRestaurantListItemLinkFoodItemIds,
    getRecordKey: (link) => link.id,
  });

  const visitPhotosQuery = useIncrementalIdQuery({
    queryKey: ['feature', 'visitPhotos', 'foodItems', 'restaurantList', listId],
    ids: visibleFoodItemIds,
    enabled: Boolean(listQuery.data),
    fetchByIds: listVisitPhotosForFoodItemIds,
    getRecordIds: (photo) => (photo.food_item ? [photo.food_item] : []),
    getRecordKey: (photo) => photo.id,
  });

  const myLists = useMemo(() => myListsQuery.data?.pages.flatMap((page) => page.items) ?? [], [myListsQuery.data]);
  const savedListIdsByBookmarkLookupId = useMemo(() => {
    const mapping = new Map<string, Set<string>>();
    for (const link of myBookmarkedLinksQuery.data ?? []) {
      for (const bookmarkLookupId of getRestaurantListItemLinkFoodItemIds(link)) {
        const listIds = mapping.get(bookmarkLookupId) ?? new Set<string>();
        listIds.add(link.listId);
        mapping.set(bookmarkLookupId, listIds);
      }
    }
    return mapping;
  }, [myBookmarkedLinksQuery.data]);

  const savedBookmarkLookupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const bookmarkLookupId of savedListIdsByBookmarkLookupId.keys()) {
      ids.add(bookmarkLookupId);
    }
    return ids;
  }, [savedListIdsByBookmarkLookupId]);

  const defaultList = useMemo(() => myLists.find((candidate) => candidate.isDefault), [myLists]);
  const nonDefaultLists = useMemo(() => myLists.filter((candidate) => !candidate.isDefault), [myLists]);
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
          notes: [],
          firstPosition: listItem.position,
          items: [],
        };

      group.firstPosition = Math.min(group.firstPosition, listItem.position);
      group.restaurantName = listItem.restaurantName;
      group.restaurantCity = listItem.restaurantCity;
      group.restaurantCuisineType = listItem.restaurantCuisineType;

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

  const photosByFoodItemId = useMemo(() => {
    const map = new Map<string, VisitPhotoRecord[]>();

    for (const photo of visitPhotosQuery.data ?? []) {
      if (!photo.food_item) {
        continue;
      }

      const existing = map.get(photo.food_item) ?? [];
      existing.push(photo);
      map.set(photo.food_item, existing);
    }

    return map;
  }, [visitPhotosQuery.data]);

  const buildOwnerDisplayItems = (items: GroupedBookmarkedItem[]): OwnerDisplayItem[] => {
    const rows = new Map<string, OwnerDisplayItem>();

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item) {
        continue;
      }

      const normalizedKey = normalizeMenuItemKey(item.name);
      const existing = rows.get(normalizedKey);
      const nextRow: OwnerDisplayItem =
        existing ??
        {
          key: normalizedKey || `${item.listItemId}:${item.foodItemId}`,
          name: item.name,
          orderIndex: index,
        };

      const hasSourceBookmark = Boolean(item.sourceUserId || item.sourceUserName);
      if (hasSourceBookmark && !nextRow.source) {
        nextRow.source = {
          listItemId: item.listItemId,
          foodItemId: item.foodItemId,
          sourceUserName: item.sourceUserName?.trim() || 'Friend',
          rating: item.rating,
          visitedAt: item.visitedAt,
        };
      }

      const linkedUserRating =
        item.userFoodItemId && item.userFoodItemRating
          ? {
              kind: 'linked' as const,
              listItemId: item.listItemId,
              userFoodItemId: item.userFoodItemId,
              rating: item.userFoodItemRating,
              visitedAt: item.userFoodItemVisitedAt,
            }
          : null;

      const standaloneUserRating =
        !hasSourceBookmark && item.rating > 0
          ? {
              kind: 'standalone' as const,
              listItemId: item.listItemId,
              foodItemId: item.foodItemId,
              rating: item.rating,
              visitedAt: item.visitedAt,
            }
          : null;

      const nextUserRating = linkedUserRating ?? standaloneUserRating;
      if (nextUserRating) {
        const shouldReplaceExisting =
          !nextRow.user || (nextRow.user.kind === 'standalone' && nextUserRating.kind === 'linked');

        if (shouldReplaceExisting) {
          nextRow.user = nextUserRating;
        }
      }

      rows.set(normalizedKey, nextRow);
    }

    return Array.from(rows.values()).sort((left, right) => left.orderIndex - right.orderIndex);
  };

  const getUserPhotoFoodItemId = (userRating: OwnerUserRating): string =>
    userRating.kind === 'linked' ? userRating.userFoodItemId : userRating.foodItemId;

  const buildOwnerItemPhotoEntries = (item: OwnerDisplayItem): OwnerItemPhotoEntry[] => {
    const entriesById = new Map<string, OwnerItemPhotoEntry>();

    const appendPhotos = (foodItemId: string | undefined, fallbackOwnerLabel: string) => {
      if (!foodItemId) {
        return;
      }

      const photos = photosByFoodItemId.get(foodItemId) ?? [];
      for (const photo of photos) {
        const ownerLabel = resolveExpandedPhotoOwnerName(photo) || fallbackOwnerLabel;
        entriesById.set(photo.id, {
          id: photo.id,
          url: buildPocketBaseFileUrl({
            collectionId: photo.collectionId,
            collectionName: photo.collectionName ?? 'visit_photos',
            recordId: photo.id,
            filename: photo.photo,
          }),
          ownerLabel,
        });
      }
    };

    if (item.source) {
      appendPhotos(item.source.foodItemId, item.source.sourceUserName);
    }

    if (item.user) {
      appendPhotos(getUserPhotoFoodItemId(item.user), 'You');
    }

    return Array.from(entriesById.values());
  };

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
    setPhotoViewerUrls(entries.map((entry) => entry.url));
    setPhotoViewerOwnerLabels(entries.map((entry) => entry.ownerLabel));
    setPhotoViewerInitialIndex(boundedIndex);
    setPhotoViewerVisible(true);
  }, []);

  const closePhotoViewer = useCallback(() => {
    setPhotoViewerVisible(false);
  }, []);

  const styles = StyleSheet.create({
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
      flexDirection: 'row',
      gap: theme.spacing.xs,
      alignItems: 'center',
      flexWrap: 'wrap',
      flex: 1,
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
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.xxs,
    },
    locationText: {
      color: theme.colors.text.secondary,
      ...theme.typography.bodyMd,
    },
    section: {
      borderTopColor: theme.colors.border.subtle,
      borderTopWidth: 1,
      gap: theme.spacing.xs,
      paddingTop: theme.spacing.sm,
    },
    ownerItemCard: {
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      gap: theme.spacing.xxs,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    ownerItemHeaderRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
      justifyContent: 'space-between',
    },
    itemPhotoWrap: {
      position: 'relative',
    },
    itemPhotoThumb: {
      backgroundColor: theme.colors.border.subtle,
      borderRadius: theme.radii.sm,
      height: 52,
      width: 52,
    },
    itemPhotoCountBadge: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.inverse,
      borderRadius: theme.radii.pill,
      justifyContent: 'center',
      minWidth: 18,
      paddingHorizontal: 4,
      position: 'absolute',
      left: 2,
      top: 2,
    },
    itemPhotoCountText: {
      color: theme.colors.text.inverse,
      ...theme.typography.bodySmTightBold,
    },
    ownerItemName: {
      color: theme.colors.text.primary,
      flex: 1,
      ...theme.typography.titleSm,
    },
    ownerItemMetaRow: {
      alignItems: 'center',
      columnGap: theme.spacing.xxs,
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: 4,
    },
    ownerItemMetaDate: {
      color: theme.colors.text.muted,
      ...theme.typography.bodySm,
    },
    ownerBookmarkRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
      justifyContent: 'space-between',
    },
    ownerBookmarkMeta: {
      alignItems: 'center',
      columnGap: theme.spacing.xxs,
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: 4,
    },
    bookmarkedItemBlock: {
      gap: 2,
    },
    bookmarkedItemRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: theme.spacing.xs,
    },
    bookmarkedItemLeft: {
      alignItems: 'center',
      columnGap: theme.spacing.xxs,
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: 4,
    },
    sourceUserRow: {
      alignItems: 'center',
      backgroundColor: theme.colors.status.infoBg,
      borderColor: theme.colors.border.info,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 1,
    },
    sourceUserText: {
      color: theme.colors.text.info,
      ...theme.typography.bodySmTightBold,
    },
    bookmarkedItemName: {
      color: theme.colors.text.primary,
      ...theme.typography.bodyLgTightMedium,
      flexShrink: 1,
    },
    metaDot: {
      color: theme.colors.text.muted,
      ...theme.typography.bodySm,
    },
    bookmarkedDate: {
      color: theme.colors.text.muted,
      ...theme.typography.bodySm,
    },
    ownerItemActions: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 4,
    },
    ownerYouRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
      justifyContent: 'space-between',
    },
    iWentButton: {
      alignItems: 'center',
      borderRadius: theme.radii.sm,
      flexDirection: 'row',
      gap: 2,
      minHeight: 22,
      paddingHorizontal: theme.spacing.xs,
    },
    iWentButtonPressed: {
      backgroundColor: theme.colors.status.successBg,
    },
    iWentButtonLabel: {
      color: theme.colors.text.success,
      ...theme.typography.bodySmTightSemiBold,
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
    itemDeleteButton: {
      alignItems: 'center',
      borderRadius: theme.radii.pill,
      height: 24,
      justifyContent: 'center',
      width: 24,
    },
    itemDeleteButtonPressed: {
      backgroundColor: theme.colors.status.dangerBg,
    },
    itemBookmarkButton: {
      alignItems: 'center',
      borderRadius: theme.radii.sm,
      height: 26,
      justifyContent: 'center',
      width: 26,
    },
    itemBookmarkButtonPressed: {
      backgroundColor: theme.colors.status.infoBg,
    },
    noteText: {
      color: theme.colors.text.secondary,
      fontStyle: 'italic',
      ...theme.typography.bodyMd,
    },
    ownerReviewRow: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.xxs,
      marginTop: 1,
    },
    ownerReviewArrow: {
      color: theme.colors.text.info,
      ...theme.typography.bodySm,
    },
    ownerReviewText: {
      color: theme.colors.text.info,
      ...theme.typography.bodySmTightSemiBold,
    },
    ownerReviewDate: {
      color: theme.colors.text.info,
      ...theme.typography.bodySm,
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
  });

  const subtitle = useMemo(() => {
    const restaurantCount = groupedRestaurants.length;
    const countLabel = `${restaurantCount}${listItemsQuery.hasNextPage ? '+' : ''} ${restaurantCount === 1 ? 'restaurant' : 'restaurants'}`;
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
  }, [groupedRestaurants.length, isOwner, list, listItemsQuery.hasNextPage]);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Lists');
  };

  const deleteList = async () => {
    if (!list || !isOwner || list.isDefault) {
      return;
    }

    trackObservabilityEvent('LIST_DETAIL_DELETE_CONFIRMED', {
      source: 'ListDetailScreen',
      isOnline,
      isDefaultList: Boolean(list.isDefault),
    });
    setErrorMessage(null);
    setIsDeletingList(true);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('list.delete', { listId: list.id });
        await queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] });
        queryClient.removeQueries({ queryKey: ['feature', 'restaurantList', list.id] });
        queryClient.removeQueries({ queryKey: ['feature', 'restaurantListItems', list.id] });
        setIsDeleteConfirmVisible(false);
        showQueuedOfflineAlert('List delete');
        navigation.navigate('Lists');
        return;
      }

      await queueWrite('list.delete');
      await deleteRestaurantList(list.id);
      await queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] });
      queryClient.removeQueries({ queryKey: ['feature', 'restaurantList', list.id] });
      queryClient.removeQueries({ queryKey: ['feature', 'restaurantListItems', list.id] });
      setIsDeleteConfirmVisible(false);
      navigation.navigate('Lists');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete list.';
      setErrorMessage(message);
    } finally {
      setIsDeletingList(false);
    }
  };

  const confirmDeleteList = () => {
    if (!list || !isOwner) {
      return;
    }

    trackObservabilityEvent('LIST_DETAIL_DELETE_TAPPED', {
      source: 'ListDetailScreen',
      isDefaultList: Boolean(list.isDefault),
    });
    if (list.isDefault) {
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
      source: 'ListDetailScreen',
      direction,
      isOnline,
    });
    setErrorMessage(null);
    setMovingRestaurantId(restaurantId);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('list.restaurant.reorder', { listId, restaurantId, direction });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantList', listId] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantListItems', listId] }),
        ]);
        showQueuedOfflineAlert('List reorder');
        return;
      }

      await queueWrite('list.restaurant.reorder');
      await moveRestaurantListRestaurant({ listId, restaurantId, direction });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantList', listId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantListItems', listId] }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not reorder restaurant.';
      setErrorMessage(message);
    } finally {
      setMovingRestaurantId(null);
    }
  };

  const handleRemoveSourceRating = async (input: { listItemId: string; foodItemId: string }): Promise<boolean> => {
    if (!isOwner) {
      return false;
    }

    trackObservabilityEvent('LIST_DETAIL_SOURCE_RATING_REMOVE_TAPPED', {
      source: 'ListDetailScreen',
      isOnline,
    });
    setErrorMessage(null);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('list.restaurant.remove.source', {
          listId,
          listItemId: input.listItemId,
          foodItemId: input.foodItemId,
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantList', listId] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantListItems', listId] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantListItemLinks', listId] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] }),
        ]);
        showQueuedOfflineAlert('List update');
        return true;
      }

      await queueWrite('list.restaurant.remove.source');
      await removeRestaurantListSourceRating({
        listId,
        listItemId: input.listItemId,
        foodItemId: input.foodItemId,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantList', listId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantListItems', listId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantListItemLinks', listId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] }),
      ]);
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

    trackObservabilityEvent('LIST_DETAIL_USER_RATING_REMOVE_TAPPED', {
      source: 'ListDetailScreen',
      isOnline,
    });
    setErrorMessage(null);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('list.restaurant.remove.user', { listId, listItemId });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantList', listId] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantListItems', listId] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantListItemLinks', listId] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] }),
        ]);
        showQueuedOfflineAlert('List update');
        return true;
      }

      await queueWrite('list.restaurant.remove.user');
      await removeRestaurantListUserRating(listId, listItemId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantList', listId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantListItems', listId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantListItemLinks', listId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] }),
      ]);
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
              });

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

  const saveBookmarkToLists = async (targetListIds: string[]) => {
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

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['feature', 'myBookmarkedListItemLinks'] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists', 'my'] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] }),
        ]);

        setSaveBookmarkTarget(null);
        setSelectedSaveListIds(new Set());
        setSaveModalError(null);
        showQueuedOfflineAlert('Bookmark save');
        return;
      }

      await queueWrite('list.bookmark.save');

      for (const targetListId of targetListIds) {
        await saveRestaurantFoodItemToList({
          listId: targetListId,
          restaurantId: saveBookmarkTarget.restaurantId,
          foodItemId: saveBookmarkTarget.foodItemId,
          note: saveBookmarkTarget.sourceNote,
          sourceUserId: list.userId,
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'myBookmarkedListItemLinks'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] }),
      ]);

      setSaveBookmarkTarget(null);
      setSelectedSaveListIds(new Set());
      setSaveModalError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save this bookmark.';
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

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['feature', 'myBookmarkedListItemLinks'] }),
            queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists', 'my'] }),
            queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] }),
          ]);
          setSaveBookmarkTarget(null);
          setSelectedSaveListIds(new Set());
          setSaveModalError(null);
          showQueuedOfflineAlert('Saved list + bookmark');
          return;
        }

        await queueWrite('list.default.create');
        const createdDefaultList = await createDefaultRestaurantList();
        targetDefaultListId = createdDefaultList.id;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not create your Saved list.';
        setSaveModalError(message);
        return;
      }
    }

    if (!targetDefaultListId) {
      setSaveModalError('Saved list is not available.');
      return;
    }

    if (alreadySavedListIdsForTarget.has(targetDefaultListId)) {
      setSaveModalError('This item is already in your Saved list.');
      return;
    }

    await saveBookmarkToLists([targetDefaultListId]);
  };

  const handleSaveToSelectedLists = async () => {
    const targetListIds = Array.from(selectedSaveListIds).filter((targetListId) => !alreadySavedListIdsForTarget.has(targetListId));
    trackObservabilityEvent('LIST_DETAIL_SAVE_SELECTED_TAPPED', {
      source: 'ListDetailScreen',
      selectedListCount: targetListIds.length,
    });
    if (targetListIds.length === 0) {
      setSaveModalError('Select at least one list.');
      return;
    }

    await saveBookmarkToLists(targetListIds);
  };

  if (listQuery.isLoading || listItemsQuery.isLoading) {
    return (
      <FeatureDetailScreenScaffold onBackPress={handleBack} title="List">
        <Skeleton height={20} />
        <Skeleton height={20} />
      </FeatureDetailScreenScaffold>
    );
  }

  if (listQuery.isError || hasBlockingListItemsError) {
    return (
      <FeatureDetailScreenScaffold onBackPress={handleBack} title="List">
        <ErrorState
          description="Could not load list detail."
          onRetry={() => {
            void listQuery.refetch();
            void listItemsQuery.refetch();
          }}
          title="List detail unavailable"
        />
      </FeatureDetailScreenScaffold>
    );
  }

  if (!list) {
    return (
      <FeatureDetailScreenScaffold onBackPress={handleBack} title="List">
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
      onBackPress={handleBack}
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
          errorMessage={hasListItemsRefreshError ? 'Could not refresh all list items. Showing saved data.' : null}
          onAction={() => {
            void listItemsQuery.refetch();
          }}
          title="List items unavailable"
        />
        <PageErrorToast
          actionLabel="Retry"
          errorMessage={!isOwner && myListsQuery.isError ? 'Could not load your lists.' : null}
          onAction={() => {
            void myListsQuery.refetch();
          }}
          title="Lists unavailable"
        />
        <PageErrorToast
          actionLabel="Retry"
          errorMessage={!isOwner && myBookmarkedLinksQuery.isError ? 'Could not load bookmark status.' : null}
          onAction={() => {
            void myBookmarkedLinksQuery.refetch();
          }}
          title="Bookmark status unavailable"
        />
        <PageErrorToast
          actionLabel="Retry"
          errorMessage={visitPhotosQuery.isError ? 'Could not load menu item photos.' : null}
          onAction={() => {
            void visitPhotosQuery.refetch();
          }}
          title="Photos unavailable"
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
            const locationLabel =
              [group.restaurantCity, group.restaurantCuisineType].filter(Boolean).join(' • ') || 'Location not set';
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
                      {groupIndex < groupedRestaurants.length - 1 || listItemsQuery.hasNextPage ? (
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

                <View style={styles.locationRow}>
                  <Ionicons color={theme.colors.text.muted} name="location-outline" size={14} />
                  <Text style={styles.locationText}>{locationLabel}</Text>
                </View>

                <View style={styles.section}>
                  <SectionHeader
                    title={isOwner ? 'Bookmarked Items' : 'Recommended Items'}
                    titleTone="secondary"
                  />
                  {group.items.length === 0 ? (
                    <Text style={styles.emptyItemsText}>No items added yet.</Text>
                  ) : isOwner ? (
                    ownerDisplayItems.map((item, itemIndex) => {
                      const sourceRating = item.source;
                      const userRating = item.user;
                      const itemPhotoEntries = buildOwnerItemPhotoEntries(item);
                      const itemPrimaryPhotoUrl = itemPhotoEntries[0]?.url;
                      const sourceMonthYearLabel = formatMonthYearLabel(sourceRating?.visitedAt);
                      const userDisplayDateLabel =
                        formatFullDateLabel(userRating?.visitedAt) ?? formatMonthYearLabel(userRating?.visitedAt);
                      const canShowIWent = Boolean(sourceRating && !userRating);

                      return (
                        <View key={item.key} style={styles.ownerItemCard}>
                          <View style={styles.ownerItemHeaderRow}>
                            <Text numberOfLines={1} style={styles.ownerItemName}>
                              {item.name}
                            </Text>
                            {itemPrimaryPhotoUrl ? (
                              <Pressable
                                accessibilityLabel={`View photos for ${item.name}`}
                                accessibilityRole="button"
                                onPress={() => {
                                  openPhotoViewer(itemPhotoEntries);
                                }}
                                style={styles.itemPhotoWrap}
                                testID={`list-detail-photo-button-${groupIndex}-${itemIndex}`}
                              >
                                <Image source={{ uri: itemPrimaryPhotoUrl }} style={styles.itemPhotoThumb} />
                                {itemPhotoEntries.length > 1 ? (
                                  <View style={styles.itemPhotoCountBadge}>
                                    <Text style={styles.itemPhotoCountText}>+{itemPhotoEntries.length - 1}</Text>
                                  </View>
                                ) : null}
                              </Pressable>
                            ) : null}
                          </View>

                          {sourceRating ? (
                            <View style={styles.ownerBookmarkRow}>
                              <View style={styles.ownerBookmarkMeta}>
                                <View style={styles.sourceUserRow}>
                                  <Ionicons color={theme.colors.text.info} name="people-outline" size={11} />
                                  <Text style={styles.sourceUserText}>{sourceRating.sourceUserName}</Text>
                                </View>
                                {sourceRating.rating > 0 ? <RatingPill rating={sourceRating.rating} /> : null}
                                {sourceMonthYearLabel ? (
                                  <Text style={styles.ownerItemMetaDate}>{sourceMonthYearLabel}</Text>
                                ) : null}
                              </View>

                              <View style={styles.ownerItemActions}>
                                {canShowIWent ? (
                                  <Pressable
                                    accessibilityLabel={`I went for ${item.name}`}
                                    accessibilityRole="button"
                                    onPress={() => {
                                      handleIWentThere(group, {
                                        listItemId: sourceRating.listItemId,
                                        name: item.name,
                                      });
                                    }}
                                    style={({ pressed }) => [styles.iWentButton, pressed && styles.iWentButtonPressed]}
                                    testID={`i-went-list-item-${sourceRating.listItemId}`}
                                  >
                                    <Ionicons color={theme.colors.text.success} name="location-outline" size={12} />
                                    <Text style={styles.iWentButtonLabel}>I went</Text>
                                  </Pressable>
                                ) : null}
                                <Pressable
                                  accessibilityLabel={`Remove bookmarked rating for ${item.name}`}
                                  accessibilityRole="button"
                                  onPress={() => {
                                    confirmDeleteItem({
                                      kind: 'source',
                                      itemName: item.name,
                                      listItemId: sourceRating.listItemId,
                                      foodItemId: sourceRating.foodItemId,
                                    });
                                  }}
                                  style={({ pressed }) => [styles.itemDeleteButton, pressed && styles.itemDeleteButtonPressed]}
                                  testID={`remove-source-rating-${sourceRating.listItemId}-${sourceRating.foodItemId}`}
                                >
                                  <Ionicons color={theme.colors.text.danger} name="trash-outline" size={15} />
                                </Pressable>
                              </View>
                            </View>
                          ) : null}

                          {userRating ? (
                            <View style={styles.ownerYouRow}>
                              <View style={styles.ownerReviewRow}>
                                <Text style={styles.ownerReviewArrow}>↳</Text>
                                <Text style={styles.ownerReviewText}>You</Text>
                                <RatingPill rating={userRating.rating} />
                                {userDisplayDateLabel ? <Text style={styles.ownerReviewDate}>{userDisplayDateLabel}</Text> : null}
                              </View>
                              <Pressable
                                accessibilityLabel={`Remove your rating for ${item.name}`}
                                accessibilityRole="button"
                                onPress={() => {
                                  if (userRating.kind === 'linked') {
                                    confirmDeleteItem({
                                      kind: 'user-linked',
                                      itemName: item.name,
                                      listItemId: userRating.listItemId,
                                    });
                                    return;
                                  }

                                  confirmDeleteItem({
                                    kind: 'user-standalone',
                                    itemName: item.name,
                                    listItemId: userRating.listItemId,
                                    foodItemId: userRating.foodItemId,
                                  });
                                }}
                                style={({ pressed }) => [styles.itemDeleteButton, pressed && styles.itemDeleteButtonPressed]}
                                testID={
                                  userRating.kind === 'linked'
                                    ? `remove-user-rating-${userRating.listItemId}-${userRating.userFoodItemId}`
                                    : `remove-list-item-${userRating.listItemId}-${userRating.foodItemId}`
                                }
                              >
                                <Ionicons color={theme.colors.text.danger} name="trash-outline" size={15} />
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      );
                    })
                  ) : (
                    group.items.map((item) => {
                      const monthYearLabel = formatMonthYearLabel(item.visitedAt);
                      const hasSourceBookmark = Boolean(item.sourceUserId || item.sourceUserName);
                      const isSaved = item.bookmarkLookupIds.some((bookmarkLookupId) =>
                        savedBookmarkLookupIds.has(bookmarkLookupId),
                      );
                      const sourceUserDisplayName = item.sourceUserName?.trim() || 'Friend';

                      return (
                        <View key={item.key} style={styles.bookmarkedItemBlock}>
                          <View style={styles.bookmarkedItemRow}>
                            <View style={styles.bookmarkedItemLeft}>
                              {hasSourceBookmark ? (
                                <View style={styles.sourceUserRow}>
                                  <Ionicons color={theme.colors.text.info} name="people-outline" size={11} />
                                  <Text style={styles.sourceUserText}>{sourceUserDisplayName}</Text>
                                </View>
                              ) : null}
                              <Text numberOfLines={1} style={styles.bookmarkedItemName}>
                                {item.name}
                              </Text>
                              {item.rating > 0 ? (
                                <>
                                  <Text style={styles.metaDot}>•</Text>
                                  <RatingPill rating={item.rating} />
                                </>
                              ) : null}
                              {monthYearLabel ? (
                                <>
                                  <Text style={styles.metaDot}>•</Text>
                                  <Text style={styles.bookmarkedDate}>{monthYearLabel}</Text>
                                </>
                              ) : null}
                            </View>
                            <Pressable
                              accessibilityLabel={`Save ${item.name} to my lists`}
                              accessibilityRole="button"
                              onPress={() => {
                                openSaveModal(group, item);
                              }}
                              style={({ pressed }) => [styles.itemBookmarkButton, pressed && styles.itemBookmarkButtonPressed]}
                              testID={`save-list-item-${item.listItemId}`}
                            >
                              <Ionicons
                                color={isSaved ? theme.colors.text.info : theme.colors.text.muted}
                                name={isSaved ? 'bookmark' : 'bookmark-outline'}
                                size={18}
                              />
                            </Pressable>
                          </View>
                        </View>
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

        {groupedRestaurants.length > 0 && listItemsQuery.hasNextPage ? (
          <Button
            label={listItemsQuery.isFetchingNextPage ? 'Loading more...' : 'Load more restaurants'}
            loading={listItemsQuery.isFetchingNextPage}
            onPress={() => {
              void listItemsQuery.fetchNextPage();
            }}
            variant="secondary"
          />
        ) : null}
      </View>

      <PhotoViewerModal
        initialIndex={photoViewerInitialIndex}
        onRequestClose={closePhotoViewer}
        ownerLabels={photoViewerOwnerLabels}
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
            Boolean(defaultList?.id && alreadySavedListIdsForTarget.has(defaultList.id))
          }
          label={
            defaultList?.id && alreadySavedListIdsForTarget.has(defaultList.id)
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

        {nonDefaultLists.length > 0 ? (
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
                        <Text numberOfLines={1} style={styles.saveListDescription}>
                          {targetList.description}
                        </Text>
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

        {!isOwner && myListsQuery.hasNextPage ? (
          <Button
            label={myListsQuery.isFetchingNextPage ? 'Loading more lists...' : 'Load more lists'}
            loading={myListsQuery.isFetchingNextPage}
            onPress={() => {
              void myListsQuery.fetchNextPage();
            }}
            variant="secondary"
          />
        ) : null}

        {saveModalError ? <Text style={styles.saveModalError}>{saveModalError}</Text> : null}
      </Modal>
    </FeatureDetailScreenScaffold>
  );
}
