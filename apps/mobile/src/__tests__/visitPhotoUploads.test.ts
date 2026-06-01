import { File, UploadType } from 'expo-file-system';

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

const mockedFile = File as jest.MockedClass<typeof File>;
const mockedPocketBase = pb as typeof pb & {
  authStore: {
    token: string;
  };
};

describe('uploadVisitPhotos', () => {
  beforeEach(() => {
    mockUpload.mockReset();
    mockedFile.mockClear();
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
});
