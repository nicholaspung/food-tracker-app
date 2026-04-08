export type AppEnvironment = 'local' | 'beta' | 'production';

export type EnvSource = Record<string, string | undefined>;

interface ScreenshotReviewModeOptions {
  isDevBuild?: boolean;
}

interface ScreenshotReviewBuildGuardOptions {
  enforce?: boolean;
}

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

function resolveConfiguredAppEnvironment(source?: EnvSource): AppEnvironment {
  return normalizeAppEnvironment(readOptionalEnvValue(source?.EXPO_PUBLIC_APP_ENV)) ?? 'local';
}

function isScreenshotReviewModeRequested(source?: EnvSource): boolean {
  return readBooleanEnvValue(source?.EXPO_PUBLIC_SCREENSHOT_REVIEW_MODE);
}

export function resolveScreenshotReviewMode(
  source?: EnvSource,
  options?: ScreenshotReviewModeOptions,
): boolean {
  const isDevBuild =
    options?.isDevBuild ?? (typeof __DEV__ !== 'undefined' ? __DEV__ : false);

  return isScreenshotReviewModeRequested(source) && isDevBuild;
}

export function shouldEnforceScreenshotReviewBuildGuard(source?: EnvSource): boolean {
  const nodeEnv = readOptionalEnvValue(source?.NODE_ENV)?.toLowerCase();

  return (
    readBooleanEnvValue(source?.CI) ||
    readBooleanEnvValue(source?.EAS_BUILD) ||
    Boolean(readOptionalEnvValue(source?.EAS_BUILD_PROFILE)) ||
    readBooleanEnvValue(source?.EXPO_EXPORT) ||
    nodeEnv === 'production'
  );
}

export function assertSafeScreenshotReviewBuild(
  source?: EnvSource,
  options?: ScreenshotReviewBuildGuardOptions,
): void {
  const shouldEnforce =
    options?.enforce ?? shouldEnforceScreenshotReviewBuildGuard(source);

  if (!shouldEnforce || !isScreenshotReviewModeRequested(source)) {
    return;
  }

  const environment = resolveConfiguredAppEnvironment(source);
  if (environment === 'local') {
    return;
  }

  throw new Error(
    `EXPO_PUBLIC_SCREENSHOT_REVIEW_MODE must stay disabled for ${environment} builds. ` +
      'Use screenshot review mode only from development bundles.',
  );
}
