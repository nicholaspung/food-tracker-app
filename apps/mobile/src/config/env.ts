import { Platform } from 'react-native';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8090';

export interface MobileEnv {
  apiBaseUrl: string;
  pocketbaseUrl: string;
  posthogApiKey: string;
  posthogHost: string;
}

type EnvSource = Record<string, string | undefined>;

const expoPublicEnv: EnvSource = {
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
  EXPO_PUBLIC_POCKETBASE_URL: process.env.EXPO_PUBLIC_POCKETBASE_URL,
  EXPO_PUBLIC_POSTHOG_API_KEY: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
  EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
};

function resolveDefaultApiBaseUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }

  return DEFAULT_API_BASE_URL;
}

export function loadMobileEnv(source?: EnvSource): MobileEnv {
  const resolvedSource = source ?? expoPublicEnv;

  const apiBaseUrl = resolvedSource.EXPO_PUBLIC_API_BASE_URL ?? resolveDefaultApiBaseUrl();
  const pocketbaseUrl = resolvedSource.EXPO_PUBLIC_POCKETBASE_URL ?? apiBaseUrl;

  return {
    apiBaseUrl,
    pocketbaseUrl,
    posthogApiKey: resolvedSource.EXPO_PUBLIC_POSTHOG_API_KEY ?? '',
    posthogHost: resolvedSource.EXPO_PUBLIC_POSTHOG_HOST ?? `${apiBaseUrl}/api/visit-insights`,
  };
}

export const env = loadMobileEnv();
