import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  ErrorState,
  HeaderAccessoryButton,
  PageErrorToast,
  SegmentedControl,
  Skeleton,
  type SegmentedControlOption,
} from '../components/shared';
import { env } from '../config/env';
import {
  createDefaultRestaurantList,
  invalidateRestaurantListCollectionQueries,
  listRestaurantListsPage,
  restaurantListQueryKeys,
  type RestaurantListRecord,
} from '../features';
import { usePaginatedQueryState } from '../hooks/useListQueryState';
import { usePullToRefreshState } from '../hooks/usePullToRefreshState';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { formatDisplayDate } from '../lib/dateFormatting';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Input, ListItem, Text } from '../ui';

type ListsScreenProps = NativeStackScreenProps<RootStackParamList, 'Lists'>;

type ListTab = 'my' | 'friends';
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type ListCountSummary = {
  restaurantCount: number;
  menuItemCount: number;
};

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

function toSafeNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  if (value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

function normalizeListCountSummary(value: unknown): ListCountSummary {
  if (typeof value === 'number') {
    const legacyCount = toSafeNonNegativeInteger(value);
    if (legacyCount !== null) {
      return {
        restaurantCount: legacyCount,
        menuItemCount: legacyCount,
      };
    }
  }

  if (!value || typeof value !== 'object') {
    return {
      restaurantCount: 0,
      menuItemCount: 0,
    };
  }

  const record = value as Record<string, unknown>;
  const restaurantCount = toSafeNonNegativeInteger(record.restaurantCount);
  const menuItemCount = toSafeNonNegativeInteger(record.menuItemCount);

  if (restaurantCount === null && menuItemCount === null) {
    return {
      restaurantCount: 0,
      menuItemCount: 0,
    };
  }

  const resolvedRestaurantCount = restaurantCount ?? menuItemCount ?? 0;
  const resolvedMenuItemCount = menuItemCount ?? resolvedRestaurantCount;

  return {
    restaurantCount: resolvedRestaurantCount,
    menuItemCount: resolvedMenuItemCount,
  };
}

function getListCoverImageUrl(list: RestaurantListRecord): string | null {
  if (!list.coverImage) {
    return null;
  }

  const baseUrl = env.pocketbaseUrl.replace(/\/+$/, '');
  const recordId = encodeURIComponent(list.id);
  const filename = encodeURIComponent(list.coverImage);
  return `${baseUrl}/api/files/restaurant_lists/${recordId}/${filename}?thumb=640x360`;
}

function getVisibilityIconName(visibility: RestaurantListRecord['visibility']): IoniconName {
  return visibility === 'friends' ? 'people-outline' : 'lock-closed-outline';
}

function resolveListUpdatedValue(list: RestaurantListRecord): unknown {
  if (typeof list.updatedAt === 'string' && list.updatedAt.trim()) {
    return list.updatedAt;
  }

  const legacyRecord = list as unknown as Record<string, unknown>;
  const fallbackCandidates = [legacyRecord.updated, legacyRecord.updated_at, list.createdAt];

  for (const candidate of fallbackCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }

    if (typeof candidate === 'number' || candidate instanceof Date) {
      return candidate;
    }
  }

  return undefined;
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
  const primaryValue = resolveListUpdatedValue(list);
  const fallbackValue = list.createdAt;
  const candidates: unknown[] = [primaryValue, fallbackValue];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }

    if (typeof candidate === 'string') {
      const direct = formatDateFromRawTimestamp(candidate);
      if (direct) {
        return direct;
      }
    }

    const parsed = formatDisplayDate(candidate, { fallback: 'Unknown' });
    if (parsed !== 'Unknown') {
      return parsed;
    }
  }

  return 'recently';
}

export function ListsScreen({ navigation }: ListsScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();

  const [activeTab, setActiveTab] = useState<ListTab>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreatingDefaultList, setIsCreatingDefaultList] = useState(false);
  const hasTriedCreatingDefault = useRef(false);
  const lastTrackedSearchExecutionKeyRef = useRef<string | null>(null);
  const trimmedSearchQuery = searchQuery.trim();

  const myListsQuery = useInfiniteQuery({
    queryKey: restaurantListQueryKeys.paginated('my', trimmedSearchQuery),
    queryFn: ({ pageParam, signal }) =>
      listRestaurantListsPage({
        scope: 'my',
        page: pageParam,
        pageSize: 20,
        search: trimmedSearchQuery || undefined,
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    enabled: activeTab === 'my',
  });

  const friendsListsQuery = useInfiniteQuery({
    queryKey: restaurantListQueryKeys.paginated('friends', trimmedSearchQuery),
    queryFn: ({ pageParam, signal }) =>
      listRestaurantListsPage({
        scope: 'friends',
        page: pageParam,
        pageSize: 20,
        search: trimmedSearchQuery || undefined,
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    enabled: activeTab === 'friends',
  });
  const myListsState = usePaginatedQueryState({
    data: myListsQuery.data,
    isError: myListsQuery.isError,
    isFetching: myListsQuery.isFetching,
    isLoading: myListsQuery.isLoading,
    isSuccess: myListsQuery.isSuccess,
  });
  const friendsListsState = usePaginatedQueryState({
    data: friendsListsQuery.data,
    isError: friendsListsQuery.isError,
    isFetching: friendsListsQuery.isFetching,
    isLoading: friendsListsQuery.isLoading,
    isSuccess: friendsListsQuery.isSuccess,
  });

  useEffect(() => {
    hasTriedCreatingDefault.current = false;
  }, [user?.id]);

  useEffect(() => {
    if (
      !user?.id ||
      trimmedSearchQuery.length > 0 ||
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

    const myLists = myListsState.items;
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
        const createResult = await writeFeature({
          operationName: 'list.default.create',
          offline: {
            strategy: 'outbox',
            payload: {},
          },
          execute: () => createDefaultRestaurantList(),
        });

        if (createResult.status === 'queued') {
          await invalidateRestaurantListCollectionQueries(queryClient, 'my');
          trackObservabilityEvent('LISTS_DEFAULT_LIST_AUTO_CREATE_SUCCEEDED', {
            source: 'ListsScreen',
            listCountBeforeCreate: myLists.length,
            queued: true,
            trigger: 'missing_default_list',
          });
          return;
        }

        await invalidateRestaurantListCollectionQueries(queryClient, 'my');
        trackObservabilityEvent('LISTS_DEFAULT_LIST_AUTO_CREATE_SUCCEEDED', {
          source: 'ListsScreen',
          listCountBeforeCreate: myLists.length,
          queued: false,
          trigger: 'missing_default_list',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not prepare your Saved list.';
        trackObservabilityEvent('LISTS_DEFAULT_LIST_AUTO_CREATE_FAILED', {
          source: 'ListsScreen',
          errorMessage: message,
          errorType: error instanceof Error ? error.name : 'unknown_error',
          isOnline,
          listCountBeforeCreate: myLists.length,
          trigger: 'missing_default_list',
        });
        setErrorMessage(message);
        hasTriedCreatingDefault.current = false;
      } finally {
        setIsCreatingDefaultList(false);
      }
    })();
  }, [
    user?.id,
    trimmedSearchQuery,
    isCreatingDefaultList,
    myListsState.items,
    myListsQuery.data,
    myListsQuery.isError,
    myListsQuery.isLoading,
    isOnline,
    queryClient,
    writeFeature,
  ]);

  const myLists = myListsState.items;
  const friendLists = friendsListsState.items;
  const activeQuery = activeTab === 'my' ? myListsQuery : friendsListsQuery;
  const activeState = activeTab === 'my' ? myListsState : friendsListsState;
  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(activeQuery.isRefetching);

  const visibleLists = useMemo(
    () => (activeTab === 'friends' ? friendLists : myLists),
    [activeTab, friendLists, myLists],
  );

  const tabOptions = useMemo<readonly SegmentedControlOption<ListTab>[]>(
    () =>
      TAB_DEFINITIONS.map((tab) => ({
        label: tab.label,
        value: tab.value,
        badgeCount:
          tab.value === 'my'
            ? (myListsState.totalItems ?? (activeTab === 'my' ? myLists.length : undefined))
            : tab.value === 'friends'
              ? (friendsListsState.totalItems ?? (activeTab === 'friends' ? friendLists.length : undefined))
              : 0,
      })),
    [activeTab, friendLists.length, friendsListsState.totalItems, myLists.length, myListsState.totalItems],
  );

  const isLoading = activeQuery.isLoading || (activeTab === 'my' && isCreatingDefaultList);
  const hasSearch = trimmedSearchQuery.length > 0;
  const buildBrowseAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'ListsScreen',
      activeTab,
      queryLength: trimmedSearchQuery.length,
      resultCount: visibleLists.length,
      ...overrides,
    }),
    [activeTab, trimmedSearchQuery.length, visibleLists.length],
  );
  const handleRefresh = async () => {
    await runPullRefresh(async () => {
      const resultCountBefore = visibleLists.length;
      trackObservabilityEvent('LISTS_REFRESH_STARTED', buildBrowseAnalyticsPayload({
        resultCountBefore,
      }));

      try {
        const result = await activeQuery.refetch();
        const resultCountAfter = result.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? resultCountBefore;
        trackObservabilityEvent('LISTS_REFRESH_COMPLETED', buildBrowseAnalyticsPayload({
          resultCountBefore,
          resultCountAfter,
          deltaCount: resultCountAfter - resultCountBefore,
        }));
      } catch (error) {
        trackObservabilityEvent('LISTS_REFRESH_FAILED', buildBrowseAnalyticsPayload({
          resultCountBefore,
          errorType: error instanceof Error ? error.name : 'unknown_error',
        }));
        throw error;
      }
    });
  };

  useEffect(() => {
    if (!hasSearch) {
      lastTrackedSearchExecutionKeyRef.current = null;
      return;
    }

    const trackingKey = `${activeTab}::${trimmedSearchQuery}::${visibleLists.length}`;
    if (lastTrackedSearchExecutionKeyRef.current === trackingKey) {
      return;
    }

    lastTrackedSearchExecutionKeyRef.current = trackingKey;
    trackObservabilityEvent('LISTS_SEARCH_EXECUTED', {
      source: 'ListsScreen',
      activeTab,
      queryLength: trimmedSearchQuery.length,
      resultCount: visibleLists.length,
    });
  }, [activeTab, hasSearch, trimmedSearchQuery, visibleLists.length]);

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

  const renderListCard = (list: RestaurantListRecord, listIndex: number) => {
    const counts = normalizeListCountSummary({
      restaurantCount: list.restaurantCount,
      menuItemCount: list.menuItemCount,
    });
    const restaurantCount = counts.restaurantCount;
    const menuItemCount = counts.menuItemCount;
    const coverImage = getListCoverImageUrl(list);
    const updatedLabel = getUpdatedLabel(list);

    const visibilityIconName = getVisibilityIconName(list.visibility);
    const visibilityIconColor =
      list.visibility === 'friends'
        ? theme.colors.text.info
        : theme.colors.text.muted;

    return (
      <Card style={[styles.listCard, list.isDefault ? styles.defaultListCard : null]}>
        {coverImage ? (
          <View style={styles.coverImageWrap}>
            <Image source={{ uri: coverImage }} style={styles.coverImage} />
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
          trailing={
            <View style={styles.trailingIcons}>
              <Ionicons color={visibilityIconColor} name={visibilityIconName} size={16} />
              <Ionicons color={theme.colors.text.muted} name="chevron-forward" size={16} />
            </View>
          }
        />
      </Card>
      );
  };

  const listsHeader = (
    <View style={styles.listHeader}>
      <PageErrorToast
        analyticsProps={buildBrowseAnalyticsPayload()}
        analyticsSource="ListsScreen"
        errorMessage={errorMessage}
        title="List operation failed"
      />

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
          activeState.hasBlockingError
            ? 'Could not load lists.'
            : activeState.hasRefreshError
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

  const listsFooter =
    !isLoading && !activeState.hasBlockingError && visibleLists.length > 0 && activeQuery.hasNextPage ? (
      <View style={styles.listFooter}>
        <Button
          label={activeQuery.isFetchingNextPage ? 'Loading more...' : 'Load more lists'}
          loading={activeQuery.isFetchingNextPage}
          onPress={() => {
            const resultCountBefore = visibleLists.length;
            trackObservabilityEvent('LISTS_LOAD_MORE_STARTED', buildBrowseAnalyticsPayload({
              resultCountBefore,
            }));
            void activeQuery.fetchNextPage()
              .then((result) => {
                const resultCountAfter =
                  result.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? resultCountBefore;
                trackObservabilityEvent('LISTS_LOAD_MORE_COMPLETED', buildBrowseAnalyticsPayload({
                  resultCountBefore,
                  resultCountAfter,
                  deltaCount: resultCountAfter - resultCountBefore,
                }));
              })
              .catch((error) => {
                trackObservabilityEvent('LISTS_LOAD_MORE_FAILED', buildBrowseAnalyticsPayload({
                  resultCountBefore,
                  errorType: error instanceof Error ? error.name : 'unknown_error',
                }));
              });
          }}
          variant="secondary"
        />
      </View>
    ) : null;

  const listsBodyContent = (() => {
    if (isLoading) {
      return (
        <View style={styles.skeletonWrap}>
          <Skeleton height={136} />
          <Skeleton height={136} />
          <Skeleton height={136} />
        </View>
      );
    }

    if (activeState.hasBlockingError) {
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

    return (
      <View>
        {visibleLists.map((list, index) => (
          <View key={list.id}>
            {index > 0 ? <View style={styles.listSeparator} /> : null}
            {renderListCard(list, index)}
          </View>
        ))}
      </View>
    );
  })();

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
      onRefresh={handleRefresh}
      refreshing={isPullRefreshing}
    >
      <View style={styles.listContent}>
        {listsHeader}
        {listsBodyContent}
        {listsFooter}
      </View>
    </BackHeaderScreenScaffold>
  );
}
