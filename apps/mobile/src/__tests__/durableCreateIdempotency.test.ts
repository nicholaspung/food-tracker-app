import { createFeedback } from '../features/store/feedbackStore';
import { createNote } from '../features/store/notesStore';
import { createRestaurantList } from '../features/store/restaurantListsStore';
import { pb } from '../lib/pocketbase';

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: {
      token: 'auth-token-1',
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

const requestOptions = {
  headers: {
    'Idempotency-Key': 'response-loss-1',
  },
};

function replayingCollection(record: Record<string, unknown>) {
  let createAttempt = 0;
  return {
    create: jest.fn().mockImplementation(async (payload: Record<string, unknown>) => {
      createAttempt += 1;
      if (createAttempt > 1) {
        throw new Error('duplicate deterministic record id');
      }
      return { ...record, id: payload.id };
    }),
    getOne: jest.fn().mockImplementation(async (recordId: string) => ({ ...record, id: recordId })),
  };
}

describe('durable collection creates', () => {
  beforeEach(() => {
    mockedPocketBase.collection.mockReset();
  });

  it.each([
    {
      collectionName: 'notes',
      record: {
        user: 'user-1',
        content: 'Remember this',
        status: 'draft',
        created: '2026-08-16T12:00:00.000Z',
        updated: '2026-08-16T12:00:00.000Z',
      },
      submit: () => createNote({ title: '', content: 'Remember this' }, requestOptions),
    },
    {
      collectionName: 'feedback',
      record: {
        user: 'user-1',
        title: 'Offline feedback',
        description: 'Details',
        status: 'open',
        created: '2026-08-16T12:00:00.000Z',
        updated: '2026-08-16T12:00:00.000Z',
      },
      submit: () => createFeedback({ title: 'Offline feedback', description: 'Details' }, requestOptions),
    },
    {
      collectionName: 'restaurant_lists',
      record: {
        user: 'user-1',
        name: 'Weekend spots',
        description: '',
        visibility: 'private',
        created: '2026-08-16T12:00:00.000Z',
        updated: '2026-08-16T12:00:00.000Z',
      },
      submit: () => createRestaurantList({ name: 'Weekend spots', visibility: 'private' }, requestOptions),
    },
  ])('returns the existing $collectionName record after a lost create response', async ({
    collectionName,
    record,
    submit,
  }) => {
    const collection = replayingCollection(record);
    mockedPocketBase.collection.mockImplementation((requestedCollection: string) => {
      if (requestedCollection === collectionName) {
        return collection;
      }
      throw new Error(`Unexpected collection: ${requestedCollection}`);
    });

    const firstResult = await submit();
    await expect(submit()).resolves.toMatchObject({ id: firstResult.id });

    const firstPayload = collection.create.mock.calls[0][0] as Record<string, unknown>;
    const replayPayload = collection.create.mock.calls[1][0] as Record<string, unknown>;
    expect(firstPayload.id).toEqual(expect.any(String));
    expect(replayPayload.id).toBe(firstPayload.id);
    expect(collection.getOne).toHaveBeenCalledWith(firstPayload.id, expect.any(Object));
  });
});
