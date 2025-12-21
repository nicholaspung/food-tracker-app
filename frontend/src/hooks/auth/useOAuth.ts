import { useState, useCallback } from "react";
import { pb } from "@/lib/pocketbase";
import { logger } from "@/lib/logger";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";

export type OAuthProvider = "google" | "facebook";

const LAST_LOGIN_METHOD_KEY = "lastLoginMethod";

interface SavedLoginMethod {
  method: OAuthProvider | "email";
  email?: string;
  timestamp: number;
}

interface UseOAuthOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useOAuth(options?: UseOAuthOptions) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<OAuthProvider | null>(null);

  const { handleError } = useErrorHandler({
    source: 'useOAuth',
    defaultSeverity: 'error',
  });

  const authenticateWithOAuth = useCallback(
    async (provider: OAuthProvider) => {
      setIsAuthenticating(true);
      setCurrentProvider(provider);

      try {
        logger.log(`[OAuth] Starting ${provider} authentication...`);

        // Get the OAuth2 redirect URL and state
        const authData = await pb.collection("users").authWithOAuth2({
          provider,
          createData: {
            // Default settings for new OAuth users
            defaultVisitVisibility: "friends",
            defaultRestaurantVisibility: "friends",
          },
        });

        logger.log(`[OAuth] ${provider} authentication successful:`, {
          userId: authData.record.id,
          email: authData.record.email,
          isNew: authData.meta?.isNew,
          verified: authData.record.verified,
        });

        // OAuth users are auto-verified by PocketBase (trusted providers)
        // No need to check verification status for OAuth users
        // Google and Facebook already verify email addresses

        // Save login method for returning user experience
        const loginMethodData: SavedLoginMethod = {
          method: provider,
          email: authData.record.email,
          timestamp: Date.now(),
        };
        localStorage.setItem(LAST_LOGIN_METHOD_KEY, JSON.stringify(loginMethodData));

        // Mark that user has completed onboarding/login flow
        localStorage.setItem("hasSeenOnboarding", "true");

        // Call success callback
        options?.onSuccess?.();
      } catch (err: unknown) {
        logger.error(`[OAuth] ${provider} authentication error:`, err);

        // Handle the error
        handleError(err, {
          customMessage: `Failed to authenticate with ${provider}. Please try again.`,
          severity: 'error'
        });

        // Call error callback if provided
        if (err instanceof Error) {
          options?.onError?.(err);
        }
      } finally {
        setIsAuthenticating(false);
        setCurrentProvider(null);
      }
    },
    [options, handleError]
  );

  return {
    authenticateWithOAuth,
    isAuthenticating,
    currentProvider,
  };
}
