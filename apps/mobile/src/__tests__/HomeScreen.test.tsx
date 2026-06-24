import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getRestaurantListBookmarkState,
  getRestaurantListDetail,
} from '../features/store/restaurantListsStore';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useRestaurantListWrites } from '../features/store/useRestaurantListWrites';
import { useWriteTelemetry } from '../features/store/useWriteTelemetry';
import {
  buildFoodProductCreatedHomeParams,
  buildVisitCreatedHomeParams,
} from '../navigation/homeRouteParams';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { LayoutChromeProvider } from '../providers/LayoutChromeProvider';
import { HomeScreen } from '../screens/HomeScreen';
import {
  clearPendingFriendSuggestion,
  getPendingFriendSuggestion,
} from '../lib/pendingFriendSuggestion';
import { trackObservabilityEvent } from '../observability';
import { useHomeFeedActionController } from '../screens/home/useHomeFeedActionController';

const mockReact = React;
const mockFlatListScrollToIndex = jest.fn();
const mockFlatListScrollToOffset = jest.fn();
const mockQueryClientInvalidateQueries = jest.fn();
const mockSectionListScrollTo = jest.fn();

jest.mock('react-native', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const renderListElement = (element: unknown, props: Record<string, unknown> = {}) => {
    if (!element) {
      return null;
    }

    if (react.isValidElement(element)) {
      return element;
    }

    if (typeof element === 'function') {
      return element(props);
    }

    return null;
  };

  return {
    FlatList: react.forwardRef(function MockFlatList(
      {
        ListEmptyComponent,
        ListFooterComponent,
        ListHeaderComponent,
        data = [],
        renderItem,
        ...props
      }: Record<string, unknown>,
      ref: React.ForwardedRef<{ scrollToIndex: () => void; scrollToOffset: () => void }>,
    ) {
      react.useImperativeHandle(ref, () => ({
        scrollToIndex: mockFlatListScrollToIndex,
        scrollToOffset: mockFlatListScrollToOffset,
      }));

      return react.createElement(
          'FlatList',
          { ...props, ListEmptyComponent, ListFooterComponent, ListHeaderComponent, data, renderItem },
          renderListElement(ListHeaderComponent),
          Array.isArray(data) && data.length > 0 && typeof renderItem === 'function'
            ? data.map((item, index) =>
                react.createElement(
                  react.Fragment,
                  { key: `flat-item-${index}` },
                  renderItem({ index, item }),
                ),
              )
            : renderListElement(ListEmptyComponent),
          renderListElement(ListFooterComponent),
        );
    }),
    Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      react.createElement('Pressable', props, children),
    SectionList: react.forwardRef(function MockSectionList(
      {
        ListEmptyComponent,
        ListFooterComponent,
        ListHeaderComponent,
        renderItem,
        renderSectionHeader,
        sections = [],
        ...props
      }: Record<string, unknown>,
      ref: React.ForwardedRef<{ getScrollResponder: () => { scrollTo: () => void } }>,
    ) {
      react.useImperativeHandle(ref, () => ({
        getScrollResponder: () => ({
          scrollTo: mockSectionListScrollTo,
        }),
      }));
      const typedSections = Array.isArray(sections)
        ? (sections as { data?: unknown[] }[])
        : [];

      return react.createElement(
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
              react.createElement(
                react.Fragment,
                { key: `section-header-${sectionIndex}` },
                renderListElement(renderSectionHeader, { section }),
              ),
              ...(Array.isArray(section.data) && typeof renderItem === 'function'
                ? section.data.map((item: unknown, index: number) =>
                    react.createElement(
                      react.Fragment,
                      { key: `section-item-${sectionIndex}-${index}` },
                      renderItem({ index, item, section }),
                    ),
                  )
                : []),
            ])
          : renderListElement(ListEmptyComponent),
        renderListElement(ListFooterComponent),
      );
    }),
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      react.createElement('View', props, children),
  };
});

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('../components/shared', () => ({
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  FeatureListFooter: (props: Record<string, unknown>) => mockReact.createElement('FeatureListFooter', props),
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
  WantToTryBookmarkButton: (props: Record<string, unknown>) =>
    mockReact.createElement('WantToTryBookmarkButton', props),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../features', () => ({
  createFriendSuggestionAcceptance: jest.fn(),
  friendsQueryKeys: {
    root: ['feature', 'friends'],
  },
  homeFeedQueryKeys: {
    paginated: jest.fn((
      userId: string | null | undefined,
      scope: string,
      typeFilter: string,
      sort: string,
      search: string,
    ) => [
      'feature',
      'homeFeed',
      'user',
      userId ?? 'anonymous',
      'paginated',
      scope,
      typeFilter,
      sort,
      search,
    ]),
    root: ['feature', 'homeFeed'],
  },
  homeFeedMapQueryKeys: {
    points: jest.fn((
      userId: string | null | undefined,
      scope: string,
      typeFilter: string,
      sort: string,
      search: string,
    ) => [
      'feature',
      'homeFeedMap',
      'user',
      userId ?? 'anonymous',
      'points',
      scope,
      typeFilter,
      sort,
      search,
    ]),
    root: ['feature', 'homeFeedMap'],
  },
  HOME_FEED_DEFAULT_SORTS: {
    friends: 'created',
    mine: 'created',
  },
  invalidateHomeFeedQueries: jest.fn(),
  listHomeFeedMapPoints: jest.fn(),
  listHomeFeedPage: jest.fn(),
  mapHomeFeedDefaultsFromRecord: (record: Record<string, unknown> | null | undefined) => ({
    homeFeedMode: record?.defaultHomeFeedMode === 'friends' ? 'friends' : 'mine',
    homeFeedSort: record?.defaultHomeFeedSort === 'tracked' ? 'tracked' : 'created',
    homeFeedTypeFilter:
      record?.defaultHomeFeedTypeFilter === 'all' || record?.defaultHomeFeedTypeFilter === 'food-products'
        ? record.defaultHomeFeedTypeFilter
        : 'visits',
  }),
  useFriendWrites: jest.fn(() => ({
    acceptFriendSuggestion: jest.fn(),
  })),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../features/store/restaurantListQuery', () => ({
  restaurantListQueryKeys: {
    bookmarkState: jest.fn((listId: string, bookmarkKeys: string[]) => [
      'feature',
      'restaurantListBookmarkState',
      listId,
      [...bookmarkKeys].sort().join('|'),
    ]),
    bookmarkStateRoot: ['feature', 'restaurantListBookmarkState'],
    defaultList: ['feature', 'restaurantLists', 'my', 'default'],
    detail: (listId: string) => ['feature', 'restaurantListDetail', listId],
  },
}));

jest.mock('../features/store/restaurantListsStore', () => ({
  getDefaultRestaurantList: jest.fn(),
  getRestaurantListBookmarkState: jest.fn(),
  getRestaurantListDetail: jest.fn(),
}));

jest.mock('../features/store/useRestaurantListWrites', () => ({
  useRestaurantListWrites: jest.fn(),
}));

jest.mock('../features/store/useWriteTelemetry', () => ({
  useWriteTelemetry: jest.fn(),
}));

jest.mock('../hooks/useDebouncedValue', () => ({
  useDebouncedValue: (value: unknown) => value,
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

jest.mock('../screens/home/HomeFeedMapView', () => ({
  HomeFeedMapView: (props: Record<string, unknown>) => mockReact.createElement('HomeFeedMapView', props),
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
        brand: 'brand-border',
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
const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedGetRestaurantListBookmarkState = getRestaurantListBookmarkState as jest.MockedFunction<
  typeof getRestaurantListBookmarkState
>;
const mockedGetRestaurantListDetail = getRestaurantListDetail as jest.MockedFunction<typeof getRestaurantListDetail>;
const mockedUseOfflineAwareFeatureWrite = useOfflineAwareFeatureWrite as jest.MockedFunction<
  typeof useOfflineAwareFeatureWrite
>;
const mockedUseRestaurantListWrites = useRestaurantListWrites as jest.MockedFunction<typeof useRestaurantListWrites>;
const mockedUseWriteTelemetry = useWriteTelemetry as jest.MockedFunction<typeof useWriteTelemetry>;
const mockedGetPendingFriendSuggestion = getPendingFriendSuggestion as jest.MockedFunction<
  typeof getPendingFriendSuggestion
>;
const mockedClearPendingFriendSuggestion = clearPendingFriendSuggestion as jest.MockedFunction<
  typeof clearPendingFriendSuggestion
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
  typeof trackObservabilityEvent
>;
const mockedUseHomeFeedActionController = useHomeFeedActionController as jest.MockedFunction<
  typeof useHomeFeedActionController
>;
const mockedHomeFeedQueryKeys = jest.requireMock('../features').homeFeedQueryKeys as {
  paginated: jest.Mock;
};
const mockedHomeFeedMapQueryKeys = jest.requireMock('../features').homeFeedMapQueryKeys as {
  points: jest.Mock;
};
const mockedUseFriendWrites = jest.requireMock('../features').useFriendWrites as jest.Mock;

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

function mockHomeFeedQuery({
  fetchNextPage = jest.fn(),
  hasNextPage = false,
  isError = false,
  items = [],
  photoPreviews = [],
  refetch = jest.fn(),
}: {
  fetchNextPage?: jest.Mock;
  hasNextPage?: boolean;
  isError?: boolean;
  items?: unknown[];
  photoPreviews?: unknown[];
  refetch?: jest.Mock;
} = {}) {
  mockedUseInfiniteQuery.mockReturnValue({
    data: {
      pageParams: [undefined],
      pages: [
        {
          cursor: hasNextPage ? { page: 2 } : undefined,
          hasNextPage,
          items,
          photoPreviews,
          totalFoodProducts: items.filter((item: any) => item.source === 'food_product').length,
          totalVisits: items.filter((item: any) => item.source === 'visit').length,
        },
      ],
    },
    fetchNextPage,
    hasNextPage,
    isError,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading: false,
    isRefetching: false,
    isSuccess: !isError,
    refetch,
  } as never);
}

function mockHomeAuxiliaryQueries({
  bookmarkState = { savedTargetsByBookmarkKey: {} },
  defaultList = null,
  defaultListDetail = null,
  defaultListRefetch = jest.fn(),
  defaultListDetailRefetch = jest.fn(),
  mapRefetch = jest.fn(),
}: {
  bookmarkState?: unknown;
  defaultList?: unknown;
  defaultListDetail?: unknown;
  defaultListRefetch?: jest.Mock;
  defaultListDetailRefetch?: jest.Mock;
  mapRefetch?: jest.Mock;
} = {}) {
  mockedUseQuery.mockImplementation((options: any) => {
    const queryKey = options.queryKey as unknown[];
    if (Array.isArray(queryKey) && queryKey[0] === 'feature' && queryKey[1] === 'restaurantLists') {
      return {
        data: defaultList,
        isError: false,
        isLoading: false,
        refetch: defaultListRefetch,
      } as never;
    }

    if (Array.isArray(queryKey) && queryKey[0] === 'feature' && queryKey[1] === 'restaurantListDetail') {
      return {
        data: defaultListDetail,
        isError: false,
        isLoading: false,
        refetch: defaultListDetailRefetch,
      } as never;
    }

    if (Array.isArray(queryKey) && queryKey[0] === 'feature' && queryKey[1] === 'restaurantListBookmarkState') {
      return {
        data: bookmarkState,
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    }

    return {
      data: {
        omittedWithoutCoordinates: 0,
        points: [],
        totalEntries: 0,
      },
      isError: false,
      isLoading: false,
      refetch: mapRefetch,
    } as never;
  });
}

describe('HomeScreen', () => {
  beforeEach(() => {
    mockFlatListScrollToIndex.mockClear();
    mockFlatListScrollToOffset.mockClear();
    mockSectionListScrollTo.mockClear();
    mockedHomeFeedQueryKeys.paginated.mockClear();
    mockedHomeFeedMapQueryKeys.points.mockClear();
    mockedGetRestaurantListBookmarkState.mockReset();
    mockedGetRestaurantListDetail.mockReset();
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
    mockedUseQuery.mockReset();
    mockedUseQuery.mockReturnValue({
      data: {
        omittedWithoutCoordinates: 0,
        points: [],
        totalEntries: 0,
      },
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    } as never);
    mockedUseQueryClient.mockReset();
    mockQueryClientInvalidateQueries.mockReset();
    mockedUseQueryClient.mockReturnValue({
      invalidateQueries: mockQueryClientInvalidateQueries,
    } as never);
    mockedUseOfflineAwareFeatureWrite.mockReset();
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(jest.fn() as never);
    mockedUseRestaurantListWrites.mockReset();
    mockedUseRestaurantListWrites.mockReturnValue({
      removeBookmarkFromDefaultList: jest.fn(),
      saveBookmarkToDefaultList: jest.fn(),
    } as never);
    mockedUseWriteTelemetry.mockReset();
    mockedUseWriteTelemetry.mockReturnValue(jest.fn());
    mockedUseFriendWrites.mockReset();
    mockedUseFriendWrites.mockReturnValue({
      acceptFriendSuggestion: jest.fn(),
    });
    mockedTrackObservabilityEvent.mockReset();
    mockedGetPendingFriendSuggestion.mockReset();
    mockedGetPendingFriendSuggestion.mockResolvedValue(null);
    mockedClearPendingFriendSuggestion.mockReset();
    mockedClearPendingFriendSuggestion.mockResolvedValue();
    mockedUseAuth.mockReset();
    mockedUseAuth.mockReturnValue({
      user: {
        email: 'user@example.com',
        id: 'user-1',
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

  it('scopes the home feed query key to the authenticated user', async () => {
    await act(async () => {
      create(
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

    expect(mockedHomeFeedQueryKeys.paginated).toHaveBeenCalledWith(
      'user-1',
      'mine',
      'visits',
      'created',
      '',
    );
    expect(mockedUseInfiniteQuery.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        enabled: true,
        queryKey: ['feature', 'homeFeed', 'user', 'user-1', 'paginated', 'mine', 'visits', 'created', ''],
      }),
    );
  });

  it('scrolls the mine list to the top when the home tab sends a scroll signal', async () => {
    await act(async () => {
      create(
        <HomeScreen
          navigation={{
            navigate: jest.fn(),
            push: jest.fn(),
            setParams: jest.fn(),
          } as never}
          route={{
            key: 'home',
            name: 'Home',
            params: {
              scrollToTopSignal: 1,
            },
          } as never}
        />,
      );
      await Promise.resolve();
    });

    expect(mockFlatListScrollToOffset).toHaveBeenCalledWith({
      animated: true,
      offset: 0,
    });
    expect(mockSectionListScrollTo).not.toHaveBeenCalled();
  });

  it('scrolls the friends section list to the top when the home tab sends a scroll signal', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        defaultHomeFeedMode: 'friends',
        email: 'user@example.com',
        id: 'user-1',
      },
    } as never);

    await act(async () => {
      create(
        <HomeScreen
          navigation={{
            navigate: jest.fn(),
            push: jest.fn(),
            setParams: jest.fn(),
          } as never}
          route={{
            key: 'home',
            name: 'Home',
            params: {
              scrollToTopSignal: 1,
            },
          } as never}
        />,
      );
      await Promise.resolve();
    });

    expect(mockSectionListScrollTo).toHaveBeenCalledWith({
      animated: true,
      y: 0,
    });
    expect(mockFlatListScrollToOffset).not.toHaveBeenCalled();
  });

  it('uses saved home feed defaults for the initial query key', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        defaultHomeFeedMode: 'friends',
        defaultHomeFeedSort: 'tracked',
        defaultHomeFeedTypeFilter: 'all',
        email: 'user@example.com',
        id: 'user-1',
      },
    } as never);

    await act(async () => {
      create(
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

    expect(mockedHomeFeedQueryKeys.paginated).toHaveBeenCalledWith(
      'user-1',
      'friends',
      'all',
      'tracked',
      '',
    );
    expect(mockedUseInfiniteQuery.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        queryKey: ['feature', 'homeFeed', 'user', 'user-1', 'paginated', 'friends', 'all', 'tracked', ''],
      }),
    );
  });

  it('uses a different home feed cache key when the authenticated user changes', async () => {
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

    mockedUseAuth.mockReturnValue({
      user: {
        email: 'next@example.com',
        id: 'user-2',
      },
    } as never);

    await act(async () => {
      renderer.update(
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

    const queryKeys = mockedUseInfiniteQuery.mock.calls.map((call) => call[0].queryKey);
    expect(queryKeys).toContainEqual([
      'feature',
      'homeFeed',
      'user',
      'user-1',
      'paginated',
      'mine',
      'visits',
      'created',
      '',
    ]);
    expect(queryKeys).toContainEqual([
      'feature',
      'homeFeed',
      'user',
      'user-2',
      'paginated',
      'mine',
      'visits',
      'created',
      '',
    ]);
  });

  it('queues pending friend suggestion acceptance while offline', async () => {
    const acceptFriendSuggestion = jest.fn().mockResolvedValue({ status: 'queued' });
    let renderer: any = null;

    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as never);
    mockedUseFriendWrites.mockReturnValue({
      acceptFriendSuggestion,
    });
    mockedGetPendingFriendSuggestion.mockResolvedValue({
      createdAt: 1_000,
      expiresAt: 2_000,
      invitedUserId: 'user-1',
      inviterDisplayName: 'Sam',
      inviterId: 'user-inviter',
    });

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

    const addFriendButton = renderer.root.findAllByType('Pressable').find((pressable: any) =>
      pressable.findAllByType('Text').some((text: any) => text.children.includes('Add Friend')),
    );

    expect(addFriendButton).toBeDefined();

    await act(async () => {
      addFriendButton.props.onPress();
      await Promise.resolve();
    });

    expect(acceptFriendSuggestion).toHaveBeenCalledWith({ inviterId: 'user-inviter' });
    expect(mockedClearPendingFriendSuggestion).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByType('PageErrorToast')).toHaveLength(0);
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

  it('applies visit-created view params, scrolls to the visit, and highlights it', async () => {
    const setParams = jest.fn();
    let renderer: any = null;

    mockHomeFeedQuery({
      items: [
        {
          eventAt: '2026-04-20T08:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-newer',
            restaurantName: 'Newer Place',
            visitedAt: '2026-04-20T08:00:00.000Z',
            items: [],
            source: 'visit',
            userId: 'user-1',
            createdAt: '2026-04-20T08:00:00.000Z',
            updatedAt: '2026-04-20T08:05:00.000Z',
          },
        },
        {
          eventAt: '2026-04-18T08:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-old',
            restaurantName: 'Merged Bistro',
            visitedAt: '2026-04-18T08:00:00.000Z',
            items: [],
            source: 'visit',
            userId: 'user-1',
            createdAt: '2026-04-18T08:00:00.000Z',
            updatedAt: '2026-04-18T08:05:00.000Z',
          },
        },
      ],
    });

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
            params: buildVisitCreatedHomeParams('visit-old'),
          } as never}
        />,
      );
      await Promise.resolve();
    });

    expect(renderer.root.findByType('FeedHeaderControls').props.feedMode).toBe('mine');
    expect(renderer.root.findByType('FeedHeaderControls').props.typeFilter).toBe('visits');
    expect(renderer.root.findByType('FeedHeaderControls').props.sortFilter).toBe('created');
    expect(renderer.root.findByType('FeedHeaderControls').props.searchQuery).toBe('');
    expect(renderer.root.findByType('FeedHeaderControls').props.filtersExpanded).toBe(true);
    expect(setParams).toHaveBeenCalledWith({
      initialView: undefined,
    });
    expect(mockFlatListScrollToIndex).toHaveBeenCalledWith({
      animated: true,
      index: 1,
      viewPosition: 0.15,
    });

    const visitCards = renderer.root.findAllByType('HomeFeedVisitEntryCard');
    expect(visitCards[0].props.highlighted).toBe(false);
    expect(visitCards[1].props.highlighted).toBe(true);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('fetches another page when a focused visit has not loaded yet', async () => {
    const fetchNextPage = jest.fn().mockResolvedValue({
      data: {
        pages: [],
      },
    });
    mockHomeFeedQuery({
      fetchNextPage,
      hasNextPage: true,
      items: [
        {
          eventAt: '2026-04-20T08:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-newer',
            restaurantName: 'Newer Place',
            visitedAt: '2026-04-20T08:00:00.000Z',
            items: [],
            source: 'visit',
            userId: 'user-1',
            createdAt: '2026-04-20T08:00:00.000Z',
            updatedAt: '2026-04-20T08:05:00.000Z',
          },
        },
      ],
    });

    await act(async () => {
      create(
        <HomeScreen
          navigation={{
            navigate: jest.fn(),
            push: jest.fn(),
            setParams: jest.fn(),
          } as never}
          route={{
            key: 'home',
            name: 'Home',
            params: buildVisitCreatedHomeParams('visit-old'),
          } as never}
        />,
      );
      await Promise.resolve();
    });

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(mockFlatListScrollToIndex).not.toHaveBeenCalled();
  });

  it('only enables visit-item move affordances for owned visits and passes owned fallbacks', async () => {
    let renderer: any = null;

    mockHomeFeedQuery({
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
    });

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

  it('only passes share callbacks to owned home records', async () => {
    let renderer: any = null;

    mockHomeFeedQuery({
      photoPreviews: [
        {
          id: 'photo-own-item-one',
          collectionId: 'visit_photos',
          collectionName: 'visit_photos',
          created: '2026-04-18T08:01:00.000Z',
          food_item: 'own-item-one',
          photo: 'own-item-one.jpg',
        },
        {
          id: 'photo-own-item-two',
          collectionId: 'visit_photos',
          collectionName: 'visit_photos',
          created: '2026-04-18T08:02:00.000Z',
          food_item: 'own-item-two',
          photo: 'own-item-two.jpg',
        },
        {
          id: 'photo-friend-item-one',
          collectionId: 'visit_photos',
          collectionName: 'visit_photos',
          created: '2026-04-18T09:01:00.000Z',
          food_item: 'friend-item-one',
          photo: 'friend-item-one.jpg',
        },
        {
          id: 'photo-own-product',
          collectionId: 'visit_photos',
          collectionName: 'visit_photos',
          created: '2026-04-18T10:01:00.000Z',
          food_item: 'product-own',
          photo: 'own-product.jpg',
        },
        {
          id: 'photo-friend-product',
          collectionId: 'visit_photos',
          collectionName: 'visit_photos',
          created: '2026-04-18T11:01:00.000Z',
          food_item: 'product-friend',
          photo: 'friend-product.jpg',
        },
      ],
      items: [
        {
          eventAt: '2026-04-18T08:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-own',
            restaurantName: 'Own Bistro',
            visitedAt: '2026-04-18T08:00:00.000Z',
            items: [
              {
                id: 'own-item-one',
                name: 'Own Item One',
                rating: 8,
              },
              {
                id: 'own-item-two',
                name: 'Own Item Two',
                rating: 9,
              },
            ],
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
            items: [
              {
                id: 'friend-item-one',
                name: 'Friend Item One',
                rating: 7,
              },
            ],
            source: 'visit',
            userId: 'user-2',
            userName: 'Friend',
            createdAt: '2026-04-18T09:00:00.000Z',
            updatedAt: '2026-04-18T09:05:00.000Z',
          },
        },
        {
          eventAt: '2026-04-18T10:00:00.000Z',
          foodProduct: {
            id: 'product-own',
            itemName: 'Own Product',
            rating: 8,
            source: 'food_product',
            userId: 'user-1',
            createdAt: '2026-04-18T10:00:00.000Z',
            updatedAt: '2026-04-18T10:05:00.000Z',
          },
          source: 'food_product',
        },
        {
          eventAt: '2026-04-18T11:00:00.000Z',
          foodProduct: {
            id: 'product-friend',
            itemName: 'Friend Product',
            rating: 7,
            source: 'food_product',
            userId: 'user-2',
            userName: 'Friend',
            createdAt: '2026-04-18T11:00:00.000Z',
            updatedAt: '2026-04-18T11:05:00.000Z',
          },
          source: 'food_product',
        },
      ],
    });

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

    const visitCards = renderer.root.findAllByType('HomeFeedVisitEntryCard');
    const productCards = renderer.root.findAllByType('HomeFoodProductEntryCard');

    expect(visitCards).toHaveLength(2);
    expect(typeof visitCards[0].props.onSharePhoto).toBe('function');
    expect(typeof visitCards[0].props.onShareVisit).toBe('function');
    expect(visitCards[1].props.onSharePhoto).toBeUndefined();
    expect(visitCards[1].props.onShareVisit).toBeUndefined();

    expect(productCards).toHaveLength(2);
    expect(typeof productCards[0].props.onSharePhoto).toBe('function');
    expect(productCards[1].props.onSharePhoto).toBeUndefined();
  });

  it('does not enable the full Want to Try detail query in mine mode', async () => {
    mockHomeAuxiliaryQueries({
      defaultList: {
        id: 'default-list',
        isDefault: true,
        name: 'Want to Try',
      },
    });

    await act(async () => {
      create(
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

    const detailQueryOptions = mockedUseQuery.mock.calls
      .map(([options]) => options as any)
      .find((options) => Array.isArray(options.queryKey) && options.queryKey[1] === 'restaurantListDetail');

    expect(detailQueryOptions?.enabled).toBe(false);
    expect(mockedGetRestaurantListDetail).not.toHaveBeenCalled();
  });

  it('enables bounded friend-feed bookmark state only when visible bookmark keys exist', async () => {
    mockHomeAuxiliaryQueries({
      defaultList: {
        id: 'default-list',
        isDefault: true,
        name: 'Want to Try',
      },
    });

    await act(async () => {
      create(
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

    let bookmarkStateQueryOptions = mockedUseQuery.mock.calls
      .map(([options]) => options as any)
      .find((options) => Array.isArray(options.queryKey) && options.queryKey[1] === 'restaurantListBookmarkState');

    expect(bookmarkStateQueryOptions?.enabled).toBe(false);

    mockedUseQuery.mockClear();
    mockedGetRestaurantListBookmarkState.mockResolvedValue({ savedTargetsByBookmarkKey: {} });
    mockedUseAuth.mockReturnValue({
      user: {
        defaultHomeFeedMode: 'friends',
        defaultHomeFeedTypeFilter: 'all',
        email: 'user@example.com',
        id: 'user-1',
      },
    } as never);
    mockHomeAuxiliaryQueries({
      defaultList: {
        id: 'default-list',
        isDefault: true,
        name: 'Want to Try',
      },
    });
    mockHomeFeedQuery({
      items: [
        {
          eventAt: '2026-04-18T09:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-friend',
            restaurantId: 'restaurant-1',
            restaurantName: 'Friend Bistro',
            visitedAt: '2026-04-18T09:00:00.000Z',
            items: [
              {
                id: 'food-item-1',
                name: 'Friend Noodles',
                rating: 9,
              },
            ],
            source: 'visit',
            userId: 'friend-user',
            userName: 'Friend',
            createdAt: '2026-04-18T09:00:00.000Z',
            updatedAt: '2026-04-18T09:05:00.000Z',
          },
        },
      ],
    });

    await act(async () => {
      create(
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

    bookmarkStateQueryOptions = mockedUseQuery.mock.calls
      .map(([options]) => options as any)
      .find((options) => Array.isArray(options.queryKey) && options.queryKey[1] === 'restaurantListBookmarkState');

    expect(bookmarkStateQueryOptions?.enabled).toBe(true);
    expect(bookmarkStateQueryOptions?.queryKey).toEqual([
      'feature',
      'restaurantListBookmarkState',
      'default-list',
      'restaurant-item:restaurant-1:friend noodles',
    ]);
    await expect(bookmarkStateQueryOptions?.queryFn({ signal: undefined })).resolves.toEqual({
      savedTargetsByBookmarkKey: {},
    });
    expect(mockedGetRestaurantListBookmarkState).toHaveBeenCalledWith(
      'default-list',
      [
        {
          bookmarkKey: 'restaurant-item:restaurant-1:friend noodles',
          foodItemId: 'food-item-1',
          restaurantId: 'restaurant-1',
        },
      ],
      { signal: undefined },
    );
  });

  it('saves a friend feed recommendation to the default Want to Try list', async () => {
    const saveBookmarkToDefaultList = jest.fn().mockResolvedValue({ status: 'completed' });
    const defaultListRefetch = jest.fn();
    let renderer: any = null;

    mockedUseAuth.mockReturnValue({
      user: {
        defaultHomeFeedMode: 'friends',
        defaultHomeFeedTypeFilter: 'all',
        email: 'user@example.com',
        id: 'user-1',
      },
    } as never);
    mockedUseRestaurantListWrites.mockReturnValue({
      removeBookmarkFromDefaultList: jest.fn(),
      saveBookmarkToDefaultList,
    } as never);
    mockHomeAuxiliaryQueries({
      defaultList: {
        id: 'default-list',
        isDefault: true,
        name: 'Want to Try',
      },
      defaultListRefetch,
    });
    mockHomeFeedQuery({
      items: [
        {
          eventAt: '2026-04-18T09:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-friend',
            restaurantId: 'restaurant-1',
            restaurantName: 'Friend Bistro',
            visitedAt: '2026-04-18T09:00:00.000Z',
            items: [
              {
                id: 'food-item-1',
                name: 'Friend Noodles',
                notes: 'Order this.',
                rating: 9,
              },
            ],
            source: 'visit',
            userId: 'friend-user',
            userName: 'Friend',
            createdAt: '2026-04-18T09:00:00.000Z',
            updatedAt: '2026-04-18T09:05:00.000Z',
          },
        },
      ],
    });

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

    let visitCard = renderer.root.findByType('HomeFeedVisitEntryCard');
    const bookmarkElement = visitCard.props.renderItemBookmark({
      id: 'food-item-1',
      name: 'Friend Noodles',
      notes: 'Order this.',
      rating: 9,
    });

    expect(bookmarkElement.props.saved).toBe(false);

    await act(async () => {
      await bookmarkElement.props.onPress();
    });

    expect(saveBookmarkToDefaultList).toHaveBeenCalledWith({
      bookmark: {
        restaurantId: 'restaurant-1',
        foodItemId: 'food-item-1',
        note: 'Order this.',
        sourceUserId: 'friend-user',
      },
      defaultListId: 'default-list',
      sourceListId: 'default-list',
    });
    expect(defaultListRefetch).toHaveBeenCalled();
    expect(mockQueryClientInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'restaurantListBookmarkState'],
    });
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'social.recommendation_saved',
      expect.objectContaining({
        entryMethod: 'home_friend_feed_default',
        source: 'HomeScreen',
        targetListCount: 1,
      }),
    );
    expect(mockedTrackObservabilityEvent).not.toHaveBeenCalledWith(
      'social.recommendation_saved',
      expect.objectContaining({
        itemName: 'Friend Noodles',
      }),
    );
  });

  it('reflects friend feed recommendations already saved in Want to Try', async () => {
    let renderer: any = null;

    mockedUseAuth.mockReturnValue({
      user: {
        defaultHomeFeedMode: 'friends',
        defaultHomeFeedTypeFilter: 'all',
        email: 'user@example.com',
        id: 'user-1',
      },
    } as never);
    mockHomeAuxiliaryQueries({
      defaultList: {
        id: 'default-list',
        isDefault: true,
        name: 'Want to Try',
      },
      bookmarkState: {
        savedTargetsByBookmarkKey: {
          'restaurant-item:restaurant-1:friend noodles': {
            bookmarkKey: 'restaurant-item:restaurant-1:friend noodles',
            foodItemId: 'food-item-1',
            restaurantId: 'restaurant-1',
          },
        },
      },
    });
    mockHomeFeedQuery({
      items: [
        {
          eventAt: '2026-04-18T09:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-friend',
            restaurantId: 'restaurant-1',
            restaurantName: 'Friend Bistro',
            visitedAt: '2026-04-18T09:00:00.000Z',
            items: [
              {
                id: 'food-item-1',
                name: 'Friend Noodles',
                rating: 9,
              },
            ],
            source: 'visit',
            userId: 'friend-user',
            userName: 'Friend',
            createdAt: '2026-04-18T09:00:00.000Z',
            updatedAt: '2026-04-18T09:05:00.000Z',
          },
        },
      ],
    });

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

    let visitCard = renderer.root.findByType('HomeFeedVisitEntryCard');
    const bookmarkElement = visitCard.props.renderItemBookmark({
      id: 'food-item-1',
      name: 'Friend Noodles',
      rating: 9,
    });

    expect(bookmarkElement.props.saved).toBe(true);
    expect(bookmarkElement.props.accessibilityLabel).toBe('Remove Friend Noodles from Want to Try');
  });

  it('reflects same restaurant menu item bookmarks across multiple friend feed records', async () => {
    let renderer: any = null;

    mockedUseAuth.mockReturnValue({
      user: {
        defaultHomeFeedMode: 'friends',
        defaultHomeFeedTypeFilter: 'all',
        email: 'user@example.com',
        id: 'user-1',
      },
    } as never);
    mockHomeAuxiliaryQueries({
      defaultList: {
        id: 'default-list',
        isDefault: true,
        name: 'Want to Try',
      },
      bookmarkState: {
        savedTargetsByBookmarkKey: {
          'menu-item-1': {
            bookmarkKey: 'menu-item-1',
            menuItemId: 'menu-item-1',
            restaurantId: 'restaurant-1',
          },
        },
      },
    });
    mockHomeFeedQuery({
      items: [
        {
          eventAt: '2026-04-18T09:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-friend-1',
            restaurantId: 'restaurant-1',
            restaurantName: 'Friend Bistro',
            visitedAt: '2026-04-18T09:00:00.000Z',
            items: [
              {
                id: 'food-item-1',
                menuItemId: 'menu-item-1',
                name: 'Friend Noodles',
                rating: 9,
              },
            ],
            source: 'visit',
            userId: 'friend-user-1',
            userName: 'Friend One',
            createdAt: '2026-04-18T09:00:00.000Z',
            updatedAt: '2026-04-18T09:05:00.000Z',
          },
        },
        {
          eventAt: '2026-04-17T09:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-friend-2',
            restaurantId: 'restaurant-1',
            restaurantName: 'Friend Bistro',
            visitedAt: '2026-04-17T09:00:00.000Z',
            items: [
              {
                id: 'food-item-2',
                menuItemId: 'menu-item-1',
                name: 'Friend Noodles',
                rating: 8,
              },
            ],
            source: 'visit',
            userId: 'friend-user-2',
            userName: 'Friend Two',
            createdAt: '2026-04-17T09:00:00.000Z',
            updatedAt: '2026-04-17T09:05:00.000Z',
          },
        },
      ],
    });

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

    const visitCards = renderer.root.findAllByType('HomeFeedVisitEntryCard');

    expect(
      visitCards[0].props.renderItemBookmark({
        id: 'food-item-1',
        menuItemId: 'menu-item-1',
        name: 'Friend Noodles',
        rating: 9,
      }).props.saved,
    ).toBe(true);
    expect(
      visitCards[1].props.renderItemBookmark({
        id: 'food-item-2',
        menuItemId: 'menu-item-1',
        name: 'Friend Noodles',
        rating: 8,
      }).props.saved,
    ).toBe(true);
  });

  it('reflects same restaurant item-name bookmarks across friend feed records without menu item ids', async () => {
    const removeBookmarkFromDefaultList = jest.fn().mockResolvedValue({ status: 'completed' });
    let renderer: any = null;

    mockedUseAuth.mockReturnValue({
      user: {
        defaultHomeFeedMode: 'friends',
        defaultHomeFeedTypeFilter: 'all',
        email: 'user@example.com',
        id: 'user-1',
      },
    } as never);
    mockedUseRestaurantListWrites.mockReturnValue({
      removeBookmarkFromDefaultList,
      saveBookmarkToDefaultList: jest.fn(),
    } as never);
    mockHomeAuxiliaryQueries({
      defaultList: {
        id: 'default-list',
        isDefault: true,
        name: 'Want to Try',
      },
      bookmarkState: {
        savedTargetsByBookmarkKey: {
          'restaurant-item:restaurant-1:cheeseburger': {
            bookmarkKey: 'restaurant-item:restaurant-1:cheeseburger',
            foodItemId: 'food-item-1',
            restaurantId: 'restaurant-1',
          },
        },
      },
    });
    mockHomeFeedQuery({
      items: [
        {
          eventAt: '2026-04-18T09:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-friend-1',
            restaurantId: 'restaurant-1',
            restaurantName: "McDonald's",
            visitedAt: '2026-04-18T09:00:00.000Z',
            items: [
              {
                id: 'food-item-1',
                name: 'Cheeseburger',
                rating: 9,
              },
              {
                id: 'food-item-2',
                name: 'Cheeseburger',
                rating: 8,
              },
            ],
            source: 'visit',
            userId: 'friend-user-1',
            userName: 'Friend One',
            createdAt: '2026-04-18T09:00:00.000Z',
            updatedAt: '2026-04-18T09:05:00.000Z',
          },
        },
      ],
    });

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

    const visitCard = renderer.root.findByType('HomeFeedVisitEntryCard');
    const firstBookmarkElement = visitCard.props.renderItemBookmark({
      id: 'food-item-1',
      name: 'Cheeseburger',
      rating: 9,
    });
    const secondBookmarkElement = visitCard.props.renderItemBookmark({
      id: 'food-item-2',
      name: 'Cheeseburger',
      rating: 8,
    });

    expect(firstBookmarkElement.props.saved).toBe(true);
    expect(secondBookmarkElement.props.saved).toBe(true);

    await act(async () => {
      await secondBookmarkElement.props.onPress();
    });

    expect(removeBookmarkFromDefaultList).toHaveBeenCalledWith({
      bookmark: {
        restaurantId: 'restaurant-1',
        foodItemId: 'food-item-1',
      },
      defaultListId: 'default-list',
      sourceListId: 'default-list',
    });
  });

  it('saves and removes friend feed menu item recommendations by menu item id', async () => {
    const saveBookmarkToDefaultList = jest.fn().mockResolvedValue({ status: 'completed' });
    const removeBookmarkFromDefaultList = jest.fn().mockResolvedValue({ status: 'completed' });
    let renderer: any = null;

    mockedUseAuth.mockReturnValue({
      user: {
        defaultHomeFeedMode: 'friends',
        defaultHomeFeedTypeFilter: 'all',
        email: 'user@example.com',
        id: 'user-1',
      },
    } as never);
    mockedUseRestaurantListWrites.mockReturnValue({
      removeBookmarkFromDefaultList,
      saveBookmarkToDefaultList,
    } as never);
    mockHomeAuxiliaryQueries({
      defaultList: {
        id: 'default-list',
        isDefault: true,
        name: 'Want to Try',
      },
    });
    mockHomeFeedQuery({
      items: [
        {
          eventAt: '2026-04-18T09:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-friend',
            restaurantId: 'restaurant-1',
            restaurantName: 'Friend Bistro',
            visitedAt: '2026-04-18T09:00:00.000Z',
            items: [
              {
                id: 'food-item-1',
                menuItemId: 'menu-item-1',
                name: 'Friend Noodles',
                notes: 'Order this.',
                rating: 9,
              },
            ],
            source: 'visit',
            userId: 'friend-user',
            userName: 'Friend',
            createdAt: '2026-04-18T09:00:00.000Z',
            updatedAt: '2026-04-18T09:05:00.000Z',
          },
        },
      ],
    });

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

    const visitCard = renderer.root.findByType('HomeFeedVisitEntryCard');
    const bookmarkElement = visitCard.props.renderItemBookmark({
      id: 'food-item-1',
      menuItemId: 'menu-item-1',
      name: 'Friend Noodles',
      notes: 'Order this.',
      rating: 9,
    });

    await act(async () => {
      await bookmarkElement.props.onPress();
    });

    expect(saveBookmarkToDefaultList).toHaveBeenCalledWith({
      bookmark: {
        restaurantId: 'restaurant-1',
        menuItemId: 'menu-item-1',
        sourceUserId: 'friend-user',
        note: 'Order this.',
      },
      defaultListId: 'default-list',
      sourceListId: 'default-list',
    });

    const updatedVisitCard = renderer.root.findByType('HomeFeedVisitEntryCard');
    const savedBookmarkElement = updatedVisitCard.props.renderItemBookmark({
      id: 'food-item-2',
      menuItemId: 'menu-item-1',
      name: 'Friend Noodles',
      rating: 8,
    });

    await act(async () => {
      await savedBookmarkElement.props.onPress();
    });

    expect(removeBookmarkFromDefaultList).toHaveBeenCalledWith({
      bookmark: {
        restaurantId: 'restaurant-1',
        menuItemId: 'menu-item-1',
      },
      defaultListId: 'default-list',
      sourceListId: 'default-list',
    });
  });

  it('removes a saved friend feed recommendation from Want to Try', async () => {
    const removeBookmarkFromDefaultList = jest.fn().mockResolvedValue({ status: 'completed' });
    let renderer: any = null;

    mockedUseAuth.mockReturnValue({
      user: {
        defaultHomeFeedMode: 'friends',
        defaultHomeFeedTypeFilter: 'all',
        email: 'user@example.com',
        id: 'user-1',
      },
    } as never);
    mockedUseRestaurantListWrites.mockReturnValue({
      removeBookmarkFromDefaultList,
      saveBookmarkToDefaultList: jest.fn(),
    } as never);
    mockHomeAuxiliaryQueries({
      defaultList: {
        id: 'default-list',
        isDefault: true,
        name: 'Want to Try',
      },
      bookmarkState: {
        savedTargetsByBookmarkKey: {
          'restaurant-item:restaurant-1:friend noodles': {
            bookmarkKey: 'restaurant-item:restaurant-1:friend noodles',
            foodItemId: 'food-item-1',
            restaurantId: 'restaurant-1',
          },
        },
      },
    });
    mockHomeFeedQuery({
      items: [
        {
          eventAt: '2026-04-18T09:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-friend',
            restaurantId: 'restaurant-1',
            restaurantName: 'Friend Bistro',
            visitedAt: '2026-04-18T09:00:00.000Z',
            items: [
              {
                id: 'food-item-1',
                name: 'Friend Noodles',
                rating: 9,
              },
            ],
            source: 'visit',
            userId: 'friend-user',
            userName: 'Friend',
            createdAt: '2026-04-18T09:00:00.000Z',
            updatedAt: '2026-04-18T09:05:00.000Z',
          },
        },
      ],
    });

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

    const visitCard = renderer.root.findByType('HomeFeedVisitEntryCard');
    const bookmarkElement = visitCard.props.renderItemBookmark({
      id: 'food-item-1',
      name: 'Friend Noodles',
      rating: 9,
    });

    expect(bookmarkElement.props.saved).toBe(true);

    await act(async () => {
      await bookmarkElement.props.onPress();
    });

    expect(removeBookmarkFromDefaultList).toHaveBeenCalledWith({
      bookmark: {
        restaurantId: 'restaurant-1',
        foodItemId: 'food-item-1',
      },
      defaultListId: 'default-list',
      sourceListId: 'default-list',
    });
    expect(mockQueryClientInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'restaurantListBookmarkState'],
    });
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'HOME_FRIEND_RECOMMENDATION_BOOKMARK_REMOVED',
      expect.objectContaining({
        source: 'HomeScreen',
        status: 'completed',
      }),
    );
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
    expect(recordsSection.props.overscrollBackgroundSplit).toEqual({
      bottomColor: 'app-background',
      topColor: 'surface-background',
      topRatio: 0.6,
    });
    expect(recordsSection).toBeTruthy();
  });

  it('skips the padded header body when there are no toasts or friend suggestions', async () => {
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

    expect(renderer.root.findAllByType('PageErrorToast')).toHaveLength(0);
  });

  it('clears pending friend suggestions for a different signed-in user', async () => {
    mockedGetPendingFriendSuggestion.mockResolvedValueOnce({
      inviterId: 'inviter-1',
      invitedUserId: 'other-user',
      createdAt: 1_000,
      expiresAt: 2_000,
    });

    await act(async () => {
      create(
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

    expect(mockedClearPendingFriendSuggestion).toHaveBeenCalled();
  });

  it('adds the first-row spacing path only to the first mine feed item', async () => {
    let renderer: any = null;

    mockHomeFeedQuery({
      items: [
        {
          eventAt: '2026-04-20T08:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-one',
            restaurantName: 'First Place',
            visitedAt: '2026-04-20T08:00:00.000Z',
            items: [],
            source: 'visit',
            userId: 'user-1',
            createdAt: '2026-04-20T08:00:00.000Z',
            updatedAt: '2026-04-20T08:05:00.000Z',
          },
        },
        {
          eventAt: '2026-04-19T08:00:00.000Z',
          source: 'visit',
          visit: {
            id: 'visit-two',
            restaurantName: 'Second Place',
            visitedAt: '2026-04-19T08:00:00.000Z',
            items: [],
            source: 'visit',
            userId: 'user-1',
            createdAt: '2026-04-19T08:00:00.000Z',
            updatedAt: '2026-04-19T08:05:00.000Z',
          },
        },
      ],
    });

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

    const itemRows = renderer.root.findAll(
      (node: any) => node.type === 'View' && node.findAllByType('HomeFeedVisitEntryCard').length === 1,
    );

    expect(itemRows).toHaveLength(2);
    expect(Array.isArray(itemRows[0].props.style)).toBe(true);
    expect(Array.isArray(itemRows[1].props.style)).toBe(false);
  });

  it('applies an item separator to the friends month list', async () => {
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

    await act(async () => {
      renderer.root.findByType('FeedHeaderControls').props.onFeedModeChange('friends');
      await Promise.resolve();
    });

    const sectionList = renderer.root.findByType('SectionList');

    expect(typeof sectionList.props.ItemSeparatorComponent).toBe('function');
    expect(sectionList.props.SectionSeparatorComponent).toBeUndefined();
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

  it('keeps the map points query disabled while list mode is active', async () => {
    await act(async () => {
      create(
        <HomeScreen
          navigation={{
            navigate: jest.fn(),
            push: jest.fn(),
            setParams: jest.fn(),
          } as never}
          route={{
            params: undefined,
          } as never}
        />,
      );
    });

    expect(mockedHomeFeedMapQueryKeys.points).toHaveBeenCalledWith(
      'user-1',
      'mine',
      'visits',
      'created',
      '',
    );
    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        queryKey: [
          'feature',
          'homeFeedMap',
          'user',
          'user-1',
          'points',
          'mine',
          'visits',
          'created',
          '',
        ],
      }),
    );
  });

  it('switches from the list feed to the map view', async () => {
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
            params: undefined,
          } as never}
        />,
      );
    });

    expect(renderer?.root.findAllByType('FlatList')).toHaveLength(1);

    await act(async () => {
      renderer?.root.findByType('FeedHeaderControls').props.onViewModeChange('map');
    });

    expect(renderer?.root.findAllByType('FlatList')).toHaveLength(0);
    expect(renderer?.root.findAllByType('HomeFeedMapView')).toHaveLength(1);
    expect(renderer?.root.findByType('HomeFeedMapView').props.points).toEqual([]);
  });
});
