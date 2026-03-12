import { loadMobileEnv } from '../config/env';

describe('loadMobileEnv', () => {
  it('falls back to defaults when env values are missing', () => {
    const env = loadMobileEnv({});

    expect(env.apiBaseUrl).toBe('http://127.0.0.1:8090');
    expect(env.pocketbaseUrl).toBe('http://127.0.0.1:8090');
    expect(env.posthogHost).toBe('http://127.0.0.1:8090/api/visit-insights');
  });

  it('uses explicit environment values when provided', () => {
    const env = loadMobileEnv({
      EXPO_PUBLIC_API_BASE_URL: 'https://api.yummyrecs.com',
      EXPO_PUBLIC_POCKETBASE_URL: 'https://pb.yummyrecs.com',
      EXPO_PUBLIC_POSTHOG_API_KEY: 'test_key',
      EXPO_PUBLIC_POSTHOG_HOST: 'https://analytics.yummyrecs.com',
    });

    expect(env.apiBaseUrl).toBe('https://api.yummyrecs.com');
    expect(env.pocketbaseUrl).toBe('https://pb.yummyrecs.com');
    expect(env.posthogApiKey).toBe('test_key');
    expect(env.posthogHost).toBe('https://analytics.yummyrecs.com');
  });
});
