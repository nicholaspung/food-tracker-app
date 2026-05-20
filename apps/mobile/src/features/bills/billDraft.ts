import type {
  BillItemRecord,
  BillItemSplitConfig,
  BillParticipantRecord,
  BillRecord,
  FriendRecord,
} from '../models';
import type { CreateBillInput, UpdateBillInput } from '../store/featureStore';

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

export interface BuildBillDraftSubmissionInput {
  billTitle: string;
  createEntityId: (prefix: string) => string;
  customTipContributionMap: Map<string, number>;
  customTipSplitBalanced: boolean;
  editBill?: BillRecord | null;
  editBillId?: string;
  existingEvenModeItemId?: string;
  extrasSplitMode: BillRecord['extrasSplitMode'];
  hasFinalTotalOverride: boolean;
  isCustomSplitMode: boolean;
  isCustomTipEnabled: boolean;
  isEditHydrated: boolean;
  isEditMode: boolean;
  isEqualSplitMode: boolean;
  isManualSplitMode: boolean;
  items: DraftBillItem[];
  owedAmountOverrides: Record<string, string>;
  participantIds: string[];
  participantRecordIdByDraftId: Record<string, string>;
  participants: DraftParticipant[];
  payerParticipantId: string;
  parsedEqualTotal: number;
  parsedFees: number;
  parsedFinalTotal: number;
  parsedTax: number;
  parsedTip: number;
  previewTotal: number;
  suggestedAmounts: Map<string, number>;
}

export type BuildBillDraftSubmissionResult =
  | {
      ok: true;
      payload: Omit<CreateBillInput, 'createdByUserId'> & UpdateBillInput;
    }
  | {
      ok: false;
      message: string;
      reason: string;
    };

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

export type AddDraftBillItemResult =
  | {
      ok: true;
      item: DraftBillItem;
      items: DraftBillItem[];
    }
  | {
      ok: false;
      message: string;
      reason: 'invalid_price' | 'missing_custom_item_name';
    };

interface AddDraftBillItemInput {
  createEntityId: (prefix: string) => string;
  draftItemName: string;
  draftItemPrice: string;
  isCustomSplitMode: boolean;
  items: DraftBillItem[];
  participantIds: string[];
}

interface DraftBillItemTransitionInput {
  itemId: string;
}

interface DraftBillItemParticipantTransitionInput
  extends DraftBillItemTransitionInput {
  participantId: string;
}

interface UpdateDraftBillItemSplitModeInput
  extends DraftBillItemTransitionInput {
  nextSplitMode: DraftBillItem['splitMode'];
  participantIds: string[];
}

interface UpdateDraftBillItemAdvancedSplitTypeInput
  extends DraftBillItemTransitionInput {
  nextType: DraftAdvancedSplitType;
}

interface UpdateDraftBillItemAdvancedSplitValueInput
  extends DraftBillItemParticipantTransitionInput {
  splitType: DraftAdvancedSplitType;
  value: string;
}

interface ToggleDraftBillItemAdvancedSplitLockInput
  extends DraftBillItemParticipantTransitionInput {
  splitType: DraftAdvancedSplitType;
}

interface SyncAdvancedSplitsToParticipantsInput {
  participantIds: string[];
  splits: DraftAdvancedSplitEntry[];
  totalAmount: number;
}

interface ChangeAdvancedSplitTypeInput {
  nextType: DraftAdvancedSplitType;
  splits: DraftAdvancedSplitEntry[];
  totalAmount: number;
}

interface UpdateAdvancedSplitValueInput {
  participantId: string;
  splitType: DraftAdvancedSplitType;
  splits: DraftAdvancedSplitEntry[];
  totalAmount: number;
  value: string;
}

interface ToggleAdvancedSplitLockInput {
  participantId: string;
  splitType: DraftAdvancedSplitType;
  splits: DraftAdvancedSplitEntry[];
  totalAmount: number;
}

function getNormalizedDraftItemPrice(item: DraftBillItem): number {
  const parsedItemPrice = Number(item.price);
  return Number.isFinite(parsedItemPrice) ? parsedItemPrice : 0;
}

function createEmptyAdvancedSplit(
  participantId: string,
): DraftAdvancedSplitEntry {
  return {
    participantId,
    percentageValue: '',
    amountValue: '',
    percentageLocked: false,
    amountLocked: false,
  };
}

function redistributeAllAdvancedSplitValues(
  splits: DraftAdvancedSplitEntry[],
  totalAmount: number,
): DraftAdvancedSplitEntry[] {
  const withPercentages = redistributeAdvancedSplits(
    splits,
    'percentage',
    totalAmount,
  );
  return redistributeAdvancedSplits(withPercentages, 'amount', totalAmount);
}

export function syncAdvancedSplitsToParticipants({
  participantIds,
  splits,
  totalAmount,
}: SyncAdvancedSplitsToParticipantsInput): DraftAdvancedSplitEntry[] {
  const currentByParticipant = new Map(
    splits.map((split) => [split.participantId, split]),
  );
  const nextSplits = participantIds.map(
    (participantId) =>
      currentByParticipant.get(participantId) ??
      createEmptyAdvancedSplit(participantId),
  );

  return redistributeAllAdvancedSplitValues(nextSplits, totalAmount);
}

export function changeAdvancedSplitType({
  nextType,
  splits,
  totalAmount,
}: ChangeAdvancedSplitTypeInput): DraftAdvancedSplitEntry[] {
  return redistributeAdvancedSplits(splits, nextType, totalAmount);
}

export function updateAdvancedSplitValue({
  participantId,
  splitType,
  splits,
  totalAmount,
  value,
}: UpdateAdvancedSplitValueInput): DraftAdvancedSplitEntry[] {
  const nextSplits = splits.map((split) =>
    split.participantId === participantId
      ? setAdvancedSplitRawValue(split, splitType, value)
      : split,
  );
  const editedSplit = nextSplits.find(
    (split) => split.participantId === participantId,
  );
  const shouldRedistribute = editedSplit
    ? isAdvancedSplitLocked(editedSplit, splitType)
    : false;

  return shouldRedistribute
    ? redistributeAdvancedSplits(nextSplits, splitType, totalAmount)
    : nextSplits;
}

export function toggleAdvancedSplitLock({
  participantId,
  splitType,
  splits,
  totalAmount,
}: ToggleAdvancedSplitLockInput): DraftAdvancedSplitEntry[] {
  const toggledSplits = splits.map((split) =>
    split.participantId === participantId
      ? setAdvancedSplitLocked(
          split,
          splitType,
          !isAdvancedSplitLocked(split, splitType),
        )
      : split,
  );

  return redistributeAdvancedSplits(toggledSplits, splitType, totalAmount);
}

export function addDraftBillItem({
  createEntityId,
  draftItemName,
  draftItemPrice,
  isCustomSplitMode,
  items,
  participantIds,
}: AddDraftBillItemInput): AddDraftBillItemResult {
  const price = Number(draftItemPrice);
  if (!Number.isFinite(price) || price <= 0) {
    return {
      ok: false,
      reason: 'invalid_price',
      message: 'Item price must be greater than zero.',
    };
  }

  const trimmedName = draftItemName.trim();
  if (isCustomSplitMode && !trimmedName) {
    return {
      ok: false,
      reason: 'missing_custom_item_name',
      message: 'Item name is required for custom split.',
    };
  }

  const item: DraftBillItem = {
    id: createEntityId('bill_item_draft'),
    name: trimmedName || `Item ${items.length + 1}`,
    price: String(roundToCurrency(price)),
    splitMode: 'simple',
    assignedParticipantIds: [...participantIds],
    advancedSplitType: 'percentage',
    advancedSplits: [],
  };

  return {
    ok: true,
    item,
    items: [...items, item],
  };
}

export function removeDraftBillItem(
  items: DraftBillItem[],
  { itemId }: DraftBillItemTransitionInput,
): DraftBillItem[] {
  return items.filter((item) => item.id !== itemId);
}

export function updateDraftBillItemSplitMode(
  items: DraftBillItem[],
  { itemId, nextSplitMode, participantIds }: UpdateDraftBillItemSplitModeInput,
): DraftBillItem[] {
  return items.map((item) => {
    if (item.id !== itemId || item.splitMode === nextSplitMode) {
      return item;
    }

    if (nextSplitMode === 'advanced') {
      const assignedParticipantIds =
        item.assignedParticipantIds.length > 0
          ? item.assignedParticipantIds
          : [...participantIds];

      return {
        ...item,
        splitMode: 'advanced',
        advancedSplitType: 'percentage',
        advancedSplits: buildDefaultAdvancedSplits(
          assignedParticipantIds,
          getNormalizedDraftItemPrice(item),
        ),
      };
    }

    return {
      ...item,
      splitMode: 'simple',
      assignedParticipantIds:
        item.advancedSplits.length > 0
          ? Array.from(
              new Set(
                item.advancedSplits.map((split) => split.participantId),
              ),
            )
          : item.assignedParticipantIds,
    };
  });
}

export function toggleSimpleDraftBillItemParticipant(
  items: DraftBillItem[],
  { itemId, participantId }: DraftBillItemParticipantTransitionInput,
): DraftBillItem[] {
  return items.map((item) => {
    if (item.id !== itemId) {
      return item;
    }

    const isAssigned = item.assignedParticipantIds.includes(participantId);
    return {
      ...item,
      assignedParticipantIds: isAssigned
        ? item.assignedParticipantIds.filter((id) => id !== participantId)
        : [...item.assignedParticipantIds, participantId],
    };
  });
}

export function updateDraftBillItemAdvancedSplitType(
  items: DraftBillItem[],
  { itemId, nextType }: UpdateDraftBillItemAdvancedSplitTypeInput,
): DraftBillItem[] {
  return items.map((item) =>
    item.id === itemId ? { ...item, advancedSplitType: nextType } : item,
  );
}

export function toggleAdvancedDraftBillItemParticipant(
  items: DraftBillItem[],
  { itemId, participantId }: DraftBillItemParticipantTransitionInput,
): DraftBillItem[] {
  return items.map((item) => {
    if (item.id !== itemId) {
      return item;
    }

    const existingSplit = item.advancedSplits.find(
      (split) => split.participantId === participantId,
    );
    const nextSplits = existingSplit
      ? item.advancedSplits.filter(
          (split) => split.participantId !== participantId,
        )
      : [...item.advancedSplits, createEmptyAdvancedSplit(participantId)];

    return {
      ...item,
      advancedSplits: redistributeAllAdvancedSplitValues(
        nextSplits,
        getNormalizedDraftItemPrice(item),
      ),
    };
  });
}

export function updateDraftBillItemAdvancedSplitValue(
  items: DraftBillItem[],
  {
    itemId,
    participantId,
    splitType,
    value,
  }: UpdateDraftBillItemAdvancedSplitValueInput,
): DraftBillItem[] {
  return items.map((item) => {
    if (item.id !== itemId) {
      return item;
    }

    return {
      ...item,
      advancedSplits: updateAdvancedSplitValue({
        participantId,
        splitType,
        splits: item.advancedSplits,
        totalAmount: getNormalizedDraftItemPrice(item),
        value,
      }),
    };
  });
}

export function toggleDraftBillItemAdvancedSplitLock(
  items: DraftBillItem[],
  {
    itemId,
    participantId,
    splitType,
  }: ToggleDraftBillItemAdvancedSplitLockInput,
): DraftBillItem[] {
  return items.map((item) => {
    if (item.id !== itemId) {
      return item;
    }

    return {
      ...item,
      advancedSplits: toggleAdvancedSplitLock({
        participantId,
        splitType,
        splits: item.advancedSplits,
        totalAmount: getNormalizedDraftItemPrice(item),
      }),
    };
  });
}

export function normalizeDraftBillItemsForParticipants(
  items: DraftBillItem[],
  participantIds: string[],
): DraftBillItem[] {
  const participantIdSet = new Set(participantIds);
  let didChange = false;

  const nextItems = items.map((item) => {
    const assignedParticipantIds = item.assignedParticipantIds.filter(
      (participantId) => participantIdSet.has(participantId),
    );
    const advancedSplits = item.advancedSplits.filter((split) =>
      participantIdSet.has(split.participantId),
    );

    const assignedChanged = !areStringArraysEqual(
      item.assignedParticipantIds,
      assignedParticipantIds,
    );
    const advancedSplitsChanged =
      item.advancedSplits.length !== advancedSplits.length ||
      item.advancedSplits.some((split, index) => {
        const nextSplit = advancedSplits[index];
        return (
          !nextSplit ||
          nextSplit.participantId !== split.participantId ||
          nextSplit.percentageValue !== split.percentageValue ||
          nextSplit.amountValue !== split.amountValue
        );
      });

    if (!assignedChanged && !advancedSplitsChanged) {
      return item;
    }

    didChange = true;
    return {
      ...item,
      assignedParticipantIds,
      advancedSplits,
    };
  });

  return didChange ? nextItems : items;
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

function buildBillDraftValidationError(
  reason: string,
  message: string,
): BuildBillDraftSubmissionResult {
  return { ok: false, reason, message };
}

function validateBillTotal(
  participants: BillParticipantRecord[],
  totalAmount: number,
): boolean {
  const calculatedTotal = participants.reduce(
    (sum, participant) => sum + participant.amountOwed,
    0,
  );
  return Math.abs(totalAmount - calculatedTotal) < 0.01;
}

export function buildBillDraftSubmission({
  billTitle,
  createEntityId,
  customTipContributionMap,
  customTipSplitBalanced,
  editBill,
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
}: BuildBillDraftSubmissionInput): BuildBillDraftSubmissionResult {
  if (!billTitle.trim()) {
    return buildBillDraftValidationError('missing_bill_name', 'Bill name is required.');
  }

  if (participants.length <= 1) {
    return buildBillDraftValidationError(
      'missing_participants',
      'Add at least one other person to split with.',
    );
  }

  if (isEditMode && !isEditHydrated) {
    return buildBillDraftValidationError(
      'edit_bill_not_hydrated',
      'Bill details are still loading. Please wait a moment and try again.',
    );
  }

  if (isEqualSplitMode || isManualSplitMode) {
    if (!Number.isFinite(parsedEqualTotal) || parsedEqualTotal <= 0) {
      return buildBillDraftValidationError(
        'invalid_equal_total',
        'Enter a valid total bill price.',
      );
    }
  } else {
    if (items.length === 0) {
      return buildBillDraftValidationError('missing_items', 'Add at least one item.');
    }

    if (
      !Number.isFinite(parsedTax) ||
      parsedTax < 0 ||
      !Number.isFinite(parsedTip) ||
      parsedTip < 0 ||
      !Number.isFinite(parsedFees) ||
      parsedFees < 0
    ) {
      return buildBillDraftValidationError(
        'invalid_tax_tip_fees',
        'Tax, tip, and fees must be valid non-negative values.',
      );
    }

    if (
      hasFinalTotalOverride &&
      (!Number.isFinite(parsedFinalTotal) || parsedFinalTotal <= 0)
    ) {
      return buildBillDraftValidationError(
        'invalid_final_total',
        'Final price must be a valid amount greater than zero.',
      );
    }

    if (isCustomTipEnabled && !customTipSplitBalanced) {
      return buildBillDraftValidationError(
        'custom_tip_unbalanced',
        'Custom tip split must match the tip total.',
      );
    }
  }

  if (!Number.isFinite(previewTotal) || previewTotal <= 0) {
    return buildBillDraftValidationError(
      'invalid_total_amount',
      'Total bill amount must be greater than zero.',
    );
  }

  if (!payerParticipantId) {
    return buildBillDraftValidationError('missing_payer', 'Select who paid the bill.');
  }

  if (isEditMode && !editBillId) {
    return buildBillDraftValidationError(
      'missing_edit_bill_id',
      'Bill could not be loaded for editing.',
    );
  }

  if (isEditMode && !editBill) {
    return buildBillDraftValidationError(
      'missing_edit_bill',
      'Bill could not be loaded for editing.',
    );
  }

  const participantRecordIdLookup = new Map<string, string>();
  participants.forEach((participant) => {
    const existingParticipantRecordId = isEditMode
      ? (participantRecordIdByDraftId[participant.id] ?? null)
      : participant.id;
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
      return buildBillDraftValidationError(
        'missing_mapped_participants',
        'Could not resolve bill participants.',
      );
    }

    itemRecords.push({
      id: isEditMode
        ? (existingEvenModeItemId ?? createEntityId('bill_item'))
        : createEntityId('bill_item'),
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
        return buildBillDraftValidationError(
          'invalid_item_price',
          `Item price is invalid for ${item.name}.`,
        );
      }

      const normalizedItemName = item.name.trim() || `Item ${itemIndex + 1}`;
      if (!normalizedItemName) {
        return buildBillDraftValidationError('missing_item_name', 'Each item needs a name.');
      }

      if (item.splitMode === 'advanced') {
        if (item.advancedSplits.length === 0) {
          return buildBillDraftValidationError(
            'missing_advanced_split_participants',
            `Add participants for complex split on ${normalizedItemName}.`,
          );
        }

        const parsedSplitConfig: BillItemSplitConfig[] = [];
        for (const split of item.advancedSplits) {
          const mappedSplitParticipantId = resolveMappedParticipantId(split.participantId);
          if (!mappedSplitParticipantId) {
            continue;
          }

          const splitValue = Number(getAdvancedSplitRawValue(split, item.advancedSplitType));
          if (!Number.isFinite(splitValue) || splitValue <= 0) {
            return buildBillDraftValidationError(
              'invalid_advanced_split_value',
              `Split value is invalid for ${normalizedItemName}.`,
            );
          }

          parsedSplitConfig.push({
            participantId: mappedSplitParticipantId,
            type: item.advancedSplitType,
            value: roundToCurrency(splitValue),
          });
        }

        if (parsedSplitConfig.length === 0) {
          return buildBillDraftValidationError(
            'missing_advanced_split_config',
            `Add participants for complex split on ${normalizedItemName}.`,
          );
        }

        const splitTotal = roundToCurrency(
          parsedSplitConfig.reduce((sum, split) => sum + split.value, 0),
        );
        if (item.advancedSplitType === 'percentage' && Math.abs(splitTotal - 100) > 0.01) {
          return buildBillDraftValidationError(
            'advanced_percentage_mismatch',
            `${normalizedItemName} percentages must total 100%.`,
          );
        }

        if (
          item.advancedSplitType === 'amount' &&
          Math.abs(splitTotal - roundToCurrency(parsedPrice)) > 0.01
        ) {
          return buildBillDraftValidationError(
            'advanced_amount_mismatch',
            `${normalizedItemName} amount splits must equal item price.`,
          );
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
        return buildBillDraftValidationError(
          'missing_simple_split_participants',
          `Assign at least one participant for ${normalizedItemName}.`,
        );
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
      customTipContribution:
        isCustomSplitMode && isCustomTipEnabled
          ? roundToCurrency(customTipContributionMap.get(participant.id) ?? 0)
          : undefined,
      paidStatus: participant.id === payerParticipantId ? 'paid' : 'pending',
    });
  });

  if (invalidAmounts.length > 0) {
    return buildBillDraftValidationError(
      'invalid_participant_amount',
      `Amount owed is invalid for ${invalidAmounts[0]}.`,
    );
  }

  if (!validateBillTotal(participantRecords, previewTotal)) {
    return buildBillDraftValidationError(
      'bill_total_mismatch',
      'Amounts owed must match the total bill amount.',
    );
  }

  return {
    ok: true,
    payload: {
      title: billTitle.trim(),
      restaurantName: billTitle.trim(),
      items: itemRecords,
      participants: participantRecords,
      totalAmount: roundToCurrency(previewTotal),
      tax: isCustomSplitMode ? roundToCurrency(parsedTax) : 0,
      tip: isCustomSplitMode ? roundToCurrency(parsedTip) : 0,
      fees: isCustomSplitMode ? roundToCurrency(parsedFees) : 0,
      extrasSplitMode,
    },
  };
}
