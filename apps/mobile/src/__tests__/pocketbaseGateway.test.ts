import * as pocketbaseModule from '../lib/pocketbase';
import { trackObservabilityEvent } from '../observability';
import { listCollectionPage, listCollectionRecords, sendApiRequest } from '../features/store/pocketbaseGateway';

jest.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: {
      token: 'test-token',
    },
    collection: jest.fn(() => ({
      getList: jest.fn(),
    })),
    send: jest.fn(),
  },
  __mockGetList: jest.fn(),
  __mockSend: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

const mockedPocketbaseModule = pocketbaseModule as typeof pocketbaseModule & {
  __mockGetList: jest.Mock;
  __mockSend: jest.Mock;
};
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
  typeof trackObservabilityEvent
>;

describe('pocketbaseGateway', () => {
  beforeEach(() => {
    const mockCollection = mockedPocketbaseModule.pb.collection as jest.Mock;
    const mockSend = mockedPocketbaseModule.pb.send as jest.Mock;

    mockCollection.mockImplementation(() => ({
      getList: mockedPocketbaseModule.__mockGetList,
    }));
    mockCollection.mockClear();
    mockSend.mockImplementation(mockedPocketbaseModule.__mockSend);
    mockSend.mockClear();
    mockedPocketbaseModule.__mockGetList.mockReset();
    mockedPocketbaseModule.__mockSend.mockReset();
    mockedTrackObservabilityEvent.mockReset();
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

  it('adds bearer auth and json content-type to api requests', async () => {
    mockedPocketbaseModule.__mockSend.mockResolvedValue({ success: true });

    await sendApiRequest('/api/friends/invite', {
      method: 'POST',
      body: {
        code: 'FRIEND1',
      },
    });

    expect(mockedPocketbaseModule.__mockSend).toHaveBeenCalledWith('/api/friends/invite', {
      body: {
        code: 'FRIEND1',
      },
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'DIRECT_API_REQUEST_SUCCEEDED',
      expect.objectContaining({
        hasBody: true,
        isAuthenticated: true,
        method: 'POST',
        path: '/api/friends/invite',
      }),
    );
  });
});
