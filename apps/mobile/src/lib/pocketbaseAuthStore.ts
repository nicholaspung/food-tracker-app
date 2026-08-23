import type { SecureStoreOptions } from 'expo-secure-store';
import type * as SecureStoreModule from 'expo-secure-store';
import { BaseAuthStore, type RecordModel } from 'pocketbase';

import { env } from '../config/env';
import { getEnvironmentStorageKey, isCurrentBackendUrl } from '../config/persistence';
import { localPersistence } from '../localPersistence';
import { logger } from './logger';

interface PersistedAuthState {
  backendUrl?: string;
  fileAccessToken?: string;
  fileAccessTokenUserId?: string;
  token: string;
  record: RecordModel | null;
}

type SecureStoreModuleType = typeof SecureStoreModule;
const DEFAULT_AUTH_STORAGE_KEY = localPersistence.authFallback.keys.pocketbaseAuth;
const AUTH_KEYCHAIN_SERVICE = getEnvironmentStorageKey('food_tracker_mobile_auth');

let cachedSecureStoreModule: SecureStoreModuleType | null | undefined;

function getSecureStoreModule(): SecureStoreModuleType | null {
  if (cachedSecureStoreModule !== undefined) {
    return cachedSecureStoreModule;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedSecureStoreModule = require('expo-secure-store') as SecureStoreModuleType;
  } catch (error) {
    logger.warn('[AuthStore] expo-secure-store native module is unavailable, falling back to AsyncStorage:', error);
    cachedSecureStoreModule = null;
  }

  return cachedSecureStoreModule;
}

function getSecureStoreOptions(secureStore: SecureStoreModuleType): SecureStoreOptions {
  return {
    keychainAccessible: secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    keychainService: AUTH_KEYCHAIN_SERVICE,
  };
}

export class SecureStoreAuthStore extends BaseAuthStore {
  private fileAccessToken = '';
  private fileAccessTokenUserId = '';
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
    const nextUserId = record?.id ?? '';
    if (this.fileAccessTokenUserId && this.fileAccessTokenUserId !== nextUserId) {
      this.fileAccessToken = '';
      this.fileAccessTokenUserId = '';
    }
    super.save(token, record);
    void this.persistToStorage();
  }

  override clear(): void {
    this.fileAccessToken = '';
    this.fileAccessTokenUserId = '';
    super.clear();
    void this.clearPersistedStorage();
  }

  getFileAccessToken(userId: string): string {
    return this.fileAccessTokenUserId === userId ? this.fileAccessToken : '';
  }

  saveFileAccessToken(token: string, userId: string): void {
    this.fileAccessToken = token;
    this.fileAccessTokenUserId = userId;
    void this.persistToStorage();
  }

  clearFileAccessToken(): void {
    this.fileAccessToken = '';
    this.fileAccessTokenUserId = '';
    void this.persistToStorage();
  }

  private async restoreFromStorage(): Promise<void> {
    try {
      const serialized = await this.readPersistedStorage();
      if (!serialized) {
        return;
      }

      const parsed = JSON.parse(serialized) as PersistedAuthState;
      if (parsed.backendUrl && !isCurrentBackendUrl(parsed.backendUrl)) {
        await this.clearPersistedStorage();
        return;
      }

      if (!parsed.token) {
        await this.clearPersistedStorage();
        return;
      }

      this.fileAccessToken = parsed.fileAccessToken ?? '';
      this.fileAccessTokenUserId = parsed.fileAccessTokenUserId ?? '';
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
        backendUrl: env.pocketbaseUrl,
        fileAccessToken: this.fileAccessToken || undefined,
        fileAccessTokenUserId: this.fileAccessTokenUserId || undefined,
        token: this.token,
        record: this.record,
      } satisfies PersistedAuthState);

      const secureStore = await this.getSecureStoreIfAvailable();
      if (secureStore) {
        await secureStore.setItemAsync(this.storageKey, serialized, getSecureStoreOptions(secureStore));
        await localPersistence.authFallback.storage.removeItem(this.storageKey);
        return;
      }

      await localPersistence.authFallback.storage.setItem(this.storageKey, serialized);
    } catch (error) {
      logger.warn('[AuthStore] Failed to persist auth state:', error);
    }
  }

  private async checkSecureStoreAvailability(): Promise<boolean> {
    const secureStore = getSecureStoreModule();
    if (!secureStore) {
      return false;
    }

    try {
      return await secureStore.isAvailableAsync();
    } catch (error) {
      logger.warn('[AuthStore] Failed to determine SecureStore availability, falling back to AsyncStorage:', error);
      return false;
    }
  }

  private async getSecureStoreIfAvailable(): Promise<SecureStoreModuleType | null> {
    const secureStoreAvailable = await this.secureStoreAvailablePromise;
    return secureStoreAvailable ? getSecureStoreModule() : null;
  }

  private async readPersistedStorage(): Promise<string | null> {
    const secureStore = await this.getSecureStoreIfAvailable();

    if (secureStore) {
      const secureValue = await secureStore.getItemAsync(this.storageKey, getSecureStoreOptions(secureStore));
      await localPersistence.authFallback.storage.removeItem(this.storageKey);

      return secureValue;
    }

    return localPersistence.authFallback.storage.getItem(this.storageKey);
  }

  private async clearPersistedStorage(): Promise<void> {
    const secureStore = await this.getSecureStoreIfAvailable();

    if (secureStore) {
      await secureStore.deleteItemAsync(this.storageKey, getSecureStoreOptions(secureStore));
    }

    await localPersistence.authFallback.storage.removeItem(this.storageKey);
  }
}

export const authStore = new SecureStoreAuthStore();
