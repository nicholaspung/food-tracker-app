import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createBill,
  createEntityId,
  getBillById,
  updateBill,
} from '../features';
import { useBillWrites } from '../features/store/useBillWrites';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { CreateBillScreen } from '../screens/CreateBillScreen';

const mockReact = React;

const mockTheme = {
  colors: {
    background: {
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      default: 'default-border',
      info: 'info-border',
      strong: 'strong-border',
      subtle: 'subtle-border',
      success: 'success-border',
      warning: 'warning-border',
    },
    button: {
      primaryBg: 'primary-button-background',
      primaryDisabledBg: 'primary-button-disabled',
      secondaryBg: 'secondary-button-background',
      secondaryBorder: 'secondary-button-border',
    },
    fill: {
      brand: 'brand-fill',
      danger: 'danger-fill',
    },
    status: {
      infoBg: 'info-background',
      successBg: 'success-background',
      warningBg: 'warning-background',
    },
    text: {
      brand: 'brand-text',
      danger: 'danger-text',
      info: 'info-text',
      inverse: 'inverse-text',
      muted: 'muted-text',
      primary: 'primary-text',
      secondary: 'secondary-text',
      success: 'success-text',
    },
  },
  radii: {
    lg: 16,
    md: 12,
    pill: 999,
  },
  sizes: {
    buttonHeight: 48,
    inputMinHeight: 48,
    secondaryButtonHeight: 40,
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
  },
  typography: {
    bodyLg: { fontSize: 18 },
    titleSm: { fontSize: 20, fontWeight: '700' },
  },
} as const;

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Pressable: ({
      children,
      ...props
    }: Record<string, unknown> & {
      children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    }) =>
      React.createElement(
        'Pressable',
        props,
        typeof children === 'function' ? children({ pressed: false }) : children,
      ),
    ScrollView: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('ScrollView', props, children),
    StyleSheet: {
      absoluteFillObject: {},
      create: <T,>(value: T) => value,
    },
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('../components/shared', () => ({
  ConfirmDestructiveModal: (props: Record<string, unknown>) =>
    mockReact.createElement('ConfirmDestructiveModal', props),
  FeatureFormScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureFormScreenScaffold', props, children),
  OptionList: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('OptionList', props, children),
  OptionListInlineBody: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('OptionListInlineBody', props, children),
  OptionListRow: (props: Record<string, unknown>) => mockReact.createElement('OptionListRow', props),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  SegmentedControl: (props: Record<string, unknown>) => mockReact.createElement('SegmentedControl', props),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
  StepProgressBar: (props: Record<string, unknown>) => mockReact.createElement('StepProgressBar', props),
}));

jest.mock('../features', () => ({
  createBill: jest.fn(),
  createEntityId: jest.fn(),
  friendsQueryKeys: {
    paginated: (userId: string | null | undefined, section: string, search?: string) =>
      search?.trim()
        ? ['feature', 'friends', 'user', userId ?? 'anonymous', 'paginated', section, search.trim()]
        : ['feature', 'friends', 'user', userId ?? 'anonymous', 'paginated', section],
  },
  getBillById: jest.fn(),
  hydrateFriendsSummaryFromPaginatedData: jest.fn(),
  listFriendsPage: jest.fn(),
  updateBill: jest.fn(),
}));

jest.mock('../features/store/useBillWrites', () => ({
  useBillWrites: jest.fn(),
}));

jest.mock('../hooks/useDebouncedValue', () => ({
  useDebouncedValue: (value: string) => value,
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(mockTheme, ...args),
  useTheme: () => mockTheme,
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Modal: ({
    children,
    visible,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode; visible?: boolean }) =>
    visible ? mockReact.createElement('Modal', props, children) : null,
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<typeof useInfiniteQuery>;
const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedCreateBill = createBill as jest.MockedFunction<typeof createBill>;
const mockedCreateEntityId = createEntityId as jest.MockedFunction<typeof createEntityId>;
const mockedGetBillById = getBillById as jest.MockedFunction<typeof getBillById>;
const mockedUpdateBill = updateBill as jest.MockedFunction<typeof updateBill>;
const mockedUseBillWrites = useBillWrites as jest.MockedFunction<typeof useBillWrites>;
const mockedTrackObservabilityEvent =
  trackObservabilityEvent as jest.MockedFunction<typeof trackObservabilityEvent>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
type TestRenderer = ReturnType<typeof create> & { root: any };

function buildInfiniteQueryResult(items: Record<string, unknown>[]) {
  return {
    data: {
      pageParams: [1],
      pages: [
        {
          hasNextPage: false,
          items,
          page: 1,
          pageSize: 20,
          totalItems: items.length,
          totalPages: 1,
        },
      ],
    },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading: false,
    isSuccess: true,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useInfiniteQuery>;
}

function buildBillQueryResult(data: Record<string, unknown> | null) {
  return {
    data,
    isError: false,
    isFetching: false,
    isLoading: false,
    isSuccess: Boolean(data),
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useQuery>;
}

function buildBill(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: '2026-04-20T00:00:00.000Z',
    createdByUserId: 'user-1',
    extrasSplitMode: 'equal',
    fees: 0,
    id: 'bill_1',
    items: [
      {
        assignedToParticipantIds: ['participant_self', 'participant_alex'],
        id: 'item_1',
        itemName: 'Dinner Split',
        price: 40,
        splitConfig: null,
        splitMode: 'simple',
      },
    ],
    participants: [
      {
        amountOwed: 20,
        id: 'participant_self',
        name: 'Pat',
        paidStatus: 'paid',
        userId: 'user-1',
      },
      {
        amountOwed: 20,
        id: 'participant_alex',
        name: 'Alex',
        paidStatus: 'pending',
      },
    ],
    restaurantName: 'Dinner Split',
    splitMode: 'even',
    status: 'open',
    tax: 0,
    tip: 0,
    title: 'Dinner Split',
    totalAmount: 40,
    updatedAt: '2026-04-20T00:00:00.000Z',
    ...overrides,
  } as Awaited<ReturnType<typeof createBill>> & Record<string, unknown>;
}

function createSavedBillResult(
  input: Parameters<typeof createBill>[0],
  billId: string,
): Awaited<ReturnType<typeof createBill>> {
  return buildBill({
    ...input,
    id: billId,
  }) as Awaited<ReturnType<typeof createBill>>;
}

function findByTestId(renderer: TestRenderer, type: string, testID: string) {
  const match = renderer.root.findAllByType(type).find((node: any) => node.props.testID === testID);
  if (!match) {
    throw new Error(`Could not find ${type} with testID "${testID}".`);
  }

  return match;
}

function findOptionRowByTitle(renderer: TestRenderer, title: string) {
  const match = renderer.root.findAllByType('OptionListRow').find(
    (node: any) => node.props.title === title && node.props.rightAccessory,
  );
  if (!match) {
    throw new Error(`Could not find OptionListRow with title "${title}".`);
  }

  return match;
}

function findBillItemRowByTitle(renderer: TestRenderer, title: string) {
  const match = renderer.root.findAllByType('OptionListRow').find(
    (node: any) => node.props.title === title && node.props.accessibilityState,
  );
  if (!match) {
    throw new Error(`Could not find bill item OptionListRow with title "${title}".`);
  }

  return match;
}

function getTextContent(node: any): string {
  return node.children
    .map((child: any) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child);
      }

      return getTextContent(child);
    })
    .join('');
}

function hasExactText(renderer: TestRenderer, value: string): boolean {
  return renderer.root.findAllByType('Text').some((node: any) => getTextContent(node) === value);
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('CreateBillScreen', () => {
  let billQueryData: Record<string, unknown> | null;
  let friendsItems: Record<string, unknown>[];
  let entityCounter: number;
  let navigation: {
    canGoBack: jest.Mock;
    goBack: jest.Mock;
    navigate: jest.Mock;
    reset: jest.Mock;
  };
  let queryClient: {
    invalidateQueries: jest.Mock;
  };

  beforeEach(() => {
    billQueryData = null;
    friendsItems = [];
    entityCounter = 0;
    navigation = {
      canGoBack: jest.fn(() => true),
      goBack: jest.fn(),
      navigate: jest.fn(),
      reset: jest.fn(),
    };
    queryClient = {
      invalidateQueries: jest.fn(async () => undefined),
    };

    mockedUseInfiniteQuery.mockReset();
    const friendsQueryResult = buildInfiniteQueryResult(friendsItems);
    mockedUseInfiniteQuery.mockImplementation(() => friendsQueryResult);

    mockedUseQuery.mockReset();
    mockedUseQuery.mockImplementation(() => buildBillQueryResult(billQueryData));

    mockedUseQueryClient.mockReset();
    mockedUseQueryClient.mockReturnValue(queryClient as unknown as ReturnType<typeof useQueryClient>);

    mockedCreateBill.mockReset();
    mockedCreateBill.mockImplementation(async (input) => createSavedBillResult(input, 'bill_saved'));

    mockedCreateEntityId.mockReset();
    mockedCreateEntityId.mockImplementation((prefix: string) => {
      entityCounter += 1;
      return `${prefix}_${entityCounter}`;
    });

    mockedGetBillById.mockReset();
    mockedUpdateBill.mockReset();
    mockedTrackObservabilityEvent.mockReset();

    mockedUseBillWrites.mockReset();
    mockedUseBillWrites.mockReturnValue({
      createBill: async (input: Parameters<ReturnType<typeof useBillWrites>['createBill']>[0]) => ({
        result: await mockedCreateBill(input),
        status: 'completed' as const,
      }),
      deleteBill: jest.fn(),
      updateBill: async ({
        billId,
        updates,
      }: Parameters<ReturnType<typeof useBillWrites>['updateBill']>[0]) => ({
        result: await mockedUpdateBill(billId, updates),
        status: 'completed' as const,
      }),
      updateBillStatus: jest.fn(),
      updateParticipantPaidStatus: jest.fn(),
    } as unknown as ReturnType<typeof useBillWrites>);

    mockedUseAuth.mockReset();
    mockedUseAuth.mockReturnValue({
      user: {
        email: 'pat@example.com',
        id: 'user-1',
        name: 'Pat',
      },
    } as ReturnType<typeof useAuth>);

    mockedUseConnectivity.mockReset();
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as ReturnType<typeof useConnectivity>);
  });

  async function renderScreen(routeParams?: { billId?: string }): Promise<TestRenderer> {
    let renderer: TestRenderer | null = null;

    await act(async () => {
      renderer = create(
        <CreateBillScreen
          navigation={navigation as never}
          route={{
            key: 'CreateBill-route',
            name: 'CreateBill',
            params: routeParams,
          } as never}
        />,
      ) as TestRenderer;
    });

    if (!renderer) {
      throw new Error('Expected renderer to be created.');
    }

    await flushMicrotasks();
    return renderer as TestRenderer;
  }

  async function addTypedParticipant(renderer: TestRenderer, name: string) {
    let pickerTrigger = renderer.root.findAllByType('OptionListRow').find(
      (node: any) => node.props.testID === 'bill-friends-picker-trigger',
    );
    if (!pickerTrigger) {
      const scaffold = renderer.root.findByType('FeatureFormScreenScaffold');
      await act(async () => {
        scaffold.props.primaryAction.onPress();
      });
      pickerTrigger = findByTestId(renderer, 'OptionListRow', 'bill-friends-picker-trigger');
    }

    await act(async () => {
      pickerTrigger.props.onPress();
    });

    const customParticipantInput = findByTestId(renderer, 'Input', 'bill-custom-participant-input');
    await act(async () => {
      customParticipantInput.props.onChangeText(name);
    });

    const addPersonButton = findByTestId(renderer, 'Button', 'bill-custom-participant-add-button');
    await act(async () => {
      addPersonButton.props.onPress();
    });

    const participantPickerModal = renderer.root.findByType('Modal');
    await act(async () => {
      participantPickerModal.props.primaryAction.onPress();
    });
    await flushMicrotasks();
  }

  async function switchToCustomSplitMode(renderer: TestRenderer) {
    const splitModeControl = renderer.root.findAllByType('SegmentedControl').find(
      (node: any) => node.props.value === 'equal',
    );
    if (!splitModeControl) {
      throw new Error('Could not find split mode control.');
    }

    await act(async () => {
      splitModeControl.props.onChange('custom');
    });
  }

  async function switchToManualSplitMode(renderer: TestRenderer) {
    const splitModeControl = renderer.root.findAllByType('SegmentedControl').find(
      (node: any) => node.props.value === 'equal',
    );
    if (!splitModeControl) {
      throw new Error('Could not find split mode control.');
    }

    await act(async () => {
      splitModeControl.props.onChange('manual');
    });
  }

  async function goToCustomItemsStep(renderer: TestRenderer) {
    await switchToCustomSplitMode(renderer);

    let scaffold = renderer.root.findByType('FeatureFormScreenScaffold');
    await act(async () => {
      scaffold.props.primaryAction.onPress();
    });

    const manualItemsButton = findByTestId(renderer, 'Button', 'bill-source-manual-items-button');
    await act(async () => {
      manualItemsButton.props.onPress();
    });

    const billNameInput = findByTestId(renderer, 'Input', 'bill-name-input');
    await act(async () => {
      billNameInput.props.onChangeText('Custom Dinner');
    });

    await addTypedParticipant(renderer, 'Alex');

    scaffold = renderer.root.findByType('FeatureFormScreenScaffold');
    await act(async () => {
      scaffold.props.primaryAction.onPress();
    });
  }

  async function addBillItem(renderer: TestRenderer, name: string, price: string) {
    const itemNameInput = findByTestId(renderer, 'Input', 'bill-item-name-input');
    await act(async () => {
      itemNameInput.props.onChangeText(name);
    });

    const itemPriceInput = findByTestId(renderer, 'Input', 'bill-item-price-input');
    await act(async () => {
      itemPriceInput.props.onChangeText(price);
    });

    const addItemButton = renderer.root.findAllByType('Pressable').find(
      (node: any) => node.props.children?.props?.children === '+ Add Item',
    );
    if (!addItemButton) {
      throw new Error('Could not find add item button.');
    }

    await act(async () => {
      addItemButton.props.onPress();
    });
  }

  it('accepts a typed participant with zero selected friends', async () => {
    const renderer = await renderScreen();

    await addTypedParticipant(renderer, 'Alex');

    expect(findByTestId(renderer, 'OptionListRow', 'bill-friends-picker-trigger').props.title).toBe('Alex');
  });

  it('submits a typed participant in the bill payload', async () => {
    const renderer = await renderScreen();

    await addTypedParticipant(renderer, 'Alex');

    const billNameInput = findByTestId(renderer, 'Input', 'bill-name-input');
    await act(async () => {
      billNameInput.props.onChangeText('Dinner Split');
    });

    const totalInput = findByTestId(renderer, 'Input', 'bill-total-bill-price-input');
    await act(async () => {
      totalInput.props.onChangeText('40.00');
    });

    const scaffold = renderer.root.findByType('FeatureFormScreenScaffold');
    await act(async () => {
      scaffold.props.primaryAction.onPress();
    });
    await act(async () => {
      scaffold.props.primaryAction.onPress();
    });
    await flushMicrotasks();

    expect(mockedCreateBill).toHaveBeenCalledTimes(1);

    const submittedPayload = mockedCreateBill.mock.calls[0]?.[0];
    expect(submittedPayload).toMatchObject({
      createdByUserId: 'user-1',
      title: 'Dinner Split',
    });
    expect(submittedPayload.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Pat',
          userId: 'user-1',
        }),
        expect.objectContaining({
          name: 'Alex',
          userId: undefined,
        }),
      ]),
    );
  });

  it('filters non-numeric characters from bill total input', async () => {
    const renderer = await renderScreen();

    const scaffold = renderer.root.findByType('FeatureFormScreenScaffold');
    await act(async () => {
      scaffold.props.primaryAction.onPress();
    });

    const totalInput = findByTestId(renderer, 'Input', 'bill-total-bill-price-input');
    await act(async () => {
      totalInput.props.onChangeText('$4a0..50');
    });

    expect(findByTestId(renderer, 'Input', 'bill-total-bill-price-input').props.value).toBe('40.50');
  });

  it('filters non-numeric characters from custom split numeric inputs', async () => {
    const renderer = await renderScreen();

    await goToCustomItemsStep(renderer);

    const itemPriceInput = findByTestId(renderer, 'Input', 'bill-item-price-input');
    await act(async () => {
      itemPriceInput.props.onChangeText('$1a2.3.4');
    });
    expect(findByTestId(renderer, 'Input', 'bill-item-price-input').props.value).toBe('12.34');

    const taxInput = findByTestId(renderer, 'Input', 'bill-tax-input');
    const feesInput = findByTestId(renderer, 'Input', 'bill-fees-input');
    const tipInput = findByTestId(renderer, 'Input', 'bill-tip-input');
    const finalTotalInput = findByTestId(renderer, 'Input', 'bill-final-price-input');
    await act(async () => {
      taxInput.props.onChangeText('tax 1.2.3');
      feesInput.props.onChangeText('fee 4.5.6');
      tipInput.props.onChangeText('tip 7.8.9');
      finalTotalInput.props.onChangeText('total 10.1.2');
    });

    expect(findByTestId(renderer, 'Input', 'bill-tax-input').props.value).toBe('1.23');
    expect(findByTestId(renderer, 'Input', 'bill-fees-input').props.value).toBe('4.56');
    expect(findByTestId(renderer, 'Input', 'bill-tip-input').props.value).toBe('7.89');
    expect(findByTestId(renderer, 'Input', 'bill-final-price-input').props.value).toBe('10.12');

    const customTipButton = findByTestId(renderer, 'Pressable', 'bill-enable-custom-tip-button');
    await act(async () => {
      customTipButton.props.onPress();
    });

    const customTipInput = findByTestId(renderer, 'Input', 'bill-custom-tip-input');
    await act(async () => {
      customTipInput.props.onChangeText('$8x.9.0');
    });

    const customTipSplitInput = findByTestId(renderer, 'Input', 'bill-custom-tip-split-input-0');
    await act(async () => {
      customTipSplitInput.props.onChangeText('split 1.2.5');
    });

    expect(findByTestId(renderer, 'Input', 'bill-custom-tip-input').props.value).toBe('8.90');
    expect(findByTestId(renderer, 'Input', 'bill-custom-tip-split-input-0').props.value).toBe('1.25');
  });

  it('preserves a non-friend participant in edit mode', async () => {
    billQueryData = buildBill();

    const renderer = await renderScreen({ billId: 'bill_1' });

    expect(hasExactText(renderer, 'Alex')).toBe(true);
    expect(
      renderer.root.findAllByType('PageErrorToast').some(
        (node: any) =>
          typeof node.props.errorMessage === 'string' &&
          node.props.errorMessage.includes('unavailable in your friend list'),
      ),
    ).toBe(false);
  });

  it('does not show receipt scanning when editing a custom bill', async () => {
    billQueryData = buildBill({
      extrasSplitMode: 'proportional',
      splitMode: 'itemized',
    });

    const renderer = await renderScreen({ billId: 'bill_1' });

    expect(
      renderer.root.findAllByType('Pressable').some(
        (node: any) => node.props.testID === 'bill-receipt-scan-button',
      ),
    ).toBe(false);
    expect(hasExactText(renderer, 'Scan Receipt')).toBe(false);
  });

  it('removes a typed participant and updates the participant-dependent UI', async () => {
    const renderer = await renderScreen();

    await addTypedParticipant(renderer, 'Alex');
    expect(findByTestId(renderer, 'OptionListRow', 'bill-friends-picker-trigger').props.title).toBe('Alex');

    const pickerTrigger = findByTestId(renderer, 'OptionListRow', 'bill-friends-picker-trigger');
    await act(async () => {
      pickerTrigger.props.onPress();
    });

    const typedParticipantRow = findOptionRowByTitle(renderer, 'Alex');
    await act(async () => {
      typedParticipantRow.props.rightAccessory.props.onPress();
    });

    const participantPickerModal = renderer.root.findByType('Modal');
    await act(async () => {
      participantPickerModal.props.primaryAction.onPress();
    });

    expect(findByTestId(renderer, 'OptionListRow', 'bill-friends-picker-trigger').props.title).not.toBe('Alex');
  });

  it('shows custom bill item disclosure on the left and toggles row accessibility state', async () => {
    const renderer = await renderScreen();

    await goToCustomItemsStep(renderer);
    await addBillItem(renderer, 'Sparkling Water', '0.99');

    let itemRow = findBillItemRowByTitle(renderer, 'Sparkling Water');
    expect(itemRow.props.chevron).toBe(false);
    expect(itemRow.props.leading).toBeTruthy();
    expect(itemRow.props.accessibilityHint).toBe('Expands item split details');
    expect(itemRow.props.accessibilityState).toEqual({ expanded: false });

    await act(async () => {
      itemRow.props.onPress();
    });

    itemRow = findBillItemRowByTitle(renderer, 'Sparkling Water');
    expect(itemRow.props.accessibilityHint).toBe('Collapses item split details');
    expect(itemRow.props.accessibilityState).toEqual({ expanded: true });
  });

  it('keeps custom bill item delete separate from row expansion', async () => {
    const renderer = await renderScreen();

    await goToCustomItemsStep(renderer);
    await addBillItem(renderer, 'Sparkling Water', '0.99');

    const itemRowBeforeDelete = findBillItemRowByTitle(renderer, 'Sparkling Water');
    const removeButton = itemRowBeforeDelete.props.rightAccessory.props.children.find(
      (child: any) => child?.props?.testID === 'bill-item-remove-0',
    );
    expect(removeButton).toBeTruthy();

    await act(async () => {
      removeButton.props.onPress();
    });

    const itemRow = findBillItemRowByTitle(renderer, 'Sparkling Water');
    expect(itemRow.props.accessibilityState).toEqual({ expanded: false });

    const deleteModal = renderer.root.findAllByType('ConfirmDestructiveModal').find(
      (node: any) => node.props.title === 'Delete Bill Item?',
    );
    expect(deleteModal?.props.visible).toBe(true);
    expect(deleteModal?.props.description).toBe('Delete "Sparkling Water" from this bill?');
  });

  it('shows the remaining or over amount while editing manual owed amounts', async () => {
    const renderer = await renderScreen();

    await switchToManualSplitMode(renderer);

    let scaffold = renderer.root.findByType('FeatureFormScreenScaffold');
    await act(async () => {
      scaffold.props.primaryAction.onPress();
    });

    const billNameInput = findByTestId(renderer, 'Input', 'bill-name-input');
    await act(async () => {
      billNameInput.props.onChangeText('Manual Dinner');
    });

    await addTypedParticipant(renderer, 'Alex');

    const totalInput = findByTestId(renderer, 'Input', 'bill-total-bill-price-input');
    await act(async () => {
      totalInput.props.onChangeText('40.00');
    });

    scaffold = renderer.root.findByType('FeatureFormScreenScaffold');
    await act(async () => {
      scaffold.props.primaryAction.onPress();
    });

    const firstOwedInput = findByTestId(renderer, 'Input', 'bill-owed-amount-input-0');
    const secondOwedInput = findByTestId(renderer, 'Input', 'bill-owed-amount-input-1');
    await act(async () => {
      firstOwedInput.props.onChangeText('$1a0');
      secondOwedInput.props.onChangeText('15');
    });

    expect(findByTestId(renderer, 'Input', 'bill-owed-amount-input-0').props.value).toBe('10');
    expect(hasExactText(renderer, 'Remaining to assign')).toBe(true);
    expect(hasExactText(renderer, '$15.00 left to assign.')).toBe(true);

    await act(async () => {
      secondOwedInput.props.onChangeText('35');
    });

    expect(hasExactText(renderer, 'Over assigned')).toBe(true);
    expect(hasExactText(renderer, '$5.00 over the bill total.')).toBe(true);
  });
});
