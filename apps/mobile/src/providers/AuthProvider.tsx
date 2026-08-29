import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  DEFAULT_ROLE_PREVIEW_SETTINGS,
  getEffectiveAuthUser,
  type RolePreviewSettings,
} from '../lib/rolePreview';
import type { EmailVerificationStatus } from '../lib/emailVerificationAccess';
import {
  resetObservabilityIdentity,
  setObservabilityContext,
  trackObservabilityEvent,
} from '../observability';
import {
  clearProductAnalyticsUser,
  identifyProductAnalyticsUser,
  setProductAnalyticsAuthContext,
} from '../observability/productAnalytics';
import type { AuthUser } from '../types/auth';
import {
  createAuthenticatedLocalStateReset,
  type AuthenticatedLocalStateResetReason,
} from './auth/authenticatedLocalStateReset';
import {
  AUTH_EMAIL_VERIFICATION_REQUIRED_MESSAGE,
  useAuthSession,
  type AuthRefreshOptions,
  type AuthBootstrapResult,
  type AuthStatus,
} from './auth/authSession';
import { notificationDeviceLifecycle } from './auth/notificationDeviceLifecycle';
import {
  useRolePreviewEligibility,
  useRolePreviewState,
  type RolePreviewSettingKey,
} from './auth/rolePreviewState';
import { useVerificationMonitor } from './auth/verificationMonitor';
import { useConnectivity } from './ConnectivityProvider';
import { clearPersistedQueryCache } from './queryPersistence';
import { useSync } from './SyncProvider';

export { AUTH_EMAIL_VERIFICATION_REQUIRED_MESSAGE };
export type { AuthBootstrapOutcome, AuthBootstrapResult } from './auth/authSession';

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
  refreshAuthSession: (options?: AuthRefreshOptions) => Promise<void>;
}

interface AuthProviderProps {
  children: React.ReactNode;
  onBootstrapComplete?: (result: AuthBootstrapResult) => void;
  waitForLocalStateReset?: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

export function AuthProvider({
  children,
  onBootstrapComplete,
  waitForLocalStateReset,
}: AuthProviderProps) {
  const queryClient = useQueryClient();
  const { discardQueuedMutations } = useSync();
  const { isOnline } = useConnectivity();
  const isProviderMountedRef = useRef(true);
  const previousAuthenticatedUserIdRef = useRef<string | null | undefined>(undefined);
  const suppressNextAuthBoundaryResetRef = useRef(false);
  const restoreRolePreviewRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    isProviderMountedRef.current = true;
    return () => {
      isProviderMountedRef.current = false;
    };
  }, []);

  const localStateReset = useMemo(
    () =>
      createAuthenticatedLocalStateReset({
        clearMemoryCache: () => queryClient.clear(),
        clearPersistedCache: clearPersistedQueryCache,
        discardQueuedMutations,
        isActive: () => isProviderMountedRef.current,
        waitUntilSafe: waitForLocalStateReset,
      }),
    [discardQueuedMutations, queryClient, waitForLocalStateReset],
  );
  const resetLocalState = useCallback(
    (reason: AuthenticatedLocalStateResetReason) => localStateReset.reset(reason),
    [localStateReset],
  );
  const prepareForRestore = useCallback(() => restoreRolePreviewRef.current(), []);
  const resetInvalidRestoredSession = useCallback(
    () => resetLocalState('auth_change'),
    [resetLocalState],
  );

  const authSession = useAuthSession({
    onBootstrapComplete,
    onInvalidRestoredSession: resetInvalidRestoredSession,
    prepareForRestore,
  });
  const canUseRolePreview = authSession.actualUser?.isAdmin === true;
  const rolePreview = useRolePreviewState(canUseRolePreview);
  restoreRolePreviewRef.current = rolePreview.restore;

  useRolePreviewEligibility({
    actualUser: authSession.actualUser,
    reset: rolePreview.reset,
    settings: rolePreview.settings,
    status: authSession.status,
  });
  useVerificationMonitor({
    hasActiveSession: authSession.hasActiveSession,
    isOnline,
    refreshAuthSession: authSession.refreshAuthSession,
    status: authSession.status,
    syncAuthSnapshot: authSession.syncAuthSnapshot,
    verificationGraceEndsAt: authSession.verificationGraceEndsAt,
    verificationStatus: authSession.verificationStatus,
  });

  const effectiveRolePreviewSettings = useMemo<RolePreviewSettings>(
    () => (canUseRolePreview ? rolePreview.settings : DEFAULT_ROLE_PREVIEW_SETTINGS),
    [canUseRolePreview, rolePreview.settings],
  );
  const user = useMemo(
    () => getEffectiveAuthUser(authSession.actualUser, effectiveRolePreviewSettings),
    [authSession.actualUser, effectiveRolePreviewSettings],
  );

  useLayoutEffect(() => {
    if (authSession.status === 'bootstrapping') {
      return;
    }

    const nextAuthenticatedUserId = authSession.actualUser?.id ?? null;
    const previousAuthenticatedUserId = previousAuthenticatedUserIdRef.current;
    if (previousAuthenticatedUserId === undefined) {
      previousAuthenticatedUserIdRef.current = nextAuthenticatedUserId;
      return;
    }

    if (previousAuthenticatedUserId !== nextAuthenticatedUserId) {
      if (suppressNextAuthBoundaryResetRef.current) {
        suppressNextAuthBoundaryResetRef.current = false;
      } else {
        void resetLocalState('auth_change');
      }
    }
    previousAuthenticatedUserIdRef.current = nextAuthenticatedUserId;
  }, [authSession.actualUser?.id, authSession.status, resetLocalState]);

  useEffect(() => {
    const isRolePreviewActive =
      canUseRolePreview &&
      (rolePreview.settings.viewAsNonAdmin || rolePreview.settings.viewAsNonSubscriber);

    setObservabilityContext({
      actualUserTier: resolveAuthUserTier(authSession.actualUser),
      authStatus: authSession.status,
      isRolePreviewActive,
      userTier: resolveAuthUserTier(user),
      verificationStatus: authSession.verificationStatus,
    });
    setProductAnalyticsAuthContext({
      authStatus: authSession.status,
      userTier: resolveProductAuthUserTier(user),
    });
  }, [
    authSession.actualUser,
    authSession.status,
    authSession.verificationStatus,
    canUseRolePreview,
    rolePreview.settings.viewAsNonAdmin,
    rolePreview.settings.viewAsNonSubscriber,
    user,
  ]);

  useEffect(() => {
    if (authSession.status !== 'authenticated' || !authSession.actualUser) {
      clearProductAnalyticsUser();
      return;
    }
    identifyProductAnalyticsUser(authSession.actualUser);
  }, [authSession.actualUser, authSession.status]);

  const authenticatedUserId = authSession.actualUser?.id;
  const { signOutSession } = authSession;
  const resetRolePreview = rolePreview.reset;
  const signOut = useCallback(async () => {
    suppressNextAuthBoundaryResetRef.current = Boolean(authenticatedUserId);
    await notificationDeviceLifecycle.deactivateForSignOut(authenticatedUserId);
    signOutSession();
    await resetLocalState('logout');
    resetRolePreview();
    trackObservabilityEvent('LOGOUT', { source: 'mobile_auth_shell' });
    clearProductAnalyticsUser();
    resetObservabilityIdentity();
  }, [authenticatedUserId, resetLocalState, resetRolePreview, signOutSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      actualUser: authSession.actualUser,
      authError: authSession.authError,
      canUseRolePreview,
      isSubmitting: authSession.isSubmitting,
      refreshAuthSession: authSession.refreshAuthSession,
      resetRolePreviewSettings: rolePreview.reset,
      rolePreviewSettings: rolePreview.settings,
      setRolePreviewSetting: rolePreview.setSetting,
      signInWithPassword: authSession.signInWithPassword,
      signOut,
      status: authSession.status,
      user,
      verificationGraceEndsAt: authSession.verificationGraceEndsAt,
      verificationStatus: authSession.verificationStatus,
    }),
    [authSession, canUseRolePreview, rolePreview, signOut, user],
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
