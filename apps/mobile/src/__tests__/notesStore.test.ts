import { File, UploadType } from 'expo-file-system';
import { ClientResponseError } from 'pocketbase';

import { createNote, markNoteUsed, updateNote } from '../features/store/notesStore';
import { pb } from '../lib/pocketbase';

const mockUpload = jest.fn();

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    upload: mockUpload,
  })),
  UploadType: {
    MULTIPART: 1,
  },
}));

jest.mock('../config/env', () => ({
  env: {
    pocketbaseUrl: 'https://api.example.test',
  },
}));

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
  authStore: {
    token: string;
    record: {
      collectionId: string;
      collectionName: string;
      id: string;
    } | null;
  };
  collection: jest.Mock;
};

const mockedFile = File as jest.MockedClass<typeof File>;

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
    mockUpload.mockReset();
    mockedFile.mockClear();
    mockedPocketBase.collection.mockReset();
    mockedPocketBase.authStore.token = 'auth-token-1';
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('uploads note photos through the native multipart file uploader', async () => {
    mockUpload.mockResolvedValue({
      body: '{}',
      headers: {},
      status: 200,
    });

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

    mockedPocketBase.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'notes') {
        return notesCollection;
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

    expect(mockedFile).toHaveBeenCalledWith('file:///photo.jpg');
    expect(mockUpload).toHaveBeenCalledWith(
      'https://api.example.test/api/collections/note_photos/records',
      {
        fieldName: 'photo',
        headers: {
          Authorization: 'Bearer auth-token-1',
        },
        httpMethod: 'POST',
        mimeType: 'image/jpeg',
        parameters: {
          capturedAt: '2024-09-15T12:34:56.000Z',
          note: 'note-1',
          user: 'user-1',
        },
        sessionType: 'foreground',
        uploadType: UploadType.MULTIPART,
      },
    );
  });

  it('omits capturedAt when updating note photo uploads without a capture date', async () => {
    mockUpload.mockResolvedValue({
      body: '{}',
      headers: {},
      status: 200,
    });

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

    mockedPocketBase.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'notes') {
        return notesCollection;
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

    expect(mockUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        parameters: {
          note: 'note-1',
          user: 'user-1',
        },
      }),
    );
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
    mockUpload.mockResolvedValue({
      body: JSON.stringify({
        data: {
          photo: {
            message: 'File is too large.',
          },
        },
        message: 'Failed to create record.',
      }),
      headers: {},
      status: 400,
    });

    mockedPocketBase.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'notes') {
        return notesCollection;
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

  it('preserves retryable photo errors and reuses the deterministic photo id', async () => {
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
    mockUpload.mockResolvedValue({
      body: JSON.stringify({
        data: {},
        message: 'Service Unavailable.',
      }),
      headers: {},
      status: 503,
    });
    mockedPocketBase.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'notes') {
        return notesCollection;
      }
      throw new Error(`Unexpected collection: ${collectionName}`);
    });
    const input = {
      title: '',
      content: 'Test note',
      photos: [{
        uri: 'file:///photo.jpg',
        name: 'photo.jpg',
        mimeType: 'image/jpeg',
      }],
    };
    const requestOptions = {
      headers: {
        'Idempotency-Key': 'note-photo-response-loss-1',
      },
    };

    await expect(createNote(input, requestOptions)).rejects.toMatchObject({ status: 503 });
    await expect(createNote(input, requestOptions)).rejects.toMatchObject({ status: 503 });

    const firstPhotoId = mockUpload.mock.calls[0]?.[1]?.parameters?.id;
    const replayPhotoId = mockUpload.mock.calls[1]?.[1]?.parameters?.id;
    expect(firstPhotoId).toMatch(/^i[a-z0-9]{14}$/);
    expect(replayPhotoId).toBe(firstPhotoId);
  });

  it('keeps duplicate create recovery retryable when the verification lookup fails', async () => {
    const notesCollection = {
      create: jest.fn().mockRejectedValue(buildClientResponseError(400)),
      getOne: jest.fn().mockRejectedValue(buildClientResponseError(503)),
    };
    mockedPocketBase.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'notes') {
        return notesCollection;
      }
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    await expect(
      createNote(
        {
          title: '',
          content: 'Response loss note',
          photos: [{
            uri: 'file:///photo.jpg',
            name: 'photo.jpg',
            mimeType: 'image/jpeg',
          }],
        },
        {
          headers: {
            'Idempotency-Key': 'note-create-response-loss-1',
          },
        },
      ),
    ).rejects.toMatchObject({ status: 503 });

    expect(notesCollection.getOne).toHaveBeenCalledTimes(1);
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
