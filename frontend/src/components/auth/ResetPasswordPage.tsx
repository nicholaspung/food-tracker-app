import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { logger } from "@/lib/logger";
import { pb } from "@/lib/pocketbase";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { ERROR_MESSAGES } from "@/lib/errorMessages";

interface ResetPasswordPageProps {
  token: string;
  onNavigateToLogin: () => void;
  onResetSuccess?: () => void;
}

export default function ResetPasswordPage({ token, onNavigateToLogin, onResetSuccess }: ResetPasswordPageProps) {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const { error, handleError, clearError, showValidation } = useErrorHandler({
    source: 'ResetPasswordPage',
    defaultSeverity: 'error',
  });
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(3);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccess(false);

    // Client-side validation
    if (password !== passwordConfirm) {
      showValidation(ERROR_MESSAGES.VALIDATION.PASSWORDS_MISMATCH);
      return;
    }

    if (password.length < 8) {
      showValidation(ERROR_MESSAGES.VALIDATION.MIN_LENGTH("Password", 8));
      return;
    }

    setLoading(true);

    try {
      await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm);
      setSuccess(true);
    } catch (err: any) {
      logger.error("Password reset error:", err);
      handleError(err, { customMessage: ERROR_MESSAGES.AUTH.RESET_PASSWORD_FAILED });
    } finally {
      setLoading(false);
    }
  };

  // Auto-redirect countdown after successful password reset
  useEffect(() => {
    if (success && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (success && countdown === 0) {
      onResetSuccess?.();
    }
  }, [success, countdown, onResetSuccess]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="reset-password-page">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center" data-testid="reset-password-title">
            Reset Password
          </CardTitle>
          <CardDescription className="text-center" data-testid="reset-password-description">
            Enter your new password
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} data-testid="reset-password-form">
          <CardContent className="space-y-4">
            <ErrorDisplay error={error} onClear={clearError} testId="reset-password-error" />
            {success && (
              <div className="p-3 text-sm text-green-500 bg-green-50 border border-green-200 rounded-md" data-testid="reset-password-success">
                <div>Password reset successfully!</div>
                <div className="mt-1 text-xs text-green-600">Redirecting to login in {countdown}...</div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter new password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading || success}
                data-testid="reset-password-password"
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passwordConfirm">Confirm Password</Label>
              <Input
                id="passwordConfirm"
                type="password"
                placeholder="Confirm new password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                disabled={loading || success}
                data-testid="reset-password-confirm"
                minLength={8}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading || success} data-testid="reset-password-submit">
              {loading ? "Resetting..." : success ? "Password Reset!" : "Reset Password"}
            </Button>
            <div className="text-sm text-muted-foreground text-center">
              Remember your password?{" "}
              <button
                type="button"
                className="text-primary hover:underline font-medium"
                onClick={onNavigateToLogin}
                disabled={loading}
                data-testid="reset-password-goto-login"
              >
                Back to login
              </button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
