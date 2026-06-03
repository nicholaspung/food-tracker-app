import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  HeaderAccessoryButton,
  OptionList,
  OptionListRow,
  PendingQueuedWriteRow,
  QueryListStateView,
  SegmentedControl,
  StatusPill,
} from '../components/shared';
import { listBillSummaries } from '../features';
import { billsQueryKeys } from '../features/store/billsQuery';
import { useFeatureBrowse } from '../features/store/useFeatureBrowse';
import type { BillListSummary } from '../features/store/featureStore';
import type { QueuedFeatureWrite } from '../features/store/queuedFeatureWrites';
import { formatCurrency } from '../features/bills/billCalculations';
import { formatDisplayDate } from '../lib/dateFormatting';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { createThemedStyles } from '../theme';
import { Card, Text } from '../ui';

type BillsScreenProps = NativeStackScreenProps<RootStackParamList, 'Bills'>;
type BillFilter = 'active' | 'you_owe' | 'you_are_owed' | 'settled';

const BILL_PENDING_OPERATION_NAMES = ['bill.create'] as const;

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
  body: {
    gap: theme.spacing.md,
  },
  filterCard: {
    padding: theme.spacing.xs,
  },
  totalCard: {
    gap: theme.spacing.xxs,
  },
  listCard: {
    borderColor: theme.colors.border.subtle,
  },
  pendingStack: {
    gap: theme.spacing.sm,
  },
  list: {
    borderColor: theme.colors.border.subtle,
  },
}));

export function BillsScreen({ navigation, route }: BillsScreenProps) {
  const billsQuery = useQuery({
    queryKey: billsQueryKeys.root,
    queryFn: ({ signal }) => listBillSummaries({ signal }),
  });

  const [activeFilter, setActiveFilter] = useState<BillFilter>('active');
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

  const filteredBills = useMemo(() => {
    const bills = billsQuery.data ?? [];

    if (activeFilter === 'active') {
      return bills.filter((bill) => bill.status !== 'settled');
    }

    if (activeFilter === 'settled') {
      return bills.filter((bill) => bill.status === 'settled');
    }

    if (activeFilter === 'you_owe') {
      return bills.filter((bill) => {
        return bill.status !== 'settled' && bill.youOwe > 0;
      });
    }

    if (activeFilter === 'you_are_owed') {
      return bills.filter((bill) => {
        return bill.status !== 'settled' && bill.youAreOwed > 0;
      });
    }

    return bills;
  }, [activeFilter, billsQuery.data]);
  const activeBillTotal = useMemo(() => {
    return filteredBills.reduce((sum, bill) => {
      if (activeFilter === 'you_owe') {
        return sum + bill.youOwe;
      }

      if (activeFilter === 'you_are_owed') {
        return sum + bill.youAreOwed;
      }

      return sum;
    }, 0);
  }, [activeFilter, filteredBills]);
  const showActiveBillTotal = activeFilter === 'you_owe' || activeFilter === 'you_are_owed';
  const activeBillTotalTitle = activeFilter === 'you_owe' ? 'You owe' : "You're owed";
  const activeBillTotalDescription =
    activeFilter === 'you_owe'
      ? `Across ${filteredBills.length} active bill${filteredBills.length === 1 ? '' : 's'}`
      : `From ${filteredBills.length} active bill${filteredBills.length === 1 ? '' : 's'}`;
  const buildBrowseAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'BillsScreen',
      activeFilter,
      resultCount: filteredBills.length,
      ...overrides,
    }),
    [activeFilter, filteredBills.length],
  );
  const browseState = useFeatureBrowse<BillListSummary[], BillListSummary, 'bill.create'>({
    analyticsSource: 'BillsScreen',
    buildAnalyticsPayload: buildBrowseAnalyticsPayload,
    emptyWhen: () => filteredBills.length === 0,
    getItemsFromData: useCallback((data: BillListSummary[] | undefined) => data ?? [], []),
    getResultCountFromData: useCallback(
      (data: BillListSummary[] | undefined, fallbackCount: number) => data?.length ?? fallbackCount,
      [],
    ),
    pendingQueuedWriteOperationNames: BILL_PENDING_OPERATION_NAMES,
    query: billsQuery,
    refreshEventPrefix: 'BILLS_REFRESH',
    resultCount: filteredBills.length,
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

  return (
    <BackHeaderScreenScaffold
      headerScrollMode="fixed"
      onRefresh={browseState.onRefresh}
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
      subtitle="Split bills with your group and track payment status."
      testID="bills-screen"
      title="Bills"
    >
      <View style={styles.body}>
        <Card style={styles.filterCard}>
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
              { label: 'Active', value: 'active' },
              { label: 'You Owe', value: 'you_owe' },
              { label: "You're Owed", value: 'you_are_owed' },
              { label: 'Settled', value: 'settled' },
            ]}
            value={activeFilter}
          />
        </Card>

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
            activeFilter === 'active'
              ? 'No active bills right now.'
              : activeFilter === 'you_owe'
                ? 'No unpaid bills right now.'
                : 'No bills found for this filter.'
          }
          emptyTitle="No matching bills"
          hasBlockingError={browseState.hasBlockingError}
          hasRefreshError={browseState.hasRefreshError}
          isLoading={browseState.isLoading}
          onRetry={() => {
            void billsQuery.refetch();
          }}
          refreshErrorMessage="Could not refresh bills. Showing saved data."
          showEmpty={filteredBills.length === 0}
          title="Bills unavailable"
        >
          <Card style={styles.listCard}>
            <OptionList style={styles.list}>
              {filteredBills.map((bill, index) => {
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
                    key={bill.id}
                    isLast={index === filteredBills.length - 1}
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
                    subtitle={summaryLabel}
                    testID={`bills-row-${activeFilter}-${index}`}
                    title={bill.title}
                  />
                );
              })}
            </OptionList>
          </Card>
        </QueryListStateView>
      </View>
    </BackHeaderScreenScaffold>
  );
}
