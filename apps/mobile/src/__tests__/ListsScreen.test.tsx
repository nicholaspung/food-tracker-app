import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { ListsScreen } from '../screens/ListsScreen';

const mockReact = React;
let mockQueuedWrites: Record<string, unknown>[] = [];

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('../components/shared', () => ({
  BackHeaderScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('BackHeaderScreenScaffold', props, children),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  FeatureListFooter: (props: Record<string, unknown>) => mockReact.createElement('FeatureListFooter', props),
  HeaderAccessoryButton: (props: Record<string, unknown>) => mockReact.createElement('HeaderAccessoryButton', props),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  PendingQueuedWriteRow: (props: Record<string, unknown>) => mockReact.createElement('PendingQueuedWriteRow', props),
  SegmentedControl: (props: Record<string, unknown>) => mockReact.createElement('SegmentedControl', props),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
}));

jest.mock('../features', () => ({
  createDefaultRestaurantList: jest.fn(),
  invalidateRestaurantListCollectionQueries: jest.fn(),
  listRestaurantListsPage: jest.fn(),
  restaurantListQueryKeys: {
    paginated: jest.fn((scope: string, search: string) => ['feature', 'restaurantLists', scope, 'paginated', search]),
  },
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../features/store/useQueuedFeatureWrites', () => ({
  useQueuedFeatureWrites: () => ({
    queuedWrites: mockQueuedWrites,
    refreshQueuedWrites: jest.fn(),
  }),
}));

jest.mock('../hooks/useDebouncedValue', () => ({
  useDebouncedValue: (value: unknown) => value,
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
      factory(
        {
          colors: {
            background: {
              app: 'app-background',
              muted: 'muted-background',
              surface: 'surface-background',
            },
            border: {
              default: 'default-border',
              subtle: 'subtle-border',
            },
            status: {
              warningBg: 'warning-background',
              warningBorder: 'warning-border',
            },
            text: {
              info: 'info-text',
              muted: 'muted-text',
              secondary: 'secondary-text',
              warning: 'warning-text',
            },
          },
          radii: {
            md: 12,
            pill: 999,
          },
          sizes: {
            secondaryButtonHeight: 44,
          },
          spacing: {
            lg: 20,
            md: 16,
            sm: 12,
            xs: 8,
            xxs: 4,
            xl: 24,
          },
        },
        ...args,
      ),
  useTheme: () => ({
    colors: {
      background: {
        app: 'app-background',
        muted: 'muted-background',
        surface: 'surface-background',
      },
      border: {
        default: 'default-border',
        subtle: 'subtle-border',
      },
      status: {
        warningBg: 'warning-background',
        warningBorder: 'warning-border',
      },
      text: {
        info: 'info-text',
        muted: 'muted-text',
        secondary: 'secondary-text',
        warning: 'warning-text',
      },
    },
    radii: {
      md: 12,
      pill: 999,
    },
    sizes: {
      secondaryButtonHeight: 44,
    },
    spacing: {
      lg: 20,
      md: 16,
      sm: 12,
      xs: 8,
      xxs: 4,
      xl: 24,
    },
  }),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  ListItem: (props: Record<string, unknown>) => mockReact.createElement('ListItem', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<typeof useInfiniteQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseOfflineAwareFeatureWrite = useOfflineAwareFeatureWrite as jest.MockedFunction<
  typeof useOfflineAwareFeatureWrite
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;

function buildQueryResult(overrides: Record<string, unknown> = {}, items: Record<string, unknown>[] = []) {
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
          totalPages: items.length > 0 ? 1 : 0,
        },
      ],
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
    ...overrides,
  } as never;
}

function buildList(overrides: Record<string, unknown> = {}) {
  return {
    coverImage: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    description: 'Best places',
    id: 'list-1',
    isDefault: false,
    menuItemCount: 3,
    name: 'Favorites',
    ownerName: 'Nick',
    restaurantCount: 2,
    updatedAt: '2026-04-02T00:00:00.000Z',
    visibility: 'friends',
    ...overrides,
  };
}

function renderListsScreen() {
  return create(
    <ListsScreen
      navigation={{
        navigate: jest.fn(),
      } as never}
      route={{
        key: 'lists',
        name: 'Lists',
      } as never}
    />,
  );
}

describe('ListsScreen', () => {
  beforeEach(() => {
    mockQueuedWrites = [];
    mockedUseInfiniteQuery.mockReset();
    mockedUseInfiniteQuery.mockImplementation((options) =>
      options.enabled === false ? buildQueryResult({ isSuccess: false }) : buildQueryResult(),
    );
    mockedUseQueryClient.mockReset();
    mockedUseQueryClient.mockReturnValue({
      invalidateQueries: jest.fn(),
    } as never);
    mockedUseOfflineAwareFeatureWrite.mockReset();
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(jest.fn() as never);
    mockedUseAuth.mockReset();
    mockedUseAuth.mockReturnValue({
      user: null,
    } as never);
    mockedUseConnectivity.mockReset();
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as never);
  });

  it('uses scaffold-level refresh and renders list content without a local FlatList', async () => {
    mockedUseInfiniteQuery.mockImplementation((options) =>
      options.enabled === false
        ? buildQueryResult({ hasNextPage: false, isSuccess: false })
        : buildQueryResult({ hasNextPage: true }, [buildList()]),
    );

    let renderer: any = null;
    await act(async () => {
      renderer = renderListsScreen();
    });

    const scaffold = renderer.root.findByType('BackHeaderScreenScaffold');

    expect(typeof scaffold.props.onRefresh).toBe('function');
    expect(scaffold.props.refreshing).toBe(false);
    expect(renderer.root.findAllByType('FlatList')).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'lists-search-input' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'lists-list-card-my-0' })).toBeTruthy();
    expect(renderer.root.findByType('FeatureListFooter').props.label).toBe('Load more lists');
  });

  it('renders the empty state when there are no lists', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderListsScreen();
    });

    expect(renderer.root.findByType('EmptyState').props.title).toBe('No lists yet');
  });

  it('renders a blocking error state when the active list query has no cached data', async () => {
    mockedUseInfiniteQuery.mockImplementation((options) =>
      options.enabled === false
        ? buildQueryResult({ isSuccess: false })
        : buildQueryResult({ data: undefined, isError: true, isSuccess: false }),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = renderListsScreen();
    });

    expect(renderer.root.findByType('ErrorState').props.title).toBe('Lists unavailable');
  });

  it('switches to friends lists and clears search', async () => {
    mockedUseInfiniteQuery.mockImplementation((options) => {
      const queryKey = options.queryKey as unknown[];
      const scope = queryKey[2];
      const search = queryKey[4];

      if (scope === 'friends') {
        return buildQueryResult({ isSuccess: options.enabled !== false }, [
          buildList({ id: `friend-${search || 'all'}`, name: 'Friends picks' }),
        ]);
      }

      return buildQueryResult({ isSuccess: options.enabled !== false }, [
        buildList({ id: `my-${search || 'all'}`, name: 'My picks' }),
      ]);
    });

    let renderer: any = null;
    await act(async () => {
      renderer = renderListsScreen();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'lists-search-input' }).props.onChangeText('ramen');
    });

    await act(async () => {
      renderer.root.findByType('SegmentedControl').props.onChange('friends');
    });

    expect(renderer.root.findByProps({ testID: 'lists-search-input' }).props.value).toBe('');
    expect(renderer.root.findByProps({ testID: 'lists-list-card-friends-0' }).props.title).toBe('Friends picks');
  });

  it('passes debounced search into the active browse query and clears from the no-results state', async () => {
    mockedUseInfiniteQuery.mockImplementation((options) => buildQueryResult({ isSuccess: options.enabled !== false }));

    let renderer: any = null;
    await act(async () => {
      renderer = renderListsScreen();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'lists-search-input' }).props.onChangeText('tacos');
    });

    expect(mockedUseInfiniteQuery).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      queryKey: ['feature', 'restaurantLists', 'my', 'paginated', 'tacos'],
    }));

    await act(async () => {
      renderer.root.findByType('EmptyState').props.onAction();
    });

    expect(renderer.root.findByProps({ testID: 'lists-search-input' }).props.value).toBe('');
  });

  it('surfaces default Saved list auto-create failures', async () => {
    const createDefaultList = jest.fn().mockRejectedValue(new Error('Could not create Saved'));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(createDefaultList as never);
    mockedUseAuth.mockReturnValue({
      user: { id: 'user-1' },
    } as never);

    let renderer: any = null;
    await act(async () => {
      renderer = renderListsScreen();
      await Promise.resolve();
    });

    const toastMessages = renderer.root.findAllByType('PageErrorToast').map((toast: any) => toast.props.errorMessage);
    expect(createDefaultList).toHaveBeenCalledWith(expect.objectContaining({
      operationName: 'list.default.create',
    }));
    expect(toastMessages).toContain('Could not create Saved');
  });

  it('renders pending list rows only on My Lists', async () => {
    mockQueuedWrites = [
      {
        id: 'queued-list-1',
        createdAt: 123,
        idempotencyKey: 'idem-1',
        lastError: null,
        payload: {
          name: 'Dinner ideas',
          visibility: 'friends',
        },
        status: 'pending',
      },
    ];

    let renderer: any = null;
    await act(async () => {
      renderer = renderListsScreen();
    });

    expect(renderer.root.findByType('PendingQueuedWriteRow').props.title).toBe('Dinner ideas');

    await act(async () => {
      renderer.root.findByType('SegmentedControl').props.onChange('friends');
    });

    expect(renderer.root.findAllByType('PendingQueuedWriteRow')).toHaveLength(0);
  });

  it('preserves friends and search empty states', async () => {
    let renderer: any = null;
    await act(async () => {
      renderer = renderListsScreen();
    });

    await act(async () => {
      renderer.root.findByType('SegmentedControl').props.onChange('friends');
    });

    expect(renderer.root.findByType('EmptyState').props.title).toBe("No friends' lists");

    await act(async () => {
      renderer.root.findByProps({ testID: 'lists-search-input' }).props.onChangeText('pizza');
    });

    expect(renderer.root.findByType('EmptyState').props.title).toBe('No matching lists');
  });

  it('keeps cached list rows visible during refresh errors', async () => {
    mockedUseInfiniteQuery.mockImplementation((options) =>
      options.enabled === false
        ? buildQueryResult({ isSuccess: false })
        : buildQueryResult({ isError: true, isSuccess: false }, [buildList()]),
    );

    let renderer: any = null;
    await act(async () => {
      renderer = renderListsScreen();
    });

    const toastMessages = renderer.root.findAllByType('PageErrorToast').map((toast: any) => toast.props.errorMessage);
    expect(renderer.root.findByProps({ testID: 'lists-list-card-my-0' })).toBeTruthy();
    expect(renderer.root.findAllByType('ErrorState')).toHaveLength(0);
    expect(toastMessages).toContain('Could not refresh lists. Showing saved data.');
  });
});
