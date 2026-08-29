import { Platform } from 'react-native';

type ExpoConstants = typeof import('expo-constants')['default'];

const expoConstants = readExpoConstants();
const platform = readPlatformOS();

export const runtimeMetadata = {
  appVersion: expoConstants?.expoConfig?.version ?? expoConstants?.nativeAppVersion ?? null,
  buildVersion:
    expoConstants?.nativeBuildVersion ??
    (platform === 'ios'
      ? (expoConstants?.expoConfig?.ios?.buildNumber ?? null)
      : (typeof expoConstants?.expoConfig?.android?.versionCode === 'number'
          ? String(expoConstants.expoConfig.android.versionCode)
          : null)),
  executionEnvironment: expoConstants?.executionEnvironment ?? null,
  platform,
};

export function readPlatformOS(): string {
  return Platform?.OS ?? 'unknown';
}

function readExpoConstants(): ExpoConstants | null {
  if (process.env.NODE_ENV === 'test' && Platform?.OS === undefined) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const constantsModule = require('expo-constants') as { default?: ExpoConstants };
    return constantsModule.default ?? (constantsModule as ExpoConstants);
  } catch {
    return null;
  }
}
