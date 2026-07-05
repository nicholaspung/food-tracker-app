import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { InfiniteData } from '@tanstack/react-query';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, View, type ListRenderItem } from 'react-native';

import {
  BackHeaderScreenScaffold,
  FeatureListFooter,
  HeaderAccessoryButton,
  OptionListRow,
  PendingQueuedWriteRow,
  QueryListStateView,
  SegmentedControl,
  StatusPill,
} from '../components/shared';
import { listBillSummariesPage } from '../features';
import { billsQueryKeys } from '../features/store/billsQuery';
import { useFeatureBrowse } from '../features/store/useFeatureBrowse';
import type { BillListPage, BillListSummary } from '../features/store/featureStore';
import type { QueuedFeatureWrite } from '../features/store/queuedFeatureWrites';
import { formatCurrency } from '../features/bills/billCalculations';
import {
  type BillListFilter,
} from '../features/bills/billListFilters';
import { formatDisplayDate } from '../lib/dateFormatting';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { createThemedStyles } from '../theme';
import { Card, Text } from '../ui';

type BillsScreenProps = NativeStackScreenProps<RootStackParamList, 'Bills'>;

const BILL_PENDING_OPERATION_NAMES = ['bill.create'] as const;
const BILL_BROWSE_PROJECTION_TARGETS = ['bills'] as const;

function formatBillListCreatedDate(createdAt: string): string {
  const dateLabel = formatDisplayDate(createdAt, {
    fallback: 'Recently',
    options: {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    },
  });

  return `Created ${dateLabel}`;
}

const useStyles = createThemedStyles((theme) => ({
  screenBody: {
    flex: 1,
    gap: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
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
  listHeader: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  totalCard: {
    gap: theme.spacing.xxs,
  },
  billRow: {
    borderBottomColor: theme.colors.border.default,
    borderLeftColor: theme.colors.border.default,
    borderLeftWidth: 1,
    borderRightColor: theme.colors.border.default,
    borderRightWidth: 1,
  },
  billRowFirst: {
    borderTopColor: theme.colors.border.default,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    borderTopWidth: 1,
  },
  billRowLast: {
    borderBottomColor: theme.colors.border.default,
    borderBottomLeftRadius: theme.radii.lg,
    borderBottomRightRadius: theme.radii.lg,
    borderBottomWidth: 1,
  },
  pendingStack: {
    gap: theme.spacing.sm,
  },
}));

export function BillsScreen({ navigation, route }: BillsScreenProps) {
  const [activeFilter, setActiveFilter] = useState<BillListFilter>('you_owe');
  const billsQuery = useInfiniteQuery({
    queryKey: billsQueryKeys.paginated(activeFilter),
    queryFn: ({ pageParam, signal }) =>
      listBillSummariesPage({
        filter: activeFilter,
        page: typeof pageParam === 'number' ? pageParam : 1,
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
  });

  const consumedNotificationRouteKeyRef = useRef<string | null>(null);
  const styles = useStyles();
  const refetchBills = billsQuery.refetch;
  useEffect(() => {
    if (!route.params?.refreshSignal) {
      return;
    }

    void refetchBills();
  }, [refetchBills, route.params?.refreshSignal]);

  useEffect(() => {
    const billId = route.params?.billId?.trim();
    if (!billId) {
      return;
    }

    const routeKey = `${billId}:${route.params?.refreshSignal ?? 'direct'}`;
    if (consumedNotificationRouteKeyRef.current === routeKey) {
      return;
    }

    consumedNotificationRouteKeyRef.current = routeKey;
    navigation.navigate('BillDetail', { billId });
  }, [navigation, route.params?.billId, route.params?.refreshSignal]);

  const visibleBills = useMemo(
    () => billsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [billsQuery.data],
  );
  const activeBillSummary = billsQuery.data?.pages[0]?.summary ?? {
    billCount: 0,
    totalAmount: 0,
  };
  const activeBillTotal = activeBillSummary.totalAmount;
  const showActiveBillTotal = activeFilter === 'you_owe' || activeFilter === 'you_are_owed';
  const activeBillTotalTitle = activeFilter === 'you_owe' ? 'You owe' : "You're owed";
  const activeBillTotalDescription =
    activeFilter === 'you_owe'
      ? `Across ${activeBillSummary.billCount} active bill${activeBillSummary.billCount === 1 ? '' : 's'}`
      : `From ${activeBillSummary.billCount} active bill${activeBillSummary.billCount === 1 ? '' : 's'}`;
  const buildBrowseAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'BillsScreen',
      activeFilter,
      resultCount: visibleBills.length,
      ...overrides,
    }),
    [activeFilter, visibleBills.length],
  );
  const browseState = useFeatureBrowse<
    InfiniteData<BillListPage, unknown>,
    BillListSummary,
    'bill.create'
  >({
    analyticsSource: 'BillsScreen',
    buildAnalyticsPayload: buildBrowseAnalyticsPayload,
    emptyWhen: () => visibleBills.length === 0,
    getItemsFromData: useCallback(
      (data: InfiniteData<BillListPage, unknown> | undefined) =>
        data?.pages.flatMap((page) => page.items) ?? [],
      [],
    ),
    getResultCountFromData: useCallback(
      (data: InfiniteData<BillListPage, unknown> | undefined, fallbackCount: number) =>
        data?.pages.reduce((count, page) => count + page.items.length, 0) ?? fallbackCount,
      [],
    ),
    getTotalItemsFromData: useCallback(
      (data: InfiniteData<BillListPage, unknown> | undefined, items: readonly BillListSummary[]) =>
        data?.pages[0]?.totalItems ?? items.length,
      [],
    ),
    loadMoreEventPrefix: 'BILLS_LOAD_MORE',
    pendingQueuedWriteOperationNames: BILL_PENDING_OPERATION_NAMES,
    queuedWriteBrowseProjectionTargets: BILL_BROWSE_PROJECTION_TARGETS,
    query: billsQuery,
    refreshEventPrefix: 'BILLS_REFRESH',
    resultCount: visibleBills.length,
    toPendingRow: useCallback((write: QueuedFeatureWrite<'bill.create'>) => {
      const payload = write.payload as { title?: string; participants?: unknown[] };
      const participantCount = Array.isArray(payload.participants) ? payload.participants.length : 0;

      return {
        id: write.id,
        createdAt: write.createdAt,
        description:
          participantCount > 0
            ? `${participantCount} participant${participantCount === 1 ? '' : 's'}`
            : undefined,
        idempotencyKey: write.idempotencyKey,
        lastError: write.lastError,
        status: write.status,
        title: payload.title?.trim() || 'New bill',
      };
    }, []),
  });
  const renderBillItem = useCallback<ListRenderItem<BillListSummary>>(
    ({ item: bill, index }) => {
      const statusTone = bill.status === 'settled' ? 'success' : 'info';
      const statusLabel = bill.status === 'settled' ? 'Settled' : 'Active';
      const participantLabel =
        `${bill.participantCount} participant${bill.participantCount === 1 ? '' : 's'}`;
      const createdLabel = formatBillListCreatedDate(bill.createdAt);
      const summaryLabel =
        bill.youOwe > 0
          ? `${createdLabel} • ${participantLabel} • Owe ${formatCurrency(bill.youOwe)}`
          : bill.youAreOwed > 0
            ? `${createdLabel} • ${participantLabel} • Owed ${formatCurrency(bill.youAreOwed)}`
            : bill.status === 'settled'
              ? `${createdLabel} • ${participantLabel} • All settled`
              : `${createdLabel} • ${participantLabel} • ${bill.pendingOtherParticipantCount} pending`;

      return (
        <OptionListRow
          isLast={index === visibleBills.length - 1}
          onPress={() => {
            trackObservabilityEvent('BILL_OPENED', {
              source: 'BillsScreen',
              filter: activeFilter,
              status: bill.status,
              isCreator: bill.isCreator,
            });
            navigation.navigate('BillDetail', { billId: bill.id });
          }}
          rightAccessory={<StatusPill label={statusLabel} tone={statusTone} />}
          style={[
            styles.billRow,
            index === 0 ? styles.billRowFirst : null,
            index === visibleBills.length - 1 ? styles.billRowLast : null,
          ]}
          subtitle={summaryLabel}
          testID={`bills-row-${activeFilter}-${index}`}
          title={bill.title}
        />
      );
    },
    [activeFilter, navigation, styles, visibleBills.length],
  );

  const billsListHeader = (
    <View style={styles.listHeader}>
      <SegmentedControl
        getOptionTestID={(value) => `bills-filter-${value}`}
        onChange={(nextFilter) => {
          trackObservabilityEvent('BILLS_FILTER_CHANGED', {
            source: 'BillsScreen',
            filter: nextFilter,
          });
          setActiveFilter(nextFilter);
        }}
        options={[
          { label: 'You Owe', value: 'you_owe' },
          { label: "You're Owed", value: 'you_are_owed' },
          { label: 'Settled', value: 'settled' },
        ]}
        value={activeFilter}
      />

      {showActiveBillTotal ? (
        <Card style={styles.totalCard} testID={`bills-total-${activeFilter}`}>
          <Text tone="muted" variant="bodySmSemiBold">
            {activeBillTotalTitle}
          </Text>
          <Text variant="displaySm">{formatCurrency(activeBillTotal)}</Text>
          <Text tone="muted" variant="bodySm">
            {activeBillTotalDescription}
          </Text>
        </Card>
      ) : null}

      {browseState.pendingRows.length > 0 ? (
        <View style={styles.pendingStack}>
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

      <QueryListStateView
        analyticsProps={buildBrowseAnalyticsPayload()}
        analyticsSource="BillsScreen"
        blockingErrorMessage="Could not load bills."
        emptyDescription={
          activeFilter === 'you_owe' ? 'No unpaid bills right now.' : 'No bills found for this filter.'
        }
        emptyTitle="No matching bills"
        hasBlockingError={browseState.hasBlockingError}
        hasRefreshError={browseState.hasRefreshError}
        isLoading={browseState.isLoading}
        onRetry={() => {
          void billsQuery.refetch();
        }}
        refreshErrorMessage="Could not refresh bills. Showing saved data."
        showEmpty={visibleBills.length === 0}
        title="Bills unavailable"
      />
    </View>
  );

  const billsListFooter =
    !browseState.isLoading && !browseState.hasBlockingError && visibleBills.length > 0 && browseState.hasNextPage ? (
      <FeatureListFooter
        isFetchingNextPage={browseState.isFetchingNextPage}
        label="Load more bills"
        onLoadMore={browseState.onEndReached}
      />
    ) : null;

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.screenBody}
      onBackPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.navigate('Misc');
      }}
      refreshing={browseState.isRefreshing}
      rightAccessory={
        <HeaderAccessoryButton
          label="Create Bill"
          onPress={() => {
            trackObservabilityEvent('BILLS_CREATE_CTA_TAPPED', {
              source: 'BillsScreen',
              placement: 'header',
            });
            navigation.navigate('CreateBill');
          }}
          testID="bills-create-button"
        />
      }
      scroll={false}
      screenBackgroundTone="surface"
      subtitle="Split bills with your group and track payment status."
      testID="bills-screen"
      title="Bills"
    >
      <FlatList
        contentContainerStyle={styles.listContent}
        data={browseState.isLoading || browseState.hasBlockingError ? [] : visibleBills}
        initialNumToRender={10}
        keyExtractor={(bill) => bill.id}
        ListFooterComponent={billsListFooter}
        ListHeaderComponent={billsListHeader}
        maxToRenderPerBatch={10}
        onRefresh={browseState.onRefresh}
        refreshing={browseState.isRefreshing}
        removeClippedSubviews
        renderItem={renderBillItem}
        style={styles.list}
        windowSize={7}
      />
    </BackHeaderScreenScaffold>
  );
}
