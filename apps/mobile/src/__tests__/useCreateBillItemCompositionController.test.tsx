import { act, create } from 'react-test-renderer';

import type { DraftBillItem } from '../features/bills/billDraft';
import { trackObservabilityEvent } from '../observability';
import { useCreateBillItemCompositionController } from '../screens/createBill/useCreateBillItemCompositionController';

const mockedTrackObservabilityEvent =
  trackObservabilityEvent as jest.MockedFunction<typeof trackObservabilityEvent>;

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

type Controller = ReturnType<typeof useCreateBillItemCompositionController>;

function buildHarnessController(params?: {
  onClearError?: jest.Mock;
  onValidationError?: jest.Mock;
  splitMode?: string;
}) {
  const onClearError = params?.onClearError ?? jest.fn();
  const onValidationError = params?.onValidationError ?? jest.fn();
  let controller: Controller | null = null;

  function Harness() {
    controller = useCreateBillItemCompositionController({
      createEntityId: (prefix) => `${prefix}_1`,
      isCustomSplitMode: true,
      onClearError,
      onValidationError,
      participantIds: ['user:self', 'custom:alex'],
      splitMode: params?.splitMode ?? 'custom',
    });

    return null;
  }

  act(() => {
    create(<Harness />);
  });

  if (!controller) {
    throw new Error('Expected controller to be captured.');
  }

  return {
    controller: () => {
      if (!controller) {
        throw new Error('Expected controller to be captured.');
      }

      return controller;
    },
    onClearError,
    onValidationError,
  };
}

describe('useCreateBillItemCompositionController', () => {
  beforeEach(() => {
    mockedTrackObservabilityEvent.mockReset();
  });

  it('adds an item, tracks telemetry, and resets the draft item inputs', () => {
    const { controller, onClearError } = buildHarnessController();

    act(() => {
      controller().editor.setDraftItemName('Dumplings');
      controller().editor.handleDraftItemPriceChange('$12.3.4');
    });

    expect(controller().draftItemPrice).toBe('12.34');

    act(() => {
      controller().editor.addItem();
    });

    expect(controller().items).toEqual([
      expect.objectContaining({
        id: 'bill_item_draft_1',
        name: 'Dumplings',
        price: '12.34',
        assignedParticipantIds: ['user:self', 'custom:alex'],
      }),
    ]);
    expect(controller().draftItemName).toBe('');
    expect(controller().draftItemPrice).toBe('');
    expect(onClearError).toHaveBeenCalledTimes(1);
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith('CREATE_BILL_ITEM_ADDED', {
      source: 'CreateBillScreen',
      splitMode: 'custom',
      itemCount: 1,
    });
  });

  it('surfaces add validation failures without mutating items or tracking add telemetry', () => {
    const { controller, onValidationError } = buildHarnessController();

    act(() => {
      controller().replaceDraftState({ draftItemName: 'Sushi', draftItemPrice: '0' });
      controller().editor.addItem();
    });

    expect(controller().items).toEqual([]);
    expect(onValidationError).toHaveBeenCalledWith('Item price must be greater than zero.');
    expect(mockedTrackObservabilityEvent).not.toHaveBeenCalled();
  });

  it('owns expand and collapse state for draft items', () => {
    const { controller } = buildHarnessController();

    act(() => {
      controller().editor.toggleItemExpanded('item-1');
    });
    expect(controller().expandedItemIds).toEqual(['item-1']);

    act(() => {
      controller().editor.toggleItemExpanded('item-1');
    });
    expect(controller().expandedItemIds).toEqual([]);
  });

  it('removes confirmed items, clears expansion state, and tracks removal telemetry', () => {
    const { controller } = buildHarnessController();
    const item: DraftBillItem = {
      id: 'item-1',
      name: 'Tea',
      price: '4',
      splitMode: 'simple',
      assignedParticipantIds: ['user:self'],
      advancedSplitType: 'percentage',
      advancedSplits: [],
    };

    act(() => {
      controller().replaceDraftState({
        items: [item],
        expandedItemIds: ['item-1'],
      });
    });

    act(() => {
      controller().removeConfirmedItem('item-1');
    });

    expect(controller().items).toEqual([]);
    expect(controller().expandedItemIds).toEqual([]);
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith('CREATE_BILL_ITEM_REMOVED', {
      source: 'CreateBillScreen',
      splitMode: 'custom',
      itemCount: 0,
    });
  });

  it('toggles simple participant assignment through the controller', () => {
    const { controller } = buildHarnessController();
    const item: DraftBillItem = {
      id: 'item-1',
      name: 'Tea',
      price: '4',
      splitMode: 'simple',
      assignedParticipantIds: ['user:self', 'custom:alex'],
      advancedSplitType: 'percentage',
      advancedSplits: [],
    };

    act(() => {
      controller().replaceDraftState({ items: [item] });
      controller().editor.toggleSimpleItemParticipant('item-1', 'custom:alex');
    });

    expect(controller().items[0]?.assignedParticipantIds).toEqual(['user:self']);
    expect(controller().isSimpleItemParticipantAssigned(controller().items[0], 'custom:alex')).toBe(false);

    act(() => {
      controller().editor.toggleSimpleItemParticipant('item-1', 'custom:alex');
    });

    expect(controller().items[0]?.assignedParticipantIds).toEqual(['user:self', 'custom:alex']);
    expect(controller().isSimpleItemParticipantAssigned(controller().items[0], 'custom:alex')).toBe(true);
  });

  it('builds simple split summary text through the controller', () => {
    const { controller } = buildHarnessController();
    const participants = [
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
      {
        id: 'custom:sam',
        name: 'Sam',
        isCurrentUser: false,
      },
    ];
    const item: DraftBillItem = {
      id: 'item-1',
      name: 'Tea',
      price: '4',
      splitMode: 'simple',
      assignedParticipantIds: [],
      advancedSplitType: 'percentage',
      advancedSplits: [],
    };

    expect(controller().buildItemSplitSummary(item, participants)).toBe(
      'Simple split • no participants assigned',
    );
    expect(
      controller().buildItemSplitSummary(
        { ...item, assignedParticipantIds: ['custom:alex'] },
        participants,
      ),
    ).toBe('Simple split • assigned to Alex');
    expect(
      controller().buildItemSplitSummary(
        { ...item, assignedParticipantIds: ['user:self', 'custom:alex', 'custom:sam'] },
        participants,
      ),
    ).toBe('Simple split • shared by everyone');
    expect(
      controller().buildItemSplitSummary(
        { ...item, assignedParticipantIds: ['user:self', 'custom:alex'] },
        participants,
      ),
    ).toBe('Simple split • assigned to 2 participants');
  });

  it('normalizes item assignments for participant changes through the controller', () => {
    const { controller } = buildHarnessController();
    const item: DraftBillItem = {
      id: 'item-1',
      name: 'Tea',
      price: '4',
      splitMode: 'advanced',
      assignedParticipantIds: ['user:self', 'custom:alex', 'custom:sam'],
      advancedSplitType: 'percentage',
      advancedSplits: [
        {
          participantId: 'user:self',
          percentageValue: '50',
          amountValue: '2',
          percentageLocked: false,
          amountLocked: false,
        },
        {
          participantId: 'custom:sam',
          percentageValue: '50',
          amountValue: '2',
          percentageLocked: false,
          amountLocked: false,
        },
      ],
    };

    act(() => {
      controller().replaceDraftState({ items: [item] });
      controller().normalizeItemsForParticipants(['user:self', 'custom:alex']);
    });

    expect(controller().items[0]).toMatchObject({
      assignedParticipantIds: ['user:self', 'custom:alex'],
      advancedSplits: [
        expect.objectContaining({
          participantId: 'user:self',
        }),
      ],
    });
  });

  it('routes complex split assignment, value, lock, balance, and validation facts through the controller', () => {
    const { controller } = buildHarnessController();
    const item: DraftBillItem = {
      id: 'item-1',
      name: 'Tea',
      price: '12',
      splitMode: 'simple',
      assignedParticipantIds: ['user:self', 'custom:alex'],
      advancedSplitType: 'percentage',
      advancedSplits: [],
    };

    act(() => {
      controller().replaceDraftState({ items: [item] });
      controller().editor.updateItemSplitMode('item-1', 'advanced');
    });

    expect(controller().getAdvancedItemBalanceFact(controller().items[0])).toMatchObject({
      displayText: '100% of 100%',
      isBalanced: true,
      tone: 'success',
    });

    act(() => {
      controller().editor.updateAdvancedSplitType('item-1', 'amount');
    });

    const initialSplit = controller().items[0]?.advancedSplits[0];
    if (!initialSplit) {
      throw new Error('Expected advanced split.');
    }
    expect(controller().getAdvancedSplitInputValue(initialSplit, 'amount')).toBe('6.00');

    act(() => {
      controller().editor.updateAdvancedSplitValue('item-1', 'user:self', 'amount', '$2.0x0');
    });

    expect(controller().getAdvancedItemBalanceFact(controller().items[0])).toMatchObject({
      displayText: '$8.00 of $12.00',
      isBalanced: false,
      tone: 'warning',
    });
    expect(controller().getItemValidationFact(controller().items[0], 0)).toEqual({
      itemId: 'item-1',
      isValid: false,
      message: 'Tea amount splits must equal item price.',
    });

    act(() => {
      controller().editor.toggleAdvancedSplitLock('item-1', 'user:self', 'amount');
    });

    expect(controller().getAdvancedItemBalanceFact(controller().items[0])).toMatchObject({
      displayText: '$12.00 of $12.00',
      isBalanced: true,
    });
    expect(
      controller().isAdvancedSplitValueLocked(controller().items[0].advancedSplits[0], 'amount'),
    ).toBe(true);

    act(() => {
      controller().editor.toggleAdvancedItemParticipant('item-1', 'custom:alex');
    });

    expect(controller().items[0]?.advancedSplits).toEqual([
      expect.objectContaining({
        participantId: 'user:self',
        amountLocked: true,
        amountValue: '2.00',
      }),
    ]);
  });
});
