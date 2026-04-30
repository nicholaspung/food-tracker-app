import type {
  BillParticipantRecord,
  BillRecord,
  FriendRecord,
} from '../../features';

export type CreateBillSplitMode = 'equal' | 'custom' | 'manual';
export type DraftAdvancedSplitType = 'percentage' | 'amount';

export interface DraftAdvancedSplitEntry {
  participantId: string;
  percentageValue: string;
  amountValue: string;
  percentageLocked: boolean;
  amountLocked: boolean;
}

export interface DraftBillItem {
  id: string;
  name: string;
  price: string;
  splitMode: 'simple' | 'advanced';
  assignedParticipantIds: string[];
  advancedSplitType: DraftAdvancedSplitType;
  advancedSplits: DraftAdvancedSplitEntry[];
}

export interface DraftParticipant {
  id: string;
  name: string;
  userId?: string;
  isCurrentUser: boolean;
}

export interface DraftCustomParticipant {
  id: string;
  name: string;
  userId?: string;
}

export interface OwedAmountEntry {
  participant: DraftParticipant;
  inputValue: string;
  amount: number;
  isValidInput: boolean;
  hasInputValue: boolean;
}

interface CalculateSuggestedBillAmountsInput {
  customTipSplits: DraftAdvancedSplitEntry[];
  customTipSplitType: DraftAdvancedSplitType;
  effectiveDistributableExtrasTotal: number;
  extrasSplitMode: BillRecord['extrasSplitMode'];
  isCustomSplitMode: boolean;
  isCustomTipEnabled: boolean;
  items: DraftBillItem[];
  normalizedTip: number;
  participantIds: string[];
  previewTotal: number;
}

function isLikelyUserId(value: string): boolean {
  return /^[a-z0-9]{15}$/i.test(value.trim());
}

export function isSyntheticFriendEmail(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? '';
  return (
    normalized.endsWith('@friend.local') ||
    normalized.endsWith('@invite.local')
  );
}

export function sanitizeParticipantName(value: string, fallback: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue || isLikelyUserId(trimmedValue)) {
    return fallback;
  }

  return trimmedValue;
}

export function normalizeFriendName(friend: FriendRecord): string {
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

export function mergeFriendCollections(
  ...collections: readonly FriendRecord[][]
): FriendRecord[] {
  const friendsById = new Map<string, FriendRecord>();
  collections.forEach((collection) => {
    collection.forEach((friend) => {
      friendsById.set(friend.id, friend);
    });
  });
  return Array.from(friendsById.values());
}

export function mapBillParticipantToFriendRecord(
  participant: BillParticipantRecord,
  currentUserId?: string,
): FriendRecord | null {
  const friendshipId = participant.friendshipId?.trim();
  const userId = participant.userId?.trim();
  if (!friendshipId || !userId || userId === currentUserId) {
    return null;
  }

  return {
    id: friendshipId,
    userId,
    name: sanitizeParticipantName(participant.name, 'Friend'),
    email: '',
    status: 'friend',
    createdAt: '',
  };
}

export function toCurrencyInput(value: number): string {
  return value.toFixed(2);
}

export function roundToCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatPercentageDisplay(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0%';
  }

  return `${Math.ceil(value)}%`;
}

export function getAdvancedSplitRawValue(
  split: DraftAdvancedSplitEntry,
  splitType: DraftAdvancedSplitType,
): string {
  return splitType === 'percentage' ? split.percentageValue : split.amountValue;
}

export function isAdvancedSplitLocked(
  split: DraftAdvancedSplitEntry,
  splitType: DraftAdvancedSplitType,
): boolean {
  return splitType === 'percentage'
    ? split.percentageLocked
    : split.amountLocked;
}

export function setAdvancedSplitRawValue(
  split: DraftAdvancedSplitEntry,
  splitType: DraftAdvancedSplitType,
  value: string,
): DraftAdvancedSplitEntry {
  return splitType === 'percentage'
    ? { ...split, percentageValue: value }
    : { ...split, amountValue: value };
}

export function setAdvancedSplitLocked(
  split: DraftAdvancedSplitEntry,
  splitType: DraftAdvancedSplitType,
  isLocked: boolean,
): DraftAdvancedSplitEntry {
  return splitType === 'percentage'
    ? { ...split, percentageLocked: isLocked }
    : { ...split, amountLocked: isLocked };
}

export function resolveSplitTarget(
  splitType: DraftAdvancedSplitType,
  totalAmount: number,
): number {
  if (splitType === 'percentage') {
    return 100;
  }

  return Number.isFinite(totalAmount) && totalAmount > 0
    ? roundToCurrency(totalAmount)
    : 0;
}

export function redistributeAdvancedSplits(
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
  const evenValue =
    unlockedIndexes.length > 0 ? remaining / unlockedIndexes.length : 0;
  let distributed = 0;

  const nextSplits = splits.map((split, index) => {
    if (!unlockedIndexes.includes(index)) {
      return split;
    }

    const roundedValue = roundToCurrency(evenValue);
    distributed += roundedValue;
    return setAdvancedSplitRawValue(
      split,
      splitType,
      toCurrencyInput(roundedValue),
    );
  });

  const roundingDifference = roundToCurrency(remaining - distributed);
  if (Math.abs(roundingDifference) > 0) {
    const firstUnlockedIndex = unlockedIndexes[0];
    const currentValue = Number(
      getAdvancedSplitRawValue(nextSplits[firstUnlockedIndex], splitType),
    );
    const normalizedCurrentValue = Number.isFinite(currentValue)
      ? currentValue
      : 0;
    const adjustedValue = Math.max(
      0,
      roundToCurrency(normalizedCurrentValue + roundingDifference),
    );
    nextSplits[firstUnlockedIndex] = setAdvancedSplitRawValue(
      nextSplits[firstUnlockedIndex],
      splitType,
      toCurrencyInput(adjustedValue),
    );
  }

  return nextSplits;
}

export function calculateSuggestedBillAmounts({
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
}: CalculateSuggestedBillAmountsInput): Map<string, number> {
  const amountMap = new Map<string, number>();
  participantIds.forEach((participantId) => {
    amountMap.set(participantId, 0);
  });

  if (participantIds.length === 0) {
    return amountMap;
  }

  if (!isCustomSplitMode) {
    const normalizedTotal = roundToCurrency(previewTotal);
    const evenAmount = normalizedTotal / participantIds.length;
    let roundedTotal = 0;

    participantIds.forEach((participantId) => {
      const roundedAmount = roundToCurrency(evenAmount);
      amountMap.set(participantId, roundedAmount);
      roundedTotal += roundedAmount;
    });

    const roundingDifference = roundToCurrency(normalizedTotal - roundedTotal);
    if (Math.abs(roundingDifference) > 0) {
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
    const extrasPerParticipant = effectiveDistributableExtrasTotal / participantIds.length;
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
  if (Math.abs(roundingDifference) > 0) {
    const firstParticipantId = participantIds[0];
    amountMap.set(
      firstParticipantId,
      roundToCurrency((amountMap.get(firstParticipantId) ?? 0) + roundingDifference),
    );
  }

  return amountMap;
}

export function buildDefaultAdvancedSplits(
  participantIds: string[],
  totalAmount: number,
): DraftAdvancedSplitEntry[] {
  const baseSplits: DraftAdvancedSplitEntry[] = participantIds.map(
    (participantId) => ({
      participantId,
      percentageValue: '',
      amountValue: '',
      percentageLocked: false,
      amountLocked: false,
    }),
  );

  const withEvenPercentages = redistributeAdvancedSplits(
    baseSplits,
    'percentage',
    totalAmount,
  );
  return redistributeAdvancedSplits(withEvenPercentages, 'amount', totalAmount);
}

export function areStringArraysEqual(left: string[], right: string[]): boolean {
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

export function inferEditSplitMode(bill: BillRecord): CreateBillSplitMode {
  if (
    bill.splitMode === 'itemized' ||
    bill.extrasSplitMode === 'proportional'
  ) {
    return 'custom';
  }

  if (bill.splitMode === 'custom') {
    return 'manual';
  }

  if (bill.participants.length <= 1) {
    return 'equal';
  }

  const baselineAmount = roundToCurrency(
    bill.participants[0]?.amountOwed ?? 0,
  );
  const allEqual = bill.participants.every(
    (participant) =>
      Math.abs(roundToCurrency(participant.amountOwed) - baselineAmount) < 0.01,
  );

  return allEqual ? 'equal' : 'manual';
}
