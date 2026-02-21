import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
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
  deleteBill,
  getBillById,
  markBillParticipantPaid,
  updateBill,
  type BillParticipantRecord,
  type BillRecord,
} from '../features';
import { formatCurrency, validateBillTotal } from '../features/bills/billCalculations';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
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

export function BillDetailScreen({ navigation, route }: BillDetailScreenProps) {
  const { billId } = route.params;
  const theme = useTheme();
  const { user } = useAuth();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();

  const billQuery = useQuery({
    queryKey: ['feature', 'bill', billId],
    queryFn: () => getBillById(billId),
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUpdatingBillStatus, setIsUpdatingBillStatus] = useState(false);
  const [updatingParticipantId, setUpdatingParticipantId] = useState<string | null>(null);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const [isDeletingBill, setIsDeletingBill] = useState(false);

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

  const styles = StyleSheet.create({
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
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 24,
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
      fontSize: 13,
      lineHeight: 18,
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
      fontSize: 16,
      lineHeight: 22,
    },
    summaryLabelStrong: {
      color: theme.colors.text.primary,
      fontWeight: '600',
    },
    summaryValue: {
      color: theme.colors.text.primary,
      fontSize: 16,
      lineHeight: 22,
      marginLeft: theme.spacing.sm,
      textAlign: 'right',
    },
    summaryValueStrong: {
      fontWeight: '700',
    },
    list: {
      borderColor: theme.colors.border.subtle,
    },
    participantActionPill: {
      alignItems: 'center',
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      minHeight: 32,
      paddingHorizontal: theme.spacing.sm,
      justifyContent: 'center',
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
    participantActionLabel: {
      color: theme.colors.text.success,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    participantActionLabelSecondary: {
      color: theme.colors.text.secondary,
      fontWeight: '600',
    },
    itemPrice: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 18,
    },
    sectionHint: {
      color: theme.colors.text.muted,
      fontSize: 13,
      lineHeight: 18,
    },
    destructiveButton: {
      backgroundColor: theme.colors.text.danger,
    },
    deleteTriggerButton: {
      minHeight: 36,
      width: '100%',
      paddingHorizontal: theme.spacing.md,
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
  });

  const refreshBill = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['feature', 'bills'] }),
      queryClient.invalidateQueries({ queryKey: ['feature', 'bill', billId] }),
    ]);
  };

  const changeBillStatus = async (nextStatus: BillRecord['status']) => {
    if (!bill || !isCreator) {
      return;
    }

    setErrorMessage(null);
    setIsUpdatingBillStatus(true);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('bill.status.toggle', {
          billId,
          status: nextStatus,
        });
        await refreshBill();
        Alert.alert('Saved Offline', 'Bill status update queued and will sync when you reconnect.');
        return;
      }

      await queueWrite('bill.status.toggle');
      await updateBill(billId, {
        status: nextStatus,
      });
      await refreshBill();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update bill status.';
      setErrorMessage(message);
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
    setUpdatingParticipantId(participantId);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('bill.participant.toggle-paid', {
          billId,
          participantId,
          paidStatus: nextPaidStatus,
        });
        await refreshBill();
        Alert.alert('Saved Offline', 'Payment status update queued and will sync when you reconnect.');
        return;
      }

      await queueWrite('bill.participant.toggle-paid');
      await markBillParticipantPaid(billId, participantId, nextPaidStatus);
      await refreshBill();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update paid status.';
      setErrorMessage(message);
    } finally {
      setUpdatingParticipantId(null);
    }
  };

  const handleDeleteBill = async () => {
    if (!bill || !isCreator) {
      return;
    }

    setErrorMessage(null);
    setIsDeletingBill(true);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('bill.delete', { billId: bill.id });
        await queryClient.invalidateQueries({ queryKey: ['feature', 'bills'] });
        queryClient.removeQueries({ queryKey: ['feature', 'bill', bill.id] });
        Alert.alert('Saved Offline', 'Bill delete queued and will sync when you reconnect.');
        navigation.navigate('Bills');
        return;
      }

      await queueWrite('bill.delete');
      await deleteBill(bill.id);
      await queryClient.invalidateQueries({ queryKey: ['feature', 'bills'] });
      queryClient.removeQueries({ queryKey: ['feature', 'bill', bill.id] });
      navigation.navigate('Bills');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete bill.';
      setErrorMessage(message);
    } finally {
      setIsDeletingBill(false);
    }
  };

  return (
    <FeatureDetailScreenScaffold
      keyboardAware
      onBackPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.navigate('Bills');
      }}
      rightAccessory={
        bill ? (
          <View style={styles.headerRightRow}>
            {isCreator ? (
              <Pressable
                accessibilityLabel="Edit bill"
                accessibilityRole="button"
                onPress={() => {
                  navigation.navigate('CreateBill', { billId: bill.id });
                }}
                style={styles.headerEditButton}
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
                    <Text style={styles.statusActionHint}>
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
                <Text style={styles.sectionTitle}>Summary</Text>
              </View>

              <View style={styles.summaryRows}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, styles.summaryLabelStrong]}>Total Amount</Text>
                  <Text style={[styles.summaryValue, styles.summaryValueStrong]}>{formatCurrency(totals.total)}</Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Tax</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(bill.tax)}</Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Tip</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(bill.tip)}</Text>
                </View>

                {bill.fees > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Fees</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(bill.fees)}</Text>
                  </View>
                ) : null}

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Split Type</Text>
                  <Text style={styles.summaryValue}>
                    {formatSplitTypeLabel(bill.splitMode, bill.extrasSplitMode)}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Participants</Text>
                  <Text style={styles.summaryValue}>
                    {bill.participants.length} {bill.participants.length === 1 ? 'person' : 'people'}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Paid</Text>
                  <Text style={styles.summaryValue}>
                    {paidCount} of {bill.participants.length}
                  </Text>
                </View>

                {customTipContributionTotal > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Tip Allocation</Text>
                    <Text style={styles.summaryValue}>Custom by participant</Text>
                  </View>
                ) : null}

                {billSummary.youAreOwed > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>You're owed</Text>
                    <Text style={[styles.summaryValue, { color: theme.colors.text.success, fontWeight: '700' }]}>
                      {formatCurrency(billSummary.youAreOwed)}
                    </Text>
                  </View>
                ) : null}

                {billSummary.youOwe > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>You owe</Text>
                    <Text style={[styles.summaryValue, { color: theme.colors.text.warning, fontWeight: '700' }]}>
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
                <Text style={styles.sectionTitle}>Participants</Text>
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
                        canUpdateStatus ? (
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
                                styles.participantActionLabel,
                                isMarkUnpaidAction ? styles.participantActionLabelSecondary : null,
                              ]}
                            >
                              {isUpdatingParticipant ? 'Updating...' : actionLabel}
                            </Text>
                          </Pressable>
                        ) : null
                      }
                      subtitle={subtitleParts.join(' • ')}
                      title={displayName}
                    />
                  );
                })}
              </OptionList>

              {isBillSettled ? (
                <Text style={styles.sectionHint}>This bill is settled. Reopen it if you need to make updates.</Text>
              ) : null}
            </Card>

            <Card style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <Ionicons color={theme.colors.text.secondary} name="cash-outline" size={18} />
                <Text style={styles.sectionTitle}>Items</Text>
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
                        rightAccessory={<Text style={styles.itemPrice}>{formatCurrency(item.price)}</Text>}
                        subtitle={assignmentText}
                        title={item.itemName}
                      />
                    );
                  })}
                </OptionList>
              ) : (
                <Text style={styles.sectionHint}>No items have been added yet.</Text>
              )}
            </Card>

            {isCreator ? (
              <Button
                label="Delete Bill"
                onPress={() => {
                  setIsDeleteConfirmVisible(true);
                }}
                style={[styles.deleteTriggerButton, styles.destructiveButton]}
              />
            ) : null}
          </>
        ) : null}
      </View>

      <Modal
        description="Delete this bill permanently? This action cannot be undone."
        onRequestClose={() => {
          if (isDeletingBill) {
            return;
          }
          setIsDeleteConfirmVisible(false);
        }}
        primaryAction={{
          label: isDeletingBill ? 'Deleting...' : 'Delete Bill',
          onPress: () => {
            void handleDeleteBill();
          },
          disabled: isDeletingBill,
          loading: isDeletingBill,
        }}
        secondaryAction={{
          label: 'Keep Bill',
          onPress: () => {
            setIsDeleteConfirmVisible(false);
          },
          disabled: isDeletingBill,
        }}
        title="Delete Bill?"
        visible={isDeleteConfirmVisible}
      />
    </FeatureDetailScreenScaffold>
  );
}
