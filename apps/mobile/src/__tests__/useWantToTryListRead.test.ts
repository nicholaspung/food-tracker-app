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

  it('forwards AbortSignals through both query functions', async () => {
    mockedUseQuery
      .mockReturnValueOnce({ data: { id: 'list_1' } } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({ data: { items: [] } } as ReturnType<typeof useQuery>);
    mockedGetDefaultRestaurantList.mockResolvedValue({ id: 'list_1' } as Awaited<ReturnType<typeof getDefaultRestaurantList>>);
    mockedGetRestaurantListDetail.mockResolvedValue(
      { items: [] } as unknown as Awaited<ReturnType<typeof getRestaurantListDetail>>,
    );
    const abortController = new AbortController();

    useWantToTryListRead();

    const defaultListOptions = mockedUseQuery.mock.calls[0]?.[0] as unknown as {
      queryFn: (input: { signal: AbortSignal }) => Promise<unknown>;
    };
    const detailOptions = mockedUseQuery.mock.calls[1]?.[0] as unknown as {
      queryFn: (input: { signal: AbortSignal }) => Promise<unknown>;
    };
    await defaultListOptions.queryFn({ signal: abortController.signal });
    await detailOptions.queryFn({ signal: abortController.signal });

    expect(mockedGetDefaultRestaurantList).toHaveBeenCalledWith({ signal: abortController.signal });
    expect(mockedGetRestaurantListDetail).toHaveBeenCalledWith('list_1', { signal: abortController.signal });
  });
});
