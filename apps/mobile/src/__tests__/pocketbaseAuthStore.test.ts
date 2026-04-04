import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { SecureStoreAuthStore } from '../lib/pocketbaseAuthStore';

describe('SecureStoreAuthStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await SecureStore.deleteItemAsync('test_auth_key');
    await SecureStore.deleteItemAsync('test_auth_key_clear');
    await SecureStore.deleteItemAsync('test_auth_key_migrate');
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

  it('migrates legacy AsyncStorage auth state into SecureStore', async () => {
    await AsyncStorage.setItem(
      'test_auth_key_migrate',
      JSON.stringify({
        token: 'legacy_jwt',
        record: {
          id: 'user_legacy',
          email: 'legacy@example.com',
          verified: true,
        },
      }),
    );

    const store = new SecureStoreAuthStore('test_auth_key_migrate');
    await store.waitUntilReady();

    expect(store.token).toBe('legacy_jwt');
    expect(store.record?.id).toBe('user_legacy');
    expect(await AsyncStorage.getItem('test_auth_key_migrate')).toBeNull();
    expect(await SecureStore.getItemAsync('test_auth_key_migrate')).toContain('legacy_jwt');
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

  it('falls back to AsyncStorage when the SecureStore native module is unavailable', async () => {
    jest.resetModules();
    jest.doMock('expo-secure-store', () => {
      throw new Error("Cannot find native module 'ExpoSecureStore'");
    });

    const { SecureStoreAuthStore: FallbackAuthStore } = await import('../lib/pocketbaseAuthStore');

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
  });
});
