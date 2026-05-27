import {
  billDraftFacade,
  calculateSuggestedBillAmounts,
  sanitizeBillNumericInput,
  type BillDraftSubmissionSnapshot,
  type DraftBillItem,
  type DraftParticipant,
} from '../features/bills/billDraft';
import type { BillRecord } from '../features';

function createEntityId(prefix: string): string {
  return `${prefix}_generated`;
}

const participants: DraftParticipant[] = [
  {
    id: 'user:self',
    name: 'Pat',
    userId: 'user-1',
    isCurrentUser: true,
  },
  {
    id: 'custom:alex',
    name: 'Alex',
    isCurrentUser: false,
  },
];

function buildBillRecord(overrides: Partial<BillRecord> = {}): BillRecord {
  return {
    id: 'bill_1',
    title: 'Dinner Split',
    restaurantName: 'Dinner Split',
    createdByUserId: 'user-1',
    totalAmount: 40,
    items: [
      {
        id: 'item_existing',
        itemName: 'Dinner Split',
        price: 40,
        assignedToParticipantIds: ['participant_self', 'participant_alex'],
        splitMode: 'simple',
        splitConfig: null,
      },
    ],
    participants: [
      {
        id: 'participant_self',
        name: 'Pat',
        userId: 'user-1',
        amountOwed: 20,
        paidStatus: 'paid',
      },
      {
        id: 'participant_alex',
        name: 'Alex',
        userId: 'user-2',
        friendshipId: 'friend_alex',
        amountOwed: 20,
        paidStatus: 'pending',
      },
    ],
    tax: 0,
    tip: 0,
    fees: 0,
    extrasSplitMode: 'equal',
    status: 'open',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  };
}

describe('bill numeric input sanitization', () => {
  it('keeps only digits and one decimal point', () => {
    expect(sanitizeBillNumericInput('$12.3a4')).toBe('12.34');
    expect(sanitizeBillNumericInput('1.2.3')).toBe('1.23');
    expect(sanitizeBillNumericInput('-10 apples')).toBe('10');
    expect(sanitizeBillNumericInput('abc')).toBe('');
  });
});

type BuildSubmissionInput = Parameters<typeof billDraftFacade.buildSubmission>[0];

function buildBaseSubmissionInput(
  overrides: Partial<Omit<BuildSubmissionInput, 'draft'>> & {
    draft?: Partial<BillDraftSubmissionSnapshot>;
  } = {},
): BuildSubmissionInput {
  const baseDraft: BillDraftSubmissionSnapshot = {
    billTitle: 'Dinner Split',
    customTipSplits: [],
    customTipSplitType: 'amount',
    editBill: null,
    editBillId: undefined,
    equalTotalInput: '40',
    existingEvenModeItemId: undefined,
    extrasSplitMode: 'equal',
    feesInput: '',
    finalTotalInput: '',
    isCustomTipEnabled: false,
    isEditHydrated: true,
    isEditMode: false,
    items: [],
    owedAmountOverrides: {},
    participantRecordIdByDraftId: {},
    participants,
    payerParticipantId: 'user:self',
    splitMode: 'equal',
    taxInput: '',
    tipInput: '',
  };

  return {
    createEntityId,
    ...overrides,
    draft: {
      ...baseDraft,
      ...(overrides.draft ?? {}),
    },
  };
}

function buildDraftItem(overrides: Partial<DraftBillItem> = {}): DraftBillItem {
  return {
    id: 'draft_item_1',
    name: 'Sushi',
    price: '30',
    splitMode: 'simple',
    assignedParticipantIds: ['user:self', 'custom:alex'],
    advancedSplitType: 'percentage',
    advancedSplits: [],
    ...overrides,
  };
}

describe('bill draft item transitions', () => {
  it('exposes screen-level item actions through the facade', () => {
    const addResult = billDraftFacade.addItem({
      createEntityId,
      draftItemName: 'Noodles',
      draftItemPrice: '12.50',
      isCustomSplitMode: true,
      items: [],
      participantIds: ['user:self', 'custom:alex'],
    });

    expect(addResult.ok).toBe(true);
    if (!addResult.ok) {
      return;
    }

    const advancedItems = billDraftFacade.updateItemSplitMode(addResult.items, {
      itemId: addResult.item.id,
      nextSplitMode: 'advanced',
      participantIds: ['user:self', 'custom:alex'],
    });
    const toggledItems = billDraftFacade.toggleAdvancedItemParticipant(advancedItems, {
      itemId: addResult.item.id,
      participantId: 'custom:alex',
    });

    expect(toggledItems[0]?.advancedSplits).toHaveLength(1);
    expect(toggledItems[0]?.advancedSplits[0]?.participantId).toBe('user:self');
  });

  it('adds draft items with default simple splits', () => {
    const result = billDraftFacade.addItem({
      createEntityId,
      draftItemName: '',
      draftItemPrice: '12.345',
      isCustomSplitMode: false,
      items: [],
      participantIds: ['user:self', 'custom:alex'],
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.item).toEqual({
      id: 'bill_item_draft_generated',
      name: 'Item 1',
      price: '12.35',
      splitMode: 'simple',
      assignedParticipantIds: ['user:self', 'custom:alex'],
      advancedSplitType: 'percentage',
      advancedSplits: [],
    });
    expect(result.items).toEqual([result.item]);
  });

  it('rejects invalid draft item input', () => {
    expect(
      billDraftFacade.addItem({
        createEntityId,
        draftItemName: 'Sushi',
        draftItemPrice: '0',
        isCustomSplitMode: false,
        items: [],
        participantIds: ['user:self'],
      }),
    ).toEqual({
      ok: false,
      reason: 'invalid_price',
      message: 'Item price must be greater than zero.',
    });

    expect(
      billDraftFacade.addItem({
        createEntityId,
        draftItemName: '',
        draftItemPrice: '10',
        isCustomSplitMode: true,
        items: [],
        participantIds: ['user:self'],
      }),
    ).toEqual({
      ok: false,
      reason: 'missing_custom_item_name',
      message: 'Item name is required for custom split.',
    });
  });

  it('switches simple items into advanced splits and back', () => {
    const advancedItems = billDraftFacade.updateItemSplitMode(
      [buildDraftItem()],
      {
        itemId: 'draft_item_1',
        nextSplitMode: 'advanced',
        participantIds: ['user:self', 'custom:alex'],
      },
    );

    expect(advancedItems[0]).toMatchObject({
      splitMode: 'advanced',
      advancedSplitType: 'percentage',
    });
    expect(advancedItems[0]?.advancedSplits).toEqual([
      expect.objectContaining({
        participantId: 'user:self',
        percentageValue: '50.00',
        amountValue: '15.00',
      }),
      expect.objectContaining({
        participantId: 'custom:alex',
        percentageValue: '50.00',
        amountValue: '15.00',
      }),
    ]);

    const simpleItems = billDraftFacade.updateItemSplitMode(advancedItems, {
      itemId: 'draft_item_1',
      nextSplitMode: 'simple',
      participantIds: ['user:self', 'custom:alex'],
    });

    expect(simpleItems[0]).toMatchObject({
      splitMode: 'simple',
      assignedParticipantIds: ['user:self', 'custom:alex'],
    });
  });

  it('toggles simple and advanced participant assignment', () => {
    const simpleItems = billDraftFacade.toggleSimpleItemParticipant(
      [buildDraftItem()],
      {
        itemId: 'draft_item_1',
        participantId: 'custom:alex',
      },
    );
    expect(simpleItems[0]?.assignedParticipantIds).toEqual(['user:self']);

    const advancedItems = billDraftFacade.updateItemSplitMode(
      [buildDraftItem()],
      {
        itemId: 'draft_item_1',
        nextSplitMode: 'advanced',
        participantIds: ['user:self', 'custom:alex'],
      },
    );
    const removedAdvancedItems = billDraftFacade.toggleAdvancedItemParticipant(
      advancedItems,
      {
        itemId: 'draft_item_1',
        participantId: 'custom:alex',
      },
    );
    expect(removedAdvancedItems[0]?.advancedSplits).toEqual([
      expect.objectContaining({
        participantId: 'user:self',
        percentageValue: '100.00',
        amountValue: '30.00',
      }),
    ]);
  });

  it('updates advanced split type, values, and locks', () => {
    const [advancedItem] = billDraftFacade.updateItemSplitMode(
      [buildDraftItem()],
      {
        itemId: 'draft_item_1',
        nextSplitMode: 'advanced',
        participantIds: ['user:self', 'custom:alex'],
      },
    );

    const typeItems = billDraftFacade.updateAdvancedSplitType(
      [advancedItem],
      {
        itemId: 'draft_item_1',
        nextType: 'amount',
      },
    );
    expect(typeItems[0]?.advancedSplitType).toBe('amount');

    const lockedItems = billDraftFacade.toggleAdvancedSplitLock(typeItems, {
      itemId: 'draft_item_1',
      participantId: 'user:self',
      splitType: 'amount',
    });
    const updatedItems = billDraftFacade.updateAdvancedSplitValue(lockedItems, {
      itemId: 'draft_item_1',
      participantId: 'user:self',
      splitType: 'amount',
      value: '20',
    });

    expect(updatedItems[0]?.advancedSplits).toEqual([
      expect.objectContaining({
        participantId: 'user:self',
        amountLocked: true,
        amountValue: '20',
      }),
      expect.objectContaining({
        participantId: 'custom:alex',
        amountValue: '10.00',
      }),
    ]);
  });
});

describe('bill draft participant and custom tip split transitions', () => {
  it('normalizes item assignments when participants change', () => {
    const item = buildDraftItem({
      assignedParticipantIds: ['user:self', 'custom:alex', 'custom:sam'],
      splitMode: 'advanced',
      advancedSplits: [
        {
          participantId: 'user:self',
          percentageValue: '50',
          amountValue: '15',
          percentageLocked: false,
          amountLocked: false,
        },
        {
          participantId: 'custom:sam',
          percentageValue: '50',
          amountValue: '15',
          percentageLocked: false,
          amountLocked: false,
        },
      ],
    });

    const result = billDraftFacade.normalizeItemsForParticipants(
      [item],
      ['user:self', 'custom:alex'],
    );

    expect(result[0]).toMatchObject({
      assignedParticipantIds: ['user:self', 'custom:alex'],
      advancedSplits: [
        expect.objectContaining({
          participantId: 'user:self',
          percentageValue: '50',
          amountValue: '15',
        }),
      ],
    });
  });

  it('keeps participant-aware custom tip splits balanced', () => {
    const initialSplits = billDraftFacade.syncCustomTipSplitsToParticipants({
      participantIds: ['user:self', 'custom:alex'],
      splits: [],
      totalAmount: 12,
    });

    expect(initialSplits).toEqual([
      expect.objectContaining({
        participantId: 'user:self',
        percentageValue: '50.00',
        amountValue: '6.00',
      }),
      expect.objectContaining({
        participantId: 'custom:alex',
        percentageValue: '50.00',
        amountValue: '6.00',
      }),
    ]);

    const amountSplits = billDraftFacade.changeCustomTipSplitType({
      nextType: 'amount',
      splits: initialSplits,
      totalAmount: 12,
    });
    const lockedSplits = billDraftFacade.toggleCustomTipSplitLock({
      participantId: 'user:self',
      splitType: 'amount',
      splits: amountSplits,
      totalAmount: 12,
    });
    const updatedSplits = billDraftFacade.updateCustomTipSplitValue({
      participantId: 'user:self',
      splitType: 'amount',
      splits: lockedSplits,
      totalAmount: 12,
      value: '8',
    });

    expect(updatedSplits).toEqual([
      expect.objectContaining({
        participantId: 'user:self',
        amountLocked: true,
        amountValue: '8',
      }),
      expect.objectContaining({
        participantId: 'custom:alex',
        amountValue: '4.00',
      }),
    ]);
  });
});

describe('bill draft editing lifecycle', () => {
  it('hydrates edit drafts with participant, payer, manual owed, and itemized split state', () => {
    const bill = buildBillRecord({
      totalAmount: 53,
      splitMode: 'itemized',
      extrasSplitMode: 'proportional',
      tax: 3,
      tip: 6,
      fees: 4,
      items: [
        {
          id: 'item_sushi',
          itemName: 'Sushi',
          price: 30,
          assignedToParticipantIds: ['participant_self'],
          splitMode: 'simple',
          splitConfig: null,
        },
        {
          id: 'item_ramen',
          itemName: 'Ramen',
          price: 10,
          assignedToParticipantIds: ['participant_self', 'participant_alex'],
          splitMode: 'advanced',
          splitConfig: [
            { participantId: 'participant_self', type: 'percentage', value: 70 },
            { participantId: 'participant_alex', type: 'percentage', value: 30 },
          ],
        },
      ],
      participants: [
        {
          id: 'participant_self',
          name: 'Pat',
          userId: 'user-1',
          amountOwed: 39,
          paidStatus: 'paid',
          customTipContribution: 4,
        },
        {
          id: 'participant_alex',
          name: 'Alex',
          userId: 'user-2',
          friendshipId: 'friend_alex',
          amountOwed: 14,
          paidStatus: 'pending',
          customTipContribution: 2,
        },
      ],
    });

    const hydrated = billDraftFacade.hydrateEditDraft({
      acceptedFriends: [
        {
          id: 'friend_alex',
          userId: 'user-2',
          name: 'Alex',
          email: 'alex@example.com',
          status: 'friend',
          createdAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      bill,
      createEntityId,
      currentUserDraftId: 'user:self',
      currentUserId: 'user-1',
    });

    expect(hydrated).toMatchObject({
      billTitle: 'Dinner Split',
      splitMode: 'custom',
      selectedFriendIds: ['friend_alex'],
      payerParticipantId: 'user:self',
      taxInput: '3.00',
      tipInput: '6.00',
      feesInput: '4.00',
      finalTotalInput: '',
      isCustomTipEnabled: true,
      participantRecordIdByDraftId: {
        'user:self': 'participant_self',
        'user:friend_alex': 'participant_alex',
      },
      owedAmountOverrides: {
        'user:self': '39.00',
        'user:friend_alex': '14.00',
      },
    });
    expect(hydrated.items).toEqual([
      expect.objectContaining({
        id: 'item_sushi',
        splitMode: 'simple',
        assignedParticipantIds: ['user:self'],
      }),
      expect.objectContaining({
        id: 'item_ramen',
        splitMode: 'advanced',
        advancedSplitType: 'percentage',
        advancedSplits: [
          expect.objectContaining({ participantId: 'user:self', percentageValue: '70.00' }),
          expect.objectContaining({ participantId: 'user:friend_alex', percentageValue: '30.00' }),
        ],
      }),
    ]);
    expect(hydrated.customTipSplits).toEqual([
      expect.objectContaining({ participantId: 'user:self', amountValue: '4.00' }),
      expect.objectContaining({ participantId: 'user:friend_alex', amountValue: '2.00' }),
    ]);
  });

  it('preserves compatible draft data when switching basic modes and resets custom-only calculation state', () => {
    const customItem = buildDraftItem();
    const manualTransition = billDraftFacade.changeSplitMode({
      currentSplitMode: 'equal',
      nextSplitMode: 'manual',
      draft: {
        customTipSplits: [],
        customTipSplitType: 'amount',
        draftItemName: '',
        draftItemPrice: '',
        expandedItemIds: [],
        feesInput: '',
        finalTotalInput: '',
        isCustomTipEnabled: false,
        items: [],
        owedAmountOverrides: { 'user:self': '25.00' },
        receiptScanWarnings: [],
        taxInput: '',
        tipInput: '',
      },
    });

    expect(manualTransition.owedAmountOverrides).toEqual({ 'user:self': '25.00' });
    expect(manualTransition.splitMode).toBe('manual');

    const equalTransition = billDraftFacade.changeSplitMode({
      currentSplitMode: 'manual',
      nextSplitMode: 'equal',
      draft: {
        ...manualTransition,
        customTipSplits: [],
        customTipSplitType: 'amount',
        draftItemName: '',
        draftItemPrice: '',
        feesInput: '',
        finalTotalInput: '',
        isCustomTipEnabled: false,
        items: [],
        receiptScanWarnings: [],
        taxInput: '',
        tipInput: '',
      },
    });
    expect(equalTransition.owedAmountOverrides).toEqual({});

    const customTransition = billDraftFacade.changeSplitMode({
      currentSplitMode: 'custom',
      nextSplitMode: 'equal',
      draft: {
        customTipSplits: [
          {
            participantId: 'user:self',
            percentageValue: '100',
            amountValue: '8',
            percentageLocked: false,
            amountLocked: false,
          },
        ],
        customTipSplitType: 'percentage',
        draftItemName: 'Temp',
        draftItemPrice: '12',
        expandedItemIds: ['draft_item_1'],
        feesInput: '1',
        finalTotalInput: '50',
        isCustomTipEnabled: true,
        items: [customItem],
        owedAmountOverrides: { 'user:self': '25.00' },
        receiptScanWarnings: ['Review receipt'],
        taxInput: '2',
        tipInput: '3',
      },
    });

    expect(customTransition).toMatchObject({
      customTipSplits: [],
      customTipSplitType: 'amount',
      draftItemName: '',
      draftItemPrice: '',
      expandedItemIds: [],
      feesInput: '',
      finalTotalInput: '',
      isCustomTipEnabled: false,
      items: [],
      owedAmountOverrides: {},
      receiptScanWarnings: [],
      taxInput: '',
      tipInput: '',
    });
  });

  it('applies receipt scans with warnings, final total overrides, and next step routing', () => {
    const applied = billDraftFacade.applyReceiptScan({
      billTitle: '',
      createEntityId,
      isEditMode: false,
      participantCount: 2,
      scanResult: {
        requestCorrelation: 'scan_1',
        restaurantName: 'Nori',
        items: [
          {
            name: 'Sushi',
            price: 20,
            confidence: 'low',
            warning: 'Possible duplicate line.',
          },
        ],
        tax: 2,
        tip: 3,
        fees: 1,
        discount: 2,
        finalTotal: 24,
        confidence: 'medium',
        warnings: ['Receipt total differs from line items.'],
      },
    });

    expect(applied).toMatchObject({
      billTitle: 'Nori',
      createStep: 'items',
      splitMode: 'custom',
      taxInput: '2.00',
      tipInput: '3.00',
      feesInput: '1.00',
      finalTotalInput: '24.00',
      isCustomTipEnabled: false,
      customTipSplits: [],
    });
    expect(applied.items).toEqual([
      expect.objectContaining({
        name: 'Sushi',
        price: '20.00',
        assignedParticipantIds: [],
      }),
    ]);
    expect(applied.expandedItemIds).toEqual([applied.items[0]?.id]);
    expect(applied.receiptScanWarnings).toEqual([
      'Receipt total differs from line items.',
      'Possible duplicate line.',
      'Review "Sushi" before saving.',
    ]);
  });

  it('derives submission-ready preview totals and manual owed validation state', () => {
    const preview = billDraftFacade.derivePreviewState({
      customTipSplitType: 'amount',
      customTipSplits: [],
      equalTotalInput: '40',
      extrasSplitMode: 'equal',
      feesInput: '',
      finalTotalInput: '',
      isCustomTipEnabled: false,
      items: [],
      owedAmountOverrides: {
        'user:self': '25',
        'custom:alex': '15',
      },
      participants,
      splitMode: 'manual',
      taxInput: '',
      tipInput: '',
    });

    expect(preview).toMatchObject({
      parsedEqualTotal: 40,
      previewTotal: 40,
      owedTotal: 40,
      totalsMatch: true,
    });
    expect(preview.owedAmountEntries).toEqual([
      expect.objectContaining({
        participant: expect.objectContaining({ id: 'user:self' }),
        inputValue: '25',
        amount: 25,
        isValidInput: true,
      }),
      expect.objectContaining({
        participant: expect.objectContaining({ id: 'custom:alex' }),
        inputValue: '15',
        amount: 15,
        isValidInput: true,
      }),
    ]);
  });
});

describe('bill draft submission', () => {
  it('builds an equal split payload with generated bill item ids', () => {
    const result = billDraftFacade.buildSubmission(buildBaseSubmissionInput());

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.payload).toMatchObject({
      title: 'Dinner Split',
      restaurantName: 'Dinner Split',
      totalAmount: 40,
      tax: 0,
      tip: 0,
      fees: 0,
      extrasSplitMode: 'equal',
    });
    expect(result.payload.items).toEqual([
      expect.objectContaining({
        id: 'bill_item_generated',
        itemName: 'Dinner Split',
        price: 40,
        assignedToParticipantIds: ['user:self', 'custom:alex'],
        splitMode: 'simple',
        splitConfig: null,
      }),
    ]);
    expect(result.payload.participants).toEqual([
      expect.objectContaining({
        id: 'user:self',
        amountOwed: 20,
        paidStatus: 'paid',
      }),
      expect.objectContaining({
        id: 'custom:alex',
        amountOwed: 20,
        paidStatus: 'pending',
      }),
    ]);
  });

  it('builds a manual split payload from owed override entries', () => {
    const result = billDraftFacade.buildSubmission(
      buildBaseSubmissionInput({
        draft: {
          owedAmountOverrides: {
            'user:self': '25',
            'custom:alex': '15',
          },
          splitMode: 'manual',
        },
      }),
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.payload.totalAmount).toBe(40);
    expect(result.payload.participants).toEqual([
      expect.objectContaining({
        id: 'user:self',
        amountOwed: 25,
        paidStatus: 'paid',
      }),
      expect.objectContaining({
        id: 'custom:alex',
        amountOwed: 15,
        paidStatus: 'pending',
      }),
    ]);
  });

  it('builds a custom split payload from raw item and total inputs', () => {
    const result = billDraftFacade.buildSubmission(
      buildBaseSubmissionInput({
        draft: {
          equalTotalInput: '',
          extrasSplitMode: 'proportional',
          feesInput: '1',
          items: [
            buildDraftItem({
              id: 'item_1',
              name: 'Sushi',
              price: '30',
              assignedParticipantIds: ['user:self'],
            }),
            buildDraftItem({
              id: 'item_2',
              name: 'Ramen',
              price: '10',
              assignedParticipantIds: ['custom:alex'],
            }),
          ],
          splitMode: 'custom',
          taxInput: '2',
          tipInput: '3',
        },
      }),
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.payload).toMatchObject({
      totalAmount: 46,
      tax: 2,
      tip: 3,
      fees: 1,
      extrasSplitMode: 'proportional',
    });
    expect(result.payload.participants).toEqual([
      expect.objectContaining({ id: 'user:self', amountOwed: 34.5 }),
      expect.objectContaining({ id: 'custom:alex', amountOwed: 11.5 }),
    ]);
  });

  it('honors receipt-scan final total overrides in custom drafts', () => {
    const result = billDraftFacade.buildSubmission(
      buildBaseSubmissionInput({
        draft: {
          equalTotalInput: '',
          extrasSplitMode: 'proportional',
          finalTotalInput: '43',
          items: [
            buildDraftItem({
              id: 'receipt_item_1',
              name: 'Sushi',
              price: '30',
              assignedParticipantIds: ['user:self'],
            }),
            buildDraftItem({
              id: 'receipt_item_2',
              name: 'Ramen',
              price: '10',
              assignedParticipantIds: ['custom:alex'],
            }),
          ],
          splitMode: 'custom',
          taxInput: '2',
          tipInput: '3',
        },
      }),
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.payload.totalAmount).toBe(43);
    expect(result.payload.participants).toEqual([
      expect.objectContaining({ id: 'user:self', amountOwed: 32.25 }),
      expect.objectContaining({ id: 'custom:alex', amountOwed: 10.75 }),
    ]);
  });

  it('rejects advanced percentage splits that do not total 100 percent', () => {
    const item: DraftBillItem = {
      id: 'draft_item_1',
      name: 'Sushi',
      price: '30',
      splitMode: 'advanced',
      assignedParticipantIds: ['user:self', 'custom:alex'],
      advancedSplitType: 'percentage',
      advancedSplits: [
        {
          participantId: 'user:self',
          percentageValue: '70',
          amountValue: '21',
          percentageLocked: false,
          amountLocked: false,
        },
        {
          participantId: 'custom:alex',
          percentageValue: '20',
          amountValue: '6',
          percentageLocked: false,
          amountLocked: false,
        },
      ],
    };

    const result = billDraftFacade.buildSubmission(
      buildBaseSubmissionInput({
        draft: {
          equalTotalInput: '',
          extrasSplitMode: 'proportional',
          finalTotalInput: '30',
          items: [item],
          splitMode: 'custom',
        },
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'advanced_percentage_mismatch',
      message: 'Sushi percentages must total 100%.',
    });
  });

  it('preserves participant and item record ids when editing', () => {
    const editBill: BillRecord = {
      id: 'bill_1',
      title: 'Dinner Split',
      restaurantName: 'Dinner Split',
      createdByUserId: 'user-1',
      totalAmount: 40,
      items: [
        {
          id: 'item_existing',
          itemName: 'Dinner Split',
          price: 40,
          assignedToParticipantIds: ['participant_self', 'participant_alex'],
          splitMode: 'simple',
          splitConfig: null,
        },
      ],
      participants: [
        {
          id: 'participant_self',
          name: 'Pat',
          userId: 'user-1',
          amountOwed: 20,
          paidStatus: 'paid',
        },
        {
          id: 'participant_alex',
          name: 'Alex',
          amountOwed: 20,
          paidStatus: 'pending',
        },
      ],
      tax: 0,
      tip: 0,
      fees: 0,
      extrasSplitMode: 'equal',
      status: 'open',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
    };

    const result = billDraftFacade.buildSubmission(
      buildBaseSubmissionInput({
        draft: {
          editBill,
          editBillId: 'bill_1',
          existingEvenModeItemId: 'item_existing',
          isEditMode: true,
          participantRecordIdByDraftId: {
            'user:self': 'participant_self',
            'custom:alex': 'participant_alex',
          },
        },
      }),
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.payload.items?.[0]?.id).toBe('item_existing');
    expect(result.payload.items?.[0]?.assignedToParticipantIds).toEqual([
      'participant_self',
      'participant_alex',
    ]);
    expect(result.payload.participants?.map((participant) => participant.id)).toEqual([
      'participant_self',
      'participant_alex',
    ]);
  });
});

describe('bill draft calculations', () => {
  it('distributes custom item totals and proportional extras', () => {
    const amounts = calculateSuggestedBillAmounts({
      customTipSplitType: 'amount',
      customTipSplits: [],
      effectiveDistributableExtrasTotal: 6,
      extrasSplitMode: 'proportional',
      isCustomSplitMode: true,
      isCustomTipEnabled: false,
      items: [
        {
          id: 'item_1',
          name: 'Sushi',
          price: '30',
          splitMode: 'simple',
          assignedParticipantIds: ['user:self'],
          advancedSplitType: 'percentage',
          advancedSplits: [],
        },
        {
          id: 'item_2',
          name: 'Ramen',
          price: '10',
          splitMode: 'simple',
          assignedParticipantIds: ['custom:alex'],
          advancedSplitType: 'percentage',
          advancedSplits: [],
        },
      ],
      normalizedTip: 0,
      participantIds: ['user:self', 'custom:alex'],
      previewTotal: 46,
    });

    expect(amounts.get('user:self')).toBe(34.5);
    expect(amounts.get('custom:alex')).toBe(11.5);
  });
});
