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
import { useQueryListState } from '../hooks/useListQueryState';
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
  buildBookmarkLookupIds,
  formatFullDateLabel,
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

function hasUsableCoordinates(group: GroupedRestaurant): group is GroupedRestaurant & {
  latitude: number;
  longitude: number;
} {
  return (
    typeof group.latitude === 'number' &&
    typeof group.longitude === 'number' &&
    Number.isFinite(group.latitude) &&
    Number.isFinite(group.longitude) &&
    group.latitude >= -90 &&
    group.latitude <= 90 &&
    group.longitude >= -180 &&
    group.longitude <= 180 &&
    !(group.latitude === 0 && group.longitude === 0)
  );
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
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
          restaurantLocation: listItem.restaurantLocation,
          restaurantCity: listItem.restaurantCity,
          restaurantCuisineType: listItem.restaurantCuisineType,
          restaurantVisibility: listItem.restaurantVisibility,
          latitude: listItem.latitude,
          longitude: listItem.longitude,
          notes: [],
          firstPosition: listItem.position,
          items: [],
        };

      group.firstPosition = Math.min(group.firstPosition, listItem.position);
      group.restaurantName = listItem.restaurantName;
      group.restaurantLocation = listItem.restaurantLocation;
      group.restaurantCity = listItem.restaurantCity;
      group.restaurantCuisineType = listItem.restaurantCuisineType;
      group.restaurantVisibility = listItem.restaurantVisibility;
      group.latitude = listItem.latitude;
      group.longitude = listItem.longitude;

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

  const listDetailMapGroups = useMemo<RestaurantMapGroup[]>(() => {
    return groupedRestaurants.filter(hasUsableCoordinates).map((group, groupIndex) => {
      const items = isOwner
        ? buildOwnerDisplayItems(group.items).map((item) => {
            const photoEntries = buildOwnerPhotoEntries(item, photosByFoodItemId);
            const sourceDateLabel = formatMonthYearLabel(item.source?.visitedAt);
            const userDateLabel =
              formatFullDateLabel(item.user?.visitedAt) ?? formatMonthYearLabel(item.user?.visitedAt);
            const primaryPhoto = photoEntries[0] ?? null;

            return {
              id: item.key,
              meta: [
                {
                  dateLabel: sourceDateLabel,
                  label: item.source?.sourceUserName,
                  rating: item.source?.rating,
                },
                {
                  dateLabel: userDateLabel,
                  label: item.user ? 'You' : undefined,
                  rating: item.user?.rating,
                },
              ],
              name: item.name,
              onOpenPhotos:
                photoEntries.length > 0
                  ? () => {
                      openPhotoViewer(photoEntries);
                    }
                  : undefined,
              photoCount: photoEntries.length,
              photoThumbnailUrl: primaryPhoto?.previewUrl ?? null,
            };
          })
        : group.items.map((item) => {
            const photoEntries = buildBookmarkedPhotoEntries(item, photosByFoodItemId);
            const primaryPhoto = photoEntries[0] ?? null;
            const sourceUserDisplayName = item.sourceUserName?.trim() || (item.sourceUserId ? 'Friend' : undefined);

            return {
              id: item.key,
              meta: [
                {
                  dateLabel: formatMonthYearLabel(item.visitedAt),
                  label: sourceUserDisplayName,
                  rating: item.rating,
                },
              ],
              name: item.name,
              notes: item.sourceNote,
              onOpenPhotos:
                photoEntries.length > 0
                  ? () => {
                      openPhotoViewer(photoEntries);
                    }
                  : undefined,
              photoCount: photoEntries.length,
              photoThumbnailUrl: primaryPhoto?.previewUrl ?? null,
            };
          });

      return {
        id: group.restaurantId,
        items,
        latitude: group.latitude,
        longitude: group.longitude,
        notes: group.notes,
        restaurantLocation: group.restaurantLocation ?? group.restaurantCity,
        restaurantName: group.restaurantName,
        summary: `${groupIndex + 1}. ${pluralize(items.length, isOwner ? 'bookmarked item' : 'recommended item', isOwner ? 'bookmarked items' : 'recommended items')}`,
      };
    });
  }, [groupedRestaurants, isOwner, openPhotoViewer, photosByFoodItemId]);

  const omittedListMapRestaurants = groupedRestaurants.length - listDetailMapGroups.length;

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

  const resolveShareUrl = (shareLink: { path?: string; url?: string }) => {
    const path = shareLink.path?.trim();
    if (path) {
      return `${env.appWebUrl.replace(/\/$/, '')}${path}`;
    }

    return shareLink.url?.trim() ?? '';
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
      const shareLink = isRegenerate
        ? await regenerateRestaurantListShareLink(list.id)
        : await getOrCreateRestaurantListShareLink(list.id);
      const shareUrl = resolveShareUrl(shareLink);
      if (!shareUrl) {
        throw new Error('Could not create a share link.');
      }

      await Share.share({
        message: `View my Yummy Recs list "${list.name}": ${shareUrl}`,
      });
      await detailQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: restaurantListQueryKeys.root });
      setShareSheetVisible(false);
      trackProductEvent('social.invite_shared', {
        source: 'ListDetailScreen',
        shareMethod: 'restaurant_list_link',
      });
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
      await disableRestaurantListShareLink(list.id);
      await detailQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: restaurantListQueryKeys.root });
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
      const result = await restaurantListWrites.reorderRestaurant({
        listId,
        restaurantId,
        direction,
      });
      trackObservabilityEvent('LIST_DETAIL_REORDER_SUCCEEDED', {
        ...listAnalyticsContext,
        direction,
        queued: result.status === 'queued',
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
      const result = await restaurantListWrites.removeRestaurantListSourceRating({
        listId,
        listItemId: input.listItemId,
        foodItemId: input.foodItemId,
      });
      trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_SUCCEEDED', {
        ...listAnalyticsContext,
        itemKind,
        queued: result.status === 'queued',
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
      const result = await restaurantListWrites.removeRestaurantListUserRating({ listId, listItemId });
      trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_SUCCEEDED', {
        ...listAnalyticsContext,
        itemKind: 'user_linked',
        queued: result.status === 'queued',
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

    trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_STARTED', {
      source: 'ListDetailScreen',
      targetListCount: targetListIds.length,
      isOnline,
    });
    setSaveModalError(null);
    setIsSavingBookmark(true);

    try {
      const result = await restaurantListWrites.saveBookmarkToLists({
        listIds: targetListIds,
        sourceListId: listId,
        bookmark: {
          restaurantId: saveBookmarkTarget.restaurantId,
          foodItemId: saveBookmarkTarget.foodItemId,
          note: saveBookmarkTarget.sourceNote,
          sourceUserId: list.userId,
        },
      });
      trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_SUCCEEDED', {
        source: 'ListDetailScreen',
        entryMethod: trackingContext.entryMethod,
        queued: result.status === 'queued',
        targetListCount: targetListIds.length,
        createdDefaultList: trackingContext.createdDefaultList,
        isOnline,
      });
      trackProductEvent('social.recommendation_saved', {
        source: 'ListDetailScreen',
        entryMethod: trackingContext.entryMethod,
        queued: result.status === 'queued',
        targetListCount: targetListIds.length,
        createdDefaultList: trackingContext.createdDefaultList,
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
    const targetDefaultListId = defaultList?.id;

    if (!targetDefaultListId && !list?.userId) {
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

    if (targetDefaultListId && alreadySavedListIdsForTarget.has(targetDefaultListId)) {
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

    trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_STARTED', {
      source: 'ListDetailScreen',
      targetListCount: 1,
      isOnline,
    });
    setSaveModalError(null);
    setIsSavingBookmark(true);

    try {
      const result = await restaurantListWrites.saveBookmarkToDefaultList({
        defaultListId: targetDefaultListId,
        sourceListId: listId,
        bookmark: {
          restaurantId: saveBookmarkTarget.restaurantId,
          foodItemId: saveBookmarkTarget.foodItemId,
          note: saveBookmarkTarget.sourceNote,
          sourceUserId: list?.userId,
        },
      });

      trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_SUCCEEDED', {
        source: 'ListDetailScreen',
        entryMethod: 'quick_default',
        queued: result.status === 'queued',
        targetListCount: 1,
        createdDefaultList: !defaultList?.id,
        isOnline,
      });
      trackProductEvent('social.recommendation_saved', {
        source: 'ListDetailScreen',
        entryMethod: 'quick_default',
        queued: result.status === 'queued',
        targetListCount: 1,
        createdDefaultList: !defaultList?.id,
      });
      setSaveBookmarkTarget(null);
      setSelectedSaveListIds(new Set());
      setSaveModalError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save this bookmark.';
      trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_FAILED', {
        source: 'ListDetailScreen',
        entryMethod: 'quick_default',
        stage: targetDefaultListId ? 'bookmark_save' : 'default_list_create',
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        targetListCount: 1,
        createdDefaultList: !defaultList?.id,
        isOnline,
      });
      setSaveModalError(message);
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
          errorMessage={saveBookmarkTarget && !isOwner && detailQuery.isError ? 'Could not load your lists.' : null}
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
            omittedWithoutCoordinates={omittedListMapRestaurants}
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
