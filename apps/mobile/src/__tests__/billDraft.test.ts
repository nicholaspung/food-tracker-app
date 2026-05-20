import {
  addDraftBillItem,
  buildBillDraftSubmission,
  calculateSuggestedBillAmounts,
  changeAdvancedSplitType,
  normalizeDraftBillItemsForParticipants,
  syncAdvancedSplitsToParticipants,
  toggleAdvancedDraftBillItemParticipant,
  toggleAdvancedSplitLock,
  toggleDraftBillItemAdvancedSplitLock,
  toggleSimpleDraftBillItemParticipant,
  updateAdvancedSplitValue,
  updateDraftBillItemAdvancedSplitType,
  updateDraftBillItemAdvancedSplitValue,
  updateDraftBillItemSplitMode,
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

function buildBaseSubmissionInput(
  overrides: Partial<Parameters<typeof buildBillDraftSubmission>[0]> = {},
): Parameters<typeof buildBillDraftSubmission>[0] {
  const participantIds = participants.map((participant) => participant.id);
  const suggestedAmounts = new Map([
    ['user:self', 20],
    ['custom:alex', 20],
  ]);

  return {
    billTitle: 'Dinner Split',
    createEntityId,
    customTipContributionMap: new Map(),
    customTipSplitBalanced: true,
    editBill: null,
    editBillId: undefined,
    existingEvenModeItemId: undefined,
    extrasSplitMode: 'equal',
    hasFinalTotalOverride: false,
    isCustomSplitMode: false,
    isCustomTipEnabled: false,
    isEditHydrated: true,
    isEditMode: false,
    isEqualSplitMode: true,
    isManualSplitMode: false,
    items: [],
    owedAmountOverrides: {},
    participantIds,
    participantRecordIdByDraftId: {},
    participants,
    payerParticipantId: 'user:self',
    parsedEqualTotal: 40,
    parsedFees: 0,
    parsedFinalTotal: 0,
    parsedTax: 0,
    parsedTip: 0,
    previewTotal: 40,
    suggestedAmounts,
    ...overrides,
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
  it('adds draft items with default simple splits', () => {
    const result = addDraftBillItem({
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
      addDraftBillItem({
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
      addDraftBillItem({
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
    const advancedItems = updateDraftBillItemSplitMode(
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

    const simpleItems = updateDraftBillItemSplitMode(advancedItems, {
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
    const simpleItems = toggleSimpleDraftBillItemParticipant(
      [buildDraftItem()],
      {
        itemId: 'draft_item_1',
        participantId: 'custom:alex',
      },
    );
    expect(simpleItems[0]?.assignedParticipantIds).toEqual(['user:self']);

    const advancedItems = updateDraftBillItemSplitMode(
      [buildDraftItem()],
      {
        itemId: 'draft_item_1',
        nextSplitMode: 'advanced',
        participantIds: ['user:self', 'custom:alex'],
      },
    );
    const removedAdvancedItems = toggleAdvancedDraftBillItemParticipant(
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
    const [advancedItem] = updateDraftBillItemSplitMode(
      [buildDraftItem()],
      {
        itemId: 'draft_item_1',
        nextSplitMode: 'advanced',
        participantIds: ['user:self', 'custom:alex'],
      },
    );

    const typeItems = updateDraftBillItemAdvancedSplitType(
      [advancedItem],
      {
        itemId: 'draft_item_1',
        nextType: 'amount',
      },
    );
    expect(typeItems[0]?.advancedSplitType).toBe('amount');

    const lockedItems = toggleDraftBillItemAdvancedSplitLock(typeItems, {
      itemId: 'draft_item_1',
      participantId: 'user:self',
      splitType: 'amount',
    });
    const updatedItems = updateDraftBillItemAdvancedSplitValue(lockedItems, {
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

    const result = normalizeDraftBillItemsForParticipants(
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
    const initialSplits = syncAdvancedSplitsToParticipants({
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

    const amountSplits = changeAdvancedSplitType({
      nextType: 'amount',
      splits: initialSplits,
      totalAmount: 12,
    });
    const lockedSplits = toggleAdvancedSplitLock({
      participantId: 'user:self',
      splitType: 'amount',
      splits: amountSplits,
      totalAmount: 12,
    });
    const updatedSplits = updateAdvancedSplitValue({
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

describe('bill draft submission', () => {
  it('builds an equal split payload with generated bill item ids', () => {
    const result = buildBillDraftSubmission(buildBaseSubmissionInput());

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

    const result = buildBillDraftSubmission(
      buildBaseSubmissionInput({
        extrasSplitMode: 'proportional',
        isCustomSplitMode: true,
        isEqualSplitMode: false,
        items: [item],
        previewTotal: 30,
        suggestedAmounts: new Map([
          ['user:self', 21],
          ['custom:alex', 9],
        ]),
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

    const result = buildBillDraftSubmission(
      buildBaseSubmissionInput({
        editBill,
        editBillId: 'bill_1',
        existingEvenModeItemId: 'item_existing',
        isEditMode: true,
        participantRecordIdByDraftId: {
          'user:self': 'participant_self',
          'custom:alex': 'participant_alex',
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
