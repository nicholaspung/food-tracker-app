import { useQuery } from '@tanstack/react-query';

import { restaurantListQueryKeys } from '../features/store/restaurantListQuery';
import { getRestaurantListDetail } from '../features/store/restaurantListsStore';
import { useWantToTryListRead } from '../features/store/useWantToTryListRead';
import { useWantToTryResolver } from '../features/store/useWantToTryState';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(() => ({ user: { id: 'user-1' } })),
}));

jest.mock('../features/store/useWantToTryState', () => ({
  useWantToTryResolver: jest.fn(),
}));

jest.mock('../features/store/restaurantListsStore', () => ({
  getRestaurantListDetail: jest.fn(),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseWantToTryResolver = useWantToTryResolver as jest.MockedFunction<
  typeof useWantToTryResolver
>;
const mockedGetRestaurantListDetail = getRestaurantListDetail as jest.MockedFunction<
  typeof getRestaurantListDetail
>;

describe('useWantToTryListRead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseWantToTryResolver.mockReturnValue({
      defaultList: { id: 'list_1' },
      defaultListId: 'list_1',
      defaultListQuery: { data: { id: 'list_1' } },
    } as never);
    mockedUseQuery.mockReturnValue({ data: { items: [] } } as ReturnType<typeof useQuery>);
  });

  it('keeps full List Detail pagination behind the resolved default-list id', () => {
    const result = useWantToTryListRead();

    expect(result.defaultListId).toBe('list_1');
    expect(mockedUseQuery).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      queryKey: restaurantListQueryKeys.detail('list_1'),
    }));
  });

  it('keeps the pending detail key disabled until the resolver has a list id', () => {
    mockedUseWantToTryResolver.mockReturnValue({
      defaultList: null,
      defaultListId: undefined,
      defaultListQuery: { data: null },
    } as never);

    const result = useWantToTryListRead();

    expect(result.defaultListId).toBeUndefined();
    expect(mockedUseQuery).toHaveBeenCalledWith(expect.objectContaining({
      enabled: false,
      queryKey: restaurantListQueryKeys.detail('__default_list_pending__'),
    }));
  });

  it('loads every List Detail page with the query AbortSignal', async () => {
    mockedGetRestaurantListDetail
      .mockResolvedValueOnce({
        bookmarkState: { savedListIdsByBookmarkLookupId: { lookup_1: ['list_1'] } },
        hasNextPage: true,
        items: [{ restaurantId: 'restaurant_1' }],
        list: { id: 'list_1' },
        page: 1,
        pageSize: 50,
        photoPreviews: [{ id: 'photo_1' }],
        totalItems: 51,
        totalPages: 2,
        viewerLists: [{ id: 'viewer_list_1' }],
      } as unknown as Awaited<ReturnType<typeof getRestaurantListDetail>>)
      .mockResolvedValueOnce({
        bookmarkState: { savedListIdsByBookmarkLookupId: { lookup_2: ['list_1'] } },
        hasNextPage: false,
        items: [{ restaurantId: 'restaurant_51' }],
        list: { id: 'list_1' },
        page: 2,
        pageSize: 50,
        photoPreviews: [{ id: 'photo_2' }],
        totalItems: 51,
        totalPages: 2,
        viewerLists: [],
      } as unknown as Awaited<ReturnType<typeof getRestaurantListDetail>>);
    const abortController = new AbortController();

    useWantToTryListRead();

    const detailOptions = mockedUseQuery.mock.calls[0]?.[0] as unknown as {
      queryFn: (input: { signal: AbortSignal }) => Promise<unknown>;
    };
    const detail = await detailOptions.queryFn({ signal: abortController.signal });

    expect(mockedGetRestaurantListDetail).toHaveBeenNthCalledWith(1, 'list_1', {
      page: 1,
      pageSize: 50,
      signal: abortController.signal,
    });
    expect(mockedGetRestaurantListDetail).toHaveBeenNthCalledWith(2, 'list_1', {
      page: 2,
      pageSize: 50,
      signal: abortController.signal,
    });
    expect(detail).toMatchObject({
      bookmarkState: {
        savedListIdsByBookmarkLookupId: {
          lookup_1: ['list_1'],
          lookup_2: ['list_1'],
        },
      },
      items: [
        { restaurantId: 'restaurant_1' },
        { restaurantId: 'restaurant_51' },
      ],
      photoPreviews: [
        { id: 'photo_1' },
        { id: 'photo_2' },
      ],
      viewerLists: [{ id: 'viewer_list_1' }],
    });
  });
});
