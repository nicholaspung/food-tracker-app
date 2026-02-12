import AsyncStorage from '@react-native-async-storage/async-storage';

import { AsyncStorageAuthStore } from '../lib/pocketbaseAuthStore';

describe('AsyncStorageAuthStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists auth state and restores it for a fresh store instance', async () => {
    const store = new AsyncStorageAuthStore('test_auth_key');
    await store.waitUntilReady();

    store.save('jwt_token', {
      id: 'user_1',
      email: 'mobile@example.com',
      verified: true,
    } as never);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const restoredStore = new AsyncStorageAuthStore('test_auth_key');
    await restoredStore.waitUntilReady();

    expect(restoredStore.token).toBe('jwt_token');
    expect(restoredStore.record?.id).toBe('user_1');
  });

  it('clears persisted auth state on clear', async () => {
    const store = new AsyncStorageAuthStore('test_auth_key_clear');
    await store.waitUntilReady();

    store.save('jwt_token', {
      id: 'user_2',
      email: 'clear@example.com',
      verified: true,
    } as never);

    await new Promise((resolve) => setTimeout(resolve, 0));

    store.clear();

    await new Promise((resolve) => setTimeout(resolve, 0));

    const restoredStore = new AsyncStorageAuthStore('test_auth_key_clear');
    await restoredStore.waitUntilReady();

    expect(restoredStore.token).toBe('');
    expect(restoredStore.record).toBeNull();
  });
});
