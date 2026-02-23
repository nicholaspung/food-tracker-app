import { loadMobileEnv } from '../config/env';

describe('loadMobileEnv', () => {
  it('falls back to defaults when env values are missing', () => {
    const env = loadMobileEnv({});

    expect(env.apiBaseUrl).toBe('http://127.0.0.1:8090');
    expect(env.pocketbaseUrl).toBe('http://127.0.0.1:8090');
    expect(env.posthogHost).toBe('http://127.0.0.1:8090/api/visit-insights');
    expect(env.iapMonthlyProductId).toBe('foodtracker.subscription.monthly');
    expect(env.iapYearlyProductId).toBe('foodtracker.subscription.yearly');
    expect(env.androidPackageName).toBe('');
  });

  it('uses explicit environment values when provided', () => {
    const env = loadMobileEnv({
      EXPO_PUBLIC_API_BASE_URL: 'https://api.trackyourfoods.com',
      EXPO_PUBLIC_POCKETBASE_URL: 'https://pb.trackyourfoods.com',
      EXPO_PUBLIC_POSTHOG_API_KEY: 'test_key',
      EXPO_PUBLIC_POSTHOG_HOST: 'https://analytics.trackyourfoods.com',
      EXPO_PUBLIC_IAP_MONTHLY_PRODUCT_ID: 'com.example.premium.monthly',
      EXPO_PUBLIC_IAP_YEARLY_PRODUCT_ID: 'com.example.premium.yearly',
      EXPO_PUBLIC_ANDROID_PACKAGE_NAME: 'com.example.app',
    });

    expect(env.apiBaseUrl).toBe('https://api.trackyourfoods.com');
    expect(env.pocketbaseUrl).toBe('https://pb.trackyourfoods.com');
    expect(env.posthogApiKey).toBe('test_key');
    expect(env.posthogHost).toBe('https://analytics.trackyourfoods.com');
    expect(env.iapMonthlyProductId).toBe('com.example.premium.monthly');
    expect(env.iapYearlyProductId).toBe('com.example.premium.yearly');
    expect(env.androidPackageName).toBe('com.example.app');
  });
});
