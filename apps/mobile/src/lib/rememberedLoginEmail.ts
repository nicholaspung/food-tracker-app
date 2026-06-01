import { localPersistence } from '../localPersistence';
import { logger } from './logger';

const REMEMBERED_LOGIN_EMAIL_STORAGE_KEY = localPersistence.authFallback.keys.rememberedLoginEmail;

function normalizeRememberedLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function loadRememberedLoginEmail(): Promise<string> {
  try {
    const storedEmail = await localPersistence.authFallback.storage.getItem(REMEMBERED_LOGIN_EMAIL_STORAGE_KEY);

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
      await localPersistence.authFallback.storage.removeItem(REMEMBERED_LOGIN_EMAIL_STORAGE_KEY);
      return;
    }

    await localPersistence.authFallback.storage.setItem(REMEMBERED_LOGIN_EMAIL_STORAGE_KEY, normalizedEmail);
  } catch (error) {
    logger.warn('[RememberedLoginEmail] Failed to save remembered login email:', error);
  }
}

export async function clearRememberedLoginEmail(): Promise<void> {
  try {
    await localPersistence.authFallback.storage.removeItem(REMEMBERED_LOGIN_EMAIL_STORAGE_KEY);
  } catch (error) {
    logger.warn('[RememberedLoginEmail] Failed to clear remembered login email:', error);
  }
}
