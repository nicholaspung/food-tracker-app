import { localPersistence } from '../localPersistence';
import type { AuthUser } from '../types/auth';

const ROLE_PREVIEW_STORAGE_KEY = localPersistence.uiPreferences.keys.rolePreview;

export interface RolePreviewSettings {
  viewAsNonAdmin: boolean;
  viewAsNonSubscriber: boolean;
}

export const DEFAULT_ROLE_PREVIEW_SETTINGS: RolePreviewSettings = {
  viewAsNonAdmin: false,
  viewAsNonSubscriber: false,
};

let rolePreviewSettingsCache: RolePreviewSettings = DEFAULT_ROLE_PREVIEW_SETTINGS;

function normalizeRolePreviewSettings(value: unknown): RolePreviewSettings {
  if (!value || typeof value !== 'object') {
    return DEFAULT_ROLE_PREVIEW_SETTINGS;
  }

  const settings = value as Partial<RolePreviewSettings>;

  return {
    viewAsNonAdmin: settings.viewAsNonAdmin === true,
    viewAsNonSubscriber: settings.viewAsNonSubscriber === true,
  };
}

function hasRolePreviewOverrides(settings: RolePreviewSettings): boolean {
  return settings.viewAsNonAdmin || settings.viewAsNonSubscriber;
}

function setRolePreviewSettingsCache(settings: RolePreviewSettings): RolePreviewSettings {
  rolePreviewSettingsCache = normalizeRolePreviewSettings(settings);
  return rolePreviewSettingsCache;
}

function clearRolePreviewSettingsCache(): RolePreviewSettings {
  rolePreviewSettingsCache = DEFAULT_ROLE_PREVIEW_SETTINGS;
  return rolePreviewSettingsCache;
}

export async function loadRolePreviewSettings(): Promise<RolePreviewSettings> {
  try {
    const storedValue = await localPersistence.uiPreferences.storage.getItem(ROLE_PREVIEW_STORAGE_KEY);

    if (!storedValue) {
      return clearRolePreviewSettingsCache();
    }

    const parsedValue = JSON.parse(storedValue) as unknown;
    return setRolePreviewSettingsCache(normalizeRolePreviewSettings(parsedValue));
  } catch {
    return clearRolePreviewSettingsCache();
  }
}

export async function persistRolePreviewSettings(
  settings: RolePreviewSettings,
): Promise<RolePreviewSettings> {
  const normalizedSettings = setRolePreviewSettingsCache(settings);

  try {
    if (!hasRolePreviewOverrides(normalizedSettings)) {
      await localPersistence.uiPreferences.storage.removeItem(ROLE_PREVIEW_STORAGE_KEY);
      return normalizedSettings;
    }

    await localPersistence.uiPreferences.storage.setItem(ROLE_PREVIEW_STORAGE_KEY, JSON.stringify(normalizedSettings));
    return normalizedSettings;
  } catch {
    return normalizedSettings;
  }
}

export async function clearPersistedRolePreviewSettings(): Promise<RolePreviewSettings> {
  clearRolePreviewSettingsCache();

  try {
    await localPersistence.uiPreferences.storage.removeItem(ROLE_PREVIEW_STORAGE_KEY);
  } catch {
    // Ignore persistence cleanup failures; in-memory state has already been reset.
  }

  return rolePreviewSettingsCache;
}

export function getEffectiveAuthUser(
  user: AuthUser | null,
  settings: RolePreviewSettings,
): AuthUser | null {
  if (!user) {
    return null;
  }

  if (user.isAdmin !== true) {
    return user;
  }

  return {
    ...user,
    isAdmin: settings.viewAsNonAdmin ? false : user.isAdmin,
    isSubscriber: settings.viewAsNonSubscriber ? false : user.isSubscriber,
  };
}
