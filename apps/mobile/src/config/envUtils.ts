export type AppEnvironment = 'local' | 'beta' | 'production';

export type EnvSource = Record<string, string | undefined>;

const DEFAULT_IOS_APP_STORE_URL = 'https://apps.apple.com/us/app/yummy-recs/id6761597807';

interface MobileEnvironmentDefaults {
  adminUrl: string;
  apiBaseUrl: string;
  appWebUrl: string;
  iosAppStoreUrl: string;
  marketingUrl: string;
  pocketbaseUrl: string;
  posthogHost: string;
}

interface MobileBackendConfiguration {
  apiBaseUrl: string;
  environment: AppEnvironment;
  pocketbaseUrl: string;
}

interface MobileBackendBuildGuardOptions {
  enforce?: boolean;
}

export const MOBILE_ENVIRONMENT_DEFAULTS: Record<AppEnvironment, MobileEnvironmentDefaults> = {
  local: {
    adminUrl: 'http://localhost:5173',
    apiBaseUrl: 'http://127.0.0.1:8090',
    appWebUrl: 'http://localhost:8081',
    iosAppStoreUrl: DEFAULT_IOS_APP_STORE_URL,
    marketingUrl: 'http://localhost:4173',
    pocketbaseUrl: 'http://127.0.0.1:8090',
    posthogHost: 'http://127.0.0.1:8090/api/analytics',
  },
  beta: {
    adminUrl: 'https://beta.admin.yummyrecs.com',
    apiBaseUrl: 'https://beta.app.yummyrecs.com',
    appWebUrl: 'https://beta.app.yummyrecs.com',
    iosAppStoreUrl: DEFAULT_IOS_APP_STORE_URL,
    marketingUrl: 'https://beta.yummyrecs.com',
    pocketbaseUrl: 'https://beta.app.yummyrecs.com',
    posthogHost: 'https://beta.app.yummyrecs.com/api/analytics',
  },
  production: {
    adminUrl: 'https://admin.yummyrecs.com',
    apiBaseUrl: 'https://app.yummyrecs.com',
    appWebUrl: 'https://app.yummyrecs.com',
    iosAppStoreUrl: DEFAULT_IOS_APP_STORE_URL,
    marketingUrl: 'https://yummyrecs.com',
    pocketbaseUrl: 'https://app.yummyrecs.com',
    posthogHost: 'https://app.yummyrecs.com/api/analytics',
  },
};

export function readOptionalEnvValue(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function readBooleanEnvValue(value: string | undefined): boolean {
  const normalizedValue = value?.trim().toLowerCase();
  return normalizedValue === '1' || normalizedValue === 'true' || normalizedValue === 'yes';
}

export function normalizeAppEnvironment(value: string | undefined): AppEnvironment | null {
  const normalizedValue = value?.trim().toLowerCase();

  switch (normalizedValue) {
    case 'local':
    case 'dev':
    case 'development':
      return 'local';
    case 'beta':
    case 'preview':
      return 'beta';
    case 'prod':
    case 'production':
      return 'production';
    default:
      return null;
  }
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveConfiguredAppEnvironment(source?: EnvSource): AppEnvironment {
  return normalizeAppEnvironment(readOptionalEnvValue(source?.EXPO_PUBLIC_APP_ENV)) ?? 'local';
}

function isLocalDevelopmentHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function isLocalDevelopmentUrl(value: string): boolean {
  const normalizedValue = readOptionalEnvValue(value);
  if (!normalizedValue) {
    return false;
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    return isLocalDevelopmentHostname(parsedUrl.hostname);
  } catch {
    return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(normalizedValue);
  }
}

export function resolveMobileBackendConfiguration(source?: EnvSource): MobileBackendConfiguration {
  const environment = resolveConfiguredAppEnvironment(source);
  const environmentDefaults = MOBILE_ENVIRONMENT_DEFAULTS[environment];

  return {
    apiBaseUrl:
      readOptionalEnvValue(source?.EXPO_PUBLIC_API_BASE_URL) ?? environmentDefaults.apiBaseUrl,
    environment,
    pocketbaseUrl:
      readOptionalEnvValue(source?.EXPO_PUBLIC_POCKETBASE_URL) ?? environmentDefaults.pocketbaseUrl,
  };
}

export function assertSafeMobileBackendConfiguration(
  config: MobileBackendConfiguration,
): void {
  if (config.environment === 'local') {
    return;
  }

  const normalizedApiBaseUrl = trimTrailingSlashes(config.apiBaseUrl);
  const normalizedPocketBaseUrl = trimTrailingSlashes(config.pocketbaseUrl);

  if (normalizedApiBaseUrl !== normalizedPocketBaseUrl) {
    throw new Error(
      `Mobile backend config mismatch for ${config.environment}: ` +
        `EXPO_PUBLIC_API_BASE_URL (${config.apiBaseUrl}) must match ` +
        `EXPO_PUBLIC_POCKETBASE_URL (${config.pocketbaseUrl}).`,
    );
  }

  if (
    isLocalDevelopmentUrl(normalizedApiBaseUrl) ||
    isLocalDevelopmentUrl(normalizedPocketBaseUrl)
  ) {
    throw new Error(
      `Mobile ${config.environment} backend config must not resolve to a local URL. ` +
        `Received ${config.apiBaseUrl} and ${config.pocketbaseUrl}.`,
    );
  }
}

export function shouldEnforceReleaseBuildBackendGuard(source?: EnvSource): boolean {
  const nodeEnv = readOptionalEnvValue(source?.NODE_ENV)?.toLowerCase();
  const isReleaseBuildContext =
    readBooleanEnvValue(source?.CI) ||
    readBooleanEnvValue(source?.EAS_BUILD) ||
    Boolean(readOptionalEnvValue(source?.EAS_BUILD_PROFILE)) ||
    readBooleanEnvValue(source?.EXPO_EXPORT) ||
    nodeEnv === 'production';

  return (
    isReleaseBuildContext &&
    (Boolean(readOptionalEnvValue(source?.EAS_BUILD_PROFILE)) ||
      resolveConfiguredAppEnvironment(source) !== 'local')
  );
}

export function assertSafeMobileReleaseBuildBackendConfiguration(
  source?: EnvSource,
  options?: MobileBackendBuildGuardOptions,
): void {
  const shouldEnforce =
    options?.enforce ?? shouldEnforceReleaseBuildBackendGuard(source);

  if (!shouldEnforce) {
    return;
  }

  const backendConfiguration = resolveMobileBackendConfiguration(source);
  if (backendConfiguration.environment === 'local') {
    throw new Error(
      'Release-oriented mobile builds must set EXPO_PUBLIC_APP_ENV to beta or production. ' +
        'Current config resolves to local.',
    );
  }

  assertSafeMobileBackendConfiguration(backendConfiguration);
}
