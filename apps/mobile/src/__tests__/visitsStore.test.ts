import { ClientResponseError } from 'pocketbase';

import { getVisitById } from '../features/store/visitsStore';
import { sendApiRequest } from '../features/store/pocketbaseGateway';
import { pb } from '../lib/pocketbase';

jest.mock('../features/store/pocketbaseGateway', () => ({
  sendApiRequest: jest.fn(),
}));

jest.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: {
      record: {
        collectionId: 'users',
        collectionName: 'users',
        id: 'user-1',
      },
    },
    collection: jest.fn(),
  },
}));

const mockedSendApiRequest = sendApiRequest as jest.MockedFunction<typeof sendApiRequest>;
const mockedPocketBase = pb as typeof pb & {
  authStore: {
    record: {
      collectionId: string;
      collectionName: string;
      id: string;
    } | null;
  };
};

function buildClientResponseError(status: number): ClientResponseError {
  return new ClientResponseError({
    response: {
      data: {},
      message: 'not found',
    },
    status,
    url: 'https://app.yummyrecs.com/api/visits/visit-123',
  });
}

describe('visitsStore.getVisitById', () => {
  beforeEach(() => {
    mockedSendApiRequest.mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('loads visit detail through the visits api endpoint', async () => {
    const abortController = new AbortController();
    const visit = {
      id: 'visit-123',
      restaurantName: 'Noodle House',
      visitedAt: '2026-04-05T18:00:00Z',
      items: [],
      source: 'visit' as const,
      createdAt: '2026-04-05T18:00:00Z',
      updatedAt: '2026-04-05T18:00:00Z',
    };

    mockedSendApiRequest.mockResolvedValue(visit);

    await expect(getVisitById('visit-123', { signal: abortController.signal })).resolves.toMatchObject({
      ...visit,
      visibility: 'friends',
    });

    expect(mockedSendApiRequest).toHaveBeenCalledWith('/api/visits/visit-123', {
      method: 'GET',
      signal: abortController.signal,
    });
  });

  it('returns null when the user is not authenticated', async () => {
    mockedPocketBase.authStore.record = null;

    await expect(getVisitById('visit-123')).resolves.toBeNull();
    expect(mockedSendApiRequest).not.toHaveBeenCalled();
  });

  it('returns null when the api endpoint reports a missing visit', async () => {
    mockedSendApiRequest.mockRejectedValue(buildClientResponseError(404));

    await expect(getVisitById('visit-123')).resolves.toBeNull();
  });
});
