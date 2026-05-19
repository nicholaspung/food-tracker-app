import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  ConfirmDestructiveModal,
  FeatureFormScreenScaffold,
  OptionList,
  OptionListInlineBody,
  OptionListRow,
  PageErrorToast,
  SegmentedControl,
  StatusPill,
} from '../components/shared';
import {
  createEntityId,
  type FriendRecord,
} from '../features';
import {
  formatCurrency,
  validateBillTotal,
} from '../features/bills/billCalculations';
import { useBillWrites } from '../features/store/useBillWrites';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Card, Input, Text } from '../ui';
import { BillParticipantPickerSection } from './createBill/BillParticipantPickerSection';
import { BillPayerAndTotalsSection } from './createBill/BillPayerAndTotalsSection';
import {
  areStringArraysEqual,
  buildBillDraftSubmission,
  buildDefaultAdvancedSplits,
  calculateSuggestedBillAmounts,
  formatPercentageDisplay,
  getAdvancedSplitRawValue,
  inferEditSplitMode,
  isAdvancedSplitLocked,
  redistributeAdvancedSplits,
  resolveSplitTarget,
  roundToCurrency,
  sanitizeParticipantName,
  setAdvancedSplitLocked,
  setAdvancedSplitRawValue,
  toCurrencyInput,
  type CreateBillSplitMode,
  type DraftAdvancedSplitEntry,
  type DraftAdvancedSplitType,
  type DraftBillItem,
  type DraftCustomParticipant,
  type OwedAmountEntry,
} from './createBill/shared';
import { useCreateBillParticipantsController } from './createBill/useCreateBillParticipantsController';

type CreateBillScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateBill'>;
type CreateBillExitMethod =
  | 'header_back'
  | 'secondary_cancel'
  | 'system_back_or_gesture'
  | 'programmatic_navigation';

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
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
  sectionHint: {
    color: theme.colors.text.muted,
  },
  itemComposerRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  itemNameInput: {
    flex: 1,
  },
  itemPriceInput: {
    width: 110,
  },
  addItemButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.button.primaryBg,
    borderRadius: theme.radii.md,
    justifyContent: 'center',
    minHeight: theme.sizes.inputMinHeight,
    paddingHorizontal: theme.spacing.sm,
  },
  addItemButtonDisabled: {
    backgroundColor: theme.colors.button.primaryDisabledBg,
  },
  addItemButtonLabel: {
    color: theme.colors.text.inverse,
  },
  itemsList: {
    borderColor: theme.colors.border.subtle,
  },
  itemRowAccessory: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  itemPrice: {
    color: theme.colors.text.primary,
  },
  removeItemButton: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    justifyContent: 'center',
    padding: 2,
  },
  itemSplitBody: {
    gap: theme.spacing.sm,
  },
  itemSplitModeRow: {
    gap: theme.spacing.xs,
  },
  itemSplitTypeRow: {
    gap: theme.spacing.xs,
  },
  splitControl: {
    alignSelf: 'flex-start',
  },
  assignmentChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  assignmentChip: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
  },
  assignmentChipSelected: {
    backgroundColor: theme.colors.fill.brand,
    borderColor: theme.colors.fill.brand,
  },
  assignmentChipLabel: {
    color: theme.colors.text.secondary,
  },
  assignmentChipLabelSelected: {
    color: theme.colors.text.inverse,
  },
  advancedSplitValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  advancedSplitLabel: {
    color: theme.colors.text.primary,
    flex: 1,
  },
  advancedSplitInput: {
    width: 120,
  },
  advancedSplitControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  splitLockButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  splitLockButtonLocked: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.info,
  },
  tripleInputRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  tripleInputItem: {
    flex: 1,
  },
  customTipToggle: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.xxs,
    paddingVertical: theme.spacing.xxs,
  },
  customTipToggleLabel: {
    color: theme.colors.text.info,
  },
  customTipEditor: {
    borderColor: theme.colors.border.info,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  customTipHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  selectedFriendsSummary: {
    color: theme.colors.text.secondary,
  },
  friendRowSelected: {
    backgroundColor: theme.colors.status.infoBg,
  },
  friendSearchInput: {
    marginTop: theme.spacing.xs,
  },
  loadMoreButton: {
    marginTop: theme.spacing.xs,
  },
  subsectionWrap: {
    gap: theme.spacing.xs,
  },
  subsectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  subsectionTitle: {
    color: theme.colors.text.primary,
  },
  payerSection: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.info,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
  },
  payerDropdownTrigger: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: theme.sizes.inputMinHeight,
    paddingHorizontal: theme.spacing.md,
  },
  payerDropdownTriggerOpen: {
    borderColor: theme.colors.border.strong,
  },
  payerDropdownLabel: {
    color: theme.colors.text.primary,
    flex: 1,
  },
  payerOptionsList: {
    borderColor: theme.colors.border.info,
  },
  owedSection: {
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  owedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  owedParticipantInfo: {
    flex: 1,
    gap: 2,
  },
  owedParticipantTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  owedAmountInput: {
    width: 120,
  },
  owedAmountValue: {
    color: theme.colors.text.primary,
    textAlign: 'right',
    width: 120,
  },
  totalsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalsRowStrong: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalsLabel: {
    color: theme.colors.text.secondary,
  },
  totalsLabelStrong: {
    color: theme.colors.text.primary,
  },
  totalsValue: {
    color: theme.colors.text.primary,
  },
  totalsValueStrong: {
    color: theme.colors.text.primary,
  },
  totalsPanel: {
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
  },
  totalsPanelMatch: {
    backgroundColor: theme.colors.status.successBg,
    borderColor: theme.colors.border.success,
  },
  totalsPanelMismatch: {
    backgroundColor: theme.colors.status.warningBg,
    borderColor: theme.colors.border.warning,
  },
  totalsPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalsDivider: {
    borderTopColor: theme.colors.border.subtle,
    borderTopWidth: 1,
    marginVertical: theme.spacing.xxs,
  },
  loadingRow: {
    gap: theme.spacing.xs,
  },
}));

export function CreateBillScreen({ navigation, route }: CreateBillScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const billWrites = useBillWrites();
  const { isOnline } = useConnectivity();
  const editBillId = route.params?.billId;
  const isEditMode = Boolean(editBillId);

  const [splitMode, setSplitMode] = useState<CreateBillSplitMode>('equal');
  const [billTitle, setBillTitle] = useState('');
  const [equalTotalInput, setEqualTotalInput] = useState('');
  const [draftItemName, setDraftItemName] = useState('');
  const [draftItemPrice, setDraftItemPrice] = useState('');
  const [items, setItems] = useState<DraftBillItem[]>([]);
  const [expandedItemIds, setExpandedItemIds] = useState<string[]>([]);
  const [taxInput, setTaxInput] = useState('');
  const [tipInput, setTipInput] = useState('');
  const [feesInput, setFeesInput] = useState('');
  const [finalTotalInput, setFinalTotalInput] = useState('');
  const [isCustomTipEnabled, setIsCustomTipEnabled] = useState(false);
  const [customTipSplitType, setCustomTipSplitType] = useState<DraftAdvancedSplitType>('amount');
  const [customTipSplits, setCustomTipSplits] = useState<DraftAdvancedSplitEntry[]>([]);
  const [owedAmountOverrides, setOwedAmountOverrides] = useState<Record<string, string>>({});
  const [participantRecordIdByDraftId, setParticipantRecordIdByDraftId] = useState<Record<string, string>>({});
  const [isEditHydrated, setIsEditHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<DraftBillItem | null>(null);
  const hasTrackedFlowOpenRef = useRef(false);
  const hasTrackedFlowExitRef = useRef(false);
  const hasCompletedFlowRef = useRef(false);
  const exitMethodRef = useRef<CreateBillExitMethod | null>(null);

  const currentUserName = sanitizeParticipantName(
    user?.name?.trim() || user?.email?.split('@')[0] || 'You',
    'You',
  );
  const currentUserDraftId = user?.id ? `user:${user.id}` : 'user:self';
  const {
    acceptedFriends,
    billQuery,
    customParticipants,
    friendSearchQuery,
    friendsQuery,
    hasBlockingFriendsError,
    hasFriendsRefreshError,
    isPayerDropdownOpen,
    normalizedFriendSearchQuery,
    participants,
    payerParticipantId,
    selectedFriendIds,
    shouldShowFriendSearch,
    totalAcceptedFriends,
    visibleFriends,
    setFriendSearchQuery,
    setIsPayerDropdownOpen,
    setPayerParticipantId,
    setCustomParticipants,
    setSelectedFriendIds,
  } = useCreateBillParticipantsController({
    currentUserDraftId,
    currentUserId: user?.id,
    currentUserName,
    editBillId,
    isEditMode,
  });
  const acceptedFriendById = useMemo(
    () => new Map(acceptedFriends.map((friend) => [friend.id, friend])),
    [acceptedFriends],
  );
  const selectedFriends = useMemo(
    () =>
      selectedFriendIds
        .map((friendId) => acceptedFriendById.get(friendId))
        .filter((friend): friend is FriendRecord => Boolean(friend)),
    [acceptedFriendById, selectedFriendIds],
  );

  const billNumericInputProps = {
    showInlineKeyboardDismissButton: false,
    useDefaultReturnKeyType: false,
  } as const;
  const isEqualSplitMode = splitMode === 'equal';
  const isCustomSplitMode = splitMode === 'custom';
  const isManualSplitMode = splitMode === 'manual';
  const extrasSplitMode: 'equal' | 'proportional' = isCustomSplitMode ? 'proportional' : 'equal';

  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    setSplitMode('equal');
    setBillTitle('');
    setEqualTotalInput('');
    setDraftItemName('');
    setDraftItemPrice('');
    setItems([]);
    setExpandedItemIds([]);
    setTaxInput('');
    setTipInput('');
    setFeesInput('');
    setFinalTotalInput('');
    setIsCustomTipEnabled(false);
    setCustomTipSplitType('amount');
    setCustomTipSplits([]);
    setOwedAmountOverrides({});
    setParticipantRecordIdByDraftId({});
    setErrorMessage(null);
    setIsEditHydrated(false);
  }, [editBillId, isEditMode]);

  useEffect(() => {
    if (!isEditMode || isEditHydrated) {
      return;
    }

    if (friendsQuery.isLoading || billQuery.isLoading) {
      return;
    }

    const bill = billQuery.data;
    if (!bill) {
      setErrorMessage('Bill could not be loaded for editing.');
      setIsEditHydrated(true);
      return;
    }

    const friendByUserId = new Map(
      acceptedFriends
        .filter((friend) => Boolean(friend.userId?.trim()))
        .map((friend) => [friend.userId as string, friend]),
    );
    const nextSelectedFriendIds: string[] = [];
    const nextCustomParticipants: DraftCustomParticipant[] = [];
    const draftIdByParticipantRecordId = new Map<string, string>();
    const nextParticipantRecordIdByDraftId: Record<string, string> = {};
    const nextOwedOverrides: Record<string, string> = {};
    let paidDraftParticipantId = '';

    bill.participants.forEach((participant, participantIndex) => {
      let draftParticipantId = '';
      if (participant.userId && participant.userId === user?.id) {
        draftParticipantId = currentUserDraftId;
      } else if (participant.userId) {
        const friend = friendByUserId.get(participant.userId);
        if (friend) {
          if (!nextSelectedFriendIds.includes(friend.id)) {
            nextSelectedFriendIds.push(friend.id);
          }
          draftParticipantId = `user:${friend.id}`;
        }
      }

      if (!draftParticipantId) {
        draftParticipantId = `custom:${participant.id}`;
        nextCustomParticipants.push({
          id: draftParticipantId,
          name: sanitizeParticipantName(participant.name, `Person ${participantIndex + 1}`),
          userId: participant.userId?.trim() || undefined,
        });
      }

      draftIdByParticipantRecordId.set(participant.id, draftParticipantId);
      nextParticipantRecordIdByDraftId[draftParticipantId] = participant.id;
      nextOwedOverrides[draftParticipantId] = toCurrencyInput(roundToCurrency(participant.amountOwed));

      if (!paidDraftParticipantId && participant.paidStatus === 'paid') {
        paidDraftParticipantId = draftParticipantId;
      }
    });

    const inferredSplitMode = inferEditSplitMode(bill);
    const resolvedDraftParticipantIds = Array.from(
      new Set(Array.from(draftIdByParticipantRecordId.values())),
    );
    const computedCustomTotal = roundToCurrency(
      bill.items.reduce((sum, item) => sum + item.price, 0) + bill.tax + bill.tip + bill.fees,
    );
    const totalAmount = roundToCurrency(bill.totalAmount ?? computedCustomTotal);

    const nextDraftItems: DraftBillItem[] =
      inferredSplitMode === 'custom'
        ? bill.items.map((item, itemIndex) => {
            const itemPrice = roundToCurrency(item.price);
            const assignedDraftParticipantIds = item.assignedToParticipantIds
              .map((participantRecordId) => draftIdByParticipantRecordId.get(participantRecordId))
              .filter((candidate): candidate is string => Boolean(candidate));

            if (item.splitMode === 'advanced' && item.splitConfig && item.splitConfig.length > 0) {
              const advancedSplitType = item.splitConfig[0]?.type === 'amount' ? 'amount' : 'percentage';
              const advancedSplits = item.splitConfig
                .map((split) => {
                  const draftParticipantId = draftIdByParticipantRecordId.get(split.participantId);
                  if (!draftParticipantId) {
                    return null;
                  }

                  const amountValue =
                    split.type === 'amount'
                      ? roundToCurrency(split.value)
                      : roundToCurrency(itemPrice * (split.value / 100));
                  const percentageValue =
                    split.type === 'percentage'
                      ? roundToCurrency(split.value)
                      : itemPrice > 0
                        ? roundToCurrency((split.value / itemPrice) * 100)
                        : 0;

                  return {
                    participantId: draftParticipantId,
                    percentageValue: toCurrencyInput(percentageValue),
                    amountValue: toCurrencyInput(amountValue),
                    percentageLocked: false,
                    amountLocked: false,
                  };
                })
                .filter((candidate): candidate is DraftAdvancedSplitEntry => candidate !== null);
              const normalizedAdvancedSplits =
                advancedSplits.length > 0
                  ? advancedSplits
                  : buildDefaultAdvancedSplits(assignedDraftParticipantIds, itemPrice);

              return {
                id: item.id || createEntityId('bill_item_draft'),
                name: item.itemName.trim() || `Item ${itemIndex + 1}`,
                price: toCurrencyInput(itemPrice),
                splitMode: 'advanced',
                assignedParticipantIds: Array.from(
                  new Set(normalizedAdvancedSplits.map((split) => split.participantId)),
                ),
                advancedSplitType,
                advancedSplits: normalizedAdvancedSplits,
              };
            }

            return {
              id: item.id || createEntityId('bill_item_draft'),
              name: item.itemName.trim() || `Item ${itemIndex + 1}`,
              price: toCurrencyInput(itemPrice),
              splitMode: 'simple',
              assignedParticipantIds:
                assignedDraftParticipantIds.length > 0 ? assignedDraftParticipantIds : [...resolvedDraftParticipantIds],
              advancedSplitType: 'percentage',
              advancedSplits: [],
            };
          })
        : [];

    const hasCustomTipContributions = bill.participants.some(
      (participant) => (participant.customTipContribution ?? 0) > 0,
    );
    const nextCustomTipSplits: DraftAdvancedSplitEntry[] = hasCustomTipContributions
      ? bill.participants
          .map((participant) => {
            const draftParticipantId = draftIdByParticipantRecordId.get(participant.id);
            if (!draftParticipantId) {
              return null;
            }

            const tipAmount = roundToCurrency(participant.customTipContribution ?? 0);
            const tipPercentage =
              bill.tip > 0 ? roundToCurrency((tipAmount / roundToCurrency(bill.tip)) * 100) : 0;

            return {
              participantId: draftParticipantId,
              percentageValue: toCurrencyInput(tipPercentage),
              amountValue: toCurrencyInput(tipAmount),
              percentageLocked: false,
              amountLocked: false,
            };
          })
          .filter((candidate): candidate is DraftAdvancedSplitEntry => candidate !== null)
      : [];

    setSplitMode(inferredSplitMode);
    setBillTitle(bill.title);
    setSelectedFriendIds(nextSelectedFriendIds);
    setCustomParticipants(nextCustomParticipants);
    setFriendSearchQuery('');
    setEqualTotalInput(toCurrencyInput(totalAmount));
    setDraftItemName('');
    setDraftItemPrice('');
    setItems(nextDraftItems);
    setExpandedItemIds([]);
    setTaxInput(bill.tax > 0 ? toCurrencyInput(roundToCurrency(bill.tax)) : '');
    setTipInput(bill.tip > 0 ? toCurrencyInput(roundToCurrency(bill.tip)) : '');
    setFeesInput(bill.fees > 0 ? toCurrencyInput(roundToCurrency(bill.fees)) : '');
    setFinalTotalInput(
      inferredSplitMode === 'custom' && Math.abs(totalAmount - computedCustomTotal) > 0.01
        ? toCurrencyInput(totalAmount)
        : '',
    );
    setIsCustomTipEnabled(inferredSplitMode === 'custom' && hasCustomTipContributions);
    setCustomTipSplitType('amount');
    setCustomTipSplits(nextCustomTipSplits);
    setPayerParticipantId(paidDraftParticipantId || currentUserDraftId);
    setIsPayerDropdownOpen(false);
    setOwedAmountOverrides(nextOwedOverrides);
    setParticipantRecordIdByDraftId(nextParticipantRecordIdByDraftId);
    setErrorMessage(null);
    setIsEditHydrated(true);
  }, [
    acceptedFriends,
    billQuery.data,
    billQuery.isLoading,
    currentUserDraftId,
    friendsQuery.isLoading,
    isEditHydrated,
    isEditMode,
    setFriendSearchQuery,
    setCustomParticipants,
    setIsPayerDropdownOpen,
    setPayerParticipantId,
    setSelectedFriendIds,
    user?.id,
  ]);

  const parsedTax = useMemo(() => Number(taxInput || '0'), [taxInput]);
  const parsedTip = useMemo(() => Number(tipInput || '0'), [tipInput]);
  const parsedFees = useMemo(() => Number(feesInput || '0'), [feesInput]);
  const parsedFinalTotal = useMemo(() => Number(finalTotalInput || '0'), [finalTotalInput]);
  const parsedEqualTotal = useMemo(() => Number(equalTotalInput || '0'), [equalTotalInput]);
  const normalizedTax = Number.isFinite(parsedTax) ? parsedTax : 0;
  const normalizedTip = Number.isFinite(parsedTip) ? parsedTip : 0;
  const normalizedFees = Number.isFinite(parsedFees) ? parsedFees : 0;
  const distributableExtrasTotal = useMemo(
    () => normalizedTax + normalizedFees + (isCustomTipEnabled ? 0 : normalizedTip),
    [isCustomTipEnabled, normalizedFees, normalizedTax, normalizedTip],
  );

  const participantIds = useMemo(
    () => participants.map((participant) => participant.id),
    [participants],
  );

  useEffect(() => {
    if (isEditMode && !isEditHydrated) {
      return;
    }

    const participantIdSet = new Set(participantIds);

    setItems((currentItems) => {
      let didChange = false;
      const nextItems = currentItems.map((item) => {
        const filteredAssignedIds = item.assignedParticipantIds.filter((participantId) =>
          participantIdSet.has(participantId),
        );
        const filteredAdvancedSplits = item.advancedSplits.filter((split) =>
          participantIdSet.has(split.participantId),
        );

        const normalizedAssignedIds = filteredAssignedIds;
        const normalizedSplitMode = item.splitMode;
        const normalizedAdvancedSplits = filteredAdvancedSplits;

        const assignedChanged = !areStringArraysEqual(item.assignedParticipantIds, normalizedAssignedIds);
        const splitModeChanged = item.splitMode !== normalizedSplitMode;
        const advancedSplitsChanged =
          item.advancedSplits.length !== normalizedAdvancedSplits.length ||
          item.advancedSplits.some((split, index) => {
            const nextSplit = normalizedAdvancedSplits[index];
            return (
              !nextSplit ||
              nextSplit.participantId !== split.participantId ||
              nextSplit.percentageValue !== split.percentageValue ||
              nextSplit.amountValue !== split.amountValue
            );
          });

        if (!assignedChanged && !splitModeChanged && !advancedSplitsChanged) {
          return item;
        }

        didChange = true;
        return {
          ...item,
          splitMode: normalizedSplitMode,
          assignedParticipantIds: normalizedAssignedIds,
          advancedSplits: normalizedAdvancedSplits,
        };
      });

      return didChange ? nextItems : currentItems;
    });
  }, [isEditHydrated, isEditMode, participantIds]);

  useEffect(() => {
    if (!isCustomSplitMode) {
      setExpandedItemIds([]);
    }
  }, [isCustomSplitMode]);

  useEffect(() => {
    const participantIdSet = new Set(participantIds);
    setOwedAmountOverrides((currentOverrides) => {
      const nextOverrides: Record<string, string> = {};
      Object.entries(currentOverrides).forEach(([participantId, value]) => {
        if (participantIdSet.has(participantId)) {
          nextOverrides[participantId] = value;
        }
      });

      const currentKeys = Object.keys(currentOverrides);
      const nextKeys = Object.keys(nextOverrides);
      if (currentKeys.length === nextKeys.length && currentKeys.every((key) => nextOverrides[key] === currentOverrides[key])) {
        return currentOverrides;
      }

      return nextOverrides;
    });
  }, [participantIds]);

  useEffect(() => {
    if (!isCustomTipEnabled) {
      return;
    }

    setCustomTipSplits((currentSplits) => {
      const currentByParticipant = new Map(currentSplits.map((split) => [split.participantId, split]));
      const nextSplits = participantIds.map(
        (participantId) =>
          currentByParticipant.get(participantId) ?? {
            participantId,
            percentageValue: '',
            amountValue: '',
            percentageLocked: false,
            amountLocked: false,
          },
      );

      const withPercentages = redistributeAdvancedSplits(nextSplits, 'percentage', normalizedTip);
      const withAmounts = redistributeAdvancedSplits(withPercentages, 'amount', normalizedTip);

      return withAmounts;
    });
  }, [isCustomTipEnabled, normalizedTip, participantIds]);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + (Number(item.price) || 0), 0),
    [items],
  );

  const computedCustomTotal = useMemo(
    () => subtotal + normalizedTax + normalizedTip + normalizedFees,
    [normalizedFees, normalizedTax, normalizedTip, subtotal],
  );

  const hasFinalTotalOverride = useMemo(
    () => finalTotalInput.trim().length > 0,
    [finalTotalInput],
  );

  const resolvedCustomTotal = useMemo(
    () =>
      hasFinalTotalOverride && Number.isFinite(parsedFinalTotal)
        ? roundToCurrency(parsedFinalTotal)
        : roundToCurrency(computedCustomTotal),
    [computedCustomTotal, hasFinalTotalOverride, parsedFinalTotal],
  );

  const customTotalAdjustment = useMemo(
    () => roundToCurrency(resolvedCustomTotal - roundToCurrency(computedCustomTotal)),
    [computedCustomTotal, resolvedCustomTotal],
  );

  const effectiveDistributableExtrasTotal = useMemo(
    () => roundToCurrency(distributableExtrasTotal + customTotalAdjustment),
    [customTotalAdjustment, distributableExtrasTotal],
  );

  const previewTotal = useMemo(
    () =>
      (isEqualSplitMode || isManualSplitMode)
        ? (Number.isFinite(parsedEqualTotal) ? parsedEqualTotal : 0)
        : resolvedCustomTotal,
    [isEqualSplitMode, isManualSplitMode, parsedEqualTotal, resolvedCustomTotal],
  );

  const suggestedAmounts = useMemo(() => {
    return calculateSuggestedBillAmounts({
      customTipSplitType,
      customTipSplits,
      effectiveDistributableExtrasTotal,
      extrasSplitMode,
      isCustomSplitMode,
      isCustomTipEnabled,
      items,
      normalizedTip,
      participantIds,
      previewTotal,
    });
  }, [
    customTipSplitType,
    customTipSplits,
    effectiveDistributableExtrasTotal,
    extrasSplitMode,
    isCustomSplitMode,
    isCustomTipEnabled,
    items,
    normalizedTip,
    participantIds,
    previewTotal,
  ]);

  const owedAmountEntries = useMemo<OwedAmountEntry[]>(
    () =>
      participants.map((participant) => {
        const fallbackValue = toCurrencyInput(suggestedAmounts.get(participant.id) ?? 0);
        const rawValue = isManualSplitMode ? (owedAmountOverrides[participant.id] ?? '') : fallbackValue;
        const parsedValue = Number(rawValue);
        const hasInputValue = rawValue.trim().length > 0;
        const isValidInput = isManualSplitMode
          ? hasInputValue && Number.isFinite(parsedValue) && parsedValue >= 0
          : true;
        const amount = isValidInput && Number.isFinite(parsedValue) ? parsedValue : 0;

        return {
          participant,
          inputValue: rawValue,
          amount,
          isValidInput,
          hasInputValue,
        };
      }),
    [isManualSplitMode, owedAmountOverrides, participants, suggestedAmounts],
  );

  const owedTotal = useMemo(
    () => owedAmountEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [owedAmountEntries],
  );

  const customTipSplitTotal = useMemo(
    () =>
      customTipSplits.reduce((sum, split) => {
        const parsedValue = Number(getAdvancedSplitRawValue(split, customTipSplitType));
        return Number.isFinite(parsedValue) ? sum + parsedValue : sum;
      }, 0),
    [customTipSplitType, customTipSplits],
  );

  const customTipSplitTarget = useMemo(
    () => resolveSplitTarget(customTipSplitType, normalizedTip),
    [customTipSplitType, normalizedTip],
  );

  const isCustomTipSplitBalanced = useMemo(
    () => Math.abs(roundToCurrency(customTipSplitTotal - customTipSplitTarget)) < 0.01,
    [customTipSplitTarget, customTipSplitTotal],
  );

  const customTipContributionMap = useMemo(() => {
    const contributionMap = new Map<string, number>();
    participants.forEach((participant) => {
      contributionMap.set(participant.id, 0);
    });

    if (!isCustomSplitMode || !isCustomTipEnabled || !Number.isFinite(normalizedTip) || normalizedTip <= 0) {
      return contributionMap;
    }

    customTipSplits.forEach((split) => {
      if (!contributionMap.has(split.participantId)) {
        return;
      }

      const splitValue = Number(getAdvancedSplitRawValue(split, customTipSplitType));
      if (!Number.isFinite(splitValue) || splitValue < 0) {
        return;
      }

      const contribution =
        customTipSplitType === 'percentage'
          ? (normalizedTip * splitValue) / 100
          : splitValue;
      contributionMap.set(split.participantId, (contributionMap.get(split.participantId) ?? 0) + contribution);
    });

    let roundedTotal = 0;
    participants.forEach((participant) => {
      const roundedAmount = roundToCurrency(contributionMap.get(participant.id) ?? 0);
      contributionMap.set(participant.id, roundedAmount);
      roundedTotal += roundedAmount;
    });

    const difference = roundToCurrency(normalizedTip - roundedTotal);
    if (Math.abs(difference) > 0 && participants.length > 0) {
      const firstParticipantId = participants[0].id;
      contributionMap.set(
        firstParticipantId,
        roundToCurrency((contributionMap.get(firstParticipantId) ?? 0) + difference),
      );
    }

    return contributionMap;
  }, [
    customTipSplitType,
    customTipSplits,
    isCustomSplitMode,
    isCustomTipEnabled,
    normalizedTip,
    participants,
  ]);

  const totalsMatch = useMemo(
    () => {
      const baseMatch = validateBillTotal(
        owedAmountEntries.map((entry) => ({
          id: entry.participant.id,
          amountOwed: entry.amount,
          paidStatus: 'pending',
        })),
        previewTotal,
      );

      if (owedAmountEntries.some((entry) => entry.amount < 0)) {
        return false;
      }

      if (!isManualSplitMode) {
        return baseMatch;
      }

      return baseMatch && owedAmountEntries.every((entry) => entry.isValidInput);
    },
    [isManualSplitMode, owedAmountEntries, previewTotal],
  );

  const styles = useStyles();

  const trackSubmitValidationFailed = (reason: string) => {
    trackObservabilityEvent('CREATE_BILL_SUBMIT_VALIDATION_FAILED', {
      source: 'CreateBillScreen',
      reason,
      isEditMode,
      splitMode,
      customParticipantCount: customParticipants.length,
      participantCount: participants.length,
      selectedFriendCount: selectedFriendIds.length,
      itemCount: items.length,
    });
  };

  const toggleItemExpanded = (itemId: string) => {
    setExpandedItemIds((currentIds) =>
      currentIds.includes(itemId)
        ? currentIds.filter((currentId) => currentId !== itemId)
        : [...currentIds, itemId],
    );
  };

  const addItem = () => {
    const price = Number(draftItemPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setErrorMessage('Item price must be greater than zero.');
      return;
    }

    const normalizedName = draftItemName.trim() || `Item ${items.length + 1}`;
    if (isCustomSplitMode && !draftItemName.trim()) {
      setErrorMessage('Item name is required for custom split.');
      return;
    }

    setItems((currentItems) => [
      ...currentItems,
      {
        id: createEntityId('bill_item_draft'),
        name: normalizedName,
        price: String(roundToCurrency(price)),
        splitMode: 'simple',
        assignedParticipantIds: [...participantIds],
        advancedSplitType: 'percentage',
        advancedSplits: [],
      },
    ]);

    setDraftItemName('');
    setDraftItemPrice('');
    setErrorMessage(null);
    trackObservabilityEvent('CREATE_BILL_ITEM_ADDED', {
      source: 'CreateBillScreen',
      splitMode,
      itemCount: items.length + 1,
    });
  };

  const removeItem = (itemId: string) => {
    setItems((currentItems) => currentItems.filter((item) => item.id !== itemId));
    setExpandedItemIds((currentIds) => currentIds.filter((currentId) => currentId !== itemId));
    trackObservabilityEvent('CREATE_BILL_ITEM_REMOVED', {
      source: 'CreateBillScreen',
      splitMode,
      itemCount: Math.max(0, items.length - 1),
    });
  };

  const updateItemSplitMode = (itemId: string, nextSplitMode: 'simple' | 'advanced') => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== itemId || item.splitMode === nextSplitMode) {
          return item;
        }

        if (nextSplitMode === 'advanced') {
          const assignedParticipantIds =
            item.assignedParticipantIds.length > 0 ? item.assignedParticipantIds : [...participantIds];
          const parsedItemPrice = Number(item.price);
          const normalizedItemPrice = Number.isFinite(parsedItemPrice) ? parsedItemPrice : 0;

          return {
            ...item,
            splitMode: 'advanced',
            advancedSplitType: 'percentage',
            advancedSplits: buildDefaultAdvancedSplits(assignedParticipantIds, normalizedItemPrice),
          };
        }

        return {
          ...item,
          splitMode: 'simple',
          assignedParticipantIds:
            item.advancedSplits.length > 0
              ? item.advancedSplits
                  .map((split) => split.participantId)
                  .filter((participantId, index, collection) => collection.indexOf(participantId) === index)
              : item.assignedParticipantIds,
        };
      }),
    );
  };

  const toggleSimpleItemParticipant = (itemId: string, participantId: string) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const isAssigned = item.assignedParticipantIds.includes(participantId);
        const nextAssignedParticipantIds = isAssigned
          ? item.assignedParticipantIds.filter((id) => id !== participantId)
          : [...item.assignedParticipantIds, participantId];

        return {
          ...item,
          assignedParticipantIds: nextAssignedParticipantIds,
        };
      }),
    );
  };

  const updateAdvancedSplitType = (itemId: string, nextType: DraftAdvancedSplitType) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        return {
          ...item,
          advancedSplitType: nextType,
        };
      }),
    );
  };

  const toggleAdvancedItemParticipant = (itemId: string, participantId: string) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const existingSplit = item.advancedSplits.find((split) => split.participantId === participantId);
        const parsedItemPrice = Number(item.price);
        const normalizedItemPrice = Number.isFinite(parsedItemPrice) ? parsedItemPrice : 0;
        const nextSplits = existingSplit
          ? item.advancedSplits.filter((split) => split.participantId !== participantId)
          : [
              ...item.advancedSplits,
              {
                participantId,
                percentageValue: '',
                amountValue: '',
                percentageLocked: false,
                amountLocked: false,
              },
            ];

        const withPercentages = redistributeAdvancedSplits(nextSplits, 'percentage', normalizedItemPrice);
        const withAmounts = redistributeAdvancedSplits(withPercentages, 'amount', normalizedItemPrice);

        return {
          ...item,
          advancedSplits: withAmounts,
        };
      }),
    );
  };

  const updateAdvancedSplitValue = (
    itemId: string,
    participantId: string,
    splitType: DraftAdvancedSplitType,
    value: string,
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const parsedItemPrice = Number(item.price);
        const normalizedItemPrice = Number.isFinite(parsedItemPrice) ? parsedItemPrice : 0;
        const nextSplits = item.advancedSplits.map((split) =>
          split.participantId === participantId
            ? {
                ...split,
                percentageValue: splitType === 'percentage' ? value : split.percentageValue,
                amountValue: splitType === 'amount' ? value : split.amountValue,
              }
            : split,
        );

        const editedSplit = nextSplits.find((split) => split.participantId === participantId);
        const shouldRedistribute =
          editedSplit ? isAdvancedSplitLocked(editedSplit, splitType) : false;

        return {
          ...item,
          advancedSplits: shouldRedistribute
            ? redistributeAdvancedSplits(nextSplits, splitType, normalizedItemPrice)
            : nextSplits,
        };
      }),
    );
  };

  const toggleAdvancedSplitLock = (
    itemId: string,
    participantId: string,
    splitType: DraftAdvancedSplitType,
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const parsedItemPrice = Number(item.price);
        const normalizedItemPrice = Number.isFinite(parsedItemPrice) ? parsedItemPrice : 0;
        const toggledSplits = item.advancedSplits.map((split) => {
          if (split.participantId !== participantId) {
            return split;
          }

          return setAdvancedSplitLocked(
            split,
            splitType,
            !isAdvancedSplitLocked(split, splitType),
          );
        });

        return {
          ...item,
          advancedSplits: redistributeAdvancedSplits(toggledSplits, splitType, normalizedItemPrice),
        };
      }),
    );
  };

  const enableCustomTipSplit = () => {
    trackObservabilityEvent('CREATE_BILL_CUSTOM_TIP_TOGGLED', {
      source: 'CreateBillScreen',
      enabled: true,
      splitMode,
    });
    setIsCustomTipEnabled(true);
    setCustomTipSplits((currentSplits) => {
      const currentByParticipant = new Map(currentSplits.map((split) => [split.participantId, split]));
      const nextSplits = participantIds.map(
        (participantId) =>
          currentByParticipant.get(participantId) ?? {
            participantId,
            percentageValue: '',
            amountValue: '',
            percentageLocked: false,
            amountLocked: false,
          },
      );

      const withPercentages = redistributeAdvancedSplits(nextSplits, 'percentage', normalizedTip);
      return redistributeAdvancedSplits(withPercentages, 'amount', normalizedTip);
    });
  };

  const disableCustomTipSplit = () => {
    trackObservabilityEvent('CREATE_BILL_CUSTOM_TIP_TOGGLED', {
      source: 'CreateBillScreen',
      enabled: false,
      splitMode,
    });
    setIsCustomTipEnabled(false);
    setCustomTipSplits([]);
    setCustomTipSplitType('amount');
  };

  const changeCustomTipSplitType = (nextType: DraftAdvancedSplitType) => {
    setCustomTipSplitType(nextType);
    setCustomTipSplits((currentSplits) =>
      redistributeAdvancedSplits(currentSplits, nextType, normalizedTip),
    );
  };

  const updateCustomTipSplitValue = (participantId: string, value: string) => {
    setCustomTipSplits((currentSplits) => {
      const nextSplits = currentSplits.map((split) =>
        split.participantId === participantId
          ? setAdvancedSplitRawValue(split, customTipSplitType, value)
          : split,
      );
      const editedSplit = nextSplits.find((split) => split.participantId === participantId);
      const shouldRedistribute =
        editedSplit ? isAdvancedSplitLocked(editedSplit, customTipSplitType) : false;

      return shouldRedistribute
        ? redistributeAdvancedSplits(nextSplits, customTipSplitType, normalizedTip)
        : nextSplits;
    });
  };

  const toggleCustomTipSplitLock = (participantId: string) => {
    setCustomTipSplits((currentSplits) => {
      const toggledSplits = currentSplits.map((split) => {
        if (split.participantId !== participantId) {
          return split;
        }

        return setAdvancedSplitLocked(
          split,
          customTipSplitType,
          !isAdvancedSplitLocked(split, customTipSplitType),
        );
      });

      return redistributeAdvancedSplits(toggledSplits, customTipSplitType, normalizedTip);
    });
  };

  const buildItemSplitSummary = (item: DraftBillItem): string => {
    if (isEqualSplitMode) {
      const participantCount = participants.length;
      return `Shared equally by ${participantCount} participant${participantCount === 1 ? '' : 's'}`;
    }

    if (item.splitMode === 'advanced') {
      const total = item.advancedSplits.reduce((sum, split) => {
        const parsedValue = Number(getAdvancedSplitRawValue(split, item.advancedSplitType));
        return Number.isFinite(parsedValue) ? sum + parsedValue : sum;
      }, 0);
      if (item.advancedSplitType === 'percentage') {
        return `Complex split • ${formatPercentageDisplay(total)} of 100%`;
      }
      const parsedPrice = Number(item.price);
      const targetPrice = Number.isFinite(parsedPrice) ? roundToCurrency(parsedPrice) : 0;
      return `Complex split • ${formatCurrency(total)} of ${formatCurrency(targetPrice)}`;
    }

    const assignedCount = item.assignedParticipantIds.length;
    if (assignedCount === 0) {
      return 'Simple split • no participants assigned';
    }

    if (assignedCount === 1) {
      const assignedParticipant = participants.find(
        (participant) => participant.id === item.assignedParticipantIds[0],
      );
      return `Simple split • assigned to ${assignedParticipant?.name ?? '1 participant'}`;
    }

    if (assignedCount === participants.length) {
      return 'Simple split • shared by everyone';
    }

    return `Simple split • assigned to ${assignedCount} participants`;
  };

  const existingEvenModeItemId = isEditMode
    ? (billQuery.data?.items.find((item) => item.splitMode !== 'advanced')?.id ?? billQuery.data?.items[0]?.id)
    : undefined;
  const screenTitle = isEditMode ? 'Edit Bill' : 'Create Bill';
  const screenSubtitle = isEditMode
    ? 'Update this split bill and confirm who owes what.'
    : 'Build a split bill and confirm who owes what.';
  const primaryActionLabel = isCreating ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Bill' : 'Create Bill');
  const errorToastTitle = isEditMode ? 'Save bill failed' : 'Create bill failed';
  const hasUnsavedChanges = useMemo(() => {
    if (isEditMode) {
      if (!isEditHydrated || !billQuery.data) {
        return false;
      }

      return (
        billTitle.trim() !== billQuery.data.title.trim() ||
        splitMode !== inferEditSplitMode(billQuery.data) ||
        participants.length !== billQuery.data.participants.length ||
        items.length !== billQuery.data.items.length ||
        payerParticipantId !== participants[0]?.id ||
        equalTotalInput.trim().length > 0 ||
        taxInput.trim().length > 0 ||
        tipInput.trim().length > 0 ||
        feesInput.trim().length > 0 ||
        finalTotalInput.trim().length > 0 ||
        selectedFriendIds.length > 0 ||
        customParticipants.length > 0 ||
        isCustomTipEnabled
      );
    }

    return (
      Boolean(billTitle.trim()) ||
      participants.length > 1 ||
      items.length > 0 ||
      Boolean(equalTotalInput.trim()) ||
      Boolean(taxInput.trim()) ||
      Boolean(tipInput.trim()) ||
      Boolean(feesInput.trim()) ||
      Boolean(finalTotalInput.trim()) ||
      selectedFriendIds.length > 0 ||
      customParticipants.length > 0 ||
      isCustomTipEnabled
    );
  }, [
    billQuery.data,
    billTitle,
    customParticipants.length,
    equalTotalInput,
    feesInput,
    finalTotalInput,
    isCustomTipEnabled,
    isEditHydrated,
    isEditMode,
    items.length,
    participants,
    payerParticipantId,
    selectedFriendIds.length,
    splitMode,
    taxInput,
    tipInput,
  ]);
  const buildFlowAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'CreateBillScreen',
      mode: isEditMode ? 'edit' : 'create',
      participantCount: participants.length,
      itemCount: items.length,
      splitMode,
      hasTitle: Boolean(billTitle.trim()),
      hasUnsavedChanges,
      ...overrides,
    }),
    [billTitle, hasUnsavedChanges, isEditMode, items.length, participants.length, splitMode],
  );

  useEffect(() => {
    const canTrackOpen = !isEditMode || isEditHydrated;
    if (!canTrackOpen || hasTrackedFlowOpenRef.current) {
      return;
    }

    hasTrackedFlowOpenRef.current = true;
    trackObservabilityEvent('CREATE_BILL_OPENED', buildFlowAnalyticsPayload());
  }, [buildFlowAnalyticsPayload, isEditHydrated, isEditMode]);

  useEffect(
    () => () => {
      if (
        hasCompletedFlowRef.current ||
        hasTrackedFlowExitRef.current ||
        !hasTrackedFlowOpenRef.current
      ) {
        return;
      }

      hasTrackedFlowExitRef.current = true;
      trackObservabilityEvent(
        'CREATE_BILL_EXITED',
        buildFlowAnalyticsPayload({
          exitMethod: exitMethodRef.current ?? 'system_back_or_gesture',
        }),
      );
    },
    [buildFlowAnalyticsPayload],
  );

  const handleCreateBill = async () => {
    if (!billTitle.trim()) {
      trackSubmitValidationFailed('missing_bill_name');
      setErrorMessage('Bill name is required.');
      return;
    }

    if (participants.length <= 1) {
      trackSubmitValidationFailed('missing_participants');
      setErrorMessage('Add at least one other person to split with.');
      return;
    }

    if (
      selectedFriendIds.some((friendId) => {
        const friend = acceptedFriendById.get(friendId);
        return !friend?.userId?.trim();
      })
    ) {
      trackSubmitValidationFailed('friend_resolution_failed');
      setErrorMessage('Could not resolve one or more selected friends. Refresh and try again.');
      return;
    }

    if (owedAmountEntries.some((entry) => entry.amount < 0)) {
      trackSubmitValidationFailed('negative_participant_amount');
      setErrorMessage('Final price cannot reduce any participant below $0.00.');
      return;
    }

    const submission = buildBillDraftSubmission({
      billTitle,
      createEntityId,
      customTipContributionMap,
      customTipSplitBalanced: isCustomTipSplitBalanced,
      editBill: billQuery.data,
      editBillId,
      existingEvenModeItemId,
      extrasSplitMode,
      hasFinalTotalOverride,
      isCustomSplitMode,
      isCustomTipEnabled,
      isEditHydrated,
      isEditMode,
      isEqualSplitMode,
      isManualSplitMode,
      items,
      owedAmountOverrides,
      participantIds,
      participantRecordIdByDraftId,
      participants,
      payerParticipantId,
      parsedEqualTotal,
      parsedFees,
      parsedFinalTotal,
      parsedTax,
      parsedTip,
      previewTotal,
      suggestedAmounts,
    });

    if (!submission.ok) {
      trackSubmitValidationFailed(submission.reason);
      setErrorMessage(submission.message);
      return;
    }

    const billPayload = submission.payload;

    setErrorMessage(null);
    trackObservabilityEvent('CREATE_BILL_SUBMIT_STARTED', {
      source: 'CreateBillScreen',
      isEditMode,
      splitMode,
      itemCount: billPayload.items?.length ?? 0,
      participantCount: billPayload.participants?.length ?? 0,
      isOnline,
    });
    setIsCreating(true);

    try {
      const writeResult = isEditMode && editBillId
        ? await billWrites.updateBill({
            billId: editBillId,
            updates: billPayload,
          })
        : await billWrites.createBill({
            ...billPayload,
            createdByUserId: user?.id ?? 'unknown_user',
          });

      if (writeResult.status === 'queued') {
        trackObservabilityEvent('CREATE_BILL_SUBMIT_SUCCEEDED', {
          source: 'CreateBillScreen',
          isEditMode,
          splitMode,
          queued: true,
        });
        hasCompletedFlowRef.current = true;
        navigation.navigate('Bills');
        return;
      }

      const savedBill = writeResult.result;

      trackObservabilityEvent('CREATE_BILL_SUBMIT_SUCCEEDED', {
        source: 'CreateBillScreen',
        isEditMode,
        splitMode,
        queued: false,
        billId: savedBill.id,
      });
      hasCompletedFlowRef.current = true;
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Bills' },
          {
            name: 'BillDetail',
            params: { billId: savedBill.id },
          },
        ],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : (isEditMode ? 'Could not save bill.' : 'Could not create bill.');
      setErrorMessage(message);
      trackObservabilityEvent('CREATE_BILL_SUBMIT_FAILED', {
        source: 'CreateBillScreen',
        isEditMode,
        splitMode,
        isOnline,
        error: message,
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <FeatureFormScreenScaffold
      bodyStyle={styles.body}
      keyboardAware
      onBackPress={() => {
        exitMethodRef.current = 'header_back';
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.navigate('Bills');
      }}
      primaryAction={{
        label: primaryActionLabel,
        onPress: () => {
          void handleCreateBill();
        },
        disabled: isCreating || (isEditMode && (!isEditHydrated || !billQuery.data)),
      }}
      secondaryAction={{
        label: 'Cancel',
        onPress: () => {
          exitMethodRef.current = 'secondary_cancel';
          navigation.goBack();
        },
        disabled: isCreating,
        variant: 'secondary',
      }}
      subtitle={screenSubtitle}
      testID={isEditMode ? 'edit-bill-screen' : 'create-bill-screen'}
      title={screenTitle}
    >
      {!isEditMode ? (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons color={theme.colors.text.secondary} name="options-outline" size={16} />
            <Text style={styles.sectionTitle} variant="titleSm">Split Type</Text>
          </View>
          <SegmentedControl
            getOptionTestID={(value) => `bill-split-mode-${value}`}
            onChange={(value: CreateBillSplitMode) => {
              trackObservabilityEvent('CREATE_BILL_SPLIT_MODE_CHANGED', {
                source: 'CreateBillScreen',
                previousSplitMode: splitMode,
                nextSplitMode: value,
              });
              setSplitMode(value);
            }}
            options={[
              { label: 'Equal', value: 'equal' },
              { label: 'Custom', value: 'custom' },
              { label: 'Manual', value: 'manual' },
            ]}
            value={splitMode}
          />
          <Text style={styles.sectionHint} variant="bodySmCompact">
            {isEqualSplitMode
              ? 'Use one total bill amount and split it evenly across participants.'
              : isCustomSplitMode
                ? 'Use itemized entries with tax, tip, fees, and custom per-item assignment.'
                : 'Set one total bill amount, then manually assign each participant\'s owed amount.'}
          </Text>
        </Card>
      ) : null}

      <Card style={styles.sectionCard}>
        <View style={styles.sectionTitleRow}>
          <Ionicons color={theme.colors.text.secondary} name="create-outline" size={16} />
          <Text style={styles.sectionTitle} variant="titleSm">Bill Name</Text>
        </View>
        <Input
          onChangeText={setBillTitle}
          placeholder="Dinner at Nori"
          testID="bill-name-input"
          value={billTitle}
        />
      </Card>

      <BillParticipantPickerSection
        customParticipants={customParticipants}
        friendSearchQuery={friendSearchQuery}
        hasBlockingFriendsError={hasBlockingFriendsError}
        isFetchingNextPage={friendsQuery.isFetchingNextPage}
        isLoading={friendsQuery.isLoading}
        normalizedFriendSearchQuery={normalizedFriendSearchQuery}
        selectedFriendIds={selectedFriendIds}
        selectedFriends={selectedFriends}
        shouldShowFriendSearch={shouldShowFriendSearch}
        totalAcceptedFriends={totalAcceptedFriends}
        visibleFriends={visibleFriends}
        onChangeFriendSearchQuery={setFriendSearchQuery}
        onConfirmSelection={({ friendIds: nextSelectedFriendIds, customParticipants: nextCustomParticipants }) => {
          const previousSelectedFriendIds = new Set(selectedFriendIds);
          const nextSelectedFriendIdSet = new Set(nextSelectedFriendIds);
          const changedFriendIds = Array.from(
            new Set([
              ...selectedFriendIds.filter((friendId) => !nextSelectedFriendIdSet.has(friendId)),
              ...nextSelectedFriendIds.filter((friendId) => !previousSelectedFriendIds.has(friendId)),
            ]),
          );

          changedFriendIds.forEach((friendId) => {
            const friend = acceptedFriendById.get(friendId);
            if (!friend) {
              return;
            }

            trackObservabilityEvent('CREATE_BILL_FRIEND_TOGGLED', {
              source: 'CreateBillScreen',
              friendId: friend.id,
              selected: nextSelectedFriendIdSet.has(friendId),
              selectedFriendCount: nextSelectedFriendIds.length,
            });
          });

          if (!areStringArraysEqual(selectedFriendIds, nextSelectedFriendIds)) {
            setSelectedFriendIds(nextSelectedFriendIds);
          }

          setCustomParticipants(nextCustomParticipants);
        }}
        onLoadMore={() => {
          void friendsQuery.fetchNextPage();
        }}
        onRetry={() => {
          void friendsQuery.refetch();
        }}
        showLoadMore={visibleFriends.length > 0 && Boolean(friendsQuery.hasNextPage)}
      />

      {(isEqualSplitMode || isManualSplitMode) ? (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons color={theme.colors.text.secondary} name="cash-outline" size={16} />
            <Text style={styles.sectionTitle} variant="titleSm">Total Bill Price</Text>
          </View>
          <Input
            keyboardType="decimal-pad"
            onChangeText={setEqualTotalInput}
            placeholder="0.00"
            testID="bill-total-bill-price-input"
            {...billNumericInputProps}
            value={equalTotalInput}
          />
          <Text style={styles.sectionHint} variant="bodySmCompact">
            {isEqualSplitMode
              ? 'This total is split evenly across all selected participants.'
              : 'Set the total first, then enter each participant\'s owed amount below.'}
          </Text>
        </Card>
      ) : null}

      {isCustomSplitMode ? (
        <Card style={styles.sectionCard}>
        <View style={styles.sectionTitleRow}>
          <Ionicons color={theme.colors.text.secondary} name="cash-outline" size={16} />
          <Text style={styles.sectionTitle} variant="titleSm">Items</Text>
        </View>
        <Text style={styles.sectionHint} variant="bodySmCompact">
          Custom mode: add items, then choose simple or complex assignment per item.
        </Text>

        <View style={styles.itemComposerRow}>
          <Input
            containerStyle={styles.itemNameInput}
            onChangeText={setDraftItemName}
            placeholder="Item name"
            testID="bill-item-name-input"
            value={draftItemName}
          />
          <Input
            containerStyle={styles.itemPriceInput}
            keyboardType="decimal-pad"
            onChangeText={setDraftItemPrice}
            placeholder="0.00"
            testID="bill-item-price-input"
            {...billNumericInputProps}
            value={draftItemPrice}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!draftItemName.trim() || !draftItemPrice.trim()}
            onPress={addItem}
            style={({ pressed }) => [
              styles.addItemButton,
              (!draftItemName.trim() || !draftItemPrice.trim()) ? styles.addItemButtonDisabled : null,
              pressed ? { opacity: 0.8 } : null,
            ]}
          >
            <Text style={styles.addItemButtonLabel} variant="labelStrong">+ Add Item</Text>
          </Pressable>
        </View>

        {items.length > 0 ? (
          <OptionList style={styles.itemsList}>
            {items.map((item, index) => {
              const isLast = index === items.length - 1;
              const isExpanded = expandedItemIds.includes(item.id);
              const showSplitEditor = isExpanded;
              const advancedTotal =
                item.splitMode === 'advanced'
                  ? item.advancedSplits.reduce((sum, split) => {
                    const parsedValue = Number(getAdvancedSplitRawValue(split, item.advancedSplitType));
                    return Number.isFinite(parsedValue) ? sum + parsedValue : sum;
                  }, 0)
                  : 0;
              const parsedItemPrice = Number(item.price);
              const advancedTarget =
                item.advancedSplitType === 'percentage'
                  ? 100
                  : Number.isFinite(parsedItemPrice) ? parsedItemPrice : 0;
              const isAdvancedBalanced = Math.abs(advancedTotal - advancedTarget) < 0.01;

              return (
                <Fragment key={item.id}>
                  <OptionListRow
                    chevron={isExpanded ? 'up' : 'down'}
                    connected={showSplitEditor}
                    isLast={!showSplitEditor && isLast}
                    key={item.id}
                    onPress={() => {
                      toggleItemExpanded(item.id);
                    }}
                    rightAccessory={
                      <View style={styles.itemRowAccessory}>
                        <Text style={styles.itemPrice} variant="labelStrong">
                          {formatCurrency(Number(item.price) || 0)}
                        </Text>
                        <Pressable
                          accessibilityLabel={`Remove ${item.name}`}
                          onPress={() => {
                            setPendingDeleteItem(item);
                          }}
                          style={styles.removeItemButton}
                        >
                          <Ionicons color={theme.colors.text.danger} name="trash-outline" size={16} />
                        </Pressable>
                      </View>
                    }
                    subtitle={buildItemSplitSummary(item)}
                    title={item.name}
                  />

                  {showSplitEditor ? (
                    <OptionListInlineBody style={styles.itemSplitBody} withBottomDivider={!isLast}>
                      <View style={styles.itemSplitModeRow}>
                        <Text variant="label">Split Mode</Text>
                        <SegmentedControl
                          containerStyle={styles.splitControl}
                          fill={false}
                          onChange={(value: 'simple' | 'advanced') => {
                            updateItemSplitMode(item.id, value);
                          }}
                          options={[
                            { label: 'Simple', value: 'simple' },
                            { label: 'Complex', value: 'advanced' },
                          ]}
                          value={item.splitMode}
                        />
                      </View>

                      {item.splitMode === 'simple' ? (
                        <>
                          <Text style={styles.sectionHint} variant="bodySmCompact">Choose who shares this item.</Text>
                          <View style={styles.assignmentChipWrap}>
                            {participants.map((participant) => {
                              const isAssigned = item.assignedParticipantIds.includes(participant.id);
                              return (
                                <Pressable
                                  accessibilityRole="button"
                                  key={participant.id}
                                  onPress={() => {
                                    toggleSimpleItemParticipant(item.id, participant.id);
                                  }}
                                  style={[
                                    styles.assignmentChip,
                                    isAssigned ? styles.assignmentChipSelected : null,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.assignmentChipLabel,
                                      isAssigned ? styles.assignmentChipLabelSelected : null,
                                    ]}
                                    variant="bodySmTightSemiBold"
                                  >
                                    {participant.name}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={styles.itemSplitTypeRow}>
                            <Text variant="label">Complex Split Type</Text>
                            <SegmentedControl
                              containerStyle={styles.splitControl}
                              fill={false}
                              onChange={(value: DraftAdvancedSplitType) => {
                                updateAdvancedSplitType(item.id, value);
                              }}
                              options={[
                                { label: '%', value: 'percentage' },
                                { label: '$', value: 'amount' },
                              ]}
                              value={item.advancedSplitType}
                            />
                          </View>
                          <Text style={styles.sectionHint} variant="bodySmCompact">
                            Choose participants and enter split values.
                          </Text>
                          <View style={styles.assignmentChipWrap}>
                            {participants.map((participant) => {
                              const isInSplit = item.advancedSplits.some(
                                (split) => split.participantId === participant.id,
                              );
                              return (
                                <Pressable
                                  accessibilityRole="button"
                                  key={participant.id}
                                  onPress={() => {
                                    toggleAdvancedItemParticipant(item.id, participant.id);
                                  }}
                                  style={[
                                    styles.assignmentChip,
                                    isInSplit ? styles.assignmentChipSelected : null,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.assignmentChipLabel,
                                      isInSplit ? styles.assignmentChipLabelSelected : null,
                                    ]}
                                    variant="bodySmTightSemiBold"
                                  >
                                    {participant.name}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>

                          {participants.map((participant) => {
                            const split = item.advancedSplits.find(
                              (entry) => entry.participantId === participant.id,
                            );
                            if (!split) {
                              return null;
                            }

                            return (
                              <View key={`${item.id}:${participant.id}`} style={styles.advancedSplitValueRow}>
                                <Text style={styles.advancedSplitLabel} variant="label">{participant.name}</Text>
                                <View style={styles.advancedSplitControls}>
                                  <Pressable
                                    accessibilityLabel={
                                      isAdvancedSplitLocked(split, item.advancedSplitType)
                                        ? 'Unlock split value'
                                        : 'Lock split value'
                                    }
                                    accessibilityRole="button"
                                    onPress={() => {
                                      toggleAdvancedSplitLock(item.id, participant.id, item.advancedSplitType);
                                    }}
                                    style={[
                                      styles.splitLockButton,
                                      isAdvancedSplitLocked(split, item.advancedSplitType)
                                        ? styles.splitLockButtonLocked
                                        : null,
                                    ]}
                                  >
                                    <Ionicons
                                      color={
                                        isAdvancedSplitLocked(split, item.advancedSplitType)
                                          ? theme.colors.text.info
                                          : theme.colors.text.muted
                                      }
                                      name={
                                        isAdvancedSplitLocked(split, item.advancedSplitType)
                                          ? 'lock-closed'
                                          : 'lock-open-outline'
                                      }
                                      size={14}
                                    />
                                  </Pressable>
                                  <Input
                                    containerStyle={styles.advancedSplitInput}
                                    keyboardType="decimal-pad"
                                    onChangeText={(value) => {
                                      updateAdvancedSplitValue(
                                        item.id,
                                        participant.id,
                                        item.advancedSplitType,
                                        value,
                                      );
                                    }}
                                    placeholder="0.00"
                                    {...billNumericInputProps}
                                    value={getAdvancedSplitRawValue(split, item.advancedSplitType)}
                                  />
                                </View>
                              </View>
                            );
                          })}

                          <Text tone={isAdvancedBalanced ? 'success' : 'warning'}>
                            {item.advancedSplitType === 'percentage'
                              ? `Current split: ${formatPercentageDisplay(advancedTotal)} of 100%`
                              : `Current split: ${formatCurrency(advancedTotal)} of ${formatCurrency(advancedTarget)}`}
                          </Text>
                        </>
                      )}
                    </OptionListInlineBody>
                  ) : null}
                </Fragment>
              );
            })}
          </OptionList>
        ) : (
          <Text style={styles.sectionHint} variant="bodySmCompact">Add at least one item with a price.</Text>
        )}
        </Card>
      ) : null}

      {isCustomSplitMode ? (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons color={theme.colors.text.secondary} name="calculator-outline" size={16} />
            <Text style={styles.sectionTitle} variant="titleSm">Tax, Tip, Fees</Text>
          </View>

          <View style={styles.tripleInputRow}>
            <Input
              containerStyle={styles.tripleInputItem}
              keyboardType="decimal-pad"
              label="Tax"
              onChangeText={setTaxInput}
              placeholder="0.00"
              testID="bill-tax-input"
              {...billNumericInputProps}
              value={taxInput}
            />
            <Input
              containerStyle={styles.tripleInputItem}
              keyboardType="decimal-pad"
              label="Fees"
              onChangeText={setFeesInput}
              placeholder="0.00"
              testID="bill-fees-input"
              {...billNumericInputProps}
              value={feesInput}
            />
            {!isCustomTipEnabled ? (
              <Input
                containerStyle={styles.tripleInputItem}
                keyboardType="decimal-pad"
                label="Tip"
                onChangeText={setTipInput}
                placeholder="0.00"
                testID="bill-tip-input"
                {...billNumericInputProps}
                value={tipInput}
              />
            ) : null}
          </View>

          {!isCustomTipEnabled ? (
            <Pressable
              accessibilityRole="button"
              onPress={enableCustomTipSplit}
              testID="bill-enable-custom-tip-button"
              style={styles.customTipToggle}
            >
              <Text style={styles.customTipToggleLabel} variant="label">Custom tip</Text>
            </Pressable>
          ) : (
            <View style={styles.customTipEditor}>
              <View style={styles.customTipHeaderRow}>
                <Text variant="label">Custom Tip</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={disableCustomTipSplit}
                  testID="bill-disable-custom-tip-button"
                  style={styles.customTipToggle}
                >
                  <Text style={styles.customTipToggleLabel} variant="label">Cancel custom tip</Text>
                </Pressable>
              </View>

              <Input
                keyboardType="decimal-pad"
                label="Tip"
                onChangeText={setTipInput}
                placeholder="0.00"
                testID="bill-custom-tip-input"
                {...billNumericInputProps}
                value={tipInput}
              />

              <View style={styles.itemSplitTypeRow}>
                <Text variant="label">Tip Split Type</Text>
                <SegmentedControl
                  containerStyle={styles.splitControl}
                  fill={false}
                  onChange={(value: DraftAdvancedSplitType) => {
                    changeCustomTipSplitType(value);
                  }}
                  options={[
                    { label: '%', value: 'percentage' },
                    { label: '$', value: 'amount' },
                  ]}
                  value={customTipSplitType}
                />
              </View>

              {participants.map((participant, participantIndex) => {
                const split = customTipSplits.find((entry) => entry.participantId === participant.id);
                if (!split) {
                  return null;
                }

                const isLocked = isAdvancedSplitLocked(split, customTipSplitType);
                return (
                  <View key={`custom-tip:${participant.id}`} style={styles.advancedSplitValueRow}>
                    <Text style={styles.advancedSplitLabel} variant="label">{participant.name}</Text>
                    <View style={styles.advancedSplitControls}>
                      <Pressable
                        accessibilityLabel={isLocked ? 'Unlock tip split value' : 'Lock tip split value'}
                        accessibilityRole="button"
                        onPress={() => {
                          toggleCustomTipSplitLock(participant.id);
                        }}
                        style={[styles.splitLockButton, isLocked ? styles.splitLockButtonLocked : null]}
                      >
                        <Ionicons
                          color={isLocked ? theme.colors.text.info : theme.colors.text.muted}
                          name={isLocked ? 'lock-closed' : 'lock-open-outline'}
                          size={14}
                        />
                      </Pressable>
                      <Input
                        containerStyle={styles.advancedSplitInput}
                        keyboardType="decimal-pad"
                        onChangeText={(value) => {
                          updateCustomTipSplitValue(participant.id, value);
                        }}
                        placeholder="0.00"
                        testID={`bill-custom-tip-split-input-${participantIndex}`}
                        {...billNumericInputProps}
                        value={getAdvancedSplitRawValue(split, customTipSplitType)}
                      />
                    </View>
                  </View>
                );
              })}

              <Text tone={isCustomTipSplitBalanced ? 'success' : 'warning'}>
                {customTipSplitType === 'percentage'
                  ? `Current tip split: ${formatPercentageDisplay(customTipSplitTotal)} of 100%`
                  : `Current tip split: ${formatCurrency(customTipSplitTotal)} of ${formatCurrency(customTipSplitTarget)}`}
              </Text>
            </View>
          )}
        </Card>
      ) : null}

      {isCustomSplitMode ? (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionTitleRow} testID="bill-final-price-section">
            <Ionicons color={theme.colors.text.secondary} name="receipt-outline" size={16} />
            <Text style={styles.sectionTitle} variant="titleSm">Final Price</Text>
            <StatusPill label="Optional" tone="muted" />
          </View>

          <Input
            keyboardType="decimal-pad"
            label="Final Price"
            onChangeText={setFinalTotalInput}
            placeholder="0.00"
            testID="bill-final-price-input"
            {...billNumericInputProps}
            value={finalTotalInput}
          />

          <Text style={styles.sectionHint} variant="bodySmCompact">
            Leave this blank to use items plus tax, tip, and fees. If you enter a final price, the difference is spread
            across the split automatically.
          </Text>
          <Text style={styles.sectionHint} variant="bodySmCompact">
            Current calculated total: {formatCurrency(roundToCurrency(computedCustomTotal))}
          </Text>
        </Card>
      ) : null}

      <BillPayerAndTotalsSection
        isEqualSplitMode={isEqualSplitMode}
        isManualSplitMode={isManualSplitMode}
        isPayerDropdownOpen={isPayerDropdownOpen}
        owedAmountEntries={owedAmountEntries}
        owedTotal={owedTotal}
        participants={participants}
        payerParticipantId={payerParticipantId}
        previewTotal={previewTotal}
        totalsMatch={totalsMatch}
        onChangeOwedAmount={(participantId, value) => {
          setOwedAmountOverrides((currentValue) => ({
            ...currentValue,
            [participantId]: value,
          }));
        }}
        onSelectPayer={(participantId) => {
          setPayerParticipantId(participantId);
          setIsPayerDropdownOpen(false);
        }}
        onTogglePayerDropdown={() => {
          setIsPayerDropdownOpen((currentValue) => !currentValue);
        }}
      />

      <PageErrorToast
        actionLabel="Retry"
        analyticsProps={buildFlowAnalyticsPayload()}
        analyticsSource="CreateBillScreen"
        errorMessage={
          hasBlockingFriendsError
            ? 'Could not load your friend list.'
            : hasFriendsRefreshError
              ? 'Could not refresh your friend list.'
              : null
        }
        onAction={() => {
          void friendsQuery.refetch();
        }}
        title={hasBlockingFriendsError ? 'Friends unavailable' : 'Friend list may be stale'}
      />
      <PageErrorToast
        analyticsProps={buildFlowAnalyticsPayload()}
        analyticsSource="CreateBillScreen"
        errorMessage={errorMessage}
        title={errorToastTitle}
      />
      <ConfirmDestructiveModal
        cancelLabel="Keep Item"
        confirmLabel="Delete Item"
        description={
          pendingDeleteItem?.name?.trim()
            ? `Delete "${pendingDeleteItem.name}" from this bill?`
            : 'Delete this item from the bill?'
        }
        disabled={!pendingDeleteItem}
        onCancel={() => {
          setPendingDeleteItem(null);
        }}
        onConfirm={() => {
          if (!pendingDeleteItem) {
            return;
          }

          removeItem(pendingDeleteItem.id);
          setPendingDeleteItem(null);
        }}
        title="Delete Bill Item?"
        visible={pendingDeleteItem !== null}
      />
    </FeatureFormScreenScaffold>
  );
}
