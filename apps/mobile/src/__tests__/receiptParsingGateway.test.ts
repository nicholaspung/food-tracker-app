import * as pocketbaseModule from '../lib/pocketbase';
import { parseReceiptImage } from '../features/store/receiptParsingGateway';

jest.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: {
      token: 'test-token',
    },
    send: jest.fn(),
  },
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

describe('receiptParsingGateway', () => {
  const mockedPocketbaseModule = pocketbaseModule as typeof pocketbaseModule & {
    pb: {
      send: jest.Mock;
    };
  };

  beforeEach(() => {
    mockedPocketbaseModule.pb.send.mockReset();
    jest.restoreAllMocks();
  });

  it('posts receipt images with request correlation headers', async () => {
    mockedPocketbaseModule.pb.send.mockResolvedValue({
      confidence: 'high',
      items: [{ confidence: 'high', name: 'Ramen', price: 12 }],
      requestCorrelation: 'mobile-receipt-scan-test',
      warnings: [],
    });

    await parseReceiptImage({
      mimeType: 'image/jpeg',
      name: 'receipt.jpg',
      requestCorrelation: 'mobile-receipt-scan-test',
      uri: 'file:///receipt.jpg',
    });

    expect(mockedPocketbaseModule.pb.send).toHaveBeenCalledWith(
      '/api/parse-receipt',
      expect.objectContaining({
        body: expect.any(FormData),
        headers: expect.objectContaining({
          'X-Request-ID': 'mobile-receipt-scan-test',
        }),
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('omits blank request correlation headers', async () => {
    mockedPocketbaseModule.pb.send.mockResolvedValue({
      confidence: 'high',
      items: [],
      requestCorrelation: 'server-generated',
      warnings: [],
    });

    await parseReceiptImage({
      mimeType: 'image/jpeg',
      name: 'receipt.jpg',
      requestCorrelation: '   ',
      uri: 'file:///receipt.jpg',
    });

    const [, options] = mockedPocketbaseModule.pb.send.mock.calls[0];
    expect(options.headers).not.toHaveProperty('X-Request-ID');
  });

  it('aborts receipt image parsing if the API does not resolve', async () => {
    jest.useFakeTimers();
    mockedPocketbaseModule.pb.send.mockImplementation((_path: string, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      }),
    );

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
    const [, options] = mockedPocketbaseModule.pb.send.mock.calls[0];
    expect(options.signal.aborted).toBe(true);
    jest.useRealTimers();
  });
});
