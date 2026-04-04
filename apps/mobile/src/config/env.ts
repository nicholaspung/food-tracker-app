import { Platform } from 'react-native';

import {
  type AppEnvironment,
  type EnvSource,
  normalizeAppEnvironment,
  readOptionalEnvValue,
  resolveScreenshotReviewMode,
} from './envUtils';

interface MobileEnvironmentDefaults {
  adminUrl: string;
  apiBaseUrl: string;
  appWebUrl: string;
  marketingUrl: string;
  pocketbaseUrl: string;
  posthogHost: string;
}

const MOBILE_ENVIRONMENT_DEFAULTS: Record<AppEnvironment, MobileEnvironmentDefaults> = {
  local: {
    adminUrl: 'http://localhost:5173',
    apiBaseUrl: 'http://127.0.0.1:8090',
    appWebUrl: 'http://localhost:8081',
    marketingUrl: 'http://localhost:4173',
    pocketbaseUrl: 'http://127.0.0.1:8090',
    posthogHost: 'http://127.0.0.1:8090/api/visit-insights',
  },
  beta: {
    adminUrl: 'https://beta.admin.yummyrecs.com',
    apiBaseUrl: 'https://beta.app.yummyrecs.com',
    appWebUrl: 'https://beta.app.yummyrecs.com',
    marketingUrl: 'https://beta.yummyrecs.com',
    pocketbaseUrl: 'https://beta.app.yummyrecs.com',
    posthogHost: 'https://beta.app.yummyrecs.com/api/visit-insights',
  },
  production: {
    adminUrl: 'https://admin.yummyrecs.com',
    apiBaseUrl: 'https://app.yummyrecs.com',
    appWebUrl: 'https://app.yummyrecs.com',
    marketingUrl: 'https://yummyrecs.com',
    pocketbaseUrl: 'https://app.yummyrecs.com',
    posthogHost: 'https://app.yummyrecs.com/api/visit-insights',
  },
};

export interface MobileEnv {
  adminUrl: string;
  apiBaseUrl: string;
  appWebUrl: string;
  environment: AppEnvironment;
  isScreenshotReviewMode: boolean;
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
  EXPO_PUBLIC_MARKETING_URL: process.env.EXPO_PUBLIC_MARKETING_URL,
  EXPO_PUBLIC_POCKETBASE_URL: process.env.EXPO_PUBLIC_POCKETBASE_URL,
  EXPO_PUBLIC_POSTHOG_API_KEY: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
  EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  EXPO_PUBLIC_SCREENSHOT_REVIEW_MODE: process.env.EXPO_PUBLIC_SCREENSHOT_REVIEW_MODE,
};

function resolveCurrentOrigin(): string | undefined {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.origin) {
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

interface LoadMobileEnvOptions {
  isDevBuild?: boolean;
}

export function loadMobileEnv(
  source?: EnvSource,
  currentOrigin?: string,
  options?: LoadMobileEnvOptions,
): MobileEnv {
  const resolvedSource = source ?? expoPublicEnv;
  const environment = resolveAppEnvironment(resolvedSource, currentOrigin);
  const environmentDefaults = MOBILE_ENVIRONMENT_DEFAULTS[environment];

  const apiBaseUrl =
    readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_API_BASE_URL) ?? environmentDefaults.apiBaseUrl;
  const pocketbaseUrl =
    readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_POCKETBASE_URL) ?? environmentDefaults.pocketbaseUrl;
  const appWebUrl =
    readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_APP_WEB_URL) ?? environmentDefaults.appWebUrl;
  const adminUrl =
    readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_ADMIN_URL) ?? environmentDefaults.adminUrl;
  const marketingUrl =
    readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_MARKETING_URL) ?? environmentDefaults.marketingUrl;
  const posthogHost =
    readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_POSTHOG_HOST) ?? environmentDefaults.posthogHost;

  return {
    adminUrl,
    apiBaseUrl,
    appWebUrl,
    environment,
    isScreenshotReviewMode: resolveScreenshotReviewMode(resolvedSource, {
      isDevBuild: options?.isDevBuild,
    }),
    marketingUrl,
    pocketbaseUrl,
    posthogApiKey: readOptionalEnvValue(resolvedSource.EXPO_PUBLIC_POSTHOG_API_KEY) ?? '',
    posthogHost,
  };
}

export const env = loadMobileEnv();
