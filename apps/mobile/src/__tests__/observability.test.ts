describe('observability', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('redacts identifier-like properties and warns once in development', () => {
    jest.isolateModules(() => {
      const capture = jest.fn();
      const warn = jest.fn();

      jest.doMock('posthog-react-native', () => ({
        PostHog: jest.fn().mockImplementation(() => ({
          capture,
          identify: jest.fn(),
          screen: jest.fn(),
          shutdown: jest.fn(),
        })),
      }));
      jest.doMock('../config/env', () => ({
        env: {
          appEnv: 'test',
          posthogApiKey: 'phc_test_key',
          posthogHost: 'https://app.posthog.com',
        },
      }));
      jest.doMock('../lib/logger', () => ({
        logger: {
          debug: jest.fn(),
          error: jest.fn(),
          info: jest.fn(),
          warn,
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const observabilityModule = require('../observability') as typeof import('../observability');
      const { initializeObservability, trackObservabilityEvent } = observabilityModule;

      initializeObservability();

      trackObservabilityEvent('TEST_EVENT', {
        allowed: 'value',
        nested: {
          keep: true,
          retainedIdentifierLikeKey: 'nested-values-are-unchanged',
        },
        restaurantName: 'Secret Restaurant',
        recordId: 'secret-record',
      });
      trackObservabilityEvent('TEST_EVENT', {
        allowed: 'next',
        restaurantName: 'Another Secret Restaurant',
        recordId: 'another-record',
      });

      expect(capture).toHaveBeenCalledTimes(2);
      expect(capture.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          allowed: 'value',
          nested: {
            keep: true,
            retainedIdentifierLikeKey: 'nested-values-are-unchanged',
          },
        }),
      );
      expect(capture.mock.calls[0][1].recordId).toBeUndefined();
      expect(capture.mock.calls[0][1].restaurantName).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        '[Observability] Redacted event properties before PostHog capture.',
        expect.objectContaining({
          eventName: 'TEST_EVENT',
          redactedKeys: ['recordId', 'restaurantName'],
        }),
      );
    });
  });

  it('captures handled errors with sanitized extra properties', () => {
    jest.isolateModules(() => {
      const captureException = jest.fn();

      jest.doMock('posthog-react-native', () => ({
        PostHog: jest.fn().mockImplementation(() => ({
          capture: jest.fn(),
          captureException,
          identify: jest.fn(),
          screen: jest.fn(),
          shutdown: jest.fn(),
        })),
      }));
      jest.doMock('../config/env', () => ({
        env: {
          appEnv: 'test',
          posthogApiKey: 'phc_test_key',
          posthogHost: 'https://app.posthog.com',
        },
      }));
      jest.doMock('../lib/logger', () => ({
        logger: {
          debug: jest.fn(),
          error: jest.fn(),
          info: jest.fn(),
          log: jest.fn(),
          warn: jest.fn(),
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const observabilityModule = require('../observability') as typeof import('../observability');
      const { captureObservabilityError, initializeObservability } = observabilityModule;
      const error = new Error('handled failure');

      initializeObservability();
      captureObservabilityError(error, {
        requestCorrelation: 'mobile-menu-scan-test',
        restaurantId: 'redacted',
      });

      expect(captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          requestCorrelation: 'mobile-menu-scan-test',
          source: 'capture_observability_error',
        }),
      );
      expect(captureException.mock.calls[0][1]).not.toHaveProperty('restaurantId');
    });
  });

  it('captures web pageview and pageleave events with sanitized URL properties', () => {
    jest.isolateModules(() => {
      const capture = jest.fn();

      jest.doMock('react-native', () => ({
        Platform: {
          OS: 'web',
        },
      }));
      jest.doMock('expo-constants', () => ({
        __esModule: true,
        default: {
          executionEnvironment: 'storeClient',
          expoConfig: {
            android: {
              versionCode: 1,
            },
            ios: {
              buildNumber: '1',
            },
            version: '1.0.0',
          },
          nativeAppVersion: '1.0.0',
          nativeBuildVersion: '1',
        },
      }));
      jest.doMock('posthog-react-native', () => ({
        PostHog: jest.fn().mockImplementation(() => ({
          capture,
          captureException: jest.fn(),
          identify: jest.fn(),
          reset: jest.fn(),
          screen: jest.fn(),
          shutdown: jest.fn(),
        })),
      }));
      jest.doMock('../config/env', () => ({
        env: {
          appEnv: 'test',
          posthogApiKey: 'phc_test_key',
          posthogHost: 'https://app.posthog.com',
        },
      }));
      jest.doMock('../lib/logger', () => ({
        logger: {
          debug: jest.fn(),
          error: jest.fn(),
          info: jest.fn(),
          log: jest.fn(),
          warn: jest.fn(),
        },
      }));

      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
          location: {
            host: 'app.yummyrecs.com',
            origin: 'https://app.yummyrecs.com',
            pathname: '/reset-password',
          },
        },
      });
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {
          referrer: 'https://example.com/landing',
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const observabilityModule = require('../observability') as typeof import('../observability');
      const { initializeObservability, trackWebPageLeave, trackWebPageView } = observabilityModule;

      initializeObservability();
      trackWebPageView({
        previousScreenName: null,
        screenName: 'ResetPassword',
      });
      trackWebPageLeave({
        durationMs: 1250,
        nextScreenName: 'Login',
        reason: 'navigation',
        screenName: 'ResetPassword',
      });

      expect(capture).toHaveBeenCalledWith(
        '$pageview',
        expect.objectContaining({
          $current_url: 'https://app.yummyrecs.com/reset-password',
          $host: 'app.yummyrecs.com',
          $pathname: '/reset-password',
          $referrer: 'https://example.com/landing',
          previousScreenName: null,
          screenName: 'ResetPassword',
        }),
      );
      expect(capture).toHaveBeenCalledWith(
        '$pageleave',
        expect.objectContaining({
          $current_url: 'https://app.yummyrecs.com/reset-password',
          durationMs: 1250,
          nextScreenName: 'Login',
          reason: 'navigation',
          screenName: 'ResetPassword',
        }),
      );
      expect(capture.mock.calls[0][1].$current_url).not.toContain('secret-token');
      expect(capture.mock.calls[0][1].$current_url).not.toContain('#step');
    });
  });

  it('does not capture canonical page events outside web', () => {
    jest.isolateModules(() => {
      const capture = jest.fn();

      jest.doMock('react-native', () => ({
        Platform: {
          OS: 'ios',
        },
      }));
      jest.doMock('expo-constants', () => ({
        __esModule: true,
        default: {
          executionEnvironment: 'storeClient',
          expoConfig: {
            android: {
              versionCode: 1,
            },
            ios: {
              buildNumber: '1',
            },
            version: '1.0.0',
          },
          nativeAppVersion: '1.0.0',
          nativeBuildVersion: '1',
        },
      }));
      jest.doMock('posthog-react-native', () => ({
        PostHog: jest.fn().mockImplementation(() => ({
          capture,
          captureException: jest.fn(),
          identify: jest.fn(),
          reset: jest.fn(),
          screen: jest.fn(),
          shutdown: jest.fn(),
        })),
      }));
      jest.doMock('../config/env', () => ({
        env: {
          appEnv: 'test',
          posthogApiKey: 'phc_test_key',
          posthogHost: 'https://app.posthog.com',
        },
      }));
      jest.doMock('../lib/logger', () => ({
        logger: {
          debug: jest.fn(),
          error: jest.fn(),
          info: jest.fn(),
          log: jest.fn(),
          warn: jest.fn(),
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const observabilityModule = require('../observability') as typeof import('../observability');
      const { initializeObservability, trackWebPageLeave, trackWebPageView } = observabilityModule;

      initializeObservability();
      trackWebPageView({
        previousScreenName: null,
        screenName: 'Home',
      });
      trackWebPageLeave({
        durationMs: 50,
        reason: 'app_background',
        screenName: 'Home',
      });

      expect(capture).not.toHaveBeenCalled();
    });
  });
});
