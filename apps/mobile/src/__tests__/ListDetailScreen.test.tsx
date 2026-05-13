import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  buildPocketBaseFileUrl,
  deleteRestaurantList,
  getRestaurantListDetail,
  invalidateRestaurantListCollectionQueries,
  invalidateRestaurantListContentQueries,
  removeRestaurantListQueries,
  removeRestaurantListSourceRating,
  removeRestaurantListUserRating,
} from '../features';
import type { RestaurantListDetailRecord } from '../features/store/featureStore';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useWriteTelemetry } from '../features/store/useWriteTelemetry';
import type { RestaurantListItemRecord, RestaurantListRecord } from '../features/models';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { ListDetailScreen } from '../screens/ListDetailScreen';

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
  },
  spacing: {
    md: 16,
    sm: 12,
    xs: 8,
    xxs: 4,
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
    bodySmTightBold: { fontSize: 12, fontWeight: '700' },
    bodySmTightSemiBold: { fontSize: 12, fontWeight: '600' },
    label: { fontSize: 11 },
    labelMdBold: { fontSize: 13, fontWeight: '700' },
    titleSm: { fontSize: 20, fontWeight: '700' },
  },
};

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('../features', () => ({
  buildPocketBaseFileUrl: jest.fn(() => 'photo-url'),
  createDefaultRestaurantList: jest.fn(),
  deleteRestaurantList: jest.fn(),
  getRestaurantListDetail: jest.fn(),
  invalidateRestaurantListCollectionQueries: jest.fn(),
  invalidateRestaurantListContentQueries: jest.fn(),
  invalidateRestaurantListSaveTargetQueries: jest.fn(),
  moveRestaurantListRestaurant: jest.fn(),
  removeRestaurantListQueries: jest.fn(),
  removeRestaurantListSourceRating: jest.fn(),
  removeRestaurantListUserRating: jest.fn(),
  restaurantListQueryKeys: {
    detail: (listId: string) => ['feature', 'restaurantListDetail', listId],
  },
  saveRestaurantFoodItemToList: jest.fn(),
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
  Modal: ({
    children,
    visible,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode; visible?: boolean }) =>
    visible ? mockReact.createElement('Modal', props, children) : null,
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
    visible ? mockReact.createElement('ConfirmDestructiveModal', props, children) : null,
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  ExpandableText: jest.requireActual('../components/shared/ExpandableText').ExpandableText,
  FeatureDetailScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureDetailScreenScaffold', props, children),
  PhotoViewerModal: () => null,
  RatingPill: () => null,
  SectionHeader: (props: Record<string, unknown>) => mockReact.createElement('SectionHeader', props),
  Skeleton: () => null,
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: () => null,
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedBuildPocketBaseFileUrl = buildPocketBaseFileUrl as jest.MockedFunction<typeof buildPocketBaseFileUrl>;
const mockedDeleteRestaurantList = deleteRestaurantList as jest.MockedFunction<typeof deleteRestaurantList>;
const mockedGetRestaurantListDetail = getRestaurantListDetail as jest.MockedFunction<typeof getRestaurantListDetail>;
const mockedInvalidateRestaurantListCollectionQueries = invalidateRestaurantListCollectionQueries as jest.MockedFunction<
  typeof invalidateRestaurantListCollectionQueries
>;
const mockedInvalidateRestaurantListContentQueries = invalidateRestaurantListContentQueries as jest.MockedFunction<
  typeof invalidateRestaurantListContentQueries
>;
const mockedRemoveRestaurantListQueries = removeRestaurantListQueries as jest.MockedFunction<
  typeof removeRestaurantListQueries
>;
const mockedRemoveRestaurantListSourceRating = removeRestaurantListSourceRating as jest.MockedFunction<
  typeof removeRestaurantListSourceRating
>;
const mockedRemoveRestaurantListUserRating = removeRestaurantListUserRating as jest.MockedFunction<
  typeof removeRestaurantListUserRating
>;
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
  const queryClient = {};

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
    mockedDeleteRestaurantList.mockResolvedValue(undefined);
    mockedUseQuery.mockReturnValue(buildQueryResult());
    mockedUseQueryClient.mockReturnValue(queryClient as ReturnType<typeof useQueryClient>);
    mockedGetRestaurantListDetail.mockResolvedValue(buildDetail());
    mockedInvalidateRestaurantListCollectionQueries.mockResolvedValue(undefined);
    mockedInvalidateRestaurantListContentQueries.mockResolvedValue(undefined);
    mockedRemoveRestaurantListQueries.mockImplementation(() => undefined);
    mockedRemoveRestaurantListSourceRating.mockResolvedValue([]);
    mockedRemoveRestaurantListUserRating.mockResolvedValue([]);
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

    expect(mockedDeleteRestaurantList).toHaveBeenCalledWith('list_1');
    expect(mockedInvalidateRestaurantListCollectionQueries).toHaveBeenCalledWith(queryClient);
    expect(mockedRemoveRestaurantListQueries).toHaveBeenCalledWith(queryClient, 'list_1');
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
    const queueFeatureOutbox = jest.fn().mockResolvedValue(undefined);
    mockedUseFeatureOutboxQueue.mockReturnValue(queueFeatureOutbox);
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

    expect(queueFeatureOutbox).toHaveBeenCalledWith('list.delete', { listId: 'list_1' });
    expect(mockedInvalidateRestaurantListCollectionQueries).toHaveBeenCalledWith(queryClient);
    expect(mockedRemoveRestaurantListQueries).toHaveBeenCalledWith(queryClient, 'list_1');
    expect(navigation.replace).toHaveBeenCalledWith('Lists');
    expect(notFoundStates).toHaveLength(0);
  });

  it('invalidates candidate restaurant caches after confirming source rating deletion', async () => {
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

    expect(mockedRemoveRestaurantListSourceRating).toHaveBeenCalledWith({
      listId: 'list_1',
      listItemId: 'item_1',
      foodItemId: 'food_item_1',
    });
    expect(mockedInvalidateRestaurantListContentQueries).toHaveBeenCalledWith(queryClient, 'list_1', {
      includeCandidateRestaurants: true,
    });
  });

  it('invalidates candidate restaurant caches after confirming linked user rating deletion', async () => {
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

    expect(mockedRemoveRestaurantListUserRating).toHaveBeenCalledWith('list_1', 'item_1');
    expect(mockedInvalidateRestaurantListContentQueries).toHaveBeenCalledWith(queryClient, 'list_1', {
      includeCandidateRestaurants: true,
    });
  });

  it('invalidates candidate restaurant caches after queueing offline source rating deletion', async () => {
    const queryClient = { invalidateQueries: jest.fn() } as unknown as ReturnType<typeof useQueryClient>;
    const queueFeatureOutbox = jest.fn().mockResolvedValue(undefined);
    mockedUseQueryClient.mockReturnValue(queryClient);
    mockedUseFeatureOutboxQueue.mockReturnValue(queueFeatureOutbox);
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

    expect(queueFeatureOutbox).toHaveBeenCalledWith('list.restaurant.remove.source', {
      listId: 'list_1',
      listItemId: 'item_1',
      foodItemId: 'food_item_1',
    });
    expect(mockedRemoveRestaurantListSourceRating).not.toHaveBeenCalled();
    expect(mockedInvalidateRestaurantListContentQueries).toHaveBeenCalledWith(queryClient, 'list_1', {
      includeCandidateRestaurants: true,
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

  it('keeps the detail scaffold refreshing prop active until the refetch lifecycle settles', async () => {
    const refetchDeferred = createDeferred<{ data: RestaurantListDetailRecord }>();
    const queryResult = buildQueryResult();
    queryResult.refetch = jest.fn(() => refetchDeferred.promise as never);
    queryResult.isRefetching = false;
    mockedUseQuery.mockReturnValue(queryResult);

    let renderer: any = null;

    await act(async () => {
      renderer = create(<ListDetailScreen navigation={navigation as any} route={route as any} />);
    });

    const findScaffold = () => renderer.root.findByType('FeatureDetailScreenScaffold');

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
      returnToStep: 2,
    });
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
});
