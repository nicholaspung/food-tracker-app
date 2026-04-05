import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import {
  ConfirmDestructiveModal,
  EmptyState,
  FeedHeaderControls,
  HomeBetaQuickTrackFeedCard,
  HomeBetaVisitFeedCard,
  HomeFeedVisitEntryCard,
  HomeQuickTrackEntryCard,
  PhotoViewerModal,
  ReportContentModal,
  Skeleton,
  TabRootScreenScaffold,
  type FeedModeValue,
  type FeedTypeFilterValue,
  type HomeBetaFeedPhotoRecord,
} from '../components/shared';
import {
  buildPocketBaseFileUrl,
  type ContentReportReasonCode,
  createFriendSuggestionAcceptance,
  deleteQuickTrack,
  deleteVisit,
  getAuthenticatedUserIdOrNull,
  type HomeFeedCursor,
  type HomeFeedPageResult,
  listHomeFeedPage,
  listVisitPhotosForFoodItemIds,
  reportContent,
  type QuickTrackRecord,
  type VisitRecord,
} from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import {
  clearPendingFriendSuggestion,
  getPendingFriendSuggestion,
  type PendingFriendSuggestion,
} from '../lib/pendingFriendSuggestion';
import { useIncrementalIdQuery } from '../hooks/useIncrementalIdQuery';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
type FeedMode = FeedModeValue;
type TypeFilter = FeedTypeFilterValue;

type VisitPhotoRecord = HomeBetaFeedPhotoRecord;

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
type PendingDeleteTarget =
  | {
      id: string;
      kind: 'visit';
      itemName: string;
    }
  | {
      id: string;
      kind: 'quick-track';
      itemName: string;
    };
type PendingReportTarget =
  | {
      id: string;
      kind: 'visit';
      itemName: string;
    }
  | {
      id: string;
      kind: 'quick-track';
      itemName: string;
    };
type VisitShareItem = RootStackParamList['VisitShareCustomization']['items'][number];

interface GroupedDay {
  dayKey: string;
  dayLabel: string;
  entries: FeedItem[];
}

interface GroupedMonth {
  monthKey: string;
  monthLabel: string;
  totalCount: number;
  visitsCount: number;
  quickTrackCount: number;
  days: GroupedDay[];
}

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
});

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
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

function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

function getMonthSortKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 7);
  }

  return toMonthKey(date);
}

function buildVisitFeedItem(visit: VisitRecord, currentUserId: string | null): VisitFeedItem {
  return {
    isFriend: !!visit.userId && !!currentUserId && visit.userId !== currentUserId,
    friendName: visit.userName,
    id: `visit_${visit.id}`,
    eventAt: visit.visitedAt || visit.createdAt,
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

function buildQuickTrackFeedItem(quickTrack: QuickTrackRecord, currentUserId: string | null): QuickTrackFeedItem {
  return {
    isFriend: !!quickTrack.userId && !!currentUserId && quickTrack.userId !== currentUserId,
    friendName: quickTrack.userName,
    id: `quick_track_${quickTrack.id}`,
    eventAt: quickTrack.itemDate || quickTrack.createdAt,
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
  const isFocused = useIsFocused();
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
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [friendSuggestion, setFriendSuggestion] = useState<PendingFriendSuggestion | null>(null);
  const [friendSuggestionErrorMessage, setFriendSuggestionErrorMessage] = useState<string | null>(null);
  const [isApplyingFriendSuggestion, setIsApplyingFriendSuggestion] = useState(false);
  const [pendingDeleteTarget, setPendingDeleteTarget] = useState<PendingDeleteTarget | null>(null);
  const [isDeletingTarget, setIsDeletingTarget] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [pendingReportTarget, setPendingReportTarget] = useState<PendingReportTarget | null>(null);
  const [reportReasonCode, setReportReasonCode] = useState<ContentReportReasonCode | null>(null);
  const [reportNotes, setReportNotes] = useState('');
  const [reportErrorMessage, setReportErrorMessage] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const hasHandledCurrentFocusRef = useRef(false);
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

  const loadedFeed = useMemo(
    () =>
      homeFeedQuery.data?.pages.flatMap((page) =>
        page.items.map((item) =>
          item.source === 'visit'
            ? buildVisitFeedItem(item.visit, currentUserId)
            : buildQuickTrackFeedItem(item.quickTrack, currentUserId),
        ),
      ) ?? [],
    [currentUserId, homeFeedQuery.data],
  );
  const activeFeed = useMemo(
    () => (effectiveFeedMode === 'beta' ? [...loadedFeed].sort(compareBetaFeedItems) : loadedFeed),
    [effectiveFeedMode, loadedFeed],
  );
  const visibleFoodItemIds = useMemo(() => {
    const ids = new Set<string>();

    for (const item of activeFeed) {
      if (item.source === 'visit') {
        for (const visitItem of item.visit.items) {
          ids.add(visitItem.id);
        }
        continue;
      }

      ids.add(item.quickTrack.id);
    }

    return Array.from(ids);
  }, [activeFeed]);
  const visitPhotosQuery = useIncrementalIdQuery({
    queryKey: ['feature', 'visitPhotos', 'feedItems', effectiveFeedMode],
    ids: visibleFoodItemIds,
    fetchByIds: listVisitPhotosForFoodItemIds,
    getRecordIds: (photo) => (photo.food_item ? [photo.food_item] : []),
    getRecordKey: (photo) => photo.id,
  });

  const isLoading = homeFeedQuery.isLoading;
  const hasBlockingFeedError = homeFeedQuery.isError && (!homeFeedQuery.data || homeFeedQuery.data.pages.length === 0);
  const hasFeedRefreshError = !hasBlockingFeedError && (homeFeedQuery.isError || visitPhotosQuery.isError);

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
    const monthMap = new Map<
      string,
      {
        monthKey: string;
        monthLabel: string;
        totalCount: number;
        visitsCount: number;
        quickTrackCount: number;
        daysMap: Map<string, GroupedDay>;
      }
    >();

    filteredFeed.forEach((entry) => {
      const date = new Date(entry.eventAt);
      if (Number.isNaN(date.getTime())) {
        return;
      }

      const monthKey = toMonthKey(date);
      const monthLabel = monthFormatter.format(date);
      const dayKey = toDayKey(date);
      const dayLabel = dayFormatter.format(date);

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          monthKey,
          monthLabel,
          totalCount: 0,
          visitsCount: 0,
          quickTrackCount: 0,
          daysMap: new Map(),
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

      if (!monthGroup.daysMap.has(dayKey)) {
        monthGroup.daysMap.set(dayKey, {
          dayKey,
          dayLabel,
          entries: [],
        });
      }

      monthGroup.daysMap.get(dayKey)?.entries.push(entry);
    });

    return Array.from(monthMap.values()).map((month) => ({
      monthKey: month.monthKey,
      monthLabel: month.monthLabel,
      totalCount: month.totalCount,
      visitsCount: month.visitsCount,
      quickTrackCount: month.quickTrackCount,
      days: Array.from(month.daysMap.values()),
    }));
  }, [filteredFeed]);

  useEffect(() => {
    if (!canViewBetaFeed && feedMode === 'beta') {
      setFeedMode('mine');
    }
  }, [canViewBetaFeed, feedMode]);

  useEffect(() => {
    if (groupedMonths.length === 0) {
      setExpandedMonths(new Set());
      setExpandedDays(new Set());
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

    setExpandedDays((previous) => {
      const availableKeys = new Set(
        groupedMonths.flatMap((month) => month.days.map((day) => day.dayKey)),
      );
      const next = new Set(Array.from(previous).filter((key) => availableKeys.has(key)));
      if (next.size === 0 && groupedMonths[0]?.days[0]?.dayKey) {
        next.add(groupedMonths[0].days[0].dayKey);
      }
      return next;
    });
  }, [groupedMonths]);

  useEffect(() => {
    if (!isFocused) {
      hasHandledCurrentFocusRef.current = false;
      return;
    }

    if (hasHandledCurrentFocusRef.current) {
      return;
    }

    if (homeFeedQuery.fetchStatus !== 'idle') {
      return;
    }

    hasHandledCurrentFocusRef.current = true;
    void homeFeedQuery.refetch();
    if (visibleFoodItemIds.length > 0) {
      void visitPhotosQuery.refetch();
    }
  }, [homeFeedQuery, isFocused, visibleFoodItemIds.length, visitPhotosQuery]);

  const filteredVisitCount = useMemo(
    () => filteredFeed.filter((entry) => entry.source === 'visit').length,
    [filteredFeed],
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
      const shouldExpand = !expandedMonths.has(monthKey);
      setExpandedMonths((previous) => {
        const next = new Set(previous);
        if (next.has(monthKey)) {
          next.delete(monthKey);
        } else {
          next.add(monthKey);
        }
        return next;
      });

      if (shouldExpand) {
        const firstDayKey = groupedMonths.find((month) => month.monthKey === monthKey)?.days[0]?.dayKey;
        if (firstDayKey) {
          setExpandedDays((previous) => new Set(previous).add(firstDayKey));
        }
      }
    },
    [expandedMonths, groupedMonths],
  );

  const toggleDay = useCallback((dayKey: string) => {
    setExpandedDays((previous) => {
      const next = new Set(previous);
      if (next.has(dayKey)) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }
      return next;
    });
  }, []);

  const handleDeleteQuickTrack = useCallback(
    async (quickTrackId: string) => {
      if (!isOnline) {
        await queueFeatureOutbox('quick-track.delete', { quickTrackId });
        await queryClient.invalidateQueries({ queryKey: ['feature', 'homeFeed'] });
        showQueuedOfflineAlert('Quick track delete');
        return;
      }

      await queueWrite('quick-track.delete');
      await deleteQuickTrack(quickTrackId);
      await queryClient.invalidateQueries({ queryKey: ['feature', 'homeFeed'] });
      await queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] });
    },
    [isOnline, queryClient, queueFeatureOutbox, queueWrite],
  );

  const promptDeleteQuickTrack = useCallback((quickTrackId: string, itemName: string) => {
    setDeleteErrorMessage(null);
    setPendingDeleteTarget({
      id: quickTrackId,
      itemName,
      kind: 'quick-track',
    });
  }, []);

  const closeDeleteModal = useCallback(() => {
    if (isDeletingTarget) {
      return;
    }

    setPendingDeleteTarget(null);
  }, [isDeletingTarget]);

  const handleDeleteVisit = useCallback(
    async (visitId: string) => {
      if (!isOnline) {
        await queueFeatureOutbox('visit.delete', { visitId });
        await queryClient.invalidateQueries({ queryKey: ['feature', 'homeFeed'] });
        showQueuedOfflineAlert('Visit delete');
        return;
      }

      await queueWrite('visit.delete');
      await deleteVisit(visitId);
      await queryClient.invalidateQueries({ queryKey: ['feature', 'homeFeed'] });
      await queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] });
    },
    [isOnline, queryClient, queueFeatureOutbox, queueWrite],
  );

  const promptDeleteVisit = useCallback((visitId: string, itemName: string) => {
    setDeleteErrorMessage(null);
    setPendingDeleteTarget({
      id: visitId,
      itemName,
      kind: 'visit',
    });
  }, []);

  const confirmDeleteTarget = useCallback(async () => {
    if (!pendingDeleteTarget || isDeletingTarget) {
      return;
    }

    setIsDeletingTarget(true);

    try {
      if (pendingDeleteTarget.kind === 'visit') {
        await handleDeleteVisit(pendingDeleteTarget.id);
      } else {
        await handleDeleteQuickTrack(pendingDeleteTarget.id);
      }

      setPendingDeleteTarget(null);
      setDeleteErrorMessage(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : pendingDeleteTarget.kind === 'visit'
            ? 'Could not delete visit.'
            : 'Could not delete quick track.';
      setDeleteErrorMessage(message);
    } finally {
      setIsDeletingTarget(false);
    }
  }, [handleDeleteQuickTrack, handleDeleteVisit, isDeletingTarget, pendingDeleteTarget]);

  const promptReportTarget = useCallback((target: PendingReportTarget) => {
    setPendingReportTarget(target);
    setReportReasonCode(null);
    setReportNotes('');
    setReportErrorMessage(null);
  }, []);

  const closeReportModal = useCallback(() => {
    if (isSubmittingReport) {
      return;
    }

    setPendingReportTarget(null);
    setReportReasonCode(null);
    setReportNotes('');
    setReportErrorMessage(null);
  }, [isSubmittingReport]);

  const submitReport = useCallback(async () => {
    if (!pendingReportTarget || !reportReasonCode || isSubmittingReport) {
      return;
    }

    if (!isOnline) {
      setReportErrorMessage('Connect to the internet to submit a report.');
      return;
    }

    setReportErrorMessage(null);
    setIsSubmittingReport(true);

    try {
      await queueWrite('content.report');
      await reportContent({
        contentType: pendingReportTarget.kind,
        recordId: pendingReportTarget.id,
        reasonCode: reportReasonCode,
        notes: reportNotes.trim() || undefined,
      });

      closeReportModal();
      await queryClient.invalidateQueries({ queryKey: ['feature', 'homeFeed'] });
      await queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not submit report.';
      setReportErrorMessage(message);
    } finally {
      setIsSubmittingReport(false);
    }
  }, [
    closeReportModal,
    isOnline,
    isSubmittingReport,
    pendingReportTarget,
    queryClient,
    queueWrite,
    reportNotes,
    reportReasonCode,
  ]);

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

  const openPhotoViewer = useCallback((photos: VisitPhotoRecord[], initialIndex = 0) => {
    if (photos.length === 0) {
      return;
    }

    const urls = photos.map((photo) =>
      buildPocketBaseFileUrl({
        collectionId: photo.collectionId,
        collectionName: photo.collectionName ?? 'visit_photos',
        recordId: photo.id,
        filename: photo.photo,
      }),
    );
    const boundedIndex = Math.max(0, Math.min(initialIndex, urls.length - 1));

    setPhotoViewerUrls(urls);
    setPhotoViewerInitialIndex(boundedIndex);
    setPhotoViewerVisible(true);
  }, []);

  const closePhotoViewer = useCallback(() => {
    setPhotoViewerVisible(false);
  }, []);

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

  const styles = StyleSheet.create({
    screenContent: {
      backgroundColor: colors.screenBackground,
      gap: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    header: {
      backgroundColor: colors.surface,
      borderBottomColor: colors.borderSubtle,
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
      backgroundColor: colors.surface,
      height: 2,
      left: 0,
      position: 'absolute',
      top: 0,
      width: 2,
      zIndex: 1,
    },
    monthSection: {
      gap: theme.spacing.xs,
    },
    monthHeader: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
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
      color: colors.textMuted,
      ...theme.typography.labelMdBold,
      width: 12,
    },
    monthLabel: {
      color: colors.textPrimary,
      ...theme.typography.titleSm,
    },
    monthCountWrap: {
      alignItems: 'flex-end',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    monthCount: {
      color: colors.textSecondary,
      fontSize: 20,
      fontWeight: '700',
      lineHeight: 20,
    },
    monthCountMeta: {
      color: colors.textMuted,
      ...theme.typography.bodySmTightMedium,
    },
    monthContent: {
      gap: theme.spacing.sm,
      paddingLeft: theme.spacing.sm,
    },
    dayGroup: {
      gap: theme.spacing.xs,
    },
    dayHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 6,
    },
    dayChevron: {
      color: colors.textMuted,
      ...theme.typography.bodySmTightBold,
      width: 10,
    },
    dayLabel: {
      color: colors.textSecondary,
      flex: 1,
      ...theme.typography.labelMd,
    },
    dayCount: {
      color: colors.textMuted,
      ...theme.typography.bodySmTightMedium,
    },
    entries: {
      gap: theme.spacing.xs,
    },
    infoCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      gap: theme.spacing.xs,
      padding: theme.spacing.sm,
    },
    infoTitle: {
      color: colors.textPrimary,
      ...theme.typography.bodyLgBold,
    },
    infoDescription: {
      color: colors.textSecondary,
      ...theme.typography.bodyLg,
      lineHeight: 21,
    },
    infoActionRow: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xs,
    },
    quickActionButton: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      flex: 1,
      justifyContent: 'center',
      minHeight: 40,
      paddingHorizontal: theme.spacing.xs,
    },
    quickActionPrimary: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    quickActionLabel: {
      color: colors.textPrimary,
      ...theme.typography.labelMd,
      textAlign: 'center',
    },
    quickActionPrimaryLabel: {
      color: theme.colors.text.inverse,
    },
  });

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
            void visitPhotosQuery.refetch();
          }}
        />
        <PageErrorToast errorMessage={deleteErrorMessage} title="Delete failed" />
        <PageErrorToast errorMessage={friendSuggestionErrorMessage} title="Friend suggestion unavailable" />
        {friendSuggestion ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Add {inviterDisplayName} as a friend?</Text>
            <Text style={styles.infoDescription}>
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
                <Text style={[styles.quickActionLabel, styles.quickActionPrimaryLabel]}>
                  {isApplyingFriendSuggestion ? 'Adding...' : 'Add Friend'}
                </Text>
              </Pressable>
              <Pressable
                disabled={isApplyingFriendSuggestion}
                onPress={handleDismissFriendSuggestion}
                style={styles.quickActionButton}
              >
                <Text style={styles.quickActionLabel}>Not Now</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {!isLoading &&
        !hasBlockingFeedError &&
        effectiveFeedMode === 'friends' &&
        totalFeedCount === 0 ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>No friend activity yet</Text>
            <Text style={styles.infoDescription}>
              Add friends to see their ratings and quick track items here.
            </Text>
            <View style={styles.infoActionRow}>
              <Pressable
                onPress={() => {
                  navigation.navigate('Friends');
                }}
                style={[styles.quickActionButton, styles.quickActionPrimary]}
              >
                <Text style={[styles.quickActionLabel, styles.quickActionPrimaryLabel]}>Add Friends</Text>
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
            <Text style={styles.infoTitle}>No matching ratings</Text>
            <Text style={styles.infoDescription}>
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
                <Text style={styles.quickActionLabel}>Reset Filters</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {!isLoading && !hasBlockingFeedError && filteredFeed.length > 0
          ? effectiveFeedMode === 'beta'
            ? (
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
                                  promptDeleteVisit(visit.id, visit.restaurantName);
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
                          onOpenPhotoViewer={openPhotoViewer}
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
                                promptDeleteQuickTrack(quickTrack.id, quickTrack.itemName);
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
                        onOpenPhotoViewer={openPhotoViewer}
                        onSharePhoto={handleSharePhoto}
                        ownerLabel={ownerLabel}
                        photos={quickTrackPhotos}
                        quickTrack={quickTrack}
                        timeLabel={timeLabel}
                      />
                    );
                  })}
                </View>
              )
            : groupedMonths.map((month, monthIndex) => {
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
                      <Text style={styles.monthChevron}>{isMonthExpanded ? 'v' : '>'}</Text>
                      <Text style={styles.monthLabel}>{month.monthLabel}</Text>
                    </View>
                    <View style={styles.monthCountWrap}>
                      <Text style={styles.monthCount}>{month.totalCount}</Text>
                      <Text style={styles.monthCountMeta}>
                        ({month.visitsCount}v • {month.quickTrackCount}q)
                      </Text>
                    </View>
                  </Pressable>

                  {isMonthExpanded ? (
                    <View style={styles.monthContent}>
                      {month.days.map((day, dayIndex) => {
                        const isDayExpanded = expandedDays.has(day.dayKey);

                        return (
                          <View key={day.dayKey} style={styles.dayGroup}>
                            <Pressable
                              onPress={() => {
                                toggleDay(day.dayKey);
                              }}
                              style={styles.dayHeader}
                            >
                              <Text style={styles.dayChevron}>{isDayExpanded ? 'v' : '>'}</Text>
                              <Text numberOfLines={1} style={styles.dayLabel}>
                                {day.dayLabel}
                              </Text>
                              <Text style={styles.dayCount}>({day.entries.length})</Text>
                            </Pressable>

                            {isDayExpanded ? (
                              <View style={styles.entries}>
                                {day.entries.map((feedItem, entryIndex) => {
                                  const timeLabel = new Date(feedItem.eventAt).toLocaleTimeString([], {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  });

                                  if (feedItem.source === 'visit') {
                                    const { visit } = feedItem;
                                    const restaurantMeta = [visit.restaurantLocation, visit.restaurantCuisineType]
                                      .filter((value) => value && value.trim().length > 0)
                                      .join(' • ');
                                    const shareableVisitItems = buildVisitShareItems(visit);
                                    const showVisitShare = !feedItem.isFriend && shareableVisitItems.length > 1;

                                    return (
                                      <HomeFeedVisitEntryCard
                                        deleteTestID={
                                          monthIndex === 0 && dayIndex === 0 && entryIndex === 0
                                            ? 'home-first-visit-delete-button'
                                            : undefined
                                        }
                                        editTestID={
                                          monthIndex === 0 && dayIndex === 0 && entryIndex === 0
                                            ? 'home-first-visit-edit-button'
                                            : undefined
                                        }
                                        footerLabel={timeLabel}
                                        friendName={feedItem.isFriend ? feedItem.friendName : undefined}
                                        getPhotosForItem={(itemId) => photosByFoodItem.get(itemId) ?? []}
                                        key={feedItem.id}
                                        onDelete={
                                          !feedItem.isFriend
                                            ? () => {
                                                promptDeleteVisit(visit.id, visit.restaurantName);
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
                                        onOpenPhotoViewer={openPhotoViewer}
                                        onMoreActions={
                                          feedItem.isFriend
                                            ? () => {
                                                promptReportTarget({
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
                                        moreActionsAccessibilityLabel="Report visit"
                                        restaurantMetaLabel={restaurantMeta}
                                        visit={visit}
                                      />
                                    );
                                  }

                                  const quickTrack = feedItem.quickTrack;
                                  const quickTrackPhotos = photosByFoodItem.get(quickTrack.id) ?? [];

                                  return (
                                    <HomeQuickTrackEntryCard
                                      entryMeta={timeLabel}
                                      friendName={feedItem.isFriend ? feedItem.friendName : undefined}
                                      key={feedItem.id}
                                      moreActionsAccessibilityLabel="Report quick track"
                                      onDelete={
                                        !feedItem.isFriend
                                          ? () => {
                                              promptDeleteQuickTrack(quickTrack.id, quickTrack.itemName);
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
                                              promptReportTarget({
                                                id: quickTrack.id,
                                                itemName: quickTrack.itemName,
                                                kind: 'quick-track',
                                              });
                                            }
                                          : undefined
                                      }
                                      onOpenPhotoViewer={openPhotoViewer}
                                      onSharePhoto={handleSharePhoto}
                                      photos={quickTrackPhotos}
                                      quickTrack={quickTrack}
                                      showUnderReviewBadge={
                                        !feedItem.isFriend && quickTrack.moderationStatus === 'under_review'
                                      }
                                    />
                                  );
                                })}
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })
          : null}

        {!isLoading && !hasBlockingFeedError && homeFeedQuery.hasNextPage ? (
          <Button
            label={homeFeedQuery.isFetchingNextPage ? 'Loading more...' : 'Load more activity'}
            loading={homeFeedQuery.isFetchingNextPage}
            onPress={handleLoadMoreFeed}
            variant="secondary"
          />
        ) : null}

      </View>

      <PhotoViewerModal
        initialIndex={photoViewerInitialIndex}
        onRequestClose={closePhotoViewer}
        urls={photoViewerUrls}
        visible={photoViewerVisible}
      />
      <ReportContentModal
        contentLabel={pendingReportTarget?.itemName?.trim() || (pendingReportTarget?.kind === 'visit' ? 'Visit' : 'Quick Track')}
        contentType={pendingReportTarget?.kind ?? 'visit'}
        errorMessage={reportErrorMessage}
        isOnline={isOnline}
        isSubmitting={isSubmittingReport}
        notes={reportNotes}
        onCancel={closeReportModal}
        onChangeNotes={(value) => {
          setReportNotes(value);
          if (reportErrorMessage) {
            setReportErrorMessage(null);
          }
        }}
        onChangeReasonCode={(value) => {
          setReportReasonCode(value);
          if (reportErrorMessage) {
            setReportErrorMessage(null);
          }
        }}
        onSubmit={() => {
          void submitReport();
        }}
        selectedReasonCode={reportReasonCode}
        testID="home-report-content-modal"
        visible={pendingReportTarget !== null}
      />
      <ConfirmDestructiveModal
        cancelLabel={pendingDeleteTarget?.kind === 'visit' ? 'Keep Visit' : 'Keep Quick Track'}
        confirmLabel={pendingDeleteTarget?.kind === 'visit' ? 'Delete Visit' : 'Delete Quick Track'}
        confirmLoadingLabel="Deleting..."
        description={
          pendingDeleteTarget?.kind === 'visit'
            ? pendingDeleteTarget.itemName.trim()
              ? `Delete your visit for "${pendingDeleteTarget.itemName}"? This removes the visit and all associated items/photos.`
              : 'Delete this visit? This removes the visit and all associated items/photos.'
            : pendingDeleteTarget?.itemName?.trim()
              ? `Delete "${pendingDeleteTarget.itemName}"? This will permanently remove the quick-track item.`
              : 'Delete this quick track? This will permanently remove the quick-track item.'
        }
        disabled={!pendingDeleteTarget}
        loading={isDeletingTarget}
        onCancel={closeDeleteModal}
        onConfirm={() => {
          void confirmDeleteTarget();
        }}
        testID={
          pendingDeleteTarget?.kind === 'visit'
            ? 'home-delete-visit-confirmation-modal'
            : 'home-delete-quick-track-confirmation-modal'
        }
        title={pendingDeleteTarget?.kind === 'visit' ? 'Delete Visit?' : 'Delete Quick Track?'}
        visible={pendingDeleteTarget !== null}
      >
        {pendingDeleteTarget?.kind === 'visit' ? (
          <View
            collapsable={false}
            pointerEvents="none"
            style={styles.deleteConfirmationModalSentinel}
            testID="home-delete-confirmation-open"
          />
        ) : null}
      </ConfirmDestructiveModal>
    </TabRootScreenScaffold>
  );
}
