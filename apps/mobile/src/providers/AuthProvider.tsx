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
  clearObservabilityUser,
  identifyObservabilityUser,
  setObservabilityContext,
  trackObservabilityEvent,
} from '../observability';
import { normalizeAuthUser, type AuthUser } from '../types/auth';

type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated';
type RolePreviewSettingKey = keyof RolePreviewSettings;
export const AUTH_EMAIL_UNVERIFIED_ERROR = 'AUTH_EMAIL_UNVERIFIED';

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
const SCREENSHOT_REVIEW_AUTH_RECORD: RecordModel = {
  collectionId: 'users',
  collectionName: 'users',
  id: 'screenshot-review-user',
  email: 'screenshots@yummyrecs.local',
  name: 'Screenshot Review',
  verified: true,
  isAdmin: true,
  isSubscriber: true,
  isBetaUser: true,
  defaultListVisibility: 'friends',
  defaultVisitVisibility: 'friends',
  defaultRestaurantVisibility: 'friends',
  created: '2026-01-01T12:00:00.000Z',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractPocketBaseResponseMessage(error: ClientResponseError): string | null {
  if (!isRecord(error.response)) {
    return null;
  }

  if (typeof error.response.message === 'string' && error.response.message.trim()) {
    return error.response.message.trim();
  }

  if (isRecord(error.response.data)) {
    for (const value of Object.values(error.response.data)) {
      if (!isRecord(value)) {
        continue;
      }

      if (typeof value.message === 'string' && value.message.trim()) {
        return value.message.trim();
      }
    }
  }

  return null;
}

function isInvalidCredentialError(error: ClientResponseError): boolean {
  if (error.status !== 400) {
    return false;
  }

  const responseMessage = extractPocketBaseResponseMessage(error);
  if (responseMessage && /authenticate|invalid|password|identity/i.test(responseMessage)) {
    return true;
  }

  if (!isRecord(error.response) || !isRecord(error.response.data)) {
    return false;
  }

  for (const value of Object.values(error.response.data)) {
    if (!isRecord(value)) {
      continue;
    }

    if (typeof value.code === 'string' && /invalid/i.test(value.code)) {
      return true;
    }
  }

  return false;
}

function formatAuthDiagnostics(error: unknown): string {
  const backendUrl = pb.baseUrl;
  const isBetaBackend = /beta/i.test(backendUrl);

  if (error instanceof ClientResponseError) {
    const responseMessage = extractPocketBaseResponseMessage(error);

    if (isInvalidCredentialError(error)) {
      return [
        'Invalid email or password for this backend.',
        isBetaBackend
          ? 'Preview uses the beta database, so production accounts do not automatically work here.'
          : null,
        `Backend: ${backendUrl}`,
        `HTTP status: ${error.status}`,
        responseMessage ? `Server message: ${responseMessage}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (error.status === 0) {
      return [
        'Could not reach the sign-in server.',
        'This usually means the app cannot connect to the configured backend URL.',
        `Backend: ${backendUrl}`,
        responseMessage ? `Network detail: ${responseMessage}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (error.status === 404) {
      return [
        'The sign-in endpoint was not found on the configured backend.',
        'This usually means the preview build is pointed at the wrong host or the proxy is misconfigured.',
        `Backend: ${backendUrl}`,
        `HTTP status: ${error.status}`,
        responseMessage ? `Server message: ${responseMessage}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (error.status >= 500) {
      return [
        'The backend failed while processing sign-in.',
        `Backend: ${backendUrl}`,
        `HTTP status: ${error.status}`,
        responseMessage ? `Server message: ${responseMessage}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    }

    return [
      'Sign-in request was rejected by the backend.',
      `Backend: ${backendUrl}`,
      `HTTP status: ${error.status}`,
      responseMessage ? `Server message: ${responseMessage}` : null,
      error.message && error.message !== responseMessage ? `Client message: ${error.message}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (error instanceof TypeError && /network|fetch|load failed/i.test(error.message)) {
    return [
      'Could not reach the sign-in server.',
      'Check internet access and confirm the preview backend is online.',
      `Backend: ${backendUrl}`,
      `Network detail: ${error.message}`,
    ].join('\n');
  }

  if (error instanceof Error) {
    return [
      'Sign-in failed before the session could be created.',
      `Backend: ${backendUrl}`,
      `Error detail: ${error.message}`,
    ].join('\n');
  }

  return ['Sign-in failed for an unknown reason.', `Backend: ${backendUrl}`].join('\n');
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

    if (nextUser && (env.isScreenshotReviewMode || pb.authStore.isValid)) {
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
      const restoreStartedAt = Date.now();
      const hadPersistedToken = Boolean(pb.authStore.token);
      let refreshFailed = false;
      trackObservabilityEvent('AUTH_SESSION_RESTORE_STARTED', {
        hadPersistedToken,
        source: 'AuthProvider',
      });

      try {
        if (env.isScreenshotReviewMode) {
          const screenshotReviewUser = normalizeAuthUser(SCREENSHOT_REVIEW_AUTH_RECORD);

          pb.authStore.save('screenshot-review-mode', SCREENSHOT_REVIEW_AUTH_RECORD);

          if (isMounted && screenshotReviewUser) {
            setActualUser(screenshotReviewUser);
            setStatus('authenticated');
            setAuthError(null);
            identifyObservabilityUser(screenshotReviewUser);
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
  }, [syncAuthSnapshot]);

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
      identifyObservabilityUser(authUser);
      trackObservabilityEvent('LOGIN_SUCCESS', {
        source: 'mobile_auth_shell',
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message === AUTH_EMAIL_UNVERIFIED_ERROR
          ? 'Please verify your email to continue.'
          : formatAuthDiagnostics(error);
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
