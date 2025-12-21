import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COLLECTIONS } from "@/constants/collections";
import { pb } from "@/lib/pocketbase";
import { logger } from "@/lib/logger";
import { X } from "lucide-react";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { OAuthButton } from "@/components/auth/OAuthButton";
import { useOAuth, type OAuthProvider } from "@/hooks/auth/useOAuth";

interface LoginPageProps {
  onNavigateToSignUp: () => void;
  onNavigateToForgotPassword?: () => void;
  onNavigateToOnboarding?: () => void;
  onLoginSuccess?: () => void;
}

const SAVED_EMAIL_KEY = "lastLoginEmail";
const LAST_LOGIN_METHOD_KEY = "lastLoginMethod";

type LoginMethod = "google" | "facebook" | "email";

interface SavedLoginMethod {
  method: LoginMethod;
  email?: string;
  timestamp: number;
}

export default function LoginPage({
  onNavigateToSignUp,
  onNavigateToForgotPassword,
  onNavigateToOnboarding,
  onLoginSuccess,
}: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showVerifyPrompt, setShowVerifyPrompt] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [lastLoginMethod, setLastLoginMethod] =
    useState<SavedLoginMethod | null>(null);

  const { error, handleError, clearError } = useErrorHandler({
    source: "LoginPage",
    defaultSeverity: "error",
  });

  const { authenticateWithOAuth, isAuthenticating, currentProvider } = useOAuth(
    {
      onSuccess: () => {
        // OAuth success is handled in the hook itself
        onLoginSuccess?.();
      },
      onError: (err) => {
        handleError(err, {
          customMessage: err.message,
          severity: "error",
        });
      },
    }
  );

  // Load saved email and last login method on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem(SAVED_EMAIL_KEY);
    if (savedEmail) {
      setEmail(savedEmail);
    }

    // Load last login method
    const savedMethodStr = localStorage.getItem(LAST_LOGIN_METHOD_KEY);
    if (savedMethodStr) {
      try {
        const savedMethod: SavedLoginMethod = JSON.parse(savedMethodStr);
        // Only show if login was within last 30 days
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        if (savedMethod.timestamp > thirtyDaysAgo) {
          setLastLoginMethod(savedMethod);
        } else {
          // Clear old login method
          localStorage.removeItem(LAST_LOGIN_METHOD_KEY);
        }
      } catch (err) {
        logger.error("Error parsing saved login method:", err);
        localStorage.removeItem(LAST_LOGIN_METHOD_KEY);
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setShowVerifyPrompt(false);
    setVerificationSent(false);
    setLoading(true);

    try {
      const authData = await pb
        .collection("users")
        .authWithPassword(email, password);
      logger.log("Login successful:", pb.authStore.model);

      // Check if user is verified
      if (!authData.record.verified) {
        // User is not verified, log them out
        pb.authStore.clear();
        setShowVerifyPrompt(true);
        setLoading(false);
        return;
      }

      // Save or clear email based on remember me preference
      if (rememberMe) {
        localStorage.setItem(SAVED_EMAIL_KEY, email);
      } else {
        localStorage.removeItem(SAVED_EMAIL_KEY);
      }

      // Save login method for returning user experience
      const loginMethodData: SavedLoginMethod = {
        method: "email",
        email: email,
        timestamp: Date.now(),
      };
      localStorage.setItem(
        LAST_LOGIN_METHOD_KEY,
        JSON.stringify(loginMethodData)
      );

      // Mark that user has completed onboarding/login flow
      localStorage.setItem("hasSeenOnboarding", "true");

      // Call success callback
      onLoginSuccess?.();
    } catch (err: unknown) {
      logger.error("Login error:", err);
      handleError(err, {
        customMessage: "Invalid email or password. Please try again.",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearSavedEmail = () => {
    localStorage.removeItem(SAVED_EMAIL_KEY);
    setEmail("");
  };

  const handleResendVerification = async () => {
    setResendingVerification(true);
    setVerificationSent(false);

    try {
      await pb.collection(COLLECTIONS.USERS).requestVerification(email);
      setVerificationSent(true);
    } catch (err: unknown) {
      logger.error("Resend verification error:", err);
      handleError(err, {
        customMessage: "Failed to resend verification email. Please try again.",
        severity: "error",
      });
    } finally {
      setResendingVerification(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col bg-background"
      data-testid="login-page"
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
            <h1
              className="text-3xl font-bold text-foreground"
              data-testid="login-title"
            >
              Sign in
            </h1>
            <p
              className="text-muted-foreground text-sm"
              data-testid="login-description"
            >
              {lastLoginMethod
                ? `Welcome back! Continue with ${lastLoginMethod.method === "email" ? "your email" : lastLoginMethod.method}`
                : "Choose how you'd like to continue"}
            </p>
          </div>

          {/* Returning User - Last Login Method Suggestion */}
          {lastLoginMethod && !showEmailLogin && (
            <div
              className="p-4 border-2 border-primary/20 bg-primary/5 rounded-lg"
              data-testid="returning-user-prompt"
            >
              <div className="space-y-3">
                <div className="text-sm font-medium text-foreground">
                  {lastLoginMethod.method === "email" &&
                  lastLoginMethod.email ? (
                    <>
                      Continue as{" "}
                      <span className="font-semibold">
                        {lastLoginMethod.email}
                      </span>
                    </>
                  ) : (
                    <>
                      Continue with{" "}
                      <span className="font-semibold capitalize">
                        {lastLoginMethod.method}
                      </span>
                    </>
                  )}
                </div>
                {lastLoginMethod.method === "email" ? (
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => setShowEmailLogin(true)}
                    disabled={loading || isAuthenticating}
                    data-testid="continue-with-saved-method"
                  >
                    Continue with Email
                  </Button>
                ) : (
                  <OAuthButton
                    provider={lastLoginMethod.method as OAuthProvider}
                    onClick={() =>
                      authenticateWithOAuth(
                        lastLoginMethod.method as OAuthProvider
                      )
                    }
                    disabled={loading || isAuthenticating}
                    loading={
                      isAuthenticating &&
                      currentProvider === lastLoginMethod.method
                    }
                  />
                )}
                <button
                  type="button"
                  className="w-full text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                  onClick={() => {
                    setLastLoginMethod(null);
                    localStorage.removeItem(LAST_LOGIN_METHOD_KEY);
                  }}
                  data-testid="use-different-account"
                >
                  Not you? Use a different account
                </button>
              </div>
            </div>
          )}

          {/* Only show alternate login methods if email form is NOT showing */}
          {!showEmailLogin && (
            <>
              {/* Divider - Only show if returning user prompt is shown */}
              {lastLoginMethod && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or sign in with
                    </span>
                  </div>
                </div>
              )}

              {/* Social Login Buttons - Primary (for first-time users) */}
              {!lastLoginMethod && (
                <div className="space-y-3">
                  <OAuthButton
                    provider="google"
                    onClick={() => authenticateWithOAuth("google")}
                    disabled={loading || isAuthenticating}
                    loading={isAuthenticating && currentProvider === "google"}
                  />
                  <OAuthButton
                    provider="facebook"
                    onClick={() => authenticateWithOAuth("facebook")}
                    disabled={loading || isAuthenticating}
                    loading={isAuthenticating && currentProvider === "facebook"}
                  />
                </div>
              )}

              {/* Alternate methods when returning user is shown */}
              {lastLoginMethod && (
                <div className="space-y-3">
                  {lastLoginMethod.method !== "google" && (
                    <OAuthButton
                      provider="google"
                      onClick={() => authenticateWithOAuth("google")}
                      disabled={loading || isAuthenticating}
                      loading={isAuthenticating && currentProvider === "google"}
                    />
                  )}
                  {lastLoginMethod.method !== "facebook" && (
                    <OAuthButton
                      provider="facebook"
                      onClick={() => authenticateWithOAuth("facebook")}
                      disabled={loading || isAuthenticating}
                      loading={isAuthenticating && currentProvider === "facebook"}
                    />
                  )}
                  {lastLoginMethod.method !== "email" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowEmailLogin(true)}
                      data-testid="show-email-login"
                    >
                      Sign in with email
                    </Button>
                  )}
                </div>
              )}

              {/* Divider - Only for first-time users */}
              {!lastLoginMethod && (
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
              )}

              {/* Email Login - Secondary (for first-time users) */}
              {!lastLoginMethod && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowEmailLogin(true)}
                  data-testid="show-email-login"
                >
                  Sign in with email
                </Button>
              )}
            </>
          )}

          {/* Email Login Form - Shows when user clicks email login (for both new and returning users) */}
          {showEmailLogin && (
            <form
              onSubmit={handleLogin}
              data-testid="login-form"
              className="space-y-4"
            >
              <div className="space-y-4">
                {showVerifyPrompt && (
                  <div
                    className="p-3 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md"
                    data-testid="login-verify-error"
                  >
                    <div className="font-semibold mb-1">Email Not Verified</div>
                    <div className="mb-2">
                      Please verify your email address before logging in. Check
                      your inbox for the verification link.
                    </div>
                    {verificationSent ? (
                      <div className="text-green-700">
                        Verification email sent! Check your inbox.
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleResendVerification}
                        disabled={resendingVerification}
                        className="mt-2"
                        data-testid="login-resend-verification"
                      >
                        {resendingVerification
                          ? "Sending..."
                          : "Resend Verification Email"}
                      </Button>
                    )}
                  </div>
                )}
                <ErrorDisplay
                  error={error}
                  onClear={clearError}
                  testId="login-error"
                />
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                      data-testid="login-email"
                      className="pr-10"
                    />
                    {email && localStorage.getItem(SAVED_EMAIL_KEY) && (
                      <button
                        type="button"
                        onClick={handleClearSavedEmail}
                        disabled={loading}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Clear saved email"
                        data-testid="login-clear-email"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {onNavigateToForgotPassword && (
                      <button
                        type="button"
                        className="text-sm text-primary hover:underline"
                        onClick={onNavigateToForgotPassword}
                        disabled={loading}
                        data-testid="login-forgot-password"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    data-testid="login-password"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    id="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={loading}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    data-testid="login-remember-me"
                  />
                  <Label
                    htmlFor="remember-me"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Remember my email
                  </Label>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || isAuthenticating}
                data-testid="login-submit"
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm"
                onClick={() => setShowEmailLogin(false)}
                disabled={loading || isAuthenticating}
                data-testid="hide-email-login"
              >
                Use a different method
              </Button>
            </form>
          )}

          {/* Sign up link */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <button
                type="button"
                className="text-primary hover:underline font-semibold"
                onClick={onNavigateToSignUp}
                disabled={loading || isAuthenticating}
                data-testid="login-goto-signup"
              >
                Sign up
              </button>
            </p>
          </div>

          {/* Learn more - Visually separated */}
          {onNavigateToOnboarding && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
              </div>
              <div className="text-center p-4">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground underline transition-colors"
                  onClick={onNavigateToOnboarding}
                  disabled={loading || isAuthenticating}
                  data-testid="login-goto-onboarding"
                >
                  Learn more about Yummy Recs
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
