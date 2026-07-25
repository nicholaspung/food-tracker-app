import { File, UploadType } from 'expo-file-system';
import { ClientResponseError } from 'pocketbase';

import { parseReceiptImage } from '../features/store/receiptParsingGateway';
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
    pocketbaseUrl: 'https://api.example.test/',
  },
}));

jest.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: {
      token: 'test-token',
    },
  },
}));

const mockedFile = File as jest.MockedClass<typeof File>;
const mockedPocketBase = pb as typeof pb & {
  authStore: {
    token: string;
  };
};

describe('receiptParsingGateway', () => {
  beforeEach(() => {
    mockUpload.mockReset();
    mockedFile.mockClear();
    mockedPocketBase.authStore.token = 'test-token';
    jest.useRealTimers();
  });

  it('uploads receipt images with the native multipart uploader', async () => {
    mockUpload.mockResolvedValue({
      body: JSON.stringify({
        confidence: 'high',
        debug: { model: 'gemini-test' },
        finalTotal: 14,
        items: [{ confidence: 'high', name: 'Ramen', price: 12 }],
        requestCorrelation: 'mobile-receipt-scan-test',
        subtotal: 12,
        tax: 2,
        warnings: [],
      }),
      headers: {},
      status: 200,
    });

    await parseReceiptImage({
      mimeType: 'image/jpeg',
      name: 'receipt.jpg',
      requestCorrelation: 'mobile-receipt-scan-test',
      uri: 'file:///receipt.jpg',
    });

    expect(mockedFile).toHaveBeenCalledWith('file:///receipt.jpg');
    expect(mockUpload).toHaveBeenCalledWith('https://api.example.test/api/parse-receipt', {
      fieldName: 'image',
      headers: {
        Authorization: 'Bearer test-token',
        'X-Request-ID': 'mobile-receipt-scan-test',
      },
      httpMethod: 'POST',
      mimeType: 'image/jpeg',
      sessionType: 'foreground',
      uploadType: UploadType.MULTIPART,
    });
  });

  it('omits blank request correlation headers', async () => {
    mockUpload.mockResolvedValue({
      body: JSON.stringify({
        confidence: 'high',
        items: [],
        requestCorrelation: 'server-generated',
        warnings: [],
      }),
      headers: {},
      status: 200,
    });

    await parseReceiptImage({
      mimeType: 'image/jpeg',
      name: 'receipt.jpg',
      requestCorrelation: '   ',
      uri: 'file:///receipt.jpg',
    });

    expect(mockUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token',
        },
      }),
    );
  });

  it('throws PocketBase response errors from native upload failures', async () => {
    mockUpload.mockResolvedValue({
      body: JSON.stringify({
        data: {},
        message: 'image file is required',
      }),
      headers: {},
      status: 400,
    });

    await expect(
      parseReceiptImage({
        mimeType: 'image/jpeg',
        name: 'receipt.jpg',
        uri: 'file:///receipt.jpg',
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'image file is required',
      },
      status: 400,
    } satisfies Partial<ClientResponseError>);
  });

  it('rejects malformed successful receipt scan responses at the gateway', async () => {
    mockUpload.mockResolvedValue({
      body: JSON.stringify({
        confidence: 'high',
        items: [{ confidence: 'high', name: 'Ramen', price: '12.00' }],
        requestCorrelation: 'mobile-receipt-scan-test',
        warnings: [],
      }),
      headers: {},
      status: 200,
    });

    await expect(
      parseReceiptImage({
        mimeType: 'image/jpeg',
        name: 'receipt.jpg',
        uri: 'file:///receipt.jpg',
      }),
    ).rejects.toThrow('Receipt scan returned an invalid response.');
  });

  it('aborts receipt image parsing if the native upload does not resolve', async () => {
    jest.useFakeTimers();
    mockUpload.mockImplementation(() => new Promise(() => undefined));

    const request = parseReceiptImage({
      mimeType: 'image/jpeg',
      name: 'large-receipt.jpg',
      uri: 'file:///large-receipt.jpg',
    });
    const expectation = expect(request).rejects.toThrow(
      'Receipt scanning took too long. Try again with a clearer or smaller photo.',
    );

    await jest.advanceTimersByTimeAsync(120_000);

    await expectation;
    jest.useRealTimers();
  });
});
