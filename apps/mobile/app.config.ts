import type { ConfigContext, ExpoConfig } from 'expo/config';

const {
  assertSafeMobileReleaseBuildBackendConfiguration,
  assertSafeScreenshotReviewBuild,
}: typeof import('./src/config/envUtils') = require('./src/config/envUtils.ts');

export default ({ config }: ConfigContext): ExpoConfig => {
  assertSafeScreenshotReviewBuild(process.env);
  assertSafeMobileReleaseBuildBackendConfiguration(process.env);
  return config as ExpoConfig;
};
