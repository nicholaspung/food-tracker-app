export type HomeFeedDefaultMode = 'mine' | 'friends';
export type HomeFeedDefaultTypeFilter = 'all' | 'visits' | 'food-products';
export type HomeFeedDefaultSort = 'created' | 'tracked';

export interface HomeFeedDefaultsRecord {
  defaultHomeFeedMode?: unknown;
  defaultHomeFeedTypeFilter?: unknown;
  defaultHomeFeedSort?: unknown;
}

export interface HomeFeedDefaults {
  homeFeedMode: HomeFeedDefaultMode;
  homeFeedTypeFilter: HomeFeedDefaultTypeFilter;
  homeFeedSort: HomeFeedDefaultSort;
}

export interface HomeFeedDefaultsUpdate {
  defaultHomeFeedMode: HomeFeedDefaultMode;
  defaultHomeFeedTypeFilter: HomeFeedDefaultTypeFilter;
  defaultHomeFeedSort: HomeFeedDefaultSort;
}

export const DEFAULT_HOME_FEED_DEFAULTS: HomeFeedDefaults = {
  homeFeedMode: 'mine',
  homeFeedTypeFilter: 'visits',
  homeFeedSort: 'created',
};

export function normalizeHomeFeedMode(value: unknown): HomeFeedDefaultMode {
  return value === 'friends' ? 'friends' : 'mine';
}

export function normalizeHomeFeedTypeFilter(value: unknown): HomeFeedDefaultTypeFilter {
  if (value === 'all' || value === 'food-products') {
    return value;
  }

  return 'visits';
}

export function normalizeHomeFeedSort(value: unknown): HomeFeedDefaultSort {
  return value === 'tracked' ? 'tracked' : 'created';
}

export function mapHomeFeedDefaultsFromRecord(
  record: HomeFeedDefaultsRecord | null | undefined,
): HomeFeedDefaults {
  return {
    homeFeedMode: normalizeHomeFeedMode(record?.defaultHomeFeedMode),
    homeFeedTypeFilter: normalizeHomeFeedTypeFilter(record?.defaultHomeFeedTypeFilter),
    homeFeedSort: normalizeHomeFeedSort(record?.defaultHomeFeedSort),
  };
}

export function buildHomeFeedDefaultsUpdate(defaults: HomeFeedDefaults): HomeFeedDefaultsUpdate {
  return {
    defaultHomeFeedMode: normalizeHomeFeedMode(defaults.homeFeedMode),
    defaultHomeFeedTypeFilter: normalizeHomeFeedTypeFilter(defaults.homeFeedTypeFilter),
    defaultHomeFeedSort: normalizeHomeFeedSort(defaults.homeFeedSort),
  };
}
