const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8090';

export interface MobileEnv {
  apiBaseUrl: string;
  pocketbaseUrl: string;
  posthogApiKey: string;
  posthogHost: string;
  iapMonthlyProductId: string;
  iapYearlyProductId: string;
  androidPackageName: string;
}

type EnvSource = Record<string, string | undefined>;

function getRuntimeEnv(): EnvSource {
  const maybeProcess = globalThis as { process?: { env?: EnvSource } };
  return maybeProcess.process?.env ?? {};
}

export function loadMobileEnv(source?: EnvSource): MobileEnv {
  const resolvedSource = source ?? getRuntimeEnv();

  const apiBaseUrl = resolvedSource.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const pocketbaseUrl = resolvedSource.EXPO_PUBLIC_POCKETBASE_URL ?? apiBaseUrl;

  return {
    apiBaseUrl,
    pocketbaseUrl,
    posthogApiKey: resolvedSource.EXPO_PUBLIC_POSTHOG_API_KEY ?? '',
    posthogHost: resolvedSource.EXPO_PUBLIC_POSTHOG_HOST ?? `${apiBaseUrl}/api/visit-insights`,
    iapMonthlyProductId:
      resolvedSource.EXPO_PUBLIC_IAP_MONTHLY_PRODUCT_ID ??
      'foodtracker.subscription.monthly',
    iapYearlyProductId:
      resolvedSource.EXPO_PUBLIC_IAP_YEARLY_PRODUCT_ID ??
      'foodtracker.subscription.yearly',
    androidPackageName: resolvedSource.EXPO_PUBLIC_ANDROID_PACKAGE_NAME ?? '',
  };
}

export const env = loadMobileEnv();
