import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  ErrorState,
  FilterChipGroup,
  RoleBadge,
  Skeleton,
  StatusPill,
} from '../components/shared';
import { formatDisplayDate } from '../lib/dateFormatting';
import { pb } from '../lib/pocketbase';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme';
import { Card, Text } from '../ui';

type AdminMenuReviewsScreenProps = NativeStackScreenProps<RootStackParamList, 'AdminMenuReviews'>;
type MenuReviewFilter = 'pending' | 'reviewed' | 'dismissed' | 'all';
type MenuReviewTimeRangeFilter = 'all_time' | 'last_7_days' | 'last_30_days' | 'last_90_days';

interface MenuReviewRequestRecord {
  id: string;
  restaurant: string;
  requestedBy: string;
  reason?: string;
  adminNotes?: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  created: string;
  updated: string;
  expand?: {
    restaurant?: {
      id: string;
      name?: string;
    };
    requestedBy?: {
      id: string;
      name?: string;
      email?: string;
    };
  };
}

const MENU_REVIEW_FILTERS: { label: string; value: MenuReviewFilter }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Reviewed', value: 'reviewed' },
  { label: 'Dismissed', value: 'dismissed' },
  { label: 'All', value: 'all' },
];

const MENU_REVIEW_TIME_RANGE_FILTERS: { label: string; value: MenuReviewTimeRangeFilter }[] = [
  { label: 'All Time', value: 'all_time' },
  { label: 'Last 7 Days', value: 'last_7_days' },
  { label: 'Last 30 Days', value: 'last_30_days' },
  { label: 'Last 90 Days', value: 'last_90_days' },
];

const STATUS_LABELS: Record<'pending' | 'reviewed' | 'dismissed', string> = {
  pending: 'Pending',
  reviewed: 'Reviewed',
  dismissed: 'Dismissed',
};

function toPocketBaseDateTime(value: Date): string {
  return value.toISOString().replace('T', ' ');
}

function resolveTimeRangeCutoff(range: MenuReviewTimeRangeFilter): string | undefined {
  if (range === 'all_time') {
    return undefined;
  }

  const days = range === 'last_7_days' ? 7 : range === 'last_30_days' ? 30 : 90;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return toPocketBaseDateTime(cutoff);
}

export function AdminMenuReviewsScreen({ navigation }: AdminMenuReviewsScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin === true;
  const [activeFilter, setActiveFilter] = useState<MenuReviewFilter>('pending');
  const [activeTimeRange, setActiveTimeRange] = useState<MenuReviewTimeRangeFilter>('all_time');

  const menuReviewsQuery = useQuery({
    enabled: isAdmin,
    queryKey: ['feature', 'admin', 'menu-review-requests', activeFilter, activeTimeRange],
    queryFn: async (): Promise<MenuReviewRequestRecord[]> => {
      const queryOptions: {
        filter?: string;
        sort: string;
        expand: string;
      } = {
        sort: '-created',
        expand: 'restaurant,requestedBy',
      };

      const filters: string[] = [];

      if (activeFilter !== 'all') {
        filters.push(`status = "${activeFilter}"`);
      }

      if (activeFilter !== 'pending') {
        const cutoff = resolveTimeRangeCutoff(activeTimeRange);
        if (cutoff) {
          filters.push(`updated >= "${cutoff}"`);
        }
      }

      if (filters.length > 0) {
        queryOptions.filter = filters.join(' && ');
      }

      return pb.collection('menu_review_requests').getFullList<MenuReviewRequestRecord>(queryOptions);
    },
  });

  const pendingReviewCountQuery = useQuery({
    enabled: isAdmin,
    queryKey: ['feature', 'admin', 'pending-menu-review-count'],
    queryFn: async (): Promise<number> => {
      const response = await pb.collection('menu_review_requests').getList(1, 1, {
        filter: 'status = "pending"',
      });

      return response.totalItems;
    },
  });

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) {
        void menuReviewsQuery.refetch();
        void pendingReviewCountQuery.refetch();
      }
    }, [isAdmin, menuReviewsQuery, pendingReviewCountQuery]),
  );

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('AdminFeatures');
  };

  const selectedTimeRangeLabel =
    MENU_REVIEW_TIME_RANGE_FILTERS.find((filter) => filter.value === activeTimeRange)?.label ?? 'All Time';

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    summaryValue: {
      color: theme.colors.text.brand,
      fontSize: 26,
      fontWeight: '700',
      lineHeight: 32,
    },
    filterCard: {
      gap: theme.spacing.xs,
    },
    filterSubsectionTitle: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
      marginTop: theme.spacing.xxs,
    },
    requestCardPressable: {
      borderRadius: theme.radii.lg,
    },
    requestCard: {
      gap: theme.spacing.sm,
    },
    requestHeader: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: theme.spacing.xs,
      justifyContent: 'space-between',
    },
    requestHeaderText: {
      flex: 1,
      gap: theme.spacing.xxs,
    },
    requestTitle: {
      color: theme.colors.text.primary,
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 22,
    },
    requestMeta: {
      color: theme.colors.text.muted,
      fontSize: 12,
      lineHeight: 16,
    },
    requestHeaderRight: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    reasonCard: {
      borderColor: theme.colors.border.warning,
      gap: theme.spacing.xxs,
    },
    reasonLabel: {
      color: theme.colors.text.warning,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    reasonText: {
      color: theme.colors.text.primary,
      fontSize: 13,
      lineHeight: 18,
    },
    adminNoteCard: {
      borderColor: theme.colors.border.info,
      gap: theme.spacing.xxs,
    },
    adminNoteLabel: {
      color: theme.colors.text.info,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    adminNoteText: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      lineHeight: 18,
    },
    openRowLabel: {
      color: theme.colors.text.brand,
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
    },
  });

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.body}
      onBackPress={handleBackPress}
      rightAccessory={isAdmin ? <RoleBadge /> : undefined}
      subtitle="Review menus that users flagged for admin follow-up."
      title="Menu Reviews"
    >
      {!isAdmin ? (
        <EmptyState
          actionLabel="Back to Profile"
          description="This route is restricted to admin users."
          onAction={() => {
            navigation.navigate('Profile');
          }}
          title="Access denied"
        />
      ) : (
        <>
          <Card tone="muted">
            <Text variant="label">Menu Review Requests</Text>
            <Text style={styles.summaryValue}>{menuReviewsQuery.data?.length ?? 0}</Text>
            <Text tone="secondary">
              {activeFilter === 'pending'
                ? `${pendingReviewCountQuery.data ?? 0} pending request${(pendingReviewCountQuery.data ?? 0) === 1 ? '' : 's'} total`
                : `Showing ${activeFilter === 'all' ? 'all statuses' : `${activeFilter} requests`} (${selectedTimeRangeLabel})`}
            </Text>
          </Card>

          <Card style={styles.filterCard}>
            <Text variant="label">Filter</Text>
            <FilterChipGroup
              onChange={setActiveFilter}
              options={MENU_REVIEW_FILTERS}
              value={activeFilter}
              wrap
            />
            {activeFilter !== 'pending' ? (
              <>
                <Text style={styles.filterSubsectionTitle}>Time range</Text>
                <FilterChipGroup
                  onChange={setActiveTimeRange}
                  options={MENU_REVIEW_TIME_RANGE_FILTERS}
                  value={activeTimeRange}
                  wrap
                />
              </>
            ) : null}
          </Card>

          {menuReviewsQuery.isLoading ? (
            <>
              <Skeleton height={20} />
              <Skeleton height={20} />
            </>
          ) : null}

          {menuReviewsQuery.isError ? (
            <ErrorState
              description="Could not load menu review requests."
              onRetry={() => {
                void menuReviewsQuery.refetch();
              }}
              title="Menu reviews unavailable"
            />
          ) : null}

          {!menuReviewsQuery.isLoading && !menuReviewsQuery.isError && (menuReviewsQuery.data?.length ?? 0) === 0 ? (
            <EmptyState
              description={
                activeFilter === 'pending'
                  ? 'No menu reviews are currently pending. New flagged requests will appear here.'
                  : activeFilter === 'all'
                    ? `No menu review history found in ${selectedTimeRangeLabel.toLowerCase()}.`
                    : `No ${activeFilter} menu reviews found in ${selectedTimeRangeLabel.toLowerCase()}.`
              }
              icon={<Ionicons color={theme.colors.text.success} name="checkmark-circle-outline" size={28} />}
              title="All clear"
            />
          ) : null}

          {!menuReviewsQuery.isLoading && !menuReviewsQuery.isError
            ? menuReviewsQuery.data?.map((request) => {
                const restaurantName = request.expand?.restaurant?.name?.trim() || 'Unknown restaurant';
                const reporterName = request.expand?.requestedBy?.name?.trim();
                const reporterEmail = request.expand?.requestedBy?.email?.trim();
                const reporterLabel = reporterName || reporterEmail || request.requestedBy;
                const requestReason = request.reason?.trim();
                const existingAdminNote = request.adminNotes?.trim();
                const statusLabel = STATUS_LABELS[request.status];
                const statusTone =
                  request.status === 'pending'
                    ? 'warning'
                    : request.status === 'reviewed'
                      ? 'success'
                      : 'muted';

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={request.id}
                    onPress={() => {
                      navigation.navigate('AdminMenuReviewDetail', {
                        requestId: request.id,
                      });
                    }}
                    style={styles.requestCardPressable}
                  >
                    <Card style={styles.requestCard}>
                      <View style={styles.requestHeader}>
                        <View style={styles.requestHeaderText}>
                          <Text style={styles.requestTitle}>{restaurantName}</Text>
                          <Text style={styles.requestMeta}>
                            Reported by {reporterLabel} on{' '}
                            {formatDisplayDate(request.created, {
                              fallback: 'Unknown date',
                              options: {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              },
                            })}
                          </Text>
                        </View>
                        <View style={styles.requestHeaderRight}>
                          <StatusPill
                            label={statusLabel}
                            tone={statusTone}
                            uppercase
                            variant="soft"
                          />
                          <Ionicons color={theme.colors.text.muted} name="chevron-forward" size={16} />
                        </View>
                      </View>

                      {requestReason ? (
                        <Card style={styles.reasonCard} tone="warning">
                          <Text style={styles.reasonLabel}>Reason for report</Text>
                          <Text style={styles.reasonText}>{requestReason}</Text>
                        </Card>
                      ) : null}

                      {existingAdminNote ? (
                        <Card style={styles.adminNoteCard} tone="info">
                          <Text style={styles.adminNoteLabel}>Admin note</Text>
                          <Text style={styles.adminNoteText}>{existingAdminNote}</Text>
                        </Card>
                      ) : null}

                      <Text style={styles.openRowLabel}>{request.status === 'pending' ? 'Open review' : 'View review'}</Text>
                    </Card>
                  </Pressable>
                );
              })
            : null}
        </>
      )}
    </BackHeaderScreenScaffold>
  );
}
