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
        recordId: 'secret-record',
      });
      trackObservabilityEvent('TEST_EVENT', {
        allowed: 'next',
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
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        '[Observability] Redacted event properties before PostHog capture.',
        expect.objectContaining({
          eventName: 'TEST_EVENT',
          redactedKeys: ['recordId'],
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
});
