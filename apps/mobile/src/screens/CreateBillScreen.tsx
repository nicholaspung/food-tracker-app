import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  ConfirmDestructiveModal,
  FeatureFormScreenScaffold,
  PageErrorToast,
  SegmentedControl,
  StatusPill,
  StepProgressBar,
} from '../components/shared';
import {
  createEntityId,
  submitCreateBill,
  type FriendRecord,
} from '../features';
import {
  formatCurrency,
} from '../features/bills/billCalculations';
import {
  areStringArraysEqual,
  billDraftFacade,
  formatPercentageDisplay,
  getAdvancedSplitRawValue,
  isAdvancedSplitLocked,
  roundToCurrency,
  sanitizeBillNumericInput,
  sanitizeParticipantName,
  type CreateBillSplitMode,
  type DraftAdvancedSplitEntry,
  type DraftAdvancedSplitType,
  type DraftBillItem,
} from '../features/bills/billDraft';
import type { ReceiptScanDraftResult } from '../features/store/receiptParsingGateway';
import { useBillWrites } from '../features/store/useBillWrites';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';
import { BillDraftItemEditor } from './createBill/BillDraftItemEditor';
import { BillParticipantPickerSection } from './createBill/BillParticipantPickerSection';
import { BillPayerAndTotalsSection } from './createBill/BillPayerAndTotalsSection';
import { useCreateBillItemCompositionController } from './createBill/useCreateBillItemCompositionController';
import { useCreateBillParticipantsController } from './createBill/useCreateBillParticipantsController';

type CreateBillScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateBill'>;
type CreateBillExitMethod =
  | 'header_back'
  | 'secondary_cancel'
  | 'system_back_or_gesture'
  | 'programmatic_navigation';
type CreateBillWizardStep = 'splitType' | 'source' | 'details' | 'items' | 'review';

const BASIC_BILL_STEPS = [
  { label: 'Split Type' },
  { label: 'Details' },
  { label: 'Review' },
];
const CUSTOM_BILL_STEPS = [
  { label: 'Split Type' },
  { label: 'Source' },
  { label: 'Details' },
  { label: 'Items' },
  { label: 'Review' },
];
const BASIC_BILL_STEP_INDEX: Record<CreateBillWizardStep, number> = {
  splitType: 0,
  source: 0,
  details: 1,
  items: 1,
  review: 2,
};
const CUSTOM_BILL_STEP_INDEX: Record<CreateBillWizardStep, number> = {
  splitType: 0,
  source: 1,
  details: 2,
  items: 3,
  review: 4,
};

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
  splitControl: {
    alignSelf: 'flex-start',
  },
  itemSplitTypeRow: {
    gap: theme.spacing.xs,
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
  receiptScanWarningCard: {
    backgroundColor: theme.colors.status.warningBg,
    borderColor: theme.colors.border.warning,
    borderWidth: 1,
    gap: theme.spacing.xs,
  },
  sourceActions: {
    gap: theme.spacing.sm,
  },
  sourceActionButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'flex-start',
  },
}));

export function CreateBillScreen({ navigation, route }: CreateBillScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const billWrites = useBillWrites();
  const { isOnline } = useConnectivity();
  const editBillId = route.params?.billId;
  const isEditMode = Boolean(editBillId);

  const [createStep, setCreateStep] = useState<CreateBillWizardStep>('splitType');
  const [splitMode, setSplitMode] = useState<CreateBillSplitMode>('equal');
  const [billTitle, setBillTitle] = useState('');
  const [equalTotalInput, setEqualTotalInput] = useState('');
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
  const [pendingReceiptScanResult, setPendingReceiptScanResult] = useState<ReceiptScanDraftResult | null>(null);
  const [receiptScanWarnings, setReceiptScanWarnings] = useState<string[]>([]);
  const hasTrackedFlowOpenRef = useRef(false);
  const hasTrackedFlowExitRef = useRef(false);
  const hasCompletedFlowRef = useRef(false);
  const exitMethodRef = useRef<CreateBillExitMethod | null>(null);
  const appliedReceiptScanCorrelationRef = useRef<string | null>(null);

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
  const participantIds = useMemo(
    () => participants.map((participant) => participant.id),
    [participants],
  );

  const itemCompositionController = useCreateBillItemCompositionController({
    createEntityId,
    isCustomSplitMode: splitMode === 'custom',
    onClearError: () => {
      setErrorMessage(null);
    },
    onValidationError: setErrorMessage,
    participantIds,
    splitMode,
  });
  const {
    draftItemName,
    draftItemPrice,
    expandedItemIds,
    items,
    clearExpandedItems,
    normalizeItemsForParticipants,
    removeConfirmedItem,
    replaceDraftState,
    resetDraftState,
  } = itemCompositionController;

  const billNumericInputProps = {
    showInlineKeyboardDismissButton: false,
    useDefaultReturnKeyType: false,
  } as const;
  const handleEqualTotalInputChange = useCallback((value: string) => {
    setEqualTotalInput(sanitizeBillNumericInput(value));
  }, []);
  const handleTaxInputChange = useCallback((value: string) => {
    setTaxInput(sanitizeBillNumericInput(value));
  }, []);
  const handleFeesInputChange = useCallback((value: string) => {
    setFeesInput(sanitizeBillNumericInput(value));
  }, []);
  const handleTipInputChange = useCallback((value: string) => {
    setTipInput(sanitizeBillNumericInput(value));
  }, []);
  const handleFinalTotalInputChange = useCallback((value: string) => {
    setFinalTotalInput(sanitizeBillNumericInput(value));
  }, []);
  const isEqualSplitMode = splitMode === 'equal';
  const isCustomSplitMode = splitMode === 'custom';
  const isManualSplitMode = splitMode === 'manual';
  const extrasSplitMode: 'equal' | 'proportional' = isCustomSplitMode ? 'proportional' : 'equal';

  const handleSplitModeChange = useCallback(
    (nextSplitMode: CreateBillSplitMode) => {
      if (nextSplitMode === splitMode) {
        return;
      }

      trackObservabilityEvent('CREATE_BILL_SPLIT_MODE_CHANGED', {
        source: 'CreateBillScreen',
        previousSplitMode: splitMode,
        nextSplitMode,
      });

      const transition = billDraftFacade.changeSplitMode({
        currentSplitMode: splitMode,
        nextSplitMode,
        draft: {
          customTipSplits,
          customTipSplitType,
          draftItemName,
          draftItemPrice,
          expandedItemIds,
          feesInput,
          finalTotalInput,
          isCustomTipEnabled,
          items,
          owedAmountOverrides,
          receiptScanWarnings,
          taxInput,
          tipInput,
        },
      });

      replaceDraftState({
        draftItemName: transition.draftItemName,
        draftItemPrice: transition.draftItemPrice,
        items: transition.items,
        expandedItemIds: transition.expandedItemIds,
      });
      setTaxInput(transition.taxInput);
      setTipInput(transition.tipInput);
      setFeesInput(transition.feesInput);
      setFinalTotalInput(transition.finalTotalInput);
      setIsCustomTipEnabled(transition.isCustomTipEnabled);
      setCustomTipSplitType(transition.customTipSplitType);
      setCustomTipSplits(transition.customTipSplits);
      setOwedAmountOverrides(transition.owedAmountOverrides);
      setReceiptScanWarnings(transition.receiptScanWarnings);
      setPendingReceiptScanResult(null);
      setErrorMessage(null);
      setSplitMode(transition.splitMode);
    },
    [
      customTipSplitType,
      customTipSplits,
      draftItemName,
      draftItemPrice,
      expandedItemIds,
      feesInput,
      finalTotalInput,
      isCustomTipEnabled,
      items,
      owedAmountOverrides,
      receiptScanWarnings,
      replaceDraftState,
      splitMode,
      taxInput,
      tipInput,
    ],
  );

  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    setCreateStep('splitType');
    setSplitMode('equal');
    setBillTitle('');
    setEqualTotalInput('');
    resetDraftState();
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
    setPendingReceiptScanResult(null);
    setReceiptScanWarnings([]);
  }, [
    editBillId,
    isEditMode,
    resetDraftState,
  ]);

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

    const hydratedDraft = billDraftFacade.hydrateEditDraft({
      acceptedFriends,
      bill,
      createEntityId,
      currentUserDraftId,
      currentUserId: user?.id,
    });

    setSplitMode(hydratedDraft.splitMode);
    setBillTitle(hydratedDraft.billTitle);
    setSelectedFriendIds(hydratedDraft.selectedFriendIds);
    setCustomParticipants(hydratedDraft.customParticipants);
    setFriendSearchQuery('');
    setEqualTotalInput(hydratedDraft.equalTotalInput);
    replaceDraftState({
      draftItemName: hydratedDraft.draftItemName,
      draftItemPrice: hydratedDraft.draftItemPrice,
      items: hydratedDraft.items,
      expandedItemIds: hydratedDraft.expandedItemIds,
    });
    setTaxInput(hydratedDraft.taxInput);
    setTipInput(hydratedDraft.tipInput);
    setFeesInput(hydratedDraft.feesInput);
    setFinalTotalInput(hydratedDraft.finalTotalInput);
    setIsCustomTipEnabled(hydratedDraft.isCustomTipEnabled);
    setCustomTipSplitType(hydratedDraft.customTipSplitType);
    setCustomTipSplits(hydratedDraft.customTipSplits);
    setPayerParticipantId(hydratedDraft.payerParticipantId);
    setIsPayerDropdownOpen(false);
    setOwedAmountOverrides(hydratedDraft.owedAmountOverrides);
    setParticipantRecordIdByDraftId(hydratedDraft.participantRecordIdByDraftId);
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
    replaceDraftState,
    user?.id,
  ]);

  useEffect(() => {
    if (isEditMode && !isEditHydrated) {
      return;
    }

    normalizeItemsForParticipants(participantIds);
  }, [isEditHydrated, isEditMode, normalizeItemsForParticipants, participantIds]);

  useEffect(() => {
    if (!isCustomSplitMode) {
      clearExpandedItems();
    }
  }, [clearExpandedItems, isCustomSplitMode]);

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

  const draftPreview = useMemo(
    () => billDraftFacade.derivePreviewState({
      customTipSplitType,
      customTipSplits,
      equalTotalInput,
      extrasSplitMode,
      feesInput,
      finalTotalInput,
      isCustomTipEnabled,
      items,
      owedAmountOverrides,
      participants,
      splitMode,
      taxInput,
      tipInput,
    }),
    [
      customTipSplitType,
      customTipSplits,
      equalTotalInput,
      extrasSplitMode,
      feesInput,
      finalTotalInput,
      isCustomTipEnabled,
      items,
      owedAmountOverrides,
      participants,
      splitMode,
      taxInput,
      tipInput,
    ],
  );
  const {
    computedCustomTotal,
    customTipSplitTarget,
    customTipSplitTotal,
    hasFinalTotalOverride,
    isCustomTipSplitBalanced,
    normalizedTip,
    owedAmountEntries,
    owedTotal,
    parsedEqualTotal,
    parsedFees,
    parsedFinalTotal,
    parsedTax,
    parsedTip,
    previewTotal,
    totalsMatch,
  } = draftPreview;

  useEffect(() => {
    if (!isCustomTipEnabled) {
      return;
    }

    setCustomTipSplits((currentSplits) => {
      return billDraftFacade.syncCustomTipSplitsToParticipants({
        participantIds,
        splits: currentSplits,
        totalAmount: normalizedTip,
      });
    });
  }, [isCustomTipEnabled, normalizedTip, participantIds]);

  const styles = useStyles();

  const hasReceiptReplaceableDraftData = useCallback(
    () =>
      items.length > 0 ||
      Boolean(taxInput.trim()) ||
      Boolean(tipInput.trim()) ||
      Boolean(feesInput.trim()) ||
      Boolean(finalTotalInput.trim()),
    [feesInput, finalTotalInput, items.length, taxInput, tipInput],
  );

  const applyReceiptScanResult = useCallback(
    (scanResult: ReceiptScanDraftResult) => {
      const receiptDraft = billDraftFacade.applyReceiptScan({
        billTitle,
        createEntityId,
        isEditMode,
        participantCount: participants.length,
        scanResult,
      });

      setSplitMode(receiptDraft.splitMode);
      replaceDraftState({
        draftItemName: receiptDraft.draftItemName,
        draftItemPrice: receiptDraft.draftItemPrice,
        items: receiptDraft.items,
        expandedItemIds: receiptDraft.expandedItemIds,
      });
      setTaxInput(receiptDraft.taxInput);
      setTipInput(receiptDraft.tipInput);
      setFeesInput(receiptDraft.feesInput);
      setFinalTotalInput(receiptDraft.finalTotalInput);
      setBillTitle(receiptDraft.billTitle);
      setIsCustomTipEnabled(receiptDraft.isCustomTipEnabled);
      setCustomTipSplits(receiptDraft.customTipSplits);
      setCustomTipSplitType(receiptDraft.customTipSplitType);
      setReceiptScanWarnings(receiptDraft.receiptScanWarnings);
      setErrorMessage(null);
      setPendingReceiptScanResult(null);
      if (receiptDraft.createStep) {
        setCreateStep(receiptDraft.createStep);
      }
      appliedReceiptScanCorrelationRef.current = scanResult.requestCorrelation;
      trackObservabilityEvent('CREATE_BILL_RECEIPT_SCAN_APPLIED', {
        source: 'CreateBillScreen',
        isEditMode,
        itemCount: receiptDraft.items.length,
        warningCount: receiptDraft.receiptScanWarnings.length,
        confidence: scanResult.confidence,
      });
    },
    [
      billTitle,
      isEditMode,
      participants.length,
      replaceDraftState,
    ],
  );

  useEffect(() => {
    const scanResult = route.params?.receiptScanResult;
    if (!scanResult || appliedReceiptScanCorrelationRef.current === scanResult.requestCorrelation) {
      return;
    }

    navigation.setParams({ receiptScanResult: undefined });

    if (hasReceiptReplaceableDraftData()) {
      setPendingReceiptScanResult(scanResult);
      return;
    }

    applyReceiptScanResult(scanResult);
  }, [applyReceiptScanResult, hasReceiptReplaceableDraftData, navigation, route.params?.receiptScanResult]);

  const enableCustomTipSplit = () => {
    trackObservabilityEvent('CREATE_BILL_CUSTOM_TIP_TOGGLED', {
      source: 'CreateBillScreen',
      enabled: true,
      splitMode,
    });
    setIsCustomTipEnabled(true);
    setCustomTipSplits((currentSplits) => {
      return billDraftFacade.syncCustomTipSplitsToParticipants({
        participantIds,
        splits: currentSplits,
        totalAmount: normalizedTip,
      });
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
      billDraftFacade.changeCustomTipSplitType({
        nextType,
        splits: currentSplits,
        totalAmount: normalizedTip,
      }),
    );
  };

  const updateCustomTipSplitValue = (participantId: string, value: string) => {
    setCustomTipSplits((currentSplits) =>
      billDraftFacade.updateCustomTipSplitValue({
        participantId,
        splitType: customTipSplitType,
        splits: currentSplits,
        totalAmount: normalizedTip,
        value,
      }),
    );
  };

  const toggleCustomTipSplitLock = (participantId: string) => {
    setCustomTipSplits((currentSplits) =>
      billDraftFacade.toggleCustomTipSplitLock({
        participantId,
        splitType: customTipSplitType,
        splits: currentSplits,
        totalAmount: normalizedTip,
      }),
    );
  };

  const getCustomItemsStepError = useCallback(
    (): string | null =>
      itemCompositionController.getCustomItemsStepError({
        hasFinalTotalOverride,
        isCustomTipEnabled,
        isCustomTipSplitBalanced,
        parsedFees,
        parsedFinalTotal,
        parsedTax,
        parsedTip,
      }),
    [
      hasFinalTotalOverride,
      isCustomTipEnabled,
      isCustomTipSplitBalanced,
      itemCompositionController,
      parsedFees,
      parsedFinalTotal,
      parsedTax,
      parsedTip,
    ],
  );

  const existingEvenModeItemId = isEditMode
    ? (billQuery.data?.items.find((item) => item.splitMode !== 'advanced')?.id ?? billQuery.data?.items[0]?.id)
    : undefined;
  const screenTitle = isEditMode ? 'Edit Bill' : 'Create Bill';
  const screenSubtitle = isEditMode
    ? 'Update this split bill and confirm who owes what.'
    : 'Build a split bill and confirm who owes what.';
  const primaryActionLabel = isCreating ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Bill' : 'Create Bill');
  const errorToastTitle = isEditMode ? 'Save bill failed' : 'Create bill failed';
  const createSteps = isCustomSplitMode ? CUSTOM_BILL_STEPS : BASIC_BILL_STEPS;
  const currentCreateStepIndex = isCustomSplitMode
    ? CUSTOM_BILL_STEP_INDEX[createStep]
    : BASIC_BILL_STEP_INDEX[createStep];
  const createHeaderProgress = !isEditMode ? (
    <StepProgressBar compact currentStep={currentCreateStepIndex} steps={createSteps} />
  ) : null;
  const hasUnsavedChanges = useMemo(() => {
    if (isEditMode) {
      if (!isEditHydrated || !billQuery.data) {
        return false;
      }

      return (
        billTitle.trim() !== billQuery.data.title.trim() ||
        splitMode !== billDraftFacade.inferEditSplitMode(billQuery.data) ||
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

  const billSubmissionDraft = useMemo(
    () => ({
      billTitle,
      customTipSplits,
      customTipSplitType,
      editBill: billQuery.data,
      editBillId,
      equalTotalInput,
      existingEvenModeItemId,
      extrasSplitMode,
      feesInput,
      finalTotalInput,
      isCustomTipEnabled,
      isEditHydrated,
      isEditMode,
      items,
      owedAmountOverrides,
      participantRecordIdByDraftId,
      participants,
      payerParticipantId,
      splitMode,
      taxInput,
      tipInput,
    }),
    [
      billQuery.data,
      billTitle,
      customTipSplits,
      customTipSplitType,
      editBillId,
      equalTotalInput,
      existingEvenModeItemId,
      extrasSplitMode,
      feesInput,
      finalTotalInput,
      isCustomTipEnabled,
      isEditHydrated,
      isEditMode,
      items,
      owedAmountOverrides,
      participantRecordIdByDraftId,
      participants,
      payerParticipantId,
      splitMode,
      taxInput,
      tipInput,
    ],
  );

  const handleCreateBill = async () => {
    setErrorMessage(null);
    setIsCreating(true);

    try {
      const result = await submitCreateBill({
        billWrites,
        createEntityId,
        createdByUserId: user?.id ?? 'unknown_user',
        draft: billSubmissionDraft,
        hasNegativeParticipantAmount: owedAmountEntries.some((entry) => entry.amount < 0),
        hasUnresolvedSelectedFriends: selectedFriendIds.some((friendId) => {
          const friend = acceptedFriendById.get(friendId);
          return !friend?.userId?.trim();
        }),
        isOnline,
        selectedFriendCount: selectedFriendIds.length,
      });

      if (result.status === 'blocked' || result.status === 'failed') {
        setErrorMessage(result.errorMessage);
        return;
      }

      hasCompletedFlowRef.current = true;

      if (result.destination.name === 'Bills') {
        navigation.navigate('Bills');
        return;
      }

      navigation.reset({
        index: 1,
        routes: [
          { name: 'Bills' },
          {
            name: 'BillDetail',
            params: result.destination.params,
          },
        ],
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateBackPress = () => {
    if (createStep === 'splitType') {
      exitMethodRef.current = 'header_back';
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
      navigation.navigate('Bills');
      return;
    }

    setErrorMessage(null);
    if (createStep === 'source') {
      setCreateStep('splitType');
      return;
    }

    if (createStep === 'details') {
      setCreateStep(isCustomSplitMode ? 'source' : 'splitType');
      return;
    }

    if (createStep === 'items') {
      setCreateStep('details');
      return;
    }

    setCreateStep(isCustomSplitMode ? 'items' : 'details');
  };

  const validateDetailsStep = () => {
    if (!billTitle.trim()) {
      setErrorMessage('Bill name is required.');
      return false;
    }

    if (participants.length <= 1) {
      setErrorMessage('Add at least one other person to split with.');
      return false;
    }

    if ((isEqualSplitMode || isManualSplitMode) && (!Number.isFinite(parsedEqualTotal) || parsedEqualTotal <= 0)) {
      setErrorMessage('Enter a valid total bill price.');
      return false;
    }

    setErrorMessage(null);
    return true;
  };

  const handleCreatePrimaryPress = () => {
    if (createStep === 'splitType') {
      setErrorMessage(null);
      setCreateStep(isCustomSplitMode ? 'source' : 'details');
      return;
    }

    if (createStep === 'source') {
      setErrorMessage(null);
      setCreateStep('details');
      return;
    }

    if (createStep === 'details') {
      if (!validateDetailsStep()) {
        return;
      }
      setCreateStep(isCustomSplitMode ? 'items' : 'review');
      return;
    }

    if (createStep === 'items') {
      const itemStepError = getCustomItemsStepError();
      if (itemStepError) {
        setErrorMessage(itemStepError);
        return;
      }
      setErrorMessage(null);
      setCreateStep('review');
      return;
    }

    void handleCreateBill();
  };

  const createPrimaryAction = isEditMode
    ? {
        label: primaryActionLabel,
        onPress: () => {
          void handleCreateBill();
        },
        disabled: isCreating || (isEditMode && (!isEditHydrated || !billQuery.data)),
      }
    : {
        label:
          createStep === 'review'
            ? isCreating ? 'Creating...' : 'Create Bill'
            : createStep === 'source'
              ? 'Enter Items Manually'
              : 'Continue',
        onPress: handleCreatePrimaryPress,
        disabled: isCreating,
        loading: createStep === 'review' && isCreating,
      };

  const createSecondaryAction = isEditMode
    ? {
        label: 'Cancel',
        onPress: () => {
          exitMethodRef.current = 'secondary_cancel';
          navigation.goBack();
        },
        disabled: isCreating,
        variant: 'secondary' as const,
      }
    : createStep === 'splitType'
      ? {
          label: 'Cancel',
          onPress: () => {
            exitMethodRef.current = 'secondary_cancel';
            if (navigation.canGoBack()) {
              navigation.goBack();
              return;
            }
            navigation.navigate('Bills');
          },
          disabled: isCreating,
          variant: 'secondary' as const,
        }
      : {
          label: 'Back',
          onPress: handleCreateBackPress,
          disabled: isCreating,
          variant: 'secondary' as const,
        };

  return (
    <FeatureFormScreenScaffold
      bodyStyle={styles.body}
      headerBottomCompact={!isEditMode}
      headerBottomContent={createHeaderProgress}
      keyboardAware
      onBackPress={() => {
        if (!isEditMode) {
          handleCreateBackPress();
          return;
        }

        exitMethodRef.current = 'header_back';
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.navigate('Bills');
      }}
      primaryAction={createPrimaryAction}
      secondaryAction={createSecondaryAction}
      subtitle={screenSubtitle}
      testID={isEditMode ? 'edit-bill-screen' : 'create-bill-screen'}
      title={screenTitle}
    >
      {!isEditMode && createStep === 'splitType' ? (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons color={theme.colors.text.secondary} name="options-outline" size={16} />
            <Text style={styles.sectionTitle} variant="titleSm">Split Type</Text>
          </View>
          <SegmentedControl
            getOptionTestID={(value) => `bill-split-mode-${value}`}
            onChange={(value: CreateBillSplitMode) => {
              handleSplitModeChange(value);
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

      {!isEditMode && createStep === 'source' ? (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons color={theme.colors.text.secondary} name="receipt-outline" size={16} />
            <Text style={styles.sectionTitle} variant="titleSm">Custom Split Source</Text>
          </View>
          <Text style={styles.sectionHint} variant="bodySmCompact">
            Start from a receipt photo or enter itemized bill details yourself.
          </Text>
          <View style={styles.sourceActions}>
            <Button
              disabled={!isOnline}
              label="Scan Receipt"
              onPress={() => {
                trackObservabilityEvent('CREATE_BILL_RECEIPT_SCAN_TAPPED', {
                  source: 'CreateBillScreen',
                  isEditMode,
                  isOnline,
                  itemCount: items.length,
                });
                navigation.navigate('ReceiptScan', {
                  billId: editBillId,
                  returnTo: 'CreateBill',
                });
              }}
              style={styles.sourceActionButton}
              testID="bill-source-scan-receipt-button"
              variant="secondary"
            />
            <Button
              label="Enter Items Manually"
              onPress={() => {
                setErrorMessage(null);
                setCreateStep('details');
              }}
              style={styles.sourceActionButton}
              testID="bill-source-manual-items-button"
              variant="secondary"
            />
          </View>
          <Text style={styles.sectionHint} variant="bodySmCompact">
            {isOnline
              ? 'Receipt scans fill item and total details, then you assign participants in the bill draft.'
              : 'Receipt scanning requires an internet connection. You can still enter items manually.'}
          </Text>
        </Card>
      ) : null}

      {isEditMode || createStep === 'details' ? (
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
      ) : null}

      {isEditMode || createStep === 'details' ? (
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
      ) : null}

      {(isEditMode || createStep === 'details') && (isEqualSplitMode || isManualSplitMode) ? (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons color={theme.colors.text.secondary} name="cash-outline" size={16} />
            <Text style={styles.sectionTitle} variant="titleSm">Total Bill Price</Text>
          </View>
          <Input
            keyboardType="decimal-pad"
            onChangeText={handleEqualTotalInputChange}
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

      {(isEditMode || createStep === 'items') && isCustomSplitMode ? (
        <Card style={styles.sectionCard}>
          <BillDraftItemEditor
            controller={itemCompositionController.editor}
            onRemoveItemRequest={setPendingDeleteItem}
            participants={participants}
          />
        </Card>
      ) : null}

      {(isEditMode || createStep === 'items') && isCustomSplitMode ? (
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
              onChangeText={handleTaxInputChange}
              placeholder="0.00"
              testID="bill-tax-input"
              {...billNumericInputProps}
              value={taxInput}
            />
            <Input
              containerStyle={styles.tripleInputItem}
              keyboardType="decimal-pad"
              label="Fees"
              onChangeText={handleFeesInputChange}
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
                onChangeText={handleTipInputChange}
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
                onChangeText={handleTipInputChange}
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
                          updateCustomTipSplitValue(participant.id, sanitizeBillNumericInput(value));
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

      {(isEditMode || createStep === 'items') && isCustomSplitMode ? (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionTitleRow} testID="bill-final-price-section">
            <Ionicons color={theme.colors.text.secondary} name="receipt-outline" size={16} />
            <Text style={styles.sectionTitle} variant="titleSm">Final Price</Text>
            <StatusPill label="Optional" tone="muted" />
          </View>

          <Input
            keyboardType="decimal-pad"
            label="Final Price"
            onChangeText={handleFinalTotalInputChange}
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

      {(isEditMode || createStep === 'items') && receiptScanWarnings.length > 0 ? (
        <Card style={styles.receiptScanWarningCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons color={theme.colors.text.warning} name="alert-circle-outline" size={16} />
            <Text tone="warning" variant="labelStrong">Review receipt scan</Text>
          </View>
          <Text tone="warning" variant="bodySm">
            Scanned items start unassigned. Assign each item before saving.
          </Text>
          {receiptScanWarnings.slice(0, 3).map((warning) => (
            <Text key={warning} tone="warning" variant="bodySm">
              {warning}
            </Text>
          ))}
        </Card>
      ) : null}

      {isEditMode || createStep === 'review' ? (
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
            [participantId]: sanitizeBillNumericInput(value),
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
      ) : null}

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

          removeConfirmedItem(pendingDeleteItem.id);
          setPendingDeleteItem(null);
        }}
        title="Delete Bill Item?"
        visible={pendingDeleteItem !== null}
      />
      <ConfirmDestructiveModal
        cancelLabel="Keep Current Draft"
        confirmLabel="Replace Details"
        description="This will replace current items and totals from the receipt scan. Participants and payer will stay selected."
        onCancel={() => {
          setPendingReceiptScanResult(null);
        }}
        onConfirm={() => {
          if (pendingReceiptScanResult) {
            applyReceiptScanResult(pendingReceiptScanResult);
          }
        }}
        testID="replace-bill-details-confirmation-modal"
        title="Replace scanned bill details?"
        visible={pendingReceiptScanResult !== null}
      />
    </FeatureFormScreenScaffold>
  );
}
