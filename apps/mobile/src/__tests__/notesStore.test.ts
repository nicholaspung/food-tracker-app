import { ClientResponseError } from 'pocketbase';

import { markNoteUsed } from '../features/store/notesStore';
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
  authStore: {
    record: {
      collectionId: string;
      collectionName: string;
      id: string;
    } | null;
  };
  collection: jest.Mock;
};

function buildClientResponseError(status: number): ClientResponseError {
  return new ClientResponseError({
    response: {
      data: {},
      message: 'not found',
    },
    status,
    url: 'https://app.yummyrecs.com/api/notes/note-1',
  });
}

describe('notesStore.markNoteUsed', () => {
  beforeEach(() => {
    mockedPocketBase.collection.mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('updates the note directly without preloading it first', async () => {
    const notesCollection = {
      getOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    mockedPocketBase.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'notes') {
        return notesCollection;
      }

      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    await expect(
      markNoteUsed({
        noteId: '  note-1  ',
        usedAt: ' 2026-04-21T18:00:00.000Z ',
        usedInVisitId: ' visit-1 ',
        usedInFoodItemId: ' food-item-1 ',
      }),
    ).resolves.toBeUndefined();

    expect(notesCollection.getOne).not.toHaveBeenCalled();
    expect(notesCollection.update).toHaveBeenCalledWith('note-1', {
      status: 'used',
      usedAt: '2026-04-21T18:00:00.000Z',
      usedInVisit: 'visit-1',
      usedInFoodItem: 'food-item-1',
    }, {
      headers: undefined,
    });
  });

  it('treats missing notes as a no-op without issuing a prefetch', async () => {
    const notesCollection = {
      getOne: jest.fn(),
      update: jest.fn().mockRejectedValue(buildClientResponseError(404)),
    };

    mockedPocketBase.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'notes') {
        return notesCollection;
      }

      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    await expect(
      markNoteUsed({
        noteId: 'note-404',
        usedAt: '2026-04-21T18:00:00.000Z',
      }),
    ).resolves.toBeUndefined();

    expect(notesCollection.getOne).not.toHaveBeenCalled();
    expect(notesCollection.update).toHaveBeenCalledWith('note-404', {
      status: 'used',
      usedAt: '2026-04-21T18:00:00.000Z',
    }, {
      headers: undefined,
    });
  });
});
