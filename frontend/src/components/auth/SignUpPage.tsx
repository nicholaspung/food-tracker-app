import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { repositories } from '@/repositories';
import { logger } from "@/lib/logger";
import { pb } from "@/lib/pocketbase";
import { useSync } from "@/contexts/SyncContext";
import { WifiOff } from "lucide-react";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { OAuthButton } from "@/components/auth/OAuthButton";
import { useOAuth } from "@/hooks/auth/useOAuth";
import { useTrackEvent } from "@/hooks/ui/useTrackEvent";
import { ANALYTICS_EVENTS } from "@/constants/analyticsEvents";

const LAST_LOGIN_METHOD_KEY = "lastLoginMethod";

interface SavedLoginMethod {
  method: "google" | "facebook" | "email";
  email?: string;
  timestamp: number;
}

interface SignUpPageProps {
  onNavigateToLogin: () => void;
  initialInviteCode?: string;
}

export default function SignUpPage({
  onNavigateToLogin,
  initialInviteCode,
}: SignUpPageProps) {
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState(initialInviteCode || "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [showEmailSignup, setShowEmailSignup] = useState(false);
  const { isOnline } = useSync();

  const {
    error,
    handleError,
    clearError,
    showValidation,
    checkOffline,
  } = useErrorHandler({
    source: 'SignUpPage',
    defaultSeverity: 'error',
  });

  const trackEvent = useTrackEvent();

  const { authenticateWithOAuth, isAuthenticating, currentProvider } = useOAuth({
    onSuccess: onNavigateToLogin,
    onError: (err) => {
      // Track OAuth signup failure
      trackEvent(ANALYTICS_EVENTS.SIGNUP_FAILED, {
        source: 'SignUpPage',
        signupMethod: currentProvider || 'oauth',
        errorType: err.name || 'OAuthError',
      });

      handleError(err, {
        customMessage: err.message,
        severity: 'error'
      });
    },
  });

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    // Check if online
    if (checkOffline("Sign up requires internet connection. Please connect and try again.")) {
      return;
    }

    // Validate invite code
    if (!inviteCode.trim()) {
      showValidation("Invite code is required");
      return;
    }

    // Validate passwords match
    if (password !== passwordConfirm) {
      showValidation("Passwords do not match");
      return;
    }

    // Validate password length
    if (password.length < 8) {
      showValidation("Password must be at least 8 characters long");
      return;
    }

    setLoading(true);

    try {
      // Look up the invite code to find who invited this user
      let inviterInfo = null;
      try {
        logger.log("[SignUp] Looking up inviter for invite code:", inviteCode);
        const response = await pb.send(
          `/api/invite-codes/inviter/${inviteCode}`,
          {
            method: "GET",
          }
        );

        logger.log("[SignUp] Inviter API response:", response);

        if (response.hasInviter && response.inviter) {
          inviterInfo = {
            id: response.inviter.id,
            email: response.inviter.email,
            name: response.inviter.name,
          };
          logger.log("[SignUp] Inviter info found:", inviterInfo);
        } else {
          logger.log("[SignUp] No inviter for this invite code (initial code)");
        }
      } catch (inviteErr) {
        logger.error("[SignUp] Could not fetch inviter info:", inviteErr);
        // Continue with signup even if we can't get inviter info
      }

      // Create the user account with invite code
      await repositories.users.create({
        email,
        password,
        passwordConfirm,
        inviteCode,
        defaultVisitVisibility: "friends", // Default visibility for new users
        defaultRestaurantVisibility: "friends", // Default restaurant visibility for new users
      });

      // Send verification email
      await repositories.users.requestVerification(email);

      // Save signup method for future logins
      const signupMethodData: SavedLoginMethod = {
        method: "email",
        email: email,
        timestamp: Date.now(),
      };
      localStorage.setItem(LAST_LOGIN_METHOD_KEY, JSON.stringify(signupMethodData));

      // If we found an inviter, store their info for post-login friend suggestion
      if (inviterInfo) {
        const suggestionData = {
          inviterId: inviterInfo.id,
          inviterEmail: inviterInfo.email,
          inviterName: inviterInfo.name,
          newUserEmail: email,
        };
        localStorage.setItem(
          "pendingFriendSuggestion",
          JSON.stringify(suggestionData)
        );
        logger.log(
          "[SignUp] Stored friend suggestion in localStorage:",
          suggestionData
        );
      } else {
        logger.log(
          "[SignUp] No inviter info to store - skipping friend suggestion"
        );
      }

      // Track signup success
      trackEvent(ANALYTICS_EVENTS.SIGNUP_SUCCESS, {
        source: 'SignUpPage',
        signupMethod: 'email',
        hasInviter: !!inviterInfo,
      });

      // Show success message
      setSuccess(true);

      // Mark that user has completed onboarding flow
      localStorage.setItem("hasSeenOnboarding", "true");

      // Clear form
      setEmail("");
      setPassword("");
      setPasswordConfirm("");
      setInviteCode(initialInviteCode || "");
    } catch (err: unknown) {
      logger.error("Sign up error:", err);

      // Track signup failure
      trackEvent(ANALYTICS_EVENTS.SIGNUP_FAILED, {
        source: 'SignUpPage',
        signupMethod: 'email',
        errorType: (err as Error).name || 'SignupError',
      });

      // useErrorHandler automatically parses PocketBase errors
      handleError(err, {
        customMessage: !err?.response?.data
          ? "Failed to create account. Please try again."
          : undefined, // Let handleError parse PocketBase errors
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  // Auto-redirect countdown after successful sign up
  useEffect(() => {
    if (success && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (success && countdown === 0) {
      onNavigateToLogin();
    }
  }, [success, countdown, onNavigateToLogin]);

  return (
    <div
      className="min-h-screen flex flex-col bg-background"
      data-testid="signup-page"
    >
      {/* Header */}
      <div className="pt-8 pb-4 flex justify-center items-center gap-3 px-4">
        <img
          src="/logo-speech-bubble-plate.svg"
          alt="Yummy Recs Logo"
          className="w-14 h-14"
        />
        <div className="text-xl font-bold text-foreground">
          Yummy Recs
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col justify-center px-4 py-8">
        <div className="w-full max-w-md mx-auto space-y-8">
          <div className="space-y-3 text-center">
            <h1 className="text-3xl font-bold text-foreground" data-testid="signup-title">
              Create account
            </h1>
            <p className="text-muted-foreground text-sm" data-testid="signup-description">
              {initialInviteCode
                ? "🎉 You've been invited! Choose how to join"
                : "Choose how you'd like to get started"}
            </p>
          </div>

          {/* Success State */}
          {success && (
            <div className="space-y-6">
              <div
                className="p-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md"
                data-testid="signup-success"
              >
                <div className="font-semibold mb-2 text-base">
                  Account created successfully!
                </div>
                <div>
                  Please check your email inbox (and spam folder) for a
                  verification link to activate your account.
                </div>
                <div className="mt-3 text-xs text-green-600">
                  Redirecting to login in {countdown}...
                </div>
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={onNavigateToLogin}
                data-testid="signup-goto-login-success"
              >
                Back to Sign in
              </Button>
            </div>
          )}

          {/* Signup Options - Only shown when not successful */}
          {!success && (
            <>
              {/* Social Signup Buttons - Primary */}
              <div className="space-y-3">
                <OAuthButton
                  provider="google"
                  onClick={() => authenticateWithOAuth("google")}
                  disabled={!isOnline || loading || isAuthenticating}
                  loading={isAuthenticating && currentProvider === "google"}
                />
                <OAuthButton
                  provider="facebook"
                  onClick={() => authenticateWithOAuth("facebook")}
                  disabled={!isOnline || loading || isAuthenticating}
                  loading={isAuthenticating && currentProvider === "facebook"}
                />
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or
                  </span>
                </div>
              </div>

              {/* Email Signup - Secondary */}
              {!showEmailSignup ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowEmailSignup(true)}
                  disabled={!isOnline}
                  data-testid="show-email-signup"
                >
                  {!isOnline ? (
                    <><WifiOff className="w-4 h-4 mr-2" />Sign up with email (Offline)</>
                  ) : (
                    "Sign up with email"
                  )}
                </Button>
              ) : (
                <form
                  onSubmit={handleSignUp}
                  data-testid="signup-form"
                  className="space-y-4"
                >
                  <div className="space-y-4">
                    {!isOnline && (
                      <div
                        className="p-3 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-md"
                        data-testid="signup-offline"
                      >
                        <div className="flex items-center gap-2">
                          <WifiOff className="w-4 h-4" />
                          <span>You're offline. Sign up requires internet connection.</span>
                        </div>
                      </div>
                    )}
                    {initialInviteCode && (
                      <div
                        className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md"
                        data-testid="invite-welcome"
                      >
                        You're using invite code:{" "}
                        <span className="font-mono font-semibold">
                          {initialInviteCode}
                        </span>
                      </div>
                    )}
                    <ErrorDisplay
                      error={error}
                      onClear={clearError}
                      testId="signup-error"
                    />
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                        data-testid="signup-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-invite-code">Invite Code</Label>
                      <Input
                        id="signup-invite-code"
                        type="text"
                        placeholder="Enter your invite code"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value)}
                        required
                        disabled={loading}
                        data-testid="signup-invite-code"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                        minLength={8}
                        data-testid="signup-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password-confirm">Confirm Password</Label>
                      <Input
                        id="signup-password-confirm"
                        type="password"
                        placeholder="Confirm your password"
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        required
                        disabled={loading}
                        minLength={8}
                        data-testid="signup-password-confirm"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!isOnline || loading || isAuthenticating}
                    data-testid="signup-submit"
                  >
                    {!isOnline ? (
                      <><WifiOff className="w-4 h-4 mr-2" />Create account (Offline)</>
                    ) : loading ? (
                      "Creating account..."
                    ) : (
                      "Create account"
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-sm"
                    onClick={() => setShowEmailSignup(false)}
                    disabled={loading || isAuthenticating}
                    data-testid="hide-email-signup"
                  >
                    Use a different method
                  </Button>
                </form>
              )}

              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline font-semibold"
                    onClick={onNavigateToLogin}
                    disabled={loading || isAuthenticating}
                    data-testid="signup-goto-login"
                  >
                    Sign in
                  </button>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
