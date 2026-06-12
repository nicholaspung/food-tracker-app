import { useQuery, type QueryClient } from '@tanstack/react-query';

import {
  getNotificationPreferences,
  mapNotificationPreferences,
  type NotificationPreferences,
  type NotificationPreferencesRecord,
} from './notificationPreferencesStore';
import { getCollectionRecord } from './pocketbaseGateway';
import type {
  HomeFeedDefaultMode,
  HomeFeedDefaultSort,
  HomeFeedDefaultTypeFilter,
} from './homeFeedPreferences';

export const settingsQueryKeys = {
  root: ['feature', 'settings'] as const,
  detail: (userId: string | null | undefined) => ['feature', 'settings', userId ?? null] as const,
};

export type VisitVisibility = 'friends' | 'private';
export type RestaurantVisibility = 'private' | 'friends';
export type ListVisibility = 'private' | 'friends';

export interface UserSettingsRecord {
  defaultVisitVisibility?: unknown;
  defaultRestaurantVisibility?: unknown;
  defaultListVisibility?: unknown;
  defaultHomeFeedMode?: unknown;
  defaultHomeFeedTypeFilter?: unknown;
  defaultHomeFeedSort?: unknown;
}

export interface UserSettings {
  visitVisibility: VisitVisibility;
  restaurantVisibility: RestaurantVisibility;
  listVisibility: ListVisibility;
  homeFeedMode: HomeFeedDefaultMode;
  homeFeedTypeFilter: HomeFeedDefaultTypeFilter;
  homeFeedSort: HomeFeedDefaultSort;
  notificationPreferences: NotificationPreferences;
}

interface ReadSettingsOptions {
  signal?: AbortSignal;
}

function normalizeVisitVisibility(value: unknown): VisitVisibility {
  return value === 'private' ? 'private' : 'friends';
}

function normalizeRestaurantVisibility(value: unknown): RestaurantVisibility {
  return value === 'private' ? 'private' : 'friends';
}

function normalizeListVisibility(value: unknown): ListVisibility {
  return value === 'private' ? 'private' : 'friends';
}

export function mapUserSettings(record: UserSettingsRecord): UserSettings {
  const homeFeedDefaults = {
    homeFeedMode: record.defaultHomeFeedMode === 'friends' ? 'friends' : 'mine',
    homeFeedTypeFilter:
      record.defaultHomeFeedTypeFilter === 'all' || record.defaultHomeFeedTypeFilter === 'food-products'
        ? record.defaultHomeFeedTypeFilter
        : 'visits',
    homeFeedSort: record.defaultHomeFeedSort === 'tracked' ? 'tracked' : 'created',
  } as const;

  return {
    visitVisibility: normalizeVisitVisibility(record.defaultVisitVisibility),
    restaurantVisibility: normalizeRestaurantVisibility(record.defaultRestaurantVisibility),
    listVisibility: normalizeListVisibility(record.defaultListVisibility),
    notificationPreferences: mapNotificationPreferences(record as NotificationPreferencesRecord),
    ...homeFeedDefaults,
  };
}

export async function getSettingsDetail(
  userId: string | null | undefined,
  options?: ReadSettingsOptions,
): Promise<UserSettings> {
  if (!userId) {
    throw new Error('Authentication required.');
  }

  const [record, notificationPreferences] = await Promise.all([
    getCollectionRecord<UserSettingsRecord>('users', userId, { signal: options?.signal }),
    getNotificationPreferences(userId, { signal: options?.signal }),
  ]);

  return {
    ...mapUserSettings(record),
    notificationPreferences,
  };
}

export function useSettingsDetailRead(userId: string | null | undefined) {
  return useQuery({
    enabled: Boolean(userId),
    queryKey: settingsQueryKeys.detail(userId),
    queryFn: ({ signal }) => getSettingsDetail(userId, { signal }),
  });
}

export async function invalidateSettingsQueries(
  queryClient: QueryClient,
  userId: string | null | undefined,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: settingsQueryKeys.detail(userId),
  });
}
