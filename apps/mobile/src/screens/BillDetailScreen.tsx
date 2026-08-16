import { Ionicons } from '../ui/AppIcon';
import { CommonActions } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ConfirmDestructiveModal,
  EmptyState,
  ErrorState,
  FeatureDetailScreenScaffold,
  OptionList,
  OptionListRow,
  PageErrorToast,
  Skeleton,
  StatusPill,
} from '../components/shared';
import {
  getBillById,
  type BillParticipantRecord,
  type BillRecord,
} from '../features';
import { billsQueryKeys, getCachedBillDetail } from '../features/store/billsQuery';
import { formatCurrency, validateBillTotal } from '../features/bills/billCalculations';
import {
  type BillPaymentReminderWriteResult,
  useBillPaymentReminderWrite,
} from '../features/store/useBillPaymentReminderWrite';
import { useBillWrites } from '../features/store/useBillWrites';
import { usePullToRefreshState } from '../hooks/usePullToRefreshState';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Modal, Text } from '../ui';

type BillDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'BillDetail'>;

function isLikelyUserId(value: string): boolean {
  return /^[a-z0-9]{15}$/i.test(value.trim());
}

function sanitizeParticipantDisplayName(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue || isLikelyUserId(trimmedValue)) {
    return 'Member';
  }

  return trimmedValue;
}

function computeBillTotals(
  subtotal: number,
  tax: number,
  tip: number,
  fees: number,
  participants: BillParticipantRecord[],
  expectedTotal?: number,
): {
  total: number;
  participantTotal: number;
  isValid: boolean;
} {
  const calculatedTotal = subtotal + tax + tip + fees;
  const total = typeof expectedTotal === 'number' && expectedTotal > 0 ? expectedTotal : calculatedTotal;
  const participantTotal = participants.reduce((sum, participant) => sum + participant.amountOwed, 0);

  return {
    total,
    participantTotal,
    isValid: validateBillTotal(participants, total),
  };
}

function formatSplitTypeLabel(splitMode: BillRecord['splitMode'], extrasSplitMode: BillRecord['extrasSplitMode']): string {
  if (splitMode === 'even') {
    return 'Even';
  }

  if (splitMode === 'custom') {
    return 'Custom';
  }

  if (splitMode === 'itemized') {
    return 'Itemized';
  }

  return extrasSplitMode === 'equal' ? 'Even' : 'Itemized';
}

function formatBillCreatedLabel(createdAt: string): string {
  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) {
    return 'Created recently';
  }

  const elapsedMs = Date.now() - createdDate.getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / (1000 * 60)));
  if (elapsedMinutes < 1) {
    return 'Created just now';
  }

  if (elapsedMinutes < 60) {
    return `Created ${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `Created ${elapsedHours}h ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) {
    return elapsedDays === 1 ? 'Created yesterday' : `Created ${elapsedDays}d ago`;
  }

  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) {
    return `Created ${elapsedMonths}mo ago`;
  }

  const elapsedYears = Math.floor(elapsedMonths / 12);
  return `Created ${elapsedYears}y ago`;
}

function formatComplexSplitValue(type: 'percentage' | 'amount', value: number): string {
  if (type === 'percentage') {
    return `${value.toFixed(2)}%`;
  }

  return formatCurrency(value);
}

type BillPaymentReminderModalOutcome =
  | 'sending'
  | 'sent'
  | 'already_sent_this_week'
  | 'skipped_preference_disabled'
  | 'skipped_no_active_device'
  | 'provider_failed'
  | 'failed';

interface BillPaymentReminderModalState {
  participantName: string;
  outcome: BillPaymentReminderModalOutcome;
}

interface BillPaymentReminderModalCopy {
  title: string;
  description: string;
  actionLabel?: string;
}

function mapBillPaymentReminderResultStatus(
  status: BillPaymentReminderWriteResult['status'],
): BillPaymentReminderModalOutcome {
  if (
    status === 'sent' ||
    status === 'provider_failed'
  ) {
    return status;
  }

  if (status === 'weekly_limited') {
    return 'already_sent_this_week';
  }
  if (status === 'preference_disabled') {
    return 'skipped_preference_disabled';
  }
  if (status === 'no_active_device') {
    return 'skipped_no_active_device';
  }

  return 'failed';
}

function getBillPaymentReminderModalCopy({
  outcome,
  participantName,
}: BillPaymentReminderModalState): BillPaymentReminderModalCopy {
  switch (outcome) {
    case 'sending':
      return {
        title: 'Sending Reminder',
        description: `Sending a payment reminder to ${participantName}.`,
      };
    case 'sent':
      return {
        title: 'Reminder Sent',
        description: `${participantName} has been sent a payment reminder.`,
        actionLabel: 'Done',
      };
    case 'already_sent_this_week':
      return {
        title: 'Already Sent This Week',
        description: `${participantName} already received a payment reminder for this bill this week.`,
        actionLabel: 'Done',
      };
    case 'skipped_preference_disabled':
      return {
        title: 'Reminder Not Sent',
        description: `${participantName} has payment reminders turned off.`,
        actionLabel: 'Done',
      };
    case 'skipped_no_active_device':
      return {
        title: 'Reminder Not Sent',
        description: `${participantName} has no active notification device.`,
        actionLabel: 'Done',
      };
    case 'provider_failed':
      return {
        title: 'Reminder Not Sent',
        description: 'The notification provider could not send the reminder. Try again in a moment.',
        actionLabel: 'Done',
      };
    case 'failed':
      return {
        title: 'Reminder Not Sent',
        description: 'The reminder could not be sent. Try again in a moment.',
        actionLabel: 'Done',
      };
  }
}

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  skeletonGroup: {
    gap: theme.spacing.sm,
  },
  sectionCard: {
    gap: theme.spacing.sm,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  sectionTitle: {
    color: theme.colors.text.primary,
  },
  statusActionCard: {
    gap: theme.spacing.sm,
  },
  statusActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  statusActionCopy: {
    flex: 1,
    gap: 2,
  },
  statusActionHint: {
    color: theme.colors.text.secondary,
  },
  statusActionButton: {
    minHeight: 36,
    paddingHorizontal: theme.spacing.md,
  },
  summaryRows: {
    gap: theme.spacing.xs,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: theme.colors.text.secondary,
    flex: 1,
  },
  summaryLabelStrong: {
    color: theme.colors.text.primary,
  },
  summaryValue: {
    color: theme.colors.text.primary,
    marginLeft: theme.spacing.sm,
    textAlign: 'right',
  },
  list: {
    borderColor: theme.colors.border.subtle,
  },
  participantActionPill: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: theme.spacing.sm,
  },
  participantActionPillPositive: {
    backgroundColor: theme.colors.status.successBg,
    borderColor: theme.colors.border.success,
  },
  participantActionPillSecondary: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
  },
  participantActionPillPressed: {
    opacity: 0.75,
  },
  participantActionPillDisabled: {
    opacity: 0.6,
  },
  participantActions: {
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
  },
  participantActionLabel: {
    color: theme.colors.text.success,
  },
  participantActionLabelSecondary: {
    color: theme.colors.text.secondary,
  },
  participantReminderLabel: {
    color: theme.colors.text.info,
  },
  reminderModalStatus: {
    color: theme.colors.text.secondary,
  },
  itemPrice: {
    color: theme.colors.text.primary,
  },
  sectionHint: {
    color: theme.colors.text.muted,
  },
  destructiveButton: {
    backgroundColor: theme.colors.fill.danger,
  },
  deleteTriggerButton: {
    minHeight: 36,
    paddingHorizontal: theme.spacing.md,
    width: '100%',
  },
  headerRightRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  headerEditButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
}));

export function BillDetailScreen({ navigation, route }: BillDetailScreenProps) {
  const { billId } = route.params;
  const theme = useTheme();
  const styles = useStyles();
  const { user } = useAuth();
  const billWrites = useBillWrites();
  const billPaymentReminderWrite = useBillPaymentReminderWrite();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();

  const billQuery = useQuery({
    queryKey: billsQueryKeys.detail(billId),
    queryFn: ({ signal }) => getBillById(billId, { signal }),
    initialData: () => getCachedBillDetail(queryClient, billId),
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    staleTime: 0,
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUpdatingBillStatus, setIsUpdatingBillStatus] = useState(false);
  const [isDeletingBill, setIsDeletingBill] = useState(false);
  const [updatingParticipantId, setUpdatingParticipantId] = useState<string | null>(null);
  const [remindingParticipantId, setRemindingParticipantId] = useState<string | null>(null);
  const [reminderModalState, setReminderModalState] = useState<BillPaymentReminderModalState | null>(null);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(billQuery.isRefetching);

  const bill = billQuery.data;
  const isCreator = bill?.createdByUserId === user?.id;
  const isBillSettled = bill?.status === 'settled';
  const paidCount = bill?.participants.filter((participant) => participant.paidStatus === 'paid').length ?? 0;

  const subtotal = useMemo(() => {
    if (!bill) {
      return 0;
    }

    return bill.items.reduce((sum, item) => sum + item.price, 0);
  }, [bill]);

  const totals = useMemo(() => {
    if (!bill) {
      return {
        total: 0,
        participantTotal: 0,
        isValid: true,
      };
    }

    return computeBillTotals(subtotal, bill.tax, bill.tip, bill.fees, bill.participants, bill.totalAmount);
  }, [bill, subtotal]);

  const billSummary = useMemo(() => {
    if (!bill || !user?.id) {
      return {
        youOwe: 0,
        youAreOwed: 0,
      };
    }

    const currentUserParticipant = bill.participants.find((participant) => participant.userId === user.id);
    const youOwe =
      currentUserParticipant?.paidStatus === 'pending' ? currentUserParticipant.amountOwed : 0;
    const youAreOwed = isCreator
      ? bill.participants
          .filter((participant) => participant.userId !== user.id && participant.paidStatus === 'pending')
          .reduce((sum, participant) => sum + participant.amountOwed, 0)
      : 0;

    return {
      youOwe,
      youAreOwed,
    };
  }, [bill, isCreator, user?.id]);

  const participantNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (!bill) {
      return map;
    }

    bill.participants.forEach((participant) => {
      const isCurrentUser = participant.userId === user?.id;
      map.set(participant.id, isCurrentUser ? 'You' : sanitizeParticipantDisplayName(participant.name));
    });

    return map;
  }, [bill, user?.id]);

  const customTipContributionTotal = useMemo(() => {
    if (!bill) {
      return 0;
    }

    return bill.participants.reduce(
      (sum, participant) => sum + (participant.customTipContribution ?? 0),
      0,
    );
  }, [bill]);

  const hasSkippedInitialFocusRefreshRef = useRef(false);
  const refetchBillDetail = billQuery.refetch;
  useEffect(() => {
    if (typeof navigation.addListener !== 'function') {
      return undefined;
    }

    return navigation.addListener('focus', () => {
      if (!hasSkippedInitialFocusRefreshRef.current) {
        hasSkippedInitialFocusRefreshRef.current = true;
        return;
      }

      void refetchBillDetail();
    });
  }, [navigation, refetchBillDetail]);

  const navigateToBillsAfterDelete = useCallback(() => {
    setIsDeleteConfirmVisible(false);

    navigation.dispatch((state) => {
      const billsRoute = { name: 'Bills' as const };
      const currentRouteIndex = state.routes.findIndex((stackRoute) => stackRoute.key === route.key);
      const routesBeforeCurrent =
        currentRouteIndex >= 0 ? state.routes.slice(0, currentRouteIndex) : state.routes;
      const hasBillsRoute = routesBeforeCurrent.some((stackRoute) => stackRoute.name === 'Bills');
      const resetRoutes = routesBeforeCurrent.map((stackRoute) => ({
        name: stackRoute.name,
        params: stackRoute.params,
      }));
      const nextRoutes = hasBillsRoute ? resetRoutes : [billsRoute];
      const normalizedRoutes = nextRoutes.length > 0 ? nextRoutes : [billsRoute];

      return CommonActions.reset({
        index: normalizedRoutes.length - 1,
        routes: normalizedRoutes,
      });
    });
  }, [navigation, route.key]);

  const changeBillStatus = async (nextStatus: BillRecord['status']) => {
    if (!bill || !isCreator) {
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('BILL_DETAIL_STATUS_TOGGLE_STARTED', {
      source: 'BillDetailScreen',
      nextStatus,
      isOnline,
    });
    setIsUpdatingBillStatus(true);

    try {
      const updateResult = await billWrites.updateBillStatus({
        billId,
        status: nextStatus,
      });

      if (updateResult.status === 'queued') {
        trackObservabilityEvent('BILL_DETAIL_STATUS_TOGGLE_SUCCEEDED', {
          source: 'BillDetailScreen',
          nextStatus,
          queued: true,
        });
        return;
      }

      trackObservabilityEvent('BILL_DETAIL_STATUS_TOGGLE_SUCCEEDED', {
        source: 'BillDetailScreen',
        nextStatus,
        queued: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update bill status.';
      setErrorMessage(message);
      trackObservabilityEvent('BILL_DETAIL_STATUS_TOGGLE_FAILED', {
        source: 'BillDetailScreen',
        nextStatus,
        error: message,
      });
    } finally {
      setIsUpdatingBillStatus(false);
    }
  };

  const updateParticipantPaidStatus = async (
    participantId: string,
    nextPaidStatus: BillParticipantRecord['paidStatus'],
  ) => {
    if (!bill || bill.status === 'settled') {
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('BILL_DETAIL_PARTICIPANT_STATUS_TOGGLE_STARTED', {
      source: 'BillDetailScreen',
      nextPaidStatus,
      isOnline,
    });
    setUpdatingParticipantId(participantId);

    try {
      const updateResult = await billWrites.updateParticipantPaidStatus({
        billId,
        participantId,
        paidStatus: nextPaidStatus,
      });

      if (updateResult.status === 'queued') {
        trackObservabilityEvent('BILL_DETAIL_PARTICIPANT_STATUS_TOGGLE_SUCCEEDED', {
          source: 'BillDetailScreen',
          nextPaidStatus,
          queued: true,
        });
        return;
      }

      trackObservabilityEvent('BILL_DETAIL_PARTICIPANT_STATUS_TOGGLE_SUCCEEDED', {
        source: 'BillDetailScreen',
        nextPaidStatus,
        queued: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update paid status.';
      setErrorMessage(message);
      trackObservabilityEvent('BILL_DETAIL_PARTICIPANT_STATUS_TOGGLE_FAILED', {
        source: 'BillDetailScreen',
        nextPaidStatus,
        error: message,
      });
    } finally {
      setUpdatingParticipantId(null);
    }
  };

  const remindParticipant = async (participant: BillParticipantRecord) => {
    if (!bill || !isCreator) {
      return;
    }

    setErrorMessage(null);
    const participantName = sanitizeParticipantDisplayName(participant.name);
    setReminderModalState({
      participantName,
      outcome: 'sending',
    });
    setRemindingParticipantId(participant.id);
    trackObservabilityEvent('BILL_DETAIL_PAYMENT_REMINDER_STARTED', {
      source: 'BillDetailScreen',
    });

    const result = await billPaymentReminderWrite.sendPaymentReminder({
      billId,
      participantId: participant.id,
    });
    if (result.status === 'blocked') {
      setReminderModalState(null);
      setErrorMessage(result.message);
      trackObservabilityEvent('BILL_DETAIL_PAYMENT_REMINDER_FAILED', {
        source: 'BillDetailScreen',
        outcome: result.status,
      });
    } else {
      const outcome = mapBillPaymentReminderResultStatus(result.status);
      setReminderModalState({ participantName, outcome });
      const eventName =
        result.status === 'unexpected_failure'
          ? 'BILL_DETAIL_PAYMENT_REMINDER_FAILED'
          : 'BILL_DETAIL_PAYMENT_REMINDER_SUCCEEDED';
      trackObservabilityEvent(eventName, {
        source: 'BillDetailScreen',
        status: result.status,
        ...(eventName === 'BILL_DETAIL_PAYMENT_REMINDER_FAILED' ? { outcome } : {}),
      });
    }
    setRemindingParticipantId(null);
  };

  const handleDeleteBill = async () => {
    if (!bill || !isCreator) {
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('BILL_DETAIL_DELETE_CONFIRMED', {
      source: 'BillDetailScreen',
      isOnline,
    });
    setIsDeletingBill(true);
    try {
      const deleteResult = await billWrites.deleteBill({ billId: bill.id });

      if (deleteResult.status === 'queued') {
        trackObservabilityEvent('BILL_DETAIL_DELETE_SUCCEEDED', {
          source: 'BillDetailScreen',
          queued: true,
        });
        navigateToBillsAfterDelete();
        return;
      }

      trackObservabilityEvent('BILL_DETAIL_DELETE_SUCCEEDED', {
        source: 'BillDetailScreen',
        queued: false,
      });
      navigateToBillsAfterDelete();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete bill.';
      setErrorMessage(message);
      trackObservabilityEvent('BILL_DETAIL_DELETE_FAILED', {
        source: 'BillDetailScreen',
        error: message,
      });
    } finally {
      setIsDeletingBill(false);
    }
  };
  const handleRefresh = useCallback(async () => {
    await runPullRefresh(async () => {
      await billQuery.refetch();
    });
  }, [billQuery, runPullRefresh]);

  const reminderModalCopy = reminderModalState
    ? getBillPaymentReminderModalCopy(reminderModalState)
    : null;
  const isReminderModalSending = reminderModalState?.outcome === 'sending';

  return (
    <FeatureDetailScreenScaffold
      headerScrollMode="fixed"
      keyboardAware
      onRefresh={handleRefresh}
      onBackPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.navigate('Bills');
      }}
      refreshing={isPullRefreshing}
      rightAccessory={
        bill ? (
          <View style={styles.headerRightRow}>
            {isCreator ? (
              <Pressable
                accessibilityLabel="Edit bill"
                accessibilityRole="button"
                onPress={() => {
                  trackObservabilityEvent('BILL_DETAIL_EDIT_TAPPED', {
                    source: 'BillDetailScreen',
                    status: bill.status,
                  });
                  navigation.navigate('CreateBill', { billId: bill.id });
                }}
                style={styles.headerEditButton}
                testID="bill-detail-edit-button"
              >
                <Ionicons color={theme.colors.text.primary} name="create-outline" size={16} />
              </Pressable>
            ) : null}
            <StatusPill
              label={bill.status === 'settled' ? 'Settled' : 'Active'}
              size="md"
              tone={bill.status === 'settled' ? 'success' : 'info'}
            />
          </View>
        ) : null
      }
      subtitle={bill ? formatBillCreatedLabel(bill.createdAt) : undefined}
      testID="bill-detail-screen"
      title={bill?.title ?? 'Bill Detail'}
    >
      <View style={styles.body}>
        {billQuery.isLoading ? (
          <View style={styles.skeletonGroup}>
            <Skeleton height={20} />
            <Skeleton height={120} />
            <Skeleton height={180} />
          </View>
        ) : null}

        {billQuery.isError ? (
          <ErrorState
            description="Could not load bill detail."
            onRetry={() => {
              void billQuery.refetch();
            }}
            title="Bill unavailable"
          />
        ) : null}

        {!billQuery.isLoading && !billQuery.isError && !bill ? (
          <EmptyState
            actionLabel="Back to Bills"
            onAction={() => {
              navigation.navigate('Bills');
            }}
            title="Bill not found"
          />
        ) : null}

        {!billQuery.isLoading && !billQuery.isError && bill ? (
          <>
            <PageErrorToast errorMessage={errorMessage} title="Bill update failed" />

            {isCreator ? (
              <Card style={styles.statusActionCard} tone={isBillSettled ? 'success' : 'info'}>
                <View style={styles.statusActionRow}>
                  <View style={styles.statusActionCopy}>
                    <Text variant="label">{isBillSettled ? 'Bill settled' : 'Bill active'}</Text>
                    <Text style={styles.statusActionHint} variant="metaRegular">
                      {isBillSettled
                        ? 'Reopen this bill to allow payment updates.'
                        : 'Settle this bill when all payments are complete.'}
                    </Text>
                  </View>
                  <Button
                    label={isBillSettled ? 'Reopen Bill' : 'Settle Bill'}
                    loading={isUpdatingBillStatus}
                    onPress={() => {
                      void changeBillStatus(isBillSettled ? 'open' : 'settled');
                    }}
                    style={styles.statusActionButton}
                    variant={isBillSettled ? 'secondary' : 'primary'}
                  />
                </View>
              </Card>
            ) : null}

            <Card style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <Ionicons color={theme.colors.text.secondary} name="receipt-outline" size={18} />
                <Text style={styles.sectionTitle} variant="sectionTitle">Summary</Text>
              </View>

              <View style={styles.summaryRows}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, styles.summaryLabelStrong]} variant="titleSmSemiBold">
                    Total Amount
                  </Text>
                  <Text style={styles.summaryValue} variant="titleSm">{formatCurrency(totals.total)}</Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel} variant="bodyLgComfortable">Tax</Text>
                  <Text style={styles.summaryValue} variant="bodyLgComfortable">{formatCurrency(bill.tax)}</Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel} variant="bodyLgComfortable">Tip</Text>
                  <Text style={styles.summaryValue} variant="bodyLgComfortable">{formatCurrency(bill.tip)}</Text>
                </View>

                {bill.fees > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel} variant="bodyLgComfortable">Fees</Text>
                    <Text style={styles.summaryValue} variant="bodyLgComfortable">{formatCurrency(bill.fees)}</Text>
                  </View>
                ) : null}

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel} variant="bodyLgComfortable">Split Type</Text>
                  <Text style={styles.summaryValue} variant="bodyLgComfortable">
                    {formatSplitTypeLabel(bill.splitMode, bill.extrasSplitMode)}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel} variant="bodyLgComfortable">Participants</Text>
                  <Text style={styles.summaryValue} variant="bodyLgComfortable">
                    {bill.participants.length} {bill.participants.length === 1 ? 'person' : 'people'}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel} variant="bodyLgComfortable">Paid</Text>
                  <Text style={styles.summaryValue} variant="bodyLgComfortable">
                    {paidCount} of {bill.participants.length}
                  </Text>
                </View>

                {customTipContributionTotal > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel} variant="bodyLgComfortable">Tip Allocation</Text>
                    <Text style={styles.summaryValue} variant="bodyLgComfortable">Custom by participant</Text>
                  </View>
                ) : null}

                {billSummary.youAreOwed > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel} variant="bodyLgComfortable">You're owed</Text>
                    <Text style={[styles.summaryValue, { color: theme.colors.text.success }]} variant="titleSm">
                      {formatCurrency(billSummary.youAreOwed)}
                    </Text>
                  </View>
                ) : null}

                {billSummary.youOwe > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel} variant="bodyLgComfortable">You owe</Text>
                    <Text style={[styles.summaryValue, { color: theme.colors.text.warning }]} variant="titleSm">
                      {formatCurrency(billSummary.youOwe)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text tone={totals.isValid ? 'success' : 'danger'}>
                {totals.isValid ? 'Totals match expected bill total.' : 'Totals mismatch detected.'}
              </Text>
            </Card>

            <Card style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <Ionicons color={theme.colors.text.secondary} name="people-outline" size={18} />
                <Text style={styles.sectionTitle} variant="sectionTitle">Participants</Text>
              </View>

              <OptionList style={styles.list}>
                {bill.participants.map((participant, index) => {
                  const isCurrentUser = participant.userId === user?.id;
                  const isOrganizer = participant.userId === bill.createdByUserId;
                  const displayName = isCurrentUser ? 'You' : sanitizeParticipantDisplayName(participant.name);
                  const subtitleParts = [formatCurrency(participant.amountOwed)];
                  if (isOrganizer) {
                    subtitleParts.push('Organizer');
                  }
                  if ((participant.customTipContribution ?? 0) > 0) {
                    subtitleParts.push(`Tip ${formatCurrency(participant.customTipContribution ?? 0)}`);
                  }

                  const creatorCanMarkPaid = Boolean(
                    isCreator && !isBillSettled && participant.paidStatus === 'pending',
                  );
                  const creatorCanMarkUnpaid = Boolean(
                    isCreator && !isBillSettled && participant.paidStatus === 'paid',
                  );
                  const participantCanMarkSelfPaid = Boolean(
                    !isCreator && isCurrentUser && !isBillSettled && participant.paidStatus === 'pending',
                  );
                  const canUpdateStatus = creatorCanMarkPaid || creatorCanMarkUnpaid || participantCanMarkSelfPaid;
                  const nextPaidStatus: BillParticipantRecord['paidStatus'] =
                    participant.paidStatus === 'paid' ? 'pending' : 'paid';
                  const actionLabel = nextPaidStatus === 'paid' ? 'Mark Paid' : 'Mark Unpaid';
                  const isMarkUnpaidAction = nextPaidStatus === 'pending';
                  const isUpdatingParticipant = updatingParticipantId === participant.id;
                  const canShowReminderAction = Boolean(
                    isCreator &&
                      !isBillSettled &&
                      !isCurrentUser &&
                      participant.userId &&
                      participant.paidStatus === 'pending' &&
                      participant.amountOwed > 0,
                  );
                  const canSendReminder = Boolean(
                    canShowReminderAction && participant.paymentReminderAvailable === true,
                  );
                  const isReminderInCooldown = Boolean(
                    canShowReminderAction && participant.paymentReminderAvailable === false,
                  );
                  const isSendingReminder = remindingParticipantId === participant.id;
                  const statusPill = (
                    <StatusPill
                      label={participant.paidStatus === 'paid' ? 'Paid' : 'Pending'}
                      tone={participant.paidStatus === 'paid' ? 'success' : 'warning'}
                    />
                  );

                  return (
                    <OptionListRow
                      isLast={index === bill.participants.length - 1}
                      key={participant.id}
                      titleAccessory={statusPill}
                      rightAccessory={
                        canUpdateStatus || canShowReminderAction ? (
                          <View style={styles.participantActions}>
                            {canUpdateStatus ? (
                              <Pressable
                                accessibilityLabel={actionLabel}
                                accessibilityRole="button"
                                disabled={isUpdatingParticipant}
                                onPress={() => {
                                  void updateParticipantPaidStatus(participant.id, nextPaidStatus);
                                }}
                                style={({ pressed }) => [
                                  styles.participantActionPill,
                                  nextPaidStatus === 'paid'
                                    ? styles.participantActionPillPositive
                                    : styles.participantActionPillSecondary,
                                  pressed && !isUpdatingParticipant ? styles.participantActionPillPressed : null,
                                  isUpdatingParticipant ? styles.participantActionPillDisabled : null,
                                ]}
                              >
                                <Text
                                  style={[
                                    isMarkUnpaidAction
                                      ? styles.participantActionLabelSecondary
                                      : styles.participantActionLabel,
                                  ]}
                                  variant={isMarkUnpaidAction ? 'bodySmTightSemiBold' : 'bodySmTightBold'}
                                >
                                  {isUpdatingParticipant ? 'Updating...' : actionLabel}
                                </Text>
                              </Pressable>
                            ) : null}

                            {canShowReminderAction ? (
                              <Pressable
                                accessibilityLabel={
                                  isReminderInCooldown ? `${displayName} reminded` : `Remind ${displayName}`
                                }
                                accessibilityRole="button"
                                disabled={isReminderInCooldown || isSendingReminder || !isOnline}
                                onPress={() => {
                                  if (!canSendReminder) {
                                    return;
                                  }
                                  void remindParticipant(participant);
                                }}
                                style={({ pressed }) => [
                                  styles.participantActionPill,
                                  styles.participantActionPillSecondary,
                                  pressed && canSendReminder && !isSendingReminder && isOnline
                                    ? styles.participantActionPillPressed
                                    : null,
                                  isReminderInCooldown || isSendingReminder || !isOnline
                                    ? styles.participantActionPillDisabled
                                    : null,
                                ]}
                                testID={`bill-participant-reminder-${participant.id}`}
                              >
                                <Text style={styles.participantReminderLabel} variant="bodySmTightSemiBold">
                                  {isSendingReminder ? 'Sending...' : isReminderInCooldown ? 'Reminded' : 'Remind'}
                                </Text>
                              </Pressable>
                            ) : null}
                          </View>
                        ) : null
                      }
                      subtitle={subtitleParts.join(' • ')}
                      title={displayName}
                    />
                  );
                })}
              </OptionList>

              {isBillSettled ? (
                <Text style={styles.sectionHint} variant="metaRegular">
                  This bill is settled. Reopen it if you need to make updates.
                </Text>
              ) : null}
            </Card>

            <Card style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <Ionicons color={theme.colors.text.secondary} name="cash-outline" size={18} />
                <Text style={styles.sectionTitle} variant="sectionTitle">Items</Text>
              </View>

              {bill.items.length > 0 ? (
                <OptionList style={styles.list}>
                  {bill.items.map((item, index) => {
                    const assignedParticipantNames = item.assignedToParticipantIds
                      .map((participantId) => participantNameLookup.get(participantId) ?? 'Member');
                    const assignedCount = assignedParticipantNames.length;

                    let assignmentText = `Simple split • ${item.splitMode === 'advanced' ? 'advanced config missing' : 'not assigned'}`;
                    if (item.splitMode === 'advanced' && item.splitConfig && item.splitConfig.length > 0) {
                      const splitDetails = item.splitConfig
                        .map((split) => {
                          const participantName = participantNameLookup.get(split.participantId) ?? 'Member';
                          return `${participantName} ${formatComplexSplitValue(split.type, split.value)}`;
                        })
                        .join(' • ');
                      assignmentText = `Complex split • ${splitDetails}`;
                    } else if (assignedCount === 1) {
                      assignmentText = `Simple split • ${assignedParticipantNames[0] ?? '1 person'}`;
                    } else if (assignedCount === bill.participants.length) {
                      assignmentText = 'Simple split • shared by everyone';
                    } else if (assignedCount > 1) {
                      assignmentText = `Simple split • ${assignedParticipantNames.join(', ')}`;
                    }

                    return (
                      <OptionListRow
                        isLast={index === bill.items.length - 1}
                        key={item.id}
                        rightAccessory={<Text style={styles.itemPrice} variant="labelMdBold">{formatCurrency(item.price)}</Text>}
                        subtitle={assignmentText}
                        title={item.itemName}
                      />
                    );
                  })}
                </OptionList>
              ) : (
                <Text style={styles.sectionHint} variant="metaRegular">No items have been added yet.</Text>
              )}
            </Card>

            {isCreator ? (
              <Button
                label="Delete Bill"
                onPress={() => {
                  trackObservabilityEvent('BILL_DETAIL_DELETE_TAPPED', {
                    source: 'BillDetailScreen',
                    status: bill.status,
                  });
                  setIsDeleteConfirmVisible(true);
                }}
                style={[styles.deleteTriggerButton, styles.destructiveButton]}
              />
            ) : null}
          </>
        ) : null}
      </View>

      <ConfirmDestructiveModal
        cancelLabel="Keep Bill"
        confirmLabel="Delete Bill"
        confirmLoadingLabel="Deleting..."
        description="Delete this bill permanently? This action cannot be undone."
        loading={isDeletingBill}
        onCancel={() => {
          if (isDeletingBill) {
            return;
          }
          setIsDeleteConfirmVisible(false);
        }}
        onConfirm={() => {
          void handleDeleteBill();
        }}
        title="Delete Bill?"
        visible={isDeleteConfirmVisible}
      />
      <Modal
        description={reminderModalCopy?.description}
        onRequestClose={() => {
          if (isReminderModalSending) {
            return;
          }
          setReminderModalState(null);
        }}
        primaryAction={
          reminderModalCopy?.actionLabel
            ? {
                label: reminderModalCopy.actionLabel,
                onPress: () => {
                  setReminderModalState(null);
                },
                testID: 'bill-payment-reminder-result-done',
              }
            : undefined
        }
        testID="bill-payment-reminder-result-modal"
        title={reminderModalCopy?.title}
        visible={reminderModalState !== null}
      >
        {isReminderModalSending ? (
          <Text style={styles.reminderModalStatus} variant="bodySm">
            Sending reminder...
          </Text>
        ) : null}
      </Modal>
    </FeatureDetailScreenScaffold>
  );
}
