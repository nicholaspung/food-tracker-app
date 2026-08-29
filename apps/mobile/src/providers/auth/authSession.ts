import { useCallback, useEffect, useRef, useState } from 'react';
import { ClientResponseError } from 'pocketbase';

import { env } from '../../config/env';
import {
  resolveEmailVerificationAccess,
  type EmailVerificationStatus,
} from '../../lib/emailVerificationAccess';
import { logger } from '../../lib/logger';
import {
  clearPocketBaseFileAccessToken,
  pb,
  refreshPocketBaseFileAccessToken,
} from '../../lib/pocketbase';
import { authStore } from '../../lib/pocketbaseAuthStore';
import {
  captureObservabilityError,
  trackObservabilityEvent,
} from '../../observability';
import { normalizeAuthUser, type AuthUser } from '../../types/auth';
import {
  buildAuthErrorObservabilityProperties,
  formatAuthErrorMessage,
} from '../authErrorMessages';

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'verification_required' | 'unauthenticated';
export type AuthBootstrapOutcome = 'successful_restore' | 'failed_restore';
export interface AuthRefreshOptions {
  afterCurrent?: boolean;
}

export interface AuthBootstrapResult {
  authRestoreDurationMs: number;
  hadPersistedToken: boolean;
  hasValidSession: boolean;
  outcome: AuthBootstrapOutcome;
  refreshFailed: boolean;
}

interface UseAuthSessionOptions {
  onBootstrapComplete?: (result: AuthBootstrapResult) => void;
  onInvalidRestoredSession: () => Promise<void>;
  prepareForRestore: () => Promise<void>;
}

interface AuthSessionState {
  actualUser: AuthUser | null;
  authError: string | null;
  hasActiveSession: () => boolean;
  isSubmitting: boolean;
  refreshAuthSession: (options?: AuthRefreshOptions) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOutSession: () => void;
  status: AuthStatus;
  syncAuthSnapshot: () => void;
  verificationGraceEndsAt: string | null;
  verificationStatus: EmailVerificationStatus;
}

export const AUTH_EMAIL_VERIFICATION_REQUIRED_MESSAGE = 'Please verify your email to continue.';
const PRIVATE_FILE_TOKEN_REFRESH_INTERVAL_MS = 120_000;
const AUTH_BOOTSTRAP_TIMEOUT_MS = 6_000;

class StaleAuthRefreshError extends Error {
  constructor() {
    super('Session changed during refresh.');
    this.name = 'StaleAuthRefreshError';
  }
}

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

function isCanceledAuthRefreshError(error: unknown): boolean {
  return error instanceof StaleAuthRefreshError || (error instanceof ClientResponseError && error.isAbort);
}

function getCurrentAuthUser(): AuthUser | null {
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

export function useAuthSession({
  onBootstrapComplete,
  onInvalidRestoredSession,
  prepareForRestore,
}: UseAuthSessionOptions): AuthSessionState {
  const [status, setStatus] = useState<AuthStatus>('bootstrapping');
  const [actualUser, setActualUser] = useState<AuthUser | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<EmailVerificationStatus>('verified');
  const [verificationGraceEndsAt, setVerificationGraceEndsAt] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const authSessionAccountIdRef = useRef(getCurrentAuthUser()?.id ?? null);
  const authRefreshGenerationRef = useRef(0);
  const authRefreshAbortControllerRef = useRef<AbortController | null>(null);
  const authRefreshRequestPromiseRef = useRef<Promise<void> | null>(null);
  const trailingAuthRefreshRequestPromiseRef = useRef<Promise<void> | null>(null);
  const refreshAuthSessionPromiseRef = useRef<Promise<void> | null>(null);
  const trailingRefreshAuthSessionPromiseRef = useRef<Promise<void> | null>(null);

  const applyAuthenticationState = useCallback((nextUser: AuthUser | null) => {
    const nextState = resolveAuthenticationState(nextUser);
    setActualUser(nextState.actualUser);
    setStatus(nextState.status);
    setVerificationStatus(nextState.verificationStatus);
    setVerificationGraceEndsAt(nextState.verificationGraceEndsAt);
  }, []);

  const syncAuthSnapshot = useCallback(() => {
    applyAuthenticationState(getCurrentAuthUser());
  }, [applyAuthenticationState]);

  const hasActiveSession = useCallback(() => Boolean(pb.authStore.token), []);

  const cancelAuthRefreshForBoundary = useCallback(() => {
    authRefreshGenerationRef.current += 1;
    authRefreshAbortControllerRef.current?.abort();
    authRefreshAbortControllerRef.current = null;
    authRefreshRequestPromiseRef.current = null;
    trailingAuthRefreshRequestPromiseRef.current = null;
    refreshAuthSessionPromiseRef.current = null;
    trailingRefreshAuthSessionPromiseRef.current = null;
  }, []);

  const runAuthRefreshRequest = useCallback((options?: AuthRefreshOptions): Promise<void> => {
    const startRefreshRequest = () => {
      const requestGeneration = authRefreshGenerationRef.current;
      const abortController = new AbortController();
      authRefreshAbortControllerRef.current = abortController;
      const requestPromise = pb.collection('users').authRefresh({ signal: abortController.signal }).then(() => {
        if (authRefreshGenerationRef.current !== requestGeneration) {
          throw new StaleAuthRefreshError();
        }
      });
      authRefreshRequestPromiseRef.current = requestPromise;
      void requestPromise.then(
        () => {
          if (authRefreshRequestPromiseRef.current === requestPromise) {
            authRefreshRequestPromiseRef.current = null;
          }
          if (authRefreshAbortControllerRef.current === abortController) {
            authRefreshAbortControllerRef.current = null;
          }
        },
        () => {
          if (authRefreshRequestPromiseRef.current === requestPromise) {
            authRefreshRequestPromiseRef.current = null;
          }
          if (authRefreshAbortControllerRef.current === abortController) {
            authRefreshAbortControllerRef.current = null;
          }
        },
      );
      return requestPromise;
    };

    const currentRequest = authRefreshRequestPromiseRef.current;
    if (!currentRequest) {
      return startRefreshRequest();
    }
    if (!options?.afterCurrent) {
      return currentRequest;
    }
    if (trailingAuthRefreshRequestPromiseRef.current) {
      return trailingAuthRefreshRequestPromiseRef.current;
    }

    const queuedGeneration = authRefreshGenerationRef.current;
    const startTrailingRequest = () => {
      if (authRefreshGenerationRef.current !== queuedGeneration) {
        throw new StaleAuthRefreshError();
      }
      return startRefreshRequest();
    };
    const trailingRequest = currentRequest.then(startTrailingRequest, startTrailingRequest);
    trailingAuthRefreshRequestPromiseRef.current = trailingRequest;
    void trailingRequest.then(
      () => {
        if (trailingAuthRefreshRequestPromiseRef.current === trailingRequest) {
          trailingAuthRefreshRequestPromiseRef.current = null;
        }
      },
      () => {
        if (trailingAuthRefreshRequestPromiseRef.current === trailingRequest) {
          trailingAuthRefreshRequestPromiseRef.current = null;
        }
      },
    );
    return trailingRequest;
  }, []);

  const performAuthSessionRefresh = useCallback(
    async (options?: AuthRefreshOptions) => {
      if (!pb.authStore.token || !pb.authStore.isValid) {
        syncAuthSnapshot();
        throw new Error('No active session available for auth refresh.');
      }

      try {
        await runAuthRefreshRequest(options);
        setAuthError(null);
      } catch (refreshError) {
        if (shouldClearCachedSessionAfterRefreshFailure(refreshError)) {
          pb.authStore.clear();
        }
        if (!isVerificationRequiredError(refreshError) && !isCanceledAuthRefreshError(refreshError)) {
          logger.warn('[AuthSession] authRefresh failed:', refreshError);
        }
        syncAuthSnapshot();
        throw refreshError;
      }

      await refreshPocketBaseFileAccessToken().catch((error) => {
        logger.warn('[AuthSession] private file token refresh failed:', error);
      });
      syncAuthSnapshot();
    },
    [runAuthRefreshRequest, syncAuthSnapshot],
  );

  const refreshAuthSession = useCallback((options?: AuthRefreshOptions) => {
    const startSessionRefresh = (startOptions?: AuthRefreshOptions) => {
      const refreshPromise = performAuthSessionRefresh(startOptions);
      refreshAuthSessionPromiseRef.current = refreshPromise;
      void refreshPromise.then(
        () => {
          if (refreshAuthSessionPromiseRef.current === refreshPromise) {
            refreshAuthSessionPromiseRef.current = null;
          }
        },
        () => {
          if (refreshAuthSessionPromiseRef.current === refreshPromise) {
            refreshAuthSessionPromiseRef.current = null;
          }
        },
      );
      return refreshPromise;
    };

    const currentRefresh = refreshAuthSessionPromiseRef.current;
    if (!currentRefresh) {
      return startSessionRefresh(options);
    }
    if (!options?.afterCurrent) {
      return currentRefresh;
    }
    if (trailingRefreshAuthSessionPromiseRef.current) {
      return trailingRefreshAuthSessionPromiseRef.current;
    }

    const queuedGeneration = authRefreshGenerationRef.current;
    const startTrailingRefresh = () => {
      if (authRefreshGenerationRef.current !== queuedGeneration) {
        throw new StaleAuthRefreshError();
      }
      return startSessionRefresh({ afterCurrent: true });
    };
    const trailingRefresh = currentRefresh.then(startTrailingRefresh, startTrailingRefresh);
    trailingRefreshAuthSessionPromiseRef.current = trailingRefresh;
    void trailingRefresh.then(
      () => {
        if (trailingRefreshAuthSessionPromiseRef.current === trailingRefresh) {
          trailingRefreshAuthSessionPromiseRef.current = null;
        }
      },
      () => {
        if (trailingRefreshAuthSessionPromiseRef.current === trailingRefresh) {
          trailingRefreshAuthSessionPromiseRef.current = null;
        }
      },
    );
    return trailingRefresh;
  }, [performAuthSessionRefresh]);

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
        authSessionAccountIdRef.current = getCurrentAuthUser()?.id ?? null;
        hadRestoredSession = Boolean(pb.authStore.token);
        await withTimeout(
          prepareForRestore(),
          AUTH_BOOTSTRAP_TIMEOUT_MS,
          'Role preview settings restore timed out.',
        );

        if (pb.authStore.token && !pb.authStore.isValid) {
          pb.authStore.clear();
        }

        if (pb.authStore.isValid) {
          try {
            await withTimeout(
              runAuthRefreshRequest(),
              AUTH_BOOTSTRAP_TIMEOUT_MS,
              'Auth session refresh timed out.',
            );
          } catch (refreshError) {
            refreshFailed = true;
            if (shouldClearCachedSessionAfterRefreshFailure(refreshError)) {
              pb.authStore.clear();
            }
            logger.warn('[AuthSession] authRefresh failed, using cached session:', refreshError);
          }

          await refreshPocketBaseFileAccessToken().catch((error) => {
            logger.warn('[AuthSession] private file token refresh failed:', error);
          });
        }

        if (hadRestoredSession && !getCurrentAuthUser()) {
          await onInvalidRestoredSession();
        }

        if (isMounted) {
          syncAuthSnapshot();
        }

        const authRestoreDurationMs = Date.now() - restoreStartedAt;
        const hasValidSession = Boolean(pb.authStore.token && getCurrentAuthUser());
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
          await onInvalidRestoredSession();
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
      const nextAccountId = getCurrentAuthUser()?.id ?? null;
      if (nextAccountId !== authSessionAccountIdRef.current) {
        authSessionAccountIdRef.current = nextAccountId;
        cancelAuthRefreshForBoundary();
      }
      if (isMounted) {
        syncAuthSnapshot();
      }
    });

    void bootstrap();
    return () => {
      isMounted = false;
      cancelAuthRefreshForBoundary();
      unsubscribe();
    };
  }, [cancelAuthRefreshForBoundary, onBootstrapComplete, onInvalidRestoredSession, prepareForRestore, runAuthRefreshRequest, syncAuthSnapshot]);

  useEffect(() => {
    if (status !== 'authenticated' || !actualUser) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      void refreshPocketBaseFileAccessToken().catch((error) => {
        logger.warn('[AuthSession] private file token refresh failed:', error);
      });
    }, PRIVATE_FILE_TOKEN_REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [actualUser, status]);

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
          logger.warn('[AuthSession] private file token refresh failed:', error);
        });
        applyAuthenticationState(authUser);
        setAuthError(null);
        trackObservabilityEvent('LOGIN_SUCCESS', { source: 'mobile_auth_shell' });
      } catch (error) {
        const message = isVerificationRequiredError(error)
          ? AUTH_EMAIL_VERIFICATION_REQUIRED_MESSAGE
          : formatAuthErrorMessage(error, {
              environment: env.environment,
              isAdmin: actualUser?.isAdmin === true,
            });

        setAuthError(message);
        applyAuthenticationState(null);
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
    [actualUser?.isAdmin, applyAuthenticationState],
  );

  const signOutSession = useCallback(() => {
    cancelAuthRefreshForBoundary();
    pb.authStore.clear();
    clearPocketBaseFileAccessToken();
    applyAuthenticationState(null);
    setAuthError(null);
  }, [applyAuthenticationState, cancelAuthRefreshForBoundary]);

  return {
    actualUser,
    authError,
    hasActiveSession,
    isSubmitting,
    refreshAuthSession,
    signInWithPassword,
    signOutSession,
    status,
    syncAuthSnapshot,
    verificationGraceEndsAt,
    verificationStatus,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
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
