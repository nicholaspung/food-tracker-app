import { File, UploadType } from 'expo-file-system';
import { ClientResponseError } from 'pocketbase';

import { getCollectionRecord } from '../features/store/pocketbaseGateway';
import { uploadVisitPhotos } from '../features/store/visitPhotoUploads';
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

jest.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: {
      token: 'auth-token-1',
    },
  },
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  getCollectionRecord: jest.fn(),
}));

const mockedFile = File as jest.MockedClass<typeof File>;
const mockedGetCollectionRecord = getCollectionRecord as jest.MockedFunction<
  typeof getCollectionRecord
>;
const mockedPocketBase = pb as typeof pb & {
  authStore: {
    token: string;
  };
};

describe('uploadVisitPhotos', () => {
  beforeEach(() => {
    mockUpload.mockReset();
    mockedFile.mockClear();
    mockedGetCollectionRecord.mockReset();
    mockedPocketBase.authStore.token = 'auth-token-1';
  });

  it('uploads visit photos through the native multipart file uploader', async () => {
    mockUpload.mockResolvedValue({
      body: '{}',
      headers: {},
      status: 200,
    });

    await uploadVisitPhotos(
      'visit-1',
      'food-item-1',
      'user-1',
      [
        {
          mimeType: 'image/jpeg',
          name: 'IMG_1.jpg',
          uri: 'file:///staged/IMG_1.jpg',
        },
      ],
      '  Great burger  ',
      {
        headers: {
          'X-Write-Mode': 'online',
        },
      },
    );

    expect(mockedFile).toHaveBeenCalledWith('file:///staged/IMG_1.jpg');
    expect(mockUpload).toHaveBeenCalledWith(
      'https://api.example.test/api/collections/visit_photos/records',
      {
        fieldName: 'photo',
        headers: {
          Authorization: 'Bearer auth-token-1',
          'X-Write-Mode': 'online',
        },
        httpMethod: 'POST',
        mimeType: 'image/jpeg',
        parameters: {
          caption: 'Great burger',
          food_item: 'food-item-1',
          user: 'user-1',
          visit: 'visit-1',
        },
        sessionType: 'foreground',
        uploadType: UploadType.MULTIPART,
      },
    );
  });

  it('keeps an explicit Authorization header from the write request options', async () => {
    mockUpload.mockResolvedValue({
      body: '{}',
      headers: {},
      status: 200,
    });

    await uploadVisitPhotos(
      undefined,
      'food-item-1',
      'user-1',
      [
        {
          mimeType: 'image/png',
          name: 'plate.png',
          uri: 'file:///staged/plate.png',
        },
      ],
      undefined,
      {
        headers: {
          Authorization: 'Bearer explicit-token',
        },
      },
    );

    expect(mockUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer explicit-token',
        },
        parameters: {
          food_item: 'food-item-1',
          user: 'user-1',
        },
      }),
    );
  });

  it('does not start a queued photo upload after replay cancellation', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadVisitPhotos(
        undefined,
        'food-item-1',
        'user-1',
        [
          {
            mimeType: 'image/png',
            name: 'private.png',
            uri: 'file:///staged/private.png',
          },
        ],
        undefined,
        {
          headers: {
            Authorization: 'Bearer account-a-token',
          },
          signal: controller.signal,
        },
      ),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('treats a committed replay photo as successful after an ambiguous upload failure', async () => {
    mockUpload.mockRejectedValue(new Error('connection lost after upload'));
    mockedGetCollectionRecord.mockResolvedValue({
      id: 'existing-photo',
      food_item: 'food-item-1',
      user: 'user-1',
    });

    await expect(
      uploadVisitPhotos(
        undefined,
        'food-item-1',
        'user-1',
        [
          {
            mimeType: 'image/png',
            name: 'private.png',
            uri: 'file:///staged/private.png',
          },
        ],
        undefined,
        {
          headers: {
            Authorization: 'Bearer account-a-token',
            'Idempotency-Key': 'food-product-replay-1',
          },
        },
      ),
    ).resolves.toBeUndefined();

    const uploadOptions = mockUpload.mock.calls[0]?.[1];
    const replayPhotoId = uploadOptions?.parameters?.id;
    expect(replayPhotoId).toMatch(/^i[a-z0-9]{14}$/);
    expect(mockedGetCollectionRecord).toHaveBeenCalledWith(
      'visit_photos',
      replayPhotoId,
      {
        fields: 'id,food_item,user',
        headers: {
          Authorization: 'Bearer account-a-token',
          'Idempotency-Key': 'food-product-replay-1',
        },
      },
    );
  });

  it('normalizes PocketBase field errors with the filename', async () => {
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

    await expect(
      uploadVisitPhotos('visit-1', 'food-item-1', 'user-1', [
        {
          mimeType: 'image/jpeg',
          name: 'IMG_1.jpg',
          uri: 'file:///staged/IMG_1.jpg',
        },
      ]),
    ).rejects.toThrow('Could not upload IMG_1.jpg: File is too large.');
  });

  it('preserves rate limit errors for write retry handling', async () => {
    mockUpload.mockResolvedValue({
      body: JSON.stringify({
        data: {},
        message: 'Too Many Requests.',
      }),
      headers: {},
      status: 429,
    });

    await expect(
      uploadVisitPhotos('visit-1', 'food-item-1', 'user-1', [
        {
          mimeType: 'image/jpeg',
          name: 'IMG_1.jpg',
          uri: 'file:///staged/IMG_1.jpg',
        },
      ]),
    ).rejects.toMatchObject({
      status: 429,
    });
  });

  it('preserves retryable server errors and reuses the deterministic photo id', async () => {
    mockUpload.mockResolvedValue({
      body: JSON.stringify({
        data: {},
        message: 'Service Unavailable.',
      }),
      headers: {},
      status: 503,
    });
    mockedGetCollectionRecord.mockRejectedValue(new ClientResponseError({
      response: {
        data: {},
        message: 'Not found.',
      },
      status: 404,
      url: 'https://api.example.test/api/collections/visit_photos/records/photo-1',
    }));
    const requestOptions = {
      headers: {
        'Idempotency-Key': 'visit-photo-response-loss-1',
      },
    };
    const photo = {
      mimeType: 'image/jpeg',
      name: 'IMG_1.jpg',
      uri: 'file:///staged/IMG_1.jpg',
    };

    await expect(
      uploadVisitPhotos('visit-1', 'food-item-1', 'user-1', [photo], undefined, requestOptions),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      uploadVisitPhotos('visit-1', 'food-item-1', 'user-1', [photo], undefined, requestOptions),
    ).rejects.toMatchObject({ status: 503 });

    const firstPhotoId = mockUpload.mock.calls[0]?.[1]?.parameters?.id;
    const replayPhotoId = mockUpload.mock.calls[1]?.[1]?.parameters?.id;
    expect(firstPhotoId).toMatch(/^i[a-z0-9]{14}$/);
    expect(replayPhotoId).toBe(firstPhotoId);
  });

  it('preserves a retryable deterministic-photo verification failure', async () => {
    mockUpload.mockResolvedValue({
      body: JSON.stringify({
        data: {},
        message: 'Record already exists.',
      }),
      headers: {},
      status: 400,
    });
    mockedGetCollectionRecord.mockRejectedValue(new ClientResponseError({
      response: {
        data: {},
        message: 'Service Unavailable.',
      },
      status: 503,
      url: 'https://api.example.test/api/collections/visit_photos/records/photo-1',
    }));

    await expect(
      uploadVisitPhotos(
        'visit-1',
        'food-item-1',
        'user-1',
        [{
          mimeType: 'image/jpeg',
          name: 'IMG_1.jpg',
          uri: 'file:///staged/IMG_1.jpg',
        }],
        undefined,
        {
          headers: {
            'Idempotency-Key': 'visit-photo-response-loss-2',
          },
        },
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
