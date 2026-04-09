import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  View,
} from 'react-native';
import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import {
  EmptyState,
  FeedHeaderControls,
  HomeBetaQuickTrackFeedCard,
  HomeBetaVisitFeedCard,
  HomeFeedVisitEntryCard,
  HomeQuickTrackEntryCard,
  Skeleton,
  TabRootScreenScaffold,
  type FeedModeValue,
  type FeedTypeFilterValue,
} from '../components/shared';
import {
  createFriendSuggestionAcceptance,
  getAuthenticatedUserIdOrNull,
  type HomeFeedCursor,
  type HomeFeedPageResult,
  listHomeFeedPage,
  type QuickTrackRecord,
  type VisitRecord,
} from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import {
  clearPendingFriendSuggestion,
  getPendingFriendSuggestion,
  type PendingFriendSuggestion,
} from '../lib/pendingFriendSuggestion';
import { usePaginatedQueryState } from '../hooks/useListQueryState';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import { HomeFeedActionModals } from './home/HomeFeedActionModals';
import { type VisitPhotoRecord } from './home/shared';
import { useHomeFeedActionController } from './home/useHomeFeedActionController';

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
type FeedMode = FeedModeValue;
type TypeFilter = FeedTypeFilterValue;

interface BaseFeedItem {
  id: string;
  eventAt: string;
  searchText: string;
  isFriend: boolean;
  friendName?: string;
  source: 'visit' | 'quick-track';
}

interface VisitFeedItem extends BaseFeedItem {
  source: 'visit';
  visit: VisitRecord;
}

interface QuickTrackFeedItem extends BaseFeedItem {
  source: 'quick-track';
  quickTrack: QuickTrackRecord;
}

type FeedItem = VisitFeedItem | QuickTrackFeedItem;
type VisitShareItem = RootStackParamList['VisitShareCustomization']['items'][number];

interface GroupedMonth {
  monthKey: string;
  monthLabel: string;
  totalCount: number;
  visitsCount: number;
  quickTrackCount: number;
  entries: FeedItem[];
}

const useStyles = createThemedStyles((theme) => ({
  screenContent: {
    backgroundColor: theme.colors.background.muted,
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  header: {
    backgroundColor: theme.colors.background.surface,
    borderBottomColor: theme.colors.border.subtle,
    borderBottomWidth: 1,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  body: {
    flex: 1,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  betaFeed: {
    gap: theme.spacing.md,
  },
  deleteConfirmationModalSentinel: {
    backgroundColor: theme.colors.background.surface,
    height: 2,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 2,
    zIndex: 1,
  },
  reportActionTitle: {
    color: theme.colors.text.danger,
  },
  monthSection: {
    gap: theme.spacing.xs,
  },
  monthHeader: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  monthHeaderLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  monthChevron: {
    color: theme.colors.text.muted,
    width: 12,
  },
  monthLabel: {
    color: theme.colors.text.primary,
  },
  monthCountWrap: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  monthCount: {
    color: theme.colors.text.secondary,
  },
  monthCountMeta: {
    color: theme.colors.text.muted,
  },
  monthContent: {
    gap: theme.spacing.sm,
    paddingLeft: theme.spacing.sm,
  },
  entries: {
    gap: theme.spacing.xs,
  },
  infoCard: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 12,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
  },
  infoTitle: {
    color: theme.colors.text.primary,
  },
  infoDescription: {
    color: theme.colors.text.secondary,
  },
  infoActionRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  quickActionButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: theme.spacing.xs,
  },
  quickActionPrimary: {
    backgroundColor: theme.colors.button.primaryBg,
    borderColor: theme.colors.button.primaryBg,
  },
  quickActionLabel: {
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  quickActionPrimaryLabel: {
    color: theme.colors.text.inverse,
  },
}));

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
});

const entryDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const entryTimeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

const BETA_FEED_PAGE_SIZE = 20;
const REDACTED_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

function toMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatCategoryLabel(category: string): string {
  return category.replace(/_/g, ' ');
}

function formatEntryDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return entryDateFormatter.format(date).toUpperCase();
}

function formatEntryTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return entryTimeFormatter.format(date).toUpperCase();
}

function getFriendEntryMonthInfo(value: string): { monthKey: string; monthLabel: string } | null {
  const trimmedValue = value.trim();
  const redactedMonthMatch = REDACTED_MONTH_PATTERN.exec(trimmedValue);
  if (redactedMonthMatch) {
    const year = Number(redactedMonthMatch[1]);
    const monthIndex = Number(redactedMonthMatch[2]) - 1;
    if (monthIndex < 0 || monthIndex > 11) {
      return null;
    }

    return {
      monthKey: trimmedValue,
      monthLabel: monthFormatter.format(new Date(Date.UTC(year, monthIndex, 15, 12))),
    };
  }

  const date = new Date(trimmedValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return {
    monthKey,
    monthLabel: monthFormatter.format(date),
  };
}

function formatFriendEntryMonthLabel(value: string): string {
  return getFriendEntryMonthInfo(value)?.monthLabel ?? value;
}

function getMonthSortKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 7);
  }

  return toMonthKey(date);
}

function buildVisitFeedItem(
  visit: VisitRecord,
  currentUserId: string | null,
  eventAt?: string,
): VisitFeedItem {
  return {
    isFriend: !!visit.userId && !!currentUserId && visit.userId !== currentUserId,
    friendName: visit.userName,
    id: `visit_${visit.id}`,
    eventAt: eventAt?.trim() || visit.visitedAt || visit.createdAt,
    searchText: [
      visit.restaurantName,
      visit.restaurantLocation ?? '',
      visit.restaurantCuisineType ?? '',
      visit.items.map((item) => `${item.name} ${item.notes ?? ''}`).join(' '),
    ]
      .join(' ')
      .toLowerCase(),
    source: 'visit',
    visit,
  };
}

function buildQuickTrackFeedItem(
  quickTrack: QuickTrackRecord,
  currentUserId: string | null,
  eventAt?: string,
): QuickTrackFeedItem {
  return {
    isFriend: !!quickTrack.userId && !!currentUserId && quickTrack.userId !== currentUserId,
    friendName: quickTrack.userName,
    id: `quick_track_${quickTrack.id}`,
    eventAt: eventAt?.trim() || quickTrack.itemDate || quickTrack.createdAt,
    searchText: [
      quickTrack.itemName,
      quickTrack.restaurantName,
      quickTrack.itemCategory ?? '',
      quickTrack.notes ?? '',
    ]
      .join(' ')
      .toLowerCase(),
    source: 'quick-track',
    quickTrack,
  };
}

function getFeedItemCreatedAt(feedItem: FeedItem): string {
  return feedItem.source === 'visit' ? feedItem.visit.createdAt : feedItem.quickTrack.createdAt;
}

function formatMineEntryFooterLabel(feedItem: FeedItem): string {
  const createdAt = getFeedItemCreatedAt(feedItem);
  return formatEntryDateLabel(createdAt) || createdAt;
}

function compareBetaFeedItems(left: FeedItem, right: FeedItem): number {
  const leftMonthKey = getMonthSortKey(left.eventAt);
  const rightMonthKey = getMonthSortKey(right.eventAt);

  if (leftMonthKey !== rightMonthKey) {
    return rightMonthKey.localeCompare(leftMonthKey);
  }

  if (left.isFriend !== right.isFriend) {
    return left.isFriend ? -1 : 1;
  }

  return right.eventAt.localeCompare(left.eventAt);
}

export function HomeScreen({ navigation }: HomeScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const canViewBetaFeed = Boolean(user?.isAdmin);
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();
  const [feedMode, setFeedMode] = useState<FeedMode>('mine');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [friendSuggestion, setFriendSuggestion] = useState<PendingFriendSuggestion | null>(null);
  const [friendSuggestionErrorMessage, setFriendSuggestionErrorMessage] = useState<string | null>(null);
  const [isApplyingFriendSuggestion, setIsApplyingFriendSuggestion] = useState(false);
  const homeFeedActions = useHomeFeedActionController({
    isOnline,
    queryClient,
    queueFeatureOutbox,
    queueWrite,
  });
  const effectiveFeedMode: FeedMode =
    !canViewBetaFeed && feedMode === 'beta' ? 'mine' : feedMode;
  const feedScope = effectiveFeedMode === 'friends' ? 'friends' : effectiveFeedMode === 'beta' ? 'all' : 'mine';
  const trimmedSearchQuery = searchQuery.trim();
  const currentUserId = getAuthenticatedUserIdOrNull();
  const inviterDisplayName = friendSuggestion?.inviterDisplayName?.trim() || 'your inviter';

  const homeFeedQuery = useInfiniteQuery<
    HomeFeedPageResult,
    Error,
    InfiniteData<HomeFeedPageResult, HomeFeedCursor | undefined>,
    string[],
    HomeFeedCursor | undefined
  >({
    queryKey: ['feature', 'homeFeed', 'paginated', feedScope, typeFilter, trimmedSearchQuery],
    initialPageParam: undefined as HomeFeedCursor | undefined,
    queryFn: ({ pageParam }) =>
      listHomeFeedPage({
        cursor: pageParam,
        pageSize: BETA_FEED_PAGE_SIZE,
        scope: feedScope,
        search: trimmedSearchQuery || undefined,
        typeFilter,
      }),
    getNextPageParam: (lastPage) => lastPage.cursor,
  });
  const homeFeedState = usePaginatedQueryState({
    data: homeFeedQuery.data,
    isError: homeFeedQuery.isError,
    isFetching: homeFeedQuery.isFetching,
    isLoading: homeFeedQuery.isLoading,
    isSuccess: homeFeedQuery.isSuccess,
  });

  const loadedFeed = useMemo(
    () =>
      homeFeedState.items.map((item) =>
        item.source === 'visit'
          ? buildVisitFeedItem(item.visit, currentUserId, item.eventAt)
          : buildQuickTrackFeedItem(item.quickTrack, currentUserId, item.eventAt),
      ),
    [currentUserId, homeFeedState.items],
  );
  const activeFeed = useMemo(
    () => (effectiveFeedMode === 'beta' ? [...loadedFeed].sort(compareBetaFeedItems) : loadedFeed),
    [effectiveFeedMode, loadedFeed],
  );
  const loadedPhotoPreviews = useMemo(
    () => homeFeedQuery.data?.pages.flatMap((page) => page.photoPreviews ?? []) ?? [],
    [homeFeedQuery.data],
  );

  const isLoading = homeFeedQuery.isLoading;
  const hasBlockingFeedError = homeFeedState.hasBlockingError;
  const hasFeedRefreshError = homeFeedState.hasRefreshError;

  useEffect(() => {
    let isMounted = true;

    const loadPendingFriendSuggestion = async () => {
      if (!user?.email) {
        return;
      }

      const pendingSuggestion = await getPendingFriendSuggestion();
      if (!pendingSuggestion) {
        return;
      }

      if (pendingSuggestion.newUserEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
        return;
      }

      if (isMounted) {
        setFriendSuggestion(pendingSuggestion);
      }
    };

    void loadPendingFriendSuggestion();

    return () => {
      isMounted = false;
    };
  }, [user?.email]);

  const photosByFoodItem = useMemo(() => {
    const map = new Map<string, VisitPhotoRecord[]>();
    for (const photo of loadedPhotoPreviews) {
      if (!photo.food_item) {
        continue;
      }

      const existing = map.get(photo.food_item) ?? [];
      existing.push(photo);
      map.set(photo.food_item, existing);
    }
    return map;
  }, [loadedPhotoPreviews]);

  const filteredFeed = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return activeFeed.filter((item) => {
      if (typeFilter === 'visits' && item.source !== 'visit') {
        return false;
      }

      if (typeFilter === 'quick-track' && item.source !== 'quick-track') {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return item.searchText.includes(normalizedQuery);
    });
  }, [activeFeed, searchQuery, typeFilter]);

  const groupedMonths = useMemo<GroupedMonth[]>(() => {
    if (effectiveFeedMode !== 'friends') {
      return [];
    }

    const monthMap = new Map<
      string,
      {
        monthKey: string;
        monthLabel: string;
        totalCount: number;
        visitsCount: number;
        quickTrackCount: number;
        entries: FeedItem[];
      }
    >();

    filteredFeed.forEach((entry) => {
      const monthInfo = getFriendEntryMonthInfo(entry.eventAt);
      if (!monthInfo) {
        return;
      }

      const { monthKey, monthLabel } = monthInfo;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          monthKey,
          monthLabel,
          totalCount: 0,
          visitsCount: 0,
          quickTrackCount: 0,
          entries: [],
        });
      }

      const monthGroup = monthMap.get(monthKey);
      if (!monthGroup) {
        return;
      }

      monthGroup.totalCount += 1;
      if (entry.source === 'visit') {
        monthGroup.visitsCount += 1;
      } else {
        monthGroup.quickTrackCount += 1;
      }
      monthGroup.entries.push(entry);
    });

    return Array.from(monthMap.values())
      .sort((left, right) => right.monthKey.localeCompare(left.monthKey))
      .map((month) => ({
        monthKey: month.monthKey,
        monthLabel: month.monthLabel,
        totalCount: month.totalCount,
        visitsCount: month.visitsCount,
        quickTrackCount: month.quickTrackCount,
        entries: month.entries,
      }));
  }, [effectiveFeedMode, filteredFeed]);

  useEffect(() => {
    if (!canViewBetaFeed && feedMode === 'beta') {
      setFeedMode('mine');
    }
  }, [canViewBetaFeed, feedMode]);

  useEffect(() => {
    if (groupedMonths.length === 0) {
      setExpandedMonths(new Set());
      return;
    }

    setExpandedMonths((previous) => {
      const availableKeys = new Set(groupedMonths.map((month) => month.monthKey));
      const next = new Set(Array.from(previous).filter((key) => availableKeys.has(key)));
      if (next.size === 0) {
        next.add(groupedMonths[0].monthKey);
      }
      return next;
    });
  }, [groupedMonths]);

  const filteredVisitCount = useMemo(
    () => filteredFeed.filter((entry) => entry.source === 'visit').length,
    [filteredFeed],
  );
  const firstMineVisitIndex = useMemo(
    () =>
      effectiveFeedMode === 'mine'
        ? filteredFeed.findIndex((entry) => entry.source === 'visit')
        : -1,
    [effectiveFeedMode, filteredFeed],
  );
  const filteredQuickTrackCount = filteredFeed.length - filteredVisitCount;
  const totalVisitCount = homeFeedQuery.data?.pages[0]?.totalVisits ?? loadedFeed.filter((entry) => entry.source === 'visit').length;
  const totalQuickTrackCount =
    homeFeedQuery.data?.pages[0]?.totalQuickTracks ??
    loadedFeed.filter((entry) => entry.source === 'quick-track').length;
  const totalFeedCount = totalVisitCount + totalQuickTrackCount;

  const summaryText = useMemo(() => {
    if (searchQuery.trim()) {
      return `Showing ${filteredFeed.length} loaded matches (${filteredVisitCount} visits, ${filteredQuickTrackCount} quick items)`;
    }

    if (effectiveFeedMode === 'friends') {
      if (totalFeedCount === 0) {
        return 'No friend ratings yet';
      }

      return [
        formatCount(totalVisitCount, 'friend visit', 'friend visits'),
        formatCount(totalQuickTrackCount, 'friend quick item', 'friend quick items'),
      ].join(' • ');
    }

    if (effectiveFeedMode === 'beta') {
      if (totalFeedCount === 0) {
        return 'No activity in beta feed yet';
      }

      return [
        formatCount(totalVisitCount, 'visit', 'visits'),
        formatCount(totalQuickTrackCount, 'quick item', 'quick items'),
      ].join(' • ');
    }

    if (totalFeedCount === 0) {
      return 'No ratings yet';
    }

    return [
      formatCount(totalVisitCount, 'visit', 'visits'),
      formatCount(totalQuickTrackCount, 'quick item', 'quick items'),
    ].join(' • ');
  }, [
    effectiveFeedMode,
    filteredFeed.length,
    filteredQuickTrackCount,
    filteredVisitCount,
    searchQuery,
    totalFeedCount,
    totalQuickTrackCount,
    totalVisitCount,
  ]);

  const toggleMonth = useCallback(
    (monthKey: string) => {
      setExpandedMonths((previous) => {
        const next = new Set(previous);
        if (next.has(monthKey)) {
          next.delete(monthKey);
        } else {
          next.add(monthKey);
        }
        return next;
      });
    },
    [],
  );

  const handleSharePhoto = useCallback(
    ({
      itemName,
      photo,
      rating,
      restaurantName,
      visitDate,
    }: {
      itemName: string;
      photo: VisitPhotoRecord;
      rating: number;
      restaurantName: string;
      visitDate: string;
    }) => {
      trackObservabilityEvent('VISIT_SHARE_STARTED', {
        itemCount: 1,
        source: 'HomeScreen',
      });
      navigation.navigate('VisitShareCustomization', {
        restaurantName,
        visitDate,
        items: [
          {
            itemId: photo.food_item ?? photo.id,
            itemName,
            rating,
            photoId: photo.id,
            photoFilename: photo.photo,
            photoCollectionId: photo.collectionId,
            photoCollectionName: photo.collectionName,
          },
        ],
      });
    },
    [navigation],
  );

  const buildVisitShareItems = useCallback(
    (visit: VisitRecord): VisitShareItem[] =>
      visit.items.reduce<VisitShareItem[]>((records, item) => {
        const itemPhotos = photosByFoodItem.get(item.id) ?? [];
        const primaryPhoto = itemPhotos[0];
        if (!primaryPhoto) {
          return records;
        }

        records.push({
          itemId: item.id,
          itemName: item.name,
          rating: item.rating,
          photoId: primaryPhoto.id,
          photoFilename: primaryPhoto.photo,
          photoCollectionId: primaryPhoto.collectionId,
          photoCollectionName: primaryPhoto.collectionName,
        });
        return records;
      }, []),
    [photosByFoodItem],
  );

  const handleShareVisit = useCallback(
    (visit: VisitRecord) => {
      const shareItems = buildVisitShareItems(visit);
      if (shareItems.length <= 1) {
        return;
      }

      trackObservabilityEvent('VISIT_SHARE_STARTED', {
        itemCount: shareItems.length,
        source: 'HomeScreen',
      });
      navigation.navigate('VisitShareCustomization', {
        restaurantName: visit.restaurantName,
        visitDate: visit.visitedAt || visit.createdAt,
        items: shareItems,
      });
    },
    [buildVisitShareItems, navigation],
  );

  const handleToggleFilters = () => {
    setFiltersExpanded((previous) => {
      const next = !previous;
      trackObservabilityEvent('HOME_FILTERS_TOGGLED', {
        expanded: next,
        source: 'HomeScreen',
      });
      if (!next) {
        setTypeFilter('all');
      }
      return next;
    });
  };

  const handleFeedModeChange = useCallback((nextMode: FeedMode) => {
    const nextAllowedMode =
      !canViewBetaFeed && nextMode === 'beta' ? 'mine' : nextMode;
    trackObservabilityEvent('HOME_FEED_MODE_SELECTED', {
      feedMode: nextAllowedMode,
      source: 'HomeScreen',
    });
    setFeedMode(nextAllowedMode);
  }, [canViewBetaFeed]);

  const handleTypeFilterChange = useCallback((nextFilter: TypeFilter) => {
    trackObservabilityEvent('HOME_TYPE_FILTER_SELECTED', {
      filter: nextFilter,
      source: 'HomeScreen',
    });
    setTypeFilter(nextFilter);
  }, []);

  const handleLoadMoreFeed = useCallback(() => {
    if (!homeFeedQuery.hasNextPage || homeFeedQuery.isFetchingNextPage) {
      return;
    }

    void homeFeedQuery.fetchNextPage();
  }, [homeFeedQuery]);

  const handleDismissFriendSuggestion = useCallback(() => {
    setFriendSuggestionErrorMessage(null);
    setFriendSuggestion(null);
    void clearPendingFriendSuggestion();
  }, []);

  const handleAcceptFriendSuggestion = useCallback(async () => {
    if (!friendSuggestion) {
      return;
    }

    if (!isOnline) {
      setFriendSuggestionErrorMessage('Connect to the internet to add this friend.');
      return;
    }

    setFriendSuggestionErrorMessage(null);
    setIsApplyingFriendSuggestion(true);
    trackObservabilityEvent('FRIEND_SUGGESTION_ACCEPT_STARTED', {
      source: 'HomeScreen',
    });

    try {
      await queueWrite('friend.suggestion.accept');
      await createFriendSuggestionAcceptance({ inviterId: friendSuggestion.inviterId });
      await clearPendingFriendSuggestion();
      setFriendSuggestion(null);
      await queryClient.invalidateQueries({ queryKey: ['feature', 'friends'] });
      await queryClient.invalidateQueries({ queryKey: ['feature', 'homeFeed'] });
      trackObservabilityEvent('FRIEND_SUGGESTION_ACCEPT_SUCCEEDED', {
        source: 'HomeScreen',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add this friend.';
      setFriendSuggestionErrorMessage(message);
      trackObservabilityEvent('FRIEND_SUGGESTION_ACCEPT_FAILED', {
        source: 'HomeScreen',
        errorMessage: message,
      });
    } finally {
      setIsApplyingFriendSuggestion(false);
    }
  }, [friendSuggestion, isOnline, queryClient, queueWrite]);

  const renderStandardFeedEntry = useCallback(
    ({
      deleteTestID,
      editTestID,
      feedItem,
      footerLabel,
    }: {
      deleteTestID?: string;
      editTestID?: string;
      feedItem: FeedItem;
      footerLabel: string;
    }) => {
      if (feedItem.source === 'visit') {
        const { visit } = feedItem;
        const restaurantMeta = [visit.restaurantLocation, visit.restaurantCuisineType]
          .filter((value) => value && value.trim().length > 0)
          .join(' • ');
        const shareableVisitItems = buildVisitShareItems(visit);
        const showVisitShare = !feedItem.isFriend && shareableVisitItems.length > 1;

        return (
          <HomeFeedVisitEntryCard
            deleteTestID={deleteTestID}
            editTestID={editTestID}
            footerLabel={footerLabel}
            friendName={feedItem.isFriend ? feedItem.friendName : undefined}
            getPhotosForItem={(itemId) => photosByFoodItem.get(itemId) ?? []}
            key={feedItem.id}
            onDelete={
              !feedItem.isFriend
                ? () => {
                    homeFeedActions.promptDeleteVisit(visit.id, visit.restaurantName);
                  }
                : undefined
            }
            onEdit={
              !feedItem.isFriend
                ? () => {
                    navigation.push('CreateVisit', {
                      editVisitId: visit.id,
                      returnToStep: 2,
                    });
                  }
                : undefined
            }
            onOpenPhotoViewer={homeFeedActions.openPhotoViewer}
            onMoreActions={
              feedItem.isFriend
                ? () => {
                    homeFeedActions.promptReportMenuTarget({
                      id: visit.id,
                      itemName: visit.restaurantName,
                      kind: 'visit',
                    });
                  }
                : undefined
            }
            onSharePhoto={handleSharePhoto}
            onShareVisit={
              !feedItem.isFriend && showVisitShare
                ? () => {
                    handleShareVisit(visit);
                  }
                : undefined
            }
            moreActionsAccessibilityLabel="Visit actions"
            restaurantMetaLabel={restaurantMeta}
            visit={visit}
          />
        );
      }

      const quickTrack = feedItem.quickTrack;
      const quickTrackPhotos = photosByFoodItem.get(quickTrack.id) ?? [];

      return (
        <HomeQuickTrackEntryCard
          entryMeta={footerLabel}
          friendName={feedItem.isFriend ? feedItem.friendName : undefined}
          key={feedItem.id}
          moreActionsAccessibilityLabel="Quick track actions"
          onDelete={
            !feedItem.isFriend
              ? () => {
                  homeFeedActions.promptDeleteQuickTrack(
                    quickTrack.id,
                    quickTrack.itemName,
                  );
                }
              : undefined
          }
          onEdit={
            !feedItem.isFriend
              ? () => {
                  navigation.navigate('EditQuickTrack', {
                    quickTrackId: quickTrack.id,
                  });
                }
              : undefined
          }
          onMoreActions={
            feedItem.isFriend
              ? () => {
                  homeFeedActions.promptReportMenuTarget({
                    id: quickTrack.id,
                    itemName: quickTrack.itemName,
                    kind: 'quick-track',
                  });
                }
              : undefined
          }
          onOpenPhotoViewer={homeFeedActions.openPhotoViewer}
          onSharePhoto={handleSharePhoto}
          photos={quickTrackPhotos}
          quickTrack={quickTrack}
          showUnderReviewBadge={
            !feedItem.isFriend && quickTrack.moderationStatus === 'under_review'
          }
        />
      );
    },
    [
      buildVisitShareItems,
      handleSharePhoto,
      handleShareVisit,
      homeFeedActions,
      navigation,
      photosByFoodItem,
    ],
  );

  const colors = {
    accent: theme.colors.text.brand,
    accentSoft: theme.colors.status.infoBg,
    accentSoftText: theme.colors.text.info,
    border: theme.colors.border.default,
    borderSubtle: theme.colors.border.subtle,
    dangerBorder: theme.colors.border.danger,
    dangerText: theme.colors.text.danger,
    screenBackground: theme.colors.background.muted,
    shadow: theme.colors.background.inverse,
    surface: theme.colors.background.surface,
    textMuted: theme.colors.text.muted,
    textPrimary: theme.colors.text.primary,
    textSecondary: theme.colors.text.secondary,
  } as const;

  const styles = useStyles();

  return (
    <TabRootScreenScaffold
      contentStyle={styles.screenContent}
      scrollUnderlayColor={colors.screenBackground}
      testID="home-screen"
    >
      <View style={styles.header}>
        <FeedHeaderControls
          feedMode={effectiveFeedMode}
          filtersExpanded={filtersExpanded}
          onClearSearch={() => {
            setSearchQuery('');
          }}
          onFeedModeChange={handleFeedModeChange}
          onSearchQueryChange={setSearchQuery}
          onToggleFilters={handleToggleFilters}
          onTypeFilterChange={handleTypeFilterChange}
          searchQuery={searchQuery}
          showBetaTab={canViewBetaFeed}
          summaryText={summaryText}
          typeFilter={typeFilter}
        />
      </View>

      <View style={styles.body}>
        {isLoading ? (
          <>
            <Skeleton height={16} />
            <Skeleton height={16} />
            <Skeleton height={16} />
          </>
        ) : null}

        <PageErrorToast
          errorMessage={
            hasBlockingFeedError
              ? 'Could not load your ratings feed.'
              : hasFeedRefreshError
                ? 'Could not refresh your feed. Showing saved data.'
                : null
          }
          title="Feed unavailable"
          actionLabel="Retry"
          onAction={() => {
            void homeFeedQuery.refetch();
          }}
        />
        <PageErrorToast
          errorMessage={homeFeedActions.deleteErrorMessage}
          title="Delete failed"
        />
        <PageErrorToast errorMessage={friendSuggestionErrorMessage} title="Friend suggestion unavailable" />
        {friendSuggestion ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle} variant="bodyLgBold">
              Add {inviterDisplayName} as a friend?
            </Text>
            <Text style={styles.infoDescription} variant="bodyLgCompact">
              They invited you to Yummy Recs. Add them now so you can see each other's food activity.
            </Text>
            <View style={styles.infoActionRow}>
              <Pressable
                disabled={isApplyingFriendSuggestion}
                onPress={() => {
                  void handleAcceptFriendSuggestion();
                }}
                style={[styles.quickActionButton, styles.quickActionPrimary]}
              >
                <Text style={[styles.quickActionLabel, styles.quickActionPrimaryLabel]} variant="labelMd">
                  {isApplyingFriendSuggestion ? 'Adding...' : 'Add Friend'}
                </Text>
              </Pressable>
              <Pressable
                disabled={isApplyingFriendSuggestion}
                onPress={handleDismissFriendSuggestion}
                style={styles.quickActionButton}
              >
                <Text style={styles.quickActionLabel} variant="labelMd">Not Now</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {!isLoading &&
        !hasBlockingFeedError &&
        effectiveFeedMode === 'friends' &&
        totalFeedCount === 0 ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle} variant="bodyLgBold">No friend activity yet</Text>
            <Text style={styles.infoDescription} variant="bodyLgCompact">
              Add friends to see their ratings and quick track items here.
            </Text>
            <View style={styles.infoActionRow}>
              <Pressable
                onPress={() => {
                  navigation.navigate('Friends');
                }}
                style={[styles.quickActionButton, styles.quickActionPrimary]}
              >
                <Text style={[styles.quickActionLabel, styles.quickActionPrimaryLabel]} variant="labelMd">
                  Add Friends
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {!isLoading && !hasBlockingFeedError && effectiveFeedMode === 'mine' && totalFeedCount === 0 ? (
          <EmptyState
            actionLabel="Create your first entry"
            description="Start with Add Visit or Quick Track."
            fill
            onAction={() => {
              navigation.navigate('AddVisit');
            }}
            title="No ratings yet"
          />
        ) : null}

        {!isLoading && !hasBlockingFeedError && effectiveFeedMode === 'beta' && totalFeedCount === 0 ? (
          <EmptyState
            actionLabel="Create your first entry"
            description="Start with Add Visit or Quick Track to preview the beta feed."
            fill
            onAction={() => {
              navigation.navigate('AddVisit');
            }}
            title="No beta feed entries yet"
          />
        ) : null}

        {!isLoading && !hasBlockingFeedError && activeFeed.length > 0 && filteredFeed.length === 0 ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle} variant="bodyLgBold">No matching ratings</Text>
            <Text style={styles.infoDescription} variant="bodyLgCompact">
              Try another search term or switch filters to see more items.
            </Text>
            <View style={styles.infoActionRow}>
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  setTypeFilter('all');
                }}
                style={styles.quickActionButton}
              >
                <Text style={styles.quickActionLabel} variant="labelMd">Reset Filters</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {!isLoading && !hasBlockingFeedError && filteredFeed.length > 0 ? (
          effectiveFeedMode === 'beta' ? (
            <View style={styles.betaFeed}>
              {filteredFeed.map((feedItem) => {
                const ownerLabel =
                  feedItem.friendName?.trim() ||
                  (feedItem.isFriend ? 'Unknown User' : user?.name?.trim() || 'You');
                const dateLabel = formatEntryDateLabel(feedItem.eventAt);
                const timeLabel = formatEntryTimeLabel(feedItem.eventAt);

                if (feedItem.source === 'visit') {
                  const { visit } = feedItem;
                  const restaurantMeta = [visit.restaurantLocation, visit.restaurantCuisineType]
                    .filter((value) => value && value.trim().length > 0)
                    .join(' • ');
                  const shareableVisitItems = buildVisitShareItems(visit);
                  const showVisitShare = !feedItem.isFriend && shareableVisitItems.length > 1;

                  return (
                    <HomeBetaVisitFeedCard
                      dateLabel={dateLabel}
                      key={feedItem.id}
                      onDelete={
                        !feedItem.isFriend
                          ? () => {
                              homeFeedActions.promptDeleteVisit(
                                visit.id,
                                visit.restaurantName,
                              );
                            }
                          : undefined
                      }
                      onEdit={
                        !feedItem.isFriend
                          ? () => {
                              navigation.push('CreateVisit', {
                                editVisitId: visit.id,
                                returnToStep: 2,
                              });
                            }
                          : undefined
                      }
                      onOpenPhotoViewer={homeFeedActions.openPhotoViewer}
                      onSharePhoto={handleSharePhoto}
                      onShareVisit={showVisitShare ? () => handleShareVisit(visit) : undefined}
                      ownerLabel={ownerLabel}
                      photosByFoodItem={photosByFoodItem}
                      restaurantMetaLabel={restaurantMeta}
                      timeLabel={timeLabel}
                      visit={visit}
                    />
                  );
                }

                const quickTrack = feedItem.quickTrack;
                const quickTrackPhotos = photosByFoodItem.get(quickTrack.id) ?? [];
                const quickTrackCategoryLabel = quickTrack.itemCategory
                  ? formatCategoryLabel(quickTrack.itemCategory)
                  : undefined;

                return (
                  <HomeBetaQuickTrackFeedCard
                    categoryLabel={quickTrackCategoryLabel}
                    dateLabel={dateLabel}
                    key={feedItem.id}
                    onDelete={
                      !feedItem.isFriend
                        ? () => {
                            homeFeedActions.promptDeleteQuickTrack(
                              quickTrack.id,
                              quickTrack.itemName,
                            );
                          }
                        : undefined
                    }
                    onEdit={
                      !feedItem.isFriend
                        ? () => {
                            navigation.navigate('EditQuickTrack', {
                              quickTrackId: quickTrack.id,
                            });
                          }
                        : undefined
                    }
                    onOpenPhotoViewer={homeFeedActions.openPhotoViewer}
                    onSharePhoto={handleSharePhoto}
                    ownerLabel={ownerLabel}
                    photos={quickTrackPhotos}
                    quickTrack={quickTrack}
                    timeLabel={timeLabel}
                  />
                );
              })}
            </View>
          ) : effectiveFeedMode === 'mine' ? (
            <View style={styles.entries}>
              {filteredFeed.map((feedItem, entryIndex) =>
                renderStandardFeedEntry({
                  deleteTestID:
                    entryIndex === firstMineVisitIndex ? 'home-first-visit-delete-button' : undefined,
                  editTestID:
                    entryIndex === firstMineVisitIndex ? 'home-first-visit-edit-button' : undefined,
                  feedItem,
                  footerLabel: formatMineEntryFooterLabel(feedItem),
                }),
              )}
            </View>
          ) : (
            groupedMonths.map((month, monthIndex) => {
              const isMonthExpanded = expandedMonths.has(month.monthKey);

              return (
                <View key={month.monthKey} style={styles.monthSection}>
                  <Pressable
                    onPress={() => {
                      toggleMonth(month.monthKey);
                    }}
                    style={styles.monthHeader}
                  >
                    <View style={styles.monthHeaderLeft}>
                      <Text style={styles.monthChevron} variant="labelMdBold">
                        {isMonthExpanded ? 'v' : '>'}
                      </Text>
                      <Text style={styles.monthLabel} variant="titleSm">{month.monthLabel}</Text>
                    </View>
                    <View style={styles.monthCountWrap}>
                      <Text style={styles.monthCount} variant="metric">{month.totalCount}</Text>
                      <Text style={styles.monthCountMeta} variant="bodySmTightMedium">
                        ({month.visitsCount}v • {month.quickTrackCount}q)
                      </Text>
                    </View>
                  </Pressable>

                  {isMonthExpanded ? (
                    <View style={styles.monthContent}>
                      <View style={styles.entries}>
                        {month.entries.map((feedItem, entryIndex) =>
                          renderStandardFeedEntry({
                            deleteTestID:
                              monthIndex === 0 && entryIndex === 0
                                ? 'home-first-visit-delete-button'
                                : undefined,
                            editTestID:
                              monthIndex === 0 && entryIndex === 0
                                ? 'home-first-visit-edit-button'
                                : undefined,
                            feedItem,
                            footerLabel: formatFriendEntryMonthLabel(feedItem.eventAt),
                          }),
                        )}
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })
          )
        ) : null}

        {!isLoading && !hasBlockingFeedError && homeFeedQuery.hasNextPage ? (
          <Button
            label={homeFeedQuery.isFetchingNextPage ? 'Loading more...' : 'Load more activity'}
            loading={homeFeedQuery.isFetchingNextPage}
            onPress={handleLoadMoreFeed}
            variant="secondary"
          />
        ) : null}

      </View>

      <HomeFeedActionModals controller={homeFeedActions} isOnline={isOnline} />
    </TabRootScreenScaffold>
  );
}
