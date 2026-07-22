import { AppState, type AppStateStatus } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ClientResponseError } from 'pocketbase';
import { useQueryClient } from '@tanstack/react-query';

import { env } from '../config/env';
import { resolveDateValue } from '../lib/dateFormatting';
import {
  resolveEmailVerificationAccess,
  type EmailVerificationStatus,
} from '../lib/emailVerificationAccess';
import {
  clearPocketBaseFileAccessToken,
  pb,
  refreshPocketBaseFileAccessToken,
} from '../lib/pocketbase';
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
  clearProductAnalyticsUser,
  identifyProductAnalyticsUser,
  setProductAnalyticsAuthContext,
} from '../observability/productAnalytics';
import {
  buildAuthErrorObservabilityProperties,
  formatAuthErrorMessage,
} from './authErrorMessages';
import { clearPersistedQueryCache } from './queryPersistence';
import { useSync } from './SyncProvider';
import { normalizeAuthUser, type AuthUser } from '../types/auth';
import { unregisterCurrentNotificationDevice } from '../notifications/notificationInteraction';

type AuthStatus = 'bootstrapping' | 'authenticated' | 'verification_required' | 'unauthenticated';
type RolePreviewSettingKey = keyof RolePreviewSettings;

export const AUTH_EMAIL_VERIFICATION_REQUIRED_MESSAGE = 'Please verify your email to continue.';
const AUTH_VERIFICATION_STATUS_REFRESH_INTERVAL_MS = 15_000;
const PRIVATE_FILE_TOKEN_REFRESH_INTERVAL_MS = 120_000;
const AUTH_BOOTSTRAP_TIMEOUT_MS = 6_000;

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  actualUser: AuthUser | null;
  canUseRolePreview: boolean;
  rolePreviewSettings: RolePreviewSettings;
  verificationStatus: EmailVerificationStatus;
  verificationGraceEndsAt: string | null;
  setRolePreviewSetting: (setting: RolePreviewSettingKey, enabled: boolean) => void;
  resetRolePreviewSettings: () => void;
  isSubmitting: boolean;
  authError: string | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAuthSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function resolveClientResponseMessage(error: ClientResponseError): string {
  if (typeof error.response?.message === 'string' && error.response.message.trim().length > 0) {
    return error.response.message;
  }

  return error.message;
}

function isVerificationRequiredError(error: unknown): boolean {
  if (error instanceof ClientResponseError) {
    return (
      error.status === 403 &&
      resolveClientResponseMessage(error).trim() === AUTH_EMAIL_VERIFICATION_REQUIRED_MESSAGE
    );
  }

  return error instanceof Error && error.message.trim() === AUTH_EMAIL_VERIFICATION_REQUIRED_MESSAGE;
}

function shouldClearCachedSessionAfterRefreshFailure(error: unknown): boolean {
  if (isVerificationRequiredError(error)) {
    return false;
  }

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

function resolveAuthenticationState(nextUser: AuthUser | null): {
  actualUser: AuthUser | null;
  status: AuthStatus;
  verificationStatus: EmailVerificationStatus;
  verificationGraceEndsAt: string | null;
} {
  if (!nextUser || !pb.authStore.isValid) {
    return {
      actualUser: null,
      status: 'unauthenticated',
      verificationStatus: 'verified',
      verificationGraceEndsAt: null,
    };
  }

  const verificationAccess = resolveEmailVerificationAccess({
    verified: nextUser.verified,
    createdAt: nextUser.createdAt,
  });

  return {
    actualUser: nextUser,
    status: verificationAccess.status === 'grace_expired' ? 'verification_required' : 'authenticated',
    verificationStatus: verificationAccess.status,
    verificationGraceEndsAt: verificationAccess.graceEndsAt,
  };
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

function resolveProductAuthUserTier(user: AuthUser | null): 'admin' | 'subscriber' | 'free' | null {
  const tier = resolveAuthUserTier(user);
  return tier === 'anonymous' ? null : tier;
}

export type AuthBootstrapOutcome = 'successful_restore' | 'failed_restore';

export interface AuthBootstrapResult {
  authRestoreDurationMs: number;
  hadPersistedToken: boolean;
  hasValidSession: boolean;
  outcome: AuthBootstrapOutcome;
  refreshFailed: boolean;
}

interface AuthProviderProps {
  children: React.ReactNode;
  onBootstrapComplete?: (result: AuthBootstrapResult) => void;
  waitForLocalStateReset?: () => Promise<void>;
}

export function AuthProvider({
  children,
  onBootstrapComplete,
  waitForLocalStateReset,
}: AuthProviderProps) {
  const queryClient = useQueryClient();
  const { discardQueuedMutations } = useSync();
  const [status, setStatus] = useState<AuthStatus>('bootstrapping');
  const [actualUser, setActualUser] = useState<AuthUser | null>(null);
  const [rolePreviewSettings, setRolePreviewSettings] = useState<RolePreviewSettings>(
    DEFAULT_ROLE_PREVIEW_SETTINGS,
  );
  const [verificationStatus, setVerificationStatus] = useState<EmailVerificationStatus>('verified');
  const [verificationGraceEndsAt, setVerificationGraceEndsAt] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const previousAuthenticatedUserIdRef = useRef<string | null | undefined>(undefined);
  const isProviderMountedRef = useRef(true);
  const isResettingSessionRef = useRef(false);
  const suppressNextAuthBoundaryResetRef = useRef(false);

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
    const nextState = resolveAuthenticationState(nextUser);

    setActualUser(nextState.actualUser);
    setStatus(nextState.status);
    setVerificationStatus(nextState.verificationStatus);
    setVerificationGraceEndsAt(nextState.verificationGraceEndsAt);
  }, []);

  const resetAuthenticatedLocalState = useCallback(
    async (reason: 'auth_change' | 'logout') => {
      if (isResettingSessionRef.current) {
        return;
      }

      isResettingSessionRef.current = true;
      try {
        await waitForLocalStateReset?.();
        if (!isProviderMountedRef.current) {
          return;
        }
        const cleanupErrors: unknown[] = [];

        try {
          queryClient.clear();
        } catch (error) {
          cleanupErrors.push(error);
        }

        try {
          await clearPersistedQueryCache();
        } catch (error) {
          cleanupErrors.push(error);
        }

        try {
          await discardQueuedMutations(reason);
        } catch (error) {
          cleanupErrors.push(error);
        }

        if (cleanupErrors.length > 0) {
          const [firstError] = cleanupErrors;
          logger.warn('[AuthProvider] Failed to reset authenticated local state:', firstError);
          trackObservabilityEvent('AUTH_LOCAL_STATE_RESET_FAILED', {
            cleanupErrorCount: cleanupErrors.length,
            errorMessage: firstError instanceof Error ? firstError.message : String(firstError),
            errorType: firstError instanceof Error ? firstError.name : 'unknown_error',
            reason,
            source: 'AuthProvider',
          });
        }
      } finally {
        isResettingSessionRef.current = false;
      }
    },
    [discardQueuedMutations, queryClient, waitForLocalStateReset],
  );

  const refreshAuthSession = useCallback(async () => {
    if (!pb.authStore.token || !pb.authStore.isValid) {
      syncAuthSnapshot();
      throw new Error('No active session available for auth refresh.');
    }

    try {
      await pb.collection('users').authRefresh();
      setAuthError(null);
    } catch (refreshError) {
      if (shouldClearCachedSessionAfterRefreshFailure(refreshError)) {
        pb.authStore.clear();
      }
      if (!isVerificationRequiredError(refreshError)) {
        logger.warn('[AuthProvider] authRefresh failed:', refreshError);
      }
      syncAuthSnapshot();
      throw refreshError;
    }

    await refreshPocketBaseFileAccessToken().catch((error) => {
      logger.warn('[AuthProvider] private file token refresh failed:', error);
    });

    syncAuthSnapshot();
  }, [syncAuthSnapshot]);

  useEffect(() => {
    isProviderMountedRef.current = true;

    return () => {
      isProviderMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      const restoreStartedAt = Date.now();
      const hadPersistedToken = Boolean(pb.authStore.token);
      let hadRestoredSession = false;
      let refreshFailed = false;
      trackObservabilityEvent('AUTH_SESSION_RESTORE_STARTED', {
        hadPersistedToken,
        source: 'AuthProvider',
      });

      try {
        await withTimeout(
          authStore.waitUntilReady(),
          AUTH_BOOTSTRAP_TIMEOUT_MS,
          'Auth storage restore timed out.',
        );
        hadRestoredSession = Boolean(pb.authStore.token);
        const loadedRolePreviewSettings = await withTimeout(
          loadRolePreviewSettings(),
          AUTH_BOOTSTRAP_TIMEOUT_MS,
          'Role preview settings restore timed out.',
        );

        if (isMounted) {
          setRolePreviewSettings(loadedRolePreviewSettings);
        }

        if (pb.authStore.token && !pb.authStore.isValid) {
          pb.authStore.clear();
        }

        if (pb.authStore.isValid) {
          try {
            await withTimeout(
              pb.collection('users').authRefresh(),
              AUTH_BOOTSTRAP_TIMEOUT_MS,
              'Auth session refresh timed out.',
            );
          } catch (refreshError) {
            refreshFailed = true;
            if (shouldClearCachedSessionAfterRefreshFailure(refreshError)) {
              pb.authStore.clear();
            }
            logger.warn('[AuthProvider] authRefresh failed, using cached session:', refreshError);
          }

          await refreshPocketBaseFileAccessToken().catch((error) => {
            logger.warn('[AuthProvider] private file token refresh failed:', error);
          });
        }

        if (hadRestoredSession && !getCurrentUser()) {
          await resetAuthenticatedLocalState('auth_change');
        }

        if (isMounted) {
          syncAuthSnapshot();
        }

        const authRestoreDurationMs = Date.now() - restoreStartedAt;
        const hasValidSession = Boolean(pb.authStore.token && getCurrentUser());
        trackObservabilityEvent('AUTH_SESSION_RESTORE_SUCCEEDED', {
          durationMs: authRestoreDurationMs,
          hadPersistedToken,
          hasValidSession,
          refreshFailed,
          source: 'AuthProvider',
        });
        if (isMounted) {
          onBootstrapComplete?.({
            authRestoreDurationMs,
            hadPersistedToken,
            hasValidSession,
            outcome: 'successful_restore',
            refreshFailed,
          });
        }
      } catch (error) {
        if (hadRestoredSession || Boolean(pb.authStore.token)) {
          await resetAuthenticatedLocalState('auth_change');
        }

        const authRestoreDurationMs = Date.now() - restoreStartedAt;
        trackObservabilityEvent('AUTH_SESSION_RESTORE_FAILED', {
          durationMs: authRestoreDurationMs,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.name : 'unknown_error',
          hadPersistedToken,
          source: 'AuthProvider',
        });
        if (isMounted) {
          setStatus('unauthenticated');
          setActualUser(null);
          setVerificationStatus('verified');
          setVerificationGraceEndsAt(null);
          setAuthError('Unable to restore session. Please sign in again.');
          captureObservabilityError(error);
          onBootstrapComplete?.({
            authRestoreDurationMs,
            hadPersistedToken,
            hasValidSession: false,
            outcome: 'failed_restore',
            refreshFailed,
          });
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
  }, [onBootstrapComplete, resetAuthenticatedLocalState, syncAuthSnapshot]);

  useLayoutEffect(() => {
    if (status === 'bootstrapping') {
      return;
    }

    const nextAuthenticatedUserId = actualUser?.id ?? null;
    const previousAuthenticatedUserId = previousAuthenticatedUserIdRef.current;

    if (previousAuthenticatedUserId === undefined) {
      previousAuthenticatedUserIdRef.current = nextAuthenticatedUserId;
      return;
    }

    if (previousAuthenticatedUserId !== nextAuthenticatedUserId) {
      if (suppressNextAuthBoundaryResetRef.current) {
        suppressNextAuthBoundaryResetRef.current = false;
      } else {
        void resetAuthenticatedLocalState('auth_change');
      }
    }

    previousAuthenticatedUserIdRef.current = nextAuthenticatedUserId;
  }, [actualUser?.id, resetAuthenticatedLocalState, status]);

  useEffect(() => {
    if (status === 'bootstrapping' || verificationStatus !== 'grace_period' || !verificationGraceEndsAt) {
      return undefined;
    }

    const graceEndsAtDate = resolveDateValue(verificationGraceEndsAt);
    if (!graceEndsAtDate) {
      syncAuthSnapshot();
      return undefined;
    }

    const delayMs = graceEndsAtDate.getTime() - Date.now();
    if (delayMs <= 0) {
      syncAuthSnapshot();
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      syncAuthSnapshot();
    }, delayMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [status, syncAuthSnapshot, verificationGraceEndsAt, verificationStatus]);

  useEffect(() => {
    const shouldPollVerificationStatus =
      appState === 'active' &&
      Boolean(pb.authStore.token) &&
      verificationStatus !== 'verified' &&
      (status === 'authenticated' || status === 'verification_required');

    if (!shouldPollVerificationStatus) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      void refreshAuthSession().catch(() => {
        // Foreground and manual refresh hooks already surface meaningful auth failures.
        // Keep background verification polling silent for expected unverified states.
      });
    }, AUTH_VERIFICATION_STATUS_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [appState, refreshAuthSession, status, verificationStatus]);

  useEffect(() => {
    if (status !== 'authenticated' || !actualUser) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      void refreshPocketBaseFileAccessToken().catch((error) => {
        logger.warn('[AuthProvider] private file token refresh failed:', error);
      });
    }, PRIVATE_FILE_TOKEN_REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [actualUser, status]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      setAppState(nextState);

      if (previousState === 'background' && nextState === 'active') {
        if (!pb.authStore.token) {
          syncAuthSnapshot();
          return;
        }

        void refreshAuthSession().catch((error) => {
          logger.warn('[AuthProvider] foreground auth refresh failed:', error);
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshAuthSession, syncAuthSnapshot]);

  useEffect(() => {
    const isRolePreviewActive =
      canUseRolePreview &&
      (rolePreviewSettings.viewAsNonAdmin || rolePreviewSettings.viewAsNonSubscriber);

    setObservabilityContext({
      actualUserTier: resolveAuthUserTier(actualUser),
      authStatus: status,
      isRolePreviewActive,
      userTier: resolveAuthUserTier(user),
      verificationStatus,
    });
    setProductAnalyticsAuthContext({
      authStatus: status,
      userTier: resolveProductAuthUserTier(user),
    });
  }, [
    actualUser,
    canUseRolePreview,
    rolePreviewSettings.viewAsNonAdmin,
    rolePreviewSettings.viewAsNonSubscriber,
    status,
    user,
    verificationStatus,
  ]);

  useEffect(() => {
    if (status !== 'authenticated' || !actualUser) {
      clearProductAnalyticsUser();
      return;
    }

    identifyProductAnalyticsUser(actualUser);
  }, [actualUser, status]);

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

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      setIsSubmitting(true);
      setAuthError(null);

      try {
        const authData = await pb.collection('users').authWithPassword(email.trim(), password);
        const authUser = normalizeAuthUser(authData.record as Record<string, unknown> | null);

        if (!authUser) {
          throw new Error('Authentication succeeded but user payload was invalid.');
        }

        await refreshPocketBaseFileAccessToken().catch((error) => {
          logger.warn('[AuthProvider] private file token refresh failed:', error);
        });

        const nextState = resolveAuthenticationState(authUser);
        setActualUser(nextState.actualUser);
        setStatus(nextState.status);
        setVerificationStatus(nextState.verificationStatus);
        setVerificationGraceEndsAt(nextState.verificationGraceEndsAt);
        setAuthError(null);

        trackObservabilityEvent('LOGIN_SUCCESS', {
          source: 'mobile_auth_shell',
        });
      } catch (error) {
        const message = isVerificationRequiredError(error)
          ? AUTH_EMAIL_VERIFICATION_REQUIRED_MESSAGE
          : formatAuthErrorMessage(error, {
              environment: env.environment,
              isAdmin: actualUser?.isAdmin === true,
            });

        setAuthError(message);
        setStatus('unauthenticated');
        setActualUser(null);
        setVerificationStatus('verified');
        setVerificationGraceEndsAt(null);
        captureObservabilityError(error);
        trackObservabilityEvent('LOGIN_FAILED', {
          ...buildAuthErrorObservabilityProperties(error),
          source: 'mobile_auth_shell',
        });
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [actualUser?.isAdmin],
  );

  const signOut = useCallback(async () => {
    suppressNextAuthBoundaryResetRef.current = Boolean(actualUser?.id);
    if (actualUser?.id) {
      await unregisterCurrentNotificationDevice().catch((error) => {
        logger.warn('[AuthProvider] Failed to unregister notification device on sign-out:', error);
      });
    }
    pb.authStore.clear();
    clearPocketBaseFileAccessToken();
    await resetAuthenticatedLocalState('logout');
    setActualUser(null);
    setRolePreviewSettings(DEFAULT_ROLE_PREVIEW_SETTINGS);
    void clearPersistedRolePreviewSettings().catch((error) => {
      logger.warn('[AuthProvider] Failed to clear role preview settings on sign-out:', error);
    });
    setStatus('unauthenticated');
    setVerificationStatus('verified');
    setVerificationGraceEndsAt(null);
    setAuthError(null);
    trackObservabilityEvent('LOGOUT', {
      source: 'mobile_auth_shell',
    });
    clearProductAnalyticsUser();
    resetObservabilityIdentity();
  }, [actualUser?.id, resetAuthenticatedLocalState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      actualUser,
      canUseRolePreview,
      rolePreviewSettings,
      verificationStatus,
      verificationGraceEndsAt,
      setRolePreviewSetting,
      resetRolePreviewSettings,
      isSubmitting,
      authError,
      signInWithPassword,
      signOut,
      refreshAuthSession,
    }),
    [
      actualUser,
      authError,
      canUseRolePreview,
      isSubmitting,
      refreshAuthSession,
      resetRolePreviewSettings,
      rolePreviewSettings,
      setRolePreviewSetting,
      signInWithPassword,
      signOut,
      status,
      user,
      verificationGraceEndsAt,
      verificationStatus,
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}
