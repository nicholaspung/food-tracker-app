import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppEnvironment = 'local' | 'beta' | 'production';

function readOptionalEnvValue(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function readBooleanEnvValue(value: string | undefined): boolean {
  const normalizedValue = value?.trim().toLowerCase();
  return normalizedValue === '1' || normalizedValue === 'true' || normalizedValue === 'yes';
}

function resolveConfiguredAppEnvironment(env: NodeJS.ProcessEnv): AppEnvironment {
  const normalizedValue = readOptionalEnvValue(env.EXPO_PUBLIC_APP_ENV)?.toLowerCase();

  switch (normalizedValue) {
    case 'beta':
    case 'preview':
      return 'beta';
    case 'prod':
    case 'production':
      return 'production';
    default:
      return 'local';
  }
}

function shouldEnforceScreenshotReviewBuildGuard(env: NodeJS.ProcessEnv): boolean {
  const nodeEnv = readOptionalEnvValue(env.NODE_ENV)?.toLowerCase();

  return (
    readBooleanEnvValue(env.CI) ||
    readBooleanEnvValue(env.EAS_BUILD) ||
    Boolean(readOptionalEnvValue(env.EAS_BUILD_PROFILE)) ||
    readBooleanEnvValue(env.EXPO_EXPORT) ||
    nodeEnv === 'production'
  );
}

function assertSafeScreenshotReviewBuild(env: NodeJS.ProcessEnv): void {
  if (
    !shouldEnforceScreenshotReviewBuildGuard(env) ||
    !readBooleanEnvValue(env.EXPO_PUBLIC_SCREENSHOT_REVIEW_MODE)
  ) {
    return;
  }

  const environment = resolveConfiguredAppEnvironment(env);
  if (environment === 'local') {
    return;
  }

  throw new Error(
    `EXPO_PUBLIC_SCREENSHOT_REVIEW_MODE must stay disabled for ${environment} builds. ` +
      'Use screenshot review mode only from development bundles.',
  );
}

export default ({ config }: ConfigContext): ExpoConfig => {
  assertSafeScreenshotReviewBuild(process.env);
  return config as ExpoConfig;
};
