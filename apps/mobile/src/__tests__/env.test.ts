import { loadMobileEnv, resolveAppEnvironment } from '../config/env';
import {
  assertSafeMobileBackendConfiguration,
  assertSafeMobileReleaseBuildBackendConfiguration,
  shouldEnforceReleaseBuildBackendGuard,
} from '../config/envUtils';

describe('loadMobileEnv', () => {
  it('falls back to defaults when env values are missing', () => {
    const env = loadMobileEnv({});

    expect(env.environment).toBe('local');
    expect(env.adminUrl).toBe('http://localhost:5173');
    expect(env.apiBaseUrl).toBe('http://127.0.0.1:8090');
    expect(env.appWebUrl).toBe('http://localhost:8081');
    expect(env.iosAppStoreUrl).toBe('https://apps.apple.com/us/app/yummy-recs/id6761597807');
    expect(env.marketingUrl).toBe('http://localhost:4173');
    expect(env.pocketbaseUrl).toBe('http://127.0.0.1:8090');
    expect(env.posthogHost).toBe('http://127.0.0.1:8090/api/analytics');
  });

  it('uses explicit environment values when provided', () => {
    const env = loadMobileEnv(
      {
        EXPO_PUBLIC_APP_ENV: 'beta',
        EXPO_PUBLIC_API_BASE_URL: 'https://beta.app.yummyrecs.com',
        EXPO_PUBLIC_ADMIN_URL: 'https://admin.yummyrecs.com',
        EXPO_PUBLIC_APP_WEB_URL: 'https://app.yummyrecs.com',
        EXPO_PUBLIC_IOS_APP_STORE_URL: 'https://apps.apple.com/us/app/test-app/id1234567890',
        EXPO_PUBLIC_MARKETING_URL: 'https://yummyrecs.com',
        EXPO_PUBLIC_POCKETBASE_URL: 'https://beta.app.yummyrecs.com',
        EXPO_PUBLIC_POSTHOG_API_KEY: 'test_key',
        EXPO_PUBLIC_POSTHOG_HOST: 'https://analytics.yummyrecs.com',
      },
    );

    expect(env.environment).toBe('beta');
    expect(env.adminUrl).toBe('https://admin.yummyrecs.com');
    expect(env.apiBaseUrl).toBe('https://beta.app.yummyrecs.com');
    expect(env.appWebUrl).toBe('https://app.yummyrecs.com');
    expect(env.iosAppStoreUrl).toBe('https://apps.apple.com/us/app/test-app/id1234567890');
    expect(env.marketingUrl).toBe('https://yummyrecs.com');
    expect(env.pocketbaseUrl).toBe('https://beta.app.yummyrecs.com');
    expect(env.posthogApiKey).toBe('test_key');
    expect(env.posthogHost).toBe('https://analytics.yummyrecs.com');
  });

  it('rejects non-local backend URL mismatches at startup', () => {
    expect(() =>
      loadMobileEnv({
        EXPO_PUBLIC_APP_ENV: 'beta',
        EXPO_PUBLIC_API_BASE_URL: 'https://api.yummyrecs.com',
        EXPO_PUBLIC_POCKETBASE_URL: 'https://pb.yummyrecs.com',
      }),
    ).toThrow(
      'Mobile backend config mismatch for beta: EXPO_PUBLIC_API_BASE_URL (https://api.yummyrecs.com) must match EXPO_PUBLIC_POCKETBASE_URL (https://pb.yummyrecs.com).',
    );
  });

  it('rejects non-local backends that resolve to localhost', () => {
    expect(() =>
      loadMobileEnv({
        EXPO_PUBLIC_APP_ENV: 'production',
        EXPO_PUBLIC_API_BASE_URL: 'http://127.0.0.1:8090',
        EXPO_PUBLIC_POCKETBASE_URL: 'http://127.0.0.1:8090',
      }),
    ).toThrow(
      'Mobile production backend config must not resolve to a local URL. Received http://127.0.0.1:8090 and http://127.0.0.1:8090.',
    );
  });

  it('uses beta defaults when the app environment is beta', () => {
    const env = loadMobileEnv({ EXPO_PUBLIC_APP_ENV: 'beta' });

    expect(env.environment).toBe('beta');
    expect(env.apiBaseUrl).toBe('https://beta.app.yummyrecs.com');
    expect(env.pocketbaseUrl).toBe('https://beta.app.yummyrecs.com');
    expect(env.appWebUrl).toBe('https://beta.app.yummyrecs.com');
    expect(env.adminUrl).toBe('https://beta.admin.yummyrecs.com');
    expect(env.iosAppStoreUrl).toBe('https://apps.apple.com/us/app/yummy-recs/id6761597807');
    expect(env.marketingUrl).toBe('https://beta.yummyrecs.com');
    expect(env.posthogHost).toBe('https://beta.app.yummyrecs.com/api/analytics');
  });
});

describe('resolveAppEnvironment', () => {
  it('maps production aliases to production', () => {
    expect(resolveAppEnvironment({ EXPO_PUBLIC_APP_ENV: 'prod' })).toBe('production');
  });

  it('infers beta from deployed beta origins', () => {
    expect(resolveAppEnvironment({}, 'https://beta.app.yummyrecs.com')).toBe('beta');
  });
});

describe('release build backend guard', () => {
  it('detects release-oriented build contexts', () => {
    expect(
      shouldEnforceReleaseBuildBackendGuard({
        EAS_BUILD_PROFILE: 'preview',
      }),
    ).toBe(true);

    expect(
      shouldEnforceReleaseBuildBackendGuard({
        NODE_ENV: 'development',
      }),
    ).toBe(false);
  });
});

describe('assertSafeMobileBackendConfiguration', () => {
  it('allows local development backend divergence', () => {
    expect(() =>
      assertSafeMobileBackendConfiguration({
        apiBaseUrl: 'http://localhost:3000',
        environment: 'local',
        pocketbaseUrl: 'http://127.0.0.1:8090',
      }),
    ).not.toThrow();
  });
});

describe('assertSafeMobileReleaseBuildBackendConfiguration', () => {
  it('rejects release-oriented builds that still resolve to local', () => {
    expect(() =>
      assertSafeMobileReleaseBuildBackendConfiguration({
        EAS_BUILD_PROFILE: 'preview',
      }),
    ).toThrow(
      'Release-oriented mobile builds must set EXPO_PUBLIC_APP_ENV to beta or production. Current config resolves to local.',
    );
  });

  it('rejects mismatched preview backends during build', () => {
    expect(() =>
      assertSafeMobileReleaseBuildBackendConfiguration({
        EAS_BUILD_PROFILE: 'preview',
        EXPO_PUBLIC_APP_ENV: 'beta',
        EXPO_PUBLIC_API_BASE_URL: 'https://api.yummyrecs.com',
        EXPO_PUBLIC_POCKETBASE_URL: 'https://pb.yummyrecs.com',
      }),
    ).toThrow(
      'Mobile backend config mismatch for beta: EXPO_PUBLIC_API_BASE_URL (https://api.yummyrecs.com) must match EXPO_PUBLIC_POCKETBASE_URL (https://pb.yummyrecs.com).',
    );
  });

  it('does not enforce production NODE_ENV alone when app environment resolves to local', () => {
    expect(
      shouldEnforceReleaseBuildBackendGuard({
        EAS_BUILD_PROFILE: 'production',
      }),
    ).toBe(true);

    expect(
      shouldEnforceReleaseBuildBackendGuard({
        NODE_ENV: 'production',
      }),
    ).toBe(false);
  });
});
