import Constants from 'expo-constants';
import * as Application from 'expo-application';

function getAppVersion(): string {
  return Constants.expoConfig?.version ?? Application.nativeApplicationVersion ?? 'Unknown';
}

export function formatAppVersionLabel(): string {
  const appVersion = getAppVersion();

  return `v${appVersion}`;
}
