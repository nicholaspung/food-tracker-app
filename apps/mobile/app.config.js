// Expo loads app config through Node/CommonJS during CI and `expo export`,
// so this file must stay plain JavaScript instead of importing TypeScript modules.
const MOBILE_ENVIRONMENT_DEFAULTS = {
  local: {
    adminUrl: 'http://localhost:5173',
    apiBaseUrl: 'http://127.0.0.1:8090',
    appWebUrl: 'http://localhost:8081',
    iosAppStoreUrl: 'https://apps.apple.com/us/app/yummy-recs/id6761597807',
    marketingUrl: 'http://localhost:4173',
    pocketbaseUrl: 'http://127.0.0.1:8090',
    posthogHost: 'http://127.0.0.1:8090/api/analytics',
  },
  beta: {
    adminUrl: 'https://beta.admin.yummyrecs.com',
    apiBaseUrl: 'https://beta.app.yummyrecs.com',
    appWebUrl: 'https://beta.app.yummyrecs.com',
    iosAppStoreUrl: 'https://apps.apple.com/us/app/yummy-recs/id6761597807',
    marketingUrl: 'https://beta.yummyrecs.com',
    pocketbaseUrl: 'https://beta.app.yummyrecs.com',
    posthogHost: 'https://beta.app.yummyrecs.com/api/analytics',
  },
  production: {
    adminUrl: 'https://admin.yummyrecs.com',
    apiBaseUrl: 'https://app.yummyrecs.com',
    appWebUrl: 'https://app.yummyrecs.com',
    iosAppStoreUrl: 'https://apps.apple.com/us/app/yummy-recs/id6761597807',
    marketingUrl: 'https://yummyrecs.com',
    pocketbaseUrl: 'https://app.yummyrecs.com',
    posthogHost: 'https://app.yummyrecs.com/api/analytics',
  },
};

function readOptionalEnvValue(value) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function readBooleanEnvValue(value) {
  const normalizedValue = value?.trim().toLowerCase();
  return normalizedValue === '1' || normalizedValue === 'true' || normalizedValue === 'yes';
}

function normalizeAppEnvironment(value) {
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

function trimTrailingSlashes(value) {
  return value.replace(/\/+$/, '');
}

function resolveConfiguredAppEnvironment(source) {
  return normalizeAppEnvironment(readOptionalEnvValue(source?.EXPO_PUBLIC_APP_ENV)) ?? 'local';
}

function normalizeAppVariant(value) {
  const normalizedValue = value?.trim().toLowerCase();

  switch (normalizedValue) {
    case 'preview':
    case 'production-preview':
      return 'preview';
    case 'prod':
    case 'production':
      return 'production';
    default:
      return null;
  }
}

function resolveConfiguredAppVariant(source) {
  return (
    normalizeAppVariant(readOptionalEnvValue(source?.APP_VARIANT)) ??
    normalizeAppVariant(readOptionalEnvValue(source?.EAS_BUILD_PROFILE)) ??
    'production'
  );
}

function resolveMobileAppIdentity(source) {
  const variant = resolveConfiguredAppVariant(source);

  if (variant === 'preview') {
    return {
      androidPackage: 'com.yummyrecs.mobile.preview',
      bundleIdentifier: 'com.yummyrecs.mobile.preview',
      name: 'Yummy Recs Preview',
      scheme: 'yummyrecs-preview',
    };
  }

  return {
    androidPackage: 'com.yummyrecs.mobile',
    bundleIdentifier: 'com.yummyrecs.mobile',
    name: 'Yummy Recs',
    scheme: 'yummyrecs',
  };
}

function resolveMobileRuntimeVersion(config, source) {
  const explicitRuntimeVersion = readOptionalEnvValue(source?.MOBILE_RUNTIME_VERSION);
  if (explicitRuntimeVersion) {
    return explicitRuntimeVersion;
  }

  const appVersion = readOptionalEnvValue(config?.version) ?? '1.0.0';
  const variant = resolveConfiguredAppVariant(source);

  if (variant === 'preview') {
    return `${appVersion}-preview-embedded-1`;
  }

  return appVersion;
}

function isLocalDevelopmentHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function isLocalDevelopmentUrl(value) {
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

function resolveMobileBackendConfiguration(source) {
  const environment = resolveConfiguredAppEnvironment(source);
  const environmentDefaults = MOBILE_ENVIRONMENT_DEFAULTS[environment];

  return {
    adminUrl: readOptionalEnvValue(source?.EXPO_PUBLIC_ADMIN_URL) ?? environmentDefaults.adminUrl,
    apiBaseUrl:
      readOptionalEnvValue(source?.EXPO_PUBLIC_API_BASE_URL) ?? environmentDefaults.apiBaseUrl,
    appWebUrl: readOptionalEnvValue(source?.EXPO_PUBLIC_APP_WEB_URL) ?? environmentDefaults.appWebUrl,
    environment,
    iosAppStoreUrl:
      readOptionalEnvValue(source?.EXPO_PUBLIC_IOS_APP_STORE_URL) ??
      environmentDefaults.iosAppStoreUrl,
    marketingUrl:
      readOptionalEnvValue(source?.EXPO_PUBLIC_MARKETING_URL) ?? environmentDefaults.marketingUrl,
    pocketbaseUrl:
      readOptionalEnvValue(source?.EXPO_PUBLIC_POCKETBASE_URL) ?? environmentDefaults.pocketbaseUrl,
    posthogHost:
      readOptionalEnvValue(source?.EXPO_PUBLIC_POSTHOG_HOST) ?? environmentDefaults.posthogHost,
  };
}

function assertSafeMobileBackendConfiguration(config) {
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

function shouldEnforceReleaseBuildContext(source) {
  const nodeEnv = readOptionalEnvValue(source?.NODE_ENV)?.toLowerCase();

  return (
    readBooleanEnvValue(source?.CI) ||
    readBooleanEnvValue(source?.EAS_BUILD) ||
    Boolean(readOptionalEnvValue(source?.EAS_BUILD_PROFILE)) ||
    readBooleanEnvValue(source?.EXPO_EXPORT) ||
    nodeEnv === 'production'
  );
}

function shouldEnforceReleaseBuildBackendGuard(source) {
  const isReleaseBuildContext = shouldEnforceReleaseBuildContext(source);

  return (
    isReleaseBuildContext &&
    (Boolean(readOptionalEnvValue(source?.EAS_BUILD_PROFILE)) ||
      resolveConfiguredAppEnvironment(source) !== 'local')
  );
}

function assertSafeMobileReleaseBuildBackendConfiguration(source, options) {
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

module.exports = ({ config }) => {
  assertSafeMobileReleaseBuildBackendConfiguration(process.env);
  const appIdentity = resolveMobileAppIdentity(process.env);
  const runtimeVersion = resolveMobileRuntimeVersion(config, process.env);
  const appVariant = resolveConfiguredAppVariant(process.env);
  const authLinkHosts =
    appIdentity.scheme === 'yummyrecs-preview'
      ? ['beta.app.yummyrecs.com']
      : ['app.yummyrecs.com'];
  const authLinkPathPrefixes = ['/reset-password', '/verify-email', '/signup'];
  const updatesConfig =
    appVariant === 'preview'
      ? {
          ...config.updates,
          checkAutomatically: 'ON_ERROR_RECOVERY',
          fallbackToCacheTimeout: 0,
        }
      : config.updates;

  return {
    ...config,
    name: appIdentity.name,
    scheme: appIdentity.scheme,
    runtimeVersion,
    updates: updatesConfig,
    ios: {
      ...config.ios,
      bundleIdentifier: appIdentity.bundleIdentifier,
      runtimeVersion,
      associatedDomains: authLinkHosts.map((host) => `applinks:${host}`),
      infoPlist: {
        ...config.ios?.infoPlist,
        CFBundleDisplayName: appIdentity.name,
        CFBundleName: appIdentity.name,
      },
    },
    android: {
      ...config.android,
      package: appIdentity.androidPackage,
      runtimeVersion,
      intentFilters: [
        ...(config.android?.intentFilters ?? []),
        {
          action: 'VIEW',
          autoVerify: true,
          data: authLinkHosts.flatMap((host) =>
            authLinkPathPrefixes.map((pathPrefix) => ({
              scheme: 'https',
              host,
              pathPrefix,
            })),
          ),
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
  };
};
