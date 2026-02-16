import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, OfflineBanner, Skeleton } from '../components/shared';
import { listQuickTracks, listVisits, deleteQuickTrack } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useSync } from '../providers/SyncProvider';
import { useTheme } from '../theme';
import { Screen, Text } from '../ui';

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
type FeedMode = 'mine' | 'friends';
type TypeFilter = 'all' | 'visits' | 'quick-track';

interface FeedItem {
  id: string;
  createdAt: string;
  title: string;
  description: string;
  source: 'visit' | 'quick-track';
  quickTrackId?: string;
}

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

export function HomeScreen({ navigation }: HomeScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const { isOnline } = useConnectivity();
  const { failedCount, isSyncing, queueDepth, replayNow, retryAllFailed } = useSync();
  const [feedMode, setFeedMode] = useState<FeedMode>('mine');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const visitsQuery = useQuery({
    queryKey: ['feature', 'visits'],
    queryFn: listVisits,
  });

  const quickTracksQuery = useQuery({
    queryKey: ['feature', 'quickTracks'],
    queryFn: listQuickTracks,
  });

  const isLoading = visitsQuery.isLoading || quickTracksQuery.isLoading;
  const hasError = visitsQuery.isError || quickTracksQuery.isError;

  const combinedFeed = useMemo<FeedItem[]>(() => {
    const visitFeed: FeedItem[] = (visitsQuery.data ?? []).map((visit) => ({
      id: `visit_${visit.id}`,
      createdAt: visit.createdAt,
      title: visit.restaurantName,
      description: `${visit.items.length} item${visit.items.length === 1 ? '' : 's'} tracked`,
      source: 'visit',
    }));

    const quickTrackFeed: FeedItem[] = (quickTracksQuery.data ?? []).map((quickTrack) => ({
      id: `quick_track_${quickTrack.id}`,
      createdAt: quickTrack.createdAt,
      title: `${quickTrack.itemName} (${quickTrack.rating}/5)`,
      description: `${quickTrack.restaurantName}${quickTrack.notes ? ` - ${quickTrack.notes}` : ''}`,
      source: 'quick-track',
      quickTrackId: quickTrack.id,
    }));

    return [...visitFeed, ...quickTrackFeed].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }, [quickTracksQuery.data, visitsQuery.data]);

  const filteredFeed = useMemo(() => {
    if (feedMode === 'friends') {
      return [];
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();

    return combinedFeed.filter((item) => {
      if (typeFilter === 'visits' && item.source !== 'visit') {
        return false;
      }

      if (typeFilter === 'quick-track' && item.source !== 'quick-track') {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return `${item.title} ${item.description}`.toLowerCase().includes(normalizedQuery);
    });
  }, [combinedFeed, feedMode, searchQuery, typeFilter]);

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
      const date = new Date(entry.createdAt);
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

  const filteredVisitCount = useMemo(
    () => filteredFeed.filter((entry) => entry.source === 'visit').length,
    [filteredFeed],
  );
  const filteredQuickTrackCount = filteredFeed.length - filteredVisitCount;

  const summaryText = useMemo(() => {
    if (feedMode === 'friends') {
      return 'No friend ratings yet';
    }

    if (searchQuery.trim()) {
      return `Found ${filteredFeed.length} items (${filteredVisitCount} visits, ${filteredQuickTrackCount} quick items)`;
    }

    const visitCount = visitsQuery.data?.length ?? 0;
    const quickTrackCount = quickTracksQuery.data?.length ?? 0;

    if (visitCount === 0 && quickTrackCount === 0) {
      return 'No ratings yet';
    }

    return [
      formatCount(visitCount, 'visit', 'visits'),
      formatCount(quickTrackCount, 'quick item', 'quick items'),
    ].join(' • ');
  }, [
    feedMode,
    filteredFeed.length,
    filteredQuickTrackCount,
    filteredVisitCount,
    quickTracksQuery.data?.length,
    searchQuery,
    visitsQuery.data?.length,
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

  const handleDeleteQuickTrack = async (quickTrackId: string) => {
    await queueWrite('quick-track.delete');
    await deleteQuickTrack(quickTrackId);
    await queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] });
  };

  const handleToggleFilters = () => {
    setFiltersExpanded((previous) => {
      const next = !previous;
      if (!next) {
        setTypeFilter('all');
      }
      return next;
    });
  };

  const renderTypeFilter = (filter: TypeFilter, label: string) => (
    <Pressable
      key={filter}
      onPress={() => {
        setTypeFilter(filter);
      }}
      style={[styles.filterChip, typeFilter === filter && styles.filterChipActive]}
    >
      <Text style={[styles.filterChipLabel, typeFilter === filter && styles.filterChipLabelActive]}>{label}</Text>
    </Pressable>
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
    titleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 38,
      fontWeight: '700',
      lineHeight: 44,
    },
    subTitle: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    segmentedControl: {
      backgroundColor: colors.screenBackground,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      padding: 2,
    },
    segmentButton: {
      borderRadius: 8,
      minWidth: 60,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 7,
    },
    segmentButtonActive: {
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.08,
      shadowRadius: 1,
    },
    segmentLabel: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 18,
      textAlign: 'center',
    },
    segmentLabelActive: {
      color: colors.textPrimary,
    },
    searchRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    searchField: {
      alignItems: 'center',
      backgroundColor: colors.screenBackground,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      minHeight: 42,
      paddingHorizontal: theme.spacing.sm,
    },
    searchInput: {
      color: colors.textPrimary,
      flex: 1,
      fontSize: 16,
      lineHeight: 20,
      paddingVertical: theme.spacing.xs,
    },
    clearSearchButton: {
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: theme.spacing.xs,
    },
    clearSearchLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
    filtersToggle: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      minHeight: 42,
      minWidth: 82,
      paddingHorizontal: theme.spacing.sm,
    },
    filtersToggleActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    filtersToggleLabel: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
      lineHeight: 20,
    },
    filtersToggleLabelActive: {
      color: theme.colors.text.inverse,
    },
    filtersRow: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    filterChip: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 8,
    },
    filterChipActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    filterChipLabel: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 16,
      textAlign: 'center',
    },
    filterChipLabelActive: {
      color: colors.accent,
    },
    body: {
      flex: 1,
      gap: theme.spacing.sm,
      paddingBottom: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
      paddingTop: theme.spacing.sm,
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
      fontSize: 14,
      fontWeight: '700',
      width: 12,
    },
    monthLabel: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 22,
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
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
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
      fontSize: 12,
      fontWeight: '700',
      width: 10,
    },
    dayLabel: {
      color: colors.textSecondary,
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 18,
    },
    dayCount: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
    },
    entries: {
      gap: theme.spacing.xs,
    },
    entryCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1,
      gap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
    },
    entryCardQuickTrack: {
      backgroundColor: colors.screenBackground,
    },
    entryTopRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    entryTitle: {
      color: colors.textPrimary,
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      lineHeight: 22,
    },
    sourceBadge: {
      borderRadius: 999,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 4,
    },
    sourceBadgeVisit: {
      backgroundColor: colors.screenBackground,
    },
    sourceBadgeQuickTrack: {
      backgroundColor: colors.accentSoft,
    },
    sourceBadgeLabel: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 14,
      textTransform: 'uppercase',
    },
    sourceBadgeLabelQuickTrack: {
      color: colors.accentSoftText,
    },
    entryDescription: {
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 21,
    },
    entryMeta: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
    },
    entryActions: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xxs,
    },
    entryActionButton: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      justifyContent: 'center',
      minHeight: 34,
    },
    entryActionDanger: {
      borderColor: colors.dangerBorder,
    },
    entryActionLabel: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 18,
    },
    entryActionDangerLabel: {
      color: colors.dangerText,
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
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 24,
    },
    infoDescription: {
      color: colors.textSecondary,
      fontSize: 15,
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
    quickActionDanger: {
      borderColor: colors.dangerBorder,
    },
    quickActionLabel: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 18,
      textAlign: 'center',
    },
    quickActionPrimaryLabel: {
      color: theme.colors.text.inverse,
    },
    quickActionDangerLabel: {
      color: colors.dangerText,
    },
  });

  return (
    <Screen background="surface" contentStyle={styles.screenContent} edges={['top']} padded={false} scroll>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Ratings</Text>
          <View style={styles.segmentedControl}>
            <Pressable
              onPress={() => {
                setFeedMode('mine');
              }}
              style={[styles.segmentButton, feedMode === 'mine' && styles.segmentButtonActive]}
            >
              <Text style={[styles.segmentLabel, feedMode === 'mine' && styles.segmentLabelActive]}>Mine</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setFeedMode('friends');
              }}
              style={[styles.segmentButton, feedMode === 'friends' && styles.segmentButtonActive]}
            >
              <Text style={[styles.segmentLabel, feedMode === 'friends' && styles.segmentLabelActive]}>Friends</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.subTitle}>{summaryText}</Text>
        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <TextInput
              onChangeText={setSearchQuery}
              placeholder="Search restaurants, food, notes..."
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              value={searchQuery}
            />
            {searchQuery ? (
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                }}
                style={styles.clearSearchButton}
              >
                <Text style={styles.clearSearchLabel}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={handleToggleFilters}
            style={[styles.filtersToggle, filtersExpanded && styles.filtersToggleActive]}
          >
            <Text style={[styles.filtersToggleLabel, filtersExpanded && styles.filtersToggleLabelActive]}>
              Filters
            </Text>
          </Pressable>
        </View>
        {filtersExpanded ? (
          <View style={styles.filtersRow}>
            {renderTypeFilter('all', 'All')}
            {renderTypeFilter('visits', 'Visits')}
            {renderTypeFilter('quick-track', 'Quick Track')}
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <OfflineBanner
          failedWrites={failedCount}
          isOnline={isOnline}
          isSyncing={isSyncing}
          onRetryFailed={() => {
            void retryAllFailed();
          }}
          onSyncNow={() => {
            void replayNow();
          }}
          pendingWrites={queueDepth}
        />

        {isLoading ? (
          <>
            <Skeleton height={16} />
            <Skeleton height={16} />
            <Skeleton height={16} />
          </>
        ) : null}

        {hasError ? (
          <ErrorState
            description="Could not load your ratings feed."
            onRetry={() => {
              void visitsQuery.refetch();
              void quickTracksQuery.refetch();
            }}
            title="Feed unavailable"
          />
        ) : null}

        {!isLoading && !hasError && feedMode === 'friends' ? (
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

        {!isLoading && !hasError && feedMode === 'mine' && combinedFeed.length === 0 ? (
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

        {!isLoading && !hasError && feedMode === 'mine' && combinedFeed.length > 0 && filteredFeed.length === 0 ? (
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

        {!isLoading && !hasError && feedMode === 'mine'
          ? groupedMonths.map((month) => {
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
                      {month.days.map((day) => {
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
                                {day.entries.map((feedItem) => (
                                  <View
                                    key={feedItem.id}
                                    style={[
                                      styles.entryCard,
                                      feedItem.source === 'quick-track' && styles.entryCardQuickTrack,
                                    ]}
                                  >
                                    <View style={styles.entryTopRow}>
                                      <Text numberOfLines={2} style={styles.entryTitle}>
                                        {feedItem.title}
                                      </Text>
                                      <View
                                        style={[
                                          styles.sourceBadge,
                                          feedItem.source === 'quick-track'
                                            ? styles.sourceBadgeQuickTrack
                                            : styles.sourceBadgeVisit,
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.sourceBadgeLabel,
                                            feedItem.source === 'quick-track' &&
                                              styles.sourceBadgeLabelQuickTrack,
                                          ]}
                                        >
                                          {feedItem.source === 'visit' ? 'Visit' : 'Quick'}
                                        </Text>
                                      </View>
                                    </View>
                                    <Text style={styles.entryDescription}>{feedItem.description}</Text>
                                    <Text style={styles.entryMeta}>
                                      {new Date(feedItem.createdAt).toLocaleTimeString([], {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}
                                    </Text>

                                    {feedItem.source === 'quick-track' && feedItem.quickTrackId ? (
                                      <View style={styles.entryActions}>
                                        <Pressable
                                          onPress={() => {
                                            navigation.navigate('EditQuickTrack', {
                                              quickTrackId: feedItem.quickTrackId as string,
                                            });
                                          }}
                                          style={styles.entryActionButton}
                                        >
                                          <Text style={styles.entryActionLabel}>Edit</Text>
                                        </Pressable>
                                        <Pressable
                                          onPress={() => {
                                            void handleDeleteQuickTrack(feedItem.quickTrackId as string);
                                          }}
                                          style={[styles.entryActionButton, styles.entryActionDanger]}
                                        >
                                          <Text style={[styles.entryActionLabel, styles.entryActionDangerLabel]}>
                                            Delete
                                          </Text>
                                        </Pressable>
                                      </View>
                                    ) : null}
                                  </View>
                                ))}
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

      </View>
    </Screen>
  );
}
