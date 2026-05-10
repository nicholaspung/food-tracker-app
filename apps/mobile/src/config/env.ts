import { Platform } from 'react-native';

import {
  MOBILE_ENVIRONMENT_DEFAULTS,
  assertSafeMobileBackendConfiguration,
  type EnvSource,
  readOptionalEnvValue,
  type AppEnvironment,
  normalizeAppEnvironment,
  resolveMobileBackendConfiguration,
} from './envUtils';

export interface MobileEnv {
  adminUrl: string;
  apiBaseUrl: string;
  appWebUrl: string;
  environment: AppEnvironment;
  iosAppStoreUrl: string;
  marketingUrl: string;
  pocketbaseUrl: string;
  posthogApiKey: string;
  posthogHost: string;
}

const expoPublicEnv: EnvSource = {
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
  EXPO_PUBLIC_ADMIN_URL: process.env.EXPO_PUBLIC_ADMIN_URL,
  EXPO_PUBLIC_APP_WEB_URL: process.env.EXPO_PUBLIC_APP_WEB_URL,
  EXPO_PUBLIC_IOS_APP_STORE_URL: process.env.EXPO_PUBLIC_IOS_APP_STORE_URL,
  EXPO_PUBLIC_MARKETING_URL: process.env.EXPO_PUBLIC_MARKETING_URL,
  EXPO_PUBLIC_POCKETBASE_URL: process.env.EXPO_PUBLIC_POCKETBASE_URL,
  EXPO_PUBLIC_POSTHOG_API_KEY: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
  EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
};

function resolveCurrentOrigin(): string | undefined {
  if (Platform?.OS === 'web' && typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }

  return undefined;
}

function inferEnvironmentFromOrigin(origin: string | undefined): AppEnvironment | null {
  if (!origin) {
    return null;
  }

  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    return 'local';
  }

  if (
    origin === MOBILE_ENVIRONMENT_DEFAULTS.beta.appWebUrl ||
    origin === MOBILE_ENVIRONMENT_DEFAULTS.beta.adminUrl ||
    origin === MOBILE_ENVIRONMENT_DEFAULTS.beta.marketingUrl
  ) {
    return 'beta';
  }

  if (
    origin === MOBILE_ENVIRONMENT_DEFAULTS.production.appWebUrl ||
    origin === MOBILE_ENVIRONMENT_DEFAULTS.production.adminUrl ||
    origin === MOBILE_ENVIRONMENT_DEFAULTS.production.marketingUrl ||
    origin === 'https://www.yummyrecs.com'
  ) {
    return 'production';
  }

  return null;
}

export function resolveAppEnvironment(source?: EnvSource, currentOrigin?: string): AppEnvironment {
  const explicitEnvironment =
    normalizeAppEnvironment(readOptionalEnvValue(source?.EXPO_PUBLIC_APP_ENV)) ??
    inferEnvironmentFromOrigin(currentOrigin ?? resolveCurrentOrigin());

  return explicitEnvironment ?? 'local';
}

export function loadMobileEnv(
  source?: EnvSource,
  currentOrigin?: string,
): MobileEnv {
  const resolvedSource = source ?? expoPublicEnv;
  const backendConfiguration = resolveMobileBackendConfiguration(resolvedSource);
  const environment = resolveAppEnvironment(resolvedSource, currentOrigin);
  const environmentDefaults = MOBILE_ENVIRONMENT_DEFAULTS[environment];
  const apiBaseUrl =
    backendConfiguration.environment === environment
      ? backendConfiguration.apiBaseUrl
      : readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_API_BASE_URL) ?? environmentDefaults.apiBaseUrl;
  const pocketbaseUrl =
    backendConfiguration.environment === environment
      ? backendConfiguration.pocketbaseUrl
      : readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_POCKETBASE_URL) ?? environmentDefaults.pocketbaseUrl;
  const appWebUrl =
    readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_APP_WEB_URL) ?? environmentDefaults.appWebUrl;
  const adminUrl =
    readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_ADMIN_URL) ?? environmentDefaults.adminUrl;
  const iosAppStoreUrl =
    readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_IOS_APP_STORE_URL) ??
    environmentDefaults.iosAppStoreUrl;
  const marketingUrl =
    readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_MARKETING_URL) ?? environmentDefaults.marketingUrl;
  const posthogHost =
    readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_POSTHOG_HOST) ?? environmentDefaults.posthogHost;

  const mobileEnv = {
    adminUrl,
    apiBaseUrl,
    appWebUrl,
    environment,
    iosAppStoreUrl,
    marketingUrl,
    pocketbaseUrl,
    posthogApiKey: readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_POSTHOG_API_KEY) ?? '',
    posthogHost,
  };

  assertSafeMobileBackendConfiguration({
    apiBaseUrl: mobileEnv.apiBaseUrl,
    environment: mobileEnv.environment,
    pocketbaseUrl: mobileEnv.pocketbaseUrl,
  });

  return mobileEnv;
}

export const env = loadMobileEnv();
