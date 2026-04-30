import { ClientResponseError } from 'pocketbase';

import { createNote, markNoteUsed, updateNote } from '../features/store/notesStore';
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

const OriginalFormData = globalThis.FormData;

class MockFormData {
  _parts: [string, unknown][] = [];

  append(key: string, value: unknown) {
    this._parts.push([key, value]);
  }
}

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

describe('notesStore note photo uploads', () => {
  beforeEach(() => {
    mockedPocketBase.collection.mockReset();
    globalThis.FormData = MockFormData as unknown as typeof FormData;
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  afterEach(() => {
    globalThis.FormData = OriginalFormData;
  });

  function getFormDataParts(formData: unknown): [string, unknown][] {
    return ((formData as { _parts?: [string, unknown][] })._parts ?? []) as [string, unknown][];
  }

  it('appends capturedAt when creating note photo uploads', async () => {
    const notesCollection = {
      create: jest.fn().mockResolvedValue({
        id: 'note-1',
        user: 'user-1',
        content: 'Test note',
        status: 'draft',
        created: '2026-04-28T12:00:00.000Z',
        updated: '2026-04-28T12:00:00.000Z',
      }),
    };
    const notePhotosCollection = {
      create: jest.fn().mockResolvedValue({}),
    };

    mockedPocketBase.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'notes') {
        return notesCollection;
      }
      if (collectionName === 'note_photos') {
        return notePhotosCollection;
      }

      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    await createNote({
      title: '',
      content: 'Test note',
      photos: [
        {
          uri: 'file:///photo.jpg',
          name: 'photo.jpg',
          mimeType: 'image/jpeg',
          capturedAt: '2024-09-15T12:34:56.000Z',
        },
      ],
    });

    const formData = notePhotosCollection.create.mock.calls[0][0];
    expect(getFormDataParts(formData)).toEqual(
      expect.arrayContaining([
        ['note', 'note-1'],
        ['user', 'user-1'],
        ['capturedAt', '2024-09-15T12:34:56.000Z'],
      ]),
    );
  });

  it('omits capturedAt when updating note photo uploads without a capture date', async () => {
    const notesCollection = {
      update: jest.fn().mockResolvedValue({
        id: 'note-1',
        user: 'user-1',
        content: 'Updated note',
        status: 'draft',
        created: '2026-04-28T12:00:00.000Z',
        updated: '2026-04-28T12:05:00.000Z',
      }),
    };
    const notePhotosCollection = {
      create: jest.fn().mockResolvedValue({}),
    };

    mockedPocketBase.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'notes') {
        return notesCollection;
      }
      if (collectionName === 'note_photos') {
        return notePhotosCollection;
      }

      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    await updateNote('note-1', {
      content: 'Updated note',
      newPhotos: [
        {
          uri: 'file:///photo.jpg',
          name: 'photo.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });

    const formData = notePhotosCollection.create.mock.calls[0][0];
    expect(getFormDataParts(formData).some(([key]) => key === 'capturedAt')).toBe(false);
  });

  it('normalizes note photo upload validation errors with the filename', async () => {
    const notesCollection = {
      create: jest.fn().mockResolvedValue({
        id: 'note-1',
        user: 'user-1',
        content: 'Test note',
        status: 'draft',
        created: '2026-04-28T12:00:00.000Z',
        updated: '2026-04-28T12:00:00.000Z',
      }),
    };
    const notePhotosCollection = {
      create: jest.fn().mockRejectedValue(
        new ClientResponseError({
          response: {
            data: {
              photo: {
                message: 'File is too large.',
              },
            },
            message: 'Failed to create record.',
          },
          status: 400,
          url: 'https://app.yummyrecs.com/api/collections/note_photos/records',
        }),
      ),
    };

    mockedPocketBase.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'notes') {
        return notesCollection;
      }
      if (collectionName === 'note_photos') {
        return notePhotosCollection;
      }

      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    await expect(
      createNote({
        title: '',
        content: 'Test note',
        photos: [
          {
            uri: 'file:///large-photo.jpg',
            name: 'large-photo.jpg',
            mimeType: 'image/jpeg',
          },
        ],
      }),
    ).rejects.toThrow('Could not upload large-photo.jpg: File is too large.');
  });
});
