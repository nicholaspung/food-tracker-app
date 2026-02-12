import AsyncStorage from '@react-native-async-storage/async-storage';
import { BaseAuthStore, type RecordModel } from 'pocketbase';

import { logger } from './logger';

interface PersistedAuthState {
  token: string;
  record: RecordModel | null;
}

export class AsyncStorageAuthStore extends BaseAuthStore {
  private readonly storageKey: string;
  private readonly restorePromise: Promise<void>;

  constructor(storageKey = 'food_tracker_pb_auth') {
    super();
    this.storageKey = storageKey;
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
    void AsyncStorage.removeItem(this.storageKey);
  }

  private async restoreFromStorage(): Promise<void> {
    try {
      const serialized = await AsyncStorage.getItem(this.storageKey);
      if (!serialized) {
        return;
      }

      const parsed = JSON.parse(serialized) as PersistedAuthState;
      if (!parsed.token) {
        await AsyncStorage.removeItem(this.storageKey);
        return;
      }

      super.save(parsed.token, parsed.record);
    } catch (error) {
      logger.warn('[AuthStore] Failed to restore stored auth state:', error);
      await AsyncStorage.removeItem(this.storageKey);
    }
  }

  private async persistToStorage(): Promise<void> {
    try {
      if (!this.token) {
        await AsyncStorage.removeItem(this.storageKey);
        return;
      }

      const serialized = JSON.stringify({
        token: this.token,
        record: this.record,
      } satisfies PersistedAuthState);

      await AsyncStorage.setItem(this.storageKey, serialized);
    } catch (error) {
      logger.warn('[AuthStore] Failed to persist auth state:', error);
    }
  }
}

export const authStore = new AsyncStorageAuthStore();
