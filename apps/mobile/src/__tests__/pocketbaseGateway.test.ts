import * as pocketbaseModule from '../lib/pocketbase';
import { listCollectionPage, listCollectionRecords } from '../features/store/pocketbaseGateway';

jest.mock('../lib/pocketbase', () => ({
  pb: {
    collection: jest.fn(() => ({
      getList: jest.fn(),
    })),
  },
  __mockGetList: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

const mockedPocketbaseModule = pocketbaseModule as typeof pocketbaseModule & {
  __mockGetList: jest.Mock;
};

describe('pocketbaseGateway', () => {
  beforeEach(() => {
    const mockCollection = mockedPocketbaseModule.pb.collection as jest.Mock;

    mockCollection.mockImplementation(() => ({
      getList: mockedPocketbaseModule.__mockGetList,
    }));
    mockCollection.mockClear();
    mockedPocketbaseModule.__mockGetList.mockReset();
  });

  it('omits undefined filters from paginated collection requests', async () => {
    const mockCollection = mockedPocketbaseModule.pb.collection as jest.Mock;

    mockedPocketbaseModule.__mockGetList.mockResolvedValue({
      items: [],
      page: 1,
      perPage: 20,
      totalItems: 0,
      totalPages: 1,
    });

    await listCollectionPage('visits', {
      page: 1,
      pageSize: 20,
      filter: undefined,
      expand: 'restaurant,user',
      sort: '-visitDate',
    });

    expect(mockCollection).toHaveBeenCalledWith('visits');
    expect(mockedPocketbaseModule.__mockGetList).toHaveBeenCalledWith(1, 20, {
      expand: 'restaurant,user',
      sort: '-visitDate',
    });
  });

  it('omits undefined filters from multi-page collection requests', async () => {
    const mockCollection = mockedPocketbaseModule.pb.collection as jest.Mock;

    mockedPocketbaseModule.__mockGetList.mockResolvedValue({
      items: [],
      page: 1,
      perPage: 50,
      totalItems: 0,
      totalPages: 1,
    });

    await listCollectionRecords('food_items', {
      pageSize: 50,
      filter: undefined,
      fields: 'visit',
    });

    expect(mockCollection).toHaveBeenCalledWith('food_items');
    expect(mockedPocketbaseModule.__mockGetList).toHaveBeenCalledWith(1, 50, {
      fields: 'visit',
    });
  });
});
