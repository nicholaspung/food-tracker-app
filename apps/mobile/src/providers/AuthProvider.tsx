import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { pb } from '../lib/pocketbase';
import { authStore } from '../lib/pocketbaseAuthStore';
import { logger } from '../lib/logger';
import {
  clearPersistedRolePreviewSettings,
  DEFAULT_ROLE_PREVIEW_SETTINGS,
  getEffectiveAuthUser,
  loadRolePreviewSettings,
  persistRolePreviewSettings,
  type RolePreviewSettings,
} from '../lib/rolePreview';
import {
  captureObservabilityError,
  clearObservabilityUser,
  identifyObservabilityUser,
  trackObservabilityEvent,
} from '../observability';
import { normalizeAuthUser, type AuthUser } from '../types/auth';

type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated';
type RolePreviewSettingKey = keyof RolePreviewSettings;

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  actualUser: AuthUser | null;
  canUseRolePreview: boolean;
  rolePreviewSettings: RolePreviewSettings;
  setRolePreviewSetting: (setting: RolePreviewSettingKey, enabled: boolean) => void;
  resetRolePreviewSettings: () => void;
  isSubmitting: boolean;
  authError: string | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getCurrentUser(): AuthUser | null {
  return normalizeAuthUser(pb.authStore.record as Record<string, unknown> | null);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('bootstrapping');
  const [actualUser, setActualUser] = useState<AuthUser | null>(null);
  const [rolePreviewSettings, setRolePreviewSettings] = useState<RolePreviewSettings>(
    DEFAULT_ROLE_PREVIEW_SETTINGS,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const canUseRolePreview = actualUser?.isAdmin === true;
  const effectiveRolePreviewSettings = useMemo<RolePreviewSettings>(
    () => (canUseRolePreview ? rolePreviewSettings : DEFAULT_ROLE_PREVIEW_SETTINGS),
    [canUseRolePreview, rolePreviewSettings],
  );
  const user = useMemo(
    () => getEffectiveAuthUser(actualUser, effectiveRolePreviewSettings),
    [actualUser, effectiveRolePreviewSettings],
  );

  const syncAuthSnapshot = useCallback(() => {
    const nextUser = getCurrentUser();

    if (nextUser && pb.authStore.isValid) {
      setActualUser(nextUser);
      setStatus('authenticated');
      identifyObservabilityUser(nextUser);
      return;
    }

    setActualUser(null);
    setStatus('unauthenticated');
    clearObservabilityUser();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        await authStore.waitUntilReady();
        const loadedRolePreviewSettings = await loadRolePreviewSettings();

        if (isMounted) {
          setRolePreviewSettings(loadedRolePreviewSettings);
        }

        if (pb.authStore.token && !pb.authStore.isValid) {
          pb.authStore.clear();
        }

        if (pb.authStore.isValid) {
          try {
            await pb.collection('users').authRefresh();
          } catch (refreshError) {
            logger.warn('[AuthProvider] authRefresh failed, using cached session:', refreshError);
          }
        }

        if (isMounted) {
          syncAuthSnapshot();
        }
      } catch (error) {
        if (isMounted) {
          setStatus('unauthenticated');
          setActualUser(null);
          setAuthError('Unable to restore session. Please sign in again.');
          captureObservabilityError(error);
        }
      }
    };

    const unsubscribe = pb.authStore.onChange(() => {
      if (isMounted) {
        syncAuthSnapshot();
      }
    });

    void bootstrap();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [syncAuthSnapshot]);

  useEffect(() => {
    if (status === 'bootstrapping') {
      return;
    }

    if (actualUser?.isAdmin === true) {
      return;
    }

    if (!rolePreviewSettings.viewAsNonAdmin && !rolePreviewSettings.viewAsNonSubscriber) {
      return;
    }

    setRolePreviewSettings(DEFAULT_ROLE_PREVIEW_SETTINGS);
    void clearPersistedRolePreviewSettings();
  }, [
    actualUser?.isAdmin,
    rolePreviewSettings.viewAsNonAdmin,
    rolePreviewSettings.viewAsNonSubscriber,
    status,
  ]);

  const setRolePreviewSetting = useCallback(
    (setting: RolePreviewSettingKey, enabled: boolean) => {
      if (!canUseRolePreview) {
        return;
      }

      setRolePreviewSettings((currentSettings) => {
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
          logger.warn('[AuthProvider] Failed to persist role preview settings:', error);
        });

        return nextSettings;
      });
    },
    [canUseRolePreview],
  );

  const resetRolePreviewSettings = useCallback(() => {
    setRolePreviewSettings(DEFAULT_ROLE_PREVIEW_SETTINGS);
    void clearPersistedRolePreviewSettings().catch((error) => {
      logger.warn('[AuthProvider] Failed to clear role preview settings:', error);
    });
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    setIsSubmitting(true);
    setAuthError(null);

    try {
      const authData = await pb.collection('users').authWithPassword(email.trim(), password);
      const authUser = normalizeAuthUser(authData.record as Record<string, unknown> | null);

      if (!authUser) {
        throw new Error('Authentication succeeded but user payload was invalid.');
      }

      if (!authUser.verified) {
        pb.authStore.clear();
        throw new Error('Please verify your email before signing in.');
      }

      setActualUser(authUser);
      setStatus('authenticated');
      identifyObservabilityUser(authUser);
      trackObservabilityEvent('LOGIN_SUCCESS', {
        source: 'mobile_auth_shell',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed. Please try again.';
      setAuthError(message);
      setStatus('unauthenticated');
      setActualUser(null);
      captureObservabilityError(error);
      trackObservabilityEvent('LOGIN_FAILED', {
        source: 'mobile_auth_shell',
      });
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    pb.authStore.clear();
    setActualUser(null);
    setRolePreviewSettings(DEFAULT_ROLE_PREVIEW_SETTINGS);
    void clearPersistedRolePreviewSettings().catch((error) => {
      logger.warn('[AuthProvider] Failed to clear role preview settings on sign-out:', error);
    });
    setStatus('unauthenticated');
    setAuthError(null);
    clearObservabilityUser();
    trackObservabilityEvent('LOGOUT', {
      source: 'mobile_auth_shell',
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      actualUser,
      canUseRolePreview,
      rolePreviewSettings,
      setRolePreviewSetting,
      resetRolePreviewSettings,
      isSubmitting,
      authError,
      signInWithPassword,
      signOut,
    }),
    [
      actualUser,
      authError,
      canUseRolePreview,
      isSubmitting,
      resetRolePreviewSettings,
      rolePreviewSettings,
      setRolePreviewSetting,
      signInWithPassword,
      signOut,
      status,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
