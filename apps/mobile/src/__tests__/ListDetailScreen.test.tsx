import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Share } from 'react-native';

import {
  buildPocketBaseFileUrl,
  getRestaurantListDetail,
  getOrCreateRestaurantListShareLink,
  invalidateRestaurantListContentQueries,
  listRestaurantListsPage,
  regenerateRestaurantListShareLink,
  useRestaurantListWrites,
} from '../features';
import type { RestaurantListDetailRecord } from '../features/store/featureStore';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useWriteTelemetry } from '../features/store/useWriteTelemetry';
import type { RestaurantListItemRecord, RestaurantListRecord } from '../features/models';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { ListDetailScreen } from '../screens/ListDetailScreen';
import { ListDetailBookmarkedItemRow } from '../screens/listDetail/ListDetailBookmarkedItemRow';

const mockReact = React;

const mockTheme = {
  colors: {
    text: {
      danger: 'red',
      info: 'royalblue',
      inverse: 'white',
      muted: 'gray',
      primary: 'black',
      secondary: 'slategray',
      success: 'green',
    },
    background: {
      inverse: 'black',
      muted: 'whitesmoke',
      surface: 'white',
    },
    border: {
      default: 'lightgray',
      info: 'lightblue',
      strong: 'darkgray',
      subtle: 'silver',
    },
    button: {
      primaryBg: 'navy',
      primaryPressed: 'midnightblue',
      primaryText: 'white',
    },
    status: {
      dangerBg: 'mistyrose',
      infoBg: 'aliceblue',
      successBg: 'mintcream',
    },
    fill: {
      brand: 'navy',
    },
  },
  spacing: {
    md: 16,
    sm: 12,
    xs: 8,
    xxs: 4,
  },
  sizes: {
    secondaryButtonHeight: 44,
  },
  radii: {
    lg: 16,
    md: 12,
    pill: 999,
    sm: 8,
  },
  typography: {
    bodyLgBold: { fontSize: 18, fontWeight: '700' },
    bodyLgMedium: { fontSize: 18, fontWeight: '500' },
    bodyLgTightBold: { fontSize: 18, fontWeight: '700' },
    bodyLgTightMedium: { fontSize: 18, fontWeight: '500' },
    bodyMd: { fontSize: 16 },
    bodySm: { fontSize: 12 },
    bodySmTight: { fontSize: 12 },
    bodySmTightBold: { fontSize: 12, fontWeight: '700' },
    bodySmTightSemiBold: { fontSize: 12, fontWeight: '600' },
    label: { fontSize: 11 },
    labelMdBold: { fontSize: 13, fontWeight: '700' },
    titleSm: { fontSize: 20, fontWeight: '700' },
  },
};

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('react-native', () => {
  const actual = jest.requireActual<typeof import('react-native')>('react-native');
  const react = jest.requireActual<typeof import('react')>('react');
  const renderListElement = (element: unknown) => {
    if (!element) {
      return null;
    }
    if (react.isValidElement(element)) {
      return element;
    }
    if (typeof element === 'function') {
      return element();
    }
    return null;
  };

  const mockedReactNative = Object.create(actual) as any;
  mockedReactNative.FlatList = ({
    data = [],
    renderItem,
    ListEmptyComponent,
    ListFooterComponent,
    ListHeaderComponent,
    ...props
  }: Record<string, any>) => {
    return react.createElement(
      'FlatList',
      props,
      renderListElement(ListHeaderComponent),
      Array.isArray(data) && data.length > 0 && typeof renderItem === 'function'
        ? data.map((item, index) =>
            react.createElement(
              react.Fragment,
              { key: props.keyExtractor?.(item, index) ?? index },
              renderItem({ item, index }),
            ),
          )
        : renderListElement(ListEmptyComponent),
      renderListElement(ListFooterComponent),
    );
  };

  return mockedReactNative;
});

jest.mock('../features', () => ({
  buildRecommendationBookmarkSourceFields: jest.fn((handoff) => ({
    foodItemId: handoff.sourceFoodItemId,
    ...(handoff.sourceMenuItemId ? { menuItemId: handoff.sourceMenuItemId } : {}),
    ...(handoff.sourceListId ? { sourceListId: handoff.sourceListId } : {}),
    ...(handoff.sourceListItemId ? { sourceListItemId: handoff.sourceListItemId } : {}),
    ...(handoff.sourceUserId ? { sourceUserId: handoff.sourceUserId } : {}),
  })),
  buildPocketBaseFileUrl: jest.fn(() => 'photo-url'),
  createDefaultRestaurantList: jest.fn(),
  disableRestaurantListShareLink: jest.fn(),
  getRestaurantListDetail: jest.fn(),
  getOrCreateRestaurantListShareLink: jest.fn(),
  invalidateRestaurantListContentQueries: jest.fn(),
  invalidateRestaurantListSaveTargetQueries: jest.fn(),
  listRestaurantListsPage: jest.fn(),
  moveRestaurantListRestaurant: jest.fn(),
  regenerateRestaurantListShareLink: jest.fn(),
  restaurantListQueryKeys: {
    root: ['feature', 'restaurantLists'],
    detail: (listId: string) => ['feature', 'restaurantListDetail', listId],
    detailPages: (listId: string) => ['feature', 'restaurantListDetail', listId, 'pages'],
    paginated: (scope: string, searchQuery: string) =>
      ['feature', 'restaurantLists', scope, 'paginated', searchQuery],
  },
  saveRestaurantFoodItemToList: jest.fn(),
  useRestaurantListWrites: jest.fn(),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  buildPocketBaseFileUrl: jest.fn(() => 'photo-url'),
}));

jest.mock('../features/store/useFeatureOutboxQueue', () => ({
  useFeatureOutboxQueue: jest.fn(),
}));

jest.mock('../features/store/useWriteTelemetry', () => ({
  useWriteTelemetry: jest.fn(),
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
  createThemedStyles: (createStyles: (theme: typeof mockTheme) => Record<string, unknown>) =>
    () => createStyles(mockTheme),
  useTheme: () => mockTheme,
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Modal: ({
    children,
    visible,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode; visible?: boolean }) =>
    visible ? mockReact.createElement('Modal', props, children) : null,
  ListItem: ({
    description,
    trailing,
    title,
    ...props
  }: Record<string, unknown> & {
    description?: React.ReactNode;
    title?: string;
    trailing?: React.ReactNode;
  }) =>
    mockReact.createElement(
      'ListItem',
      { title, ...props },
      title ? mockReact.createElement('Text', {}, title) : null,
      description,
      trailing,
    ),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared', () => ({
  CachedRemoteImage: (props: Record<string, unknown>) => mockReact.createElement('CachedRemoteImage', props),
  ConfirmDestructiveModal: ({
    children,
    visible,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode; visible?: boolean }) =>
    mockReact.createElement('ConfirmDestructiveModal', { visible, ...props }, children),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  ExpandableText: jest.requireActual('../components/shared/ExpandableText').ExpandableText,
  FeatureDetailScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureDetailScreenScaffold', props, children),
  FoodItemRatingRecordCard: ({
    itemName,
    onLongPress,
    photoEntries,
    photoTestID,
    rows,
  }: Record<string, unknown> & {
    itemName?: string;
    onLongPress?: () => void;
    photoEntries?: { previewUrl?: string; uri?: string }[];
    photoTestID?: string;
    rows?: { actions?: React.ReactNode; id: string }[];
  }) =>
    mockReact.createElement(
      'FoodItemRatingRecordCard',
      { itemName, onLongPress },
      photoEntries && photoEntries.length > 0
        ? mockReact.createElement(
            'RecordPhotoThumbnailButton',
            {
              entries: photoEntries,
              testID: photoTestID,
            },
            photoEntries[0].previewUrl || photoEntries[0].uri
              ? mockReact.createElement('CachedRemoteImage', {
                  uri: photoEntries[0].previewUrl ?? photoEntries[0].uri,
                })
              : null,
          )
        : null,
      ...(rows ?? []).map((row) =>
        mockReact.createElement('FoodItemRatingRecordRow', { key: row.id }, row.actions),
      ),
    ),
  LoadingState: (props: Record<string, unknown>) => mockReact.createElement('LoadingState', props),
  PhotoViewerModal: () => null,
  RatingPill: () => null,
  RecordPhotoThumbnailButton: ({
    entries,
    testID,
  }: Record<string, unknown> & {
    entries?: { previewUrl?: string; uri?: string }[];
    testID?: string;
  }) =>
    mockReact.createElement(
      'RecordPhotoThumbnailButton',
      { testID },
      entries?.[0]?.previewUrl || entries?.[0]?.uri
        ? mockReact.createElement('CachedRemoteImage', {
            uri: entries[0].previewUrl ?? entries[0].uri,
          })
        : null,
    ),
  SectionHeader: (props: Record<string, unknown>) => mockReact.createElement('SectionHeader', props),
  SegmentedControl: (props: Record<string, unknown>) =>
    mockReact.createElement('SegmentedControl', props),
  Skeleton: () => null,
}));

jest.mock('../components/maps', () => ({
  RestaurantMapView: (props: Record<string, unknown>) =>
    mockReact.createElement('RestaurantMapView', props),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: () => null,
}));

const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<typeof useInfiniteQuery>;
const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedBuildPocketBaseFileUrl = buildPocketBaseFileUrl as jest.MockedFunction<typeof buildPocketBaseFileUrl>;
const mockedGetRestaurantListDetail = getRestaurantListDetail as jest.MockedFunction<typeof getRestaurantListDetail>;
const mockedListRestaurantListsPage = listRestaurantListsPage as jest.MockedFunction<typeof listRestaurantListsPage>;
const mockedGetOrCreateRestaurantListShareLink = getOrCreateRestaurantListShareLink as jest.MockedFunction<
  typeof getOrCreateRestaurantListShareLink
>;
const mockedInvalidateRestaurantListContentQueries = invalidateRestaurantListContentQueries as jest.MockedFunction<
  typeof invalidateRestaurantListContentQueries
>;
const mockedRegenerateRestaurantListShareLink = regenerateRestaurantListShareLink as jest.MockedFunction<
  typeof regenerateRestaurantListShareLink
>;
const mockedUseRestaurantListWrites = useRestaurantListWrites as jest.MockedFunction<typeof useRestaurantListWrites>;
const mockedUseFeatureOutboxQueue = useFeatureOutboxQueue as jest.MockedFunction<typeof useFeatureOutboxQueue>;
const mockedUseWriteTelemetry = useWriteTelemetry as jest.MockedFunction<typeof useWriteTelemetry>;
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
  typeof trackObservabilityEvent
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;

function buildList(overrides: Partial<RestaurantListRecord> = {}): RestaurantListRecord {
  return {
    id: 'list_1',
    name: 'Favorites',
    visibility: 'friends',
    userId: 'owner_1',
    ownerName: 'Owner',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function buildListItem(overrides: Partial<RestaurantListItemRecord> = {}): RestaurantListItemRecord {
  return {
    id: 'item_1',
    listId: 'list_1',
    restaurantId: 'restaurant_1',
    restaurantName: 'Test Restaurant',
    restaurantCity: 'San Francisco',
    restaurantCuisineType: 'Fire',
    restaurantVisibility: 'friends',
    position: 0,
    bookmarkedItems: [],
    createdAt: '2026-01-03T00:00:00.000Z',
    ...overrides,
  };
}

function buildDetail(overrides: Partial<RestaurantListDetailRecord> = {}): RestaurantListDetailRecord {
  return {
    list: buildList(),
    items: [buildListItem()],
    bookmarkState: {
      savedListIdsByBookmarkLookupId: {},
    },
    photoPreviews: [],
    viewerLists: [],
    ...overrides,
  };
}

function buildQueryResult(data = buildDetail()) {
  mockedUseInfiniteQuery.mockReturnValue(buildInfiniteQueryResult(data));
  return {
    data,
    isError: false,
    isFetching: false,
    isLoading: false,
    isRefetching: false,
    isSuccess: true,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useQuery>;
}

function buildInfiniteQueryResult(data = buildDetail()) {
  return {
    data: {
      pageParams: [1],
      pages: [data],
    },
    fetchNextPage: jest.fn(),
    hasNextPage: Boolean(data.hasNextPage),
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading: false,
    isRefetching: false,
    isSuccess: true,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useInfiniteQuery>;
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

function findExactTextNodes(root: any, value: string) {
  return root.findAll((node: any) => node.type === 'Text' && node.props.children === value);
}

function findExactTextNode(root: any, value: string) {
  return root.find((node: any) => node.type === 'Text' && node.props.children === value);
}

function flattenTextChildren(children: unknown): string {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(flattenTextChildren).join('');
  }
  if (React.isValidElement(children)) {
    return flattenTextChildren((children.props as { children?: unknown }).children);
  }
  return '';
}

function findTextNodeContaining(root: any, value: string) {
  return root.find(
    (node: any) => node.type === 'Text' && flattenTextChildren(node.props.children).includes(value),
  );
}

function flattenStyle(style: any): Record<string, unknown> {
  if (!style) {
    return {};
  }

  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (accumulator, entry) => ({ ...accumulator, ...flattenStyle(entry) }),
      {},
    );
  }

  return style;
}

function findRightAccessoryElementByTestID(root: any, testID: string): any {
  const scaffold = root.findByType('FeatureDetailScreenScaffold');

  function visit(element: React.ReactNode): any {
    if (!React.isValidElement(element)) {
      return null;
    }

    if ((element.props as { testID?: string }).testID === testID) {
      return element;
    }

    const children = React.Children.toArray((element.props as { children?: React.ReactNode }).children);
    for (const child of children) {
      const match = visit(child);
      if (match) {
        return match;
      }
    }

    return null;
  }

  const match = visit(scaffold.props.rightAccessory);
  if (!match) {
    throw new Error(`No right accessory found with testID ${testID}`);
  }

  return match;
}

describe('ListDetailScreen', () => {
  const navigation = {
    canGoBack: jest.fn(() => true),
    goBack: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
  };
  const queryClient = {
    invalidateQueries: jest.fn(),
  };
  const restaurantListWrites = {
    addRestaurant: jest.fn(),
    createDefaultRestaurantList: jest.fn(),
    createRestaurantList: jest.fn(),
    deleteRestaurantList: jest.fn(),
    errorMessage: null,
    isSubmitting: false,
    reorderRestaurant: jest.fn(),
    removeBookmarkFromDefaultList: jest.fn(),
    removeRestaurantListSourceRating: jest.fn(),
    removeRestaurantListUserRating: jest.fn(),
    saveBookmarkToDefaultList: jest.fn(),
    saveBookmarkToLists: jest.fn(),
    saveRestaurantToDefaultList: jest.fn(),
    setErrorMessage: jest.fn(),
    updateRestaurantList: jest.fn(),
  };

  const route = {
    key: 'ListDetail-list_1',
    name: 'ListDetail',
    params: {
      listId: 'list_1',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedBuildPocketBaseFileUrl.mockReturnValue('photo-url');
    mockedUseInfiniteQuery.mockReturnValue(buildInfiniteQueryResult());
    mockedUseQuery.mockReturnValue(buildQueryResult());
    mockedUseQueryClient.mockReturnValue(queryClient as unknown as ReturnType<typeof useQueryClient>);
    mockedGetRestaurantListDetail.mockResolvedValue(buildDetail());
    mockedListRestaurantListsPage.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 100,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
    });
    mockedGetOrCreateRestaurantListShareLink.mockResolvedValue({
      listId: 'list_1',
      path: '/lists/shared/share-token-123',
      shareToken: 'share-token-123',
      url: 'https://server.example/lists/shared/share-token-123',
    });
    mockedInvalidateRestaurantListContentQueries.mockResolvedValue(undefined);
    mockedRegenerateRestaurantListShareLink.mockResolvedValue({
      listId: 'list_1',
      path: '/lists/shared/regenerated-share-token',
      shareToken: 'regenerated-share-token',
      url: 'https://server.example/lists/shared/regenerated-share-token',
    });
    jest.spyOn(Share, 'share').mockResolvedValue({
      action: Share.sharedAction,
    } as Awaited<ReturnType<typeof Share.share>>);
    restaurantListWrites.deleteRestaurantList.mockResolvedValue({ status: 'completed' });
    restaurantListWrites.reorderRestaurant.mockResolvedValue({
      result: [],
      status: 'completed',
    });
    restaurantListWrites.addRestaurant.mockResolvedValue({
      result: [],
      status: 'completed',
    });
    restaurantListWrites.removeRestaurantListSourceRating.mockResolvedValue({
      result: [],
      status: 'completed',
    });
    restaurantListWrites.removeRestaurantListUserRating.mockResolvedValue({
      result: [],
      status: 'completed',
    });
    restaurantListWrites.removeBookmarkFromDefaultList.mockResolvedValue({
      result: [],
      status: 'completed',
    });
    restaurantListWrites.saveBookmarkToDefaultList.mockResolvedValue({
      result: [],
      status: 'completed',
    });
    restaurantListWrites.saveBookmarkToLists.mockResolvedValue({
      result: [],
      status: 'completed',
    });
    restaurantListWrites.saveRestaurantToDefaultList.mockResolvedValue({
      result: [],
      status: 'completed',
    });
    mockedUseRestaurantListWrites.mockReturnValue(restaurantListWrites);
    mockedUseFeatureOutboxQueue.mockReturnValue(jest.fn().mockResolvedValue(undefined));
    mockedUseWriteTelemetry.mockReturnValue(jest.fn().mockResolvedValue(undefined));
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'viewer_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as ReturnType<typeof useConnectivity>);
    mockedTrackObservabilityEvent.mockImplementation(() => undefined);
  });

  it('renders location and cuisine as one wrapping metadata string when both values exist', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    expect(findExactTextNodes(renderer.root, 'San Francisco • Fire')).toHaveLength(1);
    expect(findExactTextNodes(renderer.root, '• Fire')).toHaveLength(0);
    expect(findExactTextNodes(renderer.root, 'Fire')).toHaveLength(0);
  });

  it('does not depend on onTextLayout to render the combined metadata label', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    const primaryMetaText = findExactTextNode(renderer.root, 'San Francisco • Fire');

    expect(primaryMetaText.props.onTextLayout).toBeUndefined();
    expect(findExactTextNodes(renderer.root, 'San Francisco • Fire')).toHaveLength(1);
  });

  it('anchors the icon to the top of the wrapping metadata block', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    const locationIcon = renderer.root.findByProps({ name: 'location-outline' });
    const locationRowStyle = flattenStyle(locationIcon.parent.props.style);
    const locationIconStyle = flattenStyle(locationIcon.props.style);

    expect(locationRowStyle.alignItems).toBe('flex-start');
    expect(locationIconStyle.marginTop).toBe(1);
  });

  it('shares list links once in the message payload', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          list: buildList({
            name: 'Random',
            shareEnabled: true,
          }),
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      findRightAccessoryElementByTestID(renderer.root, 'list-detail-share-button').props.onPress();
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: 'share-list-modal' }).props.primaryAction.onPress();
    });

    expect(Share.share).toHaveBeenCalledWith({
      message: 'View my Yummy Recs list "Random": http://localhost:8081/lists/shared/share-token-123',
    });
  });

  it('renders single-value metadata without a bullet and preserves the fallback label', async () => {
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          items: [
            buildListItem({
              id: 'item_1',
              restaurantId: 'restaurant_1',
              restaurantName: 'Cuisine Only',
              restaurantCity: undefined,
              restaurantCuisineType: 'Thai',
            }),
            buildListItem({
              id: 'item_2',
              restaurantId: 'restaurant_2',
              restaurantName: 'Fallback',
              restaurantCity: undefined,
              restaurantCuisineType: undefined,
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    expect(findExactTextNodes(renderer.root, 'Thai')).toHaveLength(1);
    expect(findExactTextNodes(renderer.root, '• Thai')).toHaveLength(0);
    expect(findExactTextNodes(renderer.root, 'Location not set')).toHaveLength(1);
  });

  it('renders friend bookmark photos from matching photo previews', async () => {
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  sourceUserId: 'owner_1',
                  sourceUserName: 'Owner',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
          photoPreviews: [
            {
              id: 'photo_1',
              food_item: 'food_item_1',
              user: 'owner_1',
              photo: 'ramen.jpg',
              collectionId: 'visit_photos_collection',
              collectionName: 'visit_photos',
              created: '2026-01-03T00:00:00.000Z',
              ownerName: 'Owner',
            },
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    expect(renderer.root.findByProps({ testID: 'list-detail-friend-photo-button-0-0' })).toBeTruthy();
    expect(renderer.root.findByType('CachedRemoteImage').props.uri).toBe('photo-url');
  });

  it('renders owner item photos from matching photo previews', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
          photoPreviews: [
            {
              id: 'photo_1',
              food_item: 'food_item_1',
              user: 'owner_1',
              photo: 'ramen.jpg',
              collectionId: 'visit_photos_collection',
              collectionName: 'visit_photos',
              created: '2026-01-03T00:00:00.000Z',
              ownerName: 'Owner',
            },
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    expect(renderer.root.findByProps({ testID: 'list-detail-photo-button-0-0' })).toBeTruthy();
    expect(renderer.root.findByType('CachedRemoteImage').props.uri).toBe('photo-url');
  });

  it('stages owner item deletion in the destructive confirmation modal', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  restaurantId: 'restaurant_food_1',
                  sourceUserId: 'friend_1',
                  sourceUserName: 'Friend',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'remove-source-rating-item_1-food_item_1' }).props.onPress();
    });

    const modal = renderer.root.findByProps({ testID: 'delete-list-item-confirmation-modal' });

    expect(modal.props.title).toBe('Delete Bookmarked Item?');
    expect(modal.props.description).toBe('Delete "Spicy Ramen" from this list?');
  });

  it('replaces the deleted list detail route after online owner list deletion', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    const queryResult = buildQueryResult();
    mockedUseQuery.mockReturnValue(queryResult);

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      findRightAccessoryElementByTestID(renderer.root, 'list-detail-delete-button').props.onPress();
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: 'delete-list-confirmation-modal' }).props.onConfirm();
    });

    expect(restaurantListWrites.deleteRestaurantList).toHaveBeenCalledWith({ listId: 'list_1' });
    expect(navigation.replace).toHaveBeenCalledWith('Lists');
    expect(navigation.navigate).not.toHaveBeenCalledWith('Lists');
  });

  it('does not render list not found while redirecting after online list deletion', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    const queryResult = buildQueryResult();
    mockedUseQuery.mockReturnValue(queryResult);

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      findRightAccessoryElementByTestID(renderer.root, 'list-detail-delete-button').props.onPress();
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: 'delete-list-confirmation-modal' }).props.onConfirm();
    });

    queryResult.data = undefined;

    await act(async () => {
      renderer.update(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    const notFoundStates = renderer.root.findAll(
      (node: any) => node.type === 'EmptyState' && node.props.title === 'List not found',
    );

    expect(notFoundStates).toHaveLength(0);
  });

  it('queues offline list deletion and replaces the deleted list detail route without showing not found', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as ReturnType<typeof useConnectivity>);
    restaurantListWrites.deleteRestaurantList.mockResolvedValue({ status: 'queued' });
    const queryResult = buildQueryResult();
    mockedUseQuery.mockReturnValue(queryResult);

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      findRightAccessoryElementByTestID(renderer.root, 'list-detail-delete-button').props.onPress();
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: 'delete-list-confirmation-modal' }).props.onConfirm();
    });

    queryResult.data = undefined;

    await act(async () => {
      renderer.update(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    const notFoundStates = renderer.root.findAll(
      (node: any) => node.type === 'EmptyState' && node.props.title === 'List not found',
    );

    expect(restaurantListWrites.deleteRestaurantList).toHaveBeenCalledWith({ listId: 'list_1' });
    expect(navigation.replace).toHaveBeenCalledWith('Lists');
    expect(notFoundStates).toHaveLength(0);
  });

  it('delegates source rating deletion to restaurant list writes', async () => {
    const queryClient = { invalidateQueries: jest.fn() } as unknown as ReturnType<typeof useQueryClient>;
    mockedUseQueryClient.mockReturnValue(queryClient);
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  restaurantId: 'restaurant_food_1',
                  sourceUserId: 'friend_1',
                  sourceUserName: 'Friend',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'remove-source-rating-item_1-food_item_1' }).props.onPress();
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: 'delete-list-item-confirmation-modal' }).props.onConfirm();
    });

    expect(restaurantListWrites.removeRestaurantListSourceRating).toHaveBeenCalledWith({
      listId: 'list_1',
      listItemId: 'item_1',
      foodItemId: 'food_item_1',
    });
  });

  it('hides a queued source rating removal from the current list detail', async () => {
    restaurantListWrites.removeRestaurantListSourceRating.mockResolvedValue({
      status: 'queued',
    });
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as ReturnType<typeof useConnectivity>);
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  sourceUserId: 'friend_1',
                  sourceUserName: 'Friend',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'remove-source-rating-item_1-food_item_1' }).props.onPress();
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: 'delete-list-item-confirmation-modal' }).props.onConfirm();
    });

    expect(renderer.root.findAllByProps({ itemName: 'Spicy Ramen' })).toHaveLength(0);
  });

  it('delegates linked user rating deletion to restaurant list writes', async () => {
    const queryClient = { invalidateQueries: jest.fn() } as unknown as ReturnType<typeof useQueryClient>;
    mockedUseQueryClient.mockReturnValue(queryClient);
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  restaurantId: 'restaurant_food_1',
                  sourceUserId: 'friend_1',
                  sourceUserName: 'Friend',
                  userFoodItemId: 'user_food_item_1',
                  userFoodItemName: 'Spicy Ramen',
                  userFoodItemRating: 4,
                  userFoodItemVisitedAt: '2026-01-04T00:00:00.000Z',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'remove-user-rating-item_1-user_food_item_1' }).props.onPress();
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: 'delete-list-item-confirmation-modal' }).props.onConfirm();
    });

    expect(restaurantListWrites.removeRestaurantListUserRating).toHaveBeenCalledWith({
      listId: 'list_1',
      listItemId: 'item_1',
    });
  });

  it('adds a long-pressed source item to another list', async () => {
    const queryClient = { invalidateQueries: jest.fn() } as unknown as ReturnType<typeof useQueryClient>;
    mockedUseQueryClient.mockReturnValue(queryClient);
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          viewerLists: [
            buildList({ id: 'default_list', name: 'Want to Try', isDefault: true }),
            buildList({ id: 'list_1', name: 'Favorites' }),
            buildList({ id: 'list_2', name: 'Date Night' }),
          ],
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  restaurantId: 'restaurant_food_1',
                  sourceUserId: 'friend_1',
                  sourceUserName: 'Friend',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      renderer.root.findByProps({ itemName: 'Spicy Ramen' }).props.onLongPress();
    });

    expect(renderer.root.findAllByProps({ testID: 'list-item-transfer-list-default_list' })).toHaveLength(0);

    await act(async () => {
      renderer.root.findByProps({ testID: 'list-item-transfer-list-list_2' }).props.onPress();
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: 'list-item-transfer-modal' }).props.primaryAction.onPress();
    });

    expect(restaurantListWrites.saveBookmarkToLists).toHaveBeenCalledWith({
      listIds: ['list_2'],
      sourceListId: 'list_1',
      bookmark: {
        restaurantId: 'restaurant_food_1',
        foodItemId: 'food_item_1',
        sourceListId: 'list_1',
        sourceListItemId: 'item_1',
        sourceUserId: 'friend_1',
      },
    });
    expect(restaurantListWrites.removeRestaurantListSourceRating).not.toHaveBeenCalled();
  });

  it('loads destination lists from the owner list query when detail viewer lists are empty', async () => {
    mockedUseInfiniteQuery.mockReturnValue(
      buildInfiniteQueryResult(
        buildDetail({
          viewerLists: [],
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  sourceUserId: 'friend_1',
                  sourceUserName: 'Friend',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      ),
    );
    mockedUseQuery.mockImplementation((options: any) => {
      if (options.queryKey?.[0] === 'feature' && options.queryKey?.[1] === 'restaurantLists') {
        return {
          data: {
            items: [
              buildList({ id: 'default_list', name: 'Want to Try', isDefault: true }),
              buildList({ id: 'list_1', name: 'Favorites' }),
              buildList({ id: 'list_2', name: 'Date Night' }),
            ],
            page: 1,
            pageSize: 100,
            totalItems: 2,
            totalPages: 1,
            hasNextPage: false,
          },
          isError: false,
          isFetching: false,
          isLoading: false,
          isRefetching: false,
          isSuccess: true,
          refetch: jest.fn(),
        } as unknown as ReturnType<typeof useQuery>;
      }

      return buildQueryResult(
        buildDetail({
          viewerLists: [],
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  sourceUserId: 'friend_1',
                  sourceUserName: 'Friend',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      );
    });
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      renderer.root.findByProps({ itemName: 'Spicy Ramen' }).props.onLongPress();
    });

    expect(renderer.root.findAllByProps({ testID: 'list-item-transfer-list-default_list' })).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'list-item-transfer-list-list_2' })).toBeTruthy();
  });

  it('moves a long-pressed linked user rating to another list', async () => {
    const queryClient = { invalidateQueries: jest.fn() } as unknown as ReturnType<typeof useQueryClient>;
    mockedUseQueryClient.mockReturnValue(queryClient);
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          viewerLists: [
            buildList({ id: 'list_1', name: 'Favorites' }),
            buildList({ id: 'list_2', name: 'Date Night' }),
          ],
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  sourceUserId: 'friend_1',
                  sourceUserName: 'Friend',
                  userFoodItemId: 'user_food_item_1',
                  userFoodItemName: 'Spicy Ramen',
                  userFoodItemRating: 4,
                  userFoodItemVisitedAt: '2026-01-04T00:00:00.000Z',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      renderer.root.findByProps({ itemName: 'Spicy Ramen' }).props.onLongPress();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'list-item-transfer-list-list_1' }).props.onPress();
      renderer.root.findByProps({ testID: 'list-item-transfer-list-list_2' }).props.onPress();
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: 'list-item-transfer-modal' }).props.primaryAction.onPress();
    });

    expect(restaurantListWrites.saveBookmarkToLists).toHaveBeenCalledWith({
      listIds: ['list_2'],
      sourceListId: 'list_1',
      bookmark: {
        restaurantId: 'restaurant_1',
        foodItemId: 'food_item_1',
        sourceListId: 'list_1',
        sourceListItemId: 'item_1',
        sourceUserId: 'friend_1',
      },
    });
    expect(restaurantListWrites.addRestaurant).toHaveBeenCalledWith({
      listId: 'list_2',
      restaurantId: 'restaurant_1',
      foodItemIds: ['user_food_item_1'],
    });
    expect(restaurantListWrites.removeRestaurantListSourceRating).toHaveBeenCalledWith({
      listId: 'list_1',
      listItemId: 'item_1',
      foodItemId: 'food_item_1',
    });
    expect(restaurantListWrites.removeRestaurantListUserRating).toHaveBeenCalledWith({
      listId: 'list_1',
      listItemId: 'item_1',
    });
  });

  it('delegates offline source rating deletion to restaurant list writes', async () => {
    const queryClient = { invalidateQueries: jest.fn() } as unknown as ReturnType<typeof useQueryClient>;
    mockedUseQueryClient.mockReturnValue(queryClient);
    restaurantListWrites.removeRestaurantListSourceRating.mockResolvedValue({
      status: 'queued',
    });
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as ReturnType<typeof useConnectivity>);
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  sourceUserId: 'friend_1',
                  sourceUserName: 'Friend',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'remove-source-rating-item_1-food_item_1' }).props.onPress();
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: 'delete-list-item-confirmation-modal' }).props.onConfirm();
    });

    expect(restaurantListWrites.removeRestaurantListSourceRating).toHaveBeenCalledWith({
      listId: 'list_1',
      listItemId: 'item_1',
      foodItemId: 'food_item_1',
    });
  });

  it('keeps friend bookmark rows without photos on the existing save-only path', async () => {
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  sourceUserId: 'owner_1',
                  sourceUserName: 'Owner',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    expect(renderer.root.findAllByProps({ testID: 'list-detail-friend-photo-button-0-0' })).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'save-list-item-item_1' })).toBeTruthy();
  });

  it('saves a friend list bookmark directly to Want to Try', async () => {
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          viewerLists: [
            buildList({
              id: 'default_list',
              isDefault: true,
              name: 'Want to Try',
              userId: 'viewer_1',
            }),
            buildList({
              id: 'other_list',
              name: 'Date Night',
              userId: 'viewer_1',
            }),
          ],
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  restaurantId: 'restaurant_food_1',
                  sourceUserId: 'owner_1',
                  sourceUserName: 'Owner',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    expect(renderer.root.findByType(ListDetailBookmarkedItemRow).props.isSaved).toBe(false);

    await act(async () => {
      const bookmarkRow = renderer.root.findByType(ListDetailBookmarkedItemRow);
      bookmarkRow.props.onSave(bookmarkRow.props.item);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(restaurantListWrites.saveBookmarkToDefaultList).toHaveBeenCalledWith({
      defaultListId: 'default_list',
      sourceListId: 'list_1',
      bookmark: {
        restaurantId: 'restaurant_food_1',
        foodItemId: 'food_item_1',
        sourceListId: 'list_1',
        sourceListItemId: 'item_1',
        sourceUserId: 'owner_1',
      },
    });
    expect(restaurantListWrites.saveBookmarkToLists).not.toHaveBeenCalled();
    expect(renderer.root.findByType(ListDetailBookmarkedItemRow).props.isSaved).toBe(true);
  });

  it('shows persisted friend list bookmarks from bookmark state after reload', async () => {
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          bookmarkState: {
            savedListIdsByBookmarkLookupId: {
              food_item_1: ['default_list'],
            },
          },
          viewerLists: [],
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  restaurantId: 'restaurant_food_1',
                  sourceUserId: 'owner_1',
                  sourceUserName: 'Owner',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    const bookmarkRow = renderer.root.findByType(ListDetailBookmarkedItemRow);
    expect(bookmarkRow.props.isSaved).toBe(true);

    await act(async () => {
      bookmarkRow.props.onSave(bookmarkRow.props.item);
      await Promise.resolve();
    });

    expect(restaurantListWrites.saveBookmarkToDefaultList).not.toHaveBeenCalled();
  });

  it('renders the default Want to Try detail as restaurant bookmarks without item rating cards', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          list: buildList({
            isDefault: true,
            name: 'Want to Try',
            restaurantCount: 1,
          }),
          items: [
            buildListItem({
              id: 'restaurant_bookmark_1',
              restaurantId: 'restaurant_1',
              restaurantName: 'Bookmark Cafe',
              restaurantCity: 'Oakland',
              restaurantCuisineType: 'Cafe',
              bookmarkedItems: [],
              friendOverlapCount: 2,
              friendMatches: [
                {
                  friendId: 'friend_1',
                  friendName: 'Meri',
                  kind: 'restaurant',
                  savedAt: '2026-01-04T00:00:00.000Z',
                },
                {
                  friendId: 'friend_2',
                  friendName: 'Nicholas',
                  kind: 'menu_item',
                  itemName: 'Croissant',
                  rating: 4,
                  savedAt: '2026-01-05T00:00:00.000Z',
                },
              ],
            }),
            buildListItem({
              id: 'restaurant_bookmark_2',
              restaurantId: 'restaurant_2',
              restaurantName: 'Solo Cafe',
              restaurantCity: 'Berkeley',
              restaurantCuisineType: 'Cafe',
              bookmarkedItems: [],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    expect(findExactTextNode(renderer.root, 'Bookmark Cafe')).toBeTruthy();
    expect(findExactTextNode(renderer.root, 'Solo Cafe')).toBeTruthy();
    expect(findExactTextNode(renderer.root, 'Oakland • Cafe')).toBeTruthy();
    expect(findExactTextNodes(renderer.root, 'Meri')).toHaveLength(0);
    expect(findExactTextNodes(renderer.root, 'Nicholas')).toHaveLength(0);
    expect(findExactTextNodes(renderer.root, '2 friends also want to try this')).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'want-to-try-friend-matches-toggle' })).toHaveLength(0);
    expect(findRightAccessoryElementByTestID(renderer.root, 'list-detail-add-button')).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: 'list-detail-filters-button' }).props.onPress();
    });

    expect(renderer.root.findByProps({ testID: 'want-to-try-friend-matches-toggle' })).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: 'want-to-try-friend-matches-toggle' }).props.onValueChange(true);
    });

    expect(renderer.root.findByProps({ title: 'Friends' })).toBeTruthy();
    expect(findExactTextNodes(renderer.root, 'Solo Cafe')).toHaveLength(0);
    expect(findExactTextNode(renderer.root, 'Meri')).toBeTruthy();
    expect(findExactTextNode(renderer.root, 'Nicholas')).toBeTruthy();
    expect(findTextNodeContaining(renderer.root, 'Meri also wants to try this')).toBeTruthy();
    expect(findTextNodeContaining(renderer.root, 'Nicholas saved Croissant')).toBeTruthy();
    expect(findExactTextNodes(renderer.root, 'Find Restaurants to Bookmark')).toHaveLength(0);
    expect(renderer.root.findAllByType('FoodItemRatingRecordCard')).toHaveLength(0);
    expect(renderer.root.findAllByProps({ title: 'Bookmarked Items' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ title: 'Recommended Items' })).toHaveLength(0);

    await act(async () => {
      findRightAccessoryElementByTestID(renderer.root, 'list-detail-add-button').props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('RestaurantDiscovery');

    await act(async () => {
      renderer.root.findByProps({ testID: 'i-went-restaurant-bookmark-0' }).props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('CreateVisit', {
      preselectedRestaurantId: 'restaurant_1',
      preselectedRestaurantName: 'Bookmark Cafe',
      preselectedMenuItemId: undefined,
      preselectedMenuItemName: undefined,
      sourceListId: 'list_1',
      sourceListItemId: 'restaurant_bookmark_1',
      recommendationSource: {
        discoverySurface: 'list_detail',
        sourceListId: 'list_1',
        sourceListItemId: 'restaurant_bookmark_1',
      },
      returnToStep: 1,
    });
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'LIST_DETAIL_I_WENT_TAPPED',
      expect.objectContaining({
        source: 'ListDetailScreen',
        hasRestaurantId: true,
        hasPreselectedMenuItem: false,
      }),
    );
    expect(mockedTrackObservabilityEvent).not.toHaveBeenCalledWith(
      'LIST_DETAIL_I_WENT_TAPPED',
      expect.objectContaining({
        restaurantId: expect.any(String),
      }),
    );
  });

  it('removes a restaurant bookmark from the default Want to Try detail', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    const refetch = jest.fn().mockResolvedValue(buildDetail());
    mockedUseQuery.mockReturnValue({
      ...buildQueryResult(
        buildDetail({
          list: buildList({
            isDefault: true,
            name: 'Want to Try',
            restaurantCount: 1,
          }),
          items: [
            buildListItem({
              id: 'restaurant_bookmark_1',
              restaurantId: 'restaurant_1',
              restaurantName: 'Bookmark Cafe',
              restaurantCity: 'Oakland',
              restaurantCuisineType: 'Cafe',
              bookmarkedItems: [],
            }),
          ],
        }),
      ),
      refetch,
    } as ReturnType<typeof useQuery>);

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'delete-restaurant-bookmark-0' }).props.onPress();
    });

    const modal = renderer.root.findByProps({ testID: 'delete-list-item-confirmation-modal' });
    expect(modal.props.title).toBe('Remove Restaurant?');
    expect(modal.props.confirmLabel).toBe('Remove Restaurant');

    await act(async () => {
      await modal.props.onConfirm();
    });

    expect(restaurantListWrites.removeBookmarkFromDefaultList).toHaveBeenCalledWith({
      bookmark: {
        restaurantId: 'restaurant_1',
      },
      defaultListId: 'list_1',
      sourceListId: 'list_1',
    });
  });

  it('hides a queued restaurant bookmark removal from Want to Try', async () => {
    restaurantListWrites.removeBookmarkFromDefaultList.mockResolvedValue({
      status: 'queued',
    });
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as ReturnType<typeof useConnectivity>);
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          list: buildList({
            isDefault: true,
            name: 'Want to Try',
            restaurantCount: 1,
          }),
          items: [
            buildListItem({
              id: 'restaurant_bookmark_1',
              restaurantId: 'restaurant_1',
              restaurantName: 'Bookmark Cafe',
              restaurantCity: 'Oakland',
              restaurantCuisineType: 'Cafe',
              bookmarkedItems: [],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'delete-restaurant-bookmark-0' }).props.onPress();
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: 'delete-list-item-confirmation-modal' }).props.onConfirm();
    });

    expect(findExactTextNodes(renderer.root, 'Bookmark Cafe')).toHaveLength(0);
  });

  it('renders default-list menu item bookmarks as non-clickable rows with actions', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          list: buildList({
            isDefault: true,
            name: 'Want to Try',
            restaurantCount: 1,
          }),
          items: [
            buildListItem({
              id: 'menu_item_bookmark_1',
              restaurantName: 'Bookmark Cafe',
              restaurantCity: 'Oakland',
              restaurantCuisineType: 'Cafe',
              bookmarkedItems: [
                {
                  id: 'food_1',
                  listItemId: 'menu_item_bookmark_1',
                  menuItemId: 'menu_item_1',
                  name: 'Croissant',
                  rating: 4,
                },
              ],
              friendOverlapCount: 2,
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    expect(findExactTextNodes(renderer.root, '2 friends also want to try this')).toHaveLength(0);
    expect(renderer.root.findByProps({ title: 'Saved Menu Items' })).toBeTruthy();
    expect(renderer.root.findAllByType('FoodItemRatingRecordCard')).toHaveLength(0);
    const menuItemRow = renderer.root.findByProps({ testID: 'want-to-try-menu-item-0' });
    expect(menuItemRow.props.onPress).toBeUndefined();

    await act(async () => {
      renderer.root.findByProps({ testID: 'i-went-list-item-menu_item_bookmark_1' }).props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('CreateVisit', {
      preselectedRestaurantId: 'restaurant_1',
      preselectedRestaurantName: 'Bookmark Cafe',
      preselectedMenuItemId: 'menu_item_1',
      preselectedMenuItemName: 'Croissant',
      sourceListId: 'list_1',
      sourceListItemId: 'menu_item_bookmark_1',
      recommendationSource: {
        discoverySurface: 'list_detail',
        sourceFoodItemId: 'food_1',
        sourceListId: 'list_1',
        sourceListItemId: 'menu_item_bookmark_1',
        sourceMenuItemId: 'menu_item_1',
      },
      returnToStep: 2,
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'remove-want-to-try-menu-item-menu_item_bookmark_1' }).props.onPress();
    });

    const modal = renderer.root.findByProps({ testID: 'delete-list-item-confirmation-modal' });
    expect(modal.props.title).toBe('Remove Menu Item?');
    expect(modal.props.confirmLabel).toBe('Remove Menu Item');

    await act(async () => {
      await modal.props.onConfirm();
    });

    expect(renderer.root.findByProps({ testID: 'delete-list-item-confirmation-modal' }).props).toEqual(
      expect.objectContaining({
        confirmLabel: 'Remove Menu Item',
        title: 'Remove Menu Item?',
        visible: false,
      }),
    );
    expect(restaurantListWrites.removeBookmarkFromDefaultList).toHaveBeenCalledWith({
      bookmark: {
        restaurantId: 'restaurant_1',
        menuItemId: 'menu_item_1',
      },
      defaultListId: 'list_1',
      sourceListId: 'list_1',
    });
  });

  it('keeps curated owner lists on the recommendation rendering path', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          list: buildList({
            isDefault: false,
            name: 'Dinner Ideas',
            restaurantCount: 1,
            shareEnabled: true,
          }),
          items: [
            buildListItem({
              restaurantName: 'Curated Cafe',
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                  sourceUserId: 'friend_1',
                  sourceUserName: 'Friend',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    expect(findExactTextNode(renderer.root, 'Add Visit Ratings to List')).toBeTruthy();
    expect(renderer.root.findByProps({ title: 'Bookmarked Items' })).toBeTruthy();
    expect(renderer.root.findByType('FoodItemRatingRecordCard').props.itemName).toBe('Spicy Ramen');
    expect(findRightAccessoryElementByTestID(renderer.root, 'list-detail-share-button')).toBeTruthy();
    expect(renderer.root.findAllByProps({ testID: 'list-detail-share-enabled-indicator' })).toHaveLength(0);
    expect(findExactTextNodes(renderer.root, 'Shared by secret link')).toHaveLength(0);
  });

  it('filters Want to Try detail restaurants by search query', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          list: buildList({
            isDefault: true,
            name: 'Want to Try',
            restaurantCount: 2,
          }),
          items: [
            buildListItem({
              id: 'restaurant_bookmark_1',
              restaurantId: 'restaurant_1',
              restaurantName: 'Bookmark Cafe',
              restaurantCity: 'Oakland',
              restaurantCuisineType: 'Cafe',
              bookmarkedItems: [],
            }),
            buildListItem({
              id: 'restaurant_bookmark_2',
              restaurantId: 'restaurant_2',
              restaurantName: 'Solo Bistro',
              restaurantCity: 'Berkeley',
              restaurantCuisineType: 'Japanese',
              bookmarkedItems: [],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'list-detail-search-input' }).props.onChangeText('solo');
    });

    expect(findExactTextNodes(renderer.root, 'Bookmark Cafe')).toHaveLength(0);
    expect(findExactTextNode(renderer.root, 'Solo Bistro')).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: 'list-detail-clear-search-button' }).props.onPress();
    });

    expect(findExactTextNode(renderer.root, 'Bookmark Cafe')).toBeTruthy();
    expect(findExactTextNode(renderer.root, 'Solo Bistro')).toBeTruthy();
  });

  it('filters regular list detail restaurants by bookmarked item search query', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          list: buildList({
            isDefault: false,
            name: 'Dinner Ideas',
            restaurantCount: 2,
          }),
          items: [
            buildListItem({
              id: 'list_item_1',
              restaurantId: 'restaurant_1',
              restaurantName: 'Ramen House',
              restaurantCity: 'Oakland',
              restaurantCuisineType: 'Japanese',
              bookmarkedItems: [
                {
                  id: 'food_item_1',
                  listItemId: 'list_item_1',
                  name: 'Spicy Ramen',
                  rating: 5,
                },
              ],
            }),
            buildListItem({
              id: 'list_item_2',
              restaurantId: 'restaurant_2',
              restaurantName: 'Noodle Bar',
              restaurantCity: 'Berkeley',
              restaurantCuisineType: 'Japanese',
              bookmarkedItems: [
                {
                  id: 'food_item_2',
                  listItemId: 'list_item_2',
                  name: 'Udon',
                  rating: 4,
                },
              ],
            }),
          ],
        }),
      ),
    );

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'list-detail-search-input' }).props.onChangeText('udon');
    });

    expect(findExactTextNodes(renderer.root, 'Ramen House')).toHaveLength(0);
    expect(findExactTextNode(renderer.root, 'Noodle Bar')).toBeTruthy();
    expect(renderer.root.findByType('FoodItemRatingRecordCard').props.itemName).toBe('Udon');

    await act(async () => {
      renderer.root.findByProps({ testID: 'list-detail-search-input' }).props.onChangeText('taco');
    });

    expect(renderer.root.findByProps({ title: 'No matching restaurants' })).toBeTruthy();
  });

  it('keeps the detail scaffold refreshing prop active until the refetch lifecycle settles', async () => {
    const refetchDeferred = createDeferred<{ data: RestaurantListDetailRecord }>();
    const queryResult = buildInfiniteQueryResult();
    queryResult.refetch = jest.fn(() => refetchDeferred.promise as never);
    queryResult.isRefetching = false;
    mockedUseInfiniteQuery.mockReturnValue(queryResult);

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    const findScaffold = () => renderer.root.findByType('FeatureDetailScreenScaffold');

    expect(findScaffold().props.screenBackgroundTone).toBe('surface');
    expect(findScaffold().props.scroll).toBe(false);
    expect(findScaffold().props.refreshing).toBe(false);

    let refreshPromise: Promise<unknown> | null = null;
    act(() => {
      refreshPromise = findScaffold().props.onRefresh();
    });

    expect(findScaffold().props.refreshing).toBe(true);

    await act(async () => {
      queryResult.isRefetching = true;
      renderer.update(<ListDetailScreen navigation={navigation as any} route={route as any} />);
      await Promise.resolve();
    });

    expect(findScaffold().props.refreshing).toBe(true);

    await act(async () => {
      refetchDeferred.resolve({ data: buildDetail() });
      await refreshPromise;
    });

    expect(findScaffold().props.refreshing).toBe(true);

    await act(async () => {
      queryResult.isRefetching = false;
      renderer.update(<ListDetailScreen navigation={navigation as any} route={route as any} />);
      await Promise.resolve();
    });

    expect(findScaffold().props.refreshing).toBe(false);
  });

  it('opens the I went visit flow with the source list id and bookmark item id', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'bookmark_1',
                  listItemId: 'source_list_item_1',
                  name: 'Noodles',
                  rating: 4,
                  sourceUserId: 'friend_1',
                  sourceUserName: 'Friend',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
              id: 'list_item_1',
              restaurantId: 'restaurant_1',
              restaurantName: 'Test Restaurant',
            }),
          ],
        }),
      ),
    );
    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    const iWentButton = renderer.root.findByProps({ testID: 'i-went-list-item-list_item_1' });

    await act(async () => {
      iWentButton.props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('CreateVisit', {
      preselectedRestaurantId: 'restaurant_1',
      preselectedRestaurantName: 'Test Restaurant',
      preselectedMenuItemId: 'bookmark-list_item_1',
      preselectedMenuItemName: 'Noodles',
      sourceListId: 'list_1',
      sourceListItemId: 'list_item_1',
      recommendationSource: {
        discoverySurface: 'list_detail',
        sourceFoodItemId: 'bookmark_1',
        sourceListId: 'list_1',
        sourceListItemId: 'list_item_1',
        sourceUserId: 'friend_1',
      },
      returnToStep: 2,
    });
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'LIST_DETAIL_I_WENT_TAPPED',
      expect.objectContaining({
        source: 'ListDetailScreen',
        hasRestaurantId: true,
        hasPreselectedMenuItem: true,
      }),
    );
    expect(mockedTrackObservabilityEvent).not.toHaveBeenCalledWith(
      'LIST_DETAIL_I_WENT_TAPPED',
      expect.objectContaining({
        restaurantId: expect.any(String),
      }),
    );
  });

  it('renders a locked restaurant icon for private restaurants', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          items: [
            buildListItem({
              restaurantId: 'restaurant_private',
              restaurantVisibility: 'private',
            }),
          ],
        }),
      ),
    );
    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    expect(renderer.root.findByProps({ testID: 'locked-restaurant-restaurant_private' })).toBeTruthy();
    expect(renderer.root.findAll((node: any) => node.props.children === 'San Francisco • Fire').length).toBeGreaterThan(0);
  });

  it('hides I went for private bookmarked restaurants but keeps deletion available', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'owner_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'bookmark_1',
                  listItemId: 'source_list_item_1',
                  name: 'Noodles',
                  rating: 4,
                  sourceUserId: 'friend_1',
                  sourceUserName: 'Friend',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
              id: 'list_item_1',
              restaurantId: 'restaurant_private',
              restaurantVisibility: 'private',
            }),
          ],
        }),
      ),
    );
    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    expect(() => renderer.root.findByProps({ testID: 'i-went-list-item-list_item_1' })).toThrow();
    expect(renderer.root.findByProps({ testID: 'remove-source-rating-list_item_1-bookmark_1' })).toBeTruthy();
  });

  it('hides friend bookmark save action for private restaurants', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'viewer_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseQuery.mockReturnValue(
      buildQueryResult(
        buildDetail({
          list: buildList({
            userId: 'owner_1',
          }),
          items: [
            buildListItem({
              bookmarkedItems: [
                {
                  id: 'bookmark_1',
                  listItemId: 'source_list_item_1',
                  name: 'Noodles',
                  rating: 4,
                  sourceUserId: 'owner_1',
                  sourceUserName: 'Owner',
                  visitedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
              id: 'list_item_1',
              restaurantId: 'restaurant_private',
              restaurantVisibility: 'private',
            }),
          ],
        }),
      ),
    );
    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    expect(renderer.root.findByProps({ testID: 'locked-restaurant-restaurant_private' })).toBeTruthy();
    expect(() => renderer.root.findByProps({ testID: 'save-list-item-list_item_1' })).toThrow();
  });

  it('fetches the first list-detail page and loads the next page on list end', async () => {
    const fetchNextPage = jest.fn();
    let infiniteQueryOptions: any = null;
    mockedUseInfiniteQuery.mockImplementation((options: any) => {
      infiniteQueryOptions = options;
      return {
        ...buildInfiniteQueryResult(buildDetail({ hasNextPage: true, page: 1, pageSize: 20 })),
        fetchNextPage,
        hasNextPage: true,
      } as ReturnType<typeof useInfiniteQuery>;
    });

    let renderer: any = null;
    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    await infiniteQueryOptions.queryFn({ pageParam: 1, signal: undefined });
    expect(mockedGetRestaurantListDetail).toHaveBeenCalledWith('list_1', {
      page: 1,
      pageSize: 20,
      signal: undefined,
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'list-detail-rows' }).props.onEndReached();
    });
    expect(fetchNextPage).toHaveBeenCalled();
  });
});
