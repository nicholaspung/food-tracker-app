import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  HeaderAccessoryButton,
  PageErrorToast,
  SegmentedControl,
  Skeleton,
  type SegmentedControlOption,
} from '../components/shared';
import { env } from '../config/env';
import {
  createDefaultRestaurantList,
  getRestaurantListItemCounts,
  listRestaurantLists,
  type RestaurantListRecord,
} from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { formatDisplayDate } from '../lib/dateFormatting';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Card, Input, ListItem, Text } from '../ui';

type ListsScreenProps = NativeStackScreenProps<RootStackParamList, 'Lists'>;

type ListTab = 'my' | 'friends' | 'public';
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type ListCountSummary = {
  restaurantCount: number;
  menuItemCount: number;
};

const TAB_DEFINITIONS: readonly { label: string; value: ListTab }[] = [
  { label: 'My Lists', value: 'my' },
  { label: 'Friends', value: 'friends' },
  { label: 'Public', value: 'public' },
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
  if (visibility === 'friends') {
    return 'people-outline';
  }

  if (visibility === 'public') {
    return 'globe-outline';
  }

  return 'lock-closed-outline';
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();

  const [activeTab, setActiveTab] = useState<ListTab>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreatingDefaultList, setIsCreatingDefaultList] = useState(false);
  const hasTriedCreatingDefault = useRef(false);

  const myListsQuery = useQuery({
    queryKey: ['feature', 'restaurantLists', 'my'],
    queryFn: () => listRestaurantLists({ scope: 'my' }),
  });

  const friendsListsQuery = useQuery({
    queryKey: ['feature', 'restaurantLists', 'friends'],
    queryFn: () => listRestaurantLists({ scope: 'friends' }),
  });

  const publicListsQuery = useQuery({
    queryKey: ['feature', 'restaurantLists', 'public'],
    queryFn: () => listRestaurantLists({ scope: 'public' }),
  });

  useEffect(() => {
    hasTriedCreatingDefault.current = false;
  }, [user?.id]);

  useEffect(() => {
    if (
      !user?.id ||
      hasTriedCreatingDefault.current ||
      myListsQuery.isLoading ||
      (myListsQuery.isError && !myListsQuery.data)
    ) {
      return;
    }

    if (isCreatingDefaultList) {
      return;
    }

    const hasDefault = (myListsQuery.data ?? []).some((list) => list.isDefault);
    if (hasDefault) {
      return;
    }

    hasTriedCreatingDefault.current = true;
    setIsCreatingDefaultList(true);

    void (async () => {
      try {
        if (!isOnline) {
          await queueFeatureOutbox('list.default.create', {});
          await queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] });
          return;
        }

        await queueWrite('list.default.create');
        await createDefaultRestaurantList();
        await queryClient.invalidateQueries({ queryKey: ['feature', 'restaurantLists'] });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not prepare your Saved list.';
        setErrorMessage(message);
        hasTriedCreatingDefault.current = false;
      } finally {
        setIsCreatingDefaultList(false);
      }
    })();
  }, [
    user?.id,
    isCreatingDefaultList,
    myListsQuery.data,
    myListsQuery.isError,
    myListsQuery.isLoading,
    isOnline,
    queryClient,
    queueFeatureOutbox,
    queueWrite,
  ]);

  const activeQuery =
    activeTab === 'my' ? myListsQuery : activeTab === 'friends' ? friendsListsQuery : publicListsQuery;
  const hasBlockingActiveQueryError = activeQuery.isError && !activeQuery.data;
  const hasActiveQueryRefreshError = !hasBlockingActiveQueryError && activeQuery.isError;

  const visibleLists = useMemo(() => {
    if (activeTab === 'friends') {
      return friendsListsQuery.data ?? [];
    }

    if (activeTab === 'public') {
      return publicListsQuery.data ?? [];
    }

    return myListsQuery.data ?? [];
  }, [activeTab, friendsListsQuery.data, myListsQuery.data, publicListsQuery.data]);

  const visibleListIds = useMemo(() => visibleLists.map((list) => list.id), [visibleLists]);

  const listItemCountsQuery = useQuery({
    queryKey: ['feature', 'restaurantListItemCounts.v2', activeTab, ...visibleListIds],
    queryFn: () => getRestaurantListItemCounts(visibleListIds),
    enabled: visibleListIds.length > 0 && !activeQuery.isLoading && !hasBlockingActiveQueryError,
  });

  const filteredLists = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return visibleLists;
    }

    return visibleLists.filter((list) => {
      const ownerName = list.ownerName?.toLowerCase() ?? '';
      return (
        list.name.toLowerCase().includes(normalizedQuery) ||
        (list.description?.toLowerCase().includes(normalizedQuery) ?? false) ||
        ownerName.includes(normalizedQuery)
      );
    });
  }, [searchQuery, visibleLists]);

  const tabOptions = useMemo<readonly SegmentedControlOption<ListTab>[]>(
    () =>
      TAB_DEFINITIONS.map((tab) => ({
        label: tab.label,
        value: tab.value,
        badgeCount:
          tab.value === 'my'
            ? (myListsQuery.data ?? []).length
            : tab.value === 'friends'
              ? (friendsListsQuery.data ?? []).length
              : (publicListsQuery.data ?? []).length,
      })),
    [friendsListsQuery.data, myListsQuery.data, publicListsQuery.data],
  );

  const isLoading = activeQuery.isLoading || (activeTab === 'my' && isCreatingDefaultList);
  const hasSearch = searchQuery.trim().length > 0;

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
    },
    searchRow: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
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
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 18,
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
      borderColor: theme.colors.status.warningBorder,
      backgroundColor: theme.colors.status.warningBg,
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
      fontSize: 14,
      lineHeight: 20,
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
      fontSize: 12,
      lineHeight: 16,
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
  });

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

    return (
      <EmptyState
        description="Public lists from other users will appear here."
        icon={
          <View style={styles.emptyIconWrap}>
            <Ionicons color={theme.colors.text.muted} name="globe-outline" size={24} />
          </View>
        }
        title="No public lists"
      />
    );
  };

  const renderNoSearchResults = () => (
    <EmptyState
      actionLabel="Clear Search"
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

  const renderListCard = (list: RestaurantListRecord) => {
    const counts = normalizeListCountSummary(listItemCountsQuery.data?.[list.id]);
    const restaurantCount = counts.restaurantCount;
    const menuItemCount = counts.menuItemCount;
    const coverImage = getListCoverImageUrl(list);
    const updatedLabel = getUpdatedLabel(list);

    const visibilityIconName = getVisibilityIconName(list.visibility);
    const visibilityIconColor =
      list.visibility === 'friends'
        ? theme.colors.text.info
        : list.visibility === 'public'
          ? theme.colors.text.success
          : theme.colors.text.muted;

    return (
      <Card key={list.id} style={[styles.listCard, list.isDefault ? styles.defaultListCard : null]}>
        {coverImage ? (
          <View style={styles.coverImageWrap}>
            <Image source={{ uri: coverImage }} style={styles.coverImage} />
          </View>
        ) : null}
        <ListItem
          description={
            <View style={styles.cardMetaWrap}>
              {list.description ? <Text style={styles.cardDescription}>{list.description}</Text> : null}
              <View style={styles.cardMetaRow}>
                <Text style={styles.cardMetaText}>
                  {restaurantCount} {restaurantCount === 1 ? 'restaurant' : 'restaurants'}
                </Text>
                {menuItemCount > restaurantCount ? (
                  <Text style={styles.cardMetaText}>• {menuItemCount} menu items</Text>
                ) : null}
                {activeTab !== 'my' ? (
                  <View style={styles.ownerMeta}>
                    <Text style={styles.cardMetaText}>•</Text>
                    <Ionicons color={theme.colors.text.muted} name="person-outline" size={13} />
                    <Text numberOfLines={1} style={styles.cardMetaText}>
                      {list.ownerName ?? 'Unknown'}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.cardMetaText}>Updated {updatedLabel}</Text>
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
          testID={`list-card-${list.id}`}
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

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.body}
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
      subtitle="Create, organize, and discover restaurant lists."
      title="Lists"
    >
      <PageErrorToast errorMessage={errorMessage} title="List operation failed" />

      <SegmentedControl onChange={handleTabChange} options={tabOptions} value={activeTab} />

      <View style={styles.searchRow}>
        <Input
          containerStyle={styles.searchField}
          onChangeText={setSearchQuery}
          placeholder="Search lists..."
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
            <Text style={styles.clearSearchLabel}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <PageErrorToast
        actionLabel="Retry"
        errorMessage={
          hasBlockingActiveQueryError
            ? 'Could not load lists.'
            : hasActiveQueryRefreshError
              ? 'Could not refresh lists. Showing saved data.'
              : null
        }
        onAction={() => {
          void activeQuery.refetch();
        }}
        title="Lists unavailable"
      />

      <PageErrorToast
        actionLabel="Retry"
        errorMessage={listItemCountsQuery.isError ? 'Could not load list item counts.' : null}
        onAction={() => {
          void listItemCountsQuery.refetch();
        }}
        title="List counts unavailable"
      />

      {isLoading ? (
        <View style={styles.skeletonWrap}>
          <Skeleton height={136} />
          <Skeleton height={136} />
          <Skeleton height={136} />
        </View>
      ) : null}

      {!isLoading && !hasBlockingActiveQueryError
        ? filteredLists.length === 0
          ? hasSearch
            ? renderNoSearchResults()
            : renderEmptyState()
          : (
              <View style={styles.listsWrap}>
                {filteredLists.map((list) => renderListCard(list))}
              </View>
            )
        : null}
    </BackHeaderScreenScaffold>
  );
}
