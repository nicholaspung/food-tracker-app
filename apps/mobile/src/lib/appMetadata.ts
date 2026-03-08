import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

function getExpoBuildVersion(): string | null {
  if (Platform.OS === 'ios') {
    return Constants.expoConfig?.ios?.buildNumber ?? null;
  }

  const versionCode = Constants.expoConfig?.android?.versionCode;
  return typeof versionCode === 'number' ? String(versionCode) : null;
}

export function getApplicationName(): string {
  return Application.applicationName ?? Constants.expoConfig?.name ?? 'Yummy Recs';
}

export function getApplicationId(): string {
  return (
    Application.applicationId ??
    Constants.expoConfig?.ios?.bundleIdentifier ??
    Constants.expoConfig?.android?.package ??
    'Unknown'
  );
}

export function getAppVersion(): string {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? 'Unknown';
}

export function getAppBuildVersion(): string {
  return Application.nativeBuildVersion ?? getExpoBuildVersion() ?? 'Unknown';
}

export function formatAppVersionLabel(): string {
  const appVersion = getAppVersion();
  const buildVersion = getAppBuildVersion();

  return buildVersion === 'Unknown' ? `v${appVersion}` : `v${appVersion} (${buildVersion})`;
}
