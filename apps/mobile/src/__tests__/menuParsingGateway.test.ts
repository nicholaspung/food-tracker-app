import { File, UploadType } from 'expo-file-system';

import * as pocketbaseModule from '../lib/pocketbase';
import {
  createMenuItemsFromScan,
  extractRestaurantNamesFromImage,
  parseMenuImage,
} from '../features/store/menuParsingGateway';

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
    send: jest.fn(),
  },
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

describe('menuParsingGateway', () => {
  const mockedPocketbaseModule = pocketbaseModule as typeof pocketbaseModule & {
    pb: {
      authStore: {
        token: string;
      };
      send: jest.Mock;
    };
  };
  const mockedFile = File as jest.MockedClass<typeof File>;

  beforeEach(() => {
    mockUpload.mockReset();
    mockedFile.mockClear();
    mockedPocketbaseModule.pb.send.mockReset();
    mockedPocketbaseModule.pb.authStore.token = 'test-token';
    jest.restoreAllMocks();
  });

  it('posts menu images with restaurant verification context', async () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    mockedPocketbaseModule.pb.send.mockResolvedValue({
      csv: 'menu_item,price\nRamen,12',
      verification: {
        checked: true,
        matched: true,
        confidence: 'high',
        observedRestaurantNames: ['Ichiran'],
      },
    });

    await parseMenuImage({
      mimeType: 'image/jpeg',
      name: 'menu.jpg',
      requestCorrelation: 'mobile-menu-scan-test',
      restaurantId: 'restaurant-1',
      restaurantName: 'Ichiran',
      uri: 'file:///menu.jpg',
    });

    expect(mockedPocketbaseModule.pb.send).toHaveBeenCalledWith(
      '/api/parse-menu',
      expect.objectContaining({
        body: expect.any(FormData),
        headers: expect.objectContaining({
          'X-Request-ID': 'mobile-menu-scan-test',
        }),
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(appendSpy).toHaveBeenCalledWith('restaurantId', 'restaurant-1');
    expect(appendSpy).toHaveBeenCalledWith('restaurantName', 'Ichiran');
  });

  it('omits blank request correlation headers', async () => {
    mockedPocketbaseModule.pb.send.mockResolvedValue({
      csv: 'menu_item,price\nRamen,12',
    });

    await parseMenuImage({
      mimeType: 'image/jpeg',
      name: 'menu.jpg',
      requestCorrelation: '   ',
      uri: 'file:///menu.jpg',
    });

    const [, options] = mockedPocketbaseModule.pb.send.mock.calls[0];
    expect(options.headers).not.toHaveProperty('X-Request-ID');
  });

  it('posts storefront images to restaurant-name extraction', async () => {
    mockUpload.mockResolvedValue({
      body: JSON.stringify({
        found: true,
        options: [{ confidence: 'high', name: '明洞餃子' }],
      }),
      headers: {},
      status: 200,
    });

    await extractRestaurantNamesFromImage({
      mimeType: 'image/jpeg',
      name: 'storefront.jpg',
      uri: 'file:///storefront.jpg',
    });

    expect(mockedFile).toHaveBeenCalledWith('file:///storefront.jpg');
    expect(mockUpload).toHaveBeenCalledWith('https://api.example.test/api/find-restaurant-name', {
      fieldName: 'image',
      headers: {
        Authorization: 'Bearer test-token',
      },
      httpMethod: 'POST',
      mimeType: 'image/jpeg',
      sessionType: 'foreground',
      uploadType: UploadType.MULTIPART,
    });
  });

  it('passes storefront request correlation headers', async () => {
    mockUpload.mockResolvedValue({
      body: JSON.stringify({
        found: true,
        options: [{ confidence: 'high', name: '明洞餃子' }],
      }),
      headers: {},
      status: 200,
    });

    await extractRestaurantNamesFromImage({
      mimeType: 'image/jpeg',
      name: 'storefront.jpg',
      requestCorrelation: 'mobile-storefront-test',
      uri: 'file:///storefront.jpg',
    });

    expect(mockUpload).toHaveBeenCalledWith(
      'https://api.example.test/api/find-restaurant-name',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token',
          'X-Request-ID': 'mobile-storefront-test',
        },
      }),
    );
  });

  it('omits blank storefront request correlation headers', async () => {
    mockUpload.mockResolvedValue({
      body: JSON.stringify({
        found: true,
        options: [{ confidence: 'high', name: '明洞餃子' }],
      }),
      headers: {},
      status: 200,
    });

    await extractRestaurantNamesFromImage({
      mimeType: 'image/jpeg',
      name: 'storefront.jpg',
      requestCorrelation: '   ',
      uri: 'file:///storefront.jpg',
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

  it('aborts menu image parsing if the API does not resolve', async () => {
    jest.useFakeTimers();
    mockedPocketbaseModule.pb.send.mockImplementation((_path: string, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      }),
    );

    const request = parseMenuImage({
      mimeType: 'image/jpeg',
      name: 'large-menu.jpg',
      uri: 'file:///large-menu.jpg',
    });
    const expectation = expect(request).rejects.toThrow(
      'Menu scanning took too long. Try again with a clearer or smaller photo.',
    );

    await jest.advanceTimersByTimeAsync(120_000);

    await expectation;
    const [, options] = mockedPocketbaseModule.pb.send.mock.calls[0];
    expect(options.signal.aborted).toBe(true);
    jest.useRealTimers();
  });

  it('aborts scanned menu item creation if saving does not resolve', async () => {
    jest.useFakeTimers();
    mockedPocketbaseModule.pb.send.mockImplementation((_path: string, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      }),
    );

    const request = createMenuItemsFromScan({
      itemNames: ['Ramen'],
      restaurantId: 'restaurant-1',
    });
    const expectation = expect(request).rejects.toThrow(
      'Menu items could not be saved before the request timed out. Try scanning again.',
    );

    await jest.advanceTimersByTimeAsync(30_000);

    await expectation;
    expect(mockedPocketbaseModule.pb.send).toHaveBeenCalledWith(
      '/api/menu-items/from-scan',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
    jest.useRealTimers();
  });
});
