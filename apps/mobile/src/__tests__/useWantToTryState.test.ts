import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createDefaultRestaurantList,
  getDefaultRestaurantList,
  getRestaurantListBookmarkState,
} from '../features/store/restaurantListsStore';
import {
  createWantToTryMenuItemTarget,
  createWantToTryRecommendationTarget,
  createWantToTryRestaurantTarget,
  normalizeWantToTryTargets,
  projectWantToTryMembership,
  reconcileWantToTryReplay,
  useWantToTryMembership,
  useWantToTryResolver,
  wantToTryQueryKeys,
} from '../features/store/useWantToTryState';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useQueuedFeatureWrites } from '../features/store/useQueuedFeatureWrites';

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void) => effect(),
  useMemo: (factory: () => unknown) => factory(),
  useRef: (initialValue: unknown) => ({ current: initialValue }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueries: jest.fn(),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/restaurantListsStore', () => ({
  createDefaultRestaurantList: jest.fn(),
  getDefaultRestaurantList: jest.fn(),
  getRestaurantListBookmarkState: jest.fn(),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../features/store/useQueuedFeatureWrites', () => ({
  useQueuedFeatureWrites: jest.fn(),
}));

const mockedUseQueries = useQueries as jest.MockedFunction<typeof useQueries>;
const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedCreateDefaultRestaurantList = createDefaultRestaurantList as jest.MockedFunction<
  typeof createDefaultRestaurantList
>;
const mockedGetDefaultRestaurantList = getDefaultRestaurantList as jest.MockedFunction<
  typeof getDefaultRestaurantList
>;
const mockedGetRestaurantListBookmarkState = getRestaurantListBookmarkState as jest.MockedFunction<
  typeof getRestaurantListBookmarkState
>;
const mockedUseOfflineAwareFeatureWrite = useOfflineAwareFeatureWrite as jest.MockedFunction<
  typeof useOfflineAwareFeatureWrite
>;
const mockedUseQueuedFeatureWrites = useQueuedFeatureWrites as jest.MockedFunction<
  typeof useQueuedFeatureWrites
>;

function buildQueryClient() {
  return {
    getQueryData: jest.fn(),
    getQueriesData: jest.fn(() => []),
    invalidateQueries: jest.fn((_filters?: unknown) => Promise.resolve()),
    setQueriesData: jest.fn(),
    setQueryData: jest.fn(),
  };
}

describe('Want to Try state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQueryClient.mockReturnValue(buildQueryClient() as never);
    mockedUseQuery.mockReturnValue({
      data: { id: 'default-list', userId: 'user-1' },
      isError: false,
      isLoading: false,
    } as never);
    mockedUseQueries.mockReturnValue([] as never);
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(jest.fn(async (options) => ({
      status: 'completed',
      result: await options.execute({}),
    })) as never);
    mockedUseQueuedFeatureWrites.mockReturnValue({
      queuedWrites: [],
      refreshQueuedWrites: jest.fn(),
    } as never);
  });

  it('normalizes restaurant, menu-item, and recommendation target identities in one interface', () => {
    expect(createWantToTryRestaurantTarget(' restaurant-1 ')).toEqual({
      bookmarkKey: 'restaurant:restaurant-1',
      restaurantId: 'restaurant-1',
    });
    expect(createWantToTryMenuItemTarget(' restaurant-1 ', ' menu-1 ')).toEqual({
      bookmarkKey: 'menu-item:restaurant-1:menu-1',
      menuItemId: 'menu-1',
      restaurantId: 'restaurant-1',
    });
    expect(createWantToTryRecommendationTarget({
      foodItemId: ' food-1 ',
      itemName: '  Friend   Noodles ',
      restaurantId: ' restaurant-1 ',
    })).toEqual({
      bookmarkKey: 'restaurant-item:restaurant-1:friend noodles',
      foodItemId: 'food-1',
      restaurantId: 'restaurant-1',
    });
    expect(normalizeWantToTryTargets([
      createWantToTryRestaurantTarget('restaurant-1'),
      createWantToTryRestaurantTarget('restaurant-1'),
    ])).toHaveLength(1);
  });

  it('single-flights concurrent default-list provisioning for one user', async () => {
    const queryOptions: { queryFn: (input: { signal: AbortSignal }) => Promise<unknown> }[] = [];
    mockedUseQuery.mockImplementation((options: any) => {
      queryOptions.push(options);
      return { data: null, isError: false, isLoading: true } as never;
    });
    mockedGetDefaultRestaurantList.mockResolvedValue(null);
    mockedCreateDefaultRestaurantList.mockResolvedValue({
      id: 'created-default-list',
      name: 'Want to Try',
      userId: 'user-1',
      visibility: 'private',
      createdAt: '2026-08-16T00:00:00.000Z',
      updatedAt: '2026-08-16T00:00:00.000Z',
    });

    useWantToTryResolver('user-1');
    useWantToTryResolver('user-1');
    const signal = new AbortController().signal;
    await Promise.all(queryOptions.map((options) => options.queryFn({ signal })));

    expect(mockedGetDefaultRestaurantList).toHaveBeenCalledTimes(2);
    expect(mockedCreateDefaultRestaurantList).toHaveBeenCalledTimes(1);
    const writeFeature = mockedUseOfflineAwareFeatureWrite.mock.results[0]?.value;
    expect(writeFeature).toHaveBeenCalledWith(expect.objectContaining({
      offline: { payload: {}, strategy: 'outbox' },
      operationName: 'list.default.create',
    }));
  });

  it('chunks bounded membership reads and re-keys them by user and default-list id', async () => {
    let defaultListId = 'default-list-a';
    let capturedQueries: any[] = [];
    mockedUseQuery.mockImplementation(() => ({
      data: { id: defaultListId, userId: 'user-1' },
      isError: false,
      isLoading: false,
    }) as never);
    mockedUseQueries.mockImplementation((input: any) => {
      capturedQueries = input.queries;
      return input.queries.map(() => ({ data: { savedTargetsByBookmarkKey: {} } })) as never;
    });
    mockedGetRestaurantListBookmarkState.mockResolvedValue({ savedTargetsByBookmarkKey: {} });
    const targets = Array.from({ length: 101 }, (_, index) =>
      createWantToTryMenuItemTarget(`restaurant-${index}`, `menu-${index}`),
    );

    useWantToTryMembership({ targets, userId: 'user-1' });
    expect(capturedQueries).toHaveLength(2);
    await Promise.all(capturedQueries.map((query) => query.queryFn({ signal: undefined })));
    expect(mockedGetRestaurantListBookmarkState.mock.calls.map((call) => call[1].length)).toEqual([100, 1]);
    expect(capturedQueries[0].queryKey.slice(0, 4)).toEqual([
      'feature',
      'wantToTryMembership',
      'default-list-a',
      'user-1',
    ]);

    defaultListId = 'default-list-b';
    useWantToTryMembership({ targets: targets.slice(0, 1), userId: 'user-2' });
    expect(capturedQueries[0].queryKey.slice(0, 4)).toEqual([
      'feature',
      'wantToTryMembership',
      'default-list-b',
      'user-2',
    ]);
  });

  it('keeps cached membership renderable when a refresh fails', () => {
    const target = createWantToTryRestaurantTarget('restaurant-1');
    mockedUseQueries.mockReturnValue([
      {
        data: { savedTargetsByBookmarkKey: { [target.bookmarkKey]: target } },
        isError: true,
        isLoading: false,
      },
    ] as never);

    const state = useWantToTryMembership({ targets: [target], userId: 'user-1' });

    expect(state.isSaved(target.bookmarkKey)).toBe(true);
    expect(state.hasBlockingError).toBe(false);
    expect(state.hasRefreshError).toBe(true);
  });

  it.each([
    ['unresolved', undefined],
    ['resolved', 'default-list'],
  ])('projects queued default-list saves while the resolver is %s', (_label, defaultListId) => {
    const target = createWantToTryMenuItemTarget('restaurant-1', 'menu-1');
    mockedUseQuery.mockReturnValue({
      data: defaultListId ? { id: defaultListId, userId: 'user-1' } : null,
      error: null,
      isError: false,
      isLoading: false,
    } as never);
    mockedUseQueuedFeatureWrites.mockReturnValue({
      queuedWrites: [{
        createdAt: 1,
        operationName: 'list.default.bookmark.save',
        originAccountId: 'user-1',
        payload: { menuItemId: 'menu-1', restaurantId: 'restaurant-1' },
      }],
      refreshQueuedWrites: jest.fn(),
    } as never);

    const state = useWantToTryMembership({ targets: [target], userId: 'user-1' });

    expect(state.isSaved(target.bookmarkKey)).toBe(true);
  });

  it('does not project another account queued writes after a user switch', () => {
    const target = createWantToTryMenuItemTarget('restaurant-1', 'menu-1');
    mockedUseQuery.mockReturnValue({
      data: { id: 'user-2-default-list', userId: 'user-2' },
      error: null,
      isError: false,
      isLoading: false,
    } as never);
    mockedUseQueuedFeatureWrites.mockReturnValue({
      queuedWrites: [{
        createdAt: 1,
        operationName: 'list.default.bookmark.save',
        originAccountId: 'user-1',
        payload: { menuItemId: 'menu-1', restaurantId: 'restaurant-1' },
      }],
      refreshQueuedWrites: jest.fn(),
    } as never);

    const state = useWantToTryMembership({ targets: [target], userId: 'user-2' });

    expect(state.isSaved(target.bookmarkKey)).toBe(false);
  });

  it('includes resolver failures in the membership error contract', () => {
    const error = new Error('Could not resolve default list.');
    mockedUseQuery.mockReturnValue({
      data: undefined,
      error,
      isError: true,
      isLoading: false,
    } as never);

    const state = useWantToTryMembership({ targets: [], userId: 'user-1' });

    expect(state.hasBlockingError).toBe(true);
    expect(state.errorMessage).toBe(error.message);
  });

  it('refreshes an unresolved resolver after its queued default save replays', async () => {
    const queryClient = buildQueryClient();

    await reconcileWantToTryReplay(queryClient as never, {
      defaultListId: undefined,
      replayedWrites: [{
        createdAt: 1,
        id: 'queued-save',
        idempotencyKey: 'idempotency-key',
        lastError: null,
        operationName: 'list.default.bookmark.save',
        payload: { menuItemId: 'menu-1', restaurantId: 'restaurant-1' },
        status: 'pending',
      }],
      targets: [createWantToTryMenuItemTarget('restaurant-1', 'menu-1')],
      userId: 'user-1',
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: wantToTryQueryKeys.resolver('user-1'),
    });
  });

  it('refreshes only the matching membership chunk after a known-list write replays', async () => {
    const queryClient = buildQueryClient();
    const target = createWantToTryMenuItemTarget('restaurant-1', 'menu-1');
    const otherTarget = createWantToTryMenuItemTarget('restaurant-2', 'menu-2');

    await reconcileWantToTryReplay(queryClient as never, {
      defaultListId: 'default-list',
      replayedWrites: [{
        createdAt: 1,
        id: 'queued-save',
        idempotencyKey: 'idempotency-key',
        lastError: null,
        operationName: 'list.bookmark.save',
        payload: { listId: 'default-list', menuItemId: 'menu-1', restaurantId: 'restaurant-1' },
        status: 'pending',
      }],
      targets: [target, otherTarget],
      userId: 'user-1',
    });

    const predicate = (queryClient.invalidateQueries.mock.calls[0]?.[0] as any)?.predicate;
    expect(predicate?.({ queryKey: wantToTryQueryKeys.membershipChunk(
      'default-list',
      'user-1',
      [target],
    ) })).toBe(true);
    expect(predicate?.({ queryKey: wantToTryQueryKeys.membershipChunk(
      'default-list',
      'user-1',
      [otherTarget],
    ) })).toBe(false);
  });

  it('does not reconcile a discarded or failed queued write without replay success', async () => {
    const queryClient = buildQueryClient();

    await reconcileWantToTryReplay(queryClient as never, {
      defaultListId: undefined,
      replayedWrites: [],
      targets: [createWantToTryMenuItemTarget('restaurant-1', 'menu-1')],
      userId: 'user-1',
    });

    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('projects queued saves and removals only into the matching target chunk', () => {
    const target = createWantToTryRestaurantTarget('restaurant-1');
    const otherTarget = createWantToTryRestaurantTarget('restaurant-2');
    const matchingKey = wantToTryQueryKeys.membershipChunk('default-list', 'user-1', [target]);
    const otherKey = wantToTryQueryKeys.membershipChunk('default-list', 'user-1', [otherTarget]);
    let projected = { savedTargetsByBookmarkKey: {} };
    const queryClient = {
      setQueriesData: jest.fn((filters: any, updater: any) => {
        expect(filters.predicate({ queryKey: matchingKey })).toBe(true);
        expect(filters.predicate({ queryKey: otherKey })).toBe(false);
        projected = updater(projected);
      }),
    };

    projectWantToTryMembership(queryClient as never, {
      listId: 'default-list',
      saved: true,
      target,
    });
    expect(projected.savedTargetsByBookmarkKey).toEqual({ [target.bookmarkKey]: target });

    projectWantToTryMembership(queryClient as never, {
      listId: 'default-list',
      saved: false,
      target,
    });
    expect(projected.savedTargetsByBookmarkKey).toEqual({});
  });
});
