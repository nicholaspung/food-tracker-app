import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getBillById } from '../features';
import { sendBillPaymentReminder } from '../features/store/billsStore';
import { useBillWrites } from '../features/store/useBillWrites';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { BillDetailScreen } from '../screens/BillDetailScreen';

const mockReact = React;

const mockTheme = {
  colors: {
    background: { muted: 'muted-background', surface: 'surface-background' },
    border: {
      subtle: 'subtle-border',
      success: 'success-border',
    },
    button: {
      primaryBg: 'primary-button-background',
      primaryDisabledBg: 'primary-button-disabled',
      primaryPressed: 'primary-button-pressed',
      primaryText: 'primary-button-text',
      secondaryBg: 'secondary-button-background',
      secondaryBorder: 'secondary-button-border',
      secondaryDisabledBg: 'secondary-button-disabled',
      secondaryPressed: 'secondary-button-pressed',
      secondaryText: 'secondary-button-text',
    },
    fill: { danger: 'danger-fill' },
    status: {
      successBg: 'success-background',
    },
    text: {
      danger: 'danger-text',
      info: 'info-text',
      muted: 'muted-text',
      primary: 'primary-text',
      secondary: 'secondary-text',
      success: 'success-text',
      warning: 'warning-text',
    },
  },
  radii: { md: 12, pill: 999 },
  sizes: { buttonHeight: 48, secondaryButtonHeight: 40 },
  spacing: { xs: 8, sm: 12, md: 16 },
} as const;

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('@react-navigation/native', () => ({
  CommonActions: {
    reset: (payload: unknown) => ({ payload, type: 'RESET' }),
  },
}));

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    ActivityIndicator: (props: Record<string, unknown>) => React.createElement('ActivityIndicator', props),
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
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('../components/shared', () => ({
  ConfirmDestructiveModal: (props: Record<string, unknown>) =>
    mockReact.createElement('ConfirmDestructiveModal', props),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  FeatureDetailScreenScaffold: ({
    children,
    rightAccessory,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode; rightAccessory?: React.ReactNode }) =>
    mockReact.createElement('FeatureDetailScreenScaffold', props, rightAccessory, children),
  OptionList: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionList', props, children),
  OptionListRow: ({ rightAccessory, titleAccessory, ...props }: Record<string, unknown>) =>
    mockReact.createElement('OptionListRow', props, titleAccessory as React.ReactNode, rightAccessory as React.ReactNode),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
}));

jest.mock('../features', () => ({
  getBillById: jest.fn(),
}));

jest.mock('../features/store/billsQuery', () => ({
  billsQueryKeys: {
    detail: (billId: string) => ['feature', 'bills', 'detail', billId],
    root: ['feature', 'bills'],
  },
  getCachedBillDetail: jest.fn(() => undefined),
}));

jest.mock('../features/store/billsStore', () => ({
  sendBillPaymentReminder: jest.fn(),
}));

jest.mock('../features/store/useBillWrites', () => ({
  useBillWrites: jest.fn(),
}));

jest.mock('../hooks/usePullToRefreshState', () => ({
  usePullToRefreshState: () => ({
    isPullRefreshing: false,
    runPullRefresh: (callback: () => Promise<void>) => callback(),
  }),
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
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedSendBillPaymentReminder = sendBillPaymentReminder as jest.MockedFunction<typeof sendBillPaymentReminder>;
const mockedUseBillWrites = useBillWrites as jest.MockedFunction<typeof useBillWrites>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;

type TestRenderer = ReturnType<typeof create> & { root: any };

function buildBill(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: '2026-05-19T12:00:00.000Z',
    createdByUserId: 'user_1',
    extrasSplitMode: 'equal',
    fees: 0,
    id: 'bill_1',
    items: [],
    participants: [
      { amountOwed: 10, id: 'self', name: 'Pat', paidStatus: 'paid', userId: 'user_1' },
      { amountOwed: 10, id: 'eligible', name: 'Alex', paidStatus: 'pending', userId: 'user_2' },
      { amountOwed: 8, id: 'custom', name: 'Cash Friend', paidStatus: 'pending' },
      { amountOwed: 6, id: 'paid', name: 'Jordan', paidStatus: 'paid', userId: 'user_3' },
    ],
    restaurantName: 'Dinner',
    splitMode: 'even',
    status: 'open',
    tax: 0,
    tip: 0,
    title: 'Dinner',
    totalAmount: 34,
    updatedAt: '2026-05-19T12:00:00.000Z',
    ...overrides,
  };
}

async function renderBillDetail(bill = buildBill()): Promise<TestRenderer> {
  mockedUseQuery.mockReturnValue({
    data: bill,
    isError: false,
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useQuery>);

  const rendererRef: { current?: TestRenderer } = {};
  await act(async () => {
    rendererRef.current = create(
      <BillDetailScreen
        navigation={
          {
            canGoBack: () => true,
            dispatch: jest.fn(),
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as any
        }
        route={{ key: 'BillDetail-key', name: 'BillDetail', params: { billId: 'bill_1' } }}
      />,
    ) as TestRenderer;
  });

  return rendererRef.current as TestRenderer;
}

function findPressableByTestId(renderer: TestRenderer, testID: string) {
  return renderer.root.findAllByType('Pressable').find((node: any) => node.props.testID === testID);
}

describe('BillDetailScreen payment reminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getBillById as jest.Mock).mockResolvedValue(buildBill());
    mockedUseQueryClient.mockReturnValue({} as ReturnType<typeof useQueryClient>);
    mockedUseAuth.mockReturnValue({ user: { id: 'user_1' } } as ReturnType<typeof useAuth>);
    mockedUseConnectivity.mockReturnValue({ isOnline: true } as ReturnType<typeof useConnectivity>);
    mockedUseBillWrites.mockReturnValue({
      deleteBill: jest.fn(),
      updateBillStatus: jest.fn(),
      updateParticipantPaidStatus: jest.fn(),
    } as unknown as ReturnType<typeof useBillWrites>);
    mockedSendBillPaymentReminder.mockResolvedValue({ status: 'sent' });
  });

  it('shows reminder only for pending mapped app-user participants when viewer is creator', async () => {
    const renderer = await renderBillDetail();

    expect(findPressableByTestId(renderer, 'bill-participant-reminder-eligible')).toBeTruthy();
    expect(findPressableByTestId(renderer, 'bill-participant-reminder-custom')).toBeUndefined();
    expect(findPressableByTestId(renderer, 'bill-participant-reminder-paid')).toBeUndefined();
  });

  it('hides reminder actions when viewer is not the creator', async () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'user_2' } } as ReturnType<typeof useAuth>);

    const renderer = await renderBillDetail();

    expect(findPressableByTestId(renderer, 'bill-participant-reminder-eligible')).toBeUndefined();
  });

  it('submits reminder action and disables it while in flight', async () => {
    let resolveReminder: (value: { status: 'sent' }) => void = () => undefined;
    mockedSendBillPaymentReminder.mockReturnValue(
      new Promise((resolve) => {
        resolveReminder = resolve;
      }),
    );
    const renderer = await renderBillDetail();
    const reminderButton = findPressableByTestId(renderer, 'bill-participant-reminder-eligible');

    await act(async () => {
      reminderButton?.props.onPress();
    });

    expect(mockedSendBillPaymentReminder).toHaveBeenCalledWith('bill_1', 'eligible');
    expect(findPressableByTestId(renderer, 'bill-participant-reminder-eligible')?.props.disabled).toBe(true);

    await act(async () => {
      resolveReminder({ status: 'sent' });
    });
  });

  it('surfaces weekly rate limit errors through the page error toast', async () => {
    mockedSendBillPaymentReminder.mockRejectedValue(new Error('payment reminder already sent this week'));
    const renderer = await renderBillDetail();

    await act(async () => {
      findPressableByTestId(renderer, 'bill-participant-reminder-eligible')?.props.onPress();
    });

    const toast = renderer.root.findByType('PageErrorToast');
    expect(toast.props.errorMessage).toBe('A reminder was already sent to this person this week.');
  });
});
