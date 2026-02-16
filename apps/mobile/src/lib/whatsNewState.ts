import AsyncStorage from '@react-native-async-storage/async-storage';

import { LATEST_WHATS_NEW_VERSION } from './whatsNewData';

const WHATS_NEW_SEEN_STORAGE_KEY = 'food_tracker_mobile_whats_new_seen_version';

export const WHATS_NEW_SEEN_QUERY_KEY = ['feature', 'whats-new-seen-version'] as const;

export async function getSeenWhatsNewVersion(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(WHATS_NEW_SEEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function hasUnseenWhatsNew(seenVersion: string | null | undefined): boolean {
  return seenVersion !== LATEST_WHATS_NEW_VERSION;
}

export async function markLatestWhatsNewAsSeen(): Promise<void> {
  await AsyncStorage.setItem(WHATS_NEW_SEEN_STORAGE_KEY, LATEST_WHATS_NEW_VERSION);
}
