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
import { ClientResponseError, type RecordModel } from 'pocketbase';
import { useQueryClient } from '@tanstack/react-query';

import { env } from '../config/env';
import { resolveDateValue } from '../lib/dateFormatting';
import {
  resolveEmailVerificationAccess,
  type EmailVerificationStatus,
} from '../lib/emailVerificationAccess';
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
import { clearPersistedQueryCache } from './queryPersistence';
import { useSync } from './SyncProvider';
import { normalizeAuthUser, type AuthUser } from '../types/auth';

type AuthStatus = 'bootstrapping' | 'authenticated' | 'verification_required' | 'unauthenticated';
type RolePreviewSettingKey = keyof RolePreviewSettings;

export const AUTH_EMAIL_VERIFICATION_REQUIRED_MESSAGE = 'Please verify your email to continue.';
const AUTH_VERIFICATION_STATUS_REFRESH_INTERVAL_MS = 15_000;

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
  if (!nextUser || (!env.isScreenshotReviewMode && !pb.authStore.isValid)) {
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

interface AuthProviderProps {
  children: React.ReactNode;
  screenshotReviewBootstrap?: AuthBootstrap;
}

export function AuthProvider({ children, screenshotReviewBootstrap }: AuthProviderProps) {
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
    [discardQueuedMutations, queryClient],
  );

  const refreshAuthSession = useCallback(async () => {
    if (!pb.authStore.token || (!env.isScreenshotReviewMode && !pb.authStore.isValid)) {
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

    syncAuthSnapshot();
  }, [syncAuthSnapshot]);

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
              syncAuthSnapshot();
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
        hadRestoredSession = Boolean(pb.authStore.token);
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

        if (hadRestoredSession && !getCurrentUser()) {
          await resetAuthenticatedLocalState('auth_change');
        }

        if (isMounted) {
          syncAuthSnapshot();
        }

        trackObservabilityEvent('AUTH_SESSION_RESTORE_SUCCEEDED', {
          durationMs: Date.now() - restoreStartedAt,
          hadPersistedToken,
          hasValidSession: Boolean(pb.authStore.token && getCurrentUser()),
          refreshFailed,
          source: 'AuthProvider',
        });
      } catch (error) {
        if (hadRestoredSession || Boolean(pb.authStore.token)) {
          await resetAuthenticatedLocalState('auth_change');
        }

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
          setVerificationStatus('verified');
          setVerificationGraceEndsAt(null);
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
  }, [resetAuthenticatedLocalState, screenshotReviewBootstrap, syncAuthSnapshot]);

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
    pb.authStore.clear();
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
