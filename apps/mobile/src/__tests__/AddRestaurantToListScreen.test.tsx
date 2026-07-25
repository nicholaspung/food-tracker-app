import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import type { RestaurantListVisitedRestaurantCandidate } from '../features';
import { useQueryListState } from '../hooks/useListQueryState';
import { AddRestaurantToListScreen } from '../screens/AddRestaurantToListScreen';

const mockReact = React;

const mockTheme = {
  colors: {
    background: {
      inverse: 'black',
      surface: 'white',
    },
    border: {
      subtle: 'silver',
      warning: 'orange',
    },
    fill: {
      brand: 'orange',
    },
    status: {
      warningBg: 'moccasin',
    },
    text: {
      inverse: 'white',
      muted: 'gray',
      primary: 'black',
      secondary: 'dimgray',
      warning: 'darkorange',
    },
  },
  radii: {
    md: 8,
    pill: 999,
  },
  spacing: {
    md: 16,
    sm: 12,
    xs: 8,
    xxs: 4,
  },
  typography: {
    captionStrong: {},
  },
};

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('react-native', () => {
  const actual = jest.requireActual<typeof import('react-native')>('react-native');
  const react = jest.requireActual<typeof import('react')>('react');
  const mockedReactNative = Object.create(actual) as any;

  const MockFlatList = ({
    data = [],
    renderItem,
    ListEmptyComponent,
    ...props
  }: Record<string, any>) =>
    react.createElement(
      'FlatList',
      props,
      Array.isArray(data) && data.length > 0 && typeof renderItem === 'function'
        ? data.map((item, index) =>
            react.createElement(
              react.Fragment,
              { key: props.keyExtractor?.(item, index) ?? index },
              renderItem({ item, index }),
            ),
          )
        : typeof ListEmptyComponent === 'function'
          ? react.createElement(ListEmptyComponent)
          : ListEmptyComponent,
    );

  Object.defineProperty(mockedReactNative, 'FlatList', {
    configurable: true,
    value: MockFlatList,
  });

  return mockedReactNative;
});

jest.mock('../components/shared', () => ({
  CachedRemoteImage: (props: Record<string, unknown>) =>
    mockReact.createElement('CachedRemoteImage', props),
  EmptyState: (props: Record<string, unknown>) =>
    mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) =>
    mockReact.createElement('ErrorState', props),
  FeatureFormScreenScaffold: ({
    children,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('FeatureFormScreenScaffold', props, children),
  PhotoViewerModal: (props: Record<string, unknown>) =>
    mockReact.createElement('PhotoViewerModal', props),
  RatingPill: (props: Record<string, unknown>) =>
    mockReact.createElement('RatingPill', props),
  Skeleton: (props: Record<string, unknown>) =>
    mockReact.createElement('Skeleton', props),
  StatusPill: (props: Record<string, unknown>) =>
    mockReact.createElement('StatusPill', props),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) =>
    mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../features', () => ({
  getRestaurantListCandidateRestaurants: jest.fn(),
  listRestaurantListCandidateFoodItemPhotos: jest.fn(),
  restaurantListQueryKeys: {
    candidateFoodItemPhotos: (foodItemId: string) => [
      'feature',
      'restaurantLists',
      'candidateFoodItemPhotos',
      foodItemId,
    ],
    candidateRestaurantPages: (listId: string, searchQuery: string) => [
      'feature',
      'restaurantLists',
      listId,
      searchQuery,
    ],
  },
}));

jest.mock('../features/store/useRestaurantListWrites', () => ({
  useRestaurantListWrites: () => ({
    addRestaurant: jest.fn(),
  }),
}));

jest.mock('../hooks/useDebouncedValue', () => ({
  useDebouncedValue: (value: string) => value,
}));

jest.mock('../hooks/useListQueryState', () => ({
  useQueryListState: jest.fn(),
}));

jest.mock('../lib/dateFormatting', () => ({
  formatDisplayDate: (value: string) => value,
}));

jest.mock('../lib/photoUrls', () => ({
  buildPhotoFileUrl: (_record: unknown, thumb?: string) =>
    thumb ? 'photo-thumbnail-url' : 'photo-viewer-url',
  buildPhotoViewerState: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: () => ({
    isOnline: true,
  }),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (createStyles: (theme: typeof mockTheme) => Record<string, unknown>) => () =>
      createStyles(mockTheme),
  useTheme: () => mockTheme,
}));

jest.mock('../ui', () => ({
  Card: ({
    children,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) =>
    mockReact.createElement('Input', props),
  Text: ({
    children,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../ui/AppIcon', () => ({
  Ionicons: (props: Record<string, unknown>) =>
    mockReact.createElement('Ionicons', props),
}));

const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<
  typeof useInfiniteQuery
>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<
  typeof useQueryClient
>;
const mockedUseQueryListState = useQueryListState as jest.MockedFunction<
  typeof useQueryListState
>;

const restaurant: RestaurantListVisitedRestaurantCandidate = {
  alreadyInList: true,
  foodItems: [
    {
      id: 'food-selectable',
      name: 'Spicy Miso Ramen',
      notes: 'Rich broth',
      rating: 4.5,
      visitedAt: '2026-07-20T18:00:00.000Z',
    },
    {
      id: 'food-added',
      name: 'Pork Gyoza',
      rating: 4,
      visitedAt: '2026-07-20T18:00:00.000Z',
    },
    {
      id: 'food-photo',
      name: 'Matcha Soft Serve',
      photoCount: 1,
      photoPreview: {
        id: 'photo-1',
        photo: 'matcha.jpg',
      },
      rating: 5,
      visitedAt: '2026-07-20T18:00:00.000Z',
    },
  ],
  id: 'restaurant-1',
  itemCount: 3,
  linkedFoodItemIds: ['food-added'],
  name: 'Ramen House',
  visitDates: ['2026-07-20T18:00:00.000Z'],
};

describe('AddRestaurantToListScreen rated-item accessibility', () => {
  const queryClient = {
    fetchQuery: jest.fn(),
  };
  const navigation = {
    canGoBack: jest.fn(() => true),
    goBack: jest.fn(),
    navigate: jest.fn(),
  };
  const route = {
    key: 'AddRestaurantToList-list-1',
    name: 'AddRestaurantToList',
    params: {
      listId: 'list-1',
    },
  };

  let renderer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.fetchQuery.mockResolvedValue([]);
    mockedUseQueryClient.mockReturnValue(
      queryClient as unknown as ReturnType<typeof useQueryClient>,
    );
    mockedUseInfiniteQuery.mockReturnValue({
      data: {
        pageParams: [1],
        pages: [
          {
            hasNextPage: false,
            items: [restaurant],
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
      isSuccess: true,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useInfiniteQuery>);
    mockedUseQueryListState.mockImplementation(({ data }) => ({
      hasBlockingError: false,
      hasItems: (data?.length ?? 0) > 0,
      hasRefreshError: false,
      hasResolvedData: true,
      isLoading: false,
      items: data ?? [],
      totalItems: data?.length ?? 0,
    }));

    act(() => {
      renderer = create(
        <AddRestaurantToListScreen
          navigation={navigation as never}
          route={route as never}
        />,
      );
    });
    act(() => {
      renderer.root
        .findByProps({ testID: 'add-restaurant-option-0' })
        .props.onPress();
    });
  });

  afterEach(() => {
    act(() => {
      renderer.unmount();
    });
  });

  it('exposes unselected, selected, and already-added item states', () => {
    const selectableRow = renderer.root.findByProps({
      testID: 'add-restaurant-food-item-food-selectable',
    });
    const alreadyAddedRow = renderer.root.findByProps({
      testID: 'add-restaurant-food-item-food-added',
    });

    expect(selectableRow.props.accessibilityLabel).toBe('Spicy Miso Ramen');
    expect(selectableRow.props.accessibilityHint).toBeUndefined();
    expect(selectableRow.props.accessibilityState).toEqual({
      disabled: false,
      selected: false,
    });
    expect(alreadyAddedRow.props.accessibilityLabel).toBe('Pork Gyoza');
    expect(alreadyAddedRow.props.accessibilityHint).toBe(
      'Already in this Restaurant List.',
    );
    expect(alreadyAddedRow.props.accessibilityState).toEqual({
      disabled: true,
      selected: false,
    });

    act(() => {
      selectableRow.props.onPress();
    });

    expect(
      renderer.root.findByProps({
        testID: 'add-restaurant-food-item-food-selectable',
      }).props.accessibilityState,
    ).toEqual({
      disabled: false,
      selected: true,
    });
  });

  it('keeps the photo preview separately actionable without selecting its row', async () => {
    const photoPreview = renderer.root.findByProps({
      accessibilityLabel: 'View photos for Matcha Soft Serve',
    });
    const selectionTarget = renderer.root.findByProps({
      testID: 'add-restaurant-food-item-food-photo',
    });

    expect(
      selectionTarget.findAllByProps({
        accessibilityLabel: 'View photos for Matcha Soft Serve',
      }),
    ).toHaveLength(0);

    await act(async () => {
      await photoPreview.props.onPress();
    });

    expect(queryClient.fetchQuery).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findByProps({
        testID: 'add-restaurant-food-item-food-photo',
      }).props.accessibilityState,
    ).toEqual({
      disabled: false,
      selected: false,
    });
    expect(renderer.root.findByType('PhotoViewerModal').props.visible).toBe(
      true,
    );
  });
});
