import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Application from 'expo-application';

function getExpoBuildVersion(): string | null {
  if (Platform.OS === 'ios') {
    return Constants.expoConfig?.ios?.buildNumber ?? null;
  }

  const versionCode = Constants.expoConfig?.android?.versionCode;
  return typeof versionCode === 'number' ? String(versionCode) : null;
}

function getAppVersion(): string {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? 'Unknown';
}

function getAppBuildVersion(): string {
  return Application.nativeBuildVersion ?? getExpoBuildVersion() ?? 'Unknown';
}

export function formatAppVersionLabel(): string {
  const appVersion = getAppVersion();
  const buildVersion = getAppBuildVersion();

  return buildVersion === 'Unknown' ? `v${appVersion}` : `v${appVersion} (${buildVersion})`;
}
