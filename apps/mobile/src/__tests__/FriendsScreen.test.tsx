import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import {
  evictFriendshipDependentQueries,
  removeFriend,
  subscribeToFriendshipChanges,
  useFriendWrites,
} from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { LayoutChromeProvider } from '../providers/LayoutChromeProvider';
import { FriendsScreen } from '../screens/FriendsScreen';

const mockReact = React;

jest.mock('react-native', () => {
  const renderListElement = (element: unknown, props: Record<string, unknown> = {}) => {
    if (!element) {
      return null;
    }

    if (mockReact.isValidElement(element)) {
      return element;
    }

    if (typeof element === 'function') {
      return element(props);
    }

    return null;
  };

  return {
    Alert: {
      alert: jest.fn(),
    },
    FlatList: ({
      ListEmptyComponent,
      ListFooterComponent,
      ListHeaderComponent,
      data = [],
      renderItem,
      ...props
    }: Record<string, unknown>) =>
      mockReact.createElement(
        'FlatList',
        { ...props, ListEmptyComponent, ListFooterComponent, ListHeaderComponent, data, renderItem },
        renderListElement(ListHeaderComponent),
        Array.isArray(data) && data.length > 0 && typeof renderItem === 'function'
          ? data.map((item, index) =>
              mockReact.createElement(
                mockReact.Fragment,
                { key: `flat-item-${index}` },
                renderItem({ index, item }),
              ),
            )
          : renderListElement(ListEmptyComponent),
        renderListElement(ListFooterComponent),
      ),
    Platform: {
      select: (values: Record<string, unknown>) => values.default,
    },
    Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('Pressable', props, children),
    StyleSheet: {
      flatten: (style: unknown) => {
        if (!style || typeof style !== 'object') {
          return {};
        }

        if (Array.isArray(style)) {
          return style.reduce<Record<string, unknown>>(
            (accumulator, entry) => ({ ...accumulator, ...entry }),
            {},
          );
        }

        return style;
      },
    },
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('View', props, children),
  };
});

const TEST_THEME = {
  colors: {
    background: {
      app: 'app-background',
      surface: 'surface-background',
    },
    border: {
      danger: 'danger-border',
      info: 'info-border',
      subtle: 'subtle-border',
      success: 'success-border',
    },
    status: {
      dangerBg: 'danger-bg',
      infoBg: 'info-bg',
      successBg: 'success-bg',
    },
    text: {
      danger: 'danger-text',
      info: 'info-text',
      primary: 'primary-text',
      secondary: 'secondary-text',
      success: 'success-text',
      warning: 'warning-text',
    },
  },
  radii: {
    md: 16,
    pill: 999,
  },
  spacing: {
    md: 16,
    sm: 12,
    xs: 8,
    xxs: 4,
  },
} as const;

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('react-native-qrcode-svg', () => (
  props: Record<string, unknown>,
) => mockReact.createElement('QRCode', props));

jest.mock('../components/friends', () => ({
  FriendListItemCard: ({ rightContent, ...props }: Record<string, unknown>) =>
    mockReact.createElement(
      'FriendListItemCard',
      props,
      mockReact.isValidElement(rightContent) ? rightContent : null,
    ),
}));

jest.mock('../components/shared', () => ({
  ConfirmDestructiveModal: (props: Record<string, unknown>) => mockReact.createElement('ConfirmDestructiveModal', props),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  HeaderAccessoryButton: (props: Record<string, unknown>) => mockReact.createElement('HeaderAccessoryButton', props),
  ScreenContentSection: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('ScreenContentSection', props, children),
  SegmentedControl: (props: Record<string, unknown>) => mockReact.createElement('SegmentedControl', props),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
  TabBrandHeader: (props: Record<string, unknown>) => mockReact.createElement('TabBrandHeader', props),
  TabRootScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('TabRootScreenScaffold', props, children),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../features', () => {
  const friendCodeUtils = jest.requireActual('../features/store/friendCodeUtils');

  return {
    ...friendCodeUtils,
    acceptCachedFriendRequest: jest.fn(),
    evictFriendshipDependentQueries: jest.fn(),
    friendsQueryKeys: {
      paginated: jest.fn((userId?: string | null, section = 'friends') => [
        'feature',
        'friends',
        'user',
        userId ?? 'anonymous',
        'paginated',
        section,
      ]),
      root: ['feature', 'friends'],
    },
    hydrateFriendsSummaryFromPaginatedData: jest.fn(),
    listFriendsPage: jest.fn(),
    markFriendInviteAccepted: jest.fn(),
    removeCachedFriend: jest.fn(),
    removeFriend: jest.fn(),
    selectFriendsSummary: jest.fn(() => ({
      friendsCount: 0,
      requestsCount: 0,
      sentCount: 0,
    })),
    subscribeToFriendshipChanges: jest.fn(() => jest.fn()),
    useFriendWrites: jest.fn(),
  };
});

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
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
    <Args extends unknown[], Styles>(
      factory: (theme: typeof TEST_THEME, ...args: Args) => Styles,
    ) =>
    (...args: Args) =>
      factory(TEST_THEME, ...args),
  useTheme: () => TEST_THEME,
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
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
const mockedEvictFriendshipDependentQueries =
  evictFriendshipDependentQueries as jest.MockedFunction<typeof evictFriendshipDependentQueries>;
const mockedRemoveFriend = removeFriend as jest.MockedFunction<typeof removeFriend>;
const mockedSubscribeToFriendshipChanges = subscribeToFriendshipChanges as jest.MockedFunction<
  typeof subscribeToFriendshipChanges
>;
const mockedUseFriendWrites = useFriendWrites as jest.MockedFunction<typeof useFriendWrites>;

function flattenStyle(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style) as Record<string, unknown>;
}

function renderFriendsScreen(
  routeParams?: RootStackParamList['Friends'],
) {
  return create(
    <LayoutChromeProvider topInsetConsumedByOverlay topOverlayHeight={72}>
      <FriendsScreen
        navigation={{
          navigate: jest.fn(),
          setParams: jest.fn(),
        } as never}
        route={{
          key: 'friends',
          name: 'Friends',
          params: routeParams,
        } as never}
      />
    </LayoutChromeProvider>,
  );
}

describe('FriendsScreen', () => {
  let queryClient: {
    invalidateQueries: jest.Mock;
  };

  beforeEach(() => {
    mockedUseInfiniteQuery.mockReset();
    mockedUseInfiniteQuery.mockReturnValue({
      data: {
        pageParams: [1],
        pages: [
          {
            hasNextPage: false,
            items: [],
            page: 1,
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
    } as never);
    mockedUseQueryClient.mockReset();
    queryClient = {
      invalidateQueries: jest.fn(),
    };
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedUseOfflineAwareFeatureWrite.mockReset();
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(jest.fn() as never);
    mockedUseAuth.mockReset();
    mockedUseAuth.mockReturnValue({
      user: {
        friendCode: 'ABCD1234',
        id: 'user-1',
      },
    } as never);
    mockedUseConnectivity.mockReset();
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as never);
    mockedEvictFriendshipDependentQueries.mockReset();
    mockedEvictFriendshipDependentQueries.mockResolvedValue(undefined);
    mockedRemoveFriend.mockReset();
    mockedRemoveFriend.mockResolvedValue(undefined);
    mockedSubscribeToFriendshipChanges.mockReset();
    mockedSubscribeToFriendshipChanges.mockReturnValue(jest.fn());
    mockedUseFriendWrites.mockReset();
    mockedUseFriendWrites.mockReturnValue({
      acceptFriendRequest: jest.fn().mockResolvedValue({ status: 'completed' }),
      acceptFriendSuggestion: jest.fn(),
      removeFriend: jest.fn(async ({ friend, operationName, removedUserId }) => {
        await mockedRemoveFriend(friend.id);
        if (operationName === 'friend.remove') {
          await mockedEvictFriendshipDependentQueries(queryClient as never, { removedUserId });
        } else {
          await queryClient.invalidateQueries({ queryKey: ['feature', 'friends'] });
        }
        return { status: 'completed' };
      }),
      sendFriendRequest: jest.fn().mockResolvedValue({ status: 'completed' }),
    } as never);
  });

  it('keeps the root content orange while measuring a white top backdrop for pull-down refresh', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderFriendsScreen();
    });

    const scaffold = renderer.root.findByType('TabRootScreenScaffold');
    expect(flattenStyle(scaffold.props.contentStyle).backgroundColor).toBe('app-background');

    const topChromeLayoutView = renderer.root.find(
      (node: any) =>
        node.type === 'View' &&
        typeof node.props.onLayout === 'function' &&
        node.findAllByType('TabBrandHeader').length > 0,
    );

    await act(async () => {
      topChromeLayoutView.props.onLayout({
        nativeEvent: {
          layout: {
            height: 96,
            width: 360,
            x: 0,
            y: 0,
          },
        },
      });
    });

    const backdrop = renderer.root.findByProps({ testID: 'friends-screen-top-backdrop' });
    const recordsSection = renderer.root.findByProps({ testID: 'friends-screen-records-section' });
    expect(flattenStyle(backdrop.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: 'surface-background',
        height: 168,
      }),
    );
    expect(recordsSection.props.overscrollBackgroundSplit).toEqual({
      bottomColor: 'app-background',
      topColor: 'surface-background',
      topRatio: 0.6,
    });
    expect(recordsSection).toBeTruthy();
  });

  it('keeps refresh disabled on the my-code tab', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderFriendsScreen();
    });

    const mainTabControl = renderer.root.findAllByType('SegmentedControl')[0];

    await act(async () => {
      mainTabControl.props.onChange('my-code');
    });

    const list = renderer.root.find(
      (node: any) => Array.isArray(node.props.data) && node.props.ListHeaderComponent !== undefined,
    );

    expect(list.props.onRefresh).toBeUndefined();
    expect(list.props.refreshing).toBe(false);
  });

  it('invalidates friends queries when a friendship realtime change arrives', async () => {
    let realtimeChange: (() => void) | undefined;
    mockedSubscribeToFriendshipChanges.mockImplementation((onChange) => {
      realtimeChange = onChange;
      return jest.fn();
    });

    await act(async () => {
      renderFriendsScreen();
    });

    expect(mockedSubscribeToFriendshipChanges).toHaveBeenCalledTimes(1);

    await act(async () => {
      realtimeChange?.();
      await Promise.resolve();
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'friends'],
    });
  });

  it('evicts friend-gated caches after confirming friend removal', async () => {
    mockedUseInfiniteQuery.mockReturnValue({
      data: {
        pageParams: [1],
        pages: [
          {
            hasNextPage: false,
            items: [
              {
                createdAt: '2026-04-18T08:00:00.000Z',
                id: 'friendship-1',
                name: 'Sam',
                status: 'friend',
                userId: 'user-2',
              },
            ],
            page: 1,
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
    } as never);
    let renderer: any = null;
    await act(async () => {
      renderer = renderFriendsScreen();
    });

    const removeButton = renderer.root.findByProps({ testID: 'friend-remove-button-friendship-1' });

    expect(flattenStyle(removeButton.props.style)).toEqual(
      expect.objectContaining({
        minHeight: 44,
        minWidth: 44,
      }),
    );

    await act(async () => {
      removeButton.props.onPress();
    });

    const confirmModal = renderer.root.findByProps({ testID: 'friend-remove-confirm-modal' });

    await act(async () => {
      confirmModal.props.onConfirm();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedRemoveFriend).toHaveBeenCalledWith('friendship-1');
    expect(mockedEvictFriendshipDependentQueries).toHaveBeenCalledTimes(1);
    expect(mockedEvictFriendshipDependentQueries).toHaveBeenCalledWith(queryClient, { removedUserId: 'user-2' });
  });

  it('keeps cached friends visible while surfacing a refresh error', async () => {
    mockedUseInfiniteQuery.mockReturnValue({
      data: {
        pageParams: [1],
        pages: [
          {
            hasNextPage: false,
            items: [
              {
                createdAt: '2026-04-18T08:00:00.000Z',
                id: 'friendship-1',
                name: 'Sam',
                status: 'friend',
                userId: 'user-2',
              },
            ],
            page: 1,
          },
        ],
      },
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isError: true,
      isFetching: false,
      isFetchingNextPage: false,
      isLoading: false,
      isRefetching: false,
      isSuccess: false,
      refetch: jest.fn(),
    } as never);

    let renderer: any = null;
    await act(async () => {
      renderer = renderFriendsScreen();
    });

    expect(renderer.root.findAllByType('FriendListItemCard')).toHaveLength(1);
    expect(
      renderer.root.findAllByType('PageErrorToast').some(
        (toast: any) => toast.props.errorMessage === 'Could not refresh friendship data. Showing saved data.',
      ),
    ).toBe(true);
  });

  it('renders retryable error state when friends fail before cached data exists', async () => {
    const refetch = jest.fn();
    mockedUseInfiniteQuery.mockReturnValue({
      data: undefined,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isError: true,
      isFetching: false,
      isFetchingNextPage: false,
      isLoading: false,
      isRefetching: false,
      isSuccess: false,
      refetch,
    } as never);

    let renderer: any = null;
    await act(async () => {
      renderer = renderFriendsScreen();
    });

    expect(renderer.root.findAllByType('EmptyState')).toHaveLength(0);

    const errorState = renderer.root.findByType('ErrorState');

    expect(errorState.props.title).toBe('Friends unavailable');
    expect(errorState.props.description).toBe('Could not load friendship data.');
    expect(errorState.props.retryLabel).toBe('Retry');

    errorState.props.onRetry();

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
