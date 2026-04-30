import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
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
import { useQueuedFeatureWrites } from '../features/store/useQueuedFeatureWrites';
import { useQueryListState } from '../hooks/useListQueryState';
import { usePullToRefreshState } from '../hooks/usePullToRefreshState';
import { formatCurrency } from '../features/bills/billCalculations';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { createThemedStyles } from '../theme';
import { Card } from '../ui';

type BillsScreenProps = NativeStackScreenProps<RootStackParamList, 'Bills'>;
type BillFilter = 'all' | 'you_owe' | 'you_are_owed' | 'settled';

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  filterCard: {
    padding: theme.spacing.xs,
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

export function BillsScreen({ navigation }: BillsScreenProps) {
  const billsQuery = useQuery({
    queryKey: billsQueryKeys.root,
    queryFn: ({ signal }) => listBillSummaries({ signal }),
  });
  const billsState = useQueryListState({
    data: billsQuery.data,
    isError: billsQuery.isError,
    isFetching: billsQuery.isFetching,
    isLoading: billsQuery.isLoading,
    isSuccess: billsQuery.isSuccess,
  });

  const [activeFilter, setActiveFilter] = useState<BillFilter>('you_owe');
  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(billsQuery.isRefetching);
  const { queuedWrites: pendingBillWrites } = useQueuedFeatureWrites(['bill.create']);

  const filteredBills = useMemo(() => {
    const bills = billsState.items;

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
  }, [activeFilter, billsState.items]);
  const styles = useStyles();
  const buildBrowseAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'BillsScreen',
      activeFilter,
      resultCount: filteredBills.length,
      ...overrides,
    }),
    [activeFilter, filteredBills.length],
  );
  const handleRefresh = useCallback(async () => {
    return runPullRefresh(async () => {
      const resultCountBefore = filteredBills.length;
      trackObservabilityEvent('BILLS_REFRESH_STARTED', buildBrowseAnalyticsPayload({
        resultCountBefore,
      }));

      try {
        const result = await billsQuery.refetch();
        const resultCountAfter = result.data?.length ?? resultCountBefore;
        trackObservabilityEvent('BILLS_REFRESH_COMPLETED', buildBrowseAnalyticsPayload({
          resultCountBefore,
          resultCountAfter,
          deltaCount: resultCountAfter - resultCountBefore,
        }));
      } catch (error) {
        trackObservabilityEvent('BILLS_REFRESH_FAILED', buildBrowseAnalyticsPayload({
          resultCountBefore,
          errorType: error instanceof Error ? error.name : 'unknown_error',
        }));
        throw error;
      }
    });
  }, [billsQuery, buildBrowseAnalyticsPayload, filteredBills.length, runPullRefresh]);

  return (
    <BackHeaderScreenScaffold
      headerScrollMode="fixed"
      onRefresh={handleRefresh}
      onBackPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.navigate('Misc');
      }}
      refreshing={isPullRefreshing}
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
              { label: 'All', value: 'all' },
              { label: 'You Owe', value: 'you_owe' },
              { label: "You're Owed", value: 'you_are_owed' },
              { label: 'Settled', value: 'settled' },
            ]}
            value={activeFilter}
          />
        </Card>

        {pendingBillWrites.length > 0 ? (
          <View style={styles.pendingStack}>
            {pendingBillWrites.map((write) => {
              const payload = write.payload as { title?: string; participants?: unknown[] };
              const participantCount = Array.isArray(payload.participants) ? payload.participants.length : 0;
              return (
                <PendingQueuedWriteRow
                  key={write.id}
                  description={
                    participantCount > 0
                      ? `${participantCount} participant${participantCount === 1 ? '' : 's'}`
                      : undefined
                  }
                  lastError={write.lastError}
                  status={write.status}
                  title={payload.title?.trim() || 'New bill'}
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
            activeFilter === 'all'
              ? 'Create a split bill to get started.'
              : activeFilter === 'you_owe'
                ? 'No unpaid bills right now.'
                : 'No bills found for this filter.'
          }
          emptyTitle={activeFilter === 'all' ? 'No bills yet' : 'No matching bills'}
          hasBlockingError={billsState.hasBlockingError}
          hasRefreshError={billsState.hasRefreshError}
          isLoading={billsQuery.isLoading}
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
                const summaryLabel =
                  bill.youOwe > 0
                    ? `${participantLabel} • Owe ${formatCurrency(bill.youOwe)}`
                    : bill.youAreOwed > 0
                      ? `${participantLabel} • Owed ${formatCurrency(bill.youAreOwed)}`
                      : bill.status === 'settled'
                        ? `${participantLabel} • All settled`
                        : `${participantLabel} • ${bill.pendingOtherParticipantCount} pending`;

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
