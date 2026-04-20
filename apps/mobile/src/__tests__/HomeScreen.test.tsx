import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useWriteTelemetry } from '../features/store/useWriteTelemetry';
import { usePaginatedQueryState } from '../hooks/useListQueryState';
import { buildFoodProductCreatedHomeParams } from '../navigation/homeRouteParams';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { HomeScreen } from '../screens/HomeScreen';
import {
  getPendingFriendSuggestion,
} from '../lib/pendingFriendSuggestion';
import { useHomeFeedActionController } from '../screens/home/useHomeFeedActionController';

const mockReact = React;

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('../components/shared', () => ({
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  FeedHeaderControls: (props: Record<string, unknown>) => mockReact.createElement('FeedHeaderControls', props),
  HomeFeedVisitEntryCard: (props: Record<string, unknown>) =>
    mockReact.createElement('HomeFeedVisitEntryCard', props),
  HomeFoodProductEntryCard: (props: Record<string, unknown>) =>
    mockReact.createElement('HomeFoodProductEntryCard', props),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
  TabRootScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('TabRootScreenScaffold', props, children),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../features', () => ({
  createFriendSuggestionAcceptance: jest.fn(),
  friendsQueryKeys: {
    root: ['feature', 'friends'],
  },
  getAuthenticatedUserIdOrNull: jest.fn(() => 'user-1'),
  homeFeedQueryKeys: {
    paginated: jest.fn(() => ['feature', 'homeFeed', 'paginated', 'mine', 'visits', 'created', '']),
    root: ['feature', 'homeFeed'],
  },
  HOME_FEED_DEFAULT_SORTS: {
    friends: 'created',
    mine: 'created',
  },
  invalidateHomeFeedQueries: jest.fn(),
  listHomeFeedPage: jest.fn(),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../features/store/useWriteTelemetry', () => ({
  useWriteTelemetry: jest.fn(),
}));

jest.mock('../hooks/useListQueryState', () => ({
  usePaginatedQueryState: jest.fn(),
}));

jest.mock('../lib/pendingFriendSuggestion', () => ({
  clearPendingFriendSuggestion: jest.fn(),
  getPendingFriendSuggestion: jest.fn(),
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

jest.mock('../screens/home/HomeFeedActionModals', () => ({
  HomeFeedActionModals: (props: Record<string, unknown>) => mockReact.createElement('HomeFeedActionModals', props),
}));

jest.mock('../screens/home/useHomeFeedActionController', () => ({
  useHomeFeedActionController: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({}),
  useTheme: () => ({
    colors: {
      background: {
        app: 'app-background',
        inverse: 'inverse-background',
        surface: 'surface-background',
      },
      border: {
        danger: 'danger-border',
        default: 'default-border',
        subtle: 'subtle-border',
      },
      button: {
        primaryBg: 'primary-bg',
      },
      status: {
        infoBg: 'info-bg',
      },
      text: {
        brand: 'brand-text',
        danger: 'danger-text',
        info: 'info-text',
        inverse: 'inverse-text',
        muted: 'muted-text',
        primary: 'primary-text',
        secondary: 'secondary-text',
      },
    },
    spacing: {
      sm: 12,
      md: 16,
      xs: 8,
    },
  }),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<typeof useInfiniteQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseOfflineAwareFeatureWrite = useOfflineAwareFeatureWrite as jest.MockedFunction<
  typeof useOfflineAwareFeatureWrite
>;
const mockedUseWriteTelemetry = useWriteTelemetry as jest.MockedFunction<typeof useWriteTelemetry>;
const mockedUsePaginatedQueryState = usePaginatedQueryState as jest.MockedFunction<typeof usePaginatedQueryState>;
const mockedGetPendingFriendSuggestion = getPendingFriendSuggestion as jest.MockedFunction<
  typeof getPendingFriendSuggestion
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedUseHomeFeedActionController = useHomeFeedActionController as jest.MockedFunction<
  typeof useHomeFeedActionController
>;

describe('HomeScreen', () => {
  beforeEach(() => {
    mockedUseInfiniteQuery.mockReset();
    mockedUseInfiniteQuery.mockReturnValue({
      data: {
        pageParams: [undefined],
        pages: [
          {
            cursor: undefined,
            hasNextPage: false,
            items: [],
            totalFoodProducts: 0,
            totalVisits: 0,
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
    } as never);
    mockedUseQueryClient.mockReset();
    mockedUseQueryClient.mockReturnValue({
      invalidateQueries: jest.fn(),
    } as never);
    mockedUseOfflineAwareFeatureWrite.mockReset();
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(jest.fn() as never);
    mockedUseWriteTelemetry.mockReset();
    mockedUseWriteTelemetry.mockReturnValue(jest.fn());
    mockedUsePaginatedQueryState.mockReset();
    mockedUsePaginatedQueryState.mockReturnValue({
      hasBlockingError: false,
      hasRefreshError: false,
      items: [],
    } as never);
    mockedGetPendingFriendSuggestion.mockReset();
    mockedGetPendingFriendSuggestion.mockResolvedValue(null);
    mockedUseAuth.mockReset();
    mockedUseAuth.mockReturnValue({
      user: {
        email: 'user@example.com',
      },
    } as never);
    mockedUseConnectivity.mockReset();
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as never);
    mockedUseHomeFeedActionController.mockReset();
    mockedUseHomeFeedActionController.mockReturnValue({
      deleteErrorMessage: null,
      openPhotoViewer: jest.fn(),
      promptDeleteFoodProduct: jest.fn(),
      promptDeleteVisit: jest.fn(),
      promptReportMenuTarget: jest.fn(),
    } as never);
  });

  it('applies and consumes the one-shot food product success view params', async () => {
    const setParams = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <HomeScreen
          navigation={{
            navigate: jest.fn(),
            push: jest.fn(),
            setParams,
          } as never}
          route={{
            key: 'home',
            name: 'Home',
            params: buildFoodProductCreatedHomeParams(),
          } as never}
        />,
      );
      await Promise.resolve();
    });

    expect(renderer.root.findByType('FeedHeaderControls').props.feedMode).toBe('mine');
    expect(renderer.root.findByType('FeedHeaderControls').props.typeFilter).toBe('food-products');
    expect(renderer.root.findByType('FeedHeaderControls').props.sortFilter).toBe('created');
    expect(renderer.root.findByType('FeedHeaderControls').props.searchQuery).toBe('');
    expect(renderer.root.findByType('FeedHeaderControls').props.filtersExpanded).toBe(true);
    expect(setParams).toHaveBeenCalledWith({
      initialView: undefined,
    });
  });
});
