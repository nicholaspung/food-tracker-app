import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useWriteTelemetry } from '../features/store/useWriteTelemetry';
import { usePaginatedQueryState } from '../hooks/useListQueryState';
import { buildFoodProductCreatedHomeParams } from '../navigation/homeRouteParams';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { LayoutChromeProvider } from '../providers/LayoutChromeProvider';
import { HomeScreen } from '../screens/HomeScreen';
import {
  getPendingFriendSuggestion,
} from '../lib/pendingFriendSuggestion';
import { useHomeFeedActionController } from '../screens/home/useHomeFeedActionController';

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
    Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('Pressable', props, children),
    SectionList: ({
      ListEmptyComponent,
      ListFooterComponent,
      ListHeaderComponent,
      renderItem,
      renderSectionHeader,
      sections = [],
      ...props
    }: Record<string, unknown>) => {
      const typedSections = Array.isArray(sections)
        ? (sections as { data?: unknown[] }[])
        : [];

      return mockReact.createElement(
        'SectionList',
        {
          ...props,
          ListEmptyComponent,
          ListFooterComponent,
          ListHeaderComponent,
          renderItem,
          renderSectionHeader,
          sections,
        },
        renderListElement(ListHeaderComponent),
        typedSections.length > 0
          ? typedSections.flatMap((section, sectionIndex) => [
              mockReact.createElement(
                mockReact.Fragment,
                { key: `section-header-${sectionIndex}` },
                renderListElement(renderSectionHeader, { section }),
              ),
              ...(Array.isArray(section.data) && typeof renderItem === 'function'
                ? section.data.map((item: unknown, index: number) =>
                    mockReact.createElement(
                      mockReact.Fragment,
                      { key: `section-item-${sectionIndex}-${index}` },
                      renderItem({ index, item, section }),
                    ),
                  )
                : []),
            ])
          : renderListElement(ListEmptyComponent),
        renderListElement(ListFooterComponent),
      );
    },
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('View', props, children),
  };
});

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
  ScreenContentSection: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('ScreenContentSection', props, children),
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

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style || typeof style !== 'object') {
    return {};
  }

  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (accumulator, entry) => ({ ...accumulator, ...flattenStyle(entry) }),
      {},
    );
  }

  return style as Record<string, unknown>;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

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
      isRefetching: false,
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
      closeDeleteModal: jest.fn(),
      closeMoveVisitItemModal: jest.fn(),
      closePhotoViewer: jest.fn(),
      closeReportMenu: jest.fn(),
      closeReportModal: jest.fn(),
      confirmDeleteTarget: jest.fn(),
      confirmMoveVisitItem: jest.fn(),
      deleteErrorMessage: null,
      isDeletingTarget: false,
      isMovingVisitItem: false,
      isPhotoViewerVisible: false,
      isSubmittingReport: false,
      moveErrorMessage: null,
      openPhotoViewer: jest.fn(),
      openReportModalFromMenu: jest.fn(),
      pendingDeleteTarget: null,
      pendingMoveItem: null,
      pendingReportMenuTarget: null,
      pendingReportTarget: null,
      photoViewerInitialIndex: 0,
      photoViewerPreviewUrls: [],
      photoViewerUrls: [],
      promptMoveVisitItem: jest.fn(),
      promptDeleteFoodProduct: jest.fn(),
      promptDeleteVisit: jest.fn(),
      promptReportMenuTarget: jest.fn(),
      reportErrorMessage: null,
      reportNotes: '',
      reportReasonCode: null,
      changeReportNotes: jest.fn(),
      changeReportReasonCode: jest.fn(),
      submitReport: jest.fn(),
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('only enables visit-item move affordances for owned visits and passes owned fallbacks', async () => {
    let renderer: any = null;

    mockedUsePaginatedQueryState.mockReturnValue({
      hasBlockingError: false,
      hasRefreshError: false,
      items: [
        {
          eventAt: '2026-04-18T08:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-own',
            restaurantName: 'Own Bistro',
            visitedAt: '2026-04-18T08:00:00.000Z',
            items: [],
            source: 'visit',
            userId: 'user-1',
            createdAt: '2026-04-18T08:00:00.000Z',
            updatedAt: '2026-04-18T08:05:00.000Z',
          },
        },
        {
          eventAt: '2026-04-18T09:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-friend',
            restaurantName: 'Friend Bistro',
            visitedAt: '2026-04-18T09:00:00.000Z',
            items: [],
            source: 'visit',
            userId: 'user-2',
            userName: 'Friend',
            createdAt: '2026-04-18T09:00:00.000Z',
            updatedAt: '2026-04-18T09:05:00.000Z',
          },
        },
      ],
    } as never);

    await act(async () => {
      renderer = create(
        <LayoutChromeProvider topInsetConsumedByOverlay topOverlayHeight={72}>
          <HomeScreen
            navigation={{
              navigate: jest.fn(),
              push: jest.fn(),
              setParams: jest.fn(),
            } as never}
            route={{
              key: 'home',
              name: 'Home',
            } as never}
          />
        </LayoutChromeProvider>,
      );
      await Promise.resolve();
    });

    const visitCards = renderer.root.findAllByType('HomeFeedVisitEntryCard');

    expect(visitCards).toHaveLength(2);
    expect(typeof visitCards[0].props.onItemLongPress).toBe('function');
    expect(visitCards[1].props.onItemLongPress).toBeUndefined();
    expect(renderer.root.findByType('HomeFeedActionModals').props.fallbackVisits).toEqual([
      {
        id: 'visit-own',
        restaurantName: 'Own Bistro',
        visitedAt: '2026-04-18T08:00:00.000Z',
        items: [],
        source: 'visit',
        userId: 'user-1',
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:05:00.000Z',
      },
    ]);
  });

  it('renders the measured home header backdrop above the orange content area', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <HomeScreen
          navigation={{
            navigate: jest.fn(),
            push: jest.fn(),
            setParams: jest.fn(),
          } as never}
          route={{
            key: 'home',
            name: 'Home',
          } as never}
        />,
      );
      await Promise.resolve();
    });

    const headerLayoutView = renderer.root.find(
      (node: any) =>
        node.type === 'View' &&
        typeof node.props.onLayout === 'function' &&
        node.findAllByType('FeedHeaderControls').length > 0,
    );

    await act(async () => {
      headerLayoutView.props.onLayout({
        nativeEvent: {
          layout: {
            height: 84,
            width: 360,
            x: 0,
            y: 0,
          },
        },
      });
    });

    const headerBackdrop = renderer.root.findByProps({ testID: 'home-screen-header-backdrop' });
    const recordsSection = renderer.root.findByProps({ testID: 'home-screen-records-section' });
    expect(renderer.root.findAllByProps({ testID: 'home-screen-lower-backdrop' })).toHaveLength(0);
    expect(flattenStyle(headerBackdrop.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: 'surface-background',
        height: 84,
      }),
    );
    expect(recordsSection).toBeTruthy();
  });

  it('keeps the home list refresh prop active until the refetch lifecycle settles', async () => {
    const refetchDeferred = createDeferred<{
      data: {
        pages: { items: unknown[] }[];
      };
    }>();
    const queryResult = {
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
      isRefetching: false,
      isSuccess: true,
      refetch: jest.fn(() => refetchDeferred.promise),
    };
    mockedUseInfiniteQuery.mockReturnValue(queryResult as never);

    const navigation = {
      navigate: jest.fn(),
      push: jest.fn(),
      setParams: jest.fn(),
    };
    const route = {
      key: 'home',
      name: 'Home',
    };

    let renderer: any = null;

    await act(async () => {
      renderer = create(<HomeScreen navigation={navigation as never} route={route as never} />);
      await Promise.resolve();
    });

    const findRefreshableList = () =>
      renderer.root.find(
        (node: any) => typeof node.props.onRefresh === 'function' && typeof node.props.refreshing === 'boolean',
      );

    expect(findRefreshableList().props.refreshing).toBe(false);

    let refreshPromise: Promise<unknown> | null = null;
    act(() => {
      refreshPromise = findRefreshableList().props.onRefresh();
    });

    expect(findRefreshableList().props.refreshing).toBe(true);

    await act(async () => {
      queryResult.isRefetching = true;
      renderer.update(<HomeScreen navigation={navigation as never} route={route as never} />);
      await Promise.resolve();
    });

    expect(findRefreshableList().props.refreshing).toBe(true);

    await act(async () => {
      refetchDeferred.resolve({
        data: {
          pages: [{ items: [] }],
        },
      });
      await refreshPromise;
    });

    expect(findRefreshableList().props.refreshing).toBe(true);

    await act(async () => {
      queryResult.isRefetching = false;
      renderer.update(<HomeScreen navigation={navigation as never} route={route as never} />);
      await Promise.resolve();
    });

    expect(findRefreshableList().props.refreshing).toBe(false);
  });
});
