import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  SectionList,
  View,
} from 'react-native';
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  EmptyState,
  type FeedViewModeValue,
  FeatureListFooter,
  FeedHeaderControls,
  HomeFeedVisitEntryCard,
  HomeFoodProductEntryCard,
  ScreenContentSection,
  Skeleton,
  TabRootScreenScaffold,
} from '../components/shared';
import {
  createFriendSuggestionAcceptance,
  friendsQueryKeys,
  homeFeedQueryKeys,
  homeFeedMapQueryKeys,
  invalidateHomeFeedQueries,
  HOME_FEED_DEFAULT_SORTS,
  listHomeFeedMapPoints,
  mapHomeFeedDefaultsFromRecord,
  type HomeFeedCursor,
  type HomeFeedPageResult,
  listHomeFeedPage,
  type VisitRecord,
} from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useQueuedFeatureWrites } from '../features/store/useQueuedFeatureWrites';
import { useWriteTelemetry } from '../features/store/useWriteTelemetry';
import {
  clearPendingFriendSuggestion,
  getPendingFriendSuggestion,
  type PendingFriendSuggestion,
} from '../lib/pendingFriendSuggestion';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { trackProductEvent } from '../observability/productAnalytics';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useLayoutChrome } from '../providers/LayoutChromeProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import { useFeatureBrowse } from '../features/store/useFeatureBrowse';
import { HomeFeedActionModals } from './home/HomeFeedActionModals';
import { HomePendingEntriesSection } from './home/HomePendingEntriesSection';
import {
  applyInitialViewParams,
  buildFoodProductFeedItem,
  buildVisitFeedItem,
  formatCount,
  formatFriendEntryMonthLabel,
  formatMineEntryFooterLabel,
  getFriendEntryMonthInfo,
} from './home/homeFeedGrouping';
import { HomeFeedMapView } from './home/HomeFeedMapView';
import type {
  FeedItem,
  FeedMode,
  FriendFeedSection,
  GroupedMonth,
  SortFilter,
  TypeFilter,
} from './home/homeFeedTypes';
import { type VisitPhotoRecord } from './home/shared';
import { useHomeFeedActionController } from './home/useHomeFeedActionController';

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
type VisitShareItem = RootStackParamList['VisitShareCustomization']['items'][number];
type HomeFeedRecord = HomeFeedPageResult['items'][number];
type HomeFeedInfiniteData = InfiniteData<HomeFeedPageResult, HomeFeedCursor | undefined>;

const useStyles = createThemedStyles((theme) => {
  const feedGap = theme.spacing.xs;
  const leadInGap = theme.spacing.sm;

  return {
  screenContent: {
    backgroundColor: theme.colors.background.app,
    flex: 1,
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  headerBackdrop: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
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
    gap: theme.spacing.sm,
    paddingBottom: 0,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  pendingStack: {
    gap: theme.spacing.sm,
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
    gap: feedGap,
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
    paddingVertical: theme.spacing.xs,
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
    gap: feedGap,
  },
  emptyStateWrap: {
    flex: 1,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  list: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  listContent: {
    backgroundColor: theme.colors.background.app,
    flexGrow: 1,
    paddingBottom: theme.spacing.sm,
  },
  listFooter: {
    paddingHorizontal: theme.spacing.sm,
  },
  listItemRow: {
    paddingHorizontal: theme.spacing.sm,
  },
  listFirstItemRow: {
    paddingTop: leadInGap,
  },
  listItemSeparator: {
    height: feedGap,
  },
  monthEntryRow: {
    paddingLeft: theme.spacing.lg,
    paddingRight: theme.spacing.sm,
  },
  monthFirstEntryRow: {
    paddingTop: leadInGap,
  },
  monthSectionHeader: {
    paddingHorizontal: theme.spacing.sm,
    paddingTop: feedGap,
  },
  monthFirstSectionHeader: {
    paddingTop: leadInGap,
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
  };
});

const HOME_FEED_PAGE_SIZE = 20;
const HOME_FEED_SEARCH_DEBOUNCE_MS = 300;
const VISIT_FOCUS_HIGHLIGHT_DURATION_MS = 2400;
const SCROLL_TO_FOCUSED_VISIT_RETRY_DELAY_MS = 100;

export function HomeScreen({ navigation, route }: HomeScreenProps) {
  const theme = useTheme();
  const mineFeedListRef = useRef<FlatList<FeedItem> | null>(null);
  const friendFeedSectionListRef = useRef<SectionList<FeedItem, FriendFeedSection> | null>(null);
  const highlightedVisitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousDefaultsUserIdRef = useRef<string | null | undefined>(undefined);
  const { topOverlayHeight } = useLayoutChrome();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();
  const trackWriteTelemetry = useWriteTelemetry();
  const { queuedWrites: pendingHomeCreateWrites } = useQueuedFeatureWrites([
    'visit.create',
    'food-product.create',
  ]);
  const { isOnline } = useConnectivity();
  const initialHomeFeedDefaults = useMemo(() => mapHomeFeedDefaultsFromRecord(user), [user]);
  const [feedMode, setFeedMode] = useState<FeedMode>(initialHomeFeedDefaults.homeFeedMode);
  const [viewMode, setViewMode] = useState<FeedViewModeValue>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialHomeFeedDefaults.homeFeedTypeFilter);
  const [sortByMode, setSortByMode] = useState<Record<FeedMode, SortFilter>>({
    friends:
      initialHomeFeedDefaults.homeFeedMode === 'friends'
        ? initialHomeFeedDefaults.homeFeedSort
        : HOME_FEED_DEFAULT_SORTS.friends,
    mine:
      initialHomeFeedDefaults.homeFeedMode === 'mine'
        ? initialHomeFeedDefaults.homeFeedSort
        : HOME_FEED_DEFAULT_SORTS.mine,
  });
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [friendSuggestion, setFriendSuggestion] = useState<PendingFriendSuggestion | null>(null);
  const [friendSuggestionErrorMessage, setFriendSuggestionErrorMessage] = useState<string | null>(null);
  const [isApplyingFriendSuggestion, setIsApplyingFriendSuggestion] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [pendingFocusVisitId, setPendingFocusVisitId] = useState<string | null>(null);
  const [highlightedVisitId, setHighlightedVisitId] = useState<string | null>(null);
  const [selectedMapGroupId, setSelectedMapGroupId] = useState<string | null>(null);
  const [mapResetSignal, setMapResetSignal] = useState(0);
  const homeFeedActions = useHomeFeedActionController({
    isOnline,
    queryClient,
    trackWriteTelemetry,
    writeFeature,
  });
  const feedScope = feedMode;
  const sortFilter = sortByMode[feedMode];
  const trimmedSearchQuery = searchQuery.trim();
  const debouncedTrimmedSearchQuery = useDebouncedValue(
    trimmedSearchQuery,
    HOME_FEED_SEARCH_DEBOUNCE_MS,
  );
  const authenticatedUserId = user?.id ?? null;
  const currentUserId = authenticatedUserId;
  const inviterDisplayName = friendSuggestion?.inviterDisplayName?.trim() || 'your inviter';
  const homeFeedQuery = useInfiniteQuery<
    HomeFeedPageResult,
    Error,
    InfiniteData<HomeFeedPageResult, HomeFeedCursor | undefined>,
    ReturnType<typeof homeFeedQueryKeys.paginated>,
    HomeFeedCursor | undefined
  >({
    queryKey: homeFeedQueryKeys.paginated(
      authenticatedUserId,
      feedScope,
      typeFilter,
      sortFilter,
      debouncedTrimmedSearchQuery,
    ),
    enabled: Boolean(authenticatedUserId),
    initialPageParam: undefined as HomeFeedCursor | undefined,
    queryFn: ({ pageParam, signal }) =>
      listHomeFeedPage({
        cursor: pageParam,
        pageSize: HOME_FEED_PAGE_SIZE,
        scope: feedScope,
        search: debouncedTrimmedSearchQuery || undefined,
        signal,
        sort: sortFilter,
        typeFilter,
      }),
    getNextPageParam: (lastPage) => lastPage.cursor,
  });
  const homeFeedMapQuery = useQuery({
    queryKey: homeFeedMapQueryKeys.points(
      authenticatedUserId,
      feedScope,
      typeFilter,
      sortFilter,
      debouncedTrimmedSearchQuery,
    ),
    enabled: Boolean(authenticatedUserId) && viewMode === 'map',
    queryFn: ({ signal }) =>
      listHomeFeedMapPoints({
        scope: feedScope,
        search: debouncedTrimmedSearchQuery || undefined,
        signal,
        sort: sortFilter,
        typeFilter,
      }),
  });
  const resetMapState = useCallback(() => {
    setSelectedMapGroupId(null);
    setMapResetSignal((value) => value + 1);
  }, []);

  const scrollHomeListToTop = useCallback(() => {
    if (viewMode !== 'list') {
      return;
    }

    if (feedMode === 'mine') {
      mineFeedListRef.current?.scrollToOffset({
        animated: true,
        offset: 0,
      });
      return;
    }

    friendFeedSectionListRef.current?.getScrollResponder()?.scrollTo({
      animated: true,
      y: 0,
    });
  }, [feedMode, viewMode]);

  const handleViewModeChange = useCallback(
    (nextViewMode: FeedViewModeValue) => {
      setViewMode(nextViewMode);
      if (nextViewMode === 'list') {
        resetMapState();
      }
    },
    [resetMapState],
  );

  useEffect(
    () => {
      const unsubscribe = navigation.addListener?.('blur', () => {
        resetMapState();
      });
      return unsubscribe;
    },
    [navigation, resetMapState],
  );

  useEffect(() => {
    if (route.params?.scrollToTopSignal === undefined) {
      return;
    }

    scrollHomeListToTop();
  }, [route.params?.scrollToTopSignal, scrollHomeListToTop]);

  const {
    fetchNextPage: fetchNextHomeFeedPage,
    hasNextPage: hasNextHomeFeedPage,
    isFetchingNextPage: isFetchingNextHomeFeedPage,
  } = homeFeedQuery;
  useEffect(() => {
    if (previousDefaultsUserIdRef.current === undefined) {
      previousDefaultsUserIdRef.current = authenticatedUserId;
      return;
    }

    if (previousDefaultsUserIdRef.current === authenticatedUserId) {
      return;
    }

    previousDefaultsUserIdRef.current = authenticatedUserId;
    setFeedMode(initialHomeFeedDefaults.homeFeedMode);
    setTypeFilter(initialHomeFeedDefaults.homeFeedTypeFilter);
    setSearchQuery('');
    setFiltersExpanded(false);
    setSortByMode((previous) => ({
      ...previous,
      [initialHomeFeedDefaults.homeFeedMode]: initialHomeFeedDefaults.homeFeedSort,
    }));
  }, [
    authenticatedUserId,
    initialHomeFeedDefaults.homeFeedMode,
    initialHomeFeedDefaults.homeFeedSort,
    initialHomeFeedDefaults.homeFeedTypeFilter,
  ]);

  const getHomeFeedRecordsFromData = useCallback(
    (data: HomeFeedInfiniteData | undefined) => data?.pages.flatMap((page) => page.items) ?? [],
    [],
  );
  const homeFeedResultCount = useMemo(
    () => getHomeFeedRecordsFromData(homeFeedQuery.data).length,
    [getHomeFeedRecordsFromData, homeFeedQuery.data],
  );
  const loadedPhotoPreviews = useMemo(
    () => homeFeedQuery.data?.pages.flatMap((page) => page.photoPreviews ?? []) ?? [],
    [homeFeedQuery.data],
  );
  const mapPoints = homeFeedMapQuery.data?.points ?? [];
  const mapPhotoPreviews = homeFeedMapQuery.data?.photoPreviews ?? [];

  const buildBrowseAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'HomeScreen',
      feedMode,
      typeFilter,
      sortFilter,
      queryLength: debouncedTrimmedSearchQuery.length,
      resultCount: homeFeedResultCount,
      ...overrides,
    }),
    [debouncedTrimmedSearchQuery.length, feedMode, homeFeedResultCount, sortFilter, typeFilter],
  );
  const browseState = useFeatureBrowse<HomeFeedInfiniteData, HomeFeedRecord>({
    analyticsSource: 'HomeScreen',
    buildAnalyticsPayload: buildBrowseAnalyticsPayload,
    getHasCachedData: (data) => (data?.pages.length ?? 0) > 0,
    getItemsFromData: getHomeFeedRecordsFromData,
    getResultCountFromData: (data, fallbackCount) =>
      data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? fallbackCount,
    loadMoreEventPrefix: 'HOME_FEED_LOAD_MORE',
    query: homeFeedQuery,
    refreshEventPrefix: 'HOME_FEED_REFRESH',
    resultCount: homeFeedResultCount,
  });
  const loadedFeed = useMemo(
    () =>
      browseState.items.map((item) =>
        item.source === 'visit'
          ? buildVisitFeedItem(item.visit, currentUserId, item.eventAt)
          : buildFoodProductFeedItem(item.foodProduct, currentUserId, item.eventAt),
      ),
    [browseState.items, currentUserId],
  );

  const isLoading = browseState.isLoading;
  const hasBlockingFeedError = browseState.hasBlockingError;
  const hasFeedRefreshError = browseState.hasRefreshError;

  useEffect(() => {
    trackProductEvent('social.feed_viewed', {
      feedMode,
      typeFilter,
      sortFilter,
      queryLength: debouncedTrimmedSearchQuery.length,
      resultCount: loadedFeed.length,
      source: 'HomeScreen',
      trigger: debouncedTrimmedSearchQuery.length > 0 ? 'search_or_filter' : 'browse',
      viewMode,
    });
  }, [
    debouncedTrimmedSearchQuery.length,
    feedMode,
    loadedFeed.length,
    sortFilter,
    typeFilter,
    viewMode,
  ]);

  useEffect(() => {
    if (!route.params?.initialView) {
      return;
    }

    const { initialView } = route.params;
    applyInitialViewParams(route.params.initialView, {
      setFeedMode,
      setFiltersExpanded,
      setSearchQuery,
      setSortByMode,
      setTypeFilter,
    });
    setPendingFocusVisitId(initialView.focusVisitId?.trim() || null);

    navigation.setParams({
      initialView: undefined,
    });
  }, [navigation, route.params]);

  useEffect(
    () => () => {
      if (highlightedVisitTimeoutRef.current) {
        clearTimeout(highlightedVisitTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!pendingFocusVisitId) {
      return;
    }

    if (feedMode !== 'mine' || (typeFilter !== 'visits' && typeFilter !== 'all')) {
      return;
    }

    if (isLoading) {
      return;
    }

    const focusedIndex = loadedFeed.findIndex(
      (entry) => entry.source === 'visit' && entry.visit.id === pendingFocusVisitId,
    );

    if (focusedIndex >= 0) {
      mineFeedListRef.current?.scrollToIndex({
        animated: true,
        index: focusedIndex,
        viewPosition: 0.15,
      });
      setHighlightedVisitId(pendingFocusVisitId);
      setPendingFocusVisitId(null);

      if (highlightedVisitTimeoutRef.current) {
        clearTimeout(highlightedVisitTimeoutRef.current);
      }
      highlightedVisitTimeoutRef.current = setTimeout(() => {
        setHighlightedVisitId(null);
        highlightedVisitTimeoutRef.current = null;
      }, VISIT_FOCUS_HIGHLIGHT_DURATION_MS);
      return;
    }

    if (!hasNextHomeFeedPage) {
      setPendingFocusVisitId(null);
      return;
    }

    if (isFetchingNextHomeFeedPage) {
      return;
    }

    void fetchNextHomeFeedPage().catch(() => {
      setPendingFocusVisitId(null);
    });
  }, [
    fetchNextHomeFeedPage,
    feedMode,
    hasNextHomeFeedPage,
    isFetchingNextHomeFeedPage,
    isLoading,
    loadedFeed,
    pendingFocusVisitId,
    typeFilter,
  ]);

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

  const groupedMonths = useMemo<GroupedMonth[]>(() => {
    if (feedMode !== 'friends') {
      return [];
    }

    const monthMap = new Map<
      string,
      {
        monthKey: string;
        monthLabel: string;
        totalCount: number;
        visitsCount: number;
        foodProductCount: number;
        entries: FeedItem[];
      }
    >();

    loadedFeed.forEach((entry) => {
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
          foodProductCount: 0,
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
        monthGroup.foodProductCount += 1;
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
        foodProductCount: month.foodProductCount,
        entries: month.entries,
      }));
  }, [feedMode, loadedFeed]);

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

  const firstMineVisitIndex = useMemo(
    () =>
      feedMode === 'mine'
        ? loadedFeed.findIndex((entry) => entry.source === 'visit')
        : -1,
    [feedMode, loadedFeed],
  );
  const firstFriendMonthKey = groupedMonths[0]?.monthKey ?? null;
  const friendFeedSections = useMemo<FriendFeedSection[]>(
    () =>
      groupedMonths.map((month) => ({
        ...month,
        data: expandedMonths.has(month.monthKey) ? month.entries : [],
      })),
    [expandedMonths, groupedMonths],
  );
  const moveVisitFallbackVisits = useMemo(
    () =>
      loadedFeed.flatMap((entry) =>
        entry.source === 'visit' && !entry.isFriend ? [entry.visit] : [],
      ),
    [loadedFeed],
  );
  const totalVisitCount =
    homeFeedQuery.data?.pages[0]?.totalVisits ??
    loadedFeed.filter((entry) => entry.source === 'visit').length;
  const totalFoodProductCount =
    homeFeedQuery.data?.pages[0]?.totalFoodProducts ??
    loadedFeed.filter((entry) => entry.source === 'food-product').length;
  const totalFeedCount = totalVisitCount + totalFoodProductCount;

  const summaryText = useMemo(() => {
    const visitLabel = feedMode === 'friends' ? ['friend visit', 'friend visits'] : ['visit', 'visits'];
    const foodProductLabel =
      feedMode === 'friends'
        ? ['friend food product', 'friend food products']
        : ['food product', 'food products'];

    if (typeFilter === 'visits') {
      return totalVisitCount === 0
        ? feedMode === 'friends'
          ? 'No friend visits yet'
          : 'No visits yet'
        : formatCount(totalVisitCount, visitLabel[0], visitLabel[1]);
    }

    if (typeFilter === 'food-products') {
      return totalFoodProductCount === 0
        ? feedMode === 'friends'
          ? 'No friend food products yet'
          : 'No food products yet'
        : formatCount(totalFoodProductCount, foodProductLabel[0], foodProductLabel[1]);
    }

    if (totalFeedCount === 0) {
      return feedMode === 'friends' ? 'No friend ratings yet' : 'No ratings yet';
    }

    return [
      formatCount(totalVisitCount, visitLabel[0], visitLabel[1]),
      formatCount(totalFoodProductCount, foodProductLabel[0], foodProductLabel[1]),
    ].join(' • ');
  }, [
    feedMode,
    totalFeedCount,
    totalFoodProductCount,
    totalVisitCount,
    typeFilter,
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
      trackProductEvent('social.invite_shared', {
        contentType: 'visit_photo',
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
      trackProductEvent('social.invite_shared', {
        contentType: 'visit',
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
      return next;
    });
  };

  const handleFeedModeChange = useCallback((nextMode: FeedMode) => {
    trackObservabilityEvent('HOME_FEED_MODE_SELECTED', {
      feedMode: nextMode,
      source: 'HomeScreen',
    });
    trackProductEvent('social.feed_viewed', {
      feedMode: nextMode,
      source: 'HomeScreen',
      trigger: 'feed_mode_change',
    });
    setFeedMode(nextMode);
  }, []);

  const handleTypeFilterChange = useCallback((nextFilter: TypeFilter) => {
    trackObservabilityEvent('HOME_TYPE_FILTER_SELECTED', {
      filter: nextFilter,
      source: 'HomeScreen',
    });
    trackProductEvent('social.feed_viewed', {
      feedMode,
      typeFilter: nextFilter,
      source: 'HomeScreen',
      trigger: 'type_filter_change',
    });
    setTypeFilter(nextFilter);
  }, [feedMode]);

  const handleSortFilterChange = useCallback((nextSort: SortFilter) => {
    trackObservabilityEvent('HOME_SORT_FILTER_SELECTED', {
      feedMode,
      sort: nextSort,
      source: 'HomeScreen',
    });
    trackProductEvent('social.feed_viewed', {
      feedMode,
      sort: nextSort,
      source: 'HomeScreen',
      trigger: 'sort_change',
    });
    setSortByMode((previous) => ({
      ...previous,
      [feedMode]: nextSort,
    }));
  }, [feedMode]);

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
      await trackWriteTelemetry('friend.suggestion.accept');
      await createFriendSuggestionAcceptance({ inviterId: friendSuggestion.inviterId });
      await clearPendingFriendSuggestion();
      setFriendSuggestion(null);
      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
      await invalidateHomeFeedQueries(queryClient);
      trackObservabilityEvent('FRIEND_SUGGESTION_ACCEPT_SUCCEEDED', {
        source: 'HomeScreen',
      });
      trackProductEvent('social.invite_accepted', {
        source: 'HomeScreen',
      });
      trackProductEvent('social.friend_added', {
        source: 'HomeScreen',
        entryMethod: 'invite_suggestion',
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
  }, [friendSuggestion, isOnline, queryClient, trackWriteTelemetry]);

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
            highlighted={visit.id === highlightedVisitId}
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
            onItemLongPress={
              !feedItem.isFriend
                ? (item) => {
                    homeFeedActions.promptMoveVisitItem({
                      item,
                      sourceVisitId: visit.id,
                      sourceVisitName: visit.restaurantName,
                    });
                  }
                : undefined
            }
            onOpenPhotoViewer={homeFeedActions.openPhotoViewer}
            onMoreActions={
              feedItem.isFriend
                ? () => {
                    trackProductEvent('trust.content_report_started', {
                      contentType: 'visit',
                      feedMode,
                      source: 'HomeScreen',
                      surface: 'more_actions',
                    });
                    homeFeedActions.promptReportMenuTarget({
                      id: visit.id,
                      itemName: visit.restaurantName,
                      kind: 'visit',
                    });
                  }
                : undefined
            }
            onSharePhoto={!feedItem.isFriend ? handleSharePhoto : undefined}
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

      const { foodProduct } = feedItem;
      const foodProductPhotos = photosByFoodItem.get(foodProduct.id) ?? [];

      return (
        <HomeFoodProductEntryCard
          entryMeta={footerLabel}
          friendName={feedItem.isFriend ? feedItem.friendName : undefined}
          key={feedItem.id}
          moreActionsAccessibilityLabel="Food product actions"
          onDelete={
            !feedItem.isFriend
              ? () => {
                  homeFeedActions.promptDeleteFoodProduct(
                    foodProduct.id,
                    foodProduct.itemName,
                  );
                }
              : undefined
          }
          onEdit={
            !feedItem.isFriend
              ? () => {
                  navigation.navigate('EditFoodProduct', {
                    foodProductId: foodProduct.id,
                  });
                }
              : undefined
          }
          onMoreActions={
            feedItem.isFriend
              ? () => {
                    trackProductEvent('trust.content_report_started', {
                      contentType: 'food_product',
                      feedMode,
                      source: 'HomeScreen',
                      surface: 'more_actions',
                    });
                    homeFeedActions.promptReportMenuTarget({
                      id: foodProduct.id,
                      itemName: foodProduct.itemName,
                      kind: 'food-product',
                    });
                  }
                : undefined
          }
          onOpenPhotoViewer={homeFeedActions.openPhotoViewer}
          onSharePhoto={!feedItem.isFriend ? handleSharePhoto : undefined}
          photos={foodProductPhotos}
          foodProduct={foodProduct}
          showUnderReviewBadge={
            !feedItem.isFriend && foodProduct.moderationStatus === 'under_review'
          }
        />
      );
    },
    [
      buildVisitShareItems,
      handleSharePhoto,
      handleShareVisit,
      highlightedVisitId,
      homeFeedActions,
      feedMode,
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
    screenBackground: theme.colors.background.app,
    shadow: theme.colors.background.inverse,
    surface: theme.colors.background.surface,
    textMuted: theme.colors.text.muted,
    textPrimary: theme.colors.text.primary,
    textSecondary: theme.colors.text.secondary,
  } as const;

  const styles = useStyles();
  const showFilteredEmptyState =
    !isLoading &&
    !hasBlockingFeedError &&
    loadedFeed.length === 0 &&
    (trimmedSearchQuery.length > 0 || typeFilter !== 'all');
  const showFriendsEmptyState =
    !showFilteredEmptyState &&
    !isLoading &&
    !hasBlockingFeedError &&
    feedMode === 'friends' &&
    totalFeedCount === 0;
  const showMineEmptyState =
    !showFilteredEmptyState &&
    !isLoading &&
    !hasBlockingFeedError &&
    feedMode === 'mine' &&
    totalFeedCount === 0;
  const homeFeedErrorMessage = hasBlockingFeedError
    ? 'Could not load your ratings feed.'
    : hasFeedRefreshError
      ? 'Could not refresh your feed. Showing saved data.'
      : null;
  const hasCachedMapPoints = mapPoints.length > 0;
  const homeFeedMapBlockingErrorMessage =
    viewMode === 'map' && homeFeedMapQuery.isError && !hasCachedMapPoints
      ? 'Could not load your map locations.'
      : null;
  const homeFeedMapRefreshErrorMessage =
    viewMode === 'map' && homeFeedMapQuery.isError && hasCachedMapPoints
      ? 'Could not refresh map. Showing saved locations.'
      : null;
  const deleteErrorMessage = homeFeedActions.deleteErrorMessage;
  const showHomeListBody =
    (viewMode === 'list' && homeFeedErrorMessage !== null) ||
    homeFeedMapRefreshErrorMessage !== null ||
    deleteErrorMessage !== null ||
    friendSuggestionErrorMessage !== null ||
    friendSuggestion !== null;

  const renderMineFeedItem = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => (
      <View style={index === 0 ? [styles.listItemRow, styles.listFirstItemRow] : styles.listItemRow}>
        {renderStandardFeedEntry({
          deleteTestID: index === firstMineVisitIndex ? 'home-first-visit-delete-button' : undefined,
          editTestID: index === firstMineVisitIndex ? 'home-first-visit-edit-button' : undefined,
          feedItem: item,
          footerLabel: formatMineEntryFooterLabel(item),
        })}
      </View>
    ),
    [firstMineVisitIndex, renderStandardFeedEntry, styles],
  );

  const renderFriendFeedItem = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: FeedItem;
      index: number;
      section: FriendFeedSection;
    }) => (
      <View style={index === 0 ? [styles.monthEntryRow, styles.monthFirstEntryRow] : styles.monthEntryRow}>
        {renderStandardFeedEntry({
          deleteTestID:
            section.monthKey === firstFriendMonthKey && index === 0
              ? 'home-first-visit-delete-button'
              : undefined,
          editTestID:
            section.monthKey === firstFriendMonthKey && index === 0
              ? 'home-first-visit-edit-button'
              : undefined,
          feedItem: item,
          footerLabel: formatFriendEntryMonthLabel(item.eventAt),
        })}
      </View>
    ),
    [firstFriendMonthKey, renderStandardFeedEntry, styles],
  );

  const renderFriendFeedSectionHeader = useCallback(
    ({ section }: { section: FriendFeedSection }) => {
      const isMonthExpanded = expandedMonths.has(section.monthKey);
      const isFirstMonth = section.monthKey === firstFriendMonthKey;

      return (
        <View style={[styles.monthSectionHeader, isFirstMonth ? styles.monthFirstSectionHeader : null]}>
          <Pressable
            onPress={() => {
              toggleMonth(section.monthKey);
            }}
            style={styles.monthHeader}
          >
            <View style={styles.monthHeaderLeft}>
              <Text style={styles.monthChevron} variant="labelMdBold">
                {isMonthExpanded ? 'v' : '>'}
              </Text>
              <Text style={styles.monthLabel} variant="titleSm">{section.monthLabel}</Text>
            </View>
            <View style={styles.monthCountWrap}>
              <Text style={styles.monthCount} variant="metric">{section.totalCount}</Text>
              <Text style={styles.monthCountMeta} variant="bodySmTightMedium">
                ({section.visitsCount}v • {section.foodProductCount}p)
              </Text>
            </View>
          </Pressable>
        </View>
      );
    },
    [expandedMonths, firstFriendMonthKey, styles, toggleMonth],
  );

  const homeListHeader = (
    <>
      <View
        onLayout={(event) => {
          setHeaderHeight(event.nativeEvent.layout.height);
        }}
        style={styles.header}
      >
        <FeedHeaderControls
          feedMode={feedMode}
          filtersExpanded={filtersExpanded}
          onClearSearch={() => {
            setSearchQuery('');
          }}
          onFeedModeChange={handleFeedModeChange}
          onSearchQueryChange={setSearchQuery}
          onSortFilterChange={handleSortFilterChange}
          onToggleFilters={handleToggleFilters}
          onTypeFilterChange={handleTypeFilterChange}
          onViewModeChange={handleViewModeChange}
          searchQuery={searchQuery}
          sortFilter={sortFilter}
          summaryText={summaryText}
          typeFilter={typeFilter}
          viewMode={viewMode}
        />
      </View>

      {showHomeListBody ? (
        <View style={styles.body}>
          <PageErrorToast
            analyticsProps={buildBrowseAnalyticsPayload()}
            analyticsSource="HomeScreen"
            errorMessage={viewMode === 'list' ? homeFeedErrorMessage : null}
            title="Feed unavailable"
            actionLabel="Retry"
            onAction={() => {
              void homeFeedQuery.refetch();
            }}
          />
          <PageErrorToast
            analyticsProps={buildBrowseAnalyticsPayload()}
            analyticsSource="HomeScreen"
            errorMessage={homeFeedMapRefreshErrorMessage}
            title="Map unavailable"
            actionLabel="Retry"
            onAction={() => {
              void homeFeedMapQuery.refetch();
            }}
          />
          <PageErrorToast
            analyticsProps={buildBrowseAnalyticsPayload()}
            analyticsSource="HomeScreen"
            errorMessage={deleteErrorMessage}
            title="Delete failed"
          />
          <PageErrorToast
            analyticsProps={buildBrowseAnalyticsPayload()}
            analyticsSource="HomeScreen"
            errorMessage={friendSuggestionErrorMessage}
            title="Friend suggestion unavailable"
          />
          {feedMode === 'mine' ? (
            <HomePendingEntriesSection pendingWrites={pendingHomeCreateWrites} styles={styles} />
          ) : null}
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
        </View>
      ) : null}
    </>
  );

  const homeListEmptyComponent = (() => {
    if (isLoading) {
      return (
        <View style={styles.emptyStateWrap}>
          <Skeleton height={16} />
          <Skeleton height={16} />
          <Skeleton height={16} />
        </View>
      );
    }

    if (hasBlockingFeedError) {
      return null;
    }

    if (showFriendsEmptyState) {
      return (
        <View style={styles.emptyStateWrap}>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle} variant="bodyLgBold">No friend activity yet</Text>
            <Text style={styles.infoDescription} variant="bodyLgCompact">
              Add friends to see their ratings and food products here.
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
        </View>
      );
    }

    if (showMineEmptyState) {
      return (
        <View style={styles.emptyStateWrap}>
          <EmptyState
            actionLabel="Create your first entry"
            analyticsProps={buildBrowseAnalyticsPayload()}
            analyticsSource="HomeScreen"
            description="Start with Add Visit or Food Product."
            fill
            onAction={() => {
              navigation.navigate('AddVisit');
            }}
            title="No ratings yet"
          />
        </View>
      );
    }

    if (showFilteredEmptyState) {
      return (
        <View style={styles.emptyStateWrap}>
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
                  setSortByMode((previous) => ({
                    ...previous,
                    [feedMode]: HOME_FEED_DEFAULT_SORTS[feedMode],
                  }));
                }}
                style={styles.quickActionButton}
              >
                <Text style={styles.quickActionLabel} variant="labelMd">Reset Filters</Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    return null;
  })();

  const homeListFooter =
    !isLoading && !hasBlockingFeedError && browseState.hasNextPage ? (
      <View style={styles.listFooter}>
        <FeatureListFooter
          isFetchingNextPage={browseState.isFetchingNextPage}
          label="Load more activity"
          onLoadMore={browseState.onEndReached}
        />
      </View>
    ) : null;

  return (
    <TabRootScreenScaffold
      contentStyle={styles.screenContent}
      scroll={false}
      scrollUnderlayColor={colors.screenBackground}
      testID="home-screen"
    >
      <View
        pointerEvents="none"
        style={[
          styles.headerBackdrop,
          {
            backgroundColor: theme.colors.background.surface,
            height: headerHeight + topOverlayHeight,
          },
        ]}
        testID="home-screen-header-backdrop"
      />
      <ScreenContentSection
        fill
        overscrollBackgroundSplit={{
          bottomColor: theme.colors.background.app,
          topColor: theme.colors.background.surface,
          topRatio: 0.6,
        }}
        testID="home-screen-records-section"
      >
        {viewMode === 'map' ? (
          <>
            {homeListHeader}
            <HomeFeedMapView
              currentUserId={currentUserId}
              errorMessage={homeFeedMapBlockingErrorMessage}
              feedMode={feedMode}
              loading={homeFeedMapQuery.isLoading}
              omittedWithoutCoordinates={homeFeedMapQuery.data?.omittedWithoutCoordinates ?? 0}
              onRetry={() => {
                void homeFeedMapQuery.refetch();
              }}
              onOpenPhotoViewer={homeFeedActions.openPhotoViewer}
              photoPreviews={mapPhotoPreviews}
              onSelectedGroupChange={setSelectedMapGroupId}
              points={mapPoints}
              resetSignal={mapResetSignal}
              selectedGroupId={selectedMapGroupId}
            />
          </>
        ) : feedMode === 'mine' ? (
          <FlatList
            ref={mineFeedListRef}
            contentContainerStyle={styles.listContent}
            data={!isLoading && !hasBlockingFeedError ? loadedFeed : []}
            ItemSeparatorComponent={() => <View style={styles.listItemSeparator} />}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item.id}
            ListEmptyComponent={homeListEmptyComponent}
            ListFooterComponent={homeListFooter}
            ListHeaderComponent={homeListHeader}
            onRefresh={browseState.onRefresh}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                mineFeedListRef.current?.scrollToIndex({
                  animated: true,
                  index: info.index,
                  viewPosition: 0.15,
                });
              }, SCROLL_TO_FOCUSED_VISIT_RETRY_DELAY_MS);
            }}
            refreshing={browseState.isRefreshing}
            removeClippedSubviews
            renderItem={renderMineFeedItem}
            style={styles.list}
          />
        ) : (
          <SectionList
            ref={friendFeedSectionListRef}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.listItemSeparator} />}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={homeListEmptyComponent}
            ListFooterComponent={homeListFooter}
            ListHeaderComponent={homeListHeader}
            onRefresh={browseState.onRefresh}
            refreshing={browseState.isRefreshing}
            removeClippedSubviews
            renderItem={renderFriendFeedItem}
            renderSectionHeader={renderFriendFeedSectionHeader}
            sections={!isLoading && !hasBlockingFeedError ? friendFeedSections : []}
            stickySectionHeadersEnabled={false}
            style={styles.list}
          />
        )}
      </ScreenContentSection>

      <HomeFeedActionModals
        controller={homeFeedActions}
        fallbackVisits={moveVisitFallbackVisits}
        isOnline={isOnline}
      />
    </TabRootScreenScaffold>
  );
}
