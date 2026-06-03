import * as Application from 'expo-application';
import Constants from 'expo-constants';

import { formatAppVersionLabel } from '../lib/appMetadata';

function setExpoConfig(expoConfig: unknown) {
  Object.defineProperty(Constants, 'expoConfig', {
    configurable: true,
    value: expoConfig,
  });
}

function setNativeApplicationVersion(version: string | null) {
  Object.defineProperty(Application, 'nativeApplicationVersion', {
    configurable: true,
    value: version,
  });
}

describe('appMetadata', () => {
  beforeEach(() => {
    setExpoConfig(null);
    setNativeApplicationVersion(null);
  });

  it('formats only the app version from Expo config', () => {
    setExpoConfig({
      version: '1.1.0',
    });
    setNativeApplicationVersion('1.0.2');

    expect(formatAppVersionLabel()).toBe('v1.1.0');
  });

  it('falls back to the native app version when Expo config is unavailable', () => {
    setExpoConfig({});
    setNativeApplicationVersion('1.1.0');

    expect(formatAppVersionLabel()).toBe('v1.1.0');
  });
});
