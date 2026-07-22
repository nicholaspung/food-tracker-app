import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { SecureStoreAuthStore } from '../lib/pocketbaseAuthStore';

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('SecureStoreAuthStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await SecureStore.deleteItemAsync('test_auth_key');
    await SecureStore.deleteItemAsync('test_auth_key_backend_mismatch');
    await SecureStore.deleteItemAsync('test_auth_key_clear');
    await SecureStore.deleteItemAsync('test_auth_key_legacy');
  });

  it('persists auth state and restores it for a fresh store instance', async () => {
    const store = new SecureStoreAuthStore('test_auth_key');
    await store.waitUntilReady();

    store.save('jwt_token', {
      id: 'user_1',
      email: 'mobile@example.com',
      verified: true,
    } as never);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const secureValue = await SecureStore.getItemAsync('test_auth_key');
    expect(secureValue).toContain('jwt_token');
    expect(await AsyncStorage.getItem('test_auth_key')).toBeNull();

    const restoredStore = new SecureStoreAuthStore('test_auth_key');
    await restoredStore.waitUntilReady();

    expect(restoredStore.token).toBe('jwt_token');
    expect(restoredStore.record?.id).toBe('user_1');
  });

  it('restores the last file token for the same user and clears it across accounts', async () => {
    const store = new SecureStoreAuthStore('test_auth_key');
    await store.waitUntilReady();
    store.save('jwt_token', { id: 'user_1' } as never);
    store.saveFileAccessToken('file_token_1', 'user_1');

    await new Promise((resolve) => setTimeout(resolve, 0));

    const restoredStore = new SecureStoreAuthStore('test_auth_key');
    await restoredStore.waitUntilReady();
    expect(restoredStore.getFileAccessToken('user_1')).toBe('file_token_1');

    restoredStore.save('jwt_token_2', { id: 'user_2' } as never);
    expect(restoredStore.getFileAccessToken('user_1')).toBe('');
    expect(restoredStore.getFileAccessToken('user_2')).toBe('');
  });

  it('ignores legacy AsyncStorage auth state when SecureStore is available', async () => {
    await AsyncStorage.setItem(
      'test_auth_key_legacy',
      JSON.stringify({
        token: 'legacy_jwt',
        record: {
          id: 'user_legacy',
          email: 'legacy@example.com',
          verified: true,
        },
      }),
    );
    mockedAsyncStorage.getItem.mockClear();

    const store = new SecureStoreAuthStore('test_auth_key_legacy');
    await store.waitUntilReady();

    expect(store.token).toBe('');
    expect(store.record).toBeNull();
    expect(mockedAsyncStorage.getItem).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('test_auth_key_legacy')).toContain('legacy_jwt');
    expect(await SecureStore.getItemAsync('test_auth_key_legacy')).toBeNull();
  });

  it('clears persisted auth state on clear', async () => {
    const store = new SecureStoreAuthStore('test_auth_key_clear');
    await store.waitUntilReady();

    store.save('jwt_token', {
      id: 'user_2',
      email: 'clear@example.com',
      verified: true,
    } as never);

    await new Promise((resolve) => setTimeout(resolve, 0));

    store.clear();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await SecureStore.getItemAsync('test_auth_key_clear')).toBeNull();
    expect(await AsyncStorage.getItem('test_auth_key_clear')).toBeNull();

    const restoredStore = new SecureStoreAuthStore('test_auth_key_clear');
    await restoredStore.waitUntilReady();

    expect(restoredStore.token).toBe('');
    expect(restoredStore.record).toBeNull();
  });

  it('drops persisted auth state that belongs to a different backend', async () => {
    await SecureStore.setItemAsync(
      'test_auth_key_backend_mismatch',
      JSON.stringify({
        backendUrl: 'https://beta.app.yummyrecs.com',
        token: 'beta_jwt',
        record: {
          id: 'user_beta',
          email: 'beta@example.com',
          verified: true,
        },
      }),
    );

    const store = new SecureStoreAuthStore('test_auth_key_backend_mismatch');
    await store.waitUntilReady();

    expect(store.token).toBe('');
    expect(store.record).toBeNull();
    expect(await SecureStore.getItemAsync('test_auth_key_backend_mismatch')).toBeNull();
  });

  it('falls back to AsyncStorage when the SecureStore native module is unavailable', async () => {
    jest.resetModules();
    const warn = jest.fn();
    jest.doMock('expo-secure-store', () => {
      throw new Error("Cannot find native module 'ExpoSecureStore'");
    });
    jest.doMock('../lib/logger', () => ({
      logger: {
        error: jest.fn(),
        log: jest.fn(),
        warn,
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SecureStoreAuthStore: FallbackAuthStore } = require('../lib/pocketbaseAuthStore');

    const store = new FallbackAuthStore('test_auth_key_fallback');
    await store.waitUntilReady();

    store.save('fallback_jwt', {
      id: 'user_fallback',
      email: 'fallback@example.com',
      verified: true,
    } as never);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await AsyncStorage.getItem('test_auth_key_fallback')).toContain('fallback_jwt');

    const restoredStore = new FallbackAuthStore('test_auth_key_fallback');
    await restoredStore.waitUntilReady();

    expect(restoredStore.token).toBe('fallback_jwt');
    expect(restoredStore.record?.id).toBe('user_fallback');
    expect(warn).toHaveBeenCalledWith(
      '[AuthStore] expo-secure-store native module is unavailable, falling back to AsyncStorage:',
      expect.any(Error),
    );
  });
});
