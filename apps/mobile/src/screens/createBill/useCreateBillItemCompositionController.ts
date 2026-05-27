import { useCallback, useMemo, useState } from 'react';

import {
  billDraftFacade,
  type DraftAdvancedSplitEntry,
  type DraftBillItemAdvancedSplitBalanceFact,
  type DraftBillItemValidationFact,
  sanitizeBillNumericInput,
  type DraftAdvancedSplitType,
  type DraftBillItem,
  type DraftParticipant,
} from '../../features/bills/billDraft';
import { trackObservabilityEvent } from '../../observability';

interface UseCreateBillItemCompositionControllerParams {
  createEntityId: (prefix: string) => string;
  isCustomSplitMode: boolean;
  onClearError: () => void;
  onValidationError: (message: string) => void;
  participantIds: string[];
  splitMode: string;
}

interface ValidateCustomItemsStepInput {
  hasFinalTotalOverride: boolean;
  isCustomTipEnabled: boolean;
  isCustomTipSplitBalanced: boolean;
  parsedFees: number;
  parsedFinalTotal: number;
  parsedTax: number;
  parsedTip: number;
}

export interface BillDraftItemCompositionController {
  draftItemName: string;
  draftItemPrice: string;
  editor: BillDraftItemEditorController;
  expandedItemIds: string[];
  items: DraftBillItem[];
  buildItemSplitSummary: (item: DraftBillItem, participants: DraftParticipant[]) => string;
  clearExpandedItems: () => void;
  getAdvancedItemBalanceFact: (item: DraftBillItem) => DraftBillItemAdvancedSplitBalanceFact | null;
  getAdvancedSplitInputValue: (
    split: DraftAdvancedSplitEntry,
    splitType: DraftAdvancedSplitType,
  ) => string;
  getCustomItemsStepError: (input: ValidateCustomItemsStepInput) => string | null;
  getItemValidationFact: (item: DraftBillItem, itemIndex: number) => DraftBillItemValidationFact;
  handleDraftItemPriceChange: (value: string) => void;
  isAdvancedSplitValueLocked: (
    split: DraftAdvancedSplitEntry,
    splitType: DraftAdvancedSplitType,
  ) => boolean;
  isSimpleItemParticipantAssigned: (item: DraftBillItem, participantId: string) => boolean;
  normalizeItemsForParticipants: (nextParticipantIds: string[]) => void;
  removeConfirmedItem: (itemId: string) => void;
  replaceDraftState: (state: BillDraftItemStateReplacement) => void;
  resetDraftState: () => void;
  toggleAdvancedItemParticipant: (itemId: string, participantId: string) => void;
  toggleAdvancedSplitLock: (
    itemId: string,
    participantId: string,
    splitType: DraftAdvancedSplitType,
  ) => void;
  toggleItemExpanded: (itemId: string) => void;
  toggleSimpleItemParticipant: (itemId: string, participantId: string) => void;
  updateAdvancedSplitType: (itemId: string, nextType: DraftAdvancedSplitType) => void;
  updateAdvancedSplitValue: (
    itemId: string,
    participantId: string,
    splitType: DraftAdvancedSplitType,
    value: string,
  ) => void;
  updateItemSplitMode: (itemId: string, nextSplitMode: DraftBillItem['splitMode']) => void;
}

export interface BillDraftItemEditorController {
  draftItemName: string;
  draftItemPrice: string;
  expandedItemIds: string[];
  items: DraftBillItem[];
  addItem: () => void;
  buildItemSplitSummary: (item: DraftBillItem, participants: DraftParticipant[]) => string;
  getAdvancedItemBalanceFact: (item: DraftBillItem) => DraftBillItemAdvancedSplitBalanceFact | null;
  getAdvancedSplitInputValue: (
    split: DraftAdvancedSplitEntry,
    splitType: DraftAdvancedSplitType,
  ) => string;
  handleDraftItemPriceChange: (value: string) => void;
  isAdvancedSplitValueLocked: (
    split: DraftAdvancedSplitEntry,
    splitType: DraftAdvancedSplitType,
  ) => boolean;
  isSimpleItemParticipantAssigned: (item: DraftBillItem, participantId: string) => boolean;
  setDraftItemName: (value: string) => void;
  toggleAdvancedItemParticipant: (itemId: string, participantId: string) => void;
  toggleAdvancedSplitLock: (
    itemId: string,
    participantId: string,
    splitType: DraftAdvancedSplitType,
  ) => void;
  toggleItemExpanded: (itemId: string) => void;
  toggleSimpleItemParticipant: (itemId: string, participantId: string) => void;
  updateAdvancedSplitType: (itemId: string, nextType: DraftAdvancedSplitType) => void;
  updateAdvancedSplitValue: (
    itemId: string,
    participantId: string,
    splitType: DraftAdvancedSplitType,
    value: string,
  ) => void;
  updateItemSplitMode: (itemId: string, nextSplitMode: DraftBillItem['splitMode']) => void;
}

export interface BillDraftItemStateReplacement {
  draftItemName?: string;
  draftItemPrice?: string;
  expandedItemIds?: string[];
  items?: DraftBillItem[];
}

export function useCreateBillItemCompositionController({
  createEntityId,
  isCustomSplitMode,
  onClearError,
  onValidationError,
  participantIds,
  splitMode,
}: UseCreateBillItemCompositionControllerParams): BillDraftItemCompositionController {
  const [draftItemName, setDraftItemName] = useState('');
  const [draftItemPrice, setDraftItemPrice] = useState('');
  const [expandedItemIds, setExpandedItemIds] = useState<string[]>([]);
  const [items, setItems] = useState<DraftBillItem[]>([]);

  const handleDraftItemPriceChange = useCallback((value: string) => {
    setDraftItemPrice(sanitizeBillNumericInput(value));
  }, []);

  const toggleItemExpanded = useCallback((itemId: string) => {
    setExpandedItemIds((currentIds) =>
      currentIds.includes(itemId)
        ? currentIds.filter((currentId) => currentId !== itemId)
        : [...currentIds, itemId],
    );
  }, []);

  const addItem = useCallback(() => {
    const result = billDraftFacade.addItem({
      createEntityId,
      draftItemName,
      draftItemPrice,
      isCustomSplitMode,
      items,
      participantIds,
    });

    if (!result.ok) {
      onValidationError(result.message);
      return;
    }

    setItems(result.items);
    setDraftItemName('');
    setDraftItemPrice('');
    onClearError();
    trackObservabilityEvent('CREATE_BILL_ITEM_ADDED', {
      source: 'CreateBillScreen',
      splitMode,
      itemCount: result.items.length,
    });
  }, [
    createEntityId,
    draftItemName,
    draftItemPrice,
    isCustomSplitMode,
    items,
    onClearError,
    onValidationError,
    participantIds,
    splitMode,
  ]);

  const removeItem = useCallback(
    (itemId: string) => {
      setItems((currentItems) => billDraftFacade.removeItem(currentItems, { itemId }));
      setExpandedItemIds((currentIds) => currentIds.filter((currentId) => currentId !== itemId));
      trackObservabilityEvent('CREATE_BILL_ITEM_REMOVED', {
        source: 'CreateBillScreen',
        splitMode,
        itemCount: Math.max(0, items.length - 1),
      });
    },
    [items.length, splitMode],
  );

  const removeConfirmedItem = useCallback(
    (itemId: string) => {
      removeItem(itemId);
    },
    [removeItem],
  );

  const replaceDraftState = useCallback((state: BillDraftItemStateReplacement) => {
    if (state.draftItemName !== undefined) {
      setDraftItemName(state.draftItemName);
    }

    if (state.draftItemPrice !== undefined) {
      setDraftItemPrice(state.draftItemPrice);
    }

    if (state.items !== undefined) {
      setItems(state.items);
    }

    if (state.expandedItemIds !== undefined) {
      setExpandedItemIds(state.expandedItemIds);
    }
  }, []);

  const resetDraftState = useCallback(() => {
    setDraftItemName('');
    setDraftItemPrice('');
    setItems([]);
    setExpandedItemIds([]);
  }, []);

  const clearExpandedItems = useCallback(() => {
    setExpandedItemIds([]);
  }, []);

  const updateItemSplitMode = useCallback(
    (itemId: string, nextSplitMode: DraftBillItem['splitMode']) => {
      setItems((currentItems) =>
        billDraftFacade.updateItemSplitMode(currentItems, {
          itemId,
          nextSplitMode,
          participantIds,
        }),
      );
    },
    [participantIds],
  );

  const toggleSimpleItemParticipant = useCallback((itemId: string, participantId: string) => {
    setItems((currentItems) =>
      billDraftFacade.toggleSimpleItemParticipant(currentItems, {
        itemId,
        participantId,
      }),
    );
  }, []);

  const isSimpleItemParticipantAssigned = useCallback(
    (item: DraftBillItem, participantId: string) =>
      billDraftFacade.isSimpleItemParticipantAssigned(item, participantId),
    [],
  );

  const buildItemSplitSummary = useCallback(
    (item: DraftBillItem, draftParticipants: DraftParticipant[]) =>
      billDraftFacade.buildItemSplitSummary(item, draftParticipants),
    [],
  );

  const getAdvancedItemBalanceFact = useCallback(
    (item: DraftBillItem) => billDraftFacade.getAdvancedSplitBalanceFact(item),
    [],
  );

  const getAdvancedSplitInputValue = useCallback(
    (split: DraftAdvancedSplitEntry, splitType: DraftAdvancedSplitType) =>
      billDraftFacade.getAdvancedSplitInputValue(split, splitType),
    [],
  );

  const isAdvancedSplitValueLocked = useCallback(
    (split: DraftAdvancedSplitEntry, splitType: DraftAdvancedSplitType) =>
      billDraftFacade.isAdvancedSplitValueLocked(split, splitType),
    [],
  );

  const getItemValidationFact = useCallback(
    (item: DraftBillItem, itemIndex: number) =>
      billDraftFacade.getItemValidationFact(item, itemIndex),
    [],
  );

  const getCustomItemsStepError = useCallback(
    (input: ValidateCustomItemsStepInput) =>
      billDraftFacade.validateCustomItemsStep({
        ...input,
        items,
      }),
    [items],
  );

  const normalizeItemsForParticipants = useCallback((nextParticipantIds: string[]) => {
    setItems((currentItems) =>
      billDraftFacade.normalizeItemsForParticipants(currentItems, nextParticipantIds),
    );
  }, []);

  const updateAdvancedSplitType = useCallback((itemId: string, nextType: DraftAdvancedSplitType) => {
    setItems((currentItems) =>
      billDraftFacade.updateAdvancedSplitType(currentItems, {
        itemId,
        nextType,
      }),
    );
  }, []);

  const toggleAdvancedItemParticipant = useCallback((itemId: string, participantId: string) => {
    setItems((currentItems) =>
      billDraftFacade.toggleAdvancedItemParticipant(currentItems, {
        itemId,
        participantId,
      }),
    );
  }, []);

  const updateAdvancedSplitValue = useCallback((
    itemId: string,
    participantId: string,
    splitType: DraftAdvancedSplitType,
    value: string,
  ) => {
    setItems((currentItems) =>
      billDraftFacade.updateAdvancedSplitValue(currentItems, {
        itemId,
        participantId,
        splitType,
        value,
      }),
    );
  }, []);

  const toggleAdvancedSplitLock = useCallback((
    itemId: string,
    participantId: string,
    splitType: DraftAdvancedSplitType,
  ) => {
    setItems((currentItems) =>
      billDraftFacade.toggleAdvancedSplitLock(currentItems, {
        itemId,
        participantId,
        splitType,
      }),
    );
  }, []);

  const editor = useMemo<BillDraftItemEditorController>(
    () => ({
      draftItemName,
      draftItemPrice,
      expandedItemIds,
      items,
      addItem,
      buildItemSplitSummary,
      getAdvancedItemBalanceFact,
      getAdvancedSplitInputValue,
      handleDraftItemPriceChange,
      isAdvancedSplitValueLocked,
      isSimpleItemParticipantAssigned,
      setDraftItemName,
      toggleAdvancedItemParticipant,
      toggleAdvancedSplitLock,
      toggleItemExpanded,
      toggleSimpleItemParticipant,
      updateAdvancedSplitType,
      updateAdvancedSplitValue,
      updateItemSplitMode,
    }),
    [
      addItem,
      buildItemSplitSummary,
      draftItemName,
      draftItemPrice,
      expandedItemIds,
      getAdvancedItemBalanceFact,
      getAdvancedSplitInputValue,
      handleDraftItemPriceChange,
      isAdvancedSplitValueLocked,
      isSimpleItemParticipantAssigned,
      items,
      toggleAdvancedItemParticipant,
      toggleAdvancedSplitLock,
      toggleItemExpanded,
      toggleSimpleItemParticipant,
      updateAdvancedSplitType,
      updateAdvancedSplitValue,
      updateItemSplitMode,
    ],
  );

  return {
    draftItemName,
    draftItemPrice,
    editor,
    expandedItemIds,
    items,
    buildItemSplitSummary,
    clearExpandedItems,
    getAdvancedItemBalanceFact,
    getAdvancedSplitInputValue,
    getCustomItemsStepError,
    getItemValidationFact,
    handleDraftItemPriceChange,
    isAdvancedSplitValueLocked,
    isSimpleItemParticipantAssigned,
    normalizeItemsForParticipants,
    removeConfirmedItem,
    replaceDraftState,
    resetDraftState,
    toggleAdvancedItemParticipant,
    toggleAdvancedSplitLock,
    toggleItemExpanded,
    toggleSimpleItemParticipant,
    updateAdvancedSplitType,
    updateAdvancedSplitValue,
    updateItemSplitMode,
  };
}
