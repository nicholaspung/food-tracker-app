import {
  buildBillDraftSubmission,
  calculateSuggestedBillAmounts,
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
