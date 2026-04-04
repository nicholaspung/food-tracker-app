import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { BaseAuthStore, type RecordModel } from 'pocketbase';

import { logger } from './logger';

interface PersistedAuthState {
  token: string;
  record: RecordModel | null;
}

const DEFAULT_AUTH_STORAGE_KEY = 'food_tracker_pb_auth';
const AUTH_KEYCHAIN_SERVICE = 'food_tracker_mobile_auth';
const AUTH_SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: AUTH_KEYCHAIN_SERVICE,
};

export class SecureStoreAuthStore extends BaseAuthStore {
  private readonly storageKey: string;
  private readonly restorePromise: Promise<void>;
  private readonly secureStoreAvailablePromise: Promise<boolean>;

  constructor(storageKey = DEFAULT_AUTH_STORAGE_KEY) {
    super();
    this.storageKey = storageKey;
    this.secureStoreAvailablePromise = this.checkSecureStoreAvailability();
    this.restorePromise = this.restoreFromStorage();
  }

  async waitUntilReady(): Promise<void> {
    await this.restorePromise;
  }

  override save(token: string, record?: RecordModel | null): void {
    super.save(token, record);
    void this.persistToStorage();
  }

  override clear(): void {
    super.clear();
    void this.clearPersistedStorage();
  }

  private async restoreFromStorage(): Promise<void> {
    try {
      const serialized = await this.readPersistedStorage();
      if (!serialized) {
        return;
      }

      const parsed = JSON.parse(serialized) as PersistedAuthState;
      if (!parsed.token) {
        await this.clearPersistedStorage();
        return;
      }

      super.save(parsed.token, parsed.record);
    } catch (error) {
      logger.warn('[AuthStore] Failed to restore stored auth state:', error);
      await this.clearPersistedStorage();
    }
  }

  private async persistToStorage(): Promise<void> {
    try {
      if (!this.token) {
        await this.clearPersistedStorage();
        return;
      }

      const serialized = JSON.stringify({
        token: this.token,
        record: this.record,
      } satisfies PersistedAuthState);

      const secureStoreAvailable = await this.secureStoreAvailablePromise;
      if (secureStoreAvailable) {
        await SecureStore.setItemAsync(this.storageKey, serialized, AUTH_SECURE_STORE_OPTIONS);
        await AsyncStorage.removeItem(this.storageKey);
        return;
      }

      await AsyncStorage.setItem(this.storageKey, serialized);
    } catch (error) {
      logger.warn('[AuthStore] Failed to persist auth state:', error);
    }
  }

  private async checkSecureStoreAvailability(): Promise<boolean> {
    try {
      return await SecureStore.isAvailableAsync();
    } catch (error) {
      logger.warn('[AuthStore] Failed to determine SecureStore availability, falling back to AsyncStorage:', error);
      return false;
    }
  }

  private async readPersistedStorage(): Promise<string | null> {
    const secureStoreAvailable = await this.secureStoreAvailablePromise;

    if (secureStoreAvailable) {
      const secureValue = await SecureStore.getItemAsync(this.storageKey, AUTH_SECURE_STORE_OPTIONS);
      if (secureValue) {
        await AsyncStorage.removeItem(this.storageKey);
        return secureValue;
      }
    }

    const legacyValue = await AsyncStorage.getItem(this.storageKey);
    if (!legacyValue) {
      return null;
    }

    if (secureStoreAvailable) {
      await SecureStore.setItemAsync(this.storageKey, legacyValue, AUTH_SECURE_STORE_OPTIONS);
      await AsyncStorage.removeItem(this.storageKey);
    }

    return legacyValue;
  }

  private async clearPersistedStorage(): Promise<void> {
    const secureStoreAvailable = await this.secureStoreAvailablePromise;

    if (secureStoreAvailable) {
      await SecureStore.deleteItemAsync(this.storageKey, AUTH_SECURE_STORE_OPTIONS);
    }

    await AsyncStorage.removeItem(this.storageKey);
  }
}

export const authStore = new SecureStoreAuthStore();
