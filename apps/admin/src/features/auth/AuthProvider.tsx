import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { clearAdminFileAccessToken, pb, refreshAdminFileAccessToken } from '@/lib/pocketbase';
import type { AdminUser } from '@/features/auth/types';

interface AuthContextValue {
  fileAccessToken: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AdminUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readAuthUser(): AdminUser | null {
  const record = pb.authStore.record;

  if (!pb.authStore.isValid || !record) {
    return null;
  }

  return {
    id: record.id,
    email: String(record.email ?? ''),
    name: typeof record.name === 'string' ? record.name : undefined,
    isAdmin: Boolean(record.isAdmin),
    isSubscriber: Boolean(record.isSubscriber),
    isBetaUser: Boolean(record.isBetaUser),
    created: typeof record.created === 'string' ? record.created : undefined,
    updated: typeof record.updated === 'string' ? record.updated : undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(() => readAuthUser());
  const [isLoading, setIsLoading] = useState(true);
  const [fileAccessToken, setFileAccessToken] = useState('');

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange(() => {
      setUser(readAuthUser());
      setIsLoading(false);
    }, true);

    setUser(readAuthUser());
    setIsLoading(false);

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user?.isAdmin) {
      clearAdminFileAccessToken();
      setFileAccessToken('');
      return undefined;
    }

    let isActive = true;
    const refreshFileToken = async () => {
      try {
        const token = await refreshAdminFileAccessToken();
        if (isActive) {
          setFileAccessToken(token);
        }
      } catch {
        // Keep the prior token while a transient refresh failure recovers.
      }
    };

    void refreshFileToken();
    const intervalId = window.setInterval(refreshFileToken, 90_000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [user?.id, user?.isAdmin]);

  const value = useMemo<AuthContextValue>(
    () => ({
      fileAccessToken,
      isAuthenticated: Boolean(user?.isAdmin),
      isLoading,
      user,
      login: async (email: string, password: string) => {
        const authResponse = await pb.collection('users').authWithPassword(email, password);

        if (!authResponse.record?.isAdmin) {
          pb.authStore.clear();
          throw new Error('This account does not have admin access.');
        }

        setUser(readAuthUser());
      },
      logout: () => {
        clearAdminFileAccessToken();
        pb.authStore.clear();
        setUser(null);
      },
    }),
    [fileAccessToken, isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return value;
}
