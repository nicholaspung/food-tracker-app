import AsyncStorage from '@react-native-async-storage/async-storage';

describe('productAnalytics', () => {
  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    await AsyncStorage.clear();
    globalThis.localStorage.clear();
  });

  it('tracks canonical product events with common analytics context', () => {
    jest.isolateModules(() => {
      const trackObservabilityEvent = jest.fn();
      const setObservabilityContext = jest.fn();

      jest.doMock('../observability', () => ({
        identifyObservabilityUser: jest.fn(),
        setObservabilityContext,
        trackObservabilityEvent,
      }));
      jest.doMock('../config/env', () => ({
        env: {
          environment: 'test',
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const analytics = require('../observability/productAnalytics') as typeof import('../observability/productAnalytics');

      analytics.setProductAnalyticsAnonymousId('anon-test');
      analytics.trackProductEvent('tracking.entry_completed', {
        entryType: 'food_product',
        source: 'add_tab',
        hasPhoto: false,
        itemCount: 1,
        ratingCount: 1,
        visibility: 'friends',
        completed: true,
      });

      expect(setObservabilityContext).toHaveBeenCalledWith({
        anonymousId: 'anon-test',
      });
      expect(trackObservabilityEvent).toHaveBeenCalledWith(
        'tracking.entry_completed',
        expect.objectContaining({
          anonymousId: 'anon-test',
          authStatus: 'unknown',
          completed: true,
          entryType: 'food_product',
          environment: 'test',
          platform: expect.any(String),
          userTier: null,
          visibility: 'friends',
        }),
      );
    });
  });

  it('identifies users with a stable non-raw user key', () => {
    jest.isolateModules(() => {
      const identifyObservabilityUser = jest.fn();

      jest.doMock('../observability', () => ({
        identifyObservabilityUser,
        setObservabilityContext: jest.fn(),
        trackObservabilityEvent: jest.fn(),
      }));
      jest.doMock('../config/env', () => ({
        env: {
          environment: 'test',
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const analytics = require('../observability/productAnalytics') as typeof import('../observability/productAnalytics');

      analytics.identifyProductAnalyticsUser({
        id: 'raw-pocketbase-id',
        email: 'person@example.com',
        verified: true,
      });

      expect(identifyObservabilityUser).toHaveBeenCalledWith(
        expect.stringMatching(/^usr_/),
        expect.objectContaining({
          userTier: 'free',
          verified: true,
        }),
      );
      expect(identifyObservabilityUser.mock.calls[0][0]).not.toBe('raw-pocketbase-id');
    });
  });

  it('tracks first food logged once per analytics identity', async () => {
    const trackObservabilityEvent = jest.fn();

    jest.doMock('../observability', () => ({
      identifyObservabilityUser: jest.fn(),
      setObservabilityContext: jest.fn(),
      trackObservabilityEvent,
    }));
    jest.doMock('../config/env', () => ({
      env: {
        environment: 'test',
      },
    }));

    globalThis.localStorage.setItem('analytics.product.firstFoodLogged', '1');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const analytics = require('../observability/productAnalytics') as typeof import('../observability/productAnalytics');

    const analyticsUser = {
      analyticsKey: 'safe-user-key',
      id: 'raw-pocketbase-id',
      email: 'person@example.com',
      verified: true,
    };
    analytics.identifyProductAnalyticsUser(
      analyticsUser as Parameters<typeof analytics.identifyProductAnalyticsUser>[0],
    );

    analytics.trackFirstFoodLogged({
      entryType: 'restaurant_visit',
      source: 'add_tab',
      hasPhoto: false,
      itemCount: 1,
      ratingCount: 1,
      visibility: 'friends',
      completed: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(trackObservabilityEvent).toHaveBeenCalledWith(
      'activation.first_food_logged',
      expect.objectContaining({
        entryType: 'restaurant_visit',
        userKey: 'safe-user-key',
      }),
    );

    trackObservabilityEvent.mockClear();
    analytics.trackFirstFoodLogged({
      entryType: 'restaurant_visit',
      source: 'add_tab',
      hasPhoto: false,
      itemCount: 1,
      ratingCount: 1,
      visibility: 'friends',
      completed: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(trackObservabilityEvent).not.toHaveBeenCalledWith(
      'activation.first_food_logged',
      expect.any(Object),
    );
  });
});
