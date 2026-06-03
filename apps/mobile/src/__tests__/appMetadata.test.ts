describe('appMetadata', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo-constants');
    jest.dontMock('expo-application');
  });

  it('formats only the app version from Expo config', () => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        expoConfig: {
          version: '1.1.0',
        },
      },
    }));
    jest.doMock('expo-application', () => ({
      nativeApplicationVersion: '1.0.2',
      nativeBuildVersion: '1',
    }));

    const { formatAppVersionLabel } = require('../lib/appMetadata') as typeof import('../lib/appMetadata');

    expect(formatAppVersionLabel()).toBe('v1.1.0');
  });

  it('falls back to the native app version when Expo config is unavailable', () => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {},
    }));
    jest.doMock('expo-application', () => ({
      nativeApplicationVersion: '1.1.0',
      nativeBuildVersion: '1',
    }));

    const { formatAppVersionLabel } = require('../lib/appMetadata') as typeof import('../lib/appMetadata');

    expect(formatAppVersionLabel()).toBe('v1.1.0');
  });
});
