import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '../../lib/logger';
import {
  clearPersistedRolePreviewSettings,
  DEFAULT_ROLE_PREVIEW_SETTINGS,
  loadRolePreviewSettings,
  persistRolePreviewSettings,
  type RolePreviewSettings,
} from '../../lib/rolePreview';
import type { AuthUser } from '../../types/auth';
import type { AuthStatus } from './authSession';

export type RolePreviewSettingKey = keyof RolePreviewSettings;

export interface RolePreviewState {
  settings: RolePreviewSettings;
  restore: () => Promise<void>;
  reset: () => void;
  setSetting: (setting: RolePreviewSettingKey, enabled: boolean) => void;
}

export function useRolePreviewState(canUseRolePreview: boolean): RolePreviewState {
  const [settings, setSettings] = useState<RolePreviewSettings>(DEFAULT_ROLE_PREVIEW_SETTINGS);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const restore = useCallback(async () => {
    const restoredSettings = await loadRolePreviewSettings();
    if (isMountedRef.current) {
      setSettings(restoredSettings);
    }
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_ROLE_PREVIEW_SETTINGS);
    void clearPersistedRolePreviewSettings().catch((error) => {
      logger.warn('[RolePreviewState] Failed to clear role preview settings:', error);
    });
  }, []);

  const setSetting = useCallback(
    (setting: RolePreviewSettingKey, enabled: boolean) => {
      if (!canUseRolePreview) {
        return;
      }

      setSettings((currentSettings) => {
        const nextSettings: RolePreviewSettings =
          setting === 'viewAsNonAdmin'
            ? { ...currentSettings, viewAsNonAdmin: enabled }
            : { ...currentSettings, viewAsNonSubscriber: enabled };

        if (
          nextSettings.viewAsNonAdmin === currentSettings.viewAsNonAdmin &&
          nextSettings.viewAsNonSubscriber === currentSettings.viewAsNonSubscriber
        ) {
          return currentSettings;
        }

        void persistRolePreviewSettings(nextSettings).catch((error) => {
          logger.warn('[RolePreviewState] Failed to persist role preview settings:', error);
        });

        return nextSettings;
      });
    },
    [canUseRolePreview],
  );

  return { reset, restore, setSetting, settings };
}

interface RolePreviewEligibilityOptions {
  actualUser: AuthUser | null;
  reset: () => void;
  settings: RolePreviewSettings;
  status: AuthStatus;
}

export function useRolePreviewEligibility({
  actualUser,
  reset,
  settings,
  status,
}: RolePreviewEligibilityOptions): void {
  useEffect(() => {
    if (status === 'bootstrapping' || actualUser?.isAdmin === true) {
      return;
    }

    if (!settings.viewAsNonAdmin && !settings.viewAsNonSubscriber) {
      return;
    }

    reset();
  }, [actualUser?.isAdmin, reset, settings.viewAsNonAdmin, settings.viewAsNonSubscriber, status]);
}
