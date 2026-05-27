import {
  submitCreateBill,
  type CreateBillSubmissionBillWrites,
  type SubmitCreateBillInput,
} from '../features/bills/createBillSubmissionLifecycle';
import type { BillRecord } from '../features';
import type {
  BillDraftSubmissionSnapshot,
  DraftParticipant,
} from '../features/bills/billDraft';
import { trackObservabilityEvent } from '../observability';

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

const mockedTrackObservabilityEvent =
  trackObservabilityEvent as jest.MockedFunction<typeof trackObservabilityEvent>;

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

function createEntityId(prefix: string): string {
  return `${prefix}_generated`;
}

function buildBillRecord(overrides: Partial<BillRecord> = {}): BillRecord {
  return {
    id: 'bill_123',
    title: 'Dinner Split',
    restaurantName: 'Dinner Split',
    createdByUserId: 'user-1',
    totalAmount: 40,
    items: [],
    participants: [],
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

function buildDraft(
  overrides: Partial<BillDraftSubmissionSnapshot> = {},
): BillDraftSubmissionSnapshot {
  return {
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
    ...overrides,
  };
}

describe('submitCreateBill', () => {
  const createBill = jest.fn();
  const updateBill = jest.fn();

  function buildInput(
    overrides: Partial<SubmitCreateBillInput> = {},
  ): SubmitCreateBillInput {
    const billWrites: CreateBillSubmissionBillWrites = {
      createBill,
      updateBill,
    };

    return {
      billWrites,
      createEntityId,
      createdByUserId: 'user-1',
      draft: buildDraft(),
      hasNegativeParticipantAmount: false,
      hasUnresolvedSelectedFriends: false,
      isOnline: true,
      selectedFriendCount: 0,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    createBill.mockResolvedValue({
      result: buildBillRecord(),
      status: 'completed',
    });
    updateBill.mockResolvedValue({
      result: buildBillRecord({ id: 'bill_edit' }),
      status: 'completed',
    });
  });

  it('returns validation failures before building Bill writes', async () => {
    const result = await submitCreateBill(
      buildInput({
        draft: buildDraft({ billTitle: '   ' }),
      }),
    );

    expect(result).toEqual({
      errorMessage: 'Bill name is required.',
      status: 'blocked',
    });
    expect(createBill).not.toHaveBeenCalled();
    expect(updateBill).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'CREATE_BILL_SUBMIT_VALIDATION_FAILED',
      expect.objectContaining({
        reason: 'missing_bill_name',
        source: 'CreateBillScreen',
      }),
    );
  });

  it('returns queued create navigation after Bill Writes queues a new Bill', async () => {
    createBill.mockResolvedValue({ status: 'queued' });

    const result = await submitCreateBill(buildInput());

    expect(createBill).toHaveBeenCalledWith(
      expect.objectContaining({
        createdByUserId: 'user-1',
        title: 'Dinner Split',
        totalAmount: 40,
      }),
    );
    expect(updateBill).not.toHaveBeenCalled();
    expect(result).toEqual({
      destination: { name: 'Bills' },
      status: 'queued',
    });
  });

  it('returns completed create detail navigation after Bill Writes saves a new Bill', async () => {
    const result = await submitCreateBill(buildInput());

    expect(createBill).toHaveBeenCalledWith(
      expect.objectContaining({
        createdByUserId: 'user-1',
        participants: expect.arrayContaining([
          expect.objectContaining({ id: 'user:self' }),
          expect.objectContaining({ id: 'custom:alex' }),
        ]),
      }),
    );
    expect(result).toEqual({
      destination: {
        name: 'BillDetail',
        params: { billId: 'bill_123' },
      },
      status: 'completed',
    });
  });

  it('returns queued edit navigation after Bill Writes queues an update', async () => {
    updateBill.mockResolvedValue({ status: 'queued' });

    const result = await submitCreateBill(
      buildInput({
        draft: buildDraft({
          editBill: buildBillRecord({ id: 'bill_edit' }),
          editBillId: 'bill_edit',
          isEditMode: true,
        }),
      }),
    );

    expect(createBill).not.toHaveBeenCalled();
    expect(updateBill).toHaveBeenCalledWith({
      billId: 'bill_edit',
      updates: expect.objectContaining({
        title: 'Dinner Split',
        totalAmount: 40,
      }),
    });
    expect(result).toEqual({
      destination: { name: 'Bills' },
      status: 'queued',
    });
  });

  it('returns completed edit detail navigation after Bill Writes saves an update', async () => {
    const result = await submitCreateBill(
      buildInput({
        draft: buildDraft({
          editBill: buildBillRecord({ id: 'bill_edit' }),
          editBillId: 'bill_edit',
          isEditMode: true,
        }),
      }),
    );

    expect(updateBill).toHaveBeenCalledWith({
      billId: 'bill_edit',
      updates: expect.objectContaining({
        title: 'Dinner Split',
      }),
    });
    expect(result).toEqual({
      destination: {
        name: 'BillDetail',
        params: { billId: 'bill_edit' },
      },
      status: 'completed',
    });
  });

  it('returns failed write errors without throwing', async () => {
    createBill.mockRejectedValue(new Error('PocketBase unavailable'));

    const result = await submitCreateBill(buildInput());

    expect(result).toEqual({
      errorMessage: 'PocketBase unavailable',
      status: 'failed',
    });
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'CREATE_BILL_SUBMIT_FAILED',
      expect.objectContaining({
        error: 'PocketBase unavailable',
      }),
    );
  });
});
