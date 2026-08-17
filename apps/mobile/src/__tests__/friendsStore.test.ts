import { ClientResponseError } from 'pocketbase';

import { removeFriend } from '../features/store/friendsStore';
import { pb } from '../lib/pocketbase';

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
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

const mockedPocketBase = pb as typeof pb & {
  collection: jest.Mock;
};

describe('friendsStore.removeFriend', () => {
  it('treats an already-removed friendship as a successful replay', async () => {
    const deleteRecord = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(
        new ClientResponseError({
          response: { data: {}, message: 'Not found' },
          status: 404,
          url: 'https://api.example.test/api/collections/friendships/records/friendship-1',
        }),
      );
    mockedPocketBase.collection.mockReturnValue({ delete: deleteRecord });
    const requestOptions = {
      headers: { 'Idempotency-Key': 'friend-remove-response-loss-1' },
    };

    await removeFriend('friendship-1', requestOptions);
    await expect(removeFriend('friendship-1', requestOptions)).resolves.toBeUndefined();

    expect(deleteRecord).toHaveBeenCalledTimes(2);
  });
});
