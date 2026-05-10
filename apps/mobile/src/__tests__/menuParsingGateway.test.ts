import * as pocketbaseModule from '../lib/pocketbase';
import {
  extractRestaurantNamesFromImage,
  parseMenuImage,
} from '../features/store/menuParsingGateway';

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
      send: jest.Mock;
    };
  };

  beforeEach(() => {
    mockedPocketbaseModule.pb.send.mockReset();
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
    mockedPocketbaseModule.pb.send.mockResolvedValue({
      found: true,
      options: [{ confidence: 'high', name: '明洞餃子' }],
    });

    await extractRestaurantNamesFromImage({
      mimeType: 'image/jpeg',
      name: 'storefront.jpg',
      uri: 'file:///storefront.jpg',
    });

    expect(mockedPocketbaseModule.pb.send).toHaveBeenCalledWith(
      '/api/find-restaurant-name',
      expect.objectContaining({
        body: expect.any(FormData),
        method: 'POST',
      }),
    );
  });
});
