import type {
  BillItemRecord,
  BillItemSplitConfig,
  BillParticipantRecord,
  BillRecord,
  FriendRecord,
} from '../models';
import type { ReceiptScanDraftResult } from '../store/receiptParsingGateway';
import type { CreateBillInput, UpdateBillInput } from '../store/featureStore';
import { formatCurrency } from './billCalculations';

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

export interface DraftBillItemAdvancedSplitBalanceFact {
  displayText: string;
  isBalanced: boolean;
  splitTarget: number;
  splitTotal: number;
  tone: 'success' | 'warning';
}

export interface DraftBillItemValidationFact {
  itemId: string;
  isValid: boolean;
  message: string | null;
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

export interface BillDraftCalculationInputs {
  customTipSplits: DraftAdvancedSplitEntry[];
  customTipSplitType: DraftAdvancedSplitType;
  equalTotalInput: string;
  extrasSplitMode?: BillRecord['extrasSplitMode'];
  feesInput: string;
  finalTotalInput: string;
  isCustomTipEnabled: boolean;
  items: DraftBillItem[];
  owedAmountOverrides: Record<string, string>;
  participants: DraftParticipant[];
  splitMode: CreateBillSplitMode;
  taxInput: string;
  tipInput: string;
}

export interface BillDraftPreviewState {
  computedCustomTotal: number;
  customTipSplitTarget: number;
  customTipSplitTotal: number;
  distributableExtrasTotal: number;
  effectiveDistributableExtrasTotal: number;
  hasFinalTotalOverride: boolean;
  isCustomTipSplitBalanced: boolean;
  normalizedFees: number;
  normalizedTax: number;
  normalizedTip: number;
  owedAmountEntries: OwedAmountEntry[];
  owedTotal: number;
  parsedEqualTotal: number;
  parsedFees: number;
  parsedFinalTotal: number;
  parsedTax: number;
  parsedTip: number;
  previewTotal: number;
  resolvedCustomTotal: number;
  subtotal: number;
  suggestedAmounts: Map<string, number>;
  totalsMatch: boolean;
}

export interface ChangeBillDraftSplitModeInput {
  currentSplitMode: CreateBillSplitMode;
  nextSplitMode: CreateBillSplitMode;
  draft: Pick<
    BillDraftCalculationInputs,
    | 'customTipSplits'
    | 'customTipSplitType'
    | 'feesInput'
    | 'finalTotalInput'
    | 'isCustomTipEnabled'
    | 'items'
    | 'owedAmountOverrides'
    | 'taxInput'
    | 'tipInput'
  > & {
    draftItemName: string;
    draftItemPrice: string;
    expandedItemIds: string[];
    receiptScanWarnings: string[];
  };
}

export interface ChangeBillDraftSplitModeResult {
  splitMode: CreateBillSplitMode;
  customTipSplits: DraftAdvancedSplitEntry[];
  customTipSplitType: DraftAdvancedSplitType;
  draftItemName: string;
  draftItemPrice: string;
  expandedItemIds: string[];
  feesInput: string;
  finalTotalInput: string;
  isCustomTipEnabled: boolean;
  items: DraftBillItem[];
  owedAmountOverrides: Record<string, string>;
  receiptScanWarnings: string[];
  taxInput: string;
  tipInput: string;
}

export interface HydrateBillDraftForEditInput {
  acceptedFriends: FriendRecord[];
  bill: BillRecord;
  createEntityId: (prefix: string) => string;
  currentUserDraftId: string;
  currentUserId?: string;
}

export interface HydrateBillDraftForEditResult {
  billTitle: string;
  customParticipants: DraftCustomParticipant[];
  customTipSplits: DraftAdvancedSplitEntry[];
  customTipSplitType: DraftAdvancedSplitType;
  draftItemName: string;
  draftItemPrice: string;
  equalTotalInput: string;
  expandedItemIds: string[];
  feesInput: string;
  finalTotalInput: string;
  isCustomTipEnabled: boolean;
  items: DraftBillItem[];
  owedAmountOverrides: Record<string, string>;
  participantRecordIdByDraftId: Record<string, string>;
  payerParticipantId: string;
  selectedFriendIds: string[];
  splitMode: CreateBillSplitMode;
  taxInput: string;
  tipInput: string;
}

export interface ApplyReceiptScanToBillDraftInput {
  billTitle: string;
  createEntityId: (prefix: string) => string;
  isEditMode: boolean;
  participantCount: number;
  scanResult: ReceiptScanDraftResult;
}

export interface ApplyReceiptScanToBillDraftResult {
  billTitle: string;
  createStep: 'details' | 'items' | null;
  customTipSplits: DraftAdvancedSplitEntry[];
  customTipSplitType: DraftAdvancedSplitType;
  draftItemName: string;
  draftItemPrice: string;
  expandedItemIds: string[];
  feesInput: string;
  finalTotalInput: string;
  isCustomTipEnabled: boolean;
  items: DraftBillItem[];
  receiptScanWarnings: string[];
  splitMode: CreateBillSplitMode;
  taxInput: string;
  tipInput: string;
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

export interface BillDraftSubmissionSnapshot {
  billTitle: string;
  editBill?: BillRecord | null;
  editBillId?: string;
  existingEvenModeItemId?: string;
  extrasSplitMode?: BillRecord['extrasSplitMode'];
  finalTotalInput: string;
  equalTotalInput: string;
  taxInput: string;
  tipInput: string;
  feesInput: string;
  isCustomTipEnabled: boolean;
  isEditHydrated: boolean;
  isEditMode: boolean;
  items: DraftBillItem[];
  owedAmountOverrides: Record<string, string>;
  participantRecordIdByDraftId: Record<string, string>;
  participants: DraftParticipant[];
  payerParticipantId: string;
  splitMode: CreateBillSplitMode;
  customTipSplitType: DraftAdvancedSplitType;
  customTipSplits: DraftAdvancedSplitEntry[];
}

export interface BuildBillDraftSubmissionInput {
  createEntityId: (prefix: string) => string;
  draft: BillDraftSubmissionSnapshot;
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

function toCurrencyInput(value: number): string {
  return value.toFixed(2);
}

export function sanitizeBillNumericInput(value: string): string {
  let sanitizedValue = '';
  let hasDecimalPoint = false;

  for (const character of value) {
    if (character >= '0' && character <= '9') {
      sanitizedValue += character;
      continue;
    }

    if (character === '.' && !hasDecimalPoint) {
      sanitizedValue += character;
      hasDecimalPoint = true;
    }
  }

  return sanitizedValue;
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

  return Number.isFinite(totalAmount) && totalAmount > 0
    ? roundToCurrency(totalAmount)
    : 0;
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

function buildDefaultAdvancedSplits(
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

type AddDraftBillItemResult =
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

interface ValidateCustomBillItemsStepInput {
  hasFinalTotalOverride: boolean;
  isCustomTipEnabled: boolean;
  isCustomTipSplitBalanced: boolean;
  items: DraftBillItem[];
  parsedFees: number;
  parsedFinalTotal: number;
  parsedTax: number;
  parsedTip: number;
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

function syncAdvancedSplitsToParticipants({
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

function changeAdvancedSplitType({
  nextType,
  splits,
  totalAmount,
}: ChangeAdvancedSplitTypeInput): DraftAdvancedSplitEntry[] {
  return redistributeAdvancedSplits(splits, nextType, totalAmount);
}

function updateAdvancedSplitValue({
  participantId,
  splitType,
  splits,
  totalAmount,
  value,
}: UpdateAdvancedSplitValueInput): DraftAdvancedSplitEntry[] {
  const sanitizedValue = sanitizeBillNumericInput(value);
  const nextSplits = splits.map((split) =>
    split.participantId === participantId
      ? setAdvancedSplitRawValue(split, splitType, sanitizedValue)
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

function toggleAdvancedSplitLock({
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

function addDraftBillItem({
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

function removeDraftBillItem(
  items: DraftBillItem[],
  { itemId }: DraftBillItemTransitionInput,
): DraftBillItem[] {
  return items.filter((item) => item.id !== itemId);
}

function updateDraftBillItemSplitMode(
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

function toggleSimpleDraftBillItemParticipant(
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

function isSimpleDraftBillItemParticipantAssigned(
  item: DraftBillItem,
  participantId: string,
): boolean {
  return item.assignedParticipantIds.includes(participantId);
}

function buildDraftBillItemAdvancedSplitBalanceFact(
  item: DraftBillItem,
): DraftBillItemAdvancedSplitBalanceFact | null {
  if (item.splitMode !== 'advanced') {
    return null;
  }

  const splitTotal = item.advancedSplits.reduce((sum, split) => {
    const parsedValue = Number(getAdvancedSplitRawValue(split, item.advancedSplitType));
    return Number.isFinite(parsedValue) ? sum + parsedValue : sum;
  }, 0);
  const splitTarget =
    item.advancedSplitType === 'percentage'
      ? 100
      : getNormalizedDraftItemPrice(item);
  const isBalanced = Math.abs(splitTotal - splitTarget) < 0.01;
  const displayText =
    item.advancedSplitType === 'percentage'
      ? `${formatPercentageDisplay(splitTotal)} of 100%`
      : `${formatCurrency(splitTotal)} of ${formatCurrency(splitTarget)}`;

  return {
    displayText,
    isBalanced,
    splitTarget,
    splitTotal,
    tone: isBalanced ? 'success' : 'warning',
  };
}

function buildDraftBillItemSplitSummary(
  item: DraftBillItem,
  participants: DraftParticipant[],
): string {
  if (item.splitMode === 'advanced') {
    const balanceFact = buildDraftBillItemAdvancedSplitBalanceFact(item);
    return `Complex split • ${balanceFact?.displayText ?? '0% of 100%'}`;
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
}

function updateDraftBillItemAdvancedSplitType(
  items: DraftBillItem[],
  { itemId, nextType }: UpdateDraftBillItemAdvancedSplitTypeInput,
): DraftBillItem[] {
  return items.map((item) =>
    item.id === itemId ? { ...item, advancedSplitType: nextType } : item,
  );
}

function toggleAdvancedDraftBillItemParticipant(
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

function updateDraftBillItemAdvancedSplitValue(
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

function toggleDraftBillItemAdvancedSplitLock(
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

function validateDraftBillItem(
  item: DraftBillItem,
  itemIndex: number,
): DraftBillItemValidationFact {
  const itemName = item.name.trim() || `Item ${itemIndex + 1}`;
  const parsedPrice = Number(item.price);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    return {
      itemId: item.id,
      isValid: false,
      message: `Enter a valid price for ${itemName}.`,
    };
  }

  if (item.splitMode === 'advanced') {
    if (item.advancedSplits.length === 0) {
      return {
        itemId: item.id,
        isValid: false,
        message: `Add participants for complex split on ${itemName}.`,
      };
    }

    const splitTotal = roundToCurrency(
      item.advancedSplits.reduce((sum, split) => {
        const parsedValue = Number(getAdvancedSplitRawValue(split, item.advancedSplitType));
        return Number.isFinite(parsedValue) ? sum + parsedValue : sum;
      }, 0),
    );

    if (
      item.advancedSplits.some((split) => {
        const parsedValue = Number(getAdvancedSplitRawValue(split, item.advancedSplitType));
        return !Number.isFinite(parsedValue) || parsedValue <= 0;
      })
    ) {
      return {
        itemId: item.id,
        isValid: false,
        message: `Split value is invalid for ${itemName}.`,
      };
    }

    if (item.advancedSplitType === 'percentage' && Math.abs(splitTotal - 100) > 0.01) {
      return {
        itemId: item.id,
        isValid: false,
        message: `${itemName} percentages must total 100%.`,
      };
    }

    if (
      item.advancedSplitType === 'amount' &&
      Math.abs(splitTotal - roundToCurrency(parsedPrice)) > 0.01
    ) {
      return {
        itemId: item.id,
        isValid: false,
        message: `${itemName} amount splits must equal item price.`,
      };
    }

    return {
      itemId: item.id,
      isValid: true,
      message: null,
    };
  }

  if (item.assignedParticipantIds.length === 0) {
    return {
      itemId: item.id,
      isValid: false,
      message: `Assign at least one participant for ${itemName}.`,
    };
  }

  return {
    itemId: item.id,
    isValid: true,
    message: null,
  };
}

function validateCustomBillItemsStep({
  hasFinalTotalOverride,
  isCustomTipEnabled,
  isCustomTipSplitBalanced,
  items,
  parsedFees,
  parsedFinalTotal,
  parsedTax,
  parsedTip,
}: ValidateCustomBillItemsStepInput): string | null {
  if (items.length === 0) {
    return 'Add at least one item before review.';
  }

  for (const [itemIndex, item] of items.entries()) {
    const validationFact = validateDraftBillItem(item, itemIndex);
    if (!validationFact.isValid) {
      return validationFact.message;
    }
  }

  if (
    !Number.isFinite(parsedTax) ||
    parsedTax < 0 ||
    !Number.isFinite(parsedTip) ||
    parsedTip < 0 ||
    !Number.isFinite(parsedFees) ||
    parsedFees < 0
  ) {
    return 'Tax, tip, and fees must be valid non-negative values.';
  }

  if (hasFinalTotalOverride && (!Number.isFinite(parsedFinalTotal) || parsedFinalTotal <= 0)) {
    return 'Final price must be a valid amount greater than zero.';
  }

  if (isCustomTipEnabled && !isCustomTipSplitBalanced) {
    return 'Custom tip split must match the tip total.';
  }

  return null;
}

function normalizeDraftBillItemsForParticipants(
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

function inferEditSplitMode(bill: BillRecord): CreateBillSplitMode {
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

function buildDraftItemFromBillItem({
  createEntityId,
  draftIdByParticipantRecordId,
  item,
  itemIndex,
  resolvedDraftParticipantIds,
}: {
  createEntityId: (prefix: string) => string;
  draftIdByParticipantRecordId: Map<string, string>;
  item: BillItemRecord;
  itemIndex: number;
  resolvedDraftParticipantIds: string[];
}): DraftBillItem {
  const itemPrice = roundToCurrency(item.price);
  const assignedDraftParticipantIds = item.assignedToParticipantIds
    .map((participantRecordId) =>
      draftIdByParticipantRecordId.get(participantRecordId),
    )
    .filter((candidate): candidate is string => Boolean(candidate));

  if (item.splitMode === 'advanced' && item.splitConfig && item.splitConfig.length > 0) {
    const advancedSplitType =
      item.splitConfig[0]?.type === 'amount' ? 'amount' : 'percentage';
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
      assignedDraftParticipantIds.length > 0
        ? assignedDraftParticipantIds
        : [...resolvedDraftParticipantIds],
    advancedSplitType: 'percentage',
    advancedSplits: [],
  };
}

function hydrateBillDraftForEdit({
  acceptedFriends,
  bill,
  createEntityId,
  currentUserDraftId,
  currentUserId,
}: HydrateBillDraftForEditInput): HydrateBillDraftForEditResult {
  const friendByUserId = new Map(
    acceptedFriends
      .filter((friend) => Boolean(friend.userId?.trim()))
      .map((friend) => [friend.userId as string, friend]),
  );
  const selectedFriendIds: string[] = [];
  const customParticipants: DraftCustomParticipant[] = [];
  const draftIdByParticipantRecordId = new Map<string, string>();
  const participantRecordIdByDraftId: Record<string, string> = {};
  const owedAmountOverrides: Record<string, string> = {};
  let paidDraftParticipantId = '';

  bill.participants.forEach((participant, participantIndex) => {
    let draftParticipantId = '';
    if (participant.userId && participant.userId === currentUserId) {
      draftParticipantId = currentUserDraftId;
    } else if (participant.userId) {
      const friend = friendByUserId.get(participant.userId);
      if (friend) {
        if (!selectedFriendIds.includes(friend.id)) {
          selectedFriendIds.push(friend.id);
        }
        draftParticipantId = `user:${friend.id}`;
      }
    }

    if (!draftParticipantId) {
      draftParticipantId = `custom:${participant.id}`;
      customParticipants.push({
        id: draftParticipantId,
        name: sanitizeParticipantName(participant.name, `Person ${participantIndex + 1}`),
        userId: participant.userId?.trim() || undefined,
      });
    }

    draftIdByParticipantRecordId.set(participant.id, draftParticipantId);
    participantRecordIdByDraftId[draftParticipantId] = participant.id;
    owedAmountOverrides[draftParticipantId] = toCurrencyInput(
      roundToCurrency(participant.amountOwed),
    );

    if (!paidDraftParticipantId && participant.paidStatus === 'paid') {
      paidDraftParticipantId = draftParticipantId;
    }
  });

  const splitMode = inferEditSplitMode(bill);
  const resolvedDraftParticipantIds = Array.from(
    new Set(Array.from(draftIdByParticipantRecordId.values())),
  );
  const computedCustomTotal = roundToCurrency(
    bill.items.reduce((sum, item) => sum + item.price, 0) + bill.tax + bill.tip + bill.fees,
  );
  const totalAmount = roundToCurrency(bill.totalAmount ?? computedCustomTotal);
  const items =
    splitMode === 'custom'
      ? bill.items.map((item, itemIndex) =>
          buildDraftItemFromBillItem({
            createEntityId,
            draftIdByParticipantRecordId,
            item,
            itemIndex,
            resolvedDraftParticipantIds,
          }),
        )
      : [];

  const hasCustomTipContributions = bill.participants.some(
    (participant) => (participant.customTipContribution ?? 0) > 0,
  );
  const customTipSplits: DraftAdvancedSplitEntry[] = hasCustomTipContributions
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

  return {
    billTitle: bill.title,
    customParticipants,
    customTipSplits,
    customTipSplitType: 'amount',
    draftItemName: '',
    draftItemPrice: '',
    equalTotalInput: toCurrencyInput(totalAmount),
    expandedItemIds: [],
    feesInput: bill.fees > 0 ? toCurrencyInput(roundToCurrency(bill.fees)) : '',
    finalTotalInput:
      splitMode === 'custom' && Math.abs(totalAmount - computedCustomTotal) > 0.01
        ? toCurrencyInput(totalAmount)
        : '',
    isCustomTipEnabled: splitMode === 'custom' && hasCustomTipContributions,
    items,
    owedAmountOverrides,
    participantRecordIdByDraftId,
    payerParticipantId: paidDraftParticipantId || currentUserDraftId,
    selectedFriendIds,
    splitMode,
    taxInput: bill.tax > 0 ? toCurrencyInput(roundToCurrency(bill.tax)) : '',
    tipInput: bill.tip > 0 ? toCurrencyInput(roundToCurrency(bill.tip)) : '',
  };
}

function changeBillDraftSplitMode({
  currentSplitMode,
  draft,
  nextSplitMode,
}: ChangeBillDraftSplitModeInput): ChangeBillDraftSplitModeResult {
  const shouldResetCustomCalculationFields =
    currentSplitMode === 'custom' || nextSplitMode === 'custom';

  return {
    splitMode: nextSplitMode,
    customTipSplits: shouldResetCustomCalculationFields ? [] : draft.customTipSplits,
    customTipSplitType: shouldResetCustomCalculationFields ? 'amount' : draft.customTipSplitType,
    draftItemName: shouldResetCustomCalculationFields ? '' : draft.draftItemName,
    draftItemPrice: shouldResetCustomCalculationFields ? '' : draft.draftItemPrice,
    expandedItemIds: shouldResetCustomCalculationFields ? [] : draft.expandedItemIds,
    feesInput: shouldResetCustomCalculationFields ? '' : draft.feesInput,
    finalTotalInput: shouldResetCustomCalculationFields ? '' : draft.finalTotalInput,
    isCustomTipEnabled: shouldResetCustomCalculationFields ? false : draft.isCustomTipEnabled,
    items: shouldResetCustomCalculationFields ? [] : draft.items,
    owedAmountOverrides:
      nextSplitMode === 'manual' ? draft.owedAmountOverrides : {},
    receiptScanWarnings: shouldResetCustomCalculationFields
      ? []
      : draft.receiptScanWarnings,
    taxInput: shouldResetCustomCalculationFields ? '' : draft.taxInput,
    tipInput: shouldResetCustomCalculationFields ? '' : draft.tipInput,
  };
}

function applyReceiptScanToBillDraft({
  billTitle,
  createEntityId,
  isEditMode,
  participantCount,
  scanResult,
}: ApplyReceiptScanToBillDraftInput): ApplyReceiptScanToBillDraftResult {
  const items: DraftBillItem[] = scanResult.items.map((item, index) => ({
    id: createEntityId('bill_item_draft'),
    name: item.name.trim() || `Receipt Item ${index + 1}`,
    price: toCurrencyInput(roundToCurrency(item.price)),
    splitMode: 'simple',
    assignedParticipantIds: [],
    advancedSplitType: 'percentage',
    advancedSplits: [],
  }));
  const scannedWarnings = [
    ...scanResult.warnings,
    ...(scanResult.items.length === 0
      ? ['No receipt items were found. Add at least one item before review.']
      : []),
    ...scanResult.items
      .map((item) => item.warning?.trim())
      .filter((warning): warning is string => Boolean(warning)),
    ...scanResult.items
      .filter((item) => item.confidence === 'low' || item.confidence === 'unknown')
      .map((item) => `Review "${item.name}" before saving.`),
  ];
  const receiptScanWarnings = Array.from(new Set(scannedWarnings));
  const scannedSubtotal = scanResult.items.reduce((sum, item) => sum + item.price, 0);
  const computedReceiptTotal = roundToCurrency(
    scannedSubtotal +
      (scanResult.tax ?? 0) +
      (scanResult.tip ?? 0) +
      (scanResult.fees ?? 0) -
      (scanResult.discount ?? 0),
  );
  const hasDiscount = typeof scanResult.discount === 'number' && scanResult.discount > 0;
  const hasTotalMismatch =
    typeof scanResult.finalTotal === 'number' &&
    Math.abs(roundToCurrency(scanResult.finalTotal) - computedReceiptTotal) > 0.01;
  const nextBillTitle =
    billTitle.trim() ||
    scanResult.title?.trim() ||
    scanResult.restaurantName?.trim() ||
    'Receipt Split';
  const hasResolvedBillTitle = Boolean(
    billTitle.trim() || scanResult.title?.trim() || scanResult.restaurantName?.trim(),
  );

  return {
    billTitle: nextBillTitle,
    createStep: isEditMode ? null : hasResolvedBillTitle && participantCount > 1 ? 'items' : 'details',
    customTipSplits: [],
    customTipSplitType: 'amount',
    draftItemName: '',
    draftItemPrice: '',
    expandedItemIds: items.map((item) => item.id),
    feesInput: typeof scanResult.fees === 'number' ? toCurrencyInput(roundToCurrency(scanResult.fees)) : '',
    finalTotalInput:
      (hasDiscount || hasTotalMismatch) && typeof scanResult.finalTotal === 'number'
        ? toCurrencyInput(roundToCurrency(scanResult.finalTotal))
        : '',
    isCustomTipEnabled: false,
    items,
    receiptScanWarnings,
    splitMode: 'custom',
    taxInput: typeof scanResult.tax === 'number' ? toCurrencyInput(roundToCurrency(scanResult.tax)) : '',
    tipInput: typeof scanResult.tip === 'number' ? toCurrencyInput(roundToCurrency(scanResult.tip)) : '',
  };
}

function deriveBillDraftPreviewState({
  customTipSplits,
  customTipSplitType,
  equalTotalInput,
  extrasSplitMode: rawExtrasSplitMode,
  feesInput,
  finalTotalInput,
  isCustomTipEnabled,
  items,
  owedAmountOverrides,
  participants,
  splitMode,
  taxInput,
  tipInput,
}: BillDraftCalculationInputs): BillDraftPreviewState {
  const isCustomSplitMode = splitMode === 'custom';
  const isManualSplitMode = splitMode === 'manual';
  const extrasSplitMode = rawExtrasSplitMode ?? (isCustomSplitMode ? 'proportional' : 'equal');
  const parsedTax = Number(taxInput || '0');
  const parsedTip = Number(tipInput || '0');
  const parsedFees = Number(feesInput || '0');
  const parsedFinalTotal = Number(finalTotalInput || '0');
  const parsedEqualTotal = Number(equalTotalInput || '0');
  const normalizedTax = Number.isFinite(parsedTax) ? parsedTax : 0;
  const normalizedTip = Number.isFinite(parsedTip) ? parsedTip : 0;
  const normalizedFees = Number.isFinite(parsedFees) ? parsedFees : 0;
  const subtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const computedCustomTotal = subtotal + normalizedTax + normalizedTip + normalizedFees;
  const hasFinalTotalOverride = finalTotalInput.trim().length > 0;
  const resolvedCustomTotal =
    hasFinalTotalOverride && Number.isFinite(parsedFinalTotal)
      ? roundToCurrency(parsedFinalTotal)
      : roundToCurrency(computedCustomTotal);
  const customTotalAdjustment = roundToCurrency(
    resolvedCustomTotal - roundToCurrency(computedCustomTotal),
  );
  const distributableExtrasTotal =
    normalizedTax + normalizedFees + (isCustomTipEnabled ? 0 : normalizedTip);
  const effectiveDistributableExtrasTotal = roundToCurrency(
    distributableExtrasTotal + customTotalAdjustment,
  );
  const previewTotal =
    splitMode === 'equal' || isManualSplitMode
      ? Number.isFinite(parsedEqualTotal)
        ? parsedEqualTotal
        : 0
      : resolvedCustomTotal;
  const participantIds = participants.map((participant) => participant.id);
  const suggestedAmounts = calculateSuggestedBillAmounts({
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
  const owedAmountEntries = participants.map((participant) => {
    const fallbackValue = toCurrencyInput(suggestedAmounts.get(participant.id) ?? 0);
    const rawValue = isManualSplitMode
      ? owedAmountOverrides[participant.id] ?? ''
      : fallbackValue;
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
  });
  const owedTotal = owedAmountEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const customTipSplitTotal = calculateCustomTipSplitTotal(
    customTipSplits,
    customTipSplitType,
  );
  const customTipSplitTarget = resolveSplitTarget(customTipSplitType, normalizedTip);
  const isCustomTipSplitBalanced =
    Math.abs(roundToCurrency(customTipSplitTotal - customTipSplitTarget)) < 0.01;
  const baseTotalsMatch = validateBillTotal(
    owedAmountEntries.map((entry) => ({
      id: entry.participant.id,
      amountOwed: entry.amount,
      paidStatus: 'pending',
      name: entry.participant.name,
    })),
    previewTotal,
  );
  const totalsMatch =
    !owedAmountEntries.some((entry) => entry.amount < 0) &&
    (isManualSplitMode
      ? baseTotalsMatch && owedAmountEntries.every((entry) => entry.isValidInput)
      : baseTotalsMatch);

  return {
    computedCustomTotal,
    customTipSplitTarget,
    customTipSplitTotal,
    distributableExtrasTotal,
    effectiveDistributableExtrasTotal,
    hasFinalTotalOverride,
    isCustomTipSplitBalanced,
    normalizedFees,
    normalizedTax,
    normalizedTip,
    owedAmountEntries,
    owedTotal,
    parsedEqualTotal,
    parsedFees,
    parsedFinalTotal,
    parsedTax,
    parsedTip,
    previewTotal,
    resolvedCustomTotal,
    subtotal,
    suggestedAmounts,
    totalsMatch,
  };
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

function calculateCustomTipSplitTotal(
  splits: DraftAdvancedSplitEntry[],
  splitType: DraftAdvancedSplitType,
): number {
  return splits.reduce((sum, split) => {
    const parsedValue = Number(getAdvancedSplitRawValue(split, splitType));
    return Number.isFinite(parsedValue) ? sum + parsedValue : sum;
  }, 0);
}

function calculateCustomTipContributionMap({
  isCustomSplitMode,
  isCustomTipEnabled,
  normalizedTip,
  participants,
  splitType,
  splits,
}: {
  isCustomSplitMode: boolean;
  isCustomTipEnabled: boolean;
  normalizedTip: number;
  participants: DraftParticipant[];
  splitType: DraftAdvancedSplitType;
  splits: DraftAdvancedSplitEntry[];
}): Map<string, number> {
  const contributionMap = new Map<string, number>();
  participants.forEach((participant) => {
    contributionMap.set(participant.id, 0);
  });

  if (
    !isCustomSplitMode ||
    !isCustomTipEnabled ||
    !Number.isFinite(normalizedTip) ||
    normalizedTip <= 0
  ) {
    return contributionMap;
  }

  splits.forEach((split) => {
    if (!contributionMap.has(split.participantId)) {
      return;
    }

    const splitValue = Number(getAdvancedSplitRawValue(split, splitType));
    if (!Number.isFinite(splitValue) || splitValue < 0) {
      return;
    }

    const contribution =
      splitType === 'percentage' ? (normalizedTip * splitValue) / 100 : splitValue;
    contributionMap.set(
      split.participantId,
      (contributionMap.get(split.participantId) ?? 0) + contribution,
    );
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
}

function buildBillDraftSubmission({
  createEntityId,
  draft,
}: BuildBillDraftSubmissionInput): BuildBillDraftSubmissionResult {
  const {
    billTitle,
    customTipSplits,
    customTipSplitType,
    editBill,
    editBillId,
    existingEvenModeItemId,
    finalTotalInput,
    equalTotalInput,
    taxInput,
    tipInput,
    feesInput,
    isCustomTipEnabled,
    isEditHydrated,
    isEditMode,
    items,
    owedAmountOverrides,
    participantRecordIdByDraftId,
    participants,
    payerParticipantId,
    splitMode,
  } = draft;
  const isEqualSplitMode = splitMode === 'equal';
  const isCustomSplitMode = splitMode === 'custom';
  const isManualSplitMode = splitMode === 'manual';
  const extrasSplitMode =
    draft.extrasSplitMode ?? (isCustomSplitMode ? 'proportional' : 'equal');
  const participantIds = participants.map((participant) => participant.id);
  const parsedTax = Number(taxInput || '0');
  const parsedTip = Number(tipInput || '0');
  const parsedFees = Number(feesInput || '0');
  const parsedFinalTotal = Number(finalTotalInput || '0');
  const parsedEqualTotal = Number(equalTotalInput || '0');
  const normalizedTax = Number.isFinite(parsedTax) ? parsedTax : 0;
  const normalizedTip = Number.isFinite(parsedTip) ? parsedTip : 0;
  const normalizedFees = Number.isFinite(parsedFees) ? parsedFees : 0;
  const subtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const computedCustomTotal = subtotal + normalizedTax + normalizedTip + normalizedFees;
  const hasFinalTotalOverride = finalTotalInput.trim().length > 0;
  const resolvedCustomTotal =
    hasFinalTotalOverride && Number.isFinite(parsedFinalTotal)
      ? roundToCurrency(parsedFinalTotal)
      : roundToCurrency(computedCustomTotal);
  const previewTotal =
    isEqualSplitMode || isManualSplitMode
      ? Number.isFinite(parsedEqualTotal)
        ? parsedEqualTotal
        : 0
      : resolvedCustomTotal;
  const distributableExtrasTotal =
    normalizedTax + normalizedFees + (isCustomTipEnabled ? 0 : normalizedTip);
  const customTotalAdjustment = roundToCurrency(
    resolvedCustomTotal - roundToCurrency(computedCustomTotal),
  );
  const effectiveDistributableExtrasTotal = roundToCurrency(
    distributableExtrasTotal + customTotalAdjustment,
  );
  const customTipSplitTarget = resolveSplitTarget(customTipSplitType, normalizedTip);
  const customTipSplitBalanced =
    Math.abs(
      roundToCurrency(
        calculateCustomTipSplitTotal(customTipSplits, customTipSplitType) -
          customTipSplitTarget,
      ),
    ) < 0.01;
  const customTipContributionMap = calculateCustomTipContributionMap({
    isCustomSplitMode,
    isCustomTipEnabled,
    normalizedTip,
    participants,
    splitType: customTipSplitType,
    splits: customTipSplits,
  });
  const suggestedAmounts = calculateSuggestedBillAmounts({
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

export const billDraftFacade = {
  addItem: addDraftBillItem,
  applyReceiptScan: applyReceiptScanToBillDraft,
  buildSubmission: buildBillDraftSubmission,
  changeCustomTipSplitType: changeAdvancedSplitType,
  changeSplitMode: changeBillDraftSplitMode,
  derivePreviewState: deriveBillDraftPreviewState,
  hydrateEditDraft: hydrateBillDraftForEdit,
  inferEditSplitMode,
  getAdvancedSplitInputValue: getAdvancedSplitRawValue,
  getAdvancedSplitBalanceFact: buildDraftBillItemAdvancedSplitBalanceFact,
  getItemValidationFact: validateDraftBillItem,
  isSimpleItemParticipantAssigned: isSimpleDraftBillItemParticipantAssigned,
  isAdvancedSplitValueLocked: isAdvancedSplitLocked,
  buildItemSplitSummary: buildDraftBillItemSplitSummary,
  normalizeItemsForParticipants: normalizeDraftBillItemsForParticipants,
  removeItem: removeDraftBillItem,
  syncCustomTipSplitsToParticipants: syncAdvancedSplitsToParticipants,
  toggleAdvancedItemParticipant: toggleAdvancedDraftBillItemParticipant,
  toggleAdvancedSplitLock: toggleDraftBillItemAdvancedSplitLock,
  toggleCustomTipSplitLock: toggleAdvancedSplitLock,
  toggleSimpleItemParticipant: toggleSimpleDraftBillItemParticipant,
  updateAdvancedSplitType: updateDraftBillItemAdvancedSplitType,
  updateAdvancedSplitValue: updateDraftBillItemAdvancedSplitValue,
  updateCustomTipSplitValue: updateAdvancedSplitValue,
  updateItemSplitMode: updateDraftBillItemSplitMode,
  validateCustomItemsStep: validateCustomBillItemsStep,
} as const;
