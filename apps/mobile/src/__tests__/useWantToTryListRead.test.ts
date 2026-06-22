import { useQuery } from '@tanstack/react-query';

import { restaurantListQueryKeys } from '../features/store/restaurantListQuery';
import {
  getDefaultRestaurantList,
  getRestaurantListDetail,
} from '../features/store/restaurantListsStore';
import { useWantToTryListRead } from '../features/store/useWantToTryListRead';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('../features/store/restaurantListsStore', () => ({
  getDefaultRestaurantList: jest.fn(),
  getRestaurantListDetail: jest.fn(),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedGetDefaultRestaurantList = getDefaultRestaurantList as jest.MockedFunction<
  typeof getDefaultRestaurantList
>;
const mockedGetRestaurantListDetail = getRestaurantListDetail as jest.MockedFunction<
  typeof getRestaurantListDetail
>;

describe('useWantToTryListRead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the existing default list and dependent detail query keys', () => {
    mockedUseQuery
      .mockReturnValueOnce({ data: { id: 'list_1' } } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({ data: { items: [] } } as ReturnType<typeof useQuery>);

    const result = useWantToTryListRead();

    expect(result.defaultListId).toBe('list_1');
    expect(mockedUseQuery).toHaveBeenNthCalledWith(1, expect.objectContaining({
      queryKey: restaurantListQueryKeys.defaultList,
    }));
    expect(mockedUseQuery).toHaveBeenNthCalledWith(2, expect.objectContaining({
      enabled: true,
      queryKey: restaurantListQueryKeys.detail('list_1'),
    }));
  });

  it('keeps the pending detail key and disabled state until the default list is known', () => {
    mockedUseQuery
      .mockReturnValueOnce({ data: null } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({ data: null } as ReturnType<typeof useQuery>);

    const result = useWantToTryListRead();

    expect(result.defaultListId).toBeUndefined();
    expect(mockedUseQuery).toHaveBeenNthCalledWith(2, expect.objectContaining({
      enabled: false,
      queryKey: restaurantListQueryKeys.detail('__default_list_pending__'),
    }));
  });

  it('loads every default-list detail page with AbortSignals', async () => {
    mockedUseQuery
      .mockReturnValueOnce({ data: { id: 'list_1' } } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({ data: { items: [] } } as ReturnType<typeof useQuery>);
    mockedGetDefaultRestaurantList.mockResolvedValue({ id: 'list_1' } as Awaited<ReturnType<typeof getDefaultRestaurantList>>);
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

    const defaultListOptions = mockedUseQuery.mock.calls[0]?.[0] as unknown as {
      queryFn: (input: { signal: AbortSignal }) => Promise<unknown>;
    };
    const detailOptions = mockedUseQuery.mock.calls[1]?.[0] as unknown as {
      queryFn: (input: { signal: AbortSignal }) => Promise<unknown>;
    };
    await defaultListOptions.queryFn({ signal: abortController.signal });
    const detail = await detailOptions.queryFn({ signal: abortController.signal });

    expect(mockedGetDefaultRestaurantList).toHaveBeenCalledWith({ signal: abortController.signal });
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
