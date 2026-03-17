import { loadMobileEnv, resolveAppEnvironment } from '../config/env';

describe('loadMobileEnv', () => {
  it('falls back to defaults when env values are missing', () => {
    const env = loadMobileEnv({});

    expect(env.environment).toBe('local');
    expect(env.adminUrl).toBe('http://localhost:5173');
    expect(env.apiBaseUrl).toBe('http://127.0.0.1:8090');
    expect(env.appWebUrl).toBe('http://localhost:8081');
    expect(env.isScreenshotReviewMode).toBe(false);
    expect(env.marketingUrl).toBe('http://localhost:4173');
    expect(env.pocketbaseUrl).toBe('http://127.0.0.1:8090');
    expect(env.posthogHost).toBe('http://127.0.0.1:8090/api/visit-insights');
  });

  it('uses explicit environment values when provided', () => {
    const env = loadMobileEnv({
      EXPO_PUBLIC_APP_ENV: 'beta',
      EXPO_PUBLIC_API_BASE_URL: 'https://api.yummyrecs.com',
      EXPO_PUBLIC_ADMIN_URL: 'https://admin.yummyrecs.com',
      EXPO_PUBLIC_APP_WEB_URL: 'https://app.yummyrecs.com',
      EXPO_PUBLIC_MARKETING_URL: 'https://yummyrecs.com',
      EXPO_PUBLIC_POCKETBASE_URL: 'https://pb.yummyrecs.com',
      EXPO_PUBLIC_POSTHOG_API_KEY: 'test_key',
      EXPO_PUBLIC_POSTHOG_HOST: 'https://analytics.yummyrecs.com',
      EXPO_PUBLIC_SCREENSHOT_REVIEW_MODE: 'true',
    });

    expect(env.environment).toBe('beta');
    expect(env.adminUrl).toBe('https://admin.yummyrecs.com');
    expect(env.apiBaseUrl).toBe('https://api.yummyrecs.com');
    expect(env.appWebUrl).toBe('https://app.yummyrecs.com');
    expect(env.isScreenshotReviewMode).toBe(true);
    expect(env.marketingUrl).toBe('https://yummyrecs.com');
    expect(env.pocketbaseUrl).toBe('https://pb.yummyrecs.com');
    expect(env.posthogApiKey).toBe('test_key');
    expect(env.posthogHost).toBe('https://analytics.yummyrecs.com');
  });

  it('uses beta defaults when the app environment is beta', () => {
    const env = loadMobileEnv({ EXPO_PUBLIC_APP_ENV: 'beta' });

    expect(env.environment).toBe('beta');
    expect(env.apiBaseUrl).toBe('https://beta.app.yummyrecs.com');
    expect(env.pocketbaseUrl).toBe('https://beta.app.yummyrecs.com');
    expect(env.appWebUrl).toBe('https://beta.app.yummyrecs.com');
    expect(env.adminUrl).toBe('https://beta.admin.yummyrecs.com');
    expect(env.marketingUrl).toBe('https://beta.yummyrecs.com');
    expect(env.posthogHost).toBe('https://beta.app.yummyrecs.com/api/visit-insights');
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
