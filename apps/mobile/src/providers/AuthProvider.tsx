import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ClientResponseError, type RecordModel } from 'pocketbase';

import { env } from '../config/env';
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
  resetObservabilityIdentity,
  setObservabilityContext,
  trackObservabilityEvent,
} from '../observability';
import {
  buildAuthErrorObservabilityProperties,
  formatAuthErrorMessage,
} from './authErrorMessages';
import { normalizeAuthUser, type AuthUser } from '../types/auth';

type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated';
type RolePreviewSettingKey = keyof RolePreviewSettings;
export const AUTH_EMAIL_UNVERIFIED_ERROR = 'AUTH_EMAIL_UNVERIFIED';
export interface AuthBootstrapResult {
  authRecord: RecordModel;
  authToken: string;
  user: AuthUser;
}
export type AuthBootstrap = () => AuthBootstrapResult | null;

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

function shouldClearCachedSessionAfterRefreshFailure(error: unknown): boolean {
  if (error instanceof ClientResponseError) {
    return [400, 401, 403, 404].includes(error.status);
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /auth|token|unauthorized|forbidden|expired|invalid/i.test(error.message);
}

function getCurrentUser(): AuthUser | null {
  return normalizeAuthUser(pb.authStore.record as Record<string, unknown> | null);
}

function resolveAuthUserTier(user: AuthUser | null): 'admin' | 'subscriber' | 'free' | 'anonymous' {
  if (!user) {
    return 'anonymous';
  }

  if (user.isAdmin) {
    return 'admin';
  }

  if (user.isSubscriber) {
    return 'subscriber';
  }

  return 'free';
}

interface AuthProviderProps {
  children: React.ReactNode;
  screenshotReviewBootstrap?: AuthBootstrap;
}

export function AuthProvider({ children, screenshotReviewBootstrap }: AuthProviderProps) {
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

    if (nextUser && (env.isScreenshotReviewMode || pb.authStore.isValid)) {
      setActualUser(nextUser);
      setStatus('authenticated');
      return;
    }

    setActualUser(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      const restoreStartedAt = Date.now();
      const hadPersistedToken = Boolean(pb.authStore.token);
      let refreshFailed = false;
      trackObservabilityEvent('AUTH_SESSION_RESTORE_STARTED', {
        hadPersistedToken,
        source: 'AuthProvider',
      });

      try {
        if (env.isScreenshotReviewMode) {
          const screenshotReviewAuth = screenshotReviewBootstrap?.();

          if (!screenshotReviewAuth) {
            logger.warn('[AuthProvider] Screenshot review mode is only available in development bundles.');
          } else {
            pb.authStore.save(
              screenshotReviewAuth.authToken,
              screenshotReviewAuth.authRecord,
            );

            if (isMounted) {
              setActualUser(screenshotReviewAuth.user);
              setStatus('authenticated');
              setAuthError(null);
            }

            trackObservabilityEvent('AUTH_SESSION_RESTORE_SUCCEEDED', {
              durationMs: Date.now() - restoreStartedAt,
              hadPersistedToken,
              hasValidSession: true,
              refreshFailed: false,
              source: 'AuthProvider',
            });
            return;
          }
        }

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
            refreshFailed = true;
            if (shouldClearCachedSessionAfterRefreshFailure(refreshError)) {
              pb.authStore.clear();
            }
            logger.warn('[AuthProvider] authRefresh failed, using cached session:', refreshError);
          }
        }

        if (isMounted) {
          syncAuthSnapshot();
        }

        trackObservabilityEvent('AUTH_SESSION_RESTORE_SUCCEEDED', {
          durationMs: Date.now() - restoreStartedAt,
          hadPersistedToken,
          hasValidSession: Boolean(pb.authStore.isValid && getCurrentUser()),
          refreshFailed,
          source: 'AuthProvider',
        });
      } catch (error) {
        trackObservabilityEvent('AUTH_SESSION_RESTORE_FAILED', {
          durationMs: Date.now() - restoreStartedAt,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.name : 'unknown_error',
          hadPersistedToken,
          source: 'AuthProvider',
        });
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
  }, [screenshotReviewBootstrap, syncAuthSnapshot]);

  useEffect(() => {
    const isRolePreviewActive =
      canUseRolePreview &&
      (rolePreviewSettings.viewAsNonAdmin || rolePreviewSettings.viewAsNonSubscriber);

    setObservabilityContext({
      actualUserTier: resolveAuthUserTier(actualUser),
      authStatus: status,
      isRolePreviewActive,
      userTier: resolveAuthUserTier(user),
    });
  }, [
    actualUser,
    canUseRolePreview,
    rolePreviewSettings.viewAsNonAdmin,
    rolePreviewSettings.viewAsNonSubscriber,
    status,
    user,
  ]);

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
        throw new Error(AUTH_EMAIL_UNVERIFIED_ERROR);
      }

      setActualUser(authUser);
      setStatus('authenticated');
      trackObservabilityEvent('LOGIN_SUCCESS', {
        source: 'mobile_auth_shell',
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message === AUTH_EMAIL_UNVERIFIED_ERROR
          ? 'Please verify your email to continue.'
          : formatAuthErrorMessage(error, {
              environment: env.environment,
              isAdmin: actualUser?.isAdmin === true,
            });
      setAuthError(message);
      setStatus('unauthenticated');
      setActualUser(null);
      captureObservabilityError(error);
      trackObservabilityEvent('LOGIN_FAILED', {
        ...buildAuthErrorObservabilityProperties(error),
        source: 'mobile_auth_shell',
      });
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [actualUser?.isAdmin]);

  const signOut = useCallback(async () => {
    pb.authStore.clear();
    setActualUser(null);
    setRolePreviewSettings(DEFAULT_ROLE_PREVIEW_SETTINGS);
    void clearPersistedRolePreviewSettings().catch((error) => {
      logger.warn('[AuthProvider] Failed to clear role preview settings on sign-out:', error);
    });
    setStatus('unauthenticated');
    setAuthError(null);
    trackObservabilityEvent('LOGOUT', {
      source: 'mobile_auth_shell',
    });
    resetObservabilityIdentity();
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
