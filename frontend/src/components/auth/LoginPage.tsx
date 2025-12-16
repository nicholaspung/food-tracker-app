import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COLLECTIONS } from '@/constants/collections';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { pb } from "@/lib/pocketbase";
import { logger } from "@/lib/logger";
import { X } from "lucide-react";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";

interface LoginPageProps {
  onNavigateToSignUp: () => void;
  onNavigateToForgotPassword?: () => void;
  onNavigateToOnboarding?: () => void;
  onLoginSuccess?: () => void;
}

const SAVED_EMAIL_KEY = "lastLoginEmail";

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

  const { error, handleError, clearError } = useErrorHandler({
    source: 'LoginPage',
    defaultSeverity: 'error',
  });

  // Load saved email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem(SAVED_EMAIL_KEY);
    if (savedEmail) {
      setEmail(savedEmail);
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

      // Mark that user has completed onboarding/login flow
      localStorage.setItem("hasSeenOnboarding", "true");

      // Call success callback
      onLoginSuccess?.();
    } catch (err: unknown) {
      logger.error("Login error:", err);
      handleError(err, {
        customMessage: "Invalid email or password. Please try again.",
        severity: 'error'
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
        severity: 'error'
      });
    } finally {
      setResendingVerification(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background p-4"
      data-testid="login-page"
    >
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <div className="flex justify-center items-center gap-3 mb-4">
            <img
              src="/logo-speech-bubble-plate.svg"
              alt="Yummy Recs Logo"
              className="w-14 h-14"
            />
            <div className="text-xl font-bold text-foreground">
              Track Your Foods
            </div>
          </div>
          <CardTitle className="text-2xl text-center" data-testid="login-title">
            Welcome back
          </CardTitle>
          <CardDescription
            className="text-center"
            data-testid="login-description"
          >
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={handleLogin}
          data-testid="login-form"
          className="space-y-4"
        >
          <CardContent className="space-y-4">
            {showVerifyPrompt && (
              <div
                className="p-3 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md"
                data-testid="login-verify-error"
              >
                <div className="font-semibold mb-1">Email Not Verified</div>
                <div className="mb-2">
                  Please verify your email address before logging in. Check your
                  inbox for the verification link.
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
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              data-testid="login-submit"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <div className="text-sm text-muted-foreground text-center">
              Don't have an account?{" "}
              <button
                type="button"
                className="text-primary hover:underline font-medium"
                onClick={onNavigateToSignUp}
                disabled={loading}
                data-testid="login-goto-signup"
              >
                Sign up
              </button>
            </div>
            {onNavigateToOnboarding && (
              <div className="text-sm text-muted-foreground text-center">
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={onNavigateToOnboarding}
                  disabled={loading}
                  data-testid="login-goto-onboarding"
                >
                  Learn more about Track Your Foods
                </button>
              </div>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
