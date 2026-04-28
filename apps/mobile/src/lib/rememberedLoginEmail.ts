import AsyncStorage from '@react-native-async-storage/async-storage';

import { getEnvironmentStorageKey } from '../config/persistence';
import { logger } from './logger';

const REMEMBERED_LOGIN_EMAIL_STORAGE_KEY = getEnvironmentStorageKey(
  'food_tracker_remembered_login_email_v1',
);

function normalizeRememberedLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function loadRememberedLoginEmail(): Promise<string> {
  try {
    const storedEmail = await AsyncStorage.getItem(REMEMBERED_LOGIN_EMAIL_STORAGE_KEY);

    if (!storedEmail) {
      return '';
    }

    return normalizeRememberedLoginEmail(storedEmail);
  } catch (error) {
    logger.warn('[RememberedLoginEmail] Failed to load remembered login email:', error);
    return '';
  }
}

export async function saveRememberedLoginEmail(email: string): Promise<void> {
  const normalizedEmail = normalizeRememberedLoginEmail(email);

  try {
    if (!normalizedEmail) {
      await AsyncStorage.removeItem(REMEMBERED_LOGIN_EMAIL_STORAGE_KEY);
      return;
    }

    await AsyncStorage.setItem(REMEMBERED_LOGIN_EMAIL_STORAGE_KEY, normalizedEmail);
  } catch (error) {
    logger.warn('[RememberedLoginEmail] Failed to save remembered login email:', error);
  }
}

export async function clearRememberedLoginEmail(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REMEMBERED_LOGIN_EMAIL_STORAGE_KEY);
  } catch (error) {
    logger.warn('[RememberedLoginEmail] Failed to clear remembered login email:', error);
  }
}
