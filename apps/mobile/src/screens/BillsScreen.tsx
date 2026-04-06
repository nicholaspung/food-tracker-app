import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  HeaderAccessoryButton,
  OptionList,
  OptionListRow,
  SegmentedControl,
  Skeleton,
  StatusPill,
} from '../components/shared';
import { listBillSummaries } from '../features';
import { formatCurrency } from '../features/bills/billCalculations';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useTheme } from '../theme';
import { Card } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type BillsScreenProps = NativeStackScreenProps<RootStackParamList, 'Bills'>;
type BillFilter = 'all' | 'you_owe' | 'you_are_owed' | 'settled';

export function BillsScreen({ navigation }: BillsScreenProps) {
  const theme = useTheme();

  const billsQuery = useQuery({
    queryKey: ['feature', 'bills'],
    queryFn: listBillSummaries,
  });
  const hasBlockingBillsError = billsQuery.isError && !billsQuery.data;
  const hasBillsRefreshError = !hasBlockingBillsError && billsQuery.isError;

  const [activeFilter, setActiveFilter] = useState<BillFilter>('you_owe');

  const filteredBills = useMemo(() => {
    const bills = billsQuery.data ?? [];

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

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
    },
    filterCard: {
      padding: theme.spacing.xs,
    },
    listCard: {
      borderColor: theme.colors.border.subtle,
    },
    list: {
      borderColor: theme.colors.border.subtle,
    },
  });

  return (
    <BackHeaderScreenScaffold
      onBackPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.navigate('Misc');
      }}
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

        {billsQuery.isLoading ? (
          <>
            <Skeleton height={20} />
            <Skeleton height={20} />
          </>
        ) : null}

        <PageErrorToast
          errorMessage={
            hasBlockingBillsError
              ? 'Could not load bills.'
              : hasBillsRefreshError
                ? 'Could not refresh bills. Showing saved data.'
                : null
          }
          title="Bills unavailable"
          actionLabel="Retry"
          onAction={() => {
            void billsQuery.refetch();
          }}
        />

        {!billsQuery.isLoading && !hasBlockingBillsError && filteredBills.length === 0 ? (
          <EmptyState
            description={
              activeFilter === 'all'
                ? 'Create a split bill to get started.'
                : activeFilter === 'you_owe'
                  ? 'No unpaid bills right now.'
                  : 'No bills found for this filter.'
            }
            tone="default"
            title={activeFilter === 'all' ? 'No bills yet' : 'No matching bills'}
          />
        ) : null}

        {!billsQuery.isLoading && !hasBlockingBillsError && filteredBills.length > 0 ? (
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
        ) : null}
      </View>
    </BackHeaderScreenScaffold>
  );
}
