import AsyncStorageModule from '@react-native-async-storage/async-storage';

import { getEnvironmentDatabaseName, getEnvironmentStorageKey } from './config/persistence';

type AsyncKeyValueStorage = Pick<typeof AsyncStorageModule, 'getItem' | 'setItem' | 'removeItem'>;

const queryCacheKeys = {
  active: getEnvironmentStorageKey('food_tracker_mobile_query_cache_v5'),
  legacy: [
    getEnvironmentStorageKey('food_tracker_mobile_query_cache_v1'),
    getEnvironmentStorageKey('food_tracker_mobile_query_cache_v2'),
    getEnvironmentStorageKey('food_tracker_mobile_query_cache_v3'),
    getEnvironmentStorageKey('food_tracker_mobile_query_cache_v4'),
  ],
} as const;

const localPersistenceAsyncStorage: AsyncKeyValueStorage = {
  getItem: (key) => AsyncStorageModule.getItem(key),
  setItem: (key, value) => AsyncStorageModule.setItem(key, value),
  removeItem: (key) => AsyncStorageModule.removeItem(key),
};

const markerLocalStorage: AsyncKeyValueStorage = {
  getItem: async (key) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key, value) => {
    globalThis.localStorage?.setItem(key, value);
  },
  removeItem: async (key) => {
    globalThis.localStorage?.removeItem(key);
  },
};

function normalizeUsageSnapshotScope(scope?: string | null): string {
  const trimmed = scope?.trim();
  return trimmed ? trimmed : 'actual';
}

function buildUsageSnapshotKey(userId: string, scope?: string | null): string {
  return `usage.monthly.snapshot.v1:${userId}:${normalizeUsageSnapshotScope(scope)}`;
}

function buildFirstFoodLoggedKey(identityKey: string): string {
  return `analytics.product.firstFoodLogged.${identityKey}`;
}

function getLocalStorageItem(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setLocalStorageItem(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Keep the caller's in-memory fallback responsible for storage failures.
  }
}

export const localPersistence = {
  queryCache: {
    activeStorageKey: queryCacheKeys.active,
    legacyStorageKeys: [...queryCacheKeys.legacy],
    storage: localPersistenceAsyncStorage,
  },
  uiPreferences: {
    keys: {
      foodProductRatedBefore: 'ui.foodProduct.hasRatedBefore',
      ratingGuideExpanded: 'ui.ratingGuide.expanded',
      rolePreview: 'food_tracker_mobile_role_preview_v1',
      themePreference: 'ui.theme.preference.v1',
    },
    storage: markerLocalStorage,
  },
  usageSnapshots: {
    buildStorageKey: buildUsageSnapshotKey,
    storage: localPersistenceAsyncStorage,
  },
  authHandoffs: {
    keys: {
      pendingAuthRedirect: 'pending_auth_redirect_v1',
      pendingFriendSuggestion: 'pending_friend_suggestion_v1',
    },
    storage: localPersistenceAsyncStorage,
  },
  notifications: {
    keys: {
      deviceId: 'notifications.deviceId',
    },
    storage: markerLocalStorage,
  },
  analytics: {
    keys: {
      anonymousId: 'analytics.product.anonymousId',
      firstFoodLoggedPrefix: 'analytics.product.firstFoodLogged',
    },
    buildFirstFoodLoggedKey,
    storage: markerLocalStorage,
  },
  authFallback: {
    keys: {
      pocketbaseAuth: getEnvironmentStorageKey('food_tracker_pb_auth'),
      rememberedLoginEmail: getEnvironmentStorageKey('food_tracker_remembered_login_email_v1'),
      rateLimiter: getEnvironmentStorageKey('food_tracker_auth_rate_limiter_v1'),
    },
    storage: localPersistenceAsyncStorage,
  },
  offlineQueue: {
    nativeDatabaseName: getEnvironmentDatabaseName('food_tracker_offline_queue.db'),
    webStorageKey: getEnvironmentStorageKey('food_tracker_mobile_web_offline_queue_v1'),
    webStorage: {
      getItem: getLocalStorageItem,
      setItem: setLocalStorageItem,
    },
  },
} as const;
