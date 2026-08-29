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

  it('allows the generated product analytics anonymous id without redaction warnings', () => {
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
          log: jest.fn(),
          warn,
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const observabilityModule = require('../observability') as typeof import('../observability');
      const { initializeObservability, trackObservabilityEvent } = observabilityModule;

      initializeObservability();
      trackObservabilityEvent('TEST_EVENT', {
        anonymousId: 'anon-test',
      });

      expect(capture).toHaveBeenCalledWith(
        'TEST_EVENT',
        expect.objectContaining({
          anonymousId: 'anon-test',
        }),
      );
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('allows non-user platform update identifiers without redaction warnings', () => {
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
      trackObservabilityEvent('OTA_AUTO_CHECK_SKIPPED', {
        currentUpdateId: 'update-123',
        updateId: 'update-456',
      });

      expect(capture).toHaveBeenCalledWith(
        'OTA_AUTO_CHECK_SKIPPED',
        expect.objectContaining({
          currentUpdateId: 'update-123',
          updateId: 'update-456',
        }),
      );
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('keeps onboarding card IDs because they are finite analytics dimensions', () => {
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
          log: jest.fn(),
          warn,
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const observabilityModule = require('../observability') as typeof import('../observability');
      const { initializeObservability, trackObservabilityEvent } = observabilityModule;

      initializeObservability();
      trackObservabilityEvent('MORE_ONBOARDING_CARD_CTA_TAPPED', {
        cardId: 'tipCalculator',
        source: 'MoreFeatureOnboardingScreen',
      });

      expect(capture).toHaveBeenCalledWith(
        'MORE_ONBOARDING_CARD_CTA_TAPPED',
        expect.objectContaining({
          cardId: 'tipCalculator',
          source: 'MoreFeatureOnboardingScreen',
        }),
      );
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('keeps tutorial IDs because they are finite analytics dimensions', () => {
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
          log: jest.fn(),
          warn,
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const observabilityModule = require('../observability') as typeof import('../observability');
      const { initializeObservability, trackObservabilityEvent } = observabilityModule;

      initializeObservability();
      trackObservabilityEvent('PROFILE_TUTORIAL_OPENED', {
        source: 'profile',
        tutorialId: 'tipCalculator',
      });

      expect(capture).toHaveBeenCalledWith(
        'PROFILE_TUTORIAL_OPENED',
        expect.objectContaining({
          source: 'profile',
          tutorialId: 'tipCalculator',
        }),
      );
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('keeps boolean identifier presence flags while redacting actual identifiers', () => {
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
          log: jest.fn(),
          warn,
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const observabilityModule = require('../observability') as typeof import('../observability');
      const { initializeObservability, trackObservabilityEvent } = observabilityModule;

      initializeObservability();
      trackObservabilityEvent('FEATURE_MUTATION_STARTED', {
        hasMenuItemId: true,
        menuItemId: 'secret-menu-item-id',
      });

      expect(capture).toHaveBeenCalledWith(
        'FEATURE_MUTATION_STARTED',
        expect.objectContaining({
          hasMenuItemId: true,
        }),
      );
      expect(capture.mock.calls[0][1]).not.toHaveProperty('menuItemId');
      expect(warn).toHaveBeenCalledWith(
        '[Observability] Redacted event properties before PostHog capture.',
        expect.objectContaining({
          eventName: 'FEATURE_MUTATION_STARTED',
          redactedKeys: ['menuItemId'],
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
          nativeAppVersion: '9.9.9',
          nativeBuildVersion: '7',
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
          appVersion: '1.0.0',
          buildVersion: '7',
          executionEnvironment: 'storeClient',
          platform: 'web',
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
