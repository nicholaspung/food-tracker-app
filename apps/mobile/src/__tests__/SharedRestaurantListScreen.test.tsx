import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery } from '@tanstack/react-query';

import {
  getSharedRestaurantList,
  restaurantListQueryKeys,
  saveSharedRestaurantListRecommendation,
} from '../features';
import { useAuth } from '../providers/AuthProvider';
import { SharedRestaurantListScreen } from '../screens/SharedRestaurantListScreen';

const mockReact = React;

const mockTheme = {
  colors: {
    background: {
      surface: 'white',
    },
    border: {
      subtle: 'silver',
    },
    text: {
      muted: 'gray',
      primary: 'black',
    },
  },
  spacing: {
    md: 16,
    sm: 12,
    xs: 8,
  },
};

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
}));

jest.mock('react-native', () => {
  const actual = jest.requireActual<typeof import('react-native')>('react-native');
  const react = jest.requireActual<typeof import('react')>('react');
  const mockedReactNative = Object.create(actual) as any;

  mockedReactNative.FlatList = ({
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

  return mockedReactNative;
});

jest.mock('../components/shared', () => ({
  AuthBrandMark: (props: Record<string, unknown>) => mockReact.createElement('AuthBrandMark', props),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  FeatureDetailScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureDetailScreenScaffold', props, children),
  PhotoViewerModal: (props: Record<string, unknown>) =>
    mockReact.createElement('PhotoViewerModal', props),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../config/env', () => ({
  env: {
    iosAppStoreUrl: 'https://app.example',
    marketingUrl: 'https://marketing.example',
  },
}));

jest.mock('../features', () => ({
  getSharedRestaurantList: jest.fn(),
  restaurantListQueryKeys: {
    sharedPages: (shareToken: string) => ['feature', 'restaurantLists', 'shared', shareToken, 'pages'],
  },
  saveSharedRestaurantListRecommendation: jest.fn(),
}));

jest.mock('../lib/pendingAuthRedirect', () => ({
  savePendingAuthRedirect: jest.fn(),
}));

jest.mock('../lib/photoUrls', () => ({
  buildPhotoFileUrl: jest.fn(() => 'photo-url'),
  buildPhotoThumbnailUrl: jest.fn(() => 'photo-thumbnail-url'),
}));

jest.mock('../observability/productAnalytics', () => ({
  trackProductEvent: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../screens/listDetail/ListDetailBookmarkedItemRow', () => ({
  ListDetailBookmarkedItemRow: (props: Record<string, unknown>) =>
    mockReact.createElement('ListDetailBookmarkedItemRow', props),
}));

jest.mock('../screens/listDetail/ListDetailRestaurantRecommendationGroupCard', () => ({
  ListDetailRestaurantRecommendationGroupCard: ({
    items,
    renderItem,
    ...props
  }: Record<string, unknown> & {
    items?: unknown[];
    renderItem?: (item: unknown, index: number) => React.ReactNode;
  }) =>
    mockReact.createElement(
      'ListDetailRestaurantRecommendationGroupCard',
      props,
      ...(items ?? []).map((item, index) =>
        mockReact.createElement(mockReact.Fragment, { key: index }, renderItem?.(item, index)),
      ),
    ),
}));

jest.mock('../theme', () => ({
  createThemedStyles: (createStyles: (theme: typeof mockTheme) => Record<string, unknown>) =>
    () => createStyles(mockTheme),
}));

jest.mock('../ui', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<typeof useInfiniteQuery>;
const mockedGetSharedRestaurantList = getSharedRestaurantList as jest.MockedFunction<
  typeof getSharedRestaurantList
>;
const mockedSaveSharedRestaurantListRecommendation =
  saveSharedRestaurantListRecommendation as jest.MockedFunction<
    typeof saveSharedRestaurantListRecommendation
  >;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe('SharedRestaurantListScreen', () => {
  const navigation = {
    canGoBack: jest.fn(() => true),
    goBack: jest.fn(),
    navigate: jest.fn(),
  };
  const route = {
    key: 'SharedRestaurantList-share-token-1',
    name: 'SharedRestaurantList',
    params: {
      shareToken: 'share-token-1',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSharedRestaurantList.mockResolvedValue({
      bookmarkState: {
        savedListIdsByBookmarkLookupId: {},
      },
      hasNextPage: false,
      items: [],
      list: {
        id: 'list-1',
        name: 'Creator Picks',
        ownerName: 'Owner',
        restaurantCount: 1,
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      page: 1,
      pageSize: 20,
      photoPreviews: [],
      totalItems: 1,
      totalPages: 1,
      viewerLists: [],
    });
    mockedSaveSharedRestaurantListRecommendation.mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
    } as ReturnType<typeof useAuth>);
    mockedUseInfiniteQuery.mockReturnValue({
      data: {
        pageParams: [1],
        pages: [
          {
            bookmarkState: {
              savedListIdsByBookmarkLookupId: {},
            },
            hasNextPage: false,
            items: [
              {
                id: 'list-item-1',
                listId: 'list-1',
                restaurantId: 'restaurant-1',
                restaurantName: 'Cafe',
                position: 1,
                bookmarkedItems: [
                  {
                    id: 'food-1',
                    listItemId: 'list-item-1',
                    name: 'Noodles',
                    rating: 5,
                    restaurantId: 'restaurant-1',
                    sourceUserId: 'source-user-1',
                    sourceUserName: 'Mina',
                  },
                ],
                createdAt: '2026-04-01T00:00:00.000Z',
              },
            ],
            list: {
              id: 'list-1',
              name: 'Creator Picks',
              ownerName: 'Owner',
              restaurantCount: 1,
              updatedAt: '2026-04-01T00:00:00.000Z',
            },
            page: 1,
            pageSize: 20,
            photoPreviews: [],
            totalItems: 1,
            totalPages: 1,
            viewerLists: [
              {
                createdAt: '2026-04-01T00:00:00.000Z',
                id: 'default-list-1',
                isDefault: true,
                name: 'Want to Try',
                updatedAt: '2026-04-01T00:00:00.000Z',
                userId: 'viewer-1',
                visibility: 'private',
              },
            ],
          },
        ],
      },
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof useInfiniteQuery>);
  });

  it('saves shared recommendations with source list item attribution', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <SharedRestaurantListScreen navigation={navigation as any} route={route as any} />,
      );
    });

    expect(useInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: restaurantListQueryKeys.sharedPages('share-token-1'),
      }),
    );

    const itemRow = renderer.root.findByType('ListDetailBookmarkedItemRow');
    expect(itemRow.props.item.sourceUserId).toBe('source-user-1');
    expect(itemRow.props.item.sourceUserName).toBe('Mina');

    await act(async () => {
      itemRow.props.onSave(itemRow.props.item);
      await Promise.resolve();
    });

    expect(mockedSaveSharedRestaurantListRecommendation).toHaveBeenCalledWith({
      shareToken: 'share-token-1',
      restaurantId: 'restaurant-1',
      foodItemId: 'food-1',
      sourceListItemId: 'list-item-1',
      targetListIds: ['default-list-1'],
    });
  });
});
