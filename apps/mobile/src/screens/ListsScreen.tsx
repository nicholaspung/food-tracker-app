import { Ionicons } from '../ui/AppIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, View, type ListRenderItem } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  CachedRemoteImage,
  EmptyState,
  ErrorState,
  FeatureListFooter,
  HeaderAccessoryButton,
  PageErrorToast,
  PendingQueuedWriteRow,
  SegmentedControl,
  Skeleton,
  type SegmentedControlOption,
} from '../components/shared';
import {
  buildPocketBaseFileUrl,
  listRestaurantListsPage,
  restaurantListQueryKeys,
  type RestaurantListRecord,
  type PaginatedResult,
} from '../features';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useFeatureBrowse } from '../features/store/useFeatureBrowse';
import type { QueuedFeatureWrite } from '../features/store/queuedFeatureWrites';
import { useRestaurantListWrites } from '../features/store/useRestaurantListWrites';
import { formatDisplayDate } from '../lib/dateFormatting';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Card, Input, ListItem, Text } from '../ui';

type ListsScreenProps = NativeStackScreenProps<RootStackParamList, 'Lists'>;

type ListTab = 'my' | 'friends';
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type RestaurantListsInfiniteData = InfiniteData<PaginatedResult<RestaurantListRecord>, unknown>;

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  listFooter: {
    paddingTop: theme.spacing.md,
  },
  listHeader: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  headerStack: {
    gap: theme.spacing.sm,
  },
  listSeparator: {
    height: theme.spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  screenBody: {
    flex: 1,
    gap: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  searchField: {
    flex: 1,
  },
  clearSearchButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: theme.sizes.secondaryButtonHeight,
    paddingHorizontal: theme.spacing.md,
  },
  clearSearchButtonPressed: {
    backgroundColor: theme.colors.background.muted,
  },
  clearSearchLabel: {
    color: theme.colors.text.secondary,
  },
  listsWrap: {
    gap: theme.spacing.sm,
  },
  skeletonWrap: {
    gap: theme.spacing.sm,
  },
  listCard: {
    gap: 0,
    overflow: 'hidden',
    padding: 0,
  },
  defaultListCard: {
    backgroundColor: theme.colors.status.warningBg,
    borderColor: theme.colors.status.warningBorder,
  },
  coverImageWrap: {
    backgroundColor: theme.colors.background.surface,
    height: 130,
    width: '100%',
  },
  coverImage: {
    height: '100%',
    width: '100%',
  },
  cardListItem: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  cardMetaWrap: {
    gap: theme.spacing.xxs,
  },
  cardDescription: {
    color: theme.colors.text.secondary,
  },
  cardMetaRow: {
    alignItems: 'center',
    columnGap: theme.spacing.xxs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 2,
  },
  cardMetaText: {
    color: theme.colors.text.muted,
  },
  sharedLinkPill: {
    alignItems: 'center',
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.info,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
  },
  sharedLinkPillText: {
    color: theme.colors.text.info,
  },
  ownerMeta: {
    alignItems: 'center',
    columnGap: 4,
    flexDirection: 'row',
    maxWidth: '75%',
  },
  trailingIcons: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xxs,
  },
  emptyIconWrap: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.app,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
}));

const TAB_DEFINITIONS: readonly { label: string; value: ListTab }[] = [
  { label: 'My Lists', value: 'my' },
  { label: 'Friends', value: 'friends' },
];
const LIST_SEARCH_DEBOUNCE_MS = 300;
const LIST_PENDING_OPERATION_NAMES = ['list.create'] as const;

function getListCoverImageUrl(list: RestaurantListRecord): string | null {
  if (!list.coverImage) {
    return null;
  }

  return buildPocketBaseFileUrl({
    collectionName: 'restaurant_lists',
    recordId: list.id,
    filename: list.coverImage,
    thumb: '640x360',
  });
}

function getVisibilityIconName(visibility: RestaurantListRecord['visibility']): IoniconName {
  return visibility === 'friends' ? 'people-outline' : 'lock-closed-outline';
}

function formatDateFromRawTimestamp(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return null;
  }

  const [, yearRaw, monthRaw, dayRaw] = match;
  if (!yearRaw || !monthRaw || !dayRaw) {
    return null;
  }

  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const safeLocalDate = new Date(year, month - 1, day);
  return Number.isNaN(safeLocalDate.getTime()) ? null : safeLocalDate.toLocaleDateString();
}

function getUpdatedLabel(list: RestaurantListRecord): string {
  const direct = formatDateFromRawTimestamp(list.updatedAt);
  if (direct) {
    return direct;
  }

  return formatDisplayDate(list.updatedAt, { fallback: 'recently' });
}

function getRestaurantListsFromInfiniteData(
  data: RestaurantListsInfiniteData | undefined,
): readonly RestaurantListRecord[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

function getRestaurantListsTotalFromInfiniteData(
  data: RestaurantListsInfiniteData | undefined,
  items: readonly RestaurantListRecord[],
): number {
  return data?.pages[0]?.totalItems ?? items.length;
}

function getRestaurantListsResultCountFromInfiniteData(
  data: RestaurantListsInfiniteData | undefined,
  fallbackCount: number,
): number {
  return data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? fallbackCount;
}

function hasRestaurantListsCachedPages(data: RestaurantListsInfiniteData | undefined): boolean {
  return (data?.pages.length ?? 0) > 0;
}

export function ListsScreen({ navigation }: ListsScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const { createDefaultRestaurantList: createDefaultRestaurantListWrite } = useRestaurantListWrites();

  const [activeTab, setActiveTab] = useState<ListTab>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreatingDefaultList, setIsCreatingDefaultList] = useState(false);
  const hasTriedCreatingDefault = useRef(false);
  const lastTrackedSearchExecutionKeyRef = useRef<string | null>(null);
  const trimmedSearchQuery = searchQuery.trim();
  const debouncedTrimmedSearchQuery = useDebouncedValue(trimmedSearchQuery, LIST_SEARCH_DEBOUNCE_MS);

  const myListsQuery = useInfiniteQuery({
    queryKey: restaurantListQueryKeys.paginatedInfinite('my', debouncedTrimmedSearchQuery),
    queryFn: ({ pageParam, signal }) =>
      listRestaurantListsPage({
        scope: 'my',
        page: pageParam,
        pageSize: 20,
        search: debouncedTrimmedSearchQuery || undefined,
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    enabled: activeTab === 'my',
  });

  const friendsListsQuery = useInfiniteQuery({
    queryKey: restaurantListQueryKeys.paginatedInfinite('friends', debouncedTrimmedSearchQuery),
    queryFn: ({ pageParam, signal }) =>
      listRestaurantListsPage({
        scope: 'friends',
        page: pageParam,
        pageSize: 20,
        search: debouncedTrimmedSearchQuery || undefined,
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    enabled: activeTab === 'friends',
  });
  const buildBaseBrowseAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'ListsScreen',
      activeTab,
      queryLength: trimmedSearchQuery.length,
      ...overrides,
    }),
    [activeTab, trimmedSearchQuery.length],
  );
  const myListsBrowseState = useFeatureBrowse<
    RestaurantListsInfiniteData,
    RestaurantListRecord,
    'list.create'
  >({
    analyticsSource: 'ListsScreen',
    buildAnalyticsPayload: useCallback(
      (overrides?: Record<string, string | number | boolean | null>) =>
        buildBaseBrowseAnalyticsPayload({
          resultCount: getRestaurantListsFromInfiniteData(myListsQuery.data).length,
          ...overrides,
        }),
      [buildBaseBrowseAnalyticsPayload, myListsQuery.data],
    ),
    getHasCachedData: hasRestaurantListsCachedPages,
    getItemsFromData: getRestaurantListsFromInfiniteData,
    getResultCountFromData: getRestaurantListsResultCountFromInfiniteData,
    getTotalItemsFromData: getRestaurantListsTotalFromInfiniteData,
    loadMoreEventPrefix: 'LISTS_LOAD_MORE',
    pendingQueuedWriteOperationNames: LIST_PENDING_OPERATION_NAMES,
    query: myListsQuery,
    refreshEventPrefix: 'LISTS_REFRESH',
    toPendingRow: useCallback((write: QueuedFeatureWrite<'list.create'>) => {
      const payload = write.payload as { name?: string; visibility?: string };

      return {
        id: write.id,
        createdAt: write.createdAt,
        description: payload.visibility ? `Visibility: ${payload.visibility}` : undefined,
        idempotencyKey: write.idempotencyKey,
        lastError: write.lastError,
        status: write.status,
        title: payload.name?.trim() || 'New list',
      };
    }, []),
  });
  const friendsListsBrowseState = useFeatureBrowse<RestaurantListsInfiniteData, RestaurantListRecord>({
    analyticsSource: 'ListsScreen',
    buildAnalyticsPayload: useCallback(
      (overrides?: Record<string, string | number | boolean | null>) =>
        buildBaseBrowseAnalyticsPayload({
          resultCount: getRestaurantListsFromInfiniteData(friendsListsQuery.data).length,
          ...overrides,
        }),
      [buildBaseBrowseAnalyticsPayload, friendsListsQuery.data],
    ),
    getHasCachedData: hasRestaurantListsCachedPages,
    getItemsFromData: getRestaurantListsFromInfiniteData,
    getResultCountFromData: getRestaurantListsResultCountFromInfiniteData,
    getTotalItemsFromData: getRestaurantListsTotalFromInfiniteData,
    loadMoreEventPrefix: 'LISTS_LOAD_MORE',
    query: friendsListsQuery,
    refreshEventPrefix: 'LISTS_REFRESH',
  });

  useEffect(() => {
    hasTriedCreatingDefault.current = false;
  }, [user?.id]);

  useEffect(() => {
    if (
      !user?.id ||
      debouncedTrimmedSearchQuery.length > 0 ||
      hasTriedCreatingDefault.current ||
      !myListsQuery.data ||
      myListsQuery.isLoading ||
      (myListsQuery.isError && !myListsQuery.data)
    ) {
      return;
    }

    if (isCreatingDefaultList) {
      return;
    }

    const myLists = myListsBrowseState.items;
    const hasDefault = myLists.some((list) => list.isDefault);
    if (hasDefault) {
      return;
    }

    hasTriedCreatingDefault.current = true;
    setIsCreatingDefaultList(true);

    void (async () => {
      trackObservabilityEvent('LISTS_DEFAULT_LIST_AUTO_CREATE_STARTED', {
        source: 'ListsScreen',
        isOnline,
        listCountBeforeCreate: myLists.length,
        trigger: 'missing_default_list',
      });

      try {
        const createResult = await createDefaultRestaurantListWrite();

        if (createResult.status === 'queued') {
          trackObservabilityEvent('LISTS_DEFAULT_LIST_AUTO_CREATE_SUCCEEDED', {
            source: 'ListsScreen',
            listCountBeforeCreate: myLists.length,
            queued: true,
            trigger: 'missing_default_list',
          });
          return;
        }

        trackObservabilityEvent('LISTS_DEFAULT_LIST_AUTO_CREATE_SUCCEEDED', {
          source: 'ListsScreen',
          listCountBeforeCreate: myLists.length,
          queued: false,
          trigger: 'missing_default_list',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not prepare your Want to Try list.';
        trackObservabilityEvent('LISTS_DEFAULT_LIST_AUTO_CREATE_FAILED', {
          source: 'ListsScreen',
          errorMessage: message,
          errorType: error instanceof Error ? error.name : 'unknown_error',
          isOnline,
          listCountBeforeCreate: myLists.length,
          trigger: 'missing_default_list',
        });
        setErrorMessage(message);
      } finally {
        setIsCreatingDefaultList(false);
      }
    })();
  }, [
    user?.id,
    debouncedTrimmedSearchQuery,
    isCreatingDefaultList,
    myListsBrowseState.items,
    myListsQuery.data,
    myListsQuery.isError,
    myListsQuery.isLoading,
    isOnline,
    createDefaultRestaurantListWrite,
  ]);

  const myLists = myListsBrowseState.items;
  const friendLists = friendsListsBrowseState.items;
  const activeQuery = activeTab === 'my' ? myListsQuery : friendsListsQuery;
  const activeBrowseState = activeTab === 'my' ? myListsBrowseState : friendsListsBrowseState;

  const visibleLists = useMemo(
    () => (activeTab === 'friends' ? friendLists : myLists),
    [activeTab, friendLists, myLists],
  );
  const buildBrowseAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) =>
      buildBaseBrowseAnalyticsPayload({
        resultCount: visibleLists.length,
        ...overrides,
      }),
    [buildBaseBrowseAnalyticsPayload, visibleLists.length],
  );

  const tabOptions = useMemo<readonly SegmentedControlOption<ListTab>[]>(
    () =>
      TAB_DEFINITIONS.map((tab) => ({
        label: tab.label,
        value: tab.value,
        badgeCount:
          tab.value === 'my'
            ? (myListsBrowseState.totalItems ?? (activeTab === 'my' ? myLists.length : undefined))
            : tab.value === 'friends'
              ? (friendsListsBrowseState.totalItems ?? (activeTab === 'friends' ? friendLists.length : undefined))
              : 0,
      })),
    [activeTab, friendLists.length, friendsListsBrowseState.totalItems, myLists.length, myListsBrowseState.totalItems],
  );

  const isLoading = activeBrowseState.isLoading || (activeTab === 'my' && isCreatingDefaultList);
  const hasSearch = trimmedSearchQuery.length > 0;
  const browseState = activeBrowseState;

  useEffect(() => {
    if (!hasSearch) {
      lastTrackedSearchExecutionKeyRef.current = null;
      return;
    }

    const trackingKey = `${activeTab}::${debouncedTrimmedSearchQuery}::${visibleLists.length}`;
    if (lastTrackedSearchExecutionKeyRef.current === trackingKey) {
      return;
    }

    lastTrackedSearchExecutionKeyRef.current = trackingKey;
    trackObservabilityEvent('LISTS_SEARCH_EXECUTED', {
      source: 'ListsScreen',
      activeTab,
      queryLength: debouncedTrimmedSearchQuery.length,
      resultCount: visibleLists.length,
    });
  }, [activeTab, debouncedTrimmedSearchQuery, hasSearch, visibleLists.length]);

  const handleTabChange = (tab: ListTab) => {
    trackObservabilityEvent('LISTS_TAB_CHANGED', {
      source: 'ListsScreen',
      tab,
    });
    setActiveTab(tab);
    setSearchQuery('');
  };

  const renderEmptyState = () => {
    if (activeTab === 'my') {
      return (
        <EmptyState
          actionLabel="Create Your First List"
          analyticsProps={buildBrowseAnalyticsPayload()}
          analyticsSource="ListsScreen"
          description="Create your first list to organize favorite restaurants."
          icon={
            <View style={styles.emptyIconWrap}>
              <Ionicons color={theme.colors.text.muted} name="add-outline" size={26} />
            </View>
          }
          onAction={() => {
            trackObservabilityEvent('LISTS_CREATE_CTA_TAPPED', {
              source: 'ListsScreen',
              placement: 'empty_state',
            });
            navigation.navigate('CreateRestaurantList');
          }}
          title="No lists yet"
        />
      );
    }

    if (activeTab === 'friends') {
      return (
        <EmptyState
          analyticsProps={buildBrowseAnalyticsPayload()}
          analyticsSource="ListsScreen"
          description="Add friends to see the lists they share."
          icon={
            <View style={styles.emptyIconWrap}>
              <Ionicons color={theme.colors.text.muted} name="people-outline" size={24} />
            </View>
          }
          title="No friends' lists"
        />
      );
    }

    return null;
  };

  const renderNoSearchResults = () => (
    <EmptyState
      actionLabel="Clear Search"
      analyticsProps={buildBrowseAnalyticsPayload()}
      analyticsSource="ListsScreen"
      description="Try a different search term."
      icon={
        <View style={styles.emptyIconWrap}>
          <Ionicons color={theme.colors.text.muted} name="search-outline" size={24} />
        </View>
      }
      onAction={() => {
        trackObservabilityEvent('LISTS_SEARCH_CLEARED', {
          source: 'ListsScreen',
          placement: 'empty_state',
        });
        setSearchQuery('');
      }}
      title="No matching lists"
    />
  );

  const renderListCard = useCallback((list: RestaurantListRecord, listIndex: number) => {
    const restaurantCount = list.restaurantCount ?? 0;
    const menuItemCount = list.menuItemCount ?? 0;
    const coverImage = getListCoverImageUrl(list);
    const updatedLabel = getUpdatedLabel(list);

    const visibilityIconName = getVisibilityIconName(list.visibility);
    const visibilityIconColor =
      list.visibility === 'friends'
        ? theme.colors.text.info
        : theme.colors.text.muted;

    return (
      <Card
        style={[
          styles.listCard,
          list.isDefault ? styles.defaultListCard : null,
        ]}
      >
        {coverImage ? (
          <View style={styles.coverImageWrap}>
            <CachedRemoteImage uri={coverImage} style={styles.coverImage} />
          </View>
        ) : null}
        <ListItem
          description={
            <View style={styles.cardMetaWrap}>
              {list.description ? <Text style={styles.cardDescription} variant="bodyMd">{list.description}</Text> : null}
              <View style={styles.cardMetaRow}>
                <Text style={styles.cardMetaText} variant="bodySmTight">
                  {restaurantCount} {restaurantCount === 1 ? 'restaurant' : 'restaurants'}
                </Text>
                {menuItemCount > restaurantCount ? (
                  <Text style={styles.cardMetaText} variant="bodySmTight">• {menuItemCount} menu items</Text>
                ) : null}
                {activeTab !== 'my' ? (
                  <View style={styles.ownerMeta}>
                    <Text style={styles.cardMetaText} variant="bodySmTight">•</Text>
                    <Ionicons color={theme.colors.text.muted} name="person-outline" size={13} />
                    <Text numberOfLines={1} style={styles.cardMetaText} variant="bodySmTight">
                      {list.ownerName ?? 'Unknown'}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.cardMetaText} variant="bodySmTight">Updated {updatedLabel}</Text>
            </View>
          }
          leading={list.isDefault ? <Ionicons color={theme.colors.text.warning} name="star" size={16} /> : undefined}
          onPress={() => {
            trackObservabilityEvent('LISTS_LIST_OPENED', {
              source: 'ListsScreen',
              tab: activeTab,
              visibility: list.visibility,
              isDefault: Boolean(list.isDefault),
            });
            navigation.navigate('ListDetail', { listId: list.id });
          }}
          style={styles.cardListItem}
          testID={`lists-list-card-${activeTab}-${listIndex}`}
          title={list.name}
          titleAccessory={
            activeTab === 'my' && list.shareEnabled ? (
              <View style={styles.sharedLinkPill} testID={`lists-shared-link-pill-${listIndex}`}>
                <Ionicons color={theme.colors.text.info} name="link-outline" size={12} />
                <Text style={styles.sharedLinkPillText} variant="bodySmTightBold">
                  Shared link
                </Text>
              </View>
            ) : undefined
          }
          trailing={
            <View style={styles.trailingIcons}>
              <Ionicons color={visibilityIconColor} name={visibilityIconName} size={16} />
              <Ionicons color={theme.colors.text.muted} name="chevron-forward" size={16} />
            </View>
          }
        />
      </Card>
      );
  }, [activeTab, navigation, styles, theme.colors.text.info, theme.colors.text.muted, theme.colors.text.warning]);

  const renderListItem = useCallback<ListRenderItem<RestaurantListRecord>>(
    ({ item, index }) => renderListCard(item, index),
    [renderListCard],
  );

  const listsHeader = (
    <View style={styles.listHeader}>
      <PageErrorToast
        analyticsProps={buildBrowseAnalyticsPayload()}
        analyticsSource="ListsScreen"
        errorMessage={errorMessage}
        title="List operation failed"
      />

      {activeTab === 'my' && browseState.pendingRows.length > 0 ? (
        <View style={styles.headerStack}>
          <Text variant="label">Pending lists</Text>
          {browseState.pendingRows.map((row) => {
            return (
              <PendingQueuedWriteRow
                key={row.id}
                createdAt={row.createdAt}
                description={row.description}
                idempotencyKey={row.idempotencyKey}
                lastError={row.lastError}
                status={row.status}
                title={row.title}
              />
            );
          })}
        </View>
      ) : null}

      <SegmentedControl
        getOptionTestID={(value) => `lists-tab-${value}`}
        onChange={handleTabChange}
        options={tabOptions}
        value={activeTab}
      />

      <View style={styles.searchRow}>
        <Input
          containerStyle={styles.searchField}
          onChangeText={setSearchQuery}
          placeholder="Search lists..."
          testID="lists-search-input"
          value={searchQuery}
        />
        {hasSearch ? (
          <Pressable
            accessibilityLabel="Clear search"
            accessibilityRole="button"
            onPress={() => {
              trackObservabilityEvent('LISTS_SEARCH_CLEARED', {
                source: 'ListsScreen',
                placement: 'clear_button',
              });
              setSearchQuery('');
            }}
            style={({ pressed }) => [styles.clearSearchButton, pressed && styles.clearSearchButtonPressed]}
          >
            <Text style={styles.clearSearchLabel} variant="labelMd">Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <PageErrorToast
        actionLabel="Retry"
        analyticsProps={buildBrowseAnalyticsPayload()}
        analyticsSource="ListsScreen"
        errorMessage={
          browseState.hasBlockingError
            ? 'Could not load lists.'
            : browseState.hasRefreshError
              ? 'Could not refresh lists. Showing saved data.'
              : null
        }
        onAction={() => {
          void activeQuery.refetch();
        }}
        title="Lists unavailable"
      />
    </View>
  );

  const listsListEmptyComponent = (() => {
    if (isLoading) {
      return (
        <View style={styles.skeletonWrap}>
          <Skeleton height={136} />
          <Skeleton height={136} />
          <Skeleton height={136} />
        </View>
      );
    }

    if (browseState.hasBlockingError) {
      return (
        <ErrorState
          analyticsProps={buildBrowseAnalyticsPayload()}
          analyticsSource="ListsScreen"
          description="Could not load lists."
          onRetry={() => {
            void activeQuery.refetch();
          }}
          title="Lists unavailable"
        />
      );
    }

    if (visibleLists.length === 0) {
      return hasSearch ? renderNoSearchResults() : renderEmptyState();
    }

    return null;
  })();

  const listsFooter =
    !isLoading && !browseState.hasBlockingError && visibleLists.length > 0 && browseState.hasNextPage ? (
      <FeatureListFooter
        isFetchingNextPage={browseState.isFetchingNextPage}
        label="Load more lists"
        onLoadMore={browseState.onEndReached}
      />
    ) : null;

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.screenBody}
      keyboardAware
      onBackPress={() => {
        navigation.navigate('Misc');
      }}
      rightAccessory={
        activeTab === 'my' ? (
          <HeaderAccessoryButton
            label="New List"
            onPress={() => {
              trackObservabilityEvent('LISTS_CREATE_CTA_TAPPED', {
                source: 'ListsScreen',
                placement: 'header',
              });
              navigation.navigate('CreateRestaurantList');
            }}
            testID="create-list-button"
          />
        ) : undefined
      }
      subtitle="Create, organize, and browse the restaurant lists your friends share."
      testID="lists-screen"
      title="Lists"
      scroll={false}
      screenBackgroundTone="surface"
    >
      <FlatList
        contentContainerStyle={styles.listContent}
        data={isLoading || browseState.hasBlockingError ? [] : visibleLists}
        initialNumToRender={10}
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(list) => list.id}
        ListEmptyComponent={listsListEmptyComponent}
        ListFooterComponent={listsFooter}
        ListHeaderComponent={listsHeader}
        maxToRenderPerBatch={10}
        onRefresh={browseState.onRefresh}
        refreshing={browseState.isRefreshing}
        removeClippedSubviews
        renderItem={renderListItem}
        style={styles.list}
        windowSize={7}
      />
    </BackHeaderScreenScaffold>
  );
}
