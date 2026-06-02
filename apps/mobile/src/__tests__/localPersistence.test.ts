import AsyncStorage from '@react-native-async-storage/async-storage';

import { getEnvironmentDatabaseName, getEnvironmentStorageKey } from '../config/persistence';
import { localPersistence } from '../localPersistence';

describe('localPersistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    globalThis.localStorage.clear();
  });

  it('keeps owned storage categories explicit while preserving current keys', () => {
    expect(localPersistence.queryCache.activeStorageKey).toBe(
      getEnvironmentStorageKey('food_tracker_mobile_query_cache_v5'),
    );
    expect(localPersistence.uiPreferences.keys).toEqual({
      foodProductRatedBefore: 'ui.foodProduct.hasRatedBefore',
      ratingGuideExpanded: 'ui.ratingGuide.expanded',
      rolePreview: 'food_tracker_mobile_role_preview_v1',
      themePreference: 'ui.theme.preference.v1',
    });
    expect(localPersistence.authHandoffs.keys).toEqual({
      pendingAuthRedirect: 'pending_auth_redirect_v1',
      pendingFriendSuggestion: 'pending_friend_suggestion_v1',
    });
    expect(localPersistence.notifications.keys.deviceId).toBe('notifications.deviceId');
    expect(localPersistence.analytics.keys.anonymousId).toBe('analytics.product.anonymousId');
    expect(localPersistence.authFallback.keys).toEqual({
      pocketbaseAuth: getEnvironmentStorageKey('food_tracker_pb_auth'),
      rateLimiter: getEnvironmentStorageKey('food_tracker_auth_rate_limiter_v1'),
      rememberedLoginEmail: getEnvironmentStorageKey('food_tracker_remembered_login_email_v1'),
    });
    expect(localPersistence.offlineQueue.nativeDatabaseName).toBe(
      getEnvironmentDatabaseName('food_tracker_offline_queue.db'),
    );
    expect(localPersistence.offlineQueue.webStorageKey).toBe(
      getEnvironmentStorageKey('food_tracker_mobile_web_offline_queue_v1'),
    );
  });

  it('delegates marker categories to native localStorage while preserving key names', async () => {
    await localPersistence.uiPreferences.storage.setItem(
      localPersistence.uiPreferences.keys.themePreference,
      'dark',
    );
    await localPersistence.analytics.storage.setItem(localPersistence.analytics.keys.anonymousId, 'anon-1');
    await localPersistence.notifications.storage.setItem(localPersistence.notifications.keys.deviceId, 'device-1');

    await expect(AsyncStorage.getItem(localPersistence.uiPreferences.keys.themePreference)).resolves.toBeNull();
    expect(globalThis.localStorage.getItem(localPersistence.uiPreferences.keys.themePreference)).toBe('dark');
    expect(globalThis.localStorage.getItem(localPersistence.analytics.keys.anonymousId)).toBe('anon-1');
    expect(globalThis.localStorage.getItem(localPersistence.notifications.keys.deviceId)).toBe('device-1');
    await expect(
      localPersistence.uiPreferences.storage.getItem(localPersistence.uiPreferences.keys.themePreference),
    ).resolves.toBe('dark');

    await localPersistence.uiPreferences.storage.removeItem(localPersistence.uiPreferences.keys.themePreference);
    await localPersistence.analytics.storage.removeItem(localPersistence.analytics.keys.anonymousId);
    await localPersistence.notifications.storage.removeItem(localPersistence.notifications.keys.deviceId);

    expect(globalThis.localStorage.getItem(localPersistence.uiPreferences.keys.themePreference)).toBeNull();
    expect(globalThis.localStorage.getItem(localPersistence.analytics.keys.anonymousId)).toBeNull();
    expect(globalThis.localStorage.getItem(localPersistence.notifications.keys.deviceId)).toBeNull();
  });

  it('keeps non-marker async key-value categories on the existing AsyncStorage engine', async () => {
    await localPersistence.queryCache.storage.setItem(localPersistence.queryCache.activeStorageKey, 'query-cache');
    await localPersistence.usageSnapshots.storage.setItem(
      localPersistence.usageSnapshots.buildStorageKey('user-1'),
      'usage-cache',
    );
    await localPersistence.authHandoffs.storage.setItem(
      localPersistence.authHandoffs.keys.pendingAuthRedirect,
      'redirect',
    );
    await localPersistence.authFallback.storage.setItem(localPersistence.authFallback.keys.rateLimiter, 'rate-limit');

    await expect(AsyncStorage.getItem(localPersistence.queryCache.activeStorageKey)).resolves.toBe('query-cache');
    await expect(
      AsyncStorage.getItem(localPersistence.usageSnapshots.buildStorageKey('user-1')),
    ).resolves.toBe('usage-cache');
    await expect(
      AsyncStorage.getItem(localPersistence.authHandoffs.keys.pendingAuthRedirect),
    ).resolves.toBe('redirect');
    await expect(AsyncStorage.getItem(localPersistence.authFallback.keys.rateLimiter)).resolves.toBe('rate-limit');
  });

  it('builds dynamic user-scoped keys without changing their format', () => {
    expect(localPersistence.usageSnapshots.buildStorageKey('user-1')).toBe(
      'usage.monthly.snapshot.v1:user-1:actual',
    );
    expect(localPersistence.usageSnapshots.buildStorageKey('user-1', ' preview ')).toBe(
      'usage.monthly.snapshot.v1:user-1:preview',
    );
    expect(localPersistence.analytics.buildFirstFoodLoggedKey('anon-1')).toBe(
      'analytics.product.firstFoodLogged.anon-1',
    );
  });
});
