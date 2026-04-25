import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createBill,
  createEntityId,
  getBillById,
  updateBill,
} from '../features';
import {
  createBillApiMutationInput,
  updateBillApiMutationInput,
} from '../features/store/featureOutboxOperations';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
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
  ConfirmDestructiveModal: () => null,
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
}));

jest.mock('../features', () => ({
  createBill: jest.fn(),
  createEntityId: jest.fn(),
  friendsQueryKeys: {
    paginated: (section: string, search?: string) =>
      search?.trim()
        ? ['feature', 'friends', 'paginated', section, search.trim()]
        : ['feature', 'friends', 'paginated', section],
  },
  getBillById: jest.fn(),
  hydrateFriendsSummaryFromPaginatedData: jest.fn(),
  listFriendsPage: jest.fn(),
  updateBill: jest.fn(),
}));

jest.mock('../features/store/featureOutboxOperations', () => ({
  createBillApiMutationInput: jest.fn((payload: unknown) => ({ body: payload })),
  updateBillApiMutationInput: jest.fn((billId: string, updates: unknown) => ({
    billId,
    body: updates,
  })),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
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
const mockedCreateBillApiMutationInput =
  createBillApiMutationInput as jest.MockedFunction<typeof createBillApiMutationInput>;
const mockedUpdateBillApiMutationInput =
  updateBillApiMutationInput as jest.MockedFunction<typeof updateBillApiMutationInput>;
const mockedUseOfflineAwareFeatureWrite =
  useOfflineAwareFeatureWrite as jest.MockedFunction<typeof useOfflineAwareFeatureWrite>;
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
    mockedUseInfiniteQuery.mockImplementation(() => buildInfiniteQueryResult(friendsItems));

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
    mockedCreateBillApiMutationInput.mockClear();
    mockedUpdateBillApiMutationInput.mockClear();
    mockedTrackObservabilityEvent.mockReset();

    mockedUseOfflineAwareFeatureWrite.mockReset();
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      (async ({ execute }: { execute: () => Promise<unknown> }) => ({
        result: await execute(),
        status: 'completed' as const,
      })) as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );

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
    const pickerTrigger = findByTestId(renderer, 'OptionListRow', 'bill-friends-picker-trigger');

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

  it('accepts a typed participant with zero selected friends', async () => {
    const renderer = await renderScreen();

    await addTypedParticipant(renderer, 'Alex');

    expect(hasExactText(renderer, 'Alex')).toBe(true);
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

  it('removes a typed participant and updates the participant-dependent UI', async () => {
    const renderer = await renderScreen();

    await addTypedParticipant(renderer, 'Alex');
    expect(hasExactText(renderer, 'Alex')).toBe(true);

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

    expect(hasExactText(renderer, 'Alex')).toBe(false);
  });
});
