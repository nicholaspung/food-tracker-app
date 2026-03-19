import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FeatureFormScreenScaffold,
  OptionList,
  OptionListInlineBody,
  OptionListRow,
  PageErrorToast,
  SegmentedControl,
  Skeleton,
  StatusPill,
} from '../components/shared';
import {
  createBill,
  createEntityId,
  getBillById,
  listFriends,
  updateBill,
  type BillItemRecord,
  type BillItemSplitConfig,
  type BillParticipantRecord,
  type BillRecord,
  type FriendRecord,
} from '../features';
import {
  formatCurrency,
  validateBillTotal,
} from '../features/bills/billCalculations';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Card, Input, Text } from '../ui';

type CreateBillScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateBill'>;
type CreateBillSplitMode = 'equal' | 'custom' | 'manual';
type DraftAdvancedSplitType = 'percentage' | 'amount';

interface DraftAdvancedSplitEntry {
  participantId: string;
  percentageValue: string;
  amountValue: string;
  percentageLocked: boolean;
  amountLocked: boolean;
}

interface DraftBillItem {
  id: string;
  name: string;
  price: string;
  splitMode: 'simple' | 'advanced';
  assignedParticipantIds: string[];
  advancedSplitType: DraftAdvancedSplitType;
  advancedSplits: DraftAdvancedSplitEntry[];
}

interface DraftParticipant {
  id: string;
  name: string;
  userId?: string;
  isCurrentUser: boolean;
}

function isLikelyUserId(value: string): boolean {
  return /^[a-z0-9]{15}$/i.test(value.trim());
}

function isSyntheticFriendEmail(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized.endsWith('@friend.local') || normalized.endsWith('@invite.local');
}

function sanitizeParticipantName(value: string, fallback: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue || isLikelyUserId(trimmedValue)) {
    return fallback;
  }

  return trimmedValue;
}

function normalizeFriendName(friend: FriendRecord): string {
  const trimmedName = friend.name.trim();
  if (trimmedName) {
    return sanitizeParticipantName(trimmedName, 'Friend');
  }

  const trimmedEmail = friend.email.trim();
  if (trimmedEmail && !isSyntheticFriendEmail(trimmedEmail)) {
    return sanitizeParticipantName(trimmedEmail.split('@')[0] ?? '', 'Friend');
  }

  return 'Friend';
}

function normalizeNameKey(value: string): string {
  return value.trim().toLowerCase();
}

function toCurrencyInput(value: number): string {
  return value.toFixed(2);
}

function roundToCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatPercentageDisplay(value: number): string {
  if (!Number.isFinite(value)) {
    return '0%';
  }

  if (value <= 0) {
    return '0%';
  }

  return `${Math.ceil(value)}%`;
}

function getAdvancedSplitRawValue(
  split: DraftAdvancedSplitEntry,
  splitType: DraftAdvancedSplitType,
): string {
  return splitType === 'percentage' ? split.percentageValue : split.amountValue;
}

function isAdvancedSplitLocked(
  split: DraftAdvancedSplitEntry,
  splitType: DraftAdvancedSplitType,
): boolean {
  return splitType === 'percentage' ? split.percentageLocked : split.amountLocked;
}

function setAdvancedSplitRawValue(
  split: DraftAdvancedSplitEntry,
  splitType: DraftAdvancedSplitType,
  value: string,
): DraftAdvancedSplitEntry {
  return splitType === 'percentage'
    ? { ...split, percentageValue: value }
    : { ...split, amountValue: value };
}

function setAdvancedSplitLocked(
  split: DraftAdvancedSplitEntry,
  splitType: DraftAdvancedSplitType,
  isLocked: boolean,
): DraftAdvancedSplitEntry {
  return splitType === 'percentage'
    ? { ...split, percentageLocked: isLocked }
    : { ...split, amountLocked: isLocked };
}

function resolveSplitTarget(
  splitType: DraftAdvancedSplitType,
  totalAmount: number,
): number {
  if (splitType === 'percentage') {
    return 100;
  }

  return Number.isFinite(totalAmount) && totalAmount > 0 ? roundToCurrency(totalAmount) : 0;
}

function redistributeAdvancedSplits(
  splits: DraftAdvancedSplitEntry[],
  splitType: DraftAdvancedSplitType,
  totalAmount: number,
): DraftAdvancedSplitEntry[] {
  if (splits.length === 0) {
    return splits;
  }

  const target = resolveSplitTarget(splitType, totalAmount);
  const unlockedIndexes: number[] = [];
  let lockedTotal = 0;

  splits.forEach((split, index) => {
    if (!isAdvancedSplitLocked(split, splitType)) {
      unlockedIndexes.push(index);
      return;
    }

    const parsedValue = Number(getAdvancedSplitRawValue(split, splitType));
    if (Number.isFinite(parsedValue) && parsedValue >= 0) {
      lockedTotal += parsedValue;
    }
  });

  if (unlockedIndexes.length === 0) {
    return splits;
  }

  const remaining = roundToCurrency(Math.max(0, target - lockedTotal));
  const evenValue = unlockedIndexes.length > 0 ? remaining / unlockedIndexes.length : 0;
  let distributed = 0;

  const nextSplits = splits.map((split, index) => {
    if (!unlockedIndexes.includes(index)) {
      return split;
    }

    const roundedValue = roundToCurrency(evenValue);
    distributed += roundedValue;
    return setAdvancedSplitRawValue(split, splitType, toCurrencyInput(roundedValue));
  });

  const roundingDifference = roundToCurrency(remaining - distributed);
  if (Math.abs(roundingDifference) > 0) {
    const firstUnlockedIndex = unlockedIndexes[0];
    const currentValue = Number(getAdvancedSplitRawValue(nextSplits[firstUnlockedIndex], splitType));
    const normalizedCurrentValue = Number.isFinite(currentValue) ? currentValue : 0;
    const adjustedValue = Math.max(0, roundToCurrency(normalizedCurrentValue + roundingDifference));
    nextSplits[firstUnlockedIndex] = setAdvancedSplitRawValue(
      nextSplits[firstUnlockedIndex],
      splitType,
      toCurrencyInput(adjustedValue),
    );
  }

  return nextSplits;
}

function buildDefaultAdvancedSplits(
  participantIds: string[],
  totalAmount: number,
): DraftAdvancedSplitEntry[] {
  const baseSplits: DraftAdvancedSplitEntry[] = participantIds.map((participantId) => ({
    participantId,
    percentageValue: '',
    amountValue: '',
    percentageLocked: false,
    amountLocked: false,
  }));

  const withEvenPercentages = redistributeAdvancedSplits(baseSplits, 'percentage', totalAmount);
  return redistributeAdvancedSplits(withEvenPercentages, 'amount', totalAmount);
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function inferEditSplitMode(bill: BillRecord): CreateBillSplitMode {
  if (bill.splitMode === 'itemized' || bill.extrasSplitMode === 'proportional') {
    return 'custom';
  }

  if (bill.splitMode === 'custom') {
    return 'manual';
  }

  if (bill.participants.length <= 1) {
    return 'equal';
  }

  const baselineAmount = roundToCurrency(bill.participants[0]?.amountOwed ?? 0);
  const allEqual = bill.participants.every(
    (participant) => Math.abs(roundToCurrency(participant.amountOwed) - baselineAmount) < 0.01,
  );

  return allEqual ? 'equal' : 'manual';
}

export function CreateBillScreen({ navigation, route }: CreateBillScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const editBillId = route.params?.billId;
  const isEditMode = Boolean(editBillId);

  const [splitMode, setSplitMode] = useState<CreateBillSplitMode>('equal');
  const [billTitle, setBillTitle] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
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
  const [payerParticipantId, setPayerParticipantId] = useState('');
  const [isPayerDropdownOpen, setIsPayerDropdownOpen] = useState(false);
  const [owedAmountOverrides, setOwedAmountOverrides] = useState<Record<string, string>>({});
  const [participantRecordIdByDraftId, setParticipantRecordIdByDraftId] = useState<Record<string, string>>({});
  const [isEditHydrated, setIsEditHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const friendsQuery = useQuery({
    queryKey: ['feature', 'friends'],
    queryFn: listFriends,
  });

  const billQuery = useQuery({
    queryKey: ['feature', 'bill', editBillId],
    queryFn: () => getBillById(editBillId as string),
    enabled: isEditMode,
  });

  const acceptedFriends = useMemo(
    () => (friendsQuery.data ?? []).filter((friend) => friend.status === 'friend'),
    [friendsQuery.data],
  );
  const shouldShowFriendSearch = acceptedFriends.length > 5;
  const isEqualSplitMode = splitMode === 'equal';
  const isCustomSplitMode = splitMode === 'custom';
  const isManualSplitMode = splitMode === 'manual';
  const extrasSplitMode: 'equal' | 'proportional' = isCustomSplitMode ? 'proportional' : 'equal';

  const visibleFriends = useMemo(() => {
    const normalizedQuery = friendSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return acceptedFriends;
    }

    return acceptedFriends.filter((friend) => {
      const friendName = normalizeFriendName(friend).toLowerCase();
      const friendEmail = friend.email.toLowerCase();
      return friendName.includes(normalizedQuery) || friendEmail.includes(normalizedQuery);
    });
  }, [acceptedFriends, friendSearchQuery]);

  const currentUserName = sanitizeParticipantName(user?.name?.trim() || user?.email?.split('@')[0] || 'You', 'You');
  const currentUserDraftId = user?.id ? `user:${user.id}` : 'user:self';

  const participants = useMemo<DraftParticipant[]>(() => {
    const mappedParticipants: DraftParticipant[] = [
      {
        id: currentUserDraftId,
        name: currentUserName,
        userId: user?.id,
        isCurrentUser: true,
      },
    ];

    selectedFriendIds.forEach((friendId) => {
      const friend = acceptedFriends.find((candidate) => candidate.id === friendId);
      if (!friend) {
        return;
      }

      if (!friend.userId?.trim()) {
        return;
      }

      mappedParticipants.push({
        id: `user:${friend.id}`,
        name: normalizeFriendName(friend),
        userId: friend.userId,
        isCurrentUser: false,
      });
    });

    return mappedParticipants;
  }, [acceptedFriends, currentUserDraftId, currentUserName, selectedFriendIds, user?.id]);

  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    setSplitMode('equal');
    setBillTitle('');
    setSelectedFriendIds([]);
    setFriendSearchQuery('');
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
    setPayerParticipantId('');
    setIsPayerDropdownOpen(false);
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
    const friendByName = new Map<string, FriendRecord>();
    const duplicateFriendNameKeys = new Set<string>();
    acceptedFriends.forEach((friend) => {
      const nameKey = normalizeNameKey(normalizeFriendName(friend));
      if (!nameKey) {
        return;
      }

      if (friendByName.has(nameKey)) {
        duplicateFriendNameKeys.add(nameKey);
        return;
      }

      friendByName.set(nameKey, friend);
    });
    const nextSelectedFriendIds: string[] = [];
    const draftIdByParticipantRecordId = new Map<string, string>();
    const nextParticipantRecordIdByDraftId: Record<string, string> = {};
    const nextOwedOverrides: Record<string, string> = {};
    const unresolvedParticipants: string[] = [];
    let paidDraftParticipantId = '';

    bill.participants.forEach((participant) => {
      let draftParticipantId = '';
      if (participant.userId && participant.userId === user?.id) {
        draftParticipantId = currentUserDraftId;
      } else {
        let friend: FriendRecord | undefined;
        if (participant.userId) {
          friend = friendByUserId.get(participant.userId);
        }

        if (!friend && participant.name.trim()) {
          const participantNameKey = normalizeNameKey(participant.name);
          if (!duplicateFriendNameKeys.has(participantNameKey)) {
            friend = friendByName.get(participantNameKey);
          }
        }

        if (friend) {
          if (!nextSelectedFriendIds.includes(friend.id)) {
            nextSelectedFriendIds.push(friend.id);
          }
          draftParticipantId = `user:${friend.id}`;
        }
      }

      if (!draftParticipantId) {
        unresolvedParticipants.push(participant.name);
        return;
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
    setErrorMessage(
      unresolvedParticipants.length > 0
        ? 'Some bill participants are unavailable in your friend list and were omitted from edit mode.'
        : null,
    );
    setIsEditHydrated(true);
  }, [
    acceptedFriends,
    billQuery.data,
    billQuery.isLoading,
    currentUserDraftId,
    friendsQuery.isLoading,
    isEditHydrated,
    isEditMode,
    user?.id,
  ]);

  useEffect(() => {
    if (participants.length === 0) {
      setPayerParticipantId('');
      return;
    }

    setPayerParticipantId((currentValue) =>
      participants.some((participant) => participant.id === currentValue)
        ? currentValue
        : participants[0].id,
    );
  }, [participants]);

  useEffect(() => {
    setIsPayerDropdownOpen(false);
  }, [participants]);

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
    const amountMap = new Map<string, number>();
    participantIds.forEach((participantId) => {
      amountMap.set(participantId, 0);
    });

    if (participantIds.length === 0) {
      return amountMap;
    }

    if (!isCustomSplitMode) {
      const normalizedTotal = roundToCurrency(previewTotal);
      const evenAmount = participantIds.length > 0 ? normalizedTotal / participantIds.length : 0;
      let roundedTotal = 0;

      participantIds.forEach((participantId) => {
        const roundedAmount = roundToCurrency(evenAmount);
        amountMap.set(participantId, roundedAmount);
        roundedTotal += roundedAmount;
      });

      const roundingDifference = roundToCurrency(normalizedTotal - roundedTotal);
      if (Math.abs(roundingDifference) > 0 && participantIds.length > 0) {
        const firstParticipantId = participantIds[0];
        amountMap.set(
          firstParticipantId,
          roundToCurrency((amountMap.get(firstParticipantId) ?? 0) + roundingDifference),
        );
      }

      return amountMap;
    }

    const participantIdSet = new Set(participantIds);
    let computedSubtotal = 0;

    items.forEach((item) => {
      const parsedPrice = Number(item.price);
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        return;
      }

      const normalizedPrice = roundToCurrency(parsedPrice);
      computedSubtotal += normalizedPrice;

      if (item.splitMode === 'advanced' && item.advancedSplits.length > 0) {
        item.advancedSplits.forEach((split) => {
          if (!participantIdSet.has(split.participantId)) {
            return;
          }

          const splitValue = Number(getAdvancedSplitRawValue(split, item.advancedSplitType));
          if (!Number.isFinite(splitValue) || splitValue <= 0) {
            return;
          }

          const amount =
            item.advancedSplitType === 'percentage'
              ? (normalizedPrice * splitValue) / 100
              : splitValue;

          const currentAmount = amountMap.get(split.participantId) ?? 0;
          amountMap.set(split.participantId, currentAmount + amount);
        });

        return;
      }

      const assignedParticipantIds = item.assignedParticipantIds.filter((participantId) =>
        participantIdSet.has(participantId),
      );

      if (assignedParticipantIds.length === 0) {
        return;
      }

      const perParticipantAmount = normalizedPrice / assignedParticipantIds.length;
      assignedParticipantIds.forEach((participantId) => {
        const currentAmount = amountMap.get(participantId) ?? 0;
        amountMap.set(participantId, currentAmount + perParticipantAmount);
      });
    });

    if (extrasSplitMode === 'proportional') {
      participantIds.forEach((participantId) => {
        const baseAmount = amountMap.get(participantId) ?? 0;
        const proportion = computedSubtotal > 0 ? baseAmount / computedSubtotal : 0;
        amountMap.set(participantId, baseAmount + (effectiveDistributableExtrasTotal * proportion));
      });
    } else {
      const extrasPerParticipant = participantIds.length > 0
        ? effectiveDistributableExtrasTotal / participantIds.length
        : 0;
      participantIds.forEach((participantId) => {
        const baseAmount = amountMap.get(participantId) ?? 0;
        amountMap.set(participantId, baseAmount + extrasPerParticipant);
      });
    }

    if (isCustomTipEnabled) {
      const tipContributionMap = new Map<string, number>();
      participantIds.forEach((participantId) => {
        tipContributionMap.set(participantId, 0);
      });

      customTipSplits.forEach((split) => {
        if (!tipContributionMap.has(split.participantId)) {
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
        tipContributionMap.set(split.participantId, (tipContributionMap.get(split.participantId) ?? 0) + contribution);
      });

      participantIds.forEach((participantId) => {
        const baseAmount = amountMap.get(participantId) ?? 0;
        const tipContribution = tipContributionMap.get(participantId) ?? 0;
        amountMap.set(participantId, baseAmount + tipContribution);
      });
    }

    let roundedTotal = 0;
    participantIds.forEach((participantId) => {
      const roundedAmount = roundToCurrency(amountMap.get(participantId) ?? 0);
      amountMap.set(participantId, roundedAmount);
      roundedTotal += roundedAmount;
    });

    const expectedTotal = roundToCurrency(previewTotal);
    const roundingDifference = roundToCurrency(expectedTotal - roundedTotal);
    if (Math.abs(roundingDifference) > 0 && participantIds.length > 0) {
      const firstParticipantId = participantIds[0];
      amountMap.set(
        firstParticipantId,
        roundToCurrency((amountMap.get(firstParticipantId) ?? 0) + roundingDifference),
      );
    }

    return amountMap;
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

  const owedAmountEntries = useMemo(
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

  const styles = StyleSheet.create({
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
      ...theme.typography.bodyLg,
      fontWeight: '700',
      lineHeight: 22,
    },
    sectionHint: {
      color: theme.colors.text.muted,
      ...theme.typography.bodySm,
      lineHeight: 17,
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
      backgroundColor: theme.colors.text.brand,
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
      ...theme.typography.label,
      fontWeight: '700',
      lineHeight: 18,
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
      ...theme.typography.label,
      fontWeight: '700',
      lineHeight: 18,
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
      backgroundColor: theme.colors.text.brand,
      borderColor: theme.colors.text.brand,
    },
    assignmentChipLabel: {
      color: theme.colors.text.secondary,
      ...theme.typography.bodySm,
      fontWeight: '600',
      lineHeight: 16,
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
      ...theme.typography.label,
      fontWeight: '600',
      lineHeight: 18,
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
      ...theme.typography.label,
      fontWeight: '600',
      lineHeight: 18,
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
      ...theme.typography.bodySm,
      lineHeight: 17,
    },
    friendRowSelected: {
      backgroundColor: theme.colors.status.infoBg,
    },
    friendSearchInput: {
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
      ...theme.typography.bodyMd,
      fontWeight: '700',
      lineHeight: 20,
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
      ...theme.typography.bodyLg,
      lineHeight: 22,
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
      ...theme.typography.button,
      fontWeight: '700',
      lineHeight: 20,
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
      ...theme.typography.label,
    },
    totalsLabelStrong: {
      color: theme.colors.text.primary,
      ...theme.typography.bodyMd,
      fontWeight: '700',
      lineHeight: 20,
    },
    totalsValue: {
      color: theme.colors.text.primary,
      ...theme.typography.label,
      fontWeight: '700',
      lineHeight: 18,
    },
    totalsValueStrong: {
      color: theme.colors.text.primary,
      ...theme.typography.bodyLg,
      fontWeight: '700',
      lineHeight: 24,
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
  });

  const selectedPayer = participants.find((participant) => participant.id === payerParticipantId);
  const selectedPayerLabel = selectedPayer?.name ?? 'Select payer';
  const trackSubmitValidationFailed = (reason: string) => {
    trackObservabilityEvent('CREATE_BILL_SUBMIT_VALIDATION_FAILED', {
      source: 'CreateBillScreen',
      reason,
      isEditMode,
      splitMode,
      selectedFriendCount: selectedFriendIds.length,
      itemCount: items.length,
    });
  };

  const toggleFriend = (friendId: string) => {
    setSelectedFriendIds((currentIds) => {
      const wasSelected = currentIds.includes(friendId);
      const nextIds = wasSelected
        ? currentIds.filter((currentId) => currentId !== friendId)
        : [...currentIds, friendId];
      trackObservabilityEvent('CREATE_BILL_FRIEND_TOGGLED', {
        source: 'CreateBillScreen',
        friendId,
        selected: !wasSelected,
        selectedFriendCount: nextIds.length,
      });
      return nextIds;
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

  const resolveParticipantRecordId = (draftParticipantId: string): string | null => {
    if (!isEditMode) {
      return draftParticipantId;
    }

    return participantRecordIdByDraftId[draftParticipantId] ?? null;
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

  const handleCreateBill = async () => {
    if (!billTitle.trim()) {
      trackSubmitValidationFailed('missing_bill_name');
      setErrorMessage('Bill name is required.');
      return;
    }

    if (selectedFriendIds.length === 0) {
      trackSubmitValidationFailed('missing_friends');
      setErrorMessage('Select at least one friend to split with.');
      return;
    }

    if (participants.length !== selectedFriendIds.length + 1) {
      trackSubmitValidationFailed('friend_resolution_failed');
      setErrorMessage('Could not resolve one or more selected friends. Refresh and try again.');
      return;
    }

    if (isEditMode && !isEditHydrated) {
      trackSubmitValidationFailed('edit_bill_not_hydrated');
      setErrorMessage('Bill details are still loading. Please wait a moment and try again.');
      return;
    }

    if (isEqualSplitMode || isManualSplitMode) {
      if (!Number.isFinite(parsedEqualTotal) || parsedEqualTotal <= 0) {
        trackSubmitValidationFailed('invalid_equal_total');
        setErrorMessage('Enter a valid total bill price.');
        return;
      }
    } else {
      if (items.length === 0) {
        trackSubmitValidationFailed('missing_items');
        setErrorMessage('Add at least one item.');
        return;
      }

      if (
        !Number.isFinite(parsedTax) ||
        parsedTax < 0 ||
        !Number.isFinite(parsedTip) ||
        parsedTip < 0 ||
        !Number.isFinite(parsedFees) ||
        parsedFees < 0
      ) {
        trackSubmitValidationFailed('invalid_tax_tip_fees');
        setErrorMessage('Tax, tip, and fees must be valid non-negative values.');
        return;
      }

      if (hasFinalTotalOverride && (!Number.isFinite(parsedFinalTotal) || parsedFinalTotal <= 0)) {
        trackSubmitValidationFailed('invalid_final_total');
        setErrorMessage('Final price must be a valid amount greater than zero.');
        return;
      }

      if (isCustomTipEnabled && !isCustomTipSplitBalanced) {
        trackSubmitValidationFailed('custom_tip_unbalanced');
        setErrorMessage('Custom tip split must match the tip total.');
        return;
      }
    }

    if (!Number.isFinite(previewTotal) || previewTotal <= 0) {
      trackSubmitValidationFailed('invalid_total_amount');
      setErrorMessage('Total bill amount must be greater than zero.');
      return;
    }

    if (owedAmountEntries.some((entry) => entry.amount < 0)) {
      trackSubmitValidationFailed('negative_participant_amount');
      setErrorMessage('Final price cannot reduce any participant below $0.00.');
      return;
    }

    if (!payerParticipantId) {
      trackSubmitValidationFailed('missing_payer');
      setErrorMessage('Select who paid the bill.');
      return;
    }

    if (isEditMode && !editBillId) {
      trackSubmitValidationFailed('missing_edit_bill_id');
      setErrorMessage('Bill could not be loaded for editing.');
      return;
    }

    if (isEditMode && !billQuery.data) {
      trackSubmitValidationFailed('missing_edit_bill');
      setErrorMessage('Bill could not be loaded for editing.');
      return;
    }

    const participantRecordIdLookup = new Map<string, string>();
    participants.forEach((participant) => {
      const existingParticipantRecordId = resolveParticipantRecordId(participant.id);
      participantRecordIdLookup.set(
        participant.id,
        existingParticipantRecordId ?? createEntityId('bill_participant'),
      );
    });

    const resolveMappedParticipantId = (draftParticipantId: string): string | null =>
      participantRecordIdLookup.get(draftParticipantId) ?? null;

    const itemRecords: BillItemRecord[] = [];

    if (isEqualSplitMode || isManualSplitMode) {
      const mappedAssignedParticipantIds = participantIds
        .map((participantId) => resolveMappedParticipantId(participantId))
        .filter((participantId): participantId is string => Boolean(participantId));
      if (mappedAssignedParticipantIds.length === 0) {
        trackSubmitValidationFailed('missing_mapped_participants');
        setErrorMessage('Could not resolve bill participants.');
        return;
      }

      itemRecords.push({
        id: isEditMode ? (existingEvenModeItemId ?? createEntityId('bill_item')) : createEntityId('bill_item'),
        itemName: billTitle.trim(),
        price: roundToCurrency(previewTotal),
        assignedToParticipantIds: mappedAssignedParticipantIds,
        splitMode: 'simple',
        splitConfig: null,
      });
    } else {
      for (const [itemIndex, item] of items.entries()) {
        const parsedPrice = Number(item.price);
        if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
          trackSubmitValidationFailed('invalid_item_price');
          setErrorMessage(`Item price is invalid for ${item.name}.`);
          return;
        }

        const normalizedItemName = item.name.trim() || `Item ${itemIndex + 1}`;

        if (!normalizedItemName) {
          trackSubmitValidationFailed('missing_item_name');
          setErrorMessage('Each item needs a name.');
          return;
        }

        if (item.splitMode === 'advanced') {
          if (item.advancedSplits.length === 0) {
            trackSubmitValidationFailed('missing_advanced_split_participants');
            setErrorMessage(`Add participants for complex split on ${normalizedItemName}.`);
            return;
          }

          const parsedSplitConfig: BillItemSplitConfig[] = [];
          for (const split of item.advancedSplits) {
            const mappedSplitParticipantId = resolveMappedParticipantId(split.participantId);
            if (!mappedSplitParticipantId) {
              continue;
            }

            const splitValue = Number(getAdvancedSplitRawValue(split, item.advancedSplitType));
            if (!Number.isFinite(splitValue) || splitValue <= 0) {
              trackSubmitValidationFailed('invalid_advanced_split_value');
              setErrorMessage(`Split value is invalid for ${normalizedItemName}.`);
              return;
            }

            parsedSplitConfig.push({
              participantId: mappedSplitParticipantId,
              type: item.advancedSplitType,
              value: roundToCurrency(splitValue),
            });
          }

          if (parsedSplitConfig.length === 0) {
            trackSubmitValidationFailed('missing_advanced_split_config');
            setErrorMessage(`Add participants for complex split on ${normalizedItemName}.`);
            return;
          }

          const splitTotal = roundToCurrency(
            parsedSplitConfig.reduce((sum, split) => sum + split.value, 0),
          );
          if (item.advancedSplitType === 'percentage' && Math.abs(splitTotal - 100) > 0.01) {
            trackSubmitValidationFailed('advanced_percentage_mismatch');
            setErrorMessage(`${normalizedItemName} percentages must total 100%.`);
            return;
          }

          if (item.advancedSplitType === 'amount' && Math.abs(splitTotal - roundToCurrency(parsedPrice)) > 0.01) {
            trackSubmitValidationFailed('advanced_amount_mismatch');
            setErrorMessage(`${normalizedItemName} amount splits must equal item price.`);
            return;
          }

          itemRecords.push({
            id: isEditMode ? item.id : createEntityId('bill_item'),
            itemName: normalizedItemName,
            price: roundToCurrency(parsedPrice),
            assignedToParticipantIds: parsedSplitConfig.map((split) => split.participantId),
            splitMode: 'advanced',
            splitConfig: parsedSplitConfig,
          });
          continue;
        }

        const normalizedAssignedParticipantIds = item.assignedParticipantIds
          .map((participantId) => resolveMappedParticipantId(participantId))
          .filter(
            (participantId, index, collection): participantId is string =>
              Boolean(participantId) && collection.indexOf(participantId) === index,
        );

        if (normalizedAssignedParticipantIds.length === 0) {
          trackSubmitValidationFailed('missing_simple_split_participants');
          setErrorMessage(`Assign at least one participant for ${normalizedItemName}.`);
          return;
        }

        itemRecords.push({
          id: isEditMode ? item.id : createEntityId('bill_item'),
          itemName: normalizedItemName,
          price: roundToCurrency(parsedPrice),
          assignedToParticipantIds: normalizedAssignedParticipantIds,
          splitMode: 'simple',
          splitConfig: null,
        });
      }
    }

    const participantRecords: BillParticipantRecord[] = [];

    const invalidAmounts: string[] = [];

    participants.forEach((participant) => {
      const suggestedAmount = suggestedAmounts.get(participant.id) ?? 0;
      const rawAmount = isManualSplitMode
        ? owedAmountOverrides[participant.id] ?? ''
        : toCurrencyInput(suggestedAmount);
      const parsedAmount = Number(rawAmount);
      const hasManualInput = !isManualSplitMode || rawAmount.trim().length > 0;
      if (!hasManualInput || !Number.isFinite(parsedAmount) || parsedAmount < 0) {
        invalidAmounts.push(participant.name);
      }

      const mappedParticipantId = resolveMappedParticipantId(participant.id);
      if (!mappedParticipantId) {
        invalidAmounts.push(participant.name);
        return;
      }

      participantRecords.push({
        id: mappedParticipantId,
        name: participant.name,
        userId: participant.userId,
        amountOwed: Number.isFinite(parsedAmount) ? roundToCurrency(parsedAmount) : 0,
        customTipContribution: isCustomSplitMode && isCustomTipEnabled
          ? roundToCurrency(customTipContributionMap.get(participant.id) ?? 0)
          : undefined,
        paidStatus: participant.id === payerParticipantId ? 'paid' : 'pending',
      });
    });

    if (invalidAmounts.length > 0) {
      trackSubmitValidationFailed('invalid_participant_amount');
      setErrorMessage(`Amount owed is invalid for ${invalidAmounts[0]}.`);
      return;
    }

    if (!validateBillTotal(participantRecords, previewTotal)) {
      trackSubmitValidationFailed('bill_total_mismatch');
      setErrorMessage('Amounts owed must match the total bill amount.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('CREATE_BILL_SUBMIT_STARTED', {
      source: 'CreateBillScreen',
      isEditMode,
      splitMode,
      itemCount: itemRecords.length,
      participantCount: participantRecords.length,
      isOnline,
    });
    setIsCreating(true);

    try {
      const billPayload = {
        title: billTitle.trim(),
        restaurantName: billTitle.trim(),
        items: itemRecords,
        participants: participantRecords,
        totalAmount: roundToCurrency(previewTotal),
        tax: isCustomSplitMode ? roundToCurrency(parsedTax) : 0,
        tip: isCustomSplitMode ? roundToCurrency(parsedTip) : 0,
        fees: isCustomSplitMode ? roundToCurrency(parsedFees) : 0,
        extrasSplitMode,
      };

      if (!isOnline) {
        if (isEditMode && editBillId) {
          await queueFeatureOutbox('bill.update', {
            billId: editBillId,
            updates: billPayload,
          });
        } else {
          await queueFeatureOutbox('bill.create', {
            ...billPayload,
            createdByUserId: user?.id ?? 'unknown_user',
          });
        }

        await queryClient.invalidateQueries({ queryKey: ['feature', 'bills'] });
        trackObservabilityEvent('CREATE_BILL_SUBMIT_SUCCEEDED', {
          source: 'CreateBillScreen',
          isEditMode,
          splitMode,
          queued: true,
        });
        showQueuedOfflineAlert('Bill');
        navigation.navigate('Bills');
        return;
      }

      await queueWrite(isEditMode ? 'bill.update' : 'bill.create');

      const savedBill = isEditMode
        ? await updateBill(editBillId as string, billPayload)
        : await createBill({
            ...billPayload,
            createdByUserId: user?.id ?? 'unknown_user',
          });

      await queryClient.invalidateQueries({ queryKey: ['feature', 'bills'] });
      await queryClient.invalidateQueries({ queryKey: ['feature', 'bill', savedBill.id] });
      trackObservabilityEvent('CREATE_BILL_SUBMIT_SUCCEEDED', {
        source: 'CreateBillScreen',
        isEditMode,
        splitMode,
        queued: false,
        billId: savedBill.id,
      });
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
            <Text style={styles.sectionTitle}>Split Type</Text>
          </View>
          <SegmentedControl
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
          <Text style={styles.sectionHint}>
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
          <Text style={styles.sectionTitle}>Bill Name</Text>
        </View>
        <Input
          onChangeText={setBillTitle}
          placeholder="Dinner at Nori"
          value={billTitle}
        />
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionTitleRow}>
          <Ionicons color={theme.colors.text.secondary} name="people-outline" size={16} />
          <Text style={styles.sectionTitle}>Select Friends</Text>
        </View>
        <Text style={styles.sectionHint}>You are always included in the bill.</Text>
        {shouldShowFriendSearch ? (
          <Input
            containerStyle={styles.friendSearchInput}
            onChangeText={setFriendSearchQuery}
            placeholder="Search friends"
            value={friendSearchQuery}
          />
        ) : null}

        {friendsQuery.isLoading ? (
          <View style={styles.loadingRow}>
            <Skeleton height={20} />
            <Skeleton height={20} />
            <Skeleton height={20} />
          </View>
        ) : null}

        {!friendsQuery.isLoading && acceptedFriends.length === 0 ? (
          <Text style={styles.sectionHint}>No friends available. Add friends first to split a bill.</Text>
        ) : null}

        {!friendsQuery.isLoading && acceptedFriends.length > 0 && visibleFriends.length === 0 ? (
          <Text style={styles.sectionHint}>No friends match your search.</Text>
        ) : null}

        {!friendsQuery.isLoading && visibleFriends.length > 0 ? (
          <OptionList>
            {visibleFriends.map((friend, index) => {
              const isSelected = selectedFriendIds.includes(friend.id);
              const friendSubtitle = isSyntheticFriendEmail(friend.email) ? undefined : friend.email;
              return (
                <OptionListRow
                  chevron={false}
                  isLast={index === visibleFriends.length - 1}
                  key={friend.id}
                  leading={(
                    <Ionicons
                      color={isSelected ? theme.colors.text.brand : theme.colors.text.muted}
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={20}
                    />
                  )}
                  onPress={() => {
                    toggleFriend(friend.id);
                  }}
                  style={isSelected ? styles.friendRowSelected : undefined}
                  subtitle={friendSubtitle}
                  title={normalizeFriendName(friend)}
                />
              );
            })}
          </OptionList>
        ) : null}

        <Text style={styles.selectedFriendsSummary}>
          {selectedFriendIds.length} friend{selectedFriendIds.length === 1 ? '' : 's'} selected
        </Text>
      </Card>

      {(isEqualSplitMode || isManualSplitMode) ? (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons color={theme.colors.text.secondary} name="cash-outline" size={16} />
            <Text style={styles.sectionTitle}>Total Bill Price</Text>
          </View>
          <Input
            keyboardType="decimal-pad"
            onChangeText={setEqualTotalInput}
            placeholder="0.00"
            value={equalTotalInput}
          />
          <Text style={styles.sectionHint}>
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
          <Text style={styles.sectionTitle}>Items</Text>
        </View>
        <Text style={styles.sectionHint}>
          Custom mode: add items, then choose simple or complex assignment per item.
        </Text>

        <View style={styles.itemComposerRow}>
          <Input
            containerStyle={styles.itemNameInput}
            onChangeText={setDraftItemName}
            placeholder="Item name"
            value={draftItemName}
          />
          <Input
            containerStyle={styles.itemPriceInput}
            keyboardType="decimal-pad"
            onChangeText={setDraftItemPrice}
            placeholder="0.00"
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
            <Text style={styles.addItemButtonLabel}>+ Add Item</Text>
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
                        <Text style={styles.itemPrice}>{formatCurrency(Number(item.price) || 0)}</Text>
                        <Pressable
                          accessibilityLabel={`Remove ${item.name}`}
                          onPress={() => {
                            removeItem(item.id);
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
                          <Text style={styles.sectionHint}>Choose who shares this item.</Text>
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
                          <Text style={styles.sectionHint}>Choose participants and enter split values.</Text>
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
                                <Text style={styles.advancedSplitLabel}>{participant.name}</Text>
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
          <Text style={styles.sectionHint}>Add at least one item with a price.</Text>
        )}
        </Card>
      ) : null}

      {isCustomSplitMode ? (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons color={theme.colors.text.secondary} name="calculator-outline" size={16} />
            <Text style={styles.sectionTitle}>Tax, Tip, Fees</Text>
          </View>

          <View style={styles.tripleInputRow}>
            <Input
              containerStyle={styles.tripleInputItem}
              keyboardType="decimal-pad"
              label="Tax"
              onChangeText={setTaxInput}
              placeholder="0.00"
              value={taxInput}
            />
            <Input
              containerStyle={styles.tripleInputItem}
              keyboardType="decimal-pad"
              label="Fees"
              onChangeText={setFeesInput}
              placeholder="0.00"
              value={feesInput}
            />
            {!isCustomTipEnabled ? (
              <Input
                containerStyle={styles.tripleInputItem}
                keyboardType="decimal-pad"
                label="Tip"
                onChangeText={setTipInput}
                placeholder="0.00"
                value={tipInput}
              />
            ) : null}
          </View>

          {!isCustomTipEnabled ? (
            <Pressable
              accessibilityRole="button"
              onPress={enableCustomTipSplit}
              style={styles.customTipToggle}
            >
              <Text style={styles.customTipToggleLabel}>Custom tip</Text>
            </Pressable>
          ) : (
            <View style={styles.customTipEditor}>
              <View style={styles.customTipHeaderRow}>
                <Text variant="label">Custom Tip</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={disableCustomTipSplit}
                  style={styles.customTipToggle}
                >
                  <Text style={styles.customTipToggleLabel}>Cancel custom tip</Text>
                </Pressable>
              </View>

              <Input
                keyboardType="decimal-pad"
                label="Tip"
                onChangeText={setTipInput}
                placeholder="0.00"
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

              {participants.map((participant) => {
                const split = customTipSplits.find((entry) => entry.participantId === participant.id);
                if (!split) {
                  return null;
                }

                const isLocked = isAdvancedSplitLocked(split, customTipSplitType);
                return (
                  <View key={`custom-tip:${participant.id}`} style={styles.advancedSplitValueRow}>
                    <Text style={styles.advancedSplitLabel}>{participant.name}</Text>
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
          <View style={styles.sectionTitleRow}>
            <Ionicons color={theme.colors.text.secondary} name="receipt-outline" size={16} />
            <Text style={styles.sectionTitle}>Final Price</Text>
            <StatusPill label="Optional" tone="muted" />
          </View>

          <Input
            keyboardType="decimal-pad"
            label="Final Price"
            onChangeText={setFinalTotalInput}
            placeholder="0.00"
            value={finalTotalInput}
          />

          <Text style={styles.sectionHint}>
            Leave this blank to use items plus tax, tip, and fees. If you enter a final price, the difference is spread
            across the split automatically.
          </Text>
          <Text style={styles.sectionHint}>
            Current calculated total: {formatCurrency(roundToCurrency(computedCustomTotal))}
          </Text>
        </Card>
      ) : null}

      <Card style={styles.sectionCard}>
        <View style={styles.sectionTitleRow}>
          <Ionicons color={theme.colors.text.secondary} name="wallet-outline" size={16} />
          <Text style={styles.sectionTitle}>Payer & Owed Amounts</Text>
        </View>

        <View style={styles.payerSection}>
          <View style={styles.subsectionTitleRow}>
            <Ionicons color={theme.colors.text.info} name="person-outline" size={15} />
            <Text style={styles.subsectionTitle}>Step 1: Who paid the bill?</Text>
            <StatusPill label="Required" tone="info" />
          </View>
          <Text style={styles.sectionHint}>
            Choose the payer first. Owed amounts below depend on this selection.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setIsPayerDropdownOpen((currentValue) => !currentValue);
            }}
            style={[
              styles.payerDropdownTrigger,
              isPayerDropdownOpen ? styles.payerDropdownTriggerOpen : null,
            ]}
          >
            <Text numberOfLines={1} style={styles.payerDropdownLabel}>
              {selectedPayerLabel}
            </Text>
            <Ionicons
              color={theme.colors.text.muted}
              name={isPayerDropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
            />
          </Pressable>

          {isPayerDropdownOpen ? (
            <OptionList style={styles.payerOptionsList}>
              {participants.map((participant, index) => {
                const isSelected = participant.id === payerParticipantId;
                return (
                  <OptionListRow
                    chevron={false}
                    isLast={index === participants.length - 1}
                    key={participant.id}
                    onPress={() => {
                      setPayerParticipantId(participant.id);
                      setIsPayerDropdownOpen(false);
                    }}
                    rightAccessory={
                      isSelected ? (
                        <Ionicons color={theme.colors.text.info} name="checkmark" size={18} />
                      ) : null
                    }
                    title={participant.name}
                  />
                );
              })}
            </OptionList>
          ) : null}
        </View>

        <View style={styles.owedSection}>
          <View style={styles.subsectionTitleRow}>
            <Ionicons color={theme.colors.text.secondary} name="list-outline" size={15} />
            <Text style={styles.subsectionTitle}>
              {isEqualSplitMode
                ? 'Step 2: Auto-split owed amounts'
                : isManualSplitMode
                  ? 'Step 2: Enter owed amounts'
                  : 'Step 2: Calculated owed amounts'}
            </Text>
          </View>
          <Text style={styles.sectionHint}>
            {isEqualSplitMode
              ? 'Equal split automatically calculates each person\'s owed amount from the total bill price.'
              : isManualSplitMode
                ? 'Enter each person\'s share. Values must add up to the total bill price.'
                : 'Amounts are calculated from item assignments, tax, tip, and fees.'}
          </Text>
          {owedAmountEntries.map((entry) => {
            const isPayer = entry.participant.id === payerParticipantId;
            return (
              <View key={entry.participant.id} style={styles.owedRow}>
                <View style={styles.owedParticipantInfo}>
                  <View style={styles.owedParticipantTitleRow}>
                    <Text variant="label">{entry.participant.name}</Text>
                    <StatusPill label={isPayer ? 'Paid' : 'Unpaid'} tone={isPayer ? 'success' : 'muted'} />
                  </View>
                  <Text style={styles.sectionHint}>
                    {isPayer ? 'Marked paid when the bill is created.' : 'Will start as unpaid.'}
                  </Text>
                </View>
                {isManualSplitMode ? (
                  <Input
                    containerStyle={styles.owedAmountInput}
                    keyboardType="decimal-pad"
                    onChangeText={(value) => {
                      setOwedAmountOverrides((currentValue) => ({
                        ...currentValue,
                        [entry.participant.id]: value,
                      }));
                    }}
                    placeholder="0.00"
                    value={entry.inputValue}
                  />
                ) : (
                  <Text style={styles.owedAmountValue}>{formatCurrency(entry.amount)}</Text>
                )}
              </View>
            );
          })}
        </View>

        <View
          style={[
            styles.totalsPanel,
            totalsMatch ? styles.totalsPanelMatch : styles.totalsPanelMismatch,
          ]}
        >
          <View style={styles.totalsPanelHeader}>
            <Text style={styles.totalsLabelStrong}>Bill Total Check</Text>
            <StatusPill label={totalsMatch ? 'Balanced' : 'Mismatch'} tone={totalsMatch ? 'success' : 'warning'} />
          </View>
          <View style={styles.totalsRowStrong}>
            <Text style={styles.totalsLabelStrong}>Bill total</Text>
            <Text style={styles.totalsValueStrong}>{formatCurrency(previewTotal)}</Text>
          </View>
          <View style={styles.totalsDivider} />
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Owed total</Text>
            <Text style={styles.totalsValue}>{formatCurrency(owedTotal)}</Text>
          </View>
          <Text tone={totalsMatch ? 'success' : 'danger'}>
            {totalsMatch ? 'Owed amounts match the bill total.' : 'Owed amounts must match the bill total.'}
          </Text>
        </View>
      </Card>

      <PageErrorToast errorMessage={errorMessage} title={errorToastTitle} />
    </FeatureFormScreenScaffold>
  );
}
