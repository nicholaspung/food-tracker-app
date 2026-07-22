import { ClientResponseError } from 'pocketbase';

import * as pocketbaseModule from '../lib/pocketbase';
import { trackObservabilityEvent } from '../observability';
import {
  buildPocketBaseFileUrl,
  confirmUserEmailVerification,
  listCollectionPage,
  listCollectionRecords,
  sendApiRequest,
} from '../features/store/pocketbaseGateway';

jest.mock('../lib/pocketbase', () => ({
  getPocketBaseFileAccessToken: jest.fn(),
  pb: {
    authStore: {
      token: 'test-token',
    },
    collection: jest.fn(() => ({
      confirmVerification: jest.fn(),
      getList: jest.fn(),
    })),
    files: {
      getURL: jest.fn(),
    },
    send: jest.fn(),
  },
  __mockConfirmVerification: jest.fn(),
  __mockGetList: jest.fn(),
  __mockSend: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

const mockedPocketbaseModule = pocketbaseModule as typeof pocketbaseModule & {
  __mockConfirmVerification: jest.Mock;
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
      confirmVerification: mockedPocketbaseModule.__mockConfirmVerification,
      getList: mockedPocketbaseModule.__mockGetList,
    }));
    mockCollection.mockClear();
    mockSend.mockImplementation(mockedPocketbaseModule.__mockSend);
    mockSend.mockClear();
    mockedPocketbaseModule.__mockConfirmVerification.mockReset();
    mockedPocketbaseModule.__mockGetList.mockReset();
    mockedPocketbaseModule.__mockSend.mockReset();
    jest.mocked(mockedPocketbaseModule.getPocketBaseFileAccessToken).mockReset();
    jest.mocked(mockedPocketbaseModule.pb.files.getURL).mockReset();
    mockedTrackObservabilityEvent.mockReset();
  });

  it('adds the private file token to generated photo URLs', () => {
    jest.mocked(mockedPocketbaseModule.getPocketBaseFileAccessToken).mockReturnValue('private-file-token');
    jest.mocked(mockedPocketbaseModule.pb.files.getURL).mockReturnValue('https://files.example/photo');

    const url = buildPocketBaseFileUrl({
      collectionName: 'visit_photos',
      recordId: 'photo-1',
      filename: 'ramen.jpg',
      thumb: '100x100',
    });

    expect(url).toBe('https://files.example/photo');
    expect(mockedPocketbaseModule.pb.files.getURL).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionName: 'visit_photos',
        id: 'photo-1',
      }),
      'ramen.jpg',
      { thumb: '100x100', token: 'private-file-token' },
    );
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

  it('forwards AbortSignal to paginated collection requests', async () => {
    const abortController = new AbortController();

    mockedPocketbaseModule.__mockGetList.mockResolvedValue({
      items: [],
      page: 1,
      perPage: 20,
      totalItems: 0,
      totalPages: 1,
    });

    await listCollectionPage('restaurants', {
      page: 1,
      pageSize: 20,
      filter: 'name ~ "pizza"',
      signal: abortController.signal,
    });

    expect(mockedPocketbaseModule.__mockGetList).toHaveBeenCalledWith(1, 20, {
      filter: 'name ~ "pizza"',
      signal: abortController.signal,
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

  it('confirms email verification with auto-cancel disabled', async () => {
    mockedPocketbaseModule.__mockConfirmVerification.mockResolvedValue(true);

    await confirmUserEmailVerification('verification-token');

    expect(mockedPocketbaseModule.pb.collection).toHaveBeenCalledWith('users');
    expect(mockedPocketbaseModule.__mockConfirmVerification).toHaveBeenCalledWith('verification-token', {
      requestKey: null,
    });
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'AUTH_EMAIL_VERIFICATION_CONFIRM_SUCCEEDED',
      expect.objectContaining({
        attempt: 1,
        source: 'pocketbaseGateway',
      }),
    );
  });

  it('retries statusless PocketBase verification confirmation failures once', async () => {
    mockedPocketbaseModule.__mockConfirmVerification
      .mockRejectedValueOnce(new ClientResponseError({ status: 0 }))
      .mockResolvedValueOnce(true);

    await confirmUserEmailVerification('verification-token');

    expect(mockedPocketbaseModule.__mockConfirmVerification).toHaveBeenCalledTimes(2);
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'AUTH_EMAIL_VERIFICATION_CONFIRM_RETRYING',
      expect.objectContaining({
        attempt: 1,
        errorCategory: 'transport_error',
        source: 'pocketbaseGateway',
      }),
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'AUTH_EMAIL_VERIFICATION_CONFIRM_SUCCEEDED',
      expect.objectContaining({
        attempt: 2,
        source: 'pocketbaseGateway',
      }),
    );
  });

  it('does not retry HTTP verification confirmation failures', async () => {
    mockedPocketbaseModule.__mockConfirmVerification.mockRejectedValue(new ClientResponseError({ status: 400 }));

    await expect(confirmUserEmailVerification('verification-token')).rejects.toBeInstanceOf(ClientResponseError);

    expect(mockedPocketbaseModule.__mockConfirmVerification).toHaveBeenCalledTimes(1);
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'AUTH_EMAIL_VERIFICATION_CONFIRM_FAILED',
      expect.objectContaining({
        attempt: 1,
        errorMessage: 'HTTP 400',
        source: 'pocketbaseGateway',
        statusCode: 400,
      }),
    );
  });
});
