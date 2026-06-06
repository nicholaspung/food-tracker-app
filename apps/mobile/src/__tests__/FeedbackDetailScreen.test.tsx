import React from 'react';
import { VirtualizedList } from 'react-native';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import { useFeedbackWrites, useQueuedFeatureWrites } from '../features';
import { FeedbackDetailScreen } from '../screens/FeedbackDetailScreen';

const mockReact = React;
const mockTheme = {
  colors: {
    background: {
      app: 'app-bg',
      surface: 'surface-bg',
    },
    border: {
      danger: 'danger-border',
      info: 'info-border',
      subtle: 'subtle-border',
    },
    fill: {
      brand: 'brand-fill',
    },
    text: {
      brand: 'brand-text',
      danger: 'danger-text',
      inverse: 'inverse-text',
      muted: 'muted-text',
      primary: 'primary-text',
      secondary: 'secondary-text',
    },
  },
  radii: {
    md: 12,
  },
  spacing: {
    md: 16,
    sm: 12,
    xs: 8,
    xxs: 4,
  },
} as const;

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}));

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('react-native-keyboard-controller', () => ({
  useKeyboardState: () => false,
}));

jest.mock('../components/shared', () => ({
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  FeedbackThreadCard: (props: Record<string, unknown>) => mockReact.createElement('FeedbackThreadCard', props),
  FeatureDetailScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureDetailScreenScaffold', props, children),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../features', () => ({
  feedbackQueryKeys: {
    root: ['feature', 'feedback'],
    list: ['feature', 'feedback', 'all', 'paginated'],
    thread: (feedbackId: string) => ['feature', 'feedback-thread', feedbackId],
    messages: (feedbackId: string) => ['feature', 'feedback-messages', feedbackId],
  },
  getFeedbackThreadDetail: jest.fn(),
  listFeedbackMessagesPage: jest.fn(),
  markFeedbackAsRead: jest.fn(),
  mergeFeedbackRecord: (currentFeedback: Record<string, unknown>, nextFeedback: Record<string, unknown>) => ({
    ...currentFeedback,
    ...nextFeedback,
  }),
  replaceFeedbackMessageFirstPage: jest.fn((_currentData, nextFirstPage) => ({
    pages: [nextFirstPage],
    pageParams: [nextFirstPage.page],
  })),
  upsertFeedbackListItem: jest.fn(),
  useFeedbackWrites: jest.fn(),
  useQueuedFeatureWrites: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: () => ({
    isOnline: false,
  }),
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
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<typeof useInfiniteQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseFeedbackWrites = useFeedbackWrites as jest.MockedFunction<typeof useFeedbackWrites>;
const mockedUseQueuedFeatureWrites = useQueuedFeatureWrites as jest.MockedFunction<typeof useQueuedFeatureWrites>;
let mockRefreshQueuedWrites: jest.Mock;
let mockSendFeedbackMessage: jest.Mock;

function buildThreadQueryResult() {
  return {
    data: {
      feedback: {
        adminUnreadCount: 0,
        createdAt: '2026-06-01T12:00:00.000Z',
        description: 'Original report',
        id: 'feedback_1',
        status: 'open',
        title: 'Feedback thread',
        updatedAt: '2026-06-01T12:00:00.000Z',
        userId: 'user_1',
        userUnreadCount: 0,
      },
      messages: {
        hasNextPage: false,
        items: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 1,
      },
    },
    isError: false,
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  } as never;
}

function buildMessagesQueryResult() {
  return {
    data: {
      pages: [
        {
          hasNextPage: false,
          items: [],
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 1,
        },
      ],
      pageParams: [1],
    },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading: false,
    isRefetching: false,
    isSuccess: true,
    refetch: jest.fn(),
  } as never;
}

function renderFeedbackDetailScreen(feedbackId = 'feedback_1') {
  return create(
    <FeedbackDetailScreen
      navigation={{
        canGoBack: () => true,
        goBack: jest.fn(),
        navigate: jest.fn(),
      } as never}
      route={{
        key: 'feedback-detail',
        name: 'FeedbackDetail',
        params: {
          feedbackId,
        },
      } as never}
    />,
  );
}

describe('FeedbackDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQuery.mockReturnValue(buildThreadQueryResult());
    mockedUseInfiniteQuery.mockReturnValue(buildMessagesQueryResult());
    mockedUseQueryClient.mockReturnValue({
      getQueryData: jest.fn(),
      setQueryData: jest.fn(),
    } as never);
    mockSendFeedbackMessage = jest.fn().mockResolvedValue({ status: 'completed' });
    mockedUseFeedbackWrites.mockReturnValue({
      sendFeedbackMessage: mockSendFeedbackMessage,
    } as never);
    mockRefreshQueuedWrites = jest.fn().mockResolvedValue(undefined);
    mockedUseQueuedFeatureWrites.mockReturnValue({
      queuedWrites: [
        {
          createdAt: Date.parse('2026-06-01T12:03:00.000Z'),
          id: 'queued_reply_1',
          idempotencyKey: 'idem_1',
          lastError: null,
          operationName: 'feedback.message.send',
          payload: {
            feedbackId: 'feedback_1',
            message: 'Queued offline reply',
          },
          status: 'pending',
        },
        {
          createdAt: Date.parse('2026-06-01T12:04:00.000Z'),
          id: 'queued_reply_2',
          idempotencyKey: 'idem_2',
          lastError: null,
          operationName: 'feedback.message.send',
          payload: {
            feedbackId: 'feedback_2',
            message: 'Other thread reply',
          },
          status: 'pending',
        },
      ],
      refreshQueuedWrites: mockRefreshQueuedWrites,
    } as never);
  });

  it('shows queued replies for the open thread without showing other thread replies', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderFeedbackDetailScreen();
    });

    expect(renderer.root.findAllByType('Text').some((text: any) => text.props.children === 'Queued offline reply')).toBe(
      true,
    );
    expect(renderer.root.findAllByType('Text').some((text: any) => text.props.children === 'Other thread reply')).toBe(
      false,
    );
    const statusPills = renderer.root.findAllByType('StatusPill');
    expect(statusPills).toHaveLength(1);
    expect(statusPills[0].props.label).toBe('Queued');
    expect(renderer.root.findAllByType('EmptyState')).toHaveLength(0);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('renders messages through a virtualized paged adapter', async () => {
    const baseMessagesQuery = buildMessagesQueryResult() as Record<string, unknown>;

    mockedUseQueuedFeatureWrites.mockReturnValue({
      queuedWrites: [],
      refreshQueuedWrites: mockRefreshQueuedWrites,
    } as never);
    mockedUseInfiniteQuery.mockReturnValue({
      ...baseMessagesQuery,
      data: {
        pages: [
          {
            hasNextPage: true,
            items: [
              {
                createdAt: '2026-06-01T12:02:00.000Z',
                feedbackId: 'feedback_1',
                id: 'message_new',
                isAdminMessage: false,
                message: 'Newest reply',
                userId: 'user_1',
              },
            ],
            page: 1,
            pageSize: 20,
            totalItems: 2,
            totalPages: 2,
          },
          {
            hasNextPage: false,
            items: [
              {
                createdAt: '2026-06-01T12:01:00.000Z',
                feedbackId: 'feedback_1',
                id: 'message_old',
                isAdminMessage: true,
                message: 'Older admin reply',
                userId: 'admin_1',
                userName: 'Support',
              },
            ],
            page: 2,
            pageSize: 20,
            totalItems: 2,
            totalPages: 2,
          },
        ],
        pageParams: [1, 2],
      },
      hasNextPage: true,
    } as never);
    let renderer: any = null;

    await act(async () => {
      renderer = renderFeedbackDetailScreen();
    });

    const messageList = renderer.root.findByType(VirtualizedList);
    expect(messageList.props.inverted).toBe(true);
    expect(messageList.props.maintainVisibleContentPosition).toEqual({
      autoscrollToTopThreshold: 80,
      minIndexForVisible: 0,
    });
    expect(messageList.props.getItemCount(messageList.props.data)).toBe(2);
    expect(messageList.props.getItem(messageList.props.data, 0)).toEqual({
      kind: 'message',
      message: expect.objectContaining({ id: 'message_new' }),
    });
    expect(messageList.props.getItem(messageList.props.data, 1)).toEqual({
      kind: 'message',
      message: expect.objectContaining({ id: 'message_old' }),
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('does not invert the empty thread state', async () => {
    mockedUseQueuedFeatureWrites.mockReturnValue({
      queuedWrites: [],
      refreshQueuedWrites: mockRefreshQueuedWrites,
    } as never);
    let renderer: any = null;

    await act(async () => {
      renderer = renderFeedbackDetailScreen();
    });

    const messageList = renderer.root.findByType(VirtualizedList);
    expect(messageList.props.inverted).toBe(false);
    expect(renderer.root.findByType('EmptyState').props.title).toBe('No messages yet');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('refreshes queued replies immediately when an offline send is queued', async () => {
    mockSendFeedbackMessage.mockResolvedValue({ status: 'queued' });
    mockedUseQueuedFeatureWrites.mockReturnValue({
      queuedWrites: [],
      refreshQueuedWrites: mockRefreshQueuedWrites,
    } as never);
    let renderer: any = null;

    await act(async () => {
      renderer = renderFeedbackDetailScreen();
    });

    await act(async () => {
      renderer.root.findByType('Input').props.onChangeText('New offline reply');
    });

    await act(async () => {
      renderer.root.findByType('Button').props.onPress();
      await Promise.resolve();
    });

    expect(mockSendFeedbackMessage).toHaveBeenCalledWith({
      feedbackId: 'feedback_1',
      message: 'New offline reply',
    });
    expect(mockRefreshQueuedWrites).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.unmount();
    });
  });
});
