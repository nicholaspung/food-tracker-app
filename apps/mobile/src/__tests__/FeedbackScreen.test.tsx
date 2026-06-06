import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery } from '@tanstack/react-query';

import { FeedbackScreen } from '../screens/FeedbackScreen';

const mockReact = React;

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const react = jest.requireActual<typeof import('react')>('react');
  const renderListSlot = (slot: unknown) => {
    if (!slot) {
      return null;
    }

    return react.isValidElement(slot) ? slot : react.createElement(slot as any);
  };
  const MockFlatList = ({
    data,
    ItemSeparatorComponent,
    ListEmptyComponent,
    ListFooterComponent,
    ListHeaderComponent,
    renderItem,
    ...props
  }: Record<string, unknown>) =>
    react.createElement(
      'FlatList',
      { ...props, data, renderItem },
      renderListSlot(ListHeaderComponent),
      Array.isArray(data) && data.length > 0 && typeof renderItem === 'function'
        ? data.map((item, index) =>
            react.createElement(
              react.Fragment,
              { key: item && typeof item === 'object' && 'id' in item ? String(item.id) : index },
              index > 0 ? renderListSlot(ItemSeparatorComponent) : null,
              (renderItem as any)({ item, index }),
            ),
          )
        : renderListSlot(ListEmptyComponent),
      renderListSlot(ListFooterComponent),
    );

  return Object.defineProperties({}, {
    ...Object.getOwnPropertyDescriptors(actual),
    FlatList: {
      configurable: true,
      enumerable: true,
      value: MockFlatList,
      writable: true,
    },
  });
});

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
}));

jest.mock('../components/shared', () => ({
  BackHeaderScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('BackHeaderScreenScaffold', props, children),
  FeedbackThreadCard: (props: Record<string, unknown>) => mockReact.createElement('FeedbackThreadCard', props),
  HeaderAccessoryButton: (props: Record<string, unknown>) => mockReact.createElement('HeaderAccessoryButton', props),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  PendingQueuedWriteRow: (props: Record<string, unknown>) => mockReact.createElement('PendingQueuedWriteRow', props),
  QueryListStateView: ({
    children,
    hasBlockingError,
    hasRefreshError,
    isLoading,
    refreshErrorMessage,
    showEmpty,
    title,
  }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement(
      'QueryListStateView',
      {
        hasBlockingError,
        hasRefreshError,
        isLoading,
        showEmpty,
      },
      hasRefreshError
        ? mockReact.createElement('PageErrorToast', {
            errorMessage: refreshErrorMessage,
            title,
          })
        : null,
      hasBlockingError ? mockReact.createElement('ErrorState', { title }) : null,
      !isLoading && !hasBlockingError && !showEmpty ? children : null,
    ),
}));

jest.mock('../features', () => ({
  feedbackQueryKeys: {
    list: ['feature', 'feedback', 'all', 'paginated'],
  },
  listFeedbackPage: jest.fn(),
}));

jest.mock('../features/store/useQueuedFeatureWrites', () => ({
  useQueuedFeatureWrites: () => ({
    queuedWrites: [],
    refreshQueuedWrites: jest.fn(),
  }),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(
        {
          colors: {
            text: {
              muted: 'muted-text',
            },
          },
          radii: {
            lg: 16,
          },
          spacing: {
            md: 16,
            sm: 12,
          },
        },
        ...args,
      ),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<typeof useInfiniteQuery>;

function buildFeedback(overrides: Record<string, unknown> = {}) {
  return {
    adminUnreadCount: 0,
    createdAt: '2026-06-01T12:00:00.000Z',
    description: 'Cached thread description',
    id: 'feedback-1',
    status: 'open',
    title: 'Cached feedback',
    updatedAt: '2026-06-01T12:00:00.000Z',
    userId: 'user-1',
    userUnreadCount: 2,
    ...overrides,
  };
}

function buildQueryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading: false,
    isRefetching: false,
    isSuccess: true,
    refetch: jest.fn(),
    ...overrides,
  } as never;
}

function renderFeedbackScreen() {
  return create(
    <FeedbackScreen
      navigation={{
        navigate: jest.fn(),
      } as never}
      route={{
        key: 'feedback',
        name: 'Feedback',
      } as never}
    />,
  );
}

function collectTextContent(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(collectTextContent).join('');
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return collectTextContent(node.props.children);
  }

  return '';
}

describe('FeedbackScreen', () => {
  beforeEach(() => {
    mockedUseInfiniteQuery.mockReset();
  });

  it('keeps cached feedback threads and summary visible during refresh errors', async () => {
    mockedUseInfiniteQuery.mockReturnValue(buildQueryResult({
      data: {
        pageParams: [1],
        pages: [
          {
            hasNextPage: false,
            items: [buildFeedback()],
            page: 1,
            pageSize: 20,
            totalItems: 3,
            totalPages: 1,
          },
        ],
      },
      isError: true,
      isSuccess: false,
    }));

    let renderer: any = null;
    await act(async () => {
      renderer = renderFeedbackScreen();
    });

    expect(renderer?.root.findAllByType('FeedbackThreadCard')).toHaveLength(1);
    expect(renderer?.root.findByType('FeedbackThreadCard').props.title).toBe('Cached feedback');
    expect(renderer?.root.findAllByType('ErrorState')).toHaveLength(0);
    expect(
      renderer?.root.findAllByType('PageErrorToast').some(
        (toast: any) => toast.props.errorMessage === 'Could not refresh feedback history. Showing saved data.',
      ),
    ).toBe(true);
    expect(
      renderer?.root.findAllByType('Text').some(
        (text: any) => collectTextContent(text.props.children) === '3 feedback threads total',
      ),
    ).toBe(true);
  });

  it('uses a blocking error state when feedback history has no cached data', async () => {
    mockedUseInfiniteQuery.mockReturnValue(buildQueryResult({
      data: undefined,
      isError: true,
      isSuccess: false,
    }));

    let renderer: any = null;
    await act(async () => {
      renderer = renderFeedbackScreen();
    });

    expect(renderer?.root.findAllByType('FeedbackThreadCard')).toHaveLength(0);
    expect(renderer?.root.findByType('ErrorState').props.title).toBe('Feedback unavailable');
  });
});
