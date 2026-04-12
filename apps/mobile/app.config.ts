import type { ConfigContext, ExpoConfig } from 'expo/config';

import {
  assertSafeMobileReleaseBuildBackendConfiguration,
  assertSafeScreenshotReviewBuild,
} from './src/config/envUtils';

export default ({ config }: ConfigContext): ExpoConfig => {
  assertSafeScreenshotReviewBuild(process.env);
  assertSafeMobileReleaseBuildBackendConfiguration(process.env);
  return config as ExpoConfig;
};
