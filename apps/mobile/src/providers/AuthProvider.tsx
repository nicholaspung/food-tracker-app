import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { pb } from '../lib/pocketbase';
import { authStore } from '../lib/pocketbaseAuthStore';
import { logger } from '../lib/logger';
import {
  captureObservabilityError,
  clearObservabilityUser,
  identifyObservabilityUser,
  trackObservabilityEvent,
} from '../observability';
import { normalizeAuthUser, type AuthUser } from '../types/auth';

type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const syncAuthSnapshot = useCallback(() => {
    const nextUser = getCurrentUser();

    if (nextUser && pb.authStore.isValid) {
      setUser(nextUser);
      setStatus('authenticated');
      identifyObservabilityUser(nextUser);
      return;
    }

    setUser(null);
    setStatus('unauthenticated');
    clearObservabilityUser();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        await authStore.waitUntilReady();

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
          setUser(null);
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

      setUser(authUser);
      setStatus('authenticated');
      identifyObservabilityUser(authUser);
      trackObservabilityEvent('LOGIN_SUCCESS', {
        source: 'mobile_auth_shell',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed. Please try again.';
      setAuthError(message);
      setStatus('unauthenticated');
      setUser(null);
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
    setUser(null);
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
      isSubmitting,
      authError,
      signInWithPassword,
      signOut,
    }),
    [authError, isSubmitting, signInWithPassword, signOut, status, user],
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
